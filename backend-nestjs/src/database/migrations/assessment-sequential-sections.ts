import { MigrationQueryRunner } from './declarative-partitioning';

export async function applyAssessmentSequentialSectionsMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE "assessments"
      ADD COLUMN IF NOT EXISTS "lockSectionsSequentially" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "resultDisplaySettings" jsonb NOT NULL DEFAULT '{}';
  `);
}
