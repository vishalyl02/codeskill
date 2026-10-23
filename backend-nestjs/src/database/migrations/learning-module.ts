interface SchemaQueryRunner {
  query(sql: string): Promise<unknown>;
}

export async function applyLearningModuleMigration(
  runner: SchemaQueryRunner,
): Promise<void> {
  // 1. learning_paths
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "learning_paths" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "title" varchar(255) NOT NULL,
      "slug" varchar(255) UNIQUE NOT NULL,
      "description" text NOT NULL DEFAULT '',
      "difficulty" varchar(50) NOT NULL DEFAULT 'beginner',
      "iconUrl" varchar(255) NOT NULL DEFAULT '',
      "estimatedHours" integer NOT NULL DEFAULT 10,
      "tags" text[] NOT NULL DEFAULT '{}',
      "status" varchar(50) NOT NULL DEFAULT 'draft',
      "version" integer NOT NULL DEFAULT 1,
      "completionCriteria" jsonb NOT NULL DEFAULT '{"minCourseCompletionRate": 100, "requireAllMandatory": true, "passQuizThreshold": 70}',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "IDX_learning_paths_slug" ON "learning_paths" ("slug");
    CREATE INDEX IF NOT EXISTS "IDX_learning_paths_status" ON "learning_paths" ("status");
  `);

  // 2. courses
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "courses" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "title" varchar(255) NOT NULL,
      "slug" varchar(255) UNIQUE NOT NULL,
      "description" text NOT NULL DEFAULT '',
      "difficulty" varchar(50) NOT NULL DEFAULT 'beginner',
      "estimatedMinutes" integer NOT NULL DEFAULT 60,
      "status" varchar(50) NOT NULL DEFAULT 'published',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "IDX_courses_slug" ON "courses" ("slug");
    CREATE INDEX IF NOT EXISTS "IDX_courses_status" ON "courses" ("status");
  `);

  // 3. learning_path_courses
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "learning_path_courses" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "pathId" uuid NOT NULL REFERENCES "learning_paths"("id") ON DELETE CASCADE,
      "courseId" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
      "order" integer NOT NULL DEFAULT 1,
      "isMandatory" boolean NOT NULL DEFAULT true,
      "prerequisiteCourseIds" text[] NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_learning_path_courses" UNIQUE ("pathId", "courseId")
    );
    CREATE INDEX IF NOT EXISTS "IDX_learning_path_courses_pathId" ON "learning_path_courses" ("pathId");
    CREATE INDEX IF NOT EXISTS "IDX_learning_path_courses_courseId" ON "learning_path_courses" ("courseId");
  `);

  // 4. course_modules
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "course_modules" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "courseId" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
      "title" varchar(255) NOT NULL,
      "description" text NOT NULL DEFAULT '',
      "order" integer NOT NULL DEFAULT 1,
      "requiredTimeMinutes" integer NOT NULL DEFAULT 2,
      "requiredTimeSeconds" integer NOT NULL DEFAULT 120,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "IDX_course_modules_courseId" ON "course_modules" ("courseId");
    ALTER TABLE "course_modules" ADD COLUMN IF NOT EXISTS "requiredTimeMinutes" integer NOT NULL DEFAULT 2;
    ALTER TABLE "course_modules" ADD COLUMN IF NOT EXISTS "requiredTimeSeconds" integer NOT NULL DEFAULT 120;
  `);

  // 5. lessons
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "lessons" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "moduleId" uuid NOT NULL REFERENCES "course_modules"("id") ON DELETE CASCADE,
      "title" varchar(255) NOT NULL,
      "slug" varchar(255) NOT NULL,
      "content" text NOT NULL,
      "learningObjectives" text[] NOT NULL DEFAULT '{}',
      "order" integer NOT NULL DEFAULT 1,
      "type" varchar(50) NOT NULL DEFAULT 'reading',
      "passingScore" integer NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "IDX_lessons_moduleId" ON "lessons" ("moduleId");
  `);

  // 6. course_exercises
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "course_exercises" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "lessonId" uuid NOT NULL REFERENCES "lessons"("id") ON DELETE CASCADE,
      "title" varchar(255) NOT NULL,
      "type" varchar(50) NOT NULL DEFAULT 'coding',
      "problemId" uuid,
      "quizConfig" jsonb,
      "starterCode" jsonb,
      "hints" text[] NOT NULL DEFAULT '{}',
      "marks" integer NOT NULL DEFAULT 10,
      "isMandatory" boolean NOT NULL DEFAULT true,
      "order" integer NOT NULL DEFAULT 1,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "IDX_course_exercises_lessonId" ON "course_exercises" ("lessonId");
    CREATE INDEX IF NOT EXISTS "IDX_course_exercises_problemId" ON "course_exercises" ("problemId");
  `);

  // 7. learning_enrollments
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "learning_enrollments" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "studentId" uuid NOT NULL,
      "pathId" uuid NOT NULL REFERENCES "learning_paths"("id") ON DELETE CASCADE,
      "pathVersion" integer NOT NULL DEFAULT 1,
      "status" varchar(50) NOT NULL DEFAULT 'active',
      "enrolledAt" TIMESTAMP NOT NULL DEFAULT now(),
      "completedAt" TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_learning_enrollments" UNIQUE ("studentId", "pathId", "pathVersion")
    );
    CREATE INDEX IF NOT EXISTS "IDX_learning_enrollments_studentId" ON "learning_enrollments" ("studentId");
    CREATE INDEX IF NOT EXISTS "IDX_learning_enrollments_pathId" ON "learning_enrollments" ("pathId");
  `);

  // 8. lesson_progress
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "lesson_progress" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "studentId" uuid NOT NULL,
      "lessonId" uuid NOT NULL REFERENCES "lessons"("id") ON DELETE CASCADE,
      "status" varchar(50) NOT NULL DEFAULT 'in_progress',
      "score" double precision NOT NULL DEFAULT 0,
      "timeSpentSeconds" integer NOT NULL DEFAULT 0,
      "completedAt" TIMESTAMP,
      "lastInteractedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_lesson_progress" UNIQUE ("studentId", "lessonId")
    );
    CREATE INDEX IF NOT EXISTS "IDX_lesson_progress_studentId" ON "lesson_progress" ("studentId");
    CREATE INDEX IF NOT EXISTS "IDX_lesson_progress_lessonId" ON "lesson_progress" ("lessonId");
    ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "timeSpentSeconds" integer NOT NULL DEFAULT 0;
  `);

  // 9. course_progress
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "course_progress" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "studentId" uuid NOT NULL,
      "courseId" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
      "pathId" uuid,
      "percentage" double precision NOT NULL DEFAULT 0,
      "completedLessonsCount" integer NOT NULL DEFAULT 0,
      "totalLessonsCount" integer NOT NULL DEFAULT 0,
      "status" varchar(50) NOT NULL DEFAULT 'in_progress',
      "completedAt" TIMESTAMP,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_course_progress" UNIQUE ("studentId", "courseId")
    );
    CREATE INDEX IF NOT EXISTS "IDX_course_progress_studentId" ON "course_progress" ("studentId");
    CREATE INDEX IF NOT EXISTS "IDX_course_progress_courseId" ON "course_progress" ("courseId");
  `);

  // 10. path_progress
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "path_progress" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "studentId" uuid NOT NULL,
      "pathId" uuid NOT NULL REFERENCES "learning_paths"("id") ON DELETE CASCADE,
      "percentage" double precision NOT NULL DEFAULT 0,
      "completedCoursesCount" integer NOT NULL DEFAULT 0,
      "totalCoursesCount" integer NOT NULL DEFAULT 0,
      "isCertified" boolean NOT NULL DEFAULT false,
      "status" varchar(50) NOT NULL DEFAULT 'in_progress',
      "completedAt" TIMESTAMP,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_path_progress" UNIQUE ("studentId", "pathId")
    );
    CREATE INDEX IF NOT EXISTS "IDX_path_progress_studentId" ON "path_progress" ("studentId");
    CREATE INDEX IF NOT EXISTS "IDX_path_progress_pathId" ON "path_progress" ("pathId");
  `);

  // 11. xp_ledger
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "xp_ledger" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "studentId" uuid NOT NULL,
      "amount" integer NOT NULL,
      "eventType" varchar(50) NOT NULL,
      "entityId" uuid,
      "idempotencyKey" varchar(255) NOT NULL,
      "notes" varchar(255) NOT NULL DEFAULT '',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_xp_ledger_idempotency" UNIQUE ("studentId", "idempotencyKey")
    );
    CREATE INDEX IF NOT EXISTS "IDX_xp_ledger_studentId" ON "xp_ledger" ("studentId");
    CREATE INDEX IF NOT EXISTS "IDX_xp_ledger_eventType" ON "xp_ledger" ("eventType");
  `);

  // 12. badge_definitions
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "badge_definitions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "code" varchar(100) UNIQUE NOT NULL,
      "name" varchar(255) NOT NULL,
      "description" text NOT NULL DEFAULT '',
      "iconUrl" varchar(255) NOT NULL DEFAULT '',
      "rarity" varchar(50) NOT NULL DEFAULT 'common',
      "category" varchar(50) NOT NULL DEFAULT 'milestone',
      "criteria" jsonb NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "IDX_badge_definitions_code" ON "badge_definitions" ("code");
  `);

  // 13. student_badges
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "student_badges" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "studentId" uuid NOT NULL,
      "badgeId" uuid NOT NULL REFERENCES "badge_definitions"("id") ON DELETE CASCADE,
      "awardedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "metadata" jsonb NOT NULL DEFAULT '{}',
      CONSTRAINT "UQ_student_badges" UNIQUE ("studentId", "badgeId")
    );
    CREATE INDEX IF NOT EXISTS "IDX_student_badges_studentId" ON "student_badges" ("studentId");
    CREATE INDEX IF NOT EXISTS "IDX_student_badges_badgeId" ON "student_badges" ("badgeId");
  `);

  // 14. certificate_templates
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "certificate_templates" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" varchar(255) NOT NULL,
      "title" varchar(255) NOT NULL DEFAULT 'Certificate of Achievement',
      "issuerTitle" varchar(255) NOT NULL DEFAULT 'Head of Technical Training',
      "issuerName" varchar(255) NOT NULL DEFAULT 'Technical Training Team',
      "issuerOrganization" varchar(255) NOT NULL DEFAULT 'CodeSkill · Chandigarh University',
      "logoUrl" varchar(255) NOT NULL DEFAULT '',
      "signatureUrl" varchar(255) NOT NULL DEFAULT '',
      "badgeUrl" varchar(255) NOT NULL DEFAULT '',
      "isDefault" boolean NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    );
  `);

  // 15. certificates
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "certificates" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "credentialId" varchar(50) UNIQUE NOT NULL,
      "studentId" uuid NOT NULL,
      "pathId" uuid NOT NULL REFERENCES "learning_paths"("id") ON DELETE CASCADE,
      "pathTitle" varchar(255) NOT NULL,
      "recipientName" varchar(255) NOT NULL,
      "status" varchar(50) NOT NULL DEFAULT 'valid',
      "issueDate" TIMESTAMP NOT NULL DEFAULT now(),
      "metadata" jsonb NOT NULL DEFAULT '{}',
      "pdfUrl" text,
      "verificationUrl" varchar(255) NOT NULL DEFAULT '',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_certificates_student_path" UNIQUE ("studentId", "pathId")
    );
    CREATE INDEX IF NOT EXISTS "IDX_certificates_credentialId" ON "certificates" ("credentialId");
    CREATE INDEX IF NOT EXISTS "IDX_certificates_studentId" ON "certificates" ("studentId");
  `);

  // 16. certificate_events
  await runner.query(`
    CREATE TABLE IF NOT EXISTS "certificate_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "certificateId" uuid NOT NULL REFERENCES "certificates"("id") ON DELETE CASCADE,
      "eventType" varchar(50) NOT NULL,
      "actorId" uuid,
      "reason" text,
      "ipAddress" varchar(100),
      "createdAt" TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "IDX_certificate_events_certificateId" ON "certificate_events" ("certificateId");
  `);
}
