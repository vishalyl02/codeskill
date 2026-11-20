const path = require('node:path');
const fs = require('node:fs');

function resolveModule(name) {
  try {
    return require(name);
  } catch {
    const fallback = path.join(__dirname, '..', 'backend-nestjs', 'node_modules', name);
    return require(fallback);
  }
}

// Load .env from backend-nestjs if not in process.env
const backendEnvPath = path.join(__dirname, '..', 'backend-nestjs', '.env');
if (fs.existsSync(backendEnvPath)) {
  try {
    const dotenv = resolveModule('dotenv');
    dotenv.config({ path: backendEnvPath });
  } catch {
    // Manually parse basic KEY=VAL lines if dotenv is missing
    const content = fs.readFileSync(backendEnvPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val.replace(/^["']|["']$/g, '');
        }
      }
    }
  }
}

const { Client } = resolveModule('pg');
const bcrypt = resolveModule('bcryptjs');

const ADMIN_PASSWORD_PLAIN = 'Admin@CodeSkill2026!';
const STUDENT_PASSWORD_PLAIN = 'Student@CodeSkill2026!';

const ACCOUNTS = [
  {
    role: 'admin',
    name: 'Director Admin',
    username: 'director.admin',
    email: 'director.admin@cuchd.in',
    uid: 'ADM-DIRECTOR',
    password: ADMIN_PASSWORD_PLAIN,
    isAdmin: true,
    isActive: true,
    isAssessmentStudent: false,
    profile: {
      institution: 'Chandigarh University',
      department: 'Director Office',
      role: 'admin',
    },
    studentProfile: {},
  },
  {
    role: 'student',
    name: 'Director Student 1',
    username: 'director.student1',
    email: 'director.student1@cuchd.in',
    uid: 'STU-DIR01',
    password: STUDENT_PASSWORD_PLAIN,
    isAdmin: false,
    isActive: true,
    isAssessmentStudent: true,
    profile: {
      institution: 'Chandigarh University',
      role: 'student',
    },
    studentProfile: {
      university: 'Chandigarh University',
      department: 'Director Office',
      course: 'B.Tech Computer Science & Engineering',
      semester: 4,
      section: 'Section A',
      year: 2026,
      batch: '2026',
    },
  },
  {
    role: 'student',
    name: 'Director Student 2',
    username: 'director.student2',
    email: 'director.student2@cuchd.in',
    uid: 'STU-DIR02',
    password: STUDENT_PASSWORD_PLAIN,
    isAdmin: false,
    isActive: true,
    isAssessmentStudent: true,
    profile: {
      institution: 'Chandigarh University',
      role: 'student',
    },
    studentProfile: {
      university: 'Chandigarh University',
      department: 'Director Office',
      course: 'B.Tech Computer Science & Engineering',
      semester: 4,
      section: 'Section B',
      year: 2026,
      batch: '2026',
    },
  },
];

async function createDirectorAccounts() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres:password123@127.0.0.1:5432/codeskill';

  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  console.log(`Connecting to PostgreSQL (${connectionString.replace(/:[^:@]*@/, ':****@')})...`);
  await client.connect();
  console.log('Connected to PostgreSQL successfully.\n');

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD_PLAIN, 10);
  const studentHash = await bcrypt.hash(STUDENT_PASSWORD_PLAIN, 10);

  const results = [];

  for (const acc of ACCOUNTS) {
    const passwordHash = acc.role === 'admin' ? adminHash : studentHash;

    const query = `
      INSERT INTO "users" (
        "name", "username", "email", "password", "role", "uid",
        "isAdmin", "isActive", "authProvider", "forcePasswordChange",
        "isAssessmentStudent", "mfaEnabled", "tokenVersion",
        "studentProfile", "profile", "stats", "avatar", "bio"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'local', false, $9, false, 0, $10, $11, '{}', '', '')
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
        "tokenVersion" = "users"."tokenVersion" + 1
      RETURNING "id", "name", "username", "email", "role", "uid", "isAdmin", "isAssessmentStudent";
    `;

    const res = await client.query(query, [
      acc.name,
      acc.username,
      acc.email,
      passwordHash,
      acc.role,
      acc.uid,
      acc.isAdmin,
      acc.isActive,
      acc.isAssessmentStudent,
      JSON.stringify(acc.studentProfile),
      JSON.stringify(acc.profile),
    ]);

    const row = res.rows[0];
    results.push({
      ID: row.id,
      Name: row.name,
      Username: row.username,
      Email: row.email,
      UID: row.uid,
      Role: row.role,
      IsAdmin: row.isAdmin,
      IsAssessmentStudent: row.isAssessmentStudent,
      Password: acc.password,
    });
  }

  await client.end();

  console.log('Successfully provisioned Director accounts:\n');
  console.table(
    results.map((r) => ({
      Name: r.Name,
      Role: r.Role,
      Username: r.Username,
      Email: r.Email,
      UID: r.UID,
      Password: r.Password,
    }))
  );
}

if (require.main === module) {
  createDirectorAccounts().catch((err) => {
    console.error('Error provisioning Director accounts:', err.message);
    process.exit(1);
  });
}

module.exports = { createDirectorAccounts, ACCOUNTS };
