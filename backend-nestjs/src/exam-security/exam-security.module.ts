import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ExamSecurityService } from './exam-security.service';
import { ExamSecurityController } from './exam-security.controller';
import { LockdownCommandCenterService } from './lockdown-command-center.service';
import { LockdownCommandCenterController } from './lockdown-command-center.controller';
import { LockdownDownloadController } from './lockdown-download.controller';
import { OperationalHealthService } from './operational-health.service';
import { Assessment } from '../database/entities/assessment.entity';
import { ExamSession } from '../database/entities/exam-session.entity';
import { ExamSecurityEvent } from '../database/entities/exam-security-event.entity';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { User } from '../database/entities/user.entity';
import { Question } from '../database/entities/question.entity';
import { CandidateExamAccommodation } from '../database/entities/candidate-exam-accommodation.entity';
import { RedisModule } from '../redis/redis.module';
import { SubmissionShardingModule } from '../database/sharding/sharding.module';
import { SebGuard } from './guards/seb.guard';
import { LockdownSignatureGuard } from './lockdown-signature.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Assessment,
      ExamSession,
      ExamSecurityEvent,
      AssessmentAttempt,
      User,
      Question,
      CandidateExamAccommodation,
    ]),
    RedisModule,
    SubmissionShardingModule,
    BullModule.registerQueue({ name: 'submissions' }),
  ],
  controllers: [
    ExamSecurityController,
    LockdownCommandCenterController,
    LockdownDownloadController,
  ],
  providers: [
    ExamSecurityService,
    LockdownCommandCenterService,
    OperationalHealthService,
    SebGuard,
    LockdownSignatureGuard,
  ],
  exports: [
    ExamSecurityService,
    LockdownCommandCenterService,
    OperationalHealthService,
    SebGuard,
    LockdownSignatureGuard,
  ],
})
export class ExamSecurityModule {}
