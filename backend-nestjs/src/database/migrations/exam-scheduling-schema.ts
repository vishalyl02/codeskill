interface SchemaQueryRunner {
  query(sql: string): Promise<unknown>;
}

export async function applyExamSchedulingSchemaMigration(
  runner: SchemaQueryRunner,
): Promise<void> {
  // 1. exam_schedules
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "exam_schedules" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "assessment_id" uuid NOT NULL REFERENCES "assessments"("id") ON DELETE CASCADE,
      "title" varchar(255) NOT NULL,
      "code" varchar(100) UNIQUE NOT NULL,
      "description" text NOT NULL DEFAULT '',
      "academicSession" varchar(50) NOT NULL DEFAULT '2026-2027',
      "semester" integer NOT NULL DEFAULT 1,
      "program" varchar(100) NOT NULL DEFAULT 'Computer Science and Engineering',
      "academicYear" integer NOT NULL DEFAULT 2026,
      "status" varchar(50) NOT NULL DEFAULT 'draft',
      "timezone" varchar(100) NOT NULL DEFAULT 'Asia/Kolkata',
      "maxConcurrentSessions" integer NOT NULL DEFAULT 500,
      "config" jsonb NOT NULL DEFAULT '{"earlyAccessMinutes": 5, "lateStartAllowanceMinutes": 15, "gracePeriodMinutes": 5, "maxDurationMinutes": 60, "allowedAttempts": 1, "allowResume": true, "allowDisconnectionReentry": true, "strictTimeBoundary": true}',
      "totalEligibleStudents" integer NOT NULL DEFAULT 0,
      "totalAssignedStudents" integer NOT NULL DEFAULT 0,
      "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "IDX_exam_schedules_assessment_id" ON "exam_schedules" ("assessment_id");
    CREATE INDEX IF NOT EXISTS "IDX_exam_schedules_status" ON "exam_schedules" ("status");
    CREATE INDEX IF NOT EXISTS "IDX_exam_schedules_assessment_status" ON "exam_schedules" ("assessment_id", "status");
    CREATE INDEX IF NOT EXISTS "IDX_exam_schedules_session_semester" ON "exam_schedules" ("academicSession", "semester");
  `);

  // 2. exam_slots
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "exam_slots" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "schedule_id" uuid NOT NULL REFERENCES "exam_schedules"("id") ON DELETE CASCADE,
      "name" varchar(150) NOT NULL,
      "slotCode" varchar(50) NOT NULL,
      "date" varchar(20) NOT NULL,
      "startTime" TIMESTAMP WITH TIME ZONE NOT NULL,
      "endTime" TIMESTAMP WITH TIME ZONE NOT NULL,
      "capacity" integer NOT NULL DEFAULT 300,
      "assignedCount" integer NOT NULL DEFAULT 0,
      "status" varchar(50) NOT NULL DEFAULT 'scheduled',
      "roomOrLab" varchar(150),
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "IDX_exam_slots_schedule_id" ON "exam_slots" ("schedule_id");
    CREATE INDEX IF NOT EXISTS "IDX_exam_slots_schedule_date" ON "exam_slots" ("schedule_id", "date");
    CREATE INDEX IF NOT EXISTS "IDX_exam_slots_schedule_status" ON "exam_slots" ("schedule_id", "status");
    CREATE INDEX IF NOT EXISTS "IDX_exam_slots_timing" ON "exam_slots" ("startTime", "endTime");
  `);

  // 3. exam_eligibility_assignments
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "exam_eligibility_assignments" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "schedule_id" uuid NOT NULL REFERENCES "exam_schedules"("id") ON DELETE CASCADE,
      "slot_id" uuid REFERENCES "exam_slots"("id") ON DELETE SET NULL,
      "assessment_id" uuid NOT NULL REFERENCES "assessments"("id") ON DELETE CASCADE,
      "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "studentUid" varchar(100) NOT NULL,
      "studentEmail" varchar(255) NOT NULL,
      "studentName" varchar(255) NOT NULL,
      "academicSnapshot" jsonb NOT NULL DEFAULT '{}',
      "status" varchar(50) NOT NULL DEFAULT 'eligible',
      "assignmentSource" varchar(50) NOT NULL DEFAULT 'filter',
      "accessWindowStart" TIMESTAMP WITH TIME ZONE,
      "accessWindowEnd" TIMESTAMP WITH TIME ZONE,
      "overrideReason" text,
      "override_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "overrideAt" TIMESTAMP WITH TIME ZONE,
      "attempt_id" uuid REFERENCES "assessment_attempts"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_exam_eligibility_schedule_student" UNIQUE ("schedule_id", "student_id")
    );
    CREATE INDEX IF NOT EXISTS "IDX_exam_assignments_schedule_id" ON "exam_eligibility_assignments" ("schedule_id");
    CREATE INDEX IF NOT EXISTS "IDX_exam_assignments_slot_id" ON "exam_eligibility_assignments" ("slot_id");
    CREATE INDEX IF NOT EXISTS "IDX_exam_assignments_assessment_student" ON "exam_eligibility_assignments" ("assessment_id", "student_id");
    CREATE INDEX IF NOT EXISTS "IDX_exam_assignments_student_uid" ON "exam_eligibility_assignments" ("studentUid");
    CREATE INDEX IF NOT EXISTS "IDX_exam_assignments_schedule_status" ON "exam_eligibility_assignments" ("schedule_id", "status");
    CREATE INDEX IF NOT EXISTS "IDX_exam_assignments_slot_status" ON "exam_eligibility_assignments" ("slot_id", "status");
    CREATE INDEX IF NOT EXISTS "IDX_exam_assignments_access_window" ON "exam_eligibility_assignments" ("accessWindowStart", "accessWindowEnd");
  `);

  // 4. exam_access_audit_logs
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "exam_access_audit_logs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "schedule_id" uuid,
      "slot_id" uuid,
      "student_id" uuid,
      "studentUid" varchar(100),
      "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "actorEmail" varchar(255) NOT NULL,
      "actorRole" varchar(50) NOT NULL DEFAULT 'admin',
      "action" varchar(100) NOT NULL,
      "reason" text,
      "previousState" jsonb,
      "newState" jsonb,
      "ipAddress" varchar(100),
      "userAgent" text,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "IDX_exam_audit_schedule_action" ON "exam_access_audit_logs" ("schedule_id", "action");
    CREATE INDEX IF NOT EXISTS "IDX_exam_audit_student_id" ON "exam_access_audit_logs" ("student_id");
    CREATE INDEX IF NOT EXISTS "IDX_exam_audit_student_uid" ON "exam_access_audit_logs" ("studentUid");
    CREATE INDEX IF NOT EXISTS "IDX_exam_audit_actor_id" ON "exam_access_audit_logs" ("actor_id");
    CREATE INDEX IF NOT EXISTS "IDX_exam_audit_createdAt" ON "exam_access_audit_logs" ("createdAt");
  `);

  // 5. exam_saved_groups
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "exam_saved_groups" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" varchar(150) NOT NULL,
      "description" text NOT NULL DEFAULT '',
      "groupType" varchar(50) NOT NULL DEFAULT 'snapshot_fixed',
      "filterCriteria" jsonb NOT NULL DEFAULT '{}',
      "studentIds" text[] NOT NULL DEFAULT '{}',
      "studentCount" integer NOT NULL DEFAULT 0,
      "created_by_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "IDX_exam_saved_groups_type" ON "exam_saved_groups" ("groupType");
  `);
}
