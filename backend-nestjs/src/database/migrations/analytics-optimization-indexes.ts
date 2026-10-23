import { MigrationQueryRunner } from './declarative-partitioning';

export async function applyAnalyticsOptimizationIndexesMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  await queryRunner.query(`
    -- Assessment attempts indexes for fast time-series aggregation and status filtering
    CREATE INDEX IF NOT EXISTS "IDX_assessment_attempts_startedAt"
      ON "assessment_attempts" ("startedAt");
    CREATE INDEX IF NOT EXISTS "IDX_assessment_attempts_submittedAt"
      ON "assessment_attempts" ("submittedAt");
    CREATE INDEX IF NOT EXISTS "IDX_assessment_attempts_status"
      ON "assessment_attempts" ("status");
    CREATE INDEX IF NOT EXISTS "IDX_assessment_attempts_asmt_status"
      ON "assessment_attempts" ("assessment_id", "status");

    -- Submissions compound index for date-range status filtering (accepted vs failed)
    CREATE INDEX IF NOT EXISTS "IDX_submissions_created_status"
      ON "submissions" ("createdAt", "status");
  `);
}
