import { DataSource, type QueryRunner } from 'typeorm';
import type { SubmissionShardingConfig } from '../sharding/sharding.config';

/** Run under the schema runner's advisory transaction lock on every submission owner. */
export async function applyContestSubmissionScopeMigration(runner: Pick<QueryRunner, 'query'>): Promise<void> {
  await runner.query('ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS "contestAttemptId" uuid');
  await runner.query(
    'CREATE INDEX IF NOT EXISTS "IDX_submissions_contest_attempt_problem_status" ON public.submissions ("contestAttemptId", "problemId", status)',
  );
}

/** Each shard commits independently, so a rollout can retry after a partial migration. */
export async function migrateContestSubmissionShards(
  config: SubmissionShardingConfig,
): Promise<void> {
  for (const shard of config.shards) {
    const source = new DataSource({
      type: 'postgres',
      url: shard.url,
      synchronize: false,
      logging: false,
      ssl: shard.ssl ? { rejectUnauthorized: true } : false,
    });
    try {
      await source.initialize();
      await source.transaction(async (manager) => {
        await manager.query('SELECT pg_advisory_xact_lock(1902230159)');
        await applyContestSubmissionScopeMigration(manager);
      });
    } finally {
      if (source.isInitialized) await source.destroy();
    }
  }
}
