import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import { SubmissionShardRegistry } from './shard-registry';
import { SubmissionStore } from './submission-store';

@Module({
  imports: [TypeOrmModule.forFeature([Submission, User])],
  providers: [SubmissionShardRegistry, SubmissionStore],
  exports: [SubmissionStore, SubmissionShardRegistry],
})
export class SubmissionShardingModule {}
