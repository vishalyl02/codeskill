import { Global, Module } from '@nestjs/common';
import { RedisModule } from '../../redis/redis.module';
import { ExecutionAdmissionService } from './execution-admission.service';

@Global()
@Module({
  imports: [RedisModule],
  providers: [ExecutionAdmissionService],
  exports: [ExecutionAdmissionService],
})
export class ExecutionAdmissionModule {}
