import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource, DataSourceOptions, QueryRunner } from 'typeorm';
import { createHash } from 'crypto';
import { databaseConfig } from '../config';

// Fixed standard UUID namespace for deterministic audit backfill IDs
export const AUDIT_BACKFILL_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
export const AUDIT_BACKFILL_LOCK_ID = 1162760276; // 'AUDIT' in 32-bit int

/**
 * Standard RFC 4122 UUIDv5 implementation using native Node.js crypto.
 * Completely immune to ESM / CJS module loading issues in Jest and ts-node.
 */
export function generateDeterministicUuid(
  name: string,
  namespaceUuid: string = AUDIT_BACKFILL_NAMESPACE,
): string {
  const cleanNamespace = namespaceUuid.replace(/-/g, '');
  const namespaceBytes = Buffer.from(cleanNamespace, 'hex');
  const nameBytes = Buffer.from(name, 'utf8');

  const hash = createHash('sha1');
  hash.update(namespaceBytes);
  hash.update(nameBytes);
  const digest = hash.digest();

  digest[6] = (digest[6] & 0x0f) | 0x50; // Version 5
  digest[8] = (digest[8] & 0x3f) | 0x80; // Variant RFC 4122

  const hex = digest.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export interface BackfillOptions {
  dryRun?: boolean;
  batchSize?: number;
  throttleMs?: number;
}

export interface StreamStats {
  scanned: number;
  inserted: number;
  skipped: number;
}

export function parseCliOptions(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    dryRun: false,
    batchSize: 500,
    throttleMs: 25,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--batch-size=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val > 0) options.batchSize = Math.min(val, 2000);
    } else if (arg.startsWith('--throttle-ms=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val >= 0) options.throttleMs = val;
    }
  }

  return options;
}

export function auditBackfillDbOptions(): DataSourceOptions {
  const postgres = databaseConfig().postgres;
  const common = {
    type: 'postgres' as const,
    synchronize: false,
    logging: false,
  };

  if (postgres.url) {
    return { ...common, url: postgres.url };
  }

  return {
    ...common,
    host: postgres.host,
    port: postgres.port,
    username: postgres.username,
    password: postgres.password,
    database: postgres.database,
    ssl: postgres.ssl ? { rejectUnauthorized: true } : false,
  };
}

/**
 * Ensures monthly partitions exist for all historical dates up to currentYear + 1,
 * and adds audit_logs_default to prevent missing partition crashes.
 */
export async function ensureHistoricalPartitions(
  queryRunner: QueryRunner,
): Promise<{ minDate: Date; partitionsCreated: number }> {
  const minDateRes = await queryRunner.query(`
    SELECT LEAST(
      COALESCE((SELECT MIN("createdAt") FROM "users"), NOW()),
      COALESCE((SELECT MIN("startedAt") FROM "assessment_attempts"), NOW()),
      COALESCE((SELECT MIN("createdAt") FROM "submissions"), NOW()),
      COALESCE((SELECT MIN("createdAt") FROM "exam_security_events"), NOW())
    ) AS min_date;
  `);

  const rawMin = minDateRes[0]?.min_date;
  const minDate = rawMin ? new Date(rawMin) : new Date(2024, 0, 1);
  const startYear = Math.max(minDate.getFullYear(), 2020);
  const endYear = new Date().getFullYear() + 1;

  let partitionsCreated = 0;

  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const mStr = m.toString().padStart(2, '0');
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      const nextMStr = nextM.toString().padStart(2, '0');
      const partitionName = `audit_logs_y${y}m${mStr}`;

      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "${partitionName}" PARTITION OF "audit_logs"
        FOR VALUES FROM ('${y}-${mStr}-01 00:00:00') TO ('${nextY}-${nextMStr}-01 00:00:00');
      `);
      partitionsCreated++;
    }
  }

  // Attempt to create default partition for any edge cases
  try {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs_default" PARTITION OF "audit_logs" DEFAULT;
    `);
  } catch (err: any) {
    // If table already partitioned without default or default exists, ignore
  }

  return { minDate, partitionsCreated };
}

/**
 * Bulk insert helper with ON CONFLICT ("id", "timestamp") DO NOTHING.
 * Returns { inserted, skipped }.
 */
