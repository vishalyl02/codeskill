import {
  Injectable,
  Inject,
  Optional,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';

export function Interval(ms: number): MethodDecorator {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    return descriptor;
  };
}

export interface OperationalHealthBreach {
  type: string;
  message: string;
  value: number;
  threshold: number;
}

export interface OperationalHealthReport {
  status: 'HEALTHY' | 'DEGRADED';
  timestamp: string;
  metrics: {
    attestFailureRate: number;
    attestTotal5m: number;
    attestFailed5m: number;
    telemetryLag: number;
    queueWaitLatencySeconds: number;
  };
  thresholds: {
    attestFailureRateMax: number;
    telemetryLagMax: number;
    queueWaitLatencyMaxSeconds: number;
  };
  breaches: OperationalHealthBreach[];
}

@Injectable()
export class OperationalHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperationalHealthService.name);
  private monitorTimer?: NodeJS.Timeout;
  private activeBreaches: Set<string> = new Set();
  private wasBreached = false;
  private inMemoryAttestHistory: Array<{ timestamp: number; success: boolean }> = [];
  private webhookUrl: string | null = null;

  constructor(
    @Inject(RedisService) @Optional() private readonly redisService?: RedisService,
    @Optional() @InjectQueue('submissions') private readonly submissionQueue?: Queue,
    @Optional() private readonly configService?: ConfigService,
  ) {
    this.webhookUrl =
      process.env.LOCKDOWN_ALERT_WEBHOOK_URL ||
      this.configService?.get<string>('LOCKDOWN_ALERT_WEBHOOK_URL') ||
      null;
  }

  onModuleInit() {
    this.monitorTimer = setInterval(() => {
      void (async () => {
        try {
          await this.checkHealth();
        } catch (err: any) {
          this.logger.warn(
            `Operational health background monitor check failed: ${err?.message}`,
          );
        }
      })();
    }, 30_000);

    if (this.monitorTimer?.unref) {
      this.monitorTimer.unref();
    }
  }

  onModuleDestroy() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = undefined;
    }
  }

  setWebhookUrl(url: string | null): void {
    this.webhookUrl = url;
  }

  async recordAttestation(success: boolean): Promise<void> {
    const now = Date.now();
    this.inMemoryAttestHistory.push({ timestamp: now, success });

    // Prune entries older than 10 minutes to bound memory usage
    const cutoff = now - 600_000;
    this.inMemoryAttestHistory = this.inMemoryAttestHistory.filter(
      (h) => h.timestamp > cutoff,
    );

    if (this.redisService) {
      try {
        const client = this.redisService.getClient() as any;
        const currentMinute = Math.floor(now / 60_000);
        const totalKey = `exam:health:attest:total:${currentMinute}`;

        if (typeof client.incr === 'function') {
          await client.incr(totalKey);
          if (typeof client.expire === 'function') {
            await client.expire(totalKey, 600);
          }

          if (!success) {
            const failKey = `exam:health:attest:fail:${currentMinute}`;
            await client.incr(failKey);
            if (typeof client.expire === 'function') {
              await client.expire(failKey, 600);
            }
          }
        }
      } catch (err: any) {
        this.logger.warn(
          `Failed to record Redis attestation metric: ${err?.message}`,
        );
      }
    }
  }

  async getAttestationMetrics(): Promise<{
    total: number;
    failed: number;
    rate: number;
  }> {
    let redisTotal = 0;
    let redisFailed = 0;
    let queriedRedis = false;

    if (this.redisService) {
      try {
        const client = this.redisService.getClient() as any;
        if (typeof client.get === 'function') {
          const currentMinute = Math.floor(Date.now() / 60_000);
          const promises: Promise<any>[] = [];

          for (let i = 0; i < 5; i++) {
            const m = currentMinute - i;
            promises.push(client.get(`exam:health:attest:total:${m}`));
            promises.push(client.get(`exam:health:attest:fail:${m}`));
          }

          const results = await Promise.all(promises);
          for (let i = 0; i < results.length; i += 2) {
            redisTotal += Number(results[i]) || 0;
            redisFailed += Number(results[i + 1]) || 0;
          }
          queriedRedis = true;
        }
      } catch {
        // Fallback to in-memory history
      }
    }

    if (queriedRedis && redisTotal > 0) {
      const rate = Math.round((redisFailed / redisTotal) * 10000) / 100;
      return { total: redisTotal, failed: redisFailed, rate };
    }

    // In-memory fallback
    const fiveMinAgo = Date.now() - 300_000;
    const recent = this.inMemoryAttestHistory.filter(
      (h) => h.timestamp >= fiveMinAgo,
    );
    const total = recent.length;
    const failed = recent.filter((h) => !h.success).length;
    const rate = total > 0 ? Math.round((failed / total) * 10000) / 100 : 0;
    return { total, failed, rate };
  }

  async getTelemetryLag(): Promise<number> {
    if (this.redisService) {
      try {
        const client = this.redisService.getClient() as any;
        if (typeof client.llen === 'function') {
          const depth = await client.llen('exam:telemetry:buffer');
          return Math.max(0, Number(depth) || 0);
        }
      } catch {
        // Redis lag read fallback
      }
    }
    return 0;
  }

  async getQueueWaitLatency(): Promise<{
    waitLatencySeconds: number;
    waitingCount: number;
  }> {
    if (this.submissionQueue) {
      try {
        let waitingCount = 0;
        if (typeof this.submissionQueue.getWaitingCount === 'function') {
          waitingCount = await this.submissionQueue
            .getWaitingCount()
            .catch(() => 0);
        }

        let oldestWaitingTimestamp: number | null = null;
        if (typeof this.submissionQueue.getWaiting === 'function') {
          const waitingJobs = await this.submissionQueue.getWaiting(0, 0);
          if (
            waitingJobs &&
            waitingJobs.length > 0 &&
            waitingJobs[0]?.timestamp
          ) {
            oldestWaitingTimestamp = waitingJobs[0].timestamp;
          }
        }

        if (oldestWaitingTimestamp) {
          const latencyMs = Math.max(0, Date.now() - oldestWaitingTimestamp);
          const waitLatencySeconds =
            Math.round((latencyMs / 1000) * 10) / 10;
          return { waitLatencySeconds, waitingCount };
        }

        return { waitLatencySeconds: 0, waitingCount };
      } catch {
        return { waitLatencySeconds: 0, waitingCount: 0 };
      }
    }
    return { waitLatencySeconds: 0, waitingCount: 0 };
  }

  @Interval(30_000)
  async checkHealth(): Promise<OperationalHealthReport> {
    const [attest, telemetryLag, queueWait] = await Promise.all([
      this.getAttestationMetrics(),
      this.getTelemetryLag(),
      this.getQueueWaitLatency(),
    ]);

    const breaches: OperationalHealthBreach[] = [];

    // 1. attest-client failure rate (> 5% over trailing 5 minutes)
    if (attest.total > 0 && attest.rate > 5) {
      breaches.push({
        type: 'ATTEST_FAILURE_RATE_EXCEEDED',
        message: `LockDown client attestation failure rate is ${attest.rate}% (> 5% threshold) over trailing 5m (${attest.failed}/${attest.total} failed)`,
        value: attest.rate,
        threshold: 5,
      });
    }

    // 2. Redis telemetry ingestion lag (LLEN exam:telemetry:buffer > 10,000)
    if (telemetryLag > 10_000) {
      breaches.push({
        type: 'TELEMETRY_LAG_EXCEEDED',
        message: `Redis telemetry ingestion buffer depth is ${telemetryLag} (> 10,000 threshold)`,
        value: telemetryLag,
        threshold: 10_000,
      });
    }

    // 3. Code execution queue wait latency (> 10s)
    if (queueWait.waitLatencySeconds > 10) {
      breaches.push({
        type: 'QUEUE_LATENCY_EXCEEDED',
        message: `Code execution queue wait latency is ${queueWait.waitLatencySeconds}s (> 10s threshold)`,
        value: queueWait.waitLatencySeconds,
        threshold: 10,
      });
    }

    const report: OperationalHealthReport = {
      status: breaches.length === 0 ? 'HEALTHY' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      metrics: {
        attestFailureRate: attest.rate,
        attestTotal5m: attest.total,
        attestFailed5m: attest.failed,
        telemetryLag,
        queueWaitLatencySeconds: queueWait.waitLatencySeconds,
      },
      thresholds: {
        attestFailureRateMax: 5,
        telemetryLagMax: 10_000,
        queueWaitLatencyMaxSeconds: 10,
      },
      breaches,
    };

    await this.handleAlertState(report);

    return report;
  }

  async getHealthReport(): Promise<OperationalHealthReport> {
    return this.checkHealth();
  }

  private async handleAlertState(
    report: OperationalHealthReport,
  ): Promise<void> {
    const currentBreachKeys = report.breaches.map((b) => b.type).sort();
    const hasBreaches = currentBreachKeys.length > 0;

    if (hasBreaches) {
      const isNewBreach =
        !this.wasBreached ||
        currentBreachKeys.some((k) => !this.activeBreaches.has(k));

      if (isNewBreach) {
        this.activeBreaches = new Set(currentBreachKeys);
        this.wasBreached = true;
        await this.dispatchWebhookAlert(report, 'OPERATIONAL_HEALTH_BREACH');
      }
    } else {
      if (this.wasBreached) {
        this.wasBreached = false;
        this.activeBreaches.clear();
        await this.dispatchWebhookAlert(report, 'OPERATIONAL_HEALTH_RECOVERY');
      }
    }
  }

  private async dispatchWebhookAlert(
    report: OperationalHealthReport,
    event: 'OPERATIONAL_HEALTH_BREACH' | 'OPERATIONAL_HEALTH_RECOVERY',
  ): Promise<void> {
    const webhookUrl =
      this.webhookUrl || process.env.LOCKDOWN_ALERT_WEBHOOK_URL;
    if (!webhookUrl) return;

    const isRecovery = event === 'OPERATIONAL_HEALTH_RECOVERY';
    const severity = isRecovery ? 'INFO' : 'CRITICAL';
    const title = isRecovery
      ? '✅ [RECOVERED] CodeSkill Operational Health Normalized'
      : '🚨 [ALERT] CodeSkill Operational Health Threshold Breached';
    const summary = isRecovery
      ? 'All exam operational health metrics have normalized within safe thresholds.'
      : report.breaches.map((b) => b.message).join('; ');

    const payload: Record<string, any> = {
      event,
      status: report.status,
      severity,
      title,
      summary,
      text: `${title}\n${summary}`,
      themeColor: isRecovery ? '28a745' : 'dc3545',
      timestamp: report.timestamp,
      service: 'CodeSkill Exam Operational Health',
      metrics: report.metrics,
      breaches: report.breaches,
      attachments: [
        {
          color: isRecovery ? '#28A745' : '#E11D48',
          title,
          text: summary,
          fields: [
            { title: 'Status', value: report.status, short: true },
            {
              title: 'Attest Failure Rate',
              value: `${report.metrics.attestFailureRate}% (limit: 5%)`,
              short: true,
            },
            {
              title: 'Telemetry Lag',
              value: `${report.metrics.telemetryLag} (limit: 10,000)`,
              short: true,
            },
            {
              title: 'Queue Latency',
              value: `${report.metrics.queueWaitLatencySeconds}s (limit: 10s)`,
              short: true,
            },
          ],
          ts: Math.floor(Date.now() / 1000),
        },
      ],
      event_action: isRecovery ? 'resolve' : 'trigger',
      payload: {
        summary: `${title}: ${summary}`,
        severity: isRecovery ? 'info' : 'critical',
        source: 'CodeSkill Exam Operational Health',
        timestamp: report.timestamp,
        custom_details: {
          metrics: report.metrics,
          breaches: report.breaches,
        },
      },
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      this.logger.log(`Operational health webhook alert sent: ${event}`);
    } catch (err: any) {
      this.logger.warn(
        `Failed to dispatch operational health webhook: ${err?.message}`,
      );
    }
  }
}
