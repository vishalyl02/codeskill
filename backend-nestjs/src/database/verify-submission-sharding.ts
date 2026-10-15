import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { practiceSubmissionMigrationOptions } from './run-practice-submission-source';
import { SubmissionShardRegistry } from './sharding/shard-registry';

async function main() {
  const primary = new DataSource(practiceSubmissionMigrationOptions());
  const registry = new SubmissionShardRegistry(primary);
  try {
    await primary.initialize();
    await registry.onModuleInit();
    if (!registry.config)
      throw new Error('Submission sharding is not configured');
    const shards = await Promise.all(
      registry.all.map(async (source, index) => {
        const [summary] = await source.query<
          Array<{ rows: string; misplaced: number }>
        >(
          `SELECT count(*)::text AS rows,
        count(*) FILTER (WHERE NOT ((('x' || substr(md5(lower("userId"::text)), 1, 8))::bit(32)::bigint % 128) = ANY($1::int[])))::int AS misplaced
        FROM public.submissions`,
          [
            registry.config!.topology.buckets.flatMap((id, bucket) =>
              id === registry.config!.shards[index].id ? [bucket] : [],
            ),
          ],
        );
        if (summary.misplaced)
          throw new Error('Submission rows are assigned to the wrong shard');
        return {
          id: registry.config!.shards[index].id,
          rows: Number(summary.rows),
          misplaced: summary.misplaced,
        };
      }),
    );
    console.log(
      JSON.stringify({
        active: true,
        routingBuckets: 128,
        totalSubmissions: shards.reduce(
          (total, shard) => total + shard.rows,
          0,
        ),
        shards,
      }),
    );
  } finally {
    await registry.onModuleDestroy();
    if (primary.isInitialized) await primary.destroy();
  }
}
void main().catch(() => {
  console.error(
    'Shard verification failed; check connectivity, identity, and routing configuration.',
  );
  process.exitCode = 1;
});
