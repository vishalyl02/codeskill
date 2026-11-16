import { MigrationQueryRunner } from './declarative-partitioning';

export async function applyFacultyAssignmentsMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  await queryRunner.query(`
    CREATE TABLE IF NOT EXISTS "faculty_assignments" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "faculty_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "batch_id" uuid NOT NULL REFERENCES "batches"("id") ON DELETE CASCADE,
      "course_code" varchar(100) NOT NULL,
      "section" varchar(50),
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS "UQ_faculty_batch_course"
      ON "faculty_assignments" ("faculty_id", "batch_id", "course_code");

    CREATE INDEX IF NOT EXISTS "IDX_faculty_assignments_faculty"
      ON "faculty_assignments" ("faculty_id");

    CREATE INDEX IF NOT EXISTS "IDX_faculty_assignments_batch"
      ON "faculty_assignments" ("batch_id");

    ALTER TABLE "assessment_attempts" ADD COLUMN IF NOT EXISTS "manual_score_adjustment" float DEFAULT 0;
    ALTER TABLE "assessment_attempts" ADD COLUMN IF NOT EXISTS "instructor_feedback" text;
    ALTER TABLE "assessment_attempts" ADD COLUMN IF NOT EXISTS "reviewed_by_id" uuid;
    ALTER TABLE "assessment_attempts" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp;
    ALTER TABLE "assessment_attempts" ADD COLUMN IF NOT EXISTS "radar_flags_cleared" boolean DEFAULT false;
  `);
}
