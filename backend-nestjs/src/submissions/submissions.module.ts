import { ExecutionModule } from '../execution/execution.module';
import { SubmissionShardingModule } from '../database/sharding/sharding.module';
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { Submission } from '../database/entities/submission.entity';
import { User } from '../database/entities/user.entity';
import { GatewayModule } from '../gateway/gateway.module';
import { RedisModule } from '../redis/redis.module';
import { ProblemsModule } from '../problems/problems.module';

@Module({
  imports: [
    SubmissionShardingModule,
    TypeOrmModule.forFeature([Submission, User]),
    BullModule.registerQueue({
      name: 'submissions',
    }),
    GatewayModule,
    RedisModule,
    ProblemsModule,
    ExecutionModule,
  ],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
