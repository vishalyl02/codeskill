import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacultyController } from './faculty.controller';
import { FacultyService } from './faculty.service';
import { FacultyAssignment } from '../database/entities/faculty-assignment.entity';
import { Assessment } from '../database/entities/assessment.entity';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { Question } from '../database/entities/question.entity';
import { Batch } from '../database/entities/batch.entity';
import { StudentEnrollment } from '../database/entities/student-enrollment.entity';
import { User } from '../database/entities/user.entity';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FacultyAssignment,
      Assessment,
      AssessmentAttempt,
      Question,
      Batch,
      StudentEnrollment,
      User,
    ]),
    S3Module,
  ],
  controllers: [FacultyController],
  providers: [FacultyService],
  exports: [FacultyService],
})
export class FacultyModule {}
