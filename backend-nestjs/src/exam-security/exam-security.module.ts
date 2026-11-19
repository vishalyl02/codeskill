import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamSecurityService } from './exam-security.service';
import { ExamSecurityController } from './exam-security.controller';
import { Assessment } from '../database/entities/assessment.entity';
import { ExamSession } from '../database/entities/exam-session.entity';
import { ExamSecurityEvent } from '../database/entities/exam-security-event.entity';
import { RedisModule } from '../redis/redis.module';
import { SebGuard } from './guards/seb.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Assessment, ExamSession, ExamSecurityEvent]),
    RedisModule,
  ],
  controllers: [ExamSecurityController],
  providers: [ExamSecurityService, SebGuard],
  exports: [ExamSecurityService, SebGuard],
})
export class ExamSecurityModule {}
