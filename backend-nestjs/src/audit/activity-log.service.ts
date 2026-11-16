import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import { AuditLog } from '../database/entities/audit-log.entity';
import {
  ActivityLogInput,
  ActivityCursorPayload,
  ActivityCategory,
  ActivityRole,
  ActivitySeverity,
} from './activity-log.types';

const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'oldpassword',
  'token',
  'refreshtoken',
  'accesstoken',
  'authorization',
  'secret',
  'jwt_secret',
  'cookie',
  'testcases',
  'hiddentestcases',
  'referencesolution',
  'solutioncode',
]);

@Injectable()
export class ActivityLogService implements OnModuleDestroy {
  private readonly logger = new Logger(ActivityLogService.name);

  // In-memory queue / batching buffer
  private buffer: Partial<AuditLog>[] = [];
  private readonly MAX_BUFFER_SIZE = 5000;
  private readonly BATCH_SIZE = 50;
  private readonly FLUSH_INTERVAL_MS = 1500;
  private isFlushing = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private purgeTimer: NodeJS.Timeout | null = null;
  private readonly PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (daily retention check)

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        this.logger.error('Error during scheduled audit log flush', err);
      });
    }, this.FLUSH_INTERVAL_MS);
    this.flushTimer?.unref();

    this.purgeTimer = setInterval(() => {
      this.purgeExpiredAuditLogs().catch((err) => {
        this.logger.error('Error during scheduled audit log retention purge', err);
      });
    }, this.PURGE_INTERVAL_MS);
    this.purgeTimer?.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
      this.purgeTimer = null;
    }
    // Drain remaining buffer safely on shutdown
    while (this.buffer.length > 0) {
      await this.flush();
    }
  }

  /**
   * Log an activity event into the in-memory batch buffer.
   * Asynchronous, non-blocking, memory-bounded, and automatically redacted.
   */
  log(entry: ActivityLogInput): void {
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      this.logger.warn(
        `ActivityLogService buffer exceeded MAX_BUFFER_SIZE (${this.MAX_BUFFER_SIZE}). Dropping oldest entries to protect memory.`,
      );
      this.buffer.splice(0, 100);
    }

    const rawMeta = entry.metadata || {};
    // Ensure actor details are preserved in metadata for long-term immutability
    const mergedMeta: Record<string, any> = {
      ...rawMeta,
      ...(entry.actorName ? { actorName: entry.actorName } : {}),
      ...(entry.actorRole ? { actorRole: entry.actorRole } : {}),
      ...(entry.actorUid ? { actorUid: entry.actorUid } : {}),
    };

    const sanitizedMetadata = this.sanitizeMetadata(mergedMeta);

    this.buffer.push({
      actorId: entry.actorId,
      actorEmail: (entry.actorEmail || '').toLowerCase().trim(),
      action: entry.action,
      target: entry.target || '',
      targetType: entry.targetType || '',
      studentId: entry.studentId,
      attemptId: entry.attemptId,
      assessmentId: entry.assessmentId,
      event: entry.event || entry.action,
      riskWeight: entry.riskWeight ?? 0,
      ipAddress: entry.ipAddress || '',
      userAgent: entry.userAgent || '',
      metadata: sanitizedMetadata,
      timestamp: entry.timestamp || new Date(),
    });

    if (this.buffer.length >= this.BATCH_SIZE && !this.isFlushing) {
      setImmediate(() => {
        this.flush().catch((err) => {
          this.logger.error('Error during threshold audit log flush', err);
        });
      });
    }
  }

  /**
   * Flushes the oldest batch from the buffer into the database via bulk INSERT.
   * Mutex-locked via isFlushing flag to avoid race conditions.
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) {
      return;
    }

    this.isFlushing = true;
    const batch = this.buffer.splice(0, this.BATCH_SIZE);

    try {
      await this.auditLogRepo.insert(batch);
    } catch (err) {
      this.logger.error(`Failed to flush audit log batch of ${batch.length} items`, err);
      // Re-prepend items to buffer if under capacity limit
      if (this.buffer.length + batch.length <= this.MAX_BUFFER_SIZE) {
        this.buffer.unshift(...batch);
      }
    } finally {
      this.isFlushing = false;
      // Trigger subsequent flush if more items accumulated
      if (this.buffer.length >= this.BATCH_SIZE) {
        setImmediate(() => {
          this.flush().catch(() => {});
        });
      }
    }
  }

  /**
   * Deep recursive sanitizer stripping sensitive keys, passwords, tokens, and test case data.
   */
  private sanitizeMetadata(obj: any, depth = 0): any {
    if (depth > 6 || obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.slice(0, 50).map((item) => this.sanitizeMetadata(item, depth + 1));
    }

    const sanitized: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      const lower = key.toLowerCase().replace(/[-_]/g, '');
      if (SENSITIVE_KEYS.has(lower)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.sanitizeMetadata(val, depth + 1);
      }
    }
    return sanitized;
  }

  // --- QUERY METHODS FOR ADMIN CONTROLLER ---

  /**
   * Keyset (cursor) paginated query for activity logs on partitioned table.
   * Crucial: passes top-level timestamp <= cursorTime for Postgres partition pruning!
   */
  async getPaginatedLogs(query: {
    cursor?: string;
    limit?: number;
    search?: string;
    category?: ActivityCategory;
    role?: ActivityRole;
    severity?: ActivitySeverity;
    action?: string;
    actorId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const qb = this.auditLogRepo.createQueryBuilder('log');

    // Decode cursor if provided
    let cursorPayload: ActivityCursorPayload | null = null;
    if (query.cursor) {
      try {
        const decoded = Buffer.from(query.cursor, 'base64').toString('utf8');
        cursorPayload = JSON.parse(decoded);
      } catch (err) {
        this.logger.warn(`Invalid cursor received: ${query.cursor}`);
      }
    }

    // 1. Keyset pagination filter with Postgres partition pruning
    if (cursorPayload && cursorPayload.timestamp && cursorPayload.id) {
      const cursorTime = new Date(cursorPayload.timestamp);
      // Explicit top-level timestamp <= :cursorTime for partition pruning!
      qb.andWhere('log.timestamp <= :cursorTime', { cursorTime });
      qb.andWhere(
        '(log.timestamp < :cursorTime OR (log.timestamp = :cursorTime AND log.id < :cursorId))',
        { cursorTime, cursorId: cursorPayload.id },
      );
    }

    // 2. Filters
    this.applyCommonFilters(qb, query);

    // 3. Keyset ordering
    qb.orderBy('log.timestamp', 'DESC');
    qb.addOrderBy('log.id', 'DESC');
    qb.take(limit + 1);

    const items = await qb.getMany();
    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;

    let nextCursor: string | null = null;
    if (hasMore && pageItems.length > 0) {
      const lastItem = pageItems[pageItems.length - 1];
      const payload: ActivityCursorPayload = {
        timestamp: lastItem.timestamp.toISOString(),
        id: lastItem.id,
      };
      nextCursor = Buffer.from(JSON.stringify(payload)).toString('base64');
    }

    return {
      items: pageItems,
      nextCursor,
      hasMore,
      limit,
    };
  }

  /**
   * Returns count of new events since a given timestamp with active filters.
   * Used by the frontend floating "X new events" banner.
   */
  async getCountSince(
    since: string,
    query: {
      search?: string;
      category?: ActivityCategory;
      role?: ActivityRole;
      severity?: ActivitySeverity;
      action?: string;
      actorId?: string;
    },
  ): Promise<number> {
    if (!since) return 0;
    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) return 0;

    const qb = this.auditLogRepo.createQueryBuilder('log');
    qb.where('log.timestamp > :sinceDate', { sinceDate });

    this.applyCommonFilters(qb, query);

    // Limit count query to max 100 for fast response
    qb.take(101);
    const count = await qb.getCount();
    return count;
  }

  /**
   * Aggregates platform activity statistics for the executive dashboard.
   */
  async getActivityStats() {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

    const [totalEvents, eventsToday, securityAlertsToday] = await Promise.all([
      this.auditLogRepo.count().catch(() => 0),
      this.auditLogRepo
        .createQueryBuilder('log')
        .where('log.timestamp >= :today', { today })
        .getCount()
        .catch(() => 0),
      this.auditLogRepo
        .createQueryBuilder('log')
        .where('log.timestamp >= :today', { today })
        .andWhere('log.riskWeight > 0')
        .getCount()
        .catch(() => 0),
    ]);

    // Active users in past 15m
    let activeStudents15m = 0;
    let activeAdmins15m = 0;
    try {
      const activeRaw = await this.auditLogRepo
        .createQueryBuilder('log')
        .select("COALESCE(log.metadata->>'actorRole', 'student')", 'role')
        .addSelect('COUNT(DISTINCT log.actorId)', 'count')
        .where('log.timestamp >= :fifteenMinutesAgo', { fifteenMinutesAgo })
        .andWhere('log.actorId IS NOT NULL')
        .groupBy("COALESCE(log.metadata->>'actorRole', 'student')")
        .getRawMany();

      for (const row of activeRaw) {
        const count = parseInt(row.count, 10) || 0;
        if (row.role === 'admin' || row.role === 'super_admin' || row.role === 'assessment_admin') {
          activeAdmins15m += count;
        } else {
          activeStudents15m += count;
        }
      }
    } catch (err) {
      this.logger.warn('Failed to query 15m active users', err);
    }

    return {
      totalEvents,
      eventsToday,
      activeStudents15m,
      activeAdmins15m,
      securityAlertsToday,
    };
  }

  /**
   * Streams activity logs as CSV directly to the HTTP response.
   * Uses chunked queries to avoid memory bloat and prevent 504 timeouts.
   */
  async streamCsvExport(
    query: {
      search?: string;
      category?: ActivityCategory;
      role?: ActivityRole;
      severity?: ActivitySeverity;
      action?: string;
      actorId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    },
    res: Response,
  ): Promise<void> {
    const maxExportRows = Math.min(Number(query.limit) || 20000, 50000);
    const chunkSize = 500;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="codeskill-activity-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    );

    // CSV Header row
    res.write('Timestamp,Action,Actor Name,Actor Email,Role,UID,Target Type,Target,Risk Weight,IP Address,User Agent,Details\r\n');

    let exported = 0;
    let currentCursor: ActivityCursorPayload | null = null;

    while (exported < maxExportRows) {
      const limit = Math.min(chunkSize, maxExportRows - exported);
      const qb = this.auditLogRepo.createQueryBuilder('log');

      if (currentCursor) {
        const cursorTime = new Date(currentCursor.timestamp);
        qb.andWhere('log.timestamp <= :cursorTime', { cursorTime });
        qb.andWhere(
          '(log.timestamp < :cursorTime OR (log.timestamp = :cursorTime AND log.id < :cursorId))',
          { cursorTime, cursorId: currentCursor.id },
        );
      }

      this.applyCommonFilters(qb, query);
      qb.orderBy('log.timestamp', 'DESC');
      qb.addOrderBy('log.id', 'DESC');
      qb.take(limit);

      const rows = await qb.getMany();
      if (!rows || rows.length === 0) {
        break;
      }

      for (const row of rows) {
        const time = row.timestamp.toISOString();
        const action = this.escapeCsv(row.action);
        const name = this.escapeCsv(row.metadata?.actorName || '');
        const email = this.escapeCsv(row.actorEmail || '');
        const role = this.escapeCsv(row.metadata?.actorRole || (row.studentId ? 'student' : ''));
        const uid = this.escapeCsv(row.metadata?.actorUid || '');
        const targetType = this.escapeCsv(row.targetType || '');
        const target = this.escapeCsv(row.target || '');
        const risk = row.riskWeight;
        const ip = this.escapeCsv(row.ipAddress || '');
        const ua = this.escapeCsv(row.userAgent || '');
        const details = this.escapeCsv(JSON.stringify(row.metadata || {}));

        res.write(`${time},${action},${name},${email},${role},${uid},${targetType},${target},${risk},${ip},${ua},${details}\r\n`);
      }

      exported += rows.length;
      const last = rows[rows.length - 1];
      currentCursor = {
        timestamp: last.timestamp.toISOString(),
        id: last.id,
      };

      if (rows.length < limit) {
        break;
      }
    }

    res.end();
  }

  private escapeCsv(field: string): string {
    if (!field) return '""';
    const escaped = field.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  /**
   * Applies shared SQL filters across paginated, count, and export queries.
   */
  private applyCommonFilters(
    qb: any,
    query: {
      search?: string;
      category?: ActivityCategory;
      role?: ActivityRole;
      severity?: ActivitySeverity;
      action?: string;
      actorId?: string;
      startDate?: string;
      endDate?: string;
    },
  ): void {
    if (query.search && query.search.trim()) {
      const clean = query.search.trim().replace(/[%_]/g, '\\$&');
      const escaped = `%${clean}%`;
      qb.andWhere(
        '(log.actorEmail ILIKE :search OR log.target ILIKE :search OR log.action ILIKE :search OR log.ipAddress ILIKE :search OR log.metadata->>\'actorName\' ILIKE :search OR log.metadata->>\'actorUid\' ILIKE :search)',
        { search: escaped },
      );
    }

    if (query.action && query.action.trim()) {
      qb.andWhere('log.action = :action', { action: query.action.trim() });
    }

    if (query.actorId && query.actorId.trim()) {
      qb.andWhere('(log.actorId = :actorId OR log.studentId = :actorId)', {
        actorId: query.actorId.trim(),
      });
    }

    // Role filter
    if (query.role && query.role !== 'all') {
      if (query.role === 'student') {
        qb.andWhere("(log.metadata->>'actorRole' = 'student' OR log.studentId IS NOT NULL)");
      } else if (query.role === 'admin') {
        qb.andWhere(
          "(log.metadata->>'actorRole' IN ('admin', 'super_admin', 'assessment_admin') OR log.actorEmail ILIKE '%admin%')",
        );
      } else if (query.role === 'teacher') {
        qb.andWhere("(log.metadata->>'actorRole' = 'teacher')");
      }
    }

    // Severity filter
    if (query.severity && query.severity !== 'all') {
      if (query.severity === 'normal') {
        qb.andWhere('log.riskWeight = 0');
      } else if (query.severity === 'warning') {
        qb.andWhere('log.riskWeight BETWEEN 1 AND 3');
      } else if (query.severity === 'critical') {
        qb.andWhere('log.riskWeight >= 4');
      }
    }

    // Category filter
    if (query.category && query.category !== 'all') {
      switch (query.category) {
        case 'auth':
          qb.andWhere("(log.action LIKE 'AUTH_%' OR log.action LIKE '%LOGIN%' OR log.action LIKE '%LOGOUT%')");
          break;
        case 'assessment':
          qb.andWhere(
            "(log.action LIKE '%ASSESSMENT%' OR log.targetType = 'Assessment' OR log.assessmentId IS NOT NULL)",
          );
          break;
        case 'submission':
          qb.andWhere("(log.action LIKE '%SUBMISSION%' OR log.targetType = 'Submission')");
          break;
        case 'security':
          qb.andWhere(
            '(log.riskWeight > 0 OR log.action LIKE \'%SECURITY%\' OR log.action LIKE \'%VIOLATION%\' OR log.action LIKE \'%PROCTOR%\')',
          );
          break;
        case 'radar':
          qb.andWhere(
            "(log.action LIKE 'CHEATING_RADAR_%' OR (log.riskWeight >= 4 AND log.action LIKE '%VIOLATION%'))",
          );
          break;
        case 'question':
          qb.andWhere("(log.action LIKE '%QUESTION%' OR log.targetType = 'Question')");
          break;
        case 'user':
          qb.andWhere("(log.action LIKE '%USER%' OR log.action LIKE '%STUDENT%' OR log.targetType = 'User')");
          break;
        case 'contest':
          qb.andWhere("(log.action LIKE '%CONTEST%' OR log.targetType = 'Contest')");
          break;
      }
    }

    // Date range filters
    if (query.startDate) {
      const sDate = new Date(query.startDate);
      if (!isNaN(sDate.getTime())) {
        qb.andWhere('log.timestamp >= :sDate', { sDate });
      }
    }
    if (query.endDate) {
      const eDate = new Date(query.endDate);
      if (!isNaN(eDate.getTime())) {
        qb.andWhere('log.timestamp <= :eDate', { eDate });
      }
    }
  }

  /**
   * AUD-PRV-002: Purges audit log records older than the retention threshold.
   * Defaults to 180 days unless configured via AUDIT_LOG_RETENTION_DAYS.
   */
  async purgeExpiredAuditLogs(retentionDays?: number): Promise<{ deleted: number; cutoffDate: Date }> {
    const days = retentionDays ?? this.getRetentionDays();
    if (days <= 0) {
      this.logger.log('Audit log purging disabled (retention days <= 0).');
      return { deleted: 0, cutoffDate: new Date() };
    }

    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
      const result = await this.auditLogRepo
        .createQueryBuilder()
        .delete()
        .from(AuditLog)
        .where('timestamp < :cutoffDate', { cutoffDate })
        .execute();

      const deleted = result?.affected || 0;
      if (deleted > 0) {
        this.logger.log(
          `[Audit Retention] Purged ${deleted} audit logs older than ${days} days (cutoff: ${cutoffDate.toISOString()})`,
        );
      }
      return { deleted, cutoffDate };
    } catch (err: any) {
      this.logger.error(`Error purging expired audit logs: ${err?.message}`, err?.stack);
      return { deleted: 0, cutoffDate };
    }
  }

  getRetentionDays(): number {
    const envVal = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '', 10);
    return Number.isFinite(envVal) && envVal > 0 ? envVal : 180;
  }
}
