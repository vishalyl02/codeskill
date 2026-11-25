import type { MigrationQueryRunner } from './declarative-partitioning';
export async function applyPlacementsMigration(
  runner: MigrationQueryRunner,
): Promise<void> {
  await runner.query(`CREATE TABLE IF NOT EXISTS placements (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "companyName" varchar(180) NOT NULL,
    "companyProfile" text NOT NULL,
    "jobTitle" varchar(180) NOT NULL DEFAULT '',
    package varchar(120) NOT NULL,
    "visitDate" date NULL,
    status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    documents jsonb NOT NULL DEFAULT '[]',
    "learningResources" jsonb NOT NULL DEFAULT '[]',
    "createdById" uuid NOT NULL,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  ); ALTER TABLE placements ADD COLUMN IF NOT EXISTS "logoImage" text NULL;
  CREATE INDEX IF NOT EXISTS "IDX_placements_status_created" ON placements (status, "createdAt" DESC);`);
}
