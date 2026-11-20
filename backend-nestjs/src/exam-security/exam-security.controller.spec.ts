jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => {} }));

import { ExamSecurityController } from './exam-security.controller';

describe('ExamSecurityController', () => {
  let controller: ExamSecurityController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      initSecureSession: jest.fn(),
      processHeartbeat: jest.fn(),
      reportViolation: jest.fn(),
      reportDirectViolation: jest.fn().mockResolvedValue({
        success: true,
        status: 'LOGGED',
        violations: 1,
      }),
      attestClient: jest.fn().mockResolvedValue({
        success: true,
        attestedSessionId: 'mock-attested-session-uuid',
      }),
    };
    controller = new ExamSecurityController(mockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates attestClient call to ExamSecurityService with user ID, body, and IP', async () => {
    const payload = {
      publicKeyPem: '-----BEGIN PUBLIC KEY-----\n...',
      clientVersion: '1.0.0',
      os: 'macos',
      preflightPassed: true,
      assessmentId: 'asmt-1',
    };
    const req = { ip: '192.168.1.100' };

    const result = await controller.attestClient('user-1', payload, req);
    expect(result.success).toBe(true);
    expect(result.attestedSessionId).toBe('mock-attested-session-uuid');
    expect(mockService.attestClient).toHaveBeenCalledWith('user-1', payload, '192.168.1.100');
  });

  it('delegates reportViolations to reportDirectViolation when no sessionId is provided', async () => {
    const payload = {
      assessmentId: 'asmt-1',
      violation_type: 'MULTIPLE_MONITORS_CONNECTED',
      message: 'Secondary display connected',
    };

    const result = await controller.reportViolations('user-1', payload);
    expect(result.success).toBe(true);
    expect(mockService.reportDirectViolation).toHaveBeenCalledWith(
      'user-1',
      'asmt-1',
      'MULTIPLE_MONITORS_CONNECTED',
      expect.objectContaining({ message: 'Secondary display connected' }),
    );
  });

  it('delegates reportViolations to reportViolation when sessionId is provided', async () => {
    const payload = {
      sessionId: 'sess-123',
      eventType: 'SUSPICIOUS_FOCUS_LOSS',
    };
    mockService.reportViolation.mockResolvedValue({ success: true, status: 'ACTIVE', violations: 1 });

    const result = await controller.reportViolations('user-1', payload);
    expect(result.success).toBe(true);
    expect(mockService.reportViolation).toHaveBeenCalledWith(
      'sess-123',
      'user-1',
      'SUSPICIOUS_FOCUS_LOSS',
      expect.any(Object),
    );
  });

  it('delegates verifyQuitPassword to ExamSecurityService with assessmentId, userId, and password', async () => {
    mockService.verifyQuitPassword = jest.fn().mockResolvedValue({ authorized: true });

    const result = await controller.verifyQuitPassword('user-1', {
      assessmentId: 'asmt-1',
      password: 'proctor-secret',
    });
    expect(result.authorized).toBe(true);
    expect(mockService.verifyQuitPassword).toHaveBeenCalledWith('asmt-1', 'user-1', 'proctor-secret');
  });

  it('delegates getOperationalHealth to OperationalHealthService when present', async () => {
    const mockHealthService = {
      getHealthReport: jest.fn().mockResolvedValue({
        status: 'HEALTHY',
        timestamp: '2026-11-20T00:00:00.000Z',
        metrics: {
          attestFailureRate: 0,
          attestTotal5m: 10,
          attestFailed5m: 0,
          telemetryLag: 50,
          queueWaitLatencySeconds: 0.2,
        },
        thresholds: {
          attestFailureRateMax: 5,
          telemetryLagMax: 10000,
          queueWaitLatencyMaxSeconds: 10,
        },
        breaches: [],
      }),
    };

    const controllerWithHealth = new ExamSecurityController(mockService, mockHealthService as any);
    const report = await controllerWithHealth.getOperationalHealth();

    expect(report.status).toBe('HEALTHY');
    expect(report.metrics.telemetryLag).toBe(50);
    expect(mockHealthService.getHealthReport).toHaveBeenCalled();
  });

  it('returns default healthy report when OperationalHealthService is not injected', async () => {
    const report = await controller.getOperationalHealth();
    expect(report.status).toBe('HEALTHY');
    expect(report.metrics.attestFailureRate).toBe(0);
    expect(report.breaches).toHaveLength(0);
  });
});
