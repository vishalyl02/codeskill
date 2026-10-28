import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamSchedule } from '../database/entities/exam-schedule.entity';
import { ExamSlot } from '../database/entities/exam-slot.entity';
import { ExamEligibilityAssignment } from '../database/entities/exam-eligibility-assignment.entity';
import { ExamAccessAuditLog } from '../database/entities/exam-access-audit-log.entity';
import { ExamSavedGroup } from '../database/entities/exam-saved-group.entity';
import { Assessment } from '../database/entities/assessment.entity';
import { User } from '../database/entities/user.entity';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { ExamSchedulingService } from './exam-scheduling.service';
import { AdminExamSchedulingController } from './admin-exam-scheduling.controller';
import { StudentExamSchedulingController } from './student-exam-scheduling.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExamSchedule,
      ExamSlot,
      ExamEligibilityAssignment,
      ExamAccessAuditLog,
      ExamSavedGroup,
      Assessment,
      User,
      AssessmentAttempt,
    ]),
  ],
  controllers: [
    AdminExamSchedulingController,
    StudentExamSchedulingController,
  ],
  providers: [ExamSchedulingService],
  exports: [ExamSchedulingService],
})
export class ExamSchedulingModule {}
