import { MigrationQueryRunner } from './declarative-partitioning';

export async function applyCandidateExamAccommodationsMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  await queryRunner.query(`
    CREATE TABLE IF NOT EXISTS "candidate_exam_accommodations" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "assessment_id" uuid NOT NULL REFERENCES "assessments"("id") ON DELETE CASCADE,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "time_multiplier" float NOT NULL DEFAULT 1.0,
      "extra_minutes_flat" float NOT NULL DEFAULT 0,
      "secondary_display_allowed" boolean NOT NULL DEFAULT false,
      "screen_reader_allowed" boolean NOT NULL DEFAULT false,
      "custom_notes" text,
      "granted_by" uuid,
      "configured_by_role" varchar(50),
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now()
    );

    ALTER TABLE "candidate_exam_accommodations"
      ADD COLUMN IF NOT EXISTS "extra_minutes_flat" float NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "configured_by_role" varchar(50);

    CREATE UNIQUE INDEX IF NOT EXISTS "UQ_candidate_exam_accommodations_assessment_user"
      ON "candidate_exam_accommodations" ("assessment_id", "user_id");

    CREATE INDEX IF NOT EXISTS "IDX_candidate_exam_accommodations_assessment"
      ON "candidate_exam_accommodations" ("assessment_id");

    CREATE INDEX IF NOT EXISTS "IDX_candidate_exam_accommodations_user"
      ON "candidate_exam_accommodations" ("user_id");
  `);
}
