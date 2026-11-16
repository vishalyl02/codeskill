import {
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { AlertWebhookService } from './alert-webhook.service';
import { RedisService } from '../redis/redis.service';

interface IpEntry {
  ip: string;
  timestamp: number;
}

interface CooldownEntry {
  expiresAt: number;
  seenIps: Set<string>;
}

@Injectable()
export class CheatingRadarService implements OnModuleDestroy {
  private readonly logger = new Logger(CheatingRadarService.name);

  // In-memory sliding windows with 60s eviction sweep
  private readonly ipHistory = new Map<string, IpEntry[]>(); // Key: studentId:assessmentId
  private readonly violationHistory = new Map<string, number[]>(); // Key: studentId:assessmentId -> timestamps
  private readonly cooldowns = new Map<string, CooldownEntry>(); // Key: anomalyType:studentId:assessmentId

  private sweepTimer: NodeJS.Timeout | null = null;
  private readonly COOLDOWN_MS = 15 * 60 * 1000; // 15-minute cooldown per anomaly
  private readonly IP_WINDOW_MS = 10 * 60 * 1000; // 10-minute sliding window for multi-IP
  private readonly VIOLATION_WINDOW_MS = 3 * 60 * 1000; // 3-minute sliding window for violation burst

  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly alertWebhookService: AlertWebhookService,
    @Optional() private readonly redisService?: RedisService,
  ) {
    this.sweepTimer = setInterval(() => this.evictExpiredEntries(), 60000);
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * Periodic sweep to protect in-memory maps from memory leaks across multi-hour exams.
   */
  private evictExpiredEntries() {
    const now = Date.now();

    // 1. Evict IP history older than IP_WINDOW_MS
    for (const [key, entries] of this.ipHistory.entries()) {
      const active = entries.filter((e) => now - e.timestamp <= this.IP_WINDOW_MS);
      if (active.length === 0) {
        this.ipHistory.delete(key);
      } else {
        this.ipHistory.set(key, active);
      }
    }

    // 2. Evict violations older than VIOLATION_WINDOW_MS
    for (const [key, timestamps] of this.violationHistory.entries()) {
      const active = timestamps.filter((t) => now - t <= this.VIOLATION_WINDOW_MS);
      if (active.length === 0) {
        this.violationHistory.delete(key);
      } else {
        this.violationHistory.set(key, active);
      }
    }

    // 3. Evict expired cooldowns
    for (const [key, entry] of this.cooldowns.entries()) {
      if (now >= entry.expiresAt) {
        this.cooldowns.delete(key);
      }
    }
  }

  /**
   * Checks if an anomaly alert is in cooldown.
   * If newIp is provided, re-triggers only if a previously unseen IP connects.
   */
  private async isInCooldown(
    cooldownKey: string,
    newIp?: string,
  ): Promise<boolean> {
    const now = Date.now();

    // Check Redis if available
    if (this.redisService) {
      try {
        const redisKey = `radar:cooldown:${cooldownKey}`;
        const cached = await this.redisService.get<string>(redisKey);
        if (cached) {
          if (newIp) {
            const seen = JSON.parse(cached);
            if (Array.isArray(seen) && seen.includes(newIp)) {
              return true;
            }
          } else {
            return true;
          }
        }
      } catch (err) {
        // Fall back to in-memory check
      }
    }

    // In-memory cooldown check
    const entry = this.cooldowns.get(cooldownKey);
    if (!entry || now >= entry.expiresAt) {
      return false;
    }

    if (newIp && !entry.seenIps.has(newIp)) {
      // A new distinct IP joined; allow alert
      return false;
    }

    return true;
  }

  /**
   * Sets cooldown for an anomaly alert to prevent proctor notification spam.
   */
  private async setCooldown(cooldownKey: string, ips: string[]): Promise<void> {
    const now = Date.now();
    const expiresAt = now + this.COOLDOWN_MS;

    if (this.redisService) {
      try {
        await this.redisService.set(
          `radar:cooldown:${cooldownKey}`,
          JSON.stringify(ips),
          Math.floor(this.COOLDOWN_MS / 1000),
        );
      } catch (err) {
        // Fall back to in-memory
      }
    }

    this.cooldowns.set(cooldownKey, {
      expiresAt,
      seenIps: new Set(ips),
    });
  }

  // --- HEURISTIC 1: CONCURRENT MULTI-IP DETECTION ---

  /**
   * Records student network activity and detects if 2+ distinct IPs
   * interact simultaneously during an active assessment.
   */
  async recordNetworkActivity(params: {
    studentId: string;
    assessmentId?: string;
    ipAddress: string;
    actorName?: string;
    actorEmail?: string;
    actorUid?: string;
  }): Promise<boolean> {
    const { studentId, assessmentId, ipAddress } = params;
    if (!studentId || !ipAddress || !assessmentId) return false;

    // Ignore local/internal loopbacks
    if (ipAddress === '127.0.0.1' || ipAddress === '::1' || ipAddress === 'localhost') {
      return false;
    }

    const now = Date.now();
    const key = `${studentId}:${assessmentId}`;

    // Update IP history sliding window
    let entries = this.ipHistory.get(key) || [];
    entries = entries.filter((e) => now - e.timestamp <= this.IP_WINDOW_MS);
    entries.push({ ip: ipAddress, timestamp: now });
    this.ipHistory.set(key, entries);

    const distinctIps = Array.from(new Set(entries.map((e) => e.ip)));

    if (distinctIps.length >= 2) {
      const cooldownKey = `concurrent_ip:${studentId}:${assessmentId}`;
      const inCooldown = await this.isInCooldown(cooldownKey, ipAddress);

      if (!inCooldown) {
        await this.setCooldown(cooldownKey, distinctIps);

        const details = {
          anomaly: 'CONCURRENT_IP_DETECTED',
          distinctIps,
          primaryIp: distinctIps[0],
          secondaryIp: distinctIps[1],
          assessmentId,
        };

        this.logger.warn(
          `[CHEATING_RADAR] Concurrent IP detected for student ${studentId}: ${distinctIps.join(', ')}`,
        );

        // 1. Log to partitioned audit_logs
        this.activityLogService.log({
          action: 'CHEATING_RADAR_CONCURRENT_IP',
          actorId: studentId,
          actorName: params.actorName,
          actorEmail: params.actorEmail,
          actorUid: params.actorUid,
          studentId,
          assessmentId,
          target: `Assessment ${assessmentId}`,
          targetType: 'Assessment',
          riskWeight: 4, // Critical
          ipAddress,
          metadata: details,
        });

        // 2. Dispatch incident webhook
        void this.alertWebhookService.sendAlert({
          action: 'CHEATING_RADAR_CONCURRENT_IP',
          severity: 'CRITICAL',
          riskWeight: 4,
          actorName: params.actorName,
          actorEmail: params.actorEmail,
          actorUid: params.actorUid,
          target: `Assessment ${assessmentId}`,
          targetType: 'Assessment',
          ipAddress,
          details,
        });

        return true;
      }
    }

    return false;
  }

  // --- HEURISTIC 2: IMPOSSIBLE SOLVE VELOCITY ---

  /**
   * Detects fast external copy-paste code injection.
   * Scoped strictly to active assessments, requires codeLength > 250, and checks corroborating signals.
   */
  async evaluateSubmissionVelocity(params: {
    studentId: string;
    assessmentId?: string;
    problemId: string;
    problemTitle?: string;
    difficulty?: string;
    code: string;
    verdict: string;
    timeSpentSeconds?: number;
    hasCorroboratingViolation?: boolean;
    actorName?: string;
    actorEmail?: string;
    actorUid?: string;
    ipAddress?: string;
  }): Promise<boolean> {
    const { assessmentId, code, verdict, timeSpentSeconds = 999 } = params;

    // Strict guard: Only evaluate within active assessments and for Accepted solves
    if (!assessmentId || verdict !== 'Accepted') {
      return false;
    }

    const codeLength = (code || '').trim().length;

    // Guard: Require significant code payload (> 250 characters) and solve speed < 30 seconds
    if (codeLength > 250 && timeSpentSeconds < 30) {
      const cooldownKey = `velocity:${params.studentId}:${params.problemId}`;
      const inCooldown = await this.isInCooldown(cooldownKey);

      if (!inCooldown) {
        await this.setCooldown(cooldownKey, [params.ipAddress || '']);

        // If corroborated by a paste or tab-switch: Critical (4); otherwise Warning (3)
        const isCorroborated = Boolean(params.hasCorroboratingViolation);
        const riskWeight = isCorroborated ? 4 : 3;
        const severity = isCorroborated ? 'CRITICAL' : 'WARNING';

        const details = {
          anomaly: 'IMPOSSIBLE_SOLVE_VELOCITY',
          problemTitle: params.problemTitle || params.problemId,
          difficulty: params.difficulty || 'Medium',
          timeSpentSeconds,
          codeLength,
          verdict,
          corroborated: isCorroborated,
        };

        this.logger.warn(
          `[CHEATING_RADAR] Impossible solve velocity flagged for student ${params.studentId} on ${params.problemTitle} (${timeSpentSeconds}s, ${codeLength} chars)`,
        );

        this.activityLogService.log({
          action: 'CHEATING_RADAR_IMPOSSIBLE_VELOCITY',
          actorId: params.studentId,
          actorName: params.actorName,
          actorEmail: params.actorEmail,
          actorUid: params.actorUid,
          studentId: params.studentId,
          assessmentId: params.assessmentId,
          target: params.problemTitle || params.problemId,
          targetType: 'Problem',
          riskWeight,
          ipAddress: params.ipAddress,
          metadata: details,
        });

        void this.alertWebhookService.sendAlert({
          action: 'CHEATING_RADAR_IMPOSSIBLE_VELOCITY',
          severity,
          riskWeight,
          actorName: params.actorName,
          actorEmail: params.actorEmail,
          actorUid: params.actorUid,
          target: params.problemTitle || params.problemId,
          targetType: 'Problem',
          ipAddress: params.ipAddress,
          details,
        });

        return true;
      }
    }

    return false;
  }

  // --- HEURISTIC 3: PROCTORING VIOLATION BURST ---

  /**
   * Detects rapid bursts of proctoring violations (e.g. >= 4 tab switches/blur in 3 mins).
   */
  async recordProctoringViolation(params: {
    studentId: string;
    assessmentId: string;
    eventType: string;
    actorName?: string;
    actorEmail?: string;
    actorUid?: string;
    ipAddress?: string;
  }): Promise<boolean> {
    const { studentId, assessmentId, eventType } = params;
    if (!studentId || !assessmentId) return false;

    const now = Date.now();
    const key = `${studentId}:${assessmentId}`;

    let timestamps = this.violationHistory.get(key) || [];
    timestamps = timestamps.filter((t) => now - t <= this.VIOLATION_WINDOW_MS);
    timestamps.push(now);
    this.violationHistory.set(key, timestamps);

    if (timestamps.length >= 4) {
      const cooldownKey = `burst:${studentId}:${assessmentId}`;
      const inCooldown = await this.isInCooldown(cooldownKey);

      if (!inCooldown) {
        await this.setCooldown(cooldownKey, [params.ipAddress || '']);

        const details = {
          anomaly: 'VIOLATION_BURST_DETECTED',
          recentViolationCount: timestamps.length,
          lastEventType: eventType,
          windowMinutes: 3,
        };

        this.logger.warn(
          `[CHEATING_RADAR] Violation burst detected for student ${studentId}: ${timestamps.length} violations in 3 minutes`,
        );

        this.activityLogService.log({
          action: 'CHEATING_RADAR_VIOLATION_BURST',
          actorId: studentId,
          actorName: params.actorName,
          actorEmail: params.actorEmail,
          actorUid: params.actorUid,
          studentId,
          assessmentId,
          target: `Assessment ${assessmentId}`,
          targetType: 'Assessment',
          riskWeight: 4, // Critical
          ipAddress: params.ipAddress,
          metadata: details,
        });

        void this.alertWebhookService.sendAlert({
          action: 'CHEATING_RADAR_VIOLATION_BURST',
          severity: 'CRITICAL',
          riskWeight: 4,
          actorName: params.actorName,
          actorEmail: params.actorEmail,
          actorUid: params.actorUid,
          target: `Assessment ${assessmentId}`,
          targetType: 'Assessment',
          ipAddress: params.ipAddress,
          details,
        });

        return true;
      }
    }

    return false;
  }
}
