import { MigrationQueryRunner } from './declarative-partitioning';

export async function applyAssessmentForensicWatermarkMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE "assessments"
      ADD COLUMN IF NOT EXISTS "enableForensicWatermark" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "enable_forensic_watermark" boolean NOT NULL DEFAULT false;
  `);
}
