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
import { applyQuestionHideMainMethodMigration } from './migrations/question-hide-main-method';
import { applyFacultyAssignmentsMigration } from './migrations/faculty-assignments';
import { applyAssessmentInProgressUniqueIndexMigration } from './migrations/assessment-in-progress-unique-index';
import { applyAssessmentVdiOverrideMigration } from './migrations/assessment-vdi-override';
import { applyAssessmentLockdownEnforcementMigration } from './migrations/assessment-lockdown-enforcement';
import { applyAssessmentDockToolsMigration } from './migrations/assessment-dock-tools';
import { applyAssessmentEnterpriseHardeningMigration } from './migrations/assessment-enterprise-hardening';
import { applyExamSecurityCompositeIndexesMigration } from './migrations/exam-security-composite-indexes';
import { applyAssessmentForensicWatermarkMigration } from './migrations/assessment-forensic-watermark';
import { applyCandidateExamAccommodationsMigration } from './migrations/candidate-exam-accommodations';
import { applyContestSubmissionScopeMigration } from './migrations/contest-submission-scope';
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

      // 14. Question hide main method column
      await this.executeStep('question-hide-main-method', () =>
        applyQuestionHideMainMethodMigration(queryRunner),
      );

      // 15. Faculty assignments and attempt review schema
      await this.executeStep('faculty-assignments', () =>
        applyFacultyAssignmentsMigration(queryRunner),
      );

      // 16. Assessment in_progress unique index (AUD-CON-008)
      await this.executeStep('assessment-in-progress-unique-index', () =>
        applyAssessmentInProgressUniqueIndexMigration(queryRunner),
      );

      // 17. Assessment allowVirtualMachine VDI override column
      await this.executeStep('assessment-vdi-override', () =>
        applyAssessmentVdiOverrideMigration(queryRunner),
      );

      // 18. Assessment requireLockdown column
      await this.executeStep('assessment-lockdown-enforcement', () =>
        applyAssessmentLockdownEnforcementMigration(queryRunner),
      );

      // 19. Assessment lockdown dock tools (quit password, calculators, reference PDF)
      await this.executeStep('assessment-dock-tools', () =>
        applyAssessmentDockToolsMigration(queryRunner),
      );

      // 20. Assessment enterprise hardening (close other apps, spellcheck, find on page, url patterns, screen capture)
      await this.executeStep('assessment-enterprise-hardening', () =>
        applyAssessmentEnterpriseHardeningMigration(queryRunner),
      );

      // 21. Exam security composite indexes
      await this.executeStep('exam-security-composite-indexes', () =>
        applyExamSecurityCompositeIndexesMigration(queryRunner),
      );

      // 22. Assessment forensic screen watermark
      await this.executeStep('assessment-forensic-watermark', () =>
        applyAssessmentForensicWatermarkMigration(queryRunner),
      );

      // 23. Candidate exam accommodations table
      await this.executeStep('candidate-exam-accommodations', () =>
        applyCandidateExamAccommodationsMigration(queryRunner),
      );

      // 24. Contest submission attempt scope column (contestAttemptId)
      await this.executeStep('contest-submission-scope', () =>
        applyContestSubmissionScopeMigration(queryRunner),
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
        `SELECT id, name FROM "certificate_templates" WHERE "name" = 'CHANDIGARH_UNIVERSITY_DEFAULT' OR "isDefault" = true LIMIT 1;`,
      );

      if (existing && existing.length > 0) {
        return;
      }

      await queryRunner.query(
        `INSERT INTO "certificate_templates" (
          "id", "name", "title", "issuerTitle", "issuerName", "issuerOrganization",
          "logoUrl", "signatureUrl", "badgeUrl", "isDefault", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(),
          'CHANDIGARH_UNIVERSITY_DEFAULT',
          'Chandigarh University Official Certificate of Completion',
          'Vice-Chancellor',
          'Prof. (Dr.) Satbir Singh Sehgal',
          'Chandigarh University · Department of Computer Science & Engineering',
          '/cu-logo-tight.png',
          '/satbir-singh-sehgal.png',
          '/cu-emblem.png',
          true,
          now(),
          now()
        );`,
      );

      this.logger.log('✨ Seeded default Chandigarh University Certificate template.');
    } catch (err: any) {
      this.logger.warn(`Certificate template seed check: ${err?.message}`);
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
