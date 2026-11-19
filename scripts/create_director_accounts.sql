-- CodeSkill: Provision Director Office Accounts (1 Admin + 2 Students)
-- Passwords:
--   Admin account:    Admin@CodeSkill2026!
--   Student accounts: Student@CodeSkill2026!

BEGIN;

-- 1. Director Admin
INSERT INTO "users" (
  "name", "username", "email", "password", "role", "uid",
  "isAdmin", "isActive", "authProvider", "forcePasswordChange",
  "isAssessmentStudent", "mfaEnabled", "tokenVersion",
  "studentProfile", "profile", "stats", "avatar", "bio"
) VALUES (
  'Director Admin',
  'director.admin',
  'director.admin@cuchd.in',
  '$2b$10$H93r7pnSLQk.s9/gowvAUOWPDAVVH9jvboMQ7f5.6hWvmbwgJew3q',
  'admin',
  'ADM-DIRECTOR',
  true,
  true,
  'local',
  false,
  false,
  false,
  0,
  '{}',
  '{"institution": "Chandigarh University", "department": "Director Office", "role": "admin"}',
  '{}',
  '',
  ''
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "username" = EXCLUDED."username",
  "password" = EXCLUDED."password",
  "role" = EXCLUDED."role",
  "uid" = EXCLUDED."uid",
  "isAdmin" = EXCLUDED."isAdmin",
  "isActive" = EXCLUDED."isActive",
  "isAssessmentStudent" = EXCLUDED."isAssessmentStudent",
  "forcePasswordChange" = false,
  "studentProfile" = EXCLUDED."studentProfile",
  "profile" = EXCLUDED."profile",
  "tokenVersion" = "users"."tokenVersion" + 1;

-- 2. Director Student 1
INSERT INTO "users" (
  "name", "username", "email", "password", "role", "uid",
  "isAdmin", "isActive", "authProvider", "forcePasswordChange",
  "isAssessmentStudent", "mfaEnabled", "tokenVersion",
  "studentProfile", "profile", "stats", "avatar", "bio"
) VALUES (
  'Director Student 1',
  'director.student1',
  'director.student1@cuchd.in',
  '$2b$10$pjfBAUeGgxR1FnarorBXaOLwrdIzHijsVZscqWmoGjpALVUY7i3NK',
  'student',
  'STU-DIR01',
  false,
  true,
  'local',
  false,
  true,
  false,
  0,
  '{"university": "Chandigarh University", "department": "Director Office", "course": "B.Tech Computer Science & Engineering", "semester": 4, "section": "Section A", "year": 2026, "batch": "2026"}',
  '{"institution": "Chandigarh University", "role": "student"}',
  '{}',
  '',
  ''
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "username" = EXCLUDED."username",
  "password" = EXCLUDED."password",
  "role" = EXCLUDED."role",
  "uid" = EXCLUDED."uid",
  "isAdmin" = EXCLUDED."isAdmin",
  "isActive" = EXCLUDED."isActive",
  "isAssessmentStudent" = EXCLUDED."isAssessmentStudent",
  "forcePasswordChange" = false,
  "studentProfile" = EXCLUDED."studentProfile",
  "profile" = EXCLUDED."profile",
  "tokenVersion" = "users"."tokenVersion" + 1;

-- 3. Director Student 2
INSERT INTO "users" (
  "name", "username", "email", "password", "role", "uid",
  "isAdmin", "isActive", "authProvider", "forcePasswordChange",
  "isAssessmentStudent", "mfaEnabled", "tokenVersion",
  "studentProfile", "profile", "stats", "avatar", "bio"
) VALUES (
  'Director Student 2',
  'director.student2',
  'director.student2@cuchd.in',
  '$2b$10$pjfBAUeGgxR1FnarorBXaOLwrdIzHijsVZscqWmoGjpALVUY7i3NK',
  'student',
  'STU-DIR02',
  false,
  true,
  'local',
  false,
  true,
  false,
  0,
  '{"university": "Chandigarh University", "department": "Director Office", "course": "B.Tech Computer Science & Engineering", "semester": 4, "section": "Section B", "year": 2026, "batch": "2026"}',
  '{"institution": "Chandigarh University", "role": "student"}',
  '{}',
  '',
  ''
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "username" = EXCLUDED."username",
  "password" = EXCLUDED."password",
  "role" = EXCLUDED."role",
  "uid" = EXCLUDED."uid",
  "isAdmin" = EXCLUDED."isAdmin",
  "isActive" = EXCLUDED."isActive",
  "isAssessmentStudent" = EXCLUDED."isAssessmentStudent",
  "forcePasswordChange" = false,
  "studentProfile" = EXCLUDED."studentProfile",
  "profile" = EXCLUDED."profile",
  "tokenVersion" = "users"."tokenVersion" + 1;

COMMIT;
