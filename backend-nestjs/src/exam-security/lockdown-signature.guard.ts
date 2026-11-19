import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { ExamSecurityService } from './exam-security.service';

@Injectable()
export class LockdownSignatureGuard implements CanActivate {
  // In-memory fallback nonce cache for environments without a connected Redis instance
  private readonly inMemoryNonces = new Map<string, number>();
  // Short-lived in-memory cache for assessment requireLockdown flag (60s TTL)
  private readonly assessmentLockdownCache = new Map<string, { requireLockdown: boolean; exp: number }>();
  // Short-lived in-memory cache for attemptId -> assessmentId resolution (120s TTL)
  private readonly attemptAssessmentCache = new Map<string, { assessmentId: string; exp: number }>();

  constructor(
    @Inject(RedisService) @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly examSecurityService?: ExamSecurityService,
    @Inject(DataSource) @Optional() private readonly dataSource?: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const headers = req.headers || {};

    const sessionId = (headers['x-lockdown-session-id'] as string) || '';
    const timestampStr = (headers['x-lockdown-timestamp'] as string) || '';
    const nonce = (headers['x-lockdown-nonce'] as string) || '';
    const binaryHash = (headers['x-lockdown-binary-hash'] as string) || '';
    const signature = (headers['x-lockdown-signature'] as string) || '';

    const hasAnyLockdownHeader = Boolean(
      sessionId || timestampStr || nonce || binaryHash || signature,
    );

    // 1. If no LockDown headers are supplied, check if LockDown is strictly required for this assessment
    if (!hasAnyLockdownHeader) {
      const isLockdownRequired = await this.checkIfLockdownRequired(req);
      if (!isLockdownRequired) {
        // Standard non-LockDown assessment allows standard requests
        return true;
      }
      throw new ForbiddenException(
        'Access denied: CodeSkill LockDown per-request signature headers are required.',
      );
    }

    // 2. All 5 headers are strictly required when signing
    if (!sessionId || !timestampStr || !nonce || !binaryHash || !signature) {
      throw new ForbiddenException(
        'Missing required LockDown request signing headers (X-Lockdown-Session-Id, X-Lockdown-Timestamp, X-Lockdown-Nonce, X-Lockdown-Binary-Hash, X-Lockdown-Signature).',
      );
    }

    // 3. Timestamp verification (±60 seconds clock skew tolerance)
    const now = Date.now();
    const reqTimestamp = parseInt(timestampStr, 10);
    if (isNaN(reqTimestamp) || Math.abs(now - reqTimestamp) > 60_000) {
      throw new ForbiddenException(
        'LockDown request timestamp expired or clock skew exceeds ±60 seconds.',
      );
    }

    // 4. Replay attack prevention: Nonce must be unique (180s TTL)
    const nonceKey = `lockdown:nonce:${nonce}`;
    let redisChecked = false;

    if (this.redisService) {
      try {
        const client = this.redisService.getClient();
        if (client && typeof (client as any).set === 'function') {
          const res = await (client as any).set(nonceKey, '1', 'EX', 180, 'NX');
          redisChecked = true;
          if (res !== 'OK') {
            throw new ForbiddenException(
              'Replay attack detected: duplicate LockDown nonce.',
            );
          }
        }
      } catch (err) {
        if (err instanceof ForbiddenException) throw err;
        // Fall back to in-memory nonces on Redis transient failure
      }
    }

    if (!redisChecked) {
      // In-memory fallback
      for (const [n, exp] of this.inMemoryNonces.entries()) {
        if (now >= exp) this.inMemoryNonces.delete(n);
      }
      if (this.inMemoryNonces.has(nonce)) {
        throw new ForbiddenException(
          'Replay attack detected: duplicate LockDown nonce.',
        );
      }
      this.inMemoryNonces.set(nonce, now + 180_000);
    }

    // 5. Retrieve Candidate's Attestation Record & Session HMAC Key
    let attestationRecord: any = null;
    if (this.redisService) {
      try {
        attestationRecord = await this.redisService.get(`exam:attestation:${sessionId}`);
      } catch {
        // Fallback
      }
    }

    if (!attestationRecord) {
      throw new ForbiddenException(
        'Invalid or expired CodeSkill LockDown attestation session.',
      );
    }

    const sessionHmacKey =
      attestationRecord.sessionHmacKey ||
      attestationRecord.session_hmac_key;

    if (!sessionHmacKey) {
      throw new ForbiddenException(
        'No HMAC signing key found for this LockDown session.',
      );
    }

    // 6. Canonical Payload HMAC-SHA256 Verification
    // Format: "{METHOD}\n{PATH}\n{TIMESTAMP}\n{NONCE}\n{BODY_SHA256}\n{BINARY_HASH}"
    const method = (req.method || 'GET').toUpperCase();
    const reqPath = (req.originalUrl || req.url || '').split('?')[0];

    let bodySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    if (req.rawBody) {
      bodySha256 = crypto.createHash('sha256').update(req.rawBody).digest('hex');
    } else if (req.body && typeof req.body === 'string') {
      bodySha256 = crypto.createHash('sha256').update(req.body).digest('hex');
    } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      bodySha256 = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
    }

