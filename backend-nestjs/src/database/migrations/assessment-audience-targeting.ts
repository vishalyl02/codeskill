import { MigrationQueryRunner } from './declarative-partitioning';

export async function applyAssessmentAudienceTargetingMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE "assessments"
      ADD COLUMN IF NOT EXISTS "targetStudentIds" text[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "targetSemesters" text[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "targetSections" text[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "targetGroups" text[] NOT NULL DEFAULT '{}';
    CREATE INDEX IF NOT EXISTS "IDX_assessments_targetStudentIds"
      ON "assessments" USING GIN ("targetStudentIds");
    CREATE INDEX IF NOT EXISTS "IDX_assessments_targetGroups"
      ON "assessments" USING GIN ("targetGroups");
  `);
}
