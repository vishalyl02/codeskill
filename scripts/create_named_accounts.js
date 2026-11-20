const path = require('node:path');
const fs = require('node:fs');

// Resolve pg and bcryptjs from either local node_modules or backend-nestjs/node_modules
function resolveModule(name) {
  try {
    return require(name);
  } catch {
    const fallback = path.join(__dirname, '..', 'backend-nestjs', 'node_modules', name);
    return require(fallback);
  }
}

const { Client } = resolveModule('pg');
const bcrypt = resolveModule('bcryptjs');

const ADMIN_PASSWORD_PLAIN = 'Admin@CodeSkill2026!';
const STUDENT_PASSWORD_PLAIN = 'Student@CodeSkill2026!';

const targetEntities = [
  {
    key: 'iqac',
    label: 'IQAC',
    dept: 'Internal Quality Assurance Cell',
    adminUid: 'ADM-IQAC',
    studentUid: 'STU-IQAC',
  },
  {
    key: 'vcoffice',
    label: 'VC office',
    dept: 'Vice Chancellor Office',
    adminUid: 'ADM-VCOFFICE',
    studentUid: 'STU-VCOFFICE',
  },
  {
    key: 'pvc_dsa',
    label: 'PVC_DSA',
    dept: 'Department of Student Affairs',
    adminUid: 'ADM-PVCDSA',
    studentUid: 'STU-PVCDSA',
  },
  {
    key: 'ed_eng',
    label: 'ED_Eng',
    dept: 'Engineering & Technology',
    adminUid: 'ADM-EDENG',
    studentUid: 'STU-EDENG',
  },
  {
    key: 'ed_ait',
    label: 'ED_Ait',
    dept: 'Apex Institute of Technology',
    adminUid: 'ADM-EDAIT',
    studentUid: 'STU-EDAIT',
  },
  {
    key: 'vc_hr',
    label: 'VC_HR',
    dept: 'Human Resources',
    adminUid: 'ADM-VCHR',
    studentUid: 'STU-VCHR',
  },
  {
    key: 'cu_admin',
    label: 'CU-Admin',
    dept: 'University Administration',
    adminUid: 'ADM-CU',
    studentUid: 'STU-CU',
  },
];

async function createNamedAccounts() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres:password123@127.0.0.1:5432/codeskill';

  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  console.log('Connected to PostgreSQL successfully.\n');

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD_PLAIN, 10);
  const studentHash = await bcrypt.hash(STUDENT_PASSWORD_PLAIN, 10);

  const results = [];

  for (const item of targetEntities) {
    // 1. Admin Account
    const adminEmail = `${item.key}.admin@cuchd.in`;
    const adminUsername = `admin_${item.key}`;
    const adminName = `${item.label} Admin`;

    const adminQuery = `
      INSERT INTO "users" (
        "name", "username", "email", "password", "role", "uid",
        "isAdmin", "isActive", "authProvider", "forcePasswordChange",
        "isAssessmentStudent", "mfaEnabled", "tokenVersion",
        "studentProfile", "profile", "stats", "avatar", "bio"
      )
      VALUES ($1, $2, $3, $4, 'admin', $5, true, true, 'local', false, false, false, 0, '{}', '{}', '{}', '', '')
      ON CONFLICT ("email") DO UPDATE SET
        "name" = EXCLUDED."name",
        "username" = EXCLUDED."username",
        "password" = EXCLUDED."password",
        "role" = 'admin',
        "uid" = EXCLUDED."uid",
        "isAdmin" = true,
        "isActive" = true,
        "forcePasswordChange" = false,
        "tokenVersion" = "users"."tokenVersion" + 1
      RETURNING "id", "name", "username", "email", "role", "uid";
    `;

    const adminRes = await client.query(adminQuery, [
      adminName,
      adminUsername,
      adminEmail,
      adminHash,
      item.adminUid,
    ]);

    results.push({
      entity: item.label,
      role: 'Admin',
      name: adminName,
      username: adminUsername,
      email: adminEmail,
      uid: item.adminUid,
      password: ADMIN_PASSWORD_PLAIN,
    });

    // 2. Student Account
    const studentEmail = `${item.key}.student@cuchd.in`;
    const studentUsername = `student_${item.key}`;
    const studentName = `${item.label} Student`;
    const studentProfile = {
      university: 'Chandigarh University',
      department: item.dept,
      course: 'B.Tech Computer Science & Engineering',
      semester: 4,
      section: 'Section A',
      year: 2026,
      batch: '2026',
    };

    const studentQuery = `
      INSERT INTO "users" (
        "name", "username", "email", "password", "role", "uid",
        "isAdmin", "isActive", "authProvider", "forcePasswordChange",
        "isAssessmentStudent", "mfaEnabled", "tokenVersion",
        "studentProfile", "profile", "stats", "avatar", "bio"
      )
      VALUES ($1, $2, $3, $4, 'student', $5, false, true, 'local', false, false, false, 0, $6, '{}', '{}', '', '')
      ON CONFLICT ("email") DO UPDATE SET
        "name" = EXCLUDED."name",
        "username" = EXCLUDED."username",
        "password" = EXCLUDED."password",
        "role" = 'student',
        "uid" = EXCLUDED."uid",
        "isAdmin" = false,
        "isActive" = true,
        "forcePasswordChange" = false,
        "studentProfile" = EXCLUDED."studentProfile",
        "tokenVersion" = "users"."tokenVersion" + 1
      RETURNING "id", "name", "username", "email", "role", "uid";
    `;

    const studentRes = await client.query(studentQuery, [
      studentName,
      studentUsername,
      studentEmail,
      studentHash,
      item.studentUid,
      JSON.stringify(studentProfile),
    ]);

    results.push({
      entity: item.label,
      role: 'Student',
      name: studentName,
      username: studentUsername,
      email: studentEmail,
      uid: item.studentUid,
      password: STUDENT_PASSWORD_PLAIN,
    });
  }

  await client.end();

  console.log('Successfully provisioned 14 accounts (7 Admin + 7 Student):\n');
  console.table(
    results.map((r) => ({
      Entity: r.entity,
      Role: r.role,
      Username: r.username,
      Email: r.email,
      UID: r.uid,
      Password: r.password,
    }))
  );
}

createNamedAccounts().catch((err) => {
  console.error('Error creating named accounts:', err.message);
  process.exit(1);
});
