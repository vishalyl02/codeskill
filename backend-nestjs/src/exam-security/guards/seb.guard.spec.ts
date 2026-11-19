import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import { SebGuard } from './seb.guard';
import { RedisService } from '../../redis/redis.service';

describe('SebGuard (Cryptographic LockDown Attestation & Legacy SEB)', () => {
  let guard: SebGuard;
  let mockRedisClient: any;
  let mockRedisService: Partial<RedisService>;

  // Generate an authentic ECDSA P-256 keypair for testing
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const testSessionId = 'lockdown-session-uuid-1234';
  const testUserId = 'user-uuid-student-1';
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

    guard = new SebGuard(mockRedisService as RedisService);

    // Pre-populate attestation session in mock Redis
    redisStorage.set(`exam:attestation:${testSessionId}`, {
      userId: testUserId,
      publicKeyPem: publicKey,
      os: 'macos',
      clientVersion: '1.0.0',
      ip: '127.0.0.1',
    });
  });

  function createMockContext(req: any): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getClass: () => ({}),
      getHandler: () => ({}),
    } as unknown as ExecutionContext;
  }

  function signPayload(method: string, path: string, timestamp: string, nonce: string, body: any): string {
    const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
    const canonicalMessage = `${method.toUpperCase()}:${path}:${timestamp}:${nonce}:${bodyHash}`;

    const signer = crypto.createSign('SHA256');
    signer.update(canonicalMessage);
    return signer.sign(privateKey, 'hex');
  }

  describe('Tauri LockDown ECDSA Attestation Verification', () => {
    it('allows access with valid ECDSA P-256 signature and fresh timestamp', async () => {
      const now = Date.now().toString();
      const nonce = crypto.randomUUID();
      const method = 'POST';
      const path = '/api/assessments/asmt-1/submit';
      const body = { answer: 'option-a' };
      const signature = signPayload(method, path, now, nonce, body);

      const req = {
        method,
        originalUrl: path,
        path,
        body,
        headers: {
          'x-codeskill-session-id': testSessionId,
          'x-codeskill-timestamp': now,
          'x-codeskill-nonce': nonce,
          'x-codeskill-signature': signature,
        },
        user: { id: testUserId },
      };

      const result = await guard.canActivate(createMockContext(req));
      expect(result).toBe(true);
      expect(req).toHaveProperty('lockdownAttestation');
    });

    it('rejects request with expired timestamp (> 15 seconds drift)', async () => {
      const expiredTimestamp = (Date.now() - 20000).toString(); // 20s ago
      const nonce = crypto.randomUUID();
      const method = 'GET';
      const path = '/api/assessments/asmt-1/take';
      const signature = signPayload(method, path, expiredTimestamp, nonce, null);

      const req = {
        method,
        originalUrl: path,
        path,
        body: null,
        headers: {
          'x-codeskill-session-id': testSessionId,
          'x-codeskill-timestamp': expiredTimestamp,
          'x-codeskill-nonce': nonce,
          'x-codeskill-signature': signature,
        },
      };

      await expect(guard.canActivate(createMockContext(req))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects replayed nonce on second request', async () => {
      const now = Date.now().toString();
      const nonce = 'fixed-replay-nonce-999';
      const method = 'POST';
      const path = '/api/exam-security/session/1/heartbeat';
      const body = {};
      const signature = signPayload(method, path, now, nonce, body);

      const req = {
        method,
        originalUrl: path,
        path,
        body,
        headers: {
          'x-codeskill-session-id': testSessionId,
          'x-codeskill-timestamp': now,
          'x-codeskill-nonce': nonce,
          'x-codeskill-signature': signature,
        },
        user: { id: testUserId },
      };

      // First request succeeds and claims nonce
      const firstResult = await guard.canActivate(createMockContext(req));
      expect(firstResult).toBe(true);

      // Second request with identical nonce must be rejected
      await expect(guard.canActivate(createMockContext(req))).rejects.toThrow(
        /Replay attack detected/,
      );
    });

    it('rejects tampered request body', async () => {
      const now = Date.now().toString();
      const nonce = crypto.randomUUID();
      const method = 'POST';
      const path = '/api/submissions';
      const originalBody = { code: 'console.log("hello");' };
      const signature = signPayload(method, path, now, nonce, originalBody);

      // Body modified in transit
      const tamperedBody = { code: 'console.log("tampered");' };

      const req = {
        method,
        originalUrl: path,
        path,
        body: tamperedBody,
        headers: {
          'x-codeskill-session-id': testSessionId,
          'x-codeskill-timestamp': now,
          'x-codeskill-nonce': nonce,
          'x-codeskill-signature': signature,
        },
        user: { id: testUserId },
      };

      await expect(guard.canActivate(createMockContext(req))).rejects.toThrow(
        /Invalid CodeSkill LockDown cryptographic signature/,
      );
    });

    it('rejects request when attestation session does not exist', async () => {
      const now = Date.now().toString();
      const nonce = crypto.randomUUID();
      const method = 'GET';
      const path = '/api/test';
      const signature = signPayload(method, path, now, nonce, null);

      const req = {
        method,
        originalUrl: path,
        path,
        headers: {
          'x-codeskill-session-id': 'non-existent-session-id',
          'x-codeskill-timestamp': now,
          'x-codeskill-nonce': nonce,
          'x-codeskill-signature': signature,
        },
      };

      await expect(guard.canActivate(createMockContext(req))).rejects.toThrow(
        /Invalid or expired CodeSkill LockDown attestation session/,
      );
    });

    it('allows access when client signed empty body but express parsed empty object', async () => {
      const now = Date.now().toString();
      const nonce = crypto.randomUUID();
      const method = 'GET';
      const path = '/api/assessments/active';
      // Client signed with empty string body ""
      const signature = signPayload(method, path, now, nonce, '');

      const req = {
        method,
        originalUrl: `${path}?sort=asc`,
        url: `${path}?sort=asc`,
        path,
        body: {}, // Express body-parser parsed empty object
        headers: {
          'x-codeskill-session-id': testSessionId,
          'x-codeskill-timestamp': now,
          'x-codeskill-nonce': nonce,
          'x-codeskill-signature': signature,
        },
        user: { _id: testUserId }, // MongoDB-style user ID
      };

      const result = await guard.canActivate(createMockContext(req));
      expect(result).toBe(true);
    });

    it('rejects request when user ID does not match attested session owner', async () => {
      const now = Date.now().toString();
      const nonce = crypto.randomUUID();
      const method = 'GET';
      const path = '/api/test';
      const signature = signPayload(method, path, now, nonce, null);

      const req = {
        method,
        originalUrl: path,
        path,
        headers: {
          'x-codeskill-session-id': testSessionId,
          'x-codeskill-timestamp': now,
          'x-codeskill-nonce': nonce,
          'x-codeskill-signature': signature,
        },
        user: { id: 'different-imposter-user-id' },
      };

      await expect(guard.canActivate(createMockContext(req))).rejects.toThrow(
        /Attested LockDown session does not belong to the current authenticated user/,
      );
    });
  });

  describe('Legacy Safe Exam Browser (SEB) & Fallback Paths', () => {
    it('preserves backwards compatibility for legacy SEB request hash headers', async () => {
      const req = {
        headers: {
          'x-safeexambrowser-requesthash': 'dummy-seb-hash-abcdef123456',
          'user-agent': 'SafeExamBrowser/3.3.0',
        },
      };

      const result = await guard.canActivate(createMockContext(req));
      expect(result).toBe(true);
    });

    it('rejects unauthenticated standard browser requests without SEB or LockDown headers', async () => {
      const req = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
      };

      await expect(guard.canActivate(createMockContext(req))).rejects.toThrow(
        /CodeSkill LockDown or Safe Exam Browser is required/,
      );
    });

    it('permits standard browser requests when assessment does not require LockDown (requireLockdown: false)', async () => {
      const mockDataSource: any = {
        isInitialized: true,
        query: jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('FROM "assessments"')) {
            return [{ requireLockdown: false, securityPolicy: { requireSEB: false } }];
          }
          return [];
        }),
      };

      const assessmentAwareGuard = new SebGuard(
        mockRedisService as RedisService,
        undefined,
        mockDataSource,
      );

      const req = {
        params: { id: 'asmt-normal-1' },
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
      };

      const result = await assessmentAwareGuard.canActivate(createMockContext(req));
      expect(result).toBe(true);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT "requireLockdown"'),
        ['asmt-normal-1'],
      );
    });

    it('rejects standard browser requests when assessment explicitly requires LockDown (requireLockdown: true)', async () => {
      const mockDataSource: any = {
        isInitialized: true,
        query: jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('FROM "assessments"')) {
            return [{ requireLockdown: true, securityPolicy: {} }];
          }
          return [];
        }),
      };

      const assessmentAwareGuard = new SebGuard(
        mockRedisService as RedisService,
        undefined,
        mockDataSource,
      );

      const req = {
        params: { id: 'asmt-lockdown-1' },
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
      };

      await expect(assessmentAwareGuard.canActivate(createMockContext(req))).rejects.toThrow(
        /CodeSkill LockDown or Safe Exam Browser is required/,
      );
    });

    it('resolves attemptId to assessmentId from assessment_attempts and permits non-lockdown exam', async () => {
      const mockDataSource: any = {
        isInitialized: true,
        query: jest.fn().mockImplementation(async (sql: string, params: any[]) => {
          if (sql.includes('FROM "assessment_attempts"')) {
            return [{ assessmentId: 'resolved-asmt-uuid' }];
          }
          if (sql.includes('FROM "assessments"')) {
            return [{ requireLockdown: false, securityPolicy: {} }];
          }
          return [];
        }),
      };

      const assessmentAwareGuard = new SebGuard(
        mockRedisService as RedisService,
        undefined,
        mockDataSource,
      );

      const req = {
        params: { id: 'attempt-uuid-777' },
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
      };

      const result = await assessmentAwareGuard.canActivate(createMockContext(req));
      expect(result).toBe(true);
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT "assessment_id" as "assessmentId"'),
        ['attempt-uuid-777'],
      );
    });
  });
});
