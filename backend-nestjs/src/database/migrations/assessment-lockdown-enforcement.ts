import { MigrationQueryRunner } from './declarative-partitioning';

export async function applyAssessmentLockdownEnforcementMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE "assessments"
      ADD COLUMN IF NOT EXISTS "requireLockdown" boolean NOT NULL DEFAULT false;
  `);
}
