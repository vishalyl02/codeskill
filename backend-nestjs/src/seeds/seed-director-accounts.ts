import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User as UserEntity } from '../database/entities/user.entity';
import { hashPassword } from '../auth/password.util';

const ADMIN_PASSWORD_PLAIN = 'Admin@CodeSkill2026!';
const STUDENT_PASSWORD_PLAIN = 'Student@CodeSkill2026!';

interface AccountSeedDefinition {
  name: string;
  username: string;
  email: string;
  uid: string;
  role: string;
  isAdmin: boolean;
  isActive: boolean;
  isAssessmentStudent: boolean;
  rawPassword: string;
  profile: Record<string, any>;
  studentProfile: Record<string, any>;
}

const DIRECTOR_ACCOUNTS: AccountSeedDefinition[] = [
  {
    name: 'Director Admin',
    username: 'director.admin',
    email: 'director.admin@cuchd.in',
    uid: 'ADM-DIRECTOR',
    role: 'admin',
    isAdmin: true,
    isActive: true,
    isAssessmentStudent: false,
    rawPassword: ADMIN_PASSWORD_PLAIN,
    profile: {
      institution: 'Chandigarh University',
      department: 'Director Office',
      role: 'admin',
    },
    studentProfile: {},
  },
  {
    name: 'Director Student 1',
    username: 'director.student1',
    email: 'director.student1@cuchd.in',
    uid: 'STU-DIR01',
    role: 'student',
    isAdmin: false,
    isActive: true,
    isAssessmentStudent: true,
    rawPassword: STUDENT_PASSWORD_PLAIN,
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
    name: 'Director Student 2',
    username: 'director.student2',
    email: 'director.student2@cuchd.in',
    uid: 'STU-DIR02',
    role: 'student',
    isAdmin: false,
    isActive: true,
    isAssessmentStudent: true,
    rawPassword: STUDENT_PASSWORD_PLAIN,
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

async function seedDirectorAccounts() {
  console.log('--- Initializing Director Accounts Provisioning ---');
  const app = await NestFactory.createApplicationContext(AppModule);
  const userRepository = app.get(getRepositoryToken(UserEntity));

  for (const acc of DIRECTOR_ACCOUNTS) {
    try {
      let user = await userRepository.findOne({
        where: [{ email: acc.email.toLowerCase() }, { username: acc.username }, { uid: acc.uid }],
      });

      const hashedPassword = await hashPassword(acc.rawPassword);

      if (user) {
        user.name = acc.name;
        user.username = acc.username;
        user.email = acc.email.toLowerCase();
        user.uid = acc.uid;
        user.role = acc.role;
        user.isAdmin = acc.isAdmin;
        user.isActive = acc.isActive;
        user.isAssessmentStudent = acc.isAssessmentStudent;
        user.password = hashedPassword;
        user.forcePasswordChange = false;
        user.profile = { ...(user.profile || {}), ...acc.profile };
        user.studentProfile = acc.studentProfile;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await userRepository.save(user);
        console.log(`[UPDATED] User ${acc.name} (${user.email}) -> Role: ${user.role}, UID: ${user.uid}`);
      } else {
        user = userRepository.create({
          name: acc.name,
          username: acc.username,
          email: acc.email.toLowerCase(),
          uid: acc.uid,
          password: hashedPassword,
          role: acc.role,
          isAdmin: acc.isAdmin,
          isActive: acc.isActive,
          isAssessmentStudent: acc.isAssessmentStudent,
          forcePasswordChange: false,
          authProvider: 'local',
          stats: {},
          profile: acc.profile,
          studentProfile: acc.studentProfile,
          tokenVersion: 0,
        });
        await userRepository.save(user);
        console.log(`[CREATED] User ${acc.name} (${acc.email}) -> Role: ${acc.role}, UID: ${acc.uid}`);
      }
    } catch (err: any) {
      console.error(`[ERROR] Failed to process ${acc.name}:`, err.message);
    }
  }

  await app.close();
  console.log('--- Director Accounts Provisioning Completed Successfully ---');
  process.exit(0);
}

seedDirectorAccounts().catch((err) => {
  console.error('Fatal error during director accounts seed:', err);
  process.exit(1);
});