export async function bulkInsertAuditLogs(
  queryRunner: QueryRunner,
  rows: Array<{
    id: string;
    actorId?: string | null;
    actorEmail: string;
    action: string;
    target: string;
    targetType: string;
    studentId?: string | null;
    attemptId?: string | null;
    assessmentId?: string | null;
    riskWeight: number;
    metadata: Record<string, any>;
    timestamp: Date;
  }>,
  dryRun = false,
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };
  if (dryRun) return { inserted: rows.length, skipped: 0 };

  const valuesClauses: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  for (const row of rows) {
    valuesClauses.push(
      `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`,
    );
    params.push(
      row.id,
      row.actorId || null,
      row.actorEmail || '',
      row.action,
      row.target || '',
      row.targetType || '',
      row.studentId || null,
      row.attemptId || null,
      row.assessmentId || null,
      row.riskWeight || 0,
      JSON.stringify(row.metadata || {}),
      row.timestamp,
    );
  }

  const sql = `
    INSERT INTO "audit_logs" (
      "id", "actorId", "actorEmail", "action", "target", "targetType",
      "studentId", "attemptId", "assessmentId", "riskWeight", "metadata", "timestamp"
    )
    VALUES ${valuesClauses.join(', ')}
    ON CONFLICT ("id", "timestamp") DO NOTHING;
  `;

  const result = await queryRunner.query(sql, params);
  const rowCount = Array.isArray(result) && result[1] !== undefined ? result[1] : (result?.rowCount ?? rows.length);
  const inserted = Number(rowCount) || 0;
  const skipped = rows.length - inserted;

  return { inserted, skipped };
}

/**
 * Stream A: User Registrations
 */
export async function backfillUsersStream(
  queryRunner: QueryRunner,
  options: BackfillOptions,
): Promise<StreamStats> {
  const stats: StreamStats = { scanned: 0, inserted: 0, skipped: 0 };
  const batchSize = options.batchSize || 500;
  let offset = 0;

  while (true) {
    const users = await queryRunner.query(
      `SELECT id, name, email, role, uid, "authProvider", "createdAt"
       FROM "users"
       ORDER BY "createdAt" ASC, id ASC
       LIMIT $1 OFFSET $2;`,
      [batchSize, offset],
    );

    if (!users || users.length === 0) break;
    stats.scanned += users.length;

    const mapped = users.map((u: any) => ({
      id: generateDeterministicUuid(`USER_REGISTERED:${u.id}`),
      actorId: u.id,
      actorEmail: (u.email || '').toLowerCase().trim(),
      action: 'USER_REGISTERED',
      target: u.name || u.email || u.id,
      targetType: 'User',
      studentId: u.role === 'student' ? u.id : null,
      riskWeight: 0,
      timestamp: new Date(u.createdAt),
      metadata: {
        actorName: u.name,
        actorRole: u.role,
        actorUid: u.uid,
        authProvider: u.authProvider,
        backfilled: true,
        sourceEntityId: u.id,
      },
    }));

    const { inserted, skipped } = await bulkInsertAuditLogs(queryRunner, mapped, options.dryRun);
    stats.inserted += inserted;
    stats.skipped += skipped;

    offset += users.length;
    if (options.throttleMs) await new Promise((r) => setTimeout(r, options.throttleMs));
  }

  return stats;
}

/**
 * Stream B: Assessment Completed Attempts
 */
