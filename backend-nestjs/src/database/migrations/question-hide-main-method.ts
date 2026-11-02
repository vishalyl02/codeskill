import { MigrationQueryRunner } from './declarative-partitioning';

/** Keep Question entity and PostgreSQL questions table in sync. */
export async function applyQuestionHideMainMethodMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  await queryRunner.query(
    'ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "hideMainMethod" boolean NOT NULL DEFAULT false;',
  );
}
