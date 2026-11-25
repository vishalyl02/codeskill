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
import { RedisService } from '../../redis/redis.service';
import { ExamSecurityService } from '../exam-security.service';

export interface LockDownAttestationRecord {
  userId: string;
  publicKeyPem: string;
  os: string;
  clientVersion: string;
  ip: string;
  createdAt: string;
}

@Injectable()
export class SebGuard implements CanActivate {
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

    const sessionId =
      (headers['x-codeskill-session-id'] as string) ||
      (headers['x-lockdown-session-id'] as string) ||
      '';

    // 1. Path A: Cryptographic CodeSkill LockDown Attestation Verification
    if (sessionId) {
      return this.verifyLockDownAttestation(req, headers, sessionId);
    }

    // 2. Reject unapproved browsers with explicit CodeSkill LockDown requirement
    const sebReqHash =
      (headers['x-safeexambrowser-requesthash'] as string) ||
      (headers['x-safeexambrowser-confighash'] as string) ||
      (headers['x-safeexambrowser-configkeyhash'] as string);
    const userAgent = String(headers['user-agent'] || '');
    const isSebUserAgent = /SEB|SafeExamBrowser/i.test(userAgent);

    if (sebReqHash || isSebUserAgent) {
      throw new ForbiddenException(
        'Access denied: CodeSkill LockDown is required for this assessment. Please launch via the official CodeSkill LockDown desktop application.',
      );
    }

    // 3. Path B: Check if target assessment requires CodeSkill LockDown
    const isLockdownRequired = await this.checkIfLockdownRequired(req);
    if (!isLockdownRequired) {
      // Standard browser is permitted for non-LockDown assessments
      return true;
    }