export async function backfillAssessmentsStream(
  queryRunner: QueryRunner,
  options: BackfillOptions,
): Promise<StreamStats> {
  const stats: StreamStats = { scanned: 0, inserted: 0, skipped: 0 };
  const batchSize = options.batchSize || 500;
  let offset = 0;

  while (true) {
    const attempts = await queryRunner.query(
      `SELECT 
         aa.id, aa.assessment_id, aa.student_id, aa.status, aa.score, aa."marksObtained",
         aa.percentage, aa."tabSwitchCount", aa."violationsCount",
         COALESCE(aa."submittedAt", aa."updatedAt", aa."startedAt") AS completed_at,
         a.title AS assessment_title,
         u.name AS student_name, u.email AS student_email, u.uid AS student_uid
       FROM "assessment_attempts" aa
       LEFT JOIN "assessments" a ON a.id = aa.assessment_id
       LEFT JOIN "users" u ON u.id = aa.student_id
       WHERE aa.status IN ('submitted', 'auto_submitted', 'timed_out', 'disqualified')
       ORDER BY completed_at ASC, aa.id ASC
       LIMIT $1 OFFSET $2;`,
      [batchSize, offset],
    );

    if (!attempts || attempts.length === 0) break;
    stats.scanned += attempts.length;

    const mapped = attempts.map((a: any) => {
      let action = 'ASSESSMENT_SUBMITTED';
      if (a.status === 'auto_submitted') action = 'ASSESSMENT_AUTO_SUBMITTED';
      else if (a.status === 'disqualified') action = 'ASSESSMENT_DISQUALIFIED';
      else if (a.status === 'timed_out') action = 'ASSESSMENT_TIMED_OUT';

      const riskWeight = a.status === 'disqualified' ? 4 : ((a.violationsCount || 0) > 0 ? 2 : 0);

      return {
        id: generateDeterministicUuid(`ASSESSMENT_${a.status.toUpperCase()}:${a.id}`),
        actorId: a.student_id,
        actorEmail: (a.student_email || '').toLowerCase().trim(),
        action,
        target: a.assessment_title || a.assessment_id || 'Assessment',
        targetType: 'Assessment',
        studentId: a.student_id,
        attemptId: a.id,
        assessmentId: a.assessment_id,
        riskWeight,
        timestamp: new Date(a.completed_at),
        metadata: {
          actorName: a.student_name,
          actorRole: 'student',
          actorUid: a.student_uid,
          targetTitle: a.assessment_title,
          score: a.score,
          marksObtained: a.marksObtained,
          percentage: a.percentage,
          tabSwitchCount: a.tabSwitchCount || 0,
          violationsCount: a.violationsCount || 0,
          status: a.status,
          backfilled: true,
          sourceEntityId: a.id,
        },
      };
    });

    const { inserted, skipped } = await bulkInsertAuditLogs(queryRunner, mapped, options.dryRun);
    stats.inserted += inserted;
    stats.skipped += skipped;

    offset += attempts.length;
    if (options.throttleMs) await new Promise((r) => setTimeout(r, options.throttleMs));
  }

  return stats;
}

/**
 * Stream C: First-Accepted Problem Submissions
 * Strictly filters to status='Accepted' and DISTINCT ON ("userId", "problemId").
 * Excludes transient code executions and unaccepted trials.
 */
export async function backfillSubmissionsStream(
  queryRunner: QueryRunner,
  options: BackfillOptions,
): Promise<StreamStats> {
  const stats: StreamStats = { scanned: 0, inserted: 0, skipped: 0 };
  const batchSize = options.batchSize || 500;
  let offset = 0;

  while (true) {
    const solves = await queryRunner.query(
      `SELECT 
         s.id, s."userId", s."problemId", s.language, s.runtime, s.memory, s."createdAt",
         COALESCE(p.title, pm.title, s."problemId"::text) AS problem_title,
         u.name AS student_name, u.email AS student_email, u.uid AS student_uid, u.role AS student_role
       FROM (
         SELECT DISTINCT ON ("userId", "problemId")
           id, "userId", "problemId", language, runtime, memory, "createdAt"
         FROM "submissions"
         WHERE status = 'Accepted'
         ORDER BY "userId", "problemId", "createdAt" ASC
       ) s
       LEFT JOIN "problems" p ON p.id = s."problemId"
       LEFT JOIN "problem_metadata" pm ON pm.id = s."problemId"
       LEFT JOIN "users" u ON u.id = s."userId"
       ORDER BY s."createdAt" ASC, s.id ASC
       LIMIT $1 OFFSET $2;`,
      [batchSize, offset],
    );

    if (!solves || solves.length === 0) break;
    stats.scanned += solves.length;

    const mapped = solves.map((s: any) => ({
      id: generateDeterministicUuid(`SUBMISSION_ACCEPTED:${s.id}`),
      actorId: s.userId,
      actorEmail: (s.student_email || '').toLowerCase().trim(),
      action: 'SUBMISSION_ACCEPTED',
      target: s.problem_title || 'Practice Problem',
      targetType: 'Problem',
      studentId: s.userId,
      riskWeight: 0,
      timestamp: new Date(s.createdAt),
      metadata: {
        actorName: s.student_name,
        actorRole: s.student_role || 'student',
        actorUid: s.student_uid,
        targetTitle: s.problem_title,
        language: s.language,
        runtime: s.runtime,
        memory: s.memory,
        backfilled: true,
        sourceEntityId: s.id,
      },
    }));

    const { inserted, skipped } = await bulkInsertAuditLogs(queryRunner, mapped, options.dryRun);
    stats.inserted += inserted;
    stats.skipped += skipped;

    offset += solves.length;
    if (options.throttleMs) await new Promise((r) => setTimeout(r, options.throttleMs));
  }

  return stats;
}

