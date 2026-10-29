import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assessment } from '../database/entities/assessment.entity';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { Question } from '../database/entities/question.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
import { AssessmentsService } from './assessments.service';
import { AssessmentsAdminController } from './assessments-admin.controller';
import { AssessmentsStudentController } from './assessments-student.controller';

import { ExecutionModule } from '../execution/execution.module';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [
    ExecutionModule,
    BullModule.registerQueue({ name: 'submissions' }),
    S3Module,
    TypeOrmModule.forFeature([
      Assessment,
      AssessmentAttempt,
      Question,
      AuditLog,
    ]),
  ],
  controllers: [AssessmentsAdminController, AssessmentsStudentController],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
