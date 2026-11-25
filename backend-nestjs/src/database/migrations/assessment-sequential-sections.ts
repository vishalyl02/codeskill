import { MigrationQueryRunner } from './declarative-partitioning';

export async function applyAssessmentSequentialSectionsMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE "assessments"
      ADD COLUMN IF NOT EXISTS "lockSectionsSequentially" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "questionTimeLimitSeconds" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "resultDisplaySettings" jsonb NOT NULL DEFAULT '{}';

    ALTER TABLE "assessment_attempts"
      ADD COLUMN IF NOT EXISTS "current_question_index" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "current_question_started_at" timestamp,
      ADD COLUMN IF NOT EXISTS "completed_question_ids" text[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "navigation_version" integer NOT NULL DEFAULT 0;
  `);
}
