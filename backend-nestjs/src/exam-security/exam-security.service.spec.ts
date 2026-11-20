jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => {} }));

import { ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import { ExamSecurityService } from './exam-security.service';

describe('ExamSecurityService (ISSUE-SEC-001 Hardening)', () => {
  let service: ExamSecurityService;
  let assessmentRepo: any;
  let sessionRepo: any;
  let eventRepo: any;

  beforeEach(() => {
    assessmentRepo = {
      findOne: jest.fn(),
    };
    sessionRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((e) => ({ ...e, id: 'session-uuid-1' })),
      save: jest.fn().mockImplementation(async (e) => e),
    };
    eventRepo = {
      create: jest.fn().mockImplementation((payload) => payload),
      save: jest.fn(),
    };

    service = new ExamSecurityService(
      assessmentRepo as never,
      sessionRepo as never,
      eventRepo as never,
    );
  });

  it('rejects connection with ForbiddenException when assessment requires SEB but client is standard browser', async () => {
    assessmentRepo.findOne.mockResolvedValue({
      id: 'asmt-1',
      securityPolicy: {
        requireSEB: true,
      },
    });

    await expect(
      service.initSecureSession('asmt-1', 'cand-1', { isSEB: false }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects connection when assessment requires specific configKey and client provides plaintext body key without authentic SEB header hash (ISSUE-SEC-002)', async () => {
    assessmentRepo.findOne.mockResolvedValue({
      id: 'asmt-1',
      securityPolicy: {
        requireSEB: true,
        configKey: 'secret-exam-config-key-12345',
      },
    });

    await expect(
      service.initSecureSession(
        'asmt-1',
        'cand-1',
        { isSEB: true, configKey: 'secret-exam-config-key-12345' },
        { 'user-agent': 'SafeExamBrowser/3.3.0' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects connection when SEB header hash is mismatched or invalid', async () => {
    assessmentRepo.findOne.mockResolvedValue({
      id: 'asmt-1',
      securityPolicy: {
        requireSEB: true,
        configKey: 'secret-exam-config-key-12345',
      },
    });

    await expect(
      service.initSecureSession(
        'asmt-1',
        'cand-1',
        { isSEB: true },
        {
          'user-agent': 'SafeExamBrowser/3.3.0',
          'x-safeexambrowser-requesthash': 'invalidhash1234567890abcdef1234567890abcdef1234567890abcdef12345678',
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('accepts genuine SEB connection with valid URL request hash and returns cryptographically signed HMAC token', async () => {
    assessmentRepo.findOne.mockResolvedValue({
      id: 'asmt-1',
      durationMinutes: 60,
      securityPolicy: {
        requireSEB: true,
        configKey: 'approved-config-key',
      },
    });
    sessionRepo.findOne.mockResolvedValue(null);

    const fullUrl = 'https://exam.codeskill.io/exam-security/asmt-1/secure-session/init';
    const validSebHash = crypto
      .createHash('sha256')
      .update(fullUrl + 'approved-config-key')
      .digest('hex');

    const res = await service.initSecureSession(
      'asmt-1',
      'cand-1',
      { isSEB: true },
      {
        'user-agent': 'SafeExamBrowser/3.3.0',
        'x-safeexambrowser-requesthash': validSebHash,
      },
      fullUrl,
    );

    expect(res.success).toBe(true);
    expect(res.sessionId).toBe('session-uuid-1');
    expect(res.token).not.toBe('simulate-secure-token');
    // Valid SHA-256 HMAC is a 64-character hexadecimal string
    expect(res.token).toMatch(/^[a-f0-9]{64}$/);
  });

  describe('attestClient (CodeSkill LockDown ECDSA Attestation)', () => {
    let mockRedis: any;

    beforeEach(() => {
      mockRedis = {
        set: jest.fn().mockResolvedValue('OK'),
        get: jest.fn(),
      };
      service = new ExamSecurityService(
        assessmentRepo as never,
        sessionRepo as never,
        eventRepo as never,
        undefined,
        undefined,
        mockRedis,
      );
    });

    it('successfully attests client, generates session ID, and caches in Redis with 14400s TTL', async () => {
      const res = await service.attestClient(
        'user-123',
        {
          publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----',
          clientVersion: '1.0.0',
          os: 'macos',
          preflightPassed: true,
        },
        '10.0.0.1',
      );

      expect(res.success).toBe(true);
      expect(res.attestedSessionId).toBeDefined();
      expect(res.attestedSessionId).toMatch(/^[0-9a-f-]{36}$/);

      expect(mockRedis.set).toHaveBeenCalledWith(
        `exam:attestation:${res.attestedSessionId}`,
        expect.objectContaining({
          userId: 'user-123',
          os: 'macos',
          clientVersion: '1.0.0',
          ip: '10.0.0.1',
        }),
        14400,
      );
    });

    it('rejects attestation with ForbiddenException when preflightPassed is false', async () => {
      await expect(
        service.attestClient('user-123', {
          publicKeyPem: '-----BEGIN PUBLIC KEY-----\n...',
          clientVersion: '1.0.0',
          os: 'windows',
          preflightPassed: false,
          violations: ['Multiple monitors detected (2 active displays)'],
        }),
      ).rejects.toThrow(/Preflight security checks failed/);
    });

    it('permits attestation and logs vdiOverride note when only VM is detected and assessment has allowVirtualMachine: true', async () => {
      assessmentRepo.findOne.mockResolvedValue({
        id: 'asmt-vdi-1',
        title: 'VDI Allowed Exam',
        allowVirtualMachine: true,
      });

      const res = await service.attestClient('user-123', {
        publicKeyPem: '-----BEGIN PUBLIC KEY-----\n...',
        clientVersion: '1.0.0',
        os: 'windows',
        preflightPassed: false,
        violations: ['VIRTUAL_MACHINE_DETECTED'],
        assessmentId: 'asmt-vdi-1',
      });

      expect(res.success).toBe(true);
      expect(res.vdiOverride).toBe(true);
      expect(res.attestedSessionId).toBeDefined();

      expect(mockRedis.set).toHaveBeenCalledWith(
        `exam:attestation:${res.attestedSessionId}`,
        expect.objectContaining({
          userId: 'user-123',
          vdiOverride: true,
        }),
        14400,
      );
    });

    it('rejects attestation when VM is detected but assessment has allowVirtualMachine: false', async () => {
      assessmentRepo.findOne.mockResolvedValue({
        id: 'asmt-vdi-2',
        title: 'Bare Metal Exam',
        allowVirtualMachine: false,
      });

      await expect(
        service.attestClient('user-123', {
          publicKeyPem: '-----BEGIN PUBLIC KEY-----\n...',
          clientVersion: '1.0.0',
          os: 'windows',
          preflightPassed: false,
          violations: ['VIRTUAL_MACHINE_DETECTED'],
          assessmentId: 'asmt-vdi-2',
        }),
      ).rejects.toThrow(/Preflight security checks failed/);
    });

    it('rejects attestation when VM is detected alongside other violations even if allowVirtualMachine: true', async () => {
      assessmentRepo.findOne.mockResolvedValue({
        id: 'asmt-vdi-3',
        allowVirtualMachine: true,
      });

      await expect(
        service.attestClient('user-123', {
          publicKeyPem: '-----BEGIN PUBLIC KEY-----\n...',
          clientVersion: '1.0.0',
          os: 'windows',
          preflightPassed: false,
          violations: ['VIRTUAL_MACHINE_DETECTED', 'MULTIPLE_MONITORS_CONNECTED'],
          assessmentId: 'asmt-vdi-3',
        }),
      ).rejects.toThrow(/Preflight security checks failed/);
    });

    it('rejects attestation when client version is below required minimum', async () => {
      await expect(
        service.attestClient('user-123', {
          publicKeyPem: '-----BEGIN PUBLIC KEY-----\n...',
          clientVersion: '0.8.5',
          os: 'linux',
          preflightPassed: true,
        }),
      ).rejects.toThrow(/below minimum required version/);
    });

    it('safely falls back to raw query when schema sync is disabled and findOne fails', async () => {
      assessmentRepo.findOne.mockRejectedValue(
        new Error('column Assessment.allowVirtualMachine does not exist'),
      );
      assessmentRepo.query = jest.fn().mockResolvedValue([{ allowVirtualMachine: true }]);

      const res = await service.attestClient('user-123', {
        publicKeyPem: '-----BEGIN PUBLIC KEY-----\n...',
        clientVersion: '1.0.0',
        os: 'windows',
        preflightPassed: false,
        violations: ['VIRTUAL_MACHINE_DETECTED'],
        assessmentId: 'asmt-vdi-fallback',
      });

      expect(res.success).toBe(true);
      expect(res.vdiOverride).toBe(true);
      expect(typeof res.serverTime).toBe('number');
      expect(assessmentRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT "allowVirtualMachine" FROM "assessments"'),
        ['asmt-vdi-fallback'],
      );
    });

    it('tracks client relaunch and records telemetry when student re-attests after crash', async () => {
      const mockRedis: any = {
        store: new Map<string, any>(),
        set: jest.fn().mockImplementation(async (k, v) => mockRedis.store.set(k, v)),
        get: jest.fn().mockImplementation(async (k) => mockRedis.store.get(k) || null),
      };
      const mockRadar: any = {
        recordClientRelaunch: jest.fn(),
      };

      const testService = new ExamSecurityService(
        assessmentRepo as never,
        sessionRepo as never,
        eventRepo as never,
        mockRadar as never,
        undefined,
        mockRedis as never,
      );

      // Pre-seed an existing active attestation for this assessment
      mockRedis.store.set('exam:active-attestation:user-relaunch:asmt-crash', 'old-session-123');
      mockRedis.store.set('exam:relaunch-count:user-relaunch:asmt-crash', 2);

      const res = await testService.attestClient('user-relaunch', {
        publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\n-----END PUBLIC KEY-----',
        clientVersion: '1.0.0',
        os: 'windows',
        preflightPassed: true,
        assessmentId: 'asmt-crash',
      });

      expect(res.success).toBe(true);
      expect(typeof res.serverTime).toBe('number');
      expect(res.attestedSessionId).toBeDefined();
      expect(mockRedis.set).toHaveBeenCalledWith(
        'exam:relaunch-count:user-relaunch:asmt-crash',
        3,
        14400,
      );
      expect(mockRadar.recordClientRelaunch).toHaveBeenCalledWith({
        studentId: 'user-relaunch',
        assessmentId: 'asmt-crash',
        relaunchCount: 3,
        ipAddress: undefined,
      });
    });

    it('rejects attestation when publicKeyPem is missing', async () => {
      await expect(
        service.attestClient('user-123', {
          publicKeyPem: '',
          clientVersion: '1.0.0',
          os: 'macos',
          preflightPassed: true,
        }),
      ).rejects.toThrow(/Invalid or missing publicKeyPem/);
    });

    describe('reportDirectViolation', () => {
      it('creates and saves event with safe nil UUIDs when no session exists', async () => {
        sessionRepo.findOne.mockResolvedValue(null);
        assessmentRepo.findOne.mockResolvedValue(null);
        eventRepo.create.mockImplementation((payload) => payload);
        eventRepo.save.mockResolvedValue({ id: 'event-uuid' });

        const result = await service.reportDirectViolation(
          'user-123',
          'non-uuid-assessment',
          'ENVIRONMENT_VIOLATION',
          { detail: 'test' },
        );

        expect(result.success).toBe(true);
        expect(result.status).toBe('LOGGED');
        expect(eventRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            candidateId: 'user-123',
            assessmentId: '00000000-0000-0000-0000-000000000000',
            sessionId: '00000000-0000-0000-0000-000000000000',
          }),
        );
      });
    });

    describe('verifyQuitPassword', () => {
      it('authorizes when assessment has matching lockdownQuitPassword', async () => {
        assessmentRepo.findOne.mockResolvedValue({
          id: 'asmt-quit-1',
          lockdownQuitPassword: 'proctor-super-secret',
        });

        const res = await service.verifyQuitPassword('asmt-quit-1', 'user-123', 'proctor-super-secret');
        expect(res.authorized).toBe(true);
      });

      it('rejects with ForbiddenException when password does not match', async () => {
        assessmentRepo.findOne.mockResolvedValue({
          id: 'asmt-quit-1',
          lockdownQuitPassword: 'proctor-super-secret',
        });

        await expect(
          service.verifyQuitPassword('asmt-quit-1', 'user-123', 'wrong-password'),
        ).rejects.toThrow(/Invalid proctor quit password/);
      });

      it('authorizes when assessment has no quit password configured', async () => {
        assessmentRepo.findOne.mockResolvedValue({
          id: 'asmt-quit-2',
          lockdownQuitPassword: null,
          securityPolicy: {},
        });

        const res = await service.verifyQuitPassword('asmt-quit-2', 'user-123');
        expect(res.authorized).toBe(true);
      });
    });
  });
});