/**
 * Stream D: Exam Security & Proctoring Events
 */
export async function backfillSecurityEventsStream(
  queryRunner: QueryRunner,
  options: BackfillOptions,
): Promise<StreamStats> {
  const stats: StreamStats = { scanned: 0, inserted: 0, skipped: 0 };
  const batchSize = options.batchSize || 500;
  let offset = 0;

  while (true) {
    const events = await queryRunner.query(
      `SELECT 
         e.id, e.session_id, e.candidate_id, e.assessment_id, e."eventType", e.severity, e.metadata, e."createdAt",
         u.name AS candidate_name, u.email AS candidate_email, u.uid AS candidate_uid
       FROM "exam_security_events" e
       LEFT JOIN "users" u ON u.id = e.candidate_id
       ORDER BY e."createdAt" ASC, e.id ASC
       LIMIT $1 OFFSET $2;`,
      [batchSize, offset],
    );

    if (!events || events.length === 0) break;
    stats.scanned += events.length;

    const mapped = events.map((e: any) => {
      const riskWeight = e.eventType === 'tab_switch' ? 2 : 3;
      return {
        id: generateDeterministicUuid(`EXAM_SECURITY_EVENT:${e.id}`),
        actorId: e.candidate_id,
        actorEmail: (e.candidate_email || '').toLowerCase().trim(),
        action: 'EXAM_SECURITY_EVENT',
        target: e.eventType || 'Proctoring Warning',
        targetType: 'ExamSession',
        studentId: e.candidate_id,
        assessmentId: e.assessment_id,
        riskWeight,
        timestamp: new Date(e.createdAt),
        metadata: {
          actorName: e.candidate_name,
          actorRole: 'student',
          actorUid: e.candidate_uid,
          eventType: e.eventType,
          severity: e.severity,
          sessionId: e.session_id,
          details: e.metadata,
          backfilled: true,
          sourceEntityId: e.id,
        },
      };
    });

    const { inserted, skipped } = await bulkInsertAuditLogs(queryRunner, mapped, options.dryRun);
    stats.inserted += inserted;
    stats.skipped += skipped;

    offset += events.length;
    if (options.throttleMs) await new Promise((r) => setTimeout(r, options.throttleMs));
  }

  return stats;
}

/**
 * Main Runner Function
 */
