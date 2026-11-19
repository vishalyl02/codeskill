import { MigrationQueryRunner } from './declarative-partitioning';

export async function applyAssessmentVdiOverrideMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE "assessments"
      ADD COLUMN IF NOT EXISTS "allowVirtualMachine" boolean NOT NULL DEFAULT false;
  `);
}
