import { DataSource, QueryRunner } from 'typeorm';
import {
  assertShardsAreSeparate,
  shardForUser,
  SubmissionShardingConfig,
} from './sharding.config';
import { shardDataSource } from './shard-registry';
import { readShardingState, ShardIdentity } from './sharding-state';

const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"';

interface SourceColumn {
  name: string;
  type: string;
  not_null: boolean;
  default_expression: string | null;
  generated: string;
}
export interface ShardMigrationResult {
  alreadyActive: boolean;
  copied: number;
  shards: Array<{ id: string; rows: number }>;
}

async function shardCounts(sources: Map<string, DataSource>) {
  return Promise.all(
    [...sources].map(async ([id, source]) => {
      const [count] = await source.query<Array<{ count: string }>>(
        'SELECT count(*)::text AS count FROM public.submissions',
      );
      return { id, rows: Number(count.count) };
    }),
  );
}

/** Offline cutover: preserve the original table, verify every copied row, then activate. */
export async function migrateSubmissionShards(
  primary: DataSource,
  config: SubmissionShardingConfig,
  writersStopped: boolean,
): Promise<ShardMigrationResult> {
  if (!writersStopped)
    throw new Error(
      'Stop and drain every API and judge writer before migrating submission shards',
    );
  if (primary.options.type !== 'postgres' || !primary.options.url)
    throw new Error('Shard migration requires a primary DATABASE_URL');
  assertShardsAreSeparate(config, primary.options.url);
  const sources = new Map<string, DataSource>();
  let runner: QueryRunner | undefined;
  try {
    for (const shard of config.shards) {
      const source = shardDataSource(shard, 1);
      sources.set(shard.id, source);
      await source.initialize();
    }
    runner = primary.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query("SET LOCAL lock_timeout = '10s'");
    await runner.query('SELECT pg_advisory_xact_lock(720011)');
    const existing = await readShardingState(runner);
    if (existing) {
      if (
        existing.state !== 'active' ||
        existing.fingerprint !== config.fingerprint
      )
        throw new Error(
          'Existing shard topology differs; automatic rebalancing is not supported',
        );
      for (const [id, source] of sources) {
        const [identity] = await source.query<ShardIdentity[]>(
          'SELECT shard_id, fingerprint FROM public.submission_shard_identity WHERE singleton = true',
        );
        if (
          identity?.shard_id !== id ||
          identity?.fingerprint !== config.fingerprint
        )
          throw new Error('Submission shard identity mismatch');
      }
      await runner.commitTransaction();
      return {
        alreadyActive: true,
        copied: 0,
        shards: await shardCounts(sources),
      };
    }
    await runner.query(
      'LOCK TABLE public.submissions IN ACCESS EXCLUSIVE MODE',
    );
    const [pending] = (await runner.query(
      `SELECT count(*)::int AS count FROM public.submissions WHERE lower(status) IN ('queued', 'pending', 'running', 'testing')`,
    )) as Array<{ count: number }>;
    if (pending.count)
      throw new Error('Drain or resolve in-flight submissions before sharding');
    const [duplicates] = (await runner.query(
      'SELECT count(*)::int AS count FROM (SELECT id FROM public.submissions GROUP BY id HAVING count(*) > 1) duplicates',
    )) as Array<{ count: number }>;
    if (duplicates.count)
      throw new Error('Submission IDs must be unique before migration');
    const columns = (await runner.query(`
      SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
             a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS default_expression,
             a.attgenerated AS generated
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'public.submissions'::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`)) as SourceColumn[];
    if (
      !['id', 'userId', 'problemId', 'problemSource', 'createdAt'].every(
        (name) => columns.some((column) => column.name === name),
      )
    )
      throw new Error('Apply the submission source migration first');
    if (
      columns.some(
        (column) =>
          column.generated || column.default_expression?.includes('nextval('),
      )
    )
      throw new Error(
        'Generated or serial submission columns require an explicit shard schema migration',
      );
    const definition = columns
      .map(
        (column) =>
          `${quote(column.name)} ${column.type}${column.not_null ? ' NOT NULL' : ''}${column.default_expression ? ` DEFAULT ${column.default_expression}` : ''}`,
      )
      .join(',\n');
    const columnNames = columns.map((column) => quote(column.name)).join(', ');
    const updates = columns
      .filter((column) => column.name !== 'id')
      .map((column) => `${quote(column.name)} = EXCLUDED.${quote(column.name)}`)
      .join(', ');
    for (const [id, source] of sources) {
      await source.transaction(async (manager) => {
        await manager.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
        await manager.query(`CREATE TABLE IF NOT EXISTS public.submission_shard_identity (
          singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), shard_id text NOT NULL, fingerprint text NOT NULL)`);
        const [identity] = await manager.query<ShardIdentity[]>(
          'SELECT shard_id, fingerprint FROM public.submission_shard_identity WHERE singleton = true',
        );
        const [table] = await manager.query<Array<{ present: boolean }>>(
          "SELECT to_regclass('public.submissions') IS NOT NULL AS present",
        );
        if (
          identity &&
          (identity.shard_id !== id ||
            identity.fingerprint !== config.fingerprint)
        )
          throw new Error('Target database belongs to another shard topology');
        if (table.present && !identity)
          throw new Error(
            'Refusing to overwrite an unmanaged shard submissions table',
          );
        if (!identity)
          await manager.query(
            'INSERT INTO public.submission_shard_identity (shard_id, fingerprint) VALUES ($1, $2)',
            [id, config.fingerprint],
          );
        const owned = config.topology.buckets.flatMap((owner, bucket) =>
          owner === id ? [bucket] : [],
        );
        await manager.query(`CREATE TABLE IF NOT EXISTS public.submissions (
          ${definition}, PRIMARY KEY (id),
          CONSTRAINT codeskill_submission_source CHECK ("problemSource" IN ('problem', 'metadata', 'question')),
          CONSTRAINT codeskill_submission_shard_owner CHECK (
            (('x' || substr(md5(lower("userId"::text)), 1, 8))::bit(32)::bigint % 128) IN (${owned.join(',')})
          ))`);
        await manager.query(
          'CREATE INDEX IF NOT EXISTS submission_user_history ON public.submissions ("userId", "createdAt" DESC, id)',
        );
        await manager.query(
          'CREATE INDEX IF NOT EXISTS submission_user_problem_status ON public.submissions ("userId", "problemId", status)',
        );
        await manager.query(
          'CREATE INDEX IF NOT EXISTS submission_global_history ON public.submissions ("createdAt" DESC, id)',
        );
        await manager.query(
          'CREATE INDEX IF NOT EXISTS submission_contest_accepted ON public.submissions ("userId", "problemId", "createdAt") WHERE lower(status) = \'accepted\'',
        );
        await manager.query(
          'CREATE INDEX IF NOT EXISTS submission_legacy_id ON public.submissions ("mongoId") WHERE "mongoId" IS NOT NULL',
        );
      });
    }
    let cursor: string | null = null;
    let copied = 0;
    while (true) {
      const rows = (await runner.query(
        `SELECT id, "userId", to_jsonb(s)::text AS payload FROM public.submissions s
         WHERE ($1::uuid IS NULL OR id > $1::uuid) ORDER BY id LIMIT 500`,
        [cursor],
      )) as Array<{ id: string; userId: string; payload: string }>;
      if (!rows.length) break;
      const grouped = new Map<string, typeof rows>();
      for (const row of rows) {
        const id = shardForUser(config, row.userId);
        grouped.set(id, [...(grouped.get(id) || []), row]);
      }
      for (const [id, records] of grouped) {
        const source = sources.get(id)!;
        await source.transaction(async (manager) => {
          await manager.query(
            `INSERT INTO public.submissions (${columnNames})
             SELECT ${columnNames} FROM jsonb_populate_recordset(NULL::public.submissions, $1::jsonb)
             ON CONFLICT (id) DO UPDATE SET ${updates}`,
            [`[${records.map((row) => row.payload).join(',')}]`],
          );
          const verified = await manager.query<
            Array<{ id: string; payload: string }>
          >(
            'SELECT id, to_jsonb(s)::text AS payload FROM public.submissions s WHERE id = ANY($1::uuid[])',
            [records.map((row) => row.id)],
          );
          const indexed = new Map(verified.map((row) => [row.id, row.payload]));
          if (records.some((row) => indexed.get(row.id) !== row.payload))
            throw new Error('Submission shard row verification failed');
        });
      }
      copied += rows.length;
      cursor = rows[rows.length - 1].id;
    }
    const counts = await shardCounts(sources);
    if (counts.reduce((sum, shard) => sum + shard.rows, 0) !== copied)
      throw new Error(
        'Shard row counts differ from the source; original submissions are preserved',
      );
    await runner.query(`CREATE TABLE public.submission_sharding_state (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), fingerprint text NOT NULL,
      topology jsonb NOT NULL, state text NOT NULL CHECK (state = 'active'),
      migrated_rows bigint NOT NULL, activated_at timestamptz NOT NULL DEFAULT now())`);
    await runner.query(
      "INSERT INTO public.submission_sharding_state (fingerprint, topology, state, migrated_rows) VALUES ($1, $2::jsonb, 'active', $3)",
      [config.fingerprint, JSON.stringify(config.topology), copied],
    );
    await runner.query(`CREATE OR REPLACE FUNCTION public.codeskill_guard_submission_cutover() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Submission sharding is active; write through SubmissionStore'; END $$`);
    await runner.query(`CREATE TRIGGER codeskill_submission_cutover_guard BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
      ON public.submissions FOR EACH STATEMENT EXECUTE FUNCTION public.codeskill_guard_submission_cutover()`);
    await runner.commitTransaction();
    return { alreadyActive: false, copied, shards: counts };
  } catch (error) {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    if (runner) await runner.release();
    await Promise.all(
      [...sources.values()]
        .filter((source) => source.isInitialized)
        .map((source) => source.destroy()),
    );
  }
}