    const canonicalPayload = `${method}\n${reqPath}\n${timestampStr}\n${nonce}\n${bodySha256}\n${binaryHash}`;

    let isSignatureValid = false;
    try {
      const keyBuf =
        sessionHmacKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(sessionHmacKey)
          ? Buffer.from(sessionHmacKey, 'hex')
          : Buffer.from(sessionHmacKey, 'utf8');

      const expectedSig = crypto
        .createHmac('sha256', keyBuf)
        .update(canonicalPayload)
        .digest('hex');

      const sigBuf = Buffer.from(signature, 'hex');
      const expectedBuf = Buffer.from(expectedSig, 'hex');

      if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        isSignatureValid = true;
      }
    } catch {
      isSignatureValid = false;
    }

    if (!isSignatureValid) {
      const userId =
        req.user?.id || req.user?.sub || attestationRecord.userId || 'unknown-candidate';
      const assessmentId =
        req.params?.id || req.params?.assessmentId || req.body?.assessmentId;

      void this.examSecurityService?.reportDirectViolation(
        userId,
        assessmentId,
        'INVALID_REQUEST_SIGNATURE',
        {
          method,
          path: reqPath,
          timestamp: timestampStr,
          nonce,
          binaryHash,
          reason: 'HMAC-SHA256 signature mismatch against candidate session key',
        },
      );

      throw new ForbiddenException('Invalid LockDown request signature.');
    }

    return true;
  }

  private async checkIfLockdownRequired(req: any): Promise<boolean> {
    const rawId =
      req.params?.id ||
      req.params?.assessmentId ||
      req.body?.assessmentId ||
      req.query?.assessmentId;
    const rawAttemptId = req.params?.attemptId || req.body?.attemptId;

    if (!rawId && !rawAttemptId) {
      return false;
    }

    if (!this.dataSource || !this.dataSource.isInitialized) {
      return false;
    }

    try {
      const assessmentId = await this.resolveAssessmentId(rawId, rawAttemptId);
      if (!assessmentId) return false;

      const now = Date.now();
      const cached = this.assessmentLockdownCache.get(assessmentId);
      if (cached && cached.exp > now) {
        return cached.requireLockdown;
      }

      const rows = await this.dataSource.query(
        `SELECT "requireLockdown" FROM "assessments" WHERE id::text = $1 OR "mongoId" = $1 LIMIT 1`,
        [assessmentId],
      );

      const requireLockdown = Boolean(rows && rows[0] && rows[0].requireLockdown);
      this.assessmentLockdownCache.set(assessmentId, {
        requireLockdown,
        exp: now + 60_000,
      });

      return requireLockdown;
    } catch {
      return false;
    }
  }

  private async resolveAssessmentId(rawId?: string, rawAttemptId?: string): Promise<string | null> {
    if (rawId) return rawId;
    if (!rawAttemptId || !this.dataSource || !this.dataSource.isInitialized) return null;

    const now = Date.now();
    const cached = this.attemptAssessmentCache.get(rawAttemptId);
    if (cached && cached.exp > now) {
      return cached.assessmentId;
    }

    try {
      const rows = await this.dataSource.query(
        `SELECT "assessmentId" FROM "assessment_attempts" WHERE id::text = $1 LIMIT 1`,
        [rawAttemptId],
      );
      if (rows && rows[0] && rows[0].assessmentId) {
        const assessmentId = String(rows[0].assessmentId);
        this.attemptAssessmentCache.set(rawAttemptId, {
          assessmentId,
          exp: now + 120_000,
        });
        return assessmentId;
      }
    } catch {
      // ignore
    }

    return null;
  }
}
