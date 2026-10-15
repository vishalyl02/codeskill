import { SubmissionShardingModule } from '../database/sharding/sharding.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContestsController } from './contests.controller';
import { ContestsService } from './contests.service';
import { Contest } from '../database/entities/contest.entity';
import { ContestAttempt } from '../database/entities/contest-attempt.entity';
import { ContestReattemptGrant } from '../database/entities/contest-reattempt-grant.entity';
import { ProblemsModule } from '../problems/problems.module';

@Module({
  imports: [
    SubmissionShardingModule,
    ProblemsModule,
    TypeOrmModule.forFeature([Contest, ContestAttempt, ContestReattemptGrant]),
  ],
  controllers: [ContestsController],
  providers: [ContestsService],
  exports: [ContestsService],
})
export class ContestsModule {}
