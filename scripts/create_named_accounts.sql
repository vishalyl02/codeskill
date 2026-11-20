-- CodeSkill: Provision 14 Institutional Accounts (7 Admin + 7 Student)
-- Passwords:
--   Admin accounts:   Admin@CodeSkill2026!
--   Student accounts: Student@CodeSkill2026!

BEGIN;

-- 1. IQAC (Admin & Student)
INSERT INTO "users" (
  "name", "username", "email", "password", "role", "uid",
  "isAdmin", "isActive", "authProvider", "forcePasswordChange",
  "isAssessmentStudent", "mfaEnabled", "tokenVersion",
  "studentProfile", "profile", "stats", "avatar", "bio"
) VALUES 
(
  'IQAC Admin', 'admin_iqac', 'iqac.admin@cuchd.in',
  '$2b$10$H93r7pnSLQk.s9/gowvAUOWPDAVVH9jvboMQ7f5.6hWvmbwgJew3q',
  'admin', 'ADM-IQAC', true, true, 'local', false, false, false, 0, '{}', '{}', '{}', '', ''
),
(
  'IQAC Student', 'student_iqac', 'iqac.student@cuchd.in',
  '$2b$10$pjfBAUeGgxR1FnarorBXaOLwrdIzHijsVZscqWmoGjpALVUY7i3NK',
  'student', 'STU-IQAC', false, true, 'local', false, false, false, 0,
  '{"university": "Chandigarh University", "department": "Internal Quality Assurance Cell", "course": "B.Tech CSE", "semester": 4, "section": "Section A", "year": 2026, "batch": "2026"}',
  '{}', '{}', '', ''
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "username" = EXCLUDED."username",
  "password" = EXCLUDED."password",
  "role" = EXCLUDED."role",
  "uid" = EXCLUDED."uid",
  "isAdmin" = EXCLUDED."isAdmin",
  "isActive" = true,
  "forcePasswordChange" = false,
  "studentProfile" = EXCLUDED."studentProfile",
  "tokenVersion" = "users"."tokenVersion" + 1;

-- 2. VC office (Admin & Student)
INSERT INTO "users" (
  "name", "username", "email", "password", "role", "uid",
  "isAdmin", "isActive", "authProvider", "forcePasswordChange",
  "isAssessmentStudent", "mfaEnabled", "tokenVersion",
  "studentProfile", "profile", "stats", "avatar", "bio"
) VALUES 
(
  'VC Office Admin', 'admin_vcoffice', 'vcoffice.admin@cuchd.in',
  '$2b$10$H93r7pnSLQk.s9/gowvAUOWPDAVVH9jvboMQ7f5.6hWvmbwgJew3q',
  'admin', 'ADM-VCOFFICE', true, true, 'local', false, false, false, 0, '{}', '{}', '{}', '', ''
),
(
  'VC Office Student', 'student_vcoffice', 'vcoffice.student@cuchd.in',
  '$2b$10$pjfBAUeGgxR1FnarorBXaOLwrdIzHijsVZscqWmoGjpALVUY7i3NK',
  'student', 'STU-VCOFFICE', false, true, 'local', false, false, false, 0,
  '{"university": "Chandigarh University", "department": "Vice Chancellor Office", "course": "B.Tech CSE", "semester": 4, "section": "Section A", "year": 2026, "batch": "2026"}',
  '{}', '{}', '', ''
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "username" = EXCLUDED."username",
  "password" = EXCLUDED."password",
  "role" = EXCLUDED."role",
  "uid" = EXCLUDED."uid",
  "isAdmin" = EXCLUDED."isAdmin",
  "isActive" = true,
  "forcePasswordChange" = false,
  "studentProfile" = EXCLUDED."studentProfile",
  "tokenVersion" = "users"."tokenVersion" + 1;

-- 3. PVC_DSA (Admin & Student)
INSERT INTO "users" (
  "name", "username", "email", "password", "role", "uid",
  "isAdmin", "isActive", "authProvider", "forcePasswordChange",
  "isAssessmentStudent", "mfaEnabled", "tokenVersion",
  "studentProfile", "profile", "stats", "avatar", "bio"
) VALUES 
(
  'PVC DSA Admin', 'admin_pvc_dsa', 'pvc.dsa.admin@cuchd.in',
  '$2b$10$H93r7pnSLQk.s9/gowvAUOWPDAVVH9jvboMQ7f5.6hWvmbwgJew3q',
  'admin', 'ADM-PVCDSA', true, true, 'local', false, false, false, 0, '{}', '{}', '{}', '', ''
),
(
  'PVC DSA Student', 'student_pvc_dsa', 'pvc.dsa.student@cuchd.in',
  '$2b$10$pjfBAUeGgxR1FnarorBXaOLwrdIzHijsVZscqWmoGjpALVUY7i3NK',
  'student', 'STU-PVCDSA', false, true, 'local', false, false, false, 0,
  '{"university": "Chandigarh University", "department": "Department of Student Affairs", "course": "B.Tech CSE", "semester": 4, "section": "Section A", "year": 2026, "batch": "2026"}',
  '{}', '{}', '', ''
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "username" = EXCLUDED."username",
  "password" = EXCLUDED."password",
  "role" = EXCLUDED."role",
  "uid" = EXCLUDED."uid",
  "isAdmin" = EXCLUDED."isAdmin",
  "isActive" = true,
  "forcePasswordChange" = false,
  "studentProfile" = EXCLUDED."studentProfile",
  "tokenVersion" = "users"."tokenVersion" + 1;

-- 4. ED_Eng (Admin & Student)
INSERT INTO "users" (
  "name", "username", "email", "password", "role", "uid",
  "isAdmin", "isActive", "authProvider", "forcePasswordChange",
  "isAssessmentStudent", "mfaEnabled", "tokenVersion",
  "studentProfile", "profile", "stats", "avatar", "bio"
) VALUES 
(
  'ED Eng Admin', 'admin_ed_eng', 'ed.eng.admin@cuchd.in',
  '$2b$10$H93r7pnSLQk.s9/gowvAUOWPDAVVH9jvboMQ7f5.6hWvmbwgJew3q',
  'admin', 'ADM-EDENG', true, true, 'local', false, false, false, 0, '{}', '{}', '{}', '', ''
),
(
  'ED Eng Student', 'student_ed_eng', 'ed.eng.student@cuchd.in',
  '$2b$10$pjfBAUeGgxR1FnarorBXaOLwrdIzHijsVZscqWmoGjpALVUY7i3NK',
  'student', 'STU-EDENG', false, true, 'local', false, false, false, 0,
  '{"university": "Chandigarh University", "department": "Engineering & Technology", "course": "B.Tech CSE", "semester": 4, "section": "Section A", "year": 2026, "batch": "2026"}',
  '{}', '{}', '', ''
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "username" = EXCLUDED."username",
  "password" = EXCLUDED."password",
  "role" = EXCLUDED."role",
  "uid" = EXCLUDED."uid",
  "isAdmin" = EXCLUDED."isAdmin",
  "isActive" = true,
  "forcePasswordChange" = false,
  "studentProfile" = EXCLUDED."studentProfile",
  "tokenVersion" = "users"."tokenVersion" + 1;

-- 5. ED_Ait (Admin & Student)
INSERT INTO "users" (
  "name", "username", "email", "password", "role", "uid",
  "isAdmin", "isActive", "authProvider", "forcePasswordChange",
  "isAssessmentStudent", "mfaEnabled", "tokenVersion",
  "studentProfile", "profile", "stats", "avatar", "bio"
) VALUES 
(
  'ED Ait Admin', 'admin_ed_ait', 'ed.ait.admin@cuchd.in',
  '$2b$10$H93r7pnSLQk.s9/gowvAUOWPDAVVH9jvboMQ7f5.6hWvmbwgJew3q',
  'admin', 'ADM-EDAIT', true, true, 'local', false, false, false, 0, '{}', '{}', '{}', '', ''
),
(
  'ED Ait Student', 'student_ed_ait', 'ed.ait.student@cuchd.in',
  '$2b$10$pjfBAUeGgxR1FnarorBXaOLwrdIzHijsVZscqWmoGjpALVUY7i3NK',
  'student', 'STU-EDAIT', false, true, 'local', false, false, false, 0,
  '{"university": "Chandigarh University", "department": "Apex Institute of Technology", "course": "B.Tech CSE", "semester": 4, "section": "Section A", "year": 2026, "batch": "2026"}',
  '{}', '{}', '', ''
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "username" = EXCLUDED."username",
  "password" = EXCLUDED."password",
  "role" = EXCLUDED."role",
  "uid" = EXCLUDED."uid",
  "isAdmin" = EXCLUDED."isAdmin",
  "isActive" = true,
  "forcePasswordChange" = false,
  "studentProfile" = EXCLUDED."studentProfile",
  "tokenVersion" = "users"."tokenVersion" + 1;

-- 6. VC_HR (Admin & Student)
INSERT INTO "users" (
  "name", "username", "email", "password", "role", "uid",
  "isAdmin", "isActive", "authProvider", "forcePasswordChange",
  "isAssessmentStudent", "mfaEnabled", "tokenVersion",
  "studentProfile", "profile", "stats", "avatar", "bio"
) VALUES 
(
  'VC HR Admin', 'admin_vc_hr', 'vc.hr.admin@cuchd.in',
  '$2b$10$H93r7pnSLQk.s9/gowvAUOWPDAVVH9jvboMQ7f5.6hWvmbwgJew3q',
  'admin', 'ADM-VCHR', true, true, 'local', false, false, false, 0, '{}', '{}', '{}', '', ''
),
(
  'VC HR Student', 'student_vc_hr', 'vc.hr.student@cuchd.in',
  '$2b$10$pjfBAUeGgxR1FnarorBXaOLwrdIzHijsVZscqWmoGjpALVUY7i3NK',
  'student', 'STU-VCHR', false, true, 'local', false, false, false, 0,
  '{"university": "Chandigarh University", "department": "Human Resources", "course": "B.Tech CSE", "semester": 4, "section": "Section A", "year": 2026, "batch": "2026"}',
  '{}', '{}', '', ''
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "username" = EXCLUDED."username",
  "password" = EXCLUDED."password",
  "role" = EXCLUDED."role",
  "uid" = EXCLUDED."uid",
  "isAdmin" = EXCLUDED."isAdmin",
  "isActive" = true,
  "forcePasswordChange" = false,
  "studentProfile" = EXCLUDED."studentProfile",
  "tokenVersion" = "users"."tokenVersion" + 1;

-- 7. CU-Admin (Admin & Student)
INSERT INTO "users" (
  "name", "username", "email", "password", "role", "uid",
  "isAdmin", "isActive", "authProvider", "forcePasswordChange",
  "isAssessmentStudent", "mfaEnabled", "tokenVersion",
  "studentProfile", "profile", "stats", "avatar", "bio"
) VALUES 
(
  'CU Admin', 'admin_cu', 'cu.admin@cuchd.in',
  '$2b$10$H93r7pnSLQk.s9/gowvAUOWPDAVVH9jvboMQ7f5.6hWvmbwgJew3q',
  'admin', 'ADM-CU', true, true, 'local', false, false, false, 0, '{}', '{}', '{}', '', ''
),
(
  'CU Student', 'student_cu', 'cu.student@cuchd.in',
  '$2b$10$pjfBAUeGgxR1FnarorBXaOLwrdIzHijsVZscqWmoGjpALVUY7i3NK',
  'student', 'STU-CU', false, true, 'local', false, false, false, 0,
  '{"university": "Chandigarh University", "department": "University Administration", "course": "B.Tech CSE", "semester": 4, "section": "Section A", "year": 2026, "batch": "2026"}',
  '{}', '{}', '', ''
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "username" = EXCLUDED."username",
  "password" = EXCLUDED."password",
  "role" = EXCLUDED."role",
  "uid" = EXCLUDED."uid",
  "isAdmin" = EXCLUDED."isAdmin",
  "isActive" = true,
  "forcePasswordChange" = false,
  "studentProfile" = EXCLUDED."studentProfile",
  "tokenVersion" = "users"."tokenVersion" + 1;

COMMIT;