    // LockDown is required, but neither LockDown session was supplied
    throw new ForbiddenException(
      'Access denied: CodeSkill LockDown is required for this assessment. Please launch via the CodeSkill LockDown desktop application.',
    );
  }

  private async checkIfLockdownRequired(req: any): Promise<boolean> {
    const rawId =
      req.params?.id ||
      req.params?.assessmentId ||
      req.body?.assessmentId ||
      req.query?.assessmentId;
    const rawAttemptId = req.params?.attemptId || req.body?.attemptId;

    if (!rawId && !rawAttemptId) {
      // Cannot resolve assessment ID; default to requiring LockDown if guard is explicitly applied
      return true;
    }

    if (!this.dataSource || !this.dataSource.isInitialized) {
      // If DataSource is not available (e.g. unit tests without DB), retain strict protection
      return true;
    }

    try {
      const assessmentId = await this.resolveAssessmentId(rawId, rawAttemptId);
      if (!assessmentId) {
        return true;
      }

      // Check in-memory cache first
      const now = Date.now();
      const cached = this.assessmentLockdownCache.get(assessmentId);
      if (cached && cached.exp > now) {
        return cached.requireLockdown;
      }

      // Check Redis cache if available
      const redisKey = `exam:require-lockdown:${assessmentId}`;
      if (this.redisService) {
        try {
          const redisVal = await this.redisService.get<string>(redisKey);
          if (redisVal !== null && redisVal !== undefined) {
            const required = redisVal === 'true' || redisVal === '1';
            this.assessmentLockdownCache.set(assessmentId, { requireLockdown: required, exp: now + 60000 });
            return required;
          }
        } catch {
          /* ignore redis cache lookup failure */
        }
      }

      // Query database for requireLockdown and securityPolicy
      const result = await this.dataSource.query(
        `SELECT "requireLockdown", "securityPolicy" FROM "assessments" WHERE id::text = $1 OR "mongoId" = $1 OR code = $1 LIMIT 1`,
        [assessmentId],
      );

      if (!result || result.length === 0) {
        // Assessment row not found
        return true;
      }

      const row = result[0];
      const isRequired = Boolean(
        row.requireLockdown ||
        row.securityPolicy?.requireSEB ||
        row.securityPolicy?.requireLockdown ||
        row.securityPolicy?.secureExamMode === 'STRICT',
      );

      // Cache the result for 60 seconds
      this.assessmentLockdownCache.set(assessmentId, { requireLockdown: isRequired, exp: now + 60000 });
      if (this.redisService) {
        try {
          await this.redisService.set(redisKey, isRequired ? '1' : '0', 60);
        } catch {
          /* ignore redis cache write error */
        }
      }

      return isRequired;
    } catch {
      // Fallback on query error: strict protection
      return true;
    }
  }

  private async resolveAssessmentId(rawId?: string, rawAttemptId?: string): Promise<string | null> {
    if (rawAttemptId) {
      return this.lookupAssessmentByAttemptId(rawAttemptId);
    }

    if (!rawId) return null;

    // First check if rawId itself is an attemptId in assessment_attempts
    const resolvedFromAttempt = await this.lookupAssessmentByAttemptId(rawId);
    if (resolvedFromAttempt) {
      return resolvedFromAttempt;
    }

    // Otherwise rawId is the assessmentId or slug
    return rawId;
  }

  private async lookupAssessmentByAttemptId(attemptId: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.attemptAssessmentCache.get(attemptId);
    if (cached && cached.exp > now) {
      return cached.assessmentId;
    }

    try {
      const res = await this.dataSource!.query(
        `SELECT "assessment_id" as "assessmentId" FROM "assessment_attempts" WHERE id::text = $1 LIMIT 1`,
        [attemptId],
      );
      if (res && res.length > 0 && res[0].assessmentId) {
        const assessmentId = String(res[0].assessmentId);
        this.attemptAssessmentCache.set(attemptId, { assessmentId, exp: now + 120000 });
        return assessmentId;
      }
    } catch {
      /* ignore attempt assessment lookup failure */
    }

    return null;
  }

  private async verifyLockDownAttestation(
    req: any,
    headers: Record<string, string | undefined>,
    sessionId: string,
  ): Promise<boolean> {
    const timestamp =
      (headers['x-codeskill-timestamp'] as string) ||
      (headers['x-lockdown-timestamp'] as string) ||
      '';
    const nonce =
      (headers['x-codeskill-nonce'] as string) ||
      (headers['x-lockdown-nonce'] as string) ||
      '';
    const ecdsaSignature = (headers['x-codeskill-signature'] as string) || '';
    const hmacSignature = (headers['x-lockdown-signature'] as string) || '';

    if (!timestamp || !nonce || (!ecdsaSignature && !hmacSignature)) {
      throw new ForbiddenException(
        'Missing required CodeSkill LockDown attestation headers (timestamp, nonce, signature).',
      );
    }

    // Verify timestamp drift: |now - timestamp| <= 15000ms
    const reqTimestamp = Number(timestamp);
    if (isNaN(reqTimestamp) || Math.abs(Date.now() - reqTimestamp) > 15000) {
      throw new ForbiddenException(
        'CodeSkill LockDown request timestamp is expired or skewed by more than 15 seconds.',
      );
    }

    // Atomically claim Nonce to prevent replay attacks (SET exam:nonce:${nonce} 1 NX EX 60)
    await this.claimNonce(nonce);

    // Fetch attested record from Redis (exam:attestation:${sessionId})
    const attestation = await this.getAttestation(sessionId);
    if (!attestation) {
      throw new ForbiddenException(
        'Invalid or expired CodeSkill LockDown attestation session.',
      );
    }

    let isSignatureValid = false;

    // 1. If ECDSA signature is provided, verify against client public key
    if (ecdsaSignature && attestation.publicKeyPem) {
      let signatureBuffer: Buffer;
      try {
        signatureBuffer = /^[0-9a-fA-F]+$/.test(ecdsaSignature)
          ? Buffer.from(ecdsaSignature, 'hex')
          : Buffer.from(ecdsaSignature, 'base64');
      } catch {
        throw new ForbiddenException('Invalid LockDown signature encoding.');
      }

      const rawBodyString =
        req.body !== undefined && req.body !== null
          ? typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body)
          : '';
      const candidateBodyStrings = Array.from(
        new Set([rawBodyString, rawBodyString === '{}' ? '' : rawBodyString]),
      );
      const candidateBodyHashes = candidateBodyStrings.map((b) =>
        crypto.createHash('sha256').update(b).digest('hex'),
      );

      const candidatePaths = Array.from(
        new Set(
          [
            req.originalUrl,
            req.url,
            req.path,
            req.baseUrl ? `${req.baseUrl}${req.path}` : undefined,
            req.originalUrl ? req.originalUrl.split('?')[0] : undefined,
            req.url ? req.url.split('?')[0] : undefined,
          ].filter(Boolean) as string[],
        ),
      );

      for (const bodyHash of candidateBodyHashes) {
        for (const p of candidatePaths) {
          const canonicalPayload = `${req.method.toUpperCase()}:${p}:${timestamp}:${nonce}:${bodyHash}`;
          try {
            const verifier = crypto.createVerify('SHA256');
            verifier.update(canonicalPayload);
            if (verifier.verify(attestation.publicKeyPem, signatureBuffer)) {
              isSignatureValid = true;
              break;
            }
          } catch {
            // try next candidate
          }
        }
        if (isSignatureValid) break;
      }
    } else if (hmacSignature) {
      // 2. Continuous Hardware HMAC signature verification
      const sessionHmacKey =
        (attestation as any).sessionHmacKey ||
        (attestation as any).session_hmac_key;

      if (sessionHmacKey) {
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

        const binaryHash = (headers['x-lockdown-binary-hash'] as string) || '';
        const canonicalPayload = `${method}\n${reqPath}\n${timestamp}\n${nonce}\n${bodySha256}\n${binaryHash}`;

        try {
          const keyBuf =
            sessionHmacKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(sessionHmacKey)
              ? Buffer.from(sessionHmacKey, 'hex')
              : Buffer.from(sessionHmacKey, 'utf8');

          const expectedSig = crypto
            .createHmac('sha256', keyBuf)
            .update(canonicalPayload)
            .digest('hex');

          const sigBuf = Buffer.from(hmacSignature, 'hex');
          const expectedBuf = Buffer.from(expectedSig, 'hex');

          if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
            isSignatureValid = true;
          }
        } catch {
          isSignatureValid = false;
        }
      }
    }

    if (!isSignatureValid) {
      throw new ForbiddenException(
        'Invalid CodeSkill LockDown cryptographic signature. Request may have been tampered with.',
      );
    }

    // Ensure session belongs to current authenticated user if req.user is set
    const authenticatedUserId = req.user?.id || req.user?._id || req.user?.userId;
    if (authenticatedUserId && attestation.userId && authenticatedUserId !== attestation.userId) {
      throw new ForbiddenException(
        'Attested LockDown session does not belong to the current authenticated user.',
      );
    }

    req.lockdownAttestation = attestation;
    return true;
  }

  private async claimNonce(nonce: string): Promise<void> {
    const key = `exam:nonce:${nonce}`;
    const client = this.redisService?.getClient();

    if (client && typeof (client as any).set === 'function') {
      try {
        const result = await (client as any).set(key, '1', 'EX', 60, 'NX');
        if (result !== 'OK') {
          throw new ForbiddenException('Replay attack detected: nonce has already been used.');
        }
        return;
      } catch (err: any) {
        if (err instanceof ForbiddenException) throw err;
        // If Redis command fails, fall through to in-memory fallback
      }
    }

    // In-memory fallback
    const now = Date.now();
    // Prune nonces older than 60s
    for (const [k, exp] of this.inMemoryNonces.entries()) {
      if (exp <= now) this.inMemoryNonces.delete(k);
    }

    if (this.inMemoryNonces.has(nonce)) {
      throw new ForbiddenException('Replay attack detected: nonce has already been used.');
    }
    this.inMemoryNonces.set(nonce, now + 60000);
  }

  private async getAttestation(sessionId: string): Promise<LockDownAttestationRecord | null> {
    const key = `exam:attestation:${sessionId}`;
    if (this.redisService) {
      try {
        const data = await this.redisService.get<LockDownAttestationRecord>(key);
        if (data) return data;
      } catch {
        // fallback
      }
    }
    return null;
  }


}
