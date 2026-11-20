import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class ExamBackpressureGuard implements CanActivate {
  private readonly logger = new Logger(ExamBackpressureGuard.name);

  constructor(
    @Inject(DataSource) @Optional() private readonly dataSource?: DataSource,
    @Inject(RedisService) @Optional() private readonly redisService?: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const path = String(req.originalUrl || req.url || '').toLowerCase();
    const method = String(req.method || '').toUpperCase();

    // Invariant: Never shed final POST /submit
    if (method === 'POST' && (path.endsWith('/submit') || path.includes('/submit?'))) {
      return true;
    }

    // 1. PostgreSQL pool saturation check
    let isDbSaturated = false;
    let saturationRatio = 0;
    try {
      if (this.dataSource?.driver) {
        const driver = this.dataSource.driver as any;
        const pool = driver.master || driver.pool;
        if (pool) {
          const totalCount = Number(pool.totalCount ?? 0);
          const idleCount = Number(pool.idleCount ?? 0);
          const waitingCount = Number(pool.waitingCount ?? 0);
          const max = Number(pool.options?.max ?? pool._max ?? 20);

          const activeClients = Math.max(0, totalCount - idleCount);
          saturationRatio = max > 0 ? activeClients / max : 0;

          if (saturationRatio > 0.85 || (totalCount >= max && waitingCount > 0)) {
            isDbSaturated = true;
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not inspect DB pool metrics: ${err?.message}`);
    }

    // 2. Redis telemetry buffer depth check
    let isRedisBufferSaturated = false;
    let bufferDepth = 0;
    try {
      if (this.redisService) {
        const client = this.redisService.getClient() as any;
        if (typeof client.llen === 'function') {
          bufferDepth = await client.llen('exam:telemetry:buffer').catch(() => 0);
          if (bufferDepth > 25_000) {
            isRedisBufferSaturated = true;
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not inspect Redis buffer depth: ${err?.message}`);
    }

    if (isDbSaturated || isRedisBufferSaturated) {
      this.logger.warn(
        `[Backpressure] Circuit breaker triggered. DB saturation=${(saturationRatio * 100).toFixed(1)}%, ` +
        `Redis buffer depth=${bufferDepth}. Shedding non-critical request: ${method} ${path}`,
      );

      if (res && typeof res.setHeader === 'function') {
        res.setHeader('Retry-After', '3');
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          message: 'System under heavy load. Non-critical telemetry/autosave temporarily shed; retry in 3 seconds.',
          retryAfter: 3,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return true;
  }
}
