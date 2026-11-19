import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamSecurityService } from './exam-security.service';
import { ExamSecurityController } from './exam-security.controller';
import { LockdownCommandCenterService } from './lockdown-command-center.service';
import { LockdownCommandCenterController } from './lockdown-command-center.controller';
import { Assessment } from '../database/entities/assessment.entity';
import { ExamSession } from '../database/entities/exam-session.entity';
import { ExamSecurityEvent } from '../database/entities/exam-security-event.entity';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { User } from '../database/entities/user.entity';
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
    ]),
    RedisModule,
    SubmissionShardingModule,
  ],
  controllers: [ExamSecurityController, LockdownCommandCenterController],
  providers: [ExamSecurityService, LockdownCommandCenterService, SebGuard, LockdownSignatureGuard],
  exports: [ExamSecurityService, LockdownCommandCenterService, SebGuard, LockdownSignatureGuard],
})
export class ExamSecurityModule {}
