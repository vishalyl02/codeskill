import { MigrationQueryRunner } from './declarative-partitioning';

export async function applyContestSecurityReattemptMigration(
  queryRunner: MigrationQueryRunner,
): Promise<void> {
  // 1. Add resultsPublished to contests table if missing
  await queryRunner.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contests' AND column_name = 'resultsPublished'
      ) THEN
        ALTER TABLE "contests" ADD COLUMN "resultsPublished" boolean NOT NULL DEFAULT false;
      END IF;
    END $$;
  `);

  // 2. Add attemptNumber, score, and problemsSolved to contest_attempts if missing
  await queryRunner.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contest_attempts' AND column_name = 'attemptNumber'
      ) THEN
        ALTER TABLE "contest_attempts" ADD COLUMN "attemptNumber" integer NOT NULL DEFAULT 1;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contest_attempts' AND column_name = 'score'
      ) THEN
        ALTER TABLE "contest_attempts" ADD COLUMN "score" double precision NOT NULL DEFAULT 0;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'contest_attempts' AND column_name = 'problemsSolved'
      ) THEN
        ALTER TABLE "contest_attempts" ADD COLUMN "problemsSolved" integer NOT NULL DEFAULT 0;
      END IF;
    END $$;
  `);

  // 3. Update unique constraint on contest_attempts to allow multiple attempts per user
  await queryRunner.query(`
    DO $$
    DECLARE
      idx_name text;
    BEGIN
      -- Drop old unique index on (contest_id, user_id) if it exists
      SELECT indexname INTO idx_name
      FROM pg_indexes
      WHERE tablename = 'contest_attempts'
        AND indexdef LIKE '%UNIQUE%'
        AND indexdef LIKE '%(contest_id, user_id)%';

      IF idx_name IS NOT NULL THEN
        EXECUTE 'DROP INDEX IF EXISTS "' || idx_name || '" CASCADE';
      END IF;

      -- Create new unique index on (contest_id, user_id, "attemptNumber")
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_contest_attempts_contest_user_attempt" 
        ON "contest_attempts" ("contest_id", "user_id", "attemptNumber");
    END $$;
  `);

  // 4. Create contest_reattempt_grants table if missing
  await queryRunner.query(`
    CREATE TABLE IF NOT EXISTS "contest_reattempt_grants" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "contest_id" uuid NOT NULL,
      "user_id" uuid NOT NULL,
      "grantedBy" uuid,
      "grantedByEmail" varchar(255) NOT NULL DEFAULT '',
      "reason" text NOT NULL DEFAULT '',
      "allowedAttempts" integer NOT NULL DEFAULT 1,
      "usedAttempts" integer NOT NULL DEFAULT 0,
      "expiresAt" timestamp,
      "status" varchar(50) NOT NULL DEFAULT 'ACTIVE',
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "PK_contest_reattempt_grants" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "IDX_contest_reattempt_grants_lookup" 
      ON "contest_reattempt_grants" ("contest_id", "user_id", "status");
    CREATE INDEX IF NOT EXISTS "IDX_contest_reattempt_grants_contest" 
      ON "contest_reattempt_grants" ("contest_id");
  `);
}
