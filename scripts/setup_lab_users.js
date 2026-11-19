const path = require('node:path');
const backendDir = path.join(__dirname, '..', 'backend-nestjs');
const { Client } = require(path.join(backendDir, 'node_modules', 'pg'));
const bcrypt = require(path.join(backendDir, 'node_modules', 'bcryptjs'));

async function setup() {
  const client = new Client({
    connectionString: 'postgres://postgres:password123@127.0.0.1:5432/codeskill',
    ssl: false,
  });

  await client.connect();

  // 1. Get Section and Subgroup
  const secRes = await client.query(`SELECT id FROM lab_sections WHERE code = '24-BDVT-701' LIMIT 1`);
  if (!secRes.rows.length) {
    throw new Error('Section 24-BDVT-701 not found. Run seed-labs-demo.ts first.');
  }
  const sectionId = secRes.rows[0].id;

  const subRes = await client.query(`SELECT id FROM lab_subgroups WHERE lab_section_id = $1 LIMIT 1`, [sectionId]);
  const subgroupId = subRes.rows[0]?.id || null;

  const labRes = await client.query(`SELECT id FROM labs WHERE slug = 'dsa-lab' LIMIT 1`);
  if (!labRes.rows.length) {
    throw new Error('Lab dsa-lab not found.');
  }
  const labId = labRes.rows[0].id;

  // 2. Create or Update Teacher Account
  const teacherPassword = 'TeacherPassword123!';
  const teacherHash = await bcrypt.hash(teacherPassword, 10);
  const teacherQuery = `
    INSERT INTO "users" (
      "name", "username", "email", "password", "role", "uid",
      "isAdmin", "isActive", "authProvider", "forcePasswordChange",
      "isAssessmentStudent", "mfaEnabled", "tokenVersion",
      "studentProfile", "profile", "stats", "avatar", "bio"
    )
    VALUES ($1, $2, $3, $4, 'teacher', $5, false, true, 'local', false, false, false, 0, '{}', '{}', '{}', '', '')
    ON CONFLICT ("email") DO UPDATE SET
      "role" = 'teacher',
      "password" = EXCLUDED."password",
      "isActive" = true,
      "forcePasswordChange" = false
    RETURNING "id", "email", "role";
  `;
  const teacherRes = await client.query(teacherQuery, [
    'Local Teacher',
    'teacher_local',
    'teacher@codeskill.local',
    teacherHash,
    'TEA-LOCAL-01',
  ]);
  const teacherId = teacherRes.rows[0].id;
  console.log('Teacher account ready:', teacherRes.rows[0]);

  // 3. Assign Teacher to Section and Lab
  await client.query(`
    INSERT INTO lab_teacher_assignments (lab_section_id, lab_id, teacher_id, role)
    VALUES ($1, $2, $3, 'instructor')
    ON CONFLICT (lab_section_id, lab_id, teacher_id) DO NOTHING
  `, [sectionId, labId, teacherId]);
  console.log('Teacher assigned to lab and section.');

  // 4. Enroll Student into Section
  const studentRes = await client.query(`SELECT id FROM "users" WHERE email = 'student@codeskill.local' LIMIT 1`);
  if (studentRes.rows.length) {
    const studentId = studentRes.rows[0].id;
    await client.query(`
      INSERT INTO lab_section_enrollments (lab_section_id, lab_subgroup_id, student_id, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (lab_section_id, student_id) DO UPDATE SET
        status = 'active',
        lab_subgroup_id = EXCLUDED.lab_subgroup_id
    `, [sectionId, subgroupId, studentId]);
    console.log('Enrolled student@codeskill.local into section 24-BDVT-701.');
  }

  await client.end();
}

setup().catch((err) => {
  console.error('Error in setup:', err);
  process.exit(1);
});
