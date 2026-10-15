import { SubmissionShardingModule } from '../database/sharding/sharding.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminDashboardController } from './controllers/dashboard.controller';
import { AdminUsersController } from './controllers/users.controller';
import { AdminProblemsController } from './controllers/problems.controller';
import { AdminContestsController } from './controllers/contests.controller';
import { AdminCompaniesController } from './controllers/companies.controller';
import { AdminUniversitiesController } from './controllers/universities.controller';
import { AdminService } from './admin.service';

import { User } from '../database/entities/user.entity';
import { Problem } from '../database/entities/problem.entity';
import { ProblemMetadata } from '../database/entities/problem-metadata.entity';
import { ProblemStatement } from '../database/entities/problem-statement.entity';
import { ProblemConfig } from '../database/entities/problem-config.entity';
import { ProblemTestCase } from '../database/entities/problem-testcase.entity';
import { Contest } from '../database/entities/contest.entity';
import { ContestAttempt } from '../database/entities/contest-attempt.entity';
import { ContestReattemptGrant } from '../database/entities/contest-reattempt-grant.entity';
import { Company } from '../database/entities/company.entity';
import { University } from '../database/entities/university.entity';
import { Submission } from '../database/entities/submission.entity';
import { Assessment } from '../database/entities/assessment.entity';
import { Question } from '../database/entities/question.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    SubmissionShardingModule,
    AuthModule,
    TypeOrmModule.forFeature([
      User,
      Problem,
      ProblemMetadata,
      ProblemStatement,
      ProblemConfig,
      ProblemTestCase,
      Contest,
      ContestAttempt,
      ContestReattemptGrant,
      Company,
      University,
      Submission,
      Assessment,
      Question,
    ]),
  ],
  controllers: [
    AdminDashboardController,
    AdminUsersController,
    AdminProblemsController,
    AdminContestsController,
    AdminCompaniesController,
    AdminUniversitiesController,
  ],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
