import { parseSubmissionShardingConfig } from './sharding/sharding.config';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { User } from './entities/user.entity';
import { Problem } from './entities/problem.entity';
import { ProblemMetadata } from './entities/problem-metadata.entity';
import { ProblemStatement } from './entities/problem-statement.entity';
import { ProblemConfig } from './entities/problem-config.entity';
import { ProblemTestCase } from './entities/problem-testcase.entity';
import { Question } from './entities/question.entity';
import { QuestionBank } from './entities/question-bank.entity';
import { Assessment } from './entities/assessment.entity';
import { AssessmentAttempt } from './entities/assessment-attempt.entity';
import { Submission } from './entities/submission.entity';
import { Contest } from './entities/contest.entity';
import { ContestAttempt } from './entities/contest-attempt.entity';
import { ContestReattemptGrant } from './entities/contest-reattempt-grant.entity';
import { Company } from './entities/company.entity';
import { CompanyUser } from './entities/company-user.entity';
import { Job } from './entities/job.entity';
import { Application } from './entities/application.entity';
import { University } from './entities/university.entity';
import { UniversityUser } from './entities/university-user.entity';
import { Batch } from './entities/batch.entity';
import { StudentEnrollment } from './entities/student-enrollment.entity';
import { Discussion } from './entities/discussion.entity';
import { DiscussionReply } from './entities/discussion-reply.entity';
import { AuditLog } from './entities/audit-log.entity';
import { EmailJob } from './entities/email-job.entity';
import { ExamSession } from './entities/exam-session.entity';
import { ExamSecurityEvent } from './entities/exam-security-event.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { BugReport } from './entities/bug-report.entity';
import { BugImage } from './entities/bug-image.entity';
import { BugComment } from './entities/bug-comment.entity';
import { BugActivity } from './entities/bug-activity.entity';
import {
  LearningPath,
  LearningPathCourse,
  Course,
  CourseModule,
  Lesson,
  CourseExercise,
  LearningEnrollment,
  LessonProgress,
  CourseProgress,
  PathProgress,
  XPLedger,
  BadgeDefinition,
  StudentBadge,
  CertificateTemplate,
  Certificate,
  CertificateEvent,
} from '../learning/entities';

const entities = [
  User,
  RefreshToken,
  BugReport,
  BugImage,
  BugComment,
  BugActivity,
  Problem,
  ProblemMetadata,
  ProblemStatement,
  ProblemConfig,
  ProblemTestCase,
  Question,
  QuestionBank,
  Assessment,
  AssessmentAttempt,
  Submission,
  Contest,
  ContestAttempt,
  ContestReattemptGrant,
  Company,
  CompanyUser,
  Job,
  Application,
  University,
  UniversityUser,
  Batch,
  StudentEnrollment,
  Discussion,
  DiscussionReply,
  AuditLog,
  EmailJob,
  ExamSession,
  ExamSecurityEvent,
  LearningPath,
  LearningPathCourse,
  Course,
  CourseModule,
  Lesson,
  CourseExercise,
  LearningEnrollment,
  LessonProgress,
  CourseProgress,
  PathProgress,
  XPLedger,
  BadgeDefinition,
  StudentBadge,
  CertificateTemplate,
  Certificate,
  CertificateEvent,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const isProduction = process.env.NODE_ENV === 'production';
        const isSyncAllowed = !isProduction && process.env.DB_SYNCHRONIZE === 'true';
        if (isSyncAllowed && parseSubmissionShardingConfig()) {
          throw new Error('DB_SYNCHRONIZE must be disabled when using submission shards');
        }

        const poolConfig = {
          max: parseInt(process.env.DB_POOL_MAX || '50', 10),
          min: parseInt(process.env.DB_POOL_MIN || '5', 10),
          idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10),
          connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONN_TIMEOUT || '5000', 10),
        };

        const rejectUnauthorized =
          process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== undefined
            ? process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true'
            : isProduction;
        const ca =
          process.env.DATABASE_CA_CERT ||
          (process.env.DATABASE_SSL_CA
            ? process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n')
            : undefined);
        const sslOptions = {
          rejectUnauthorized,
          ...(ca ? { ca } : {}),
        };

        const url = configService.get<string>('database.postgres.url');
        if (url) {
          const usesSsl =
            url.includes('sslmode=require') ||
            url.includes('ssl=true') ||
            configService.get<boolean>('database.postgres.ssl');
          return {
            type: 'postgres',
            url,
            ssl: usesSsl ? sslOptions : false,
            autoLoadEntities: true,
            synchronize: isSyncAllowed,
            extra: poolConfig,
            invalidWhereValuesBehavior: {
              null: 'throw',
            },
          } as any;
        }
        return {
          type: 'postgres',
          host: configService.get<string>('database.postgres.host'),
          port: configService.get<number>('database.postgres.port'),
          username: configService.get<string>('database.postgres.username'),
          password: configService.get<string>('database.postgres.password'),
          database: configService.get<string>('database.postgres.database'),
          ssl: configService.get<boolean>('database.postgres.ssl')
            ? sslOptions
            : false,
          autoLoadEntities: true,
          synchronize: isSyncAllowed,
          extra: poolConfig,
          invalidWhereValuesBehavior: {
            null: 'throw',
          },
        } as any;
      },
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