export async function runAuditMilestonesBackfill(customOptions?: BackfillOptions): Promise<void> {
  const options = customOptions || parseCliOptions();
  const startTime = Date.now();

  console.log('====================================================');
  console.log(`CODE-SKILL: AUDIT LOG HISTORICAL BACKFILL (PHASE 2)`);
  console.log(`Mode: ${options.dryRun ? 'DRY-RUN (No writes)' : 'LIVE EXECUTION'}`);
  console.log(`Batch Size: ${options.batchSize} | Throttle: ${options.throttleMs}ms`);
  console.log('====================================================');

  const dataSource = new DataSource(auditBackfillDbOptions());

  try {
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      // 1. Session-level advisory lock
      console.log('Acquiring session-level advisory lock (0x454D4954)...');
      const lockRes = await queryRunner.query(
        'SELECT pg_try_advisory_lock($1) AS acquired;',
        [AUDIT_BACKFILL_LOCK_ID],
      );

      if (!lockRes[0]?.acquired) {
        console.error('ERROR: Another audit backfill process currently holds the advisory lock. Aborting.');
        process.exit(1);
      }

      try {
        // 2. Ensure historical partitions exist
        console.log('Verifying and auto-creating historical monthly partitions...');
        const { minDate, partitionsCreated } = await ensureHistoricalPartitions(queryRunner);
        console.log(`Historical boundary identified: ${minDate.toISOString().slice(0, 10)}. Ready (${partitionsCreated} partition windows checked).`);

        // 3. Stream A: Users
        console.log('\n[Stream A] Backfilling User Registrations...');
        const userStats = await backfillUsersStream(queryRunner, options);
        console.log(`[Stream A Done] Scanned: ${userStats.scanned} | Inserted: ${userStats.inserted} | Skipped: ${userStats.skipped}`);

        // 4. Stream B: Assessments
        console.log('\n[Stream B] Backfilling Assessment Submissions...');
        const assessmentStats = await backfillAssessmentsStream(queryRunner, options);
        console.log(`[Stream B Done] Scanned: ${assessmentStats.scanned} | Inserted: ${assessmentStats.inserted} | Skipped: ${assessmentStats.skipped}`);

        // 5. Stream C: Submissions (First Accepted solves only)
        console.log('\n[Stream C] Backfilling First-Accepted Problem Submissions...');
        const submissionStats = await backfillSubmissionsStream(queryRunner, options);
        console.log(`[Stream C Done] Scanned: ${submissionStats.scanned} | Inserted: ${submissionStats.inserted} | Skipped: ${submissionStats.skipped}`);

        // 6. Stream D: Exam Security Events
        console.log('\n[Stream D] Backfilling Exam Security Incidents...');
        const securityStats = await backfillSecurityEventsStream(queryRunner, options);
        console.log(`[Stream D Done] Scanned: ${securityStats.scanned} | Inserted: ${securityStats.inserted} | Skipped: ${securityStats.skipped}`);

        // Summary
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const totalScanned = userStats.scanned + assessmentStats.scanned + submissionStats.scanned + securityStats.scanned;
        const totalInserted = userStats.inserted + assessmentStats.inserted + submissionStats.inserted + securityStats.inserted;
        const totalSkipped = userStats.skipped + assessmentStats.skipped + submissionStats.skipped + securityStats.skipped;

        console.log('\n====================================================');
        console.log('AUDIT LOG HISTORICAL BACKFILL SUMMARY REPORT');
        console.log('====================================================');
        console.log(`Stream                       Scanned   Inserted   Skipped`);
        console.log(`----------------------------------------------------`);
        console.log(`Users (Registrations)        ${String(userStats.scanned).padEnd(9)} ${String(userStats.inserted).padEnd(10)} ${userStats.skipped}`);
        console.log(`Assessments (Submissions)    ${String(assessmentStats.scanned).padEnd(9)} ${String(assessmentStats.inserted).padEnd(10)} ${assessmentStats.skipped}`);
        console.log(`Code Solves (1st Accepted)   ${String(submissionStats.scanned).padEnd(9)} ${String(submissionStats.inserted).padEnd(10)} ${submissionStats.skipped}`);
        console.log(`Exam Security Events         ${String(securityStats.scanned).padEnd(9)} ${String(securityStats.inserted).padEnd(10)} ${securityStats.skipped}`);
        console.log(`----------------------------------------------------`);
        console.log(`TOTAL                        ${String(totalScanned).padEnd(9)} ${String(totalInserted).padEnd(10)} ${totalSkipped}`);
        console.log(`Completed in ${elapsedSec}s in ${options.dryRun ? 'DRY-RUN mode' : 'LIVE mode'}.`);
        console.log('====================================================\n');
      } finally {
        // Unlock session-level advisory lock
        await queryRunner.query('SELECT pg_advisory_unlock($1);', [AUDIT_BACKFILL_LOCK_ID]);
        console.log('Session-level advisory lock released.');
      }
    } finally {
      await queryRunner.release();
    }
  } finally {
    await dataSource.destroy();
  }
}

// Direct execution entrypoint
if (require.main === module) {
  runAuditMilestonesBackfill()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal backfill error:', err);
      process.exit(1);
    });
}
