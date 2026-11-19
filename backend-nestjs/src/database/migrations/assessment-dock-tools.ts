import { MigrationQueryRunner } from './declarative-partitioning';

export async function applyAssessmentDockToolsMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE "assessments"
      ADD COLUMN IF NOT EXISTS "lockdownQuitPassword" text NULL,
      ADD COLUMN IF NOT EXISTS "allowCalculators" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "allowScratchpad" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "allowReferenceDoc" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "referencePdfUrl" text NULL;
  `);
}
