import { MigrationQueryRunner } from './declarative-partitioning';

export async function applyAssessmentEnterpriseHardeningMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE "assessments"
      ADD COLUMN IF NOT EXISTS "requireCloseOtherApps" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "allowSpellCheck" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "allowFindOnPage" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "allowedUrlPatterns" text[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "enableScreenCaptureSnapshots" boolean NOT NULL DEFAULT false;
  `);
}
