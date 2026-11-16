import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../database/entities/audit-log.entity';
import { ActivityLogService } from './activity-log.service';
import { AlertWebhookService } from './alert-webhook.service';
import { CheatingRadarService } from './cheating-radar.service';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), RedisModule],
  providers: [ActivityLogService, AlertWebhookService, CheatingRadarService],
  exports: [ActivityLogService, AlertWebhookService, CheatingRadarService],
})
export class AuditModule {}
