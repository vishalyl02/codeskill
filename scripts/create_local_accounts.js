const path = require('node:path');
const backendDir = path.join(__dirname, '..', 'backend-nestjs');
const { Client } = require(path.join(backendDir, 'node_modules', 'pg'));
const bcrypt = require(path.join(backendDir, 'node_modules', 'bcryptjs'));

async function createAccounts() {
  const client = new Client({
    connectionString: 'postgres://postgres:password123@127.0.0.1:5432/codeskill',
    ssl: false,
  });

  await client.connect();

  const accounts = [
    {
      name: 'Local Admin',
      email: 'admin@codeskill.local',
      username: 'admin_local',
      uid: 'ADM-LOCAL-01',
      passwordPlain: 'AdminPassword123!',
      role: 'admin',
      isAdmin: true,
      isAssessmentStudent: false,
      studentProfile: {},
    },
    {
      name: 'Local Student',
      email: 'student@codeskill.local',
      username: 'student_local',
      uid: 'STU-LOCAL-01',
      passwordPlain: 'StudentPassword123!',
      role: 'student',
      isAdmin: false,
      isAssessmentStudent: false,
      studentProfile: {
        university: 'Chandigarh University',
        department: 'Computer Science and Engineering',
        course: 'BE CSE',
        year: 2026,
        batch: '2026',
      },
    },
  ];

  for (const acc of accounts) {
    const hash = await bcrypt.hash(acc.passwordPlain, 10);

    // Upsert into users
    const query = `
      INSERT INTO "users" (
        "name", "username", "email", "password", "role", "uid",
        "isAdmin", "isActive", "authProvider", "forcePasswordChange",
        "isAssessmentStudent", "mfaEnabled", "tokenVersion",
        "studentProfile", "profile", "stats", "avatar", "bio"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'local', false, $8, false, 0, $9, '{}', '{}', '', '')
      ON CONFLICT ("email") DO UPDATE SET
        "name" = EXCLUDED."name",
        "username" = EXCLUDED."username",
        "password" = EXCLUDED."password",
        "role" = EXCLUDED."role",
        "uid" = EXCLUDED."uid",
        "isAdmin" = EXCLUDED."isAdmin",
        "isActive" = true,
        "forcePasswordChange" = false,
        "isAssessmentStudent" = EXCLUDED."isAssessmentStudent",
        "studentProfile" = EXCLUDED."studentProfile",
        "tokenVersion" = "users"."tokenVersion" + 1
      RETURNING "id", "name", "email", "role", "uid", "isAdmin";
    `;

    const res = await client.query(query, [
      acc.name,
      acc.username,
      acc.email,
      hash,
      acc.role,
      acc.uid,
      acc.isAdmin,
      acc.isAssessmentStudent,
      JSON.stringify(acc.studentProfile),
    ]);

    console.log(`Configured ${acc.role} account:`, res.rows[0]);
  }

  await client.end();
}

createAccounts().catch((err) => {
  console.error('Error creating accounts:', err);
  process.exit(1);
});
