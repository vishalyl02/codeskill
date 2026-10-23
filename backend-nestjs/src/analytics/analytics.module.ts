import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { Assessment } from '../database/entities/assessment.entity';
import { Question } from '../database/entities/question.entity';
import { ExamSecurityEvent } from '../database/entities/exam-security-event.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
import { User } from '../database/entities/user.entity';
import { Submission } from '../database/entities/submission.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AssessmentAttempt,
      Assessment,
      Question,
      ExamSecurityEvent,
      AuditLog,
      User,
      Submission,
    ]),
  ],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
