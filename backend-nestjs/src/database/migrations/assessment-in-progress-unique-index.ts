import { MigrationQueryRunner } from './declarative-partitioning';

/**
 * AUD-CON-008: Enforces exactly one active 'in_progress' attempt per candidate
 * per assessment using a partial unique index, preventing simultaneous double-start races.
 */
export async function applyAssessmentInProgressUniqueIndexMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  // 1. Deduplicate any existing duplicate in_progress attempts before applying the index
  await queryRunner.query(`
    DELETE FROM "assessment_attempts" a
    WHERE a.status = 'in_progress'
      AND a.id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY assessment_id, student_id 
            ORDER BY "startedAt" DESC, "updatedAt" DESC
          ) as rnum
          FROM "assessment_attempts"
          WHERE status = 'in_progress'
        ) ranked
        WHERE ranked.rnum = 1
      );
  `);

  // 2. Create partial unique index
  await queryRunner.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_in_progress_assessment_attempt"
    ON "assessment_attempts" ("assessment_id", "student_id")
    WHERE "status" = 'in_progress';
  `);
}
