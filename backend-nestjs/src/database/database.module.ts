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

const entities = [
  User,
  RefreshToken,
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

        const url = configService.get<string>('database.postgres.url');
        if (url) {
          const usesSsl =
            url.includes('sslmode=require') ||
            url.includes('ssl=true') ||
            configService.get<boolean>('database.postgres.ssl');
          return {
            type: 'postgres',
            url,
            ssl: usesSsl ? { rejectUnauthorized: false } : false,
            autoLoadEntities: true,
            synchronize: isSyncAllowed,
            invalidWhereValuesBehavior: {
              null: 'ignore',
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
            ? { rejectUnauthorized: false }
            : false,
          autoLoadEntities: true,
          synchronize: isSyncAllowed,
          invalidWhereValuesBehavior: {
            null: 'ignore',
          },
        } as any;
      },
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
