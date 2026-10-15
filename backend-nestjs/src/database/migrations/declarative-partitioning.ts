export interface MigrationQueryRunner {
  query(sql: string, parameters?: unknown[]): Promise<any>;
}

interface TableRelKind {
  relkind: string;
}

export async function partitionTableIfRegular(
  queryRunner: MigrationQueryRunner,
  tableName: string,
  createPartitionedTableSql: string,
  partitionsSql: string,
  indexesSql: string,
): Promise<void> {
  const res: TableRelKind[] = await queryRunner.query(
    'SELECT relkind FROM pg_class WHERE relname = $1',
    [tableName],
  );

  // If table does not exist yet, create partitioned table directly
  if (!res || res.length === 0) {
    await queryRunner.query(createPartitionedTableSql);
    await queryRunner.query(partitionsSql);
    await queryRunner.query(indexesSql);
    return;
  }

  // If already partitioned ('p'), nothing to migrate
  if (res[0].relkind === 'p') {
    return;
  }

  // Relkind 'r' means regular table: migrate to partitioned table safely
  const legacyTable = `${tableName}_legacy`;

  // Drop any existing legacy leftover if present
  await queryRunner.query(`DROP TABLE IF EXISTS "${legacyTable}" CASCADE`);

  // Rename current regular table
  await queryRunner.query(
    `ALTER TABLE "${tableName}" RENAME TO "${legacyTable}"`,
  );

  // Create partitioned table
  await queryRunner.query(createPartitionedTableSql);

  // Create initial monthly partitions and default fallback partition
  await queryRunner.query(partitionsSql);

  // Create partition-wide indices
  await queryRunner.query(indexesSql);

  // Find common column names between legacyTable and new tableName
  const commonCols: { column_name: string }[] = await queryRunner.query(
    `SELECT a.column_name
     FROM information_schema.columns a
     INNER JOIN information_schema.columns b
       ON a.column_name = b.column_name AND b.table_name = $1
     WHERE a.table_name = $2
     ORDER BY a.ordinal_position`,
    [tableName, legacyTable],
  );

  if (commonCols && commonCols.length > 0) {
    const colList = commonCols.map((c) => `"${c.column_name}"`).join(', ');
    await queryRunner.query(
      `INSERT INTO "${tableName}" (${colList}) SELECT ${colList} FROM "${legacyTable}"`,
    );
  }

  // Clean up legacy table
  await queryRunner.query(`DROP TABLE "${legacyTable}" CASCADE`);
}

