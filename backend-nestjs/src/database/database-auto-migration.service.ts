import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { applyAuthTokensSchemaMigration } from './migrations/auth-tokens-schema';
import { applyPracticeSubmissionSourceMigration } from './migrations/practice-submission-source';
import { applyAssessmentProctoringModesMigration } from './migrations/assessment-proctoring-modes';
import { applyAssessmentProctorCapturesMigration } from './migrations/assessment-proctor-captures';
import { applyAssessmentResumeLimitMigration } from './migrations/assessment-resume-limit';
import { applyAssessmentAudienceTargetingMigration } from './migrations/assessment-audience-targeting';
import { applyProblemConfigDefaultLanguageMigration } from './migrations/problem-config-default-language';
import { applyBugReportsMigration } from './migrations/bug-reports';
import { applyContestSecurityReattemptMigration } from './migrations/contest-security-reattempt';
import { applyAnalyticsOptimizationIndexesMigration } from './migrations/analytics-optimization-indexes';
import { applyLearningModuleMigration } from './migrations/learning-module';
import { applyExamSchedulingSchemaMigration } from './migrations/exam-scheduling-schema';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class DatabaseAutoMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseAutoMigrationService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onApplicationBootstrap() {
    if (process.env.DISABLE_AUTO_MIGRATION === 'true') {
      this.logger.log('⏭️ Auto-migration skipped (DISABLE_AUTO_MIGRATION=true)');
      return;
    }

    try {
      this.logger.log('🚀 Running automatic database schema migrations on server startup...');
      await this.runAllMigrations();
      this.logger.log('🌱 Running automatic baseline seeding on server startup...');
      await this.runAutoSeeding();
      this.logger.log('✅ Server auto-migration and baseline seeding completed successfully.');
    } catch (err: any) {
      this.logger.error(
        `❌ Auto-migration / seeding encountered an error: ${err?.message}`,
        err?.stack,
      );
    }
  }

  /**
   * Sequentially executes all idempotent schema migrations
   */
  async runAllMigrations(): Promise<void> {
    if (!this.dataSource.isInitialized) {
      this.logger.warn('DataSource not initialized; initializing connection for migrations...');
      await this.dataSource.initialize();
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // 1. Extensions
      await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
      await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

      // 2. Auth tokens schema
      await this.executeStep('auth-tokens-schema', () =>
        applyAuthTokensSchemaMigration(queryRunner),
      );

      // 3. Practice submission source tracking
      await this.executeStep('practice-submission-source', () =>
        applyPracticeSubmissionSourceMigration(queryRunner),
      );

      // 4. Assessment proctoring modes & policies
      await this.executeStep('assessment-proctoring-modes', () =>
        applyAssessmentProctoringModesMigration(queryRunner),
      );

      // 5. Assessment proctor captures
      await this.executeStep('assessment-proctor-captures', () =>
        applyAssessmentProctorCapturesMigration(queryRunner),
      );

      // 6. Assessment resume limit
      await this.executeStep('assessment-resume-limit', () =>
        applyAssessmentResumeLimitMigration(queryRunner),
      );

      // 7. Assessment audience targeting
      await this.executeStep('assessment-audience-targeting', () =>
        applyAssessmentAudienceTargetingMigration(queryRunner),
      );

      // 8. Problem config default language
      await this.executeStep('problem-config-default-language', () =>
        applyProblemConfigDefaultLanguageMigration(queryRunner),
      );

      // 9. Bug reports & activities schema
      await this.executeStep('bug-reports', () =>
        applyBugReportsMigration(queryRunner),
      );

      // 10. Contest security & reattempt grants
      await this.executeStep('contest-security-reattempt', () =>
        applyContestSecurityReattemptMigration(queryRunner),
      );

      // 11. Analytics query optimization indexes
      await this.executeStep('analytics-optimization-indexes', () =>
        applyAnalyticsOptimizationIndexesMigration(queryRunner),
      );

      // 12. Learning module & certification schema
      await this.executeStep('learning-module', () =>
        applyLearningModuleMigration(queryRunner),
      );

      // 13. Auxiliary columns for curriculum progress timing
      await this.executeStep('learning-progress-timing-columns', async () => {
        await queryRunner.query(`
          ALTER TABLE "course_modules" ADD COLUMN IF NOT EXISTS "requiredTimeMinutes" integer NOT NULL DEFAULT 2;
          ALTER TABLE "course_modules" ADD COLUMN IF NOT EXISTS "requiredTimeSeconds" integer NOT NULL DEFAULT 30;
          ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "timeSpentSeconds" integer NOT NULL DEFAULT 0;
        `);
      });

      // 14. Exam scheduling, student eligibility & batch management schema
      await this.executeStep('exam-scheduling-schema', () =>
        applyExamSchedulingSchemaMigration(queryRunner),
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Runs baseline server data seeding:
   * 1. Default super-administrator bootstrap
   * 2. Default Chandigarh University certificate templates
   */
  async runAutoSeeding(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // 1. Seed Super Administrator if none exists
      await this.seedSuperAdminIfNotExist(queryRunner);

      // 2. Seed Default Academic Certificate Templates
      await this.seedCertificateTemplatesIfNotExist(queryRunner);

      // 3. Seed Default Baseline Exam Schedule & Test Data Entry
      await this.seedExamScheduleIfNotExist(queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  private async seedSuperAdminIfNotExist(queryRunner: any): Promise<void> {
    try {
      const existingAdmins = await queryRunner.query(
        `SELECT id, email, role FROM "users" WHERE "role" IN ('super_admin', 'admin') LIMIT 1;`,
      );

      if (existingAdmins && existingAdmins.length > 0) {
        this.logger.log(`✓ Admin user exists (${existingAdmins[0].email}) — skipping admin seed.`);
        return;
      }

      const email = (
        process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@codeskill.ac.in'
      ).trim().toLowerCase();
      const rawPassword =
        process.env.ADMIN_BOOTSTRAP_PASSWORD || 'Admin@CodeSkill2026!';
      const name =
        process.env.ADMIN_BOOTSTRAP_NAME || 'Super Administrator';

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(rawPassword, salt);

      // Check if user already exists with that email
      const existingUser = await queryRunner.query(
        `SELECT id FROM "users" WHERE "email" = $1;`,
        [email],
      );

      if (existingUser && existingUser.length > 0) {
        await queryRunner.query(
          `UPDATE "users" 
           SET "role" = 'super_admin', "isAdmin" = true, "password" = $1, "updatedAt" = now()
           WHERE "id" = $2;`,
          [hashedPassword, existingUser[0].id],
        );
        this.logger.log(`✓ Upgraded existing user ${email} to super_admin.`);
      } else {
        await queryRunner.query(
          `INSERT INTO "users" (
            "id", "name", "email", "password", "role", "isAdmin", "isActive", "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, 'super_admin', true, true, now(), now()
          );`,
          [name, email, hashedPassword],
        );
        this.logger.log(
          `✨ Created initial Super Administrator account: ${email} (Password: ${rawPassword})`,
        );
      }
    } catch (err: any) {
      this.logger.warn(`Admin auto-seeding check: ${err?.message}`);
    }
  }

  private async seedCertificateTemplatesIfNotExist(queryRunner: any): Promise<void> {
    try {
      const existing = await queryRunner.query(
        `SELECT id, code FROM "certificate_templates" WHERE "code" = 'CHANDIGARH_UNIVERSITY_DEFAULT' LIMIT 1;`,
      );

      if (existing && existing.length > 0) {
        return;
      }

      await queryRunner.query(
        `INSERT INTO "certificate_templates" (
          "id", "code", "title", "institution", "department", "accreditation",
          "signatories", "layoutConfig", "isActive", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(),
          'CHANDIGARH_UNIVERSITY_DEFAULT',
          'Chandigarh University Official Certificate of Completion',
          'Chandigarh University',
          'Department of Computer Science & Engineering',
          'NAAC Grade A+ Accredited University · UGC Recognized',
          $1::jsonb,
          $2::jsonb,
          true,
          now(),
          now()
        );`,
        [
          JSON.stringify([
            {
              name: 'Mr. Pradeep Rana',
              title: 'SECRETARY',
            },
            {
              name: 'Mrs. Radha',
              title: 'FACULTY ADVISOR',
            },
          ]),
          JSON.stringify({
            orientation: 'landscape',
            accentColor: '#d91b24',
            theme: 'modern_geometric',
            showWatermark: true,
          }),
        ],
      );

      this.logger.log('✨ Seeded default Chandigarh University Certificate template.');
    } catch (err: any) {
      this.logger.warn(`Certificate template seed check: ${err?.message}`);
    }
  }

  private async seedExamScheduleIfNotExist(queryRunner: any): Promise<void> {
    try {
      const existing = await queryRunner.query(
        `SELECT id FROM "exam_schedules" LIMIT 1;`,
      );
      if (existing && existing.length > 0) {
        this.logger.log('✓ Exam schedule already exists — skipping baseline exam schedule seed.');
        return;
      }

      const assessments = await queryRunner.query(
        `SELECT id, title, code FROM "assessments" ORDER BY "createdAt" DESC LIMIT 1;`,
      );
      if (!assessments || assessments.length === 0) {
        this.logger.log('No assessments available for exam schedule seed — skipping.');
        return;
      }

      const assessment = assessments[0];
      const adminUsers = await queryRunner.query(
        `SELECT id, email FROM "users" WHERE "role" IN ('super_admin', 'admin') LIMIT 1;`,
      );
      const adminId = adminUsers[0]?.id || null;
      const adminEmail = adminUsers[0]?.email || 'admin@codeskill.ac.in';

      // 1. Insert schedule with Academic Session 2025-2026, Semester 5, Academic Year 3, Program B.E. Computer Science & Engineering
      const schedResult = await queryRunner.query(
        `INSERT INTO "exam_schedules" (
          "assessment_id", "title", "code", "description",
          "academicSession", "semester", "program", "academicYear",
          "status", "timezone", "maxConcurrentSessions", "config", "created_by_id"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) RETURNING id;`,
        [
          assessment.id,
          'Semester 5 Mid-Term DSA Examination',
          'CSE-MID-2025',
          'Predefined baseline mid-semester examination for Semester 5 B.E. Computer Science & Engineering.',
          '2025-2026',
          5,
          'B.E. Computer Science & Engineering',
          3,
          'published',
          'Asia/Kolkata',
          500,
          JSON.stringify({
            earlyAccessMinutes: 10,
            lateStartAllowanceMinutes: 15,
            gracePeriodMinutes: 5,
            maxDurationMinutes: 60,
            allowedAttempts: 1,
            allowResume: true,
            allowDisconnectionReentry: true,
            strictTimeBoundary: true,
          }),
          adminId,
        ],
      );
      const scheduleId = schedResult[0].id;

      // 2. Insert 2 slots
      const today = new Date().toISOString().split('T')[0];
      const slot1Res = await queryRunner.query(
        `INSERT INTO "exam_slots" (
          "schedule_id", "name", "slotCode", "date", "startTime", "endTime", "capacity", "assignedCount", "status", "roomOrLab"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        ) RETURNING id;`,
        [
          scheduleId,
          'Slot 1 - Morning Batch (09:00 - 10:30)',
          'SLOT-01-AM',
          today,
          new Date(`${today}T09:00:00+05:30`),
          new Date(`${today}T10:30:00+05:30`),
          300,
          3,
          'scheduled',
          'Lab 1-A / Online',
        ],
      );
      const slot1Id = slot1Res[0].id;

      const slot2Res = await queryRunner.query(
        `INSERT INTO "exam_slots" (
          "schedule_id", "name", "slotCode", "date", "startTime", "endTime", "capacity", "assignedCount", "status", "roomOrLab"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        ) RETURNING id;`,
        [
          scheduleId,
          'Slot 2 - Afternoon Batch (11:00 - 12:30)',
          'SLOT-02-PM',
          today,
          new Date(`${today}T11:00:00+05:30`),
          new Date(`${today}T12:30:00+05:30`),
          300,
          2,
          'scheduled',
          'Lab 2-B / Online',
        ],
      );
      const slot2Id = slot2Res[0].id;

      // 3. Assign students
      const students = await queryRunner.query(
        `SELECT id, email, uid, name FROM "users" WHERE "role" = 'student' LIMIT 5;`,
      );

      for (let i = 0; i < students.length; i++) {
        const stu = students[i];
        const slotId = i < 3 ? slot1Id : slot2Id;
        const slotStart = i < 3 ? `${today}T09:00:00+05:30` : `${today}T11:00:00+05:30`;
        const slotEnd = i < 3 ? `${today}T10:30:00+05:30` : `${today}T12:30:00+05:30`;

        await queryRunner.query(
          `INSERT INTO "exam_eligibility_assignments" (
            "schedule_id", "slot_id", "assessment_id", "student_id",
            "studentUid", "studentEmail", "studentName", "academicSnapshot",
            "status", "assignmentSource", "accessWindowStart", "accessWindowEnd"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
          ) ON CONFLICT DO NOTHING;`,
          [
            scheduleId,
            slotId,
            assessment.id,
            stu.id,
            stu.uid || `STU${i + 1}`,
            stu.email,
            stu.name || `Student ${i + 1}`,
            JSON.stringify({
              department: 'B.E. Computer Science & Engineering',
              semester: 5,
              year: 3,
              batch: '2025-2026',
            }),
            'assigned',
            'manual',
            new Date(slotStart),
            new Date(slotEnd),
          ],
        );
      }

      // 4. Audit log
      await queryRunner.query(
        `INSERT INTO "exam_access_audit_logs" (
          "schedule_id", "actor_id", "actor_email", "actor_role", "action", "reason"
        ) VALUES ($1, $2, $3, $4, $5, $6);`,
        [
          scheduleId,
          adminId,
          adminEmail,
          'admin',
          'SCHEDULE_PUBLISHED',
          'Baseline test exam schedule created and published',
        ],
      );

      this.logger.log('🎉 Seeded baseline test Exam Schedule: CSE-MID-2025 with 2 slots and assigned students.');
    } catch (err: any) {
      this.logger.warn(`Exam schedule baseline seed check: ${err?.message}`);
    }
  }

  private async executeStep(name: string, fn: () => Promise<unknown>): Promise<void> {
    const start = Date.now();
    try {
      await fn();
      const elapsed = Date.now() - start;
      this.logger.log(`✓ Migration [${name}] applied in ${elapsed}ms`);
    } catch (err: any) {
      this.logger.warn(
        `⚠️ Migration [${name}] check finished with note: ${err?.message}`,
      );
    }
  }
}
