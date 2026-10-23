import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
} from './entities';
import { User } from '../database/entities/user.entity';
import { Problem } from '../database/entities/problem.entity';
import { Submission } from '../database/entities/submission.entity';
import { ExecutionModule } from '../execution/execution.module';
import { S3Module } from '../s3/s3.module';

import { LearningService } from './services/learning.service';
import { PracticeService } from './services/practice.service';
import { GamificationService } from './services/gamification.service';
import { CertificationService } from './services/certification.service';
import { AdminLearningService } from './services/admin-learning.service';
import { LearningAutoSeedService } from './services/learning-auto-seed.service';

import { LearningController } from './controllers/learning.controller';
import { AdminLearningController } from './controllers/admin-learning.controller';
import { CertificateVerificationController } from './controllers/certificate-verification.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
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
      User,
      Problem,
      Submission,
    ]),
    ExecutionModule,
    S3Module,
  ],
  controllers: [
    LearningController,
    AdminLearningController,
    CertificateVerificationController,
  ],
  providers: [
    LearningService,
    PracticeService,
    GamificationService,
    CertificationService,
    AdminLearningService,
    LearningAutoSeedService,
  ],
  exports: [
    LearningService,
    PracticeService,
    GamificationService,
    CertificationService,
    AdminLearningService,
    LearningAutoSeedService,
  ],
})
export class LearningModule {}