export async function applyDeclarativePartitioningMigration(
  queryRunner: MigrationQueryRunner,
  options: { skipSubmissions?: boolean } = {},
): Promise<void> {
  // Ensure uuid extension
  await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // 1. Submissions partitioned by RANGE ("createdAt")
  if (!options.skipSubmissions)
    await partitionTableIfRegular(
      queryRunner,
      'submissions',
      `CREATE TABLE "submissions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL,
      "problemId" uuid NOT NULL,
      "code" text NOT NULL,
      "language" varchar(50) NOT NULL,
      "status" varchar(50) NOT NULL DEFAULT 'Pending',
      "executionTime" double precision,
      "memoryUsed" double precision,
      "testsPassed" integer,
      "totalTests" integer,
      "errorMessage" text,
      "testResults" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "mongoId" varchar,
      "runtime" double precision,
      "memory" double precision,
      "testCasesPassed" integer,
      "totalTestCases" integer,
      "compileOutput" text,
      "queuedAt" timestamp,
      "startedAt" timestamp,
      "completedAt" timestamp,
      "problemSource" varchar(20) NOT NULL DEFAULT 'problem',
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "PK_submissions" PRIMARY KEY ("id", "createdAt"),
      CONSTRAINT "CHK_submissions_problem_source" CHECK ("problemSource" IN ('problem', 'metadata', 'question'))
    ) PARTITION BY RANGE ("createdAt")`,
      `CREATE TABLE IF NOT EXISTS "submissions_y2026m10" PARTITION OF "submissions"
      FOR VALUES FROM ('2026-10-01 00:00:00') TO ('2026-11-01 00:00:00');
     CREATE TABLE IF NOT EXISTS "submissions_y2026m11" PARTITION OF "submissions"
      FOR VALUES FROM ('2026-11-01 00:00:00') TO ('2026-12-01 00:00:00');
     CREATE TABLE IF NOT EXISTS "submissions_y2026m12" PARTITION OF "submissions"
      FOR VALUES FROM ('2026-12-01 00:00:00') TO ('2027-01-01 00:00:00');
     CREATE TABLE IF NOT EXISTS "submissions_y2027" PARTITION OF "submissions"
      FOR VALUES FROM ('2027-01-01 00:00:00') TO ('2028-01-01 00:00:00');
     CREATE TABLE IF NOT EXISTS "submissions_default" PARTITION OF "submissions" DEFAULT;`,
      `CREATE INDEX IF NOT EXISTS "IDX_submissions_id" ON "submissions" ("id");
     CREATE INDEX IF NOT EXISTS "IDX_submissions_user_problem_status" ON "submissions" ("userId", "problemId", "status");
     CREATE INDEX IF NOT EXISTS "IDX_submissions_createdAt" ON "submissions" ("createdAt");
     CREATE INDEX IF NOT EXISTS "IDX_submissions_status" ON "submissions" ("status");
     CREATE INDEX IF NOT EXISTS "IDX_submissions_language" ON "submissions" ("language");`,
    );

  // 2. Exam Security Events partitioned by RANGE ("createdAt")
  await partitionTableIfRegular(
    queryRunner,
    'exam_security_events',
    `CREATE TABLE "exam_security_events" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "mongoId" varchar,
      "session_id" uuid NOT NULL,
      "candidate_id" uuid NOT NULL,
      "assessment_id" uuid NOT NULL,
      "eventType" varchar NOT NULL,
      "severity" varchar NOT NULL DEFAULT 'INFO',
      "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "PK_exam_security_events" PRIMARY KEY ("id", "createdAt")
    ) PARTITION BY RANGE ("createdAt")`,
    `CREATE TABLE IF NOT EXISTS "exam_security_events_y2026m10" PARTITION OF "exam_security_events"
      FOR VALUES FROM ('2026-10-01 00:00:00') TO ('2026-11-01 00:00:00');
     CREATE TABLE IF NOT EXISTS "exam_security_events_y2026m11" PARTITION OF "exam_security_events"
      FOR VALUES FROM ('2026-11-01 00:00:00') TO ('2026-12-01 00:00:00');
     CREATE TABLE IF NOT EXISTS "exam_security_events_y2026m12" PARTITION OF "exam_security_events"
      FOR VALUES FROM ('2026-12-01 00:00:00') TO ('2027-01-01 00:00:00');
     CREATE TABLE IF NOT EXISTS "exam_security_events_y2027" PARTITION OF "exam_security_events"
      FOR VALUES FROM ('2027-01-01 00:00:00') TO ('2028-01-01 00:00:00');
     CREATE TABLE IF NOT EXISTS "exam_security_events_default" PARTITION OF "exam_security_events" DEFAULT;`,
    `CREATE INDEX IF NOT EXISTS "IDX_exam_security_events_id" ON "exam_security_events" ("id");
     CREATE INDEX IF NOT EXISTS "IDX_exam_security_events_session_id" ON "exam_security_events" ("session_id");
     CREATE INDEX IF NOT EXISTS "IDX_exam_security_events_candidate_id" ON "exam_security_events" ("candidate_id");
     CREATE INDEX IF NOT EXISTS "IDX_exam_security_events_assessment_id" ON "exam_security_events" ("assessment_id");
     CREATE INDEX IF NOT EXISTS "IDX_exam_security_events_createdAt" ON "exam_security_events" ("createdAt");`,
  );

  // 3. Audit Logs partitioned by RANGE ("timestamp")
  await partitionTableIfRegular(
    queryRunner,
    'audit_logs',
    `CREATE TABLE "audit_logs" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "mongoId" varchar,
      "actorId" uuid,
      "actorEmail" varchar(255) NOT NULL DEFAULT '',
      "action" varchar(100) NOT NULL,
      "target" varchar(255) NOT NULL DEFAULT '',
      "targetType" varchar(100) NOT NULL DEFAULT '',
      "studentId" uuid,
      "attemptId" uuid,
      "assessmentId" uuid,
      "event" varchar(255) DEFAULT '',
      "riskWeight" integer NOT NULL DEFAULT 0,
      "ipAddress" varchar(255) NOT NULL DEFAULT '',
      "userAgent" text NOT NULL DEFAULT '',
      "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "timestamp" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id", "timestamp")
    ) PARTITION BY RANGE ("timestamp")`,
    `CREATE TABLE IF NOT EXISTS "audit_logs_y2026m10" PARTITION OF "audit_logs"
      FOR VALUES FROM ('2026-10-01 00:00:00') TO ('2026-11-01 00:00:00');
     CREATE TABLE IF NOT EXISTS "audit_logs_y2026m11" PARTITION OF "audit_logs"
      FOR VALUES FROM ('2026-11-01 00:00:00') TO ('2026-12-01 00:00:00');
     CREATE TABLE IF NOT EXISTS "audit_logs_y2026m12" PARTITION OF "audit_logs"
      FOR VALUES FROM ('2026-12-01 00:00:00') TO ('2027-01-01 00:00:00');
     CREATE TABLE IF NOT EXISTS "audit_logs_y2027" PARTITION OF "audit_logs"
      FOR VALUES FROM ('2027-01-01 00:00:00') TO ('2028-01-01 00:00:00');
     CREATE TABLE IF NOT EXISTS "audit_logs_default" PARTITION OF "audit_logs" DEFAULT;`,
    `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_id" ON "audit_logs" ("id");
     CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action_timestamp" ON "audit_logs" ("action", "timestamp");
     CREATE INDEX IF NOT EXISTS "IDX_audit_logs_targetType_target" ON "audit_logs" ("targetType", "target");
     CREATE INDEX IF NOT EXISTS "IDX_audit_logs_studentId_timestamp" ON "audit_logs" ("studentId", "timestamp");
     CREATE INDEX IF NOT EXISTS "IDX_audit_logs_actorId" ON "audit_logs" ("actorId");
     CREATE INDEX IF NOT EXISTS "IDX_audit_logs_attemptId" ON "audit_logs" ("attemptId");
     CREATE INDEX IF NOT EXISTS "IDX_audit_logs_assessmentId" ON "audit_logs" ("assessmentId");
     CREATE INDEX IF NOT EXISTS "IDX_audit_logs_timestamp" ON "audit_logs" ("timestamp");`,
  );
}
