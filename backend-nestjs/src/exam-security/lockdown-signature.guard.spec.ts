import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import { LockdownSignatureGuard } from './lockdown-signature.guard';
import { RedisService } from '../redis/redis.service';
import { ExamSecurityService } from './exam-security.service';

describe('LockdownSignatureGuard (Continuous Per-Request Hardware-Signed Headers)', () => {
  let guard: LockdownSignatureGuard;
  let mockRedisClient: any;
  let mockRedisService: Partial<RedisService>;
  let mockExamSecurityService: Partial<ExamSecurityService>;
  let mockDataSource: any;

  const testSessionId = 'lockdown-session-uuid-1234';
  const testUserId = 'student-uuid-5678';
  const testAssessmentId = 'assessment-uuid-9999';
  const testSessionKey = crypto.randomBytes(32).toString('hex'); // 64 hex chars = 32 bytes
  let redisStorage: Map<string, any>;

  beforeEach(() => {
    redisStorage = new Map<string, any>();

    mockRedisClient = {
      set: jest.fn().mockImplementation((key: string, val: string, mode?: string, ttl?: number, flag?: string) => {
        if (flag === 'NX') {
          if (redisStorage.has(key)) return null;
          redisStorage.set(key, val);
          return 'OK';
        }
        redisStorage.set(key, val);
        return 'OK';
      }),
      get: jest.fn().mockImplementation((key: string) => {
        return redisStorage.get(key) || null;
      }),
    };

    mockRedisService = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
      get: jest.fn().mockImplementation(async <T>(key: string): Promise<T | null> => {
        const val = redisStorage.get(key);
        return val ? (val as T) : null;
      }),
      set: jest.fn().mockImplementation(async (key: string, val: any) => {
        redisStorage.set(key, val);
      }),
    };

    mockExamSecurityService = {
      reportDirectViolation: jest.fn().mockResolvedValue({ success: true }),
    };

    mockDataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ requireLockdown: true }]),
    };

    guard = new LockdownSignatureGuard(
      mockRedisService as RedisService,
      mockExamSecurityService as ExamSecurityService,
      mockDataSource as any,
    );

    // Seed valid attestation session in Redis
    redisStorage.set(`exam:attestation:${testSessionId}`, {
      userId: testUserId,
      sessionHmacKey: testSessionKey,
      clientBinaryHash: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
      os: 'macos',
      clientVersion: '1.0.0',
    });
  });

  const createMockContext = (headers: Record<string, string>, body: any = {}, method = 'POST', url = '/api/assessments/submit') => {
    const req = {
      headers,
      body,
      method,
      originalUrl: url,
      url,
      params: { assessmentId: testAssessmentId },
      user: { id: testUserId },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  };

  const createValidSignedHeaders = (
    method = 'POST',
    path = '/api/assessments/submit',
    body: any = {},
    customTimestamp?: number,
    customKey = testSessionKey,
  ) => {
    const timestamp = (customTimestamp ?? Date.now()).toString();
    const nonce = crypto.randomUUID();
    const binaryHash = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234';

    let bodySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    if (body && typeof body === 'object' && Object.keys(body).length > 0) {
      bodySha256 = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
    }

    const payload = `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodySha256}\n${binaryHash}`;
    const keyBuf = Buffer.from(customKey, 'hex');
    const signature = crypto.createHmac('sha256', keyBuf).update(payload).digest('hex');

    return {
      'x-lockdown-session-id': testSessionId,
      'x-lockdown-timestamp': timestamp,
      'x-lockdown-nonce': nonce,
      'x-lockdown-binary-hash': binaryHash,
      'x-lockdown-signature': signature,
    };
  };

  it('allows access without headers when assessment does not require LockDown', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ requireLockdown: false }]);
    const ctx = createMockContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects access when assessment requires LockDown but headers are missing', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ requireLockdown: true }]);
    const ctx = createMockContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('rejects requests missing any of the 5 required X-Lockdown-* headers', async () => {
    const headers = createValidSignedHeaders();
    delete (headers as any)['x-lockdown-signature'];
    const ctx = createMockContext(headers);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Missing required LockDown request signing headers');
  });

  it('rejects requests with clock skew exceeding ±60 seconds', async () => {
    const expiredTimestamp = Date.now() - 65_000;
    const headers = createValidSignedHeaders('POST', '/api/assessments/submit', {}, expiredTimestamp);
    const ctx = createMockContext(headers);
    await expect(guard.canActivate(ctx)).rejects.toThrow('LockDown request timestamp expired or clock skew exceeds ±60 seconds');
  });

  it('rejects replay attacks presenting a duplicate nonce', async () => {
    const headers = createValidSignedHeaders();
    const ctx1 = createMockContext(headers);
    const ctx2 = createMockContext(headers);

    await expect(guard.canActivate(ctx1)).resolves.toBe(true);
    await expect(guard.canActivate(ctx2)).rejects.toThrow('Replay attack detected: duplicate LockDown nonce');
  });

  it('rejects requests with an unknown or expired attestation session', async () => {
    const headers = createValidSignedHeaders();
    headers['x-lockdown-session-id'] = 'unknown-session-999';
    const ctx = createMockContext(headers);
    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or expired CodeSkill LockDown attestation session');
  });

  it('rejects requests with tampered payload or forged HMAC signature and logs violation', async () => {
    const headers = createValidSignedHeaders('POST', '/api/assessments/submit', { score: 100 });
    // Tamper with body without updating signature
    const ctx = createMockContext(headers, { score: 0 });

    await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid LockDown request signature');
    expect(mockExamSecurityService.reportDirectViolation).toHaveBeenCalledWith(
      testUserId,
      testAssessmentId,
      'INVALID_REQUEST_SIGNATURE',
      expect.objectContaining({
        reason: expect.stringContaining('HMAC-SHA256 signature mismatch'),
      }),
    );
  });

  it('accepts perfectly signed requests from authentic LockDown clients', async () => {
    const body = { answerId: 'q1-opt-b', candidateConfidence: 'high' };
    const headers = createValidSignedHeaders('POST', '/api/assessments/submit', body);
    const ctx = createMockContext(headers, body);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
