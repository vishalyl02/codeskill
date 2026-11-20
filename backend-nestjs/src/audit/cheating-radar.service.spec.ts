import { CheatingRadarService } from './cheating-radar.service';

describe('CheatingRadarService', () => {
  let service: CheatingRadarService;
  let mockActivityLogService: any;
  let mockAlertWebhookService: any;

  beforeEach(() => {
    mockActivityLogService = {
      log: jest.fn(),
    };
    mockAlertWebhookService = {
      sendAlert: jest.fn().mockResolvedValue(true),
    };
    service = new CheatingRadarService(
      mockActivityLogService as any,
      mockAlertWebhookService as any,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('Heuristic 1: Concurrent IP Detection', () => {
    it('should not flag when student uses single IP', async () => {
      const flagged = await service.recordNetworkActivity({
        studentId: 'student-1',
        assessmentId: 'exam-1',
        ipAddress: '172.16.4.12',
      });
      expect(flagged).toBe(false);
      expect(mockActivityLogService.log).not.toHaveBeenCalled();
    });

    it('should flag when student uses two distinct IPs within 10 minutes', async () => {
      await service.recordNetworkActivity({
        studentId: 'student-1',
        assessmentId: 'exam-1',
        ipAddress: '172.16.4.12',
      });

      const flagged = await service.recordNetworkActivity({
        studentId: 'student-1',
        assessmentId: 'exam-1',
        ipAddress: '122.173.30.5',
      });

      expect(flagged).toBe(true);
      expect(mockActivityLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHEATING_RADAR_CONCURRENT_IP',
          riskWeight: 4,
          metadata: expect.objectContaining({
            anomaly: 'CONCURRENT_IP_DETECTED',
          }),
        }),
      );
      expect(mockAlertWebhookService.sendAlert).toHaveBeenCalledTimes(1);
    });

    it('should respect cooldown and not re-alert on the same two IPs', async () => {
      await service.recordNetworkActivity({
        studentId: 'student-1',
        assessmentId: 'exam-1',
        ipAddress: '172.16.4.12',
      });
      await service.recordNetworkActivity({
        studentId: 'student-1',
        assessmentId: 'exam-1',
        ipAddress: '122.173.30.5',
      });

      // Third call with same IP within cooldown
      const third = await service.recordNetworkActivity({
        studentId: 'student-1',
        assessmentId: 'exam-1',
        ipAddress: '122.173.30.5',
      });
      expect(third).toBe(false);
      expect(mockAlertWebhookService.sendAlert).toHaveBeenCalledTimes(1);
    });
  });

  describe('Heuristic 2: Impossible Solve Velocity', () => {
    it('should ignore solutions outside active assessments', async () => {
      const flagged = await service.evaluateSubmissionVelocity({
        studentId: 'student-1',
        assessmentId: undefined, // Practice problem
        problemId: 'prob-1',
        code: 'A'.repeat(300),
        verdict: 'Accepted',
        timeSpentSeconds: 12,
      });
      expect(flagged).toBe(false);
    });

    it('should ignore short boilerplate code (< 250 chars)', async () => {
      const flagged = await service.evaluateSubmissionVelocity({
        studentId: 'student-1',
        assessmentId: 'exam-1',
        problemId: 'prob-1',
        code: 'def solve(): return 1',
        verdict: 'Accepted',
        timeSpentSeconds: 15,
      });
      expect(flagged).toBe(false);
    });

    it('should flag fast solve with long code payload (> 250 chars in < 30s)', async () => {
      const flagged = await service.evaluateSubmissionVelocity({
        studentId: 'student-1',
        assessmentId: 'exam-1',
        problemId: 'prob-1',
        code: 'class Solution:\n' + '  def solve(): pass\n'.repeat(20),
        verdict: 'Accepted',
        timeSpentSeconds: 18,
        hasCorroboratingViolation: true,
      });
      expect(flagged).toBe(true);
      expect(mockActivityLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHEATING_RADAR_IMPOSSIBLE_VELOCITY',
          riskWeight: 4,
        }),
      );
    });
  });

  describe('Heuristic 3: Proctoring Violation Burst', () => {
    it('should flag when >= 4 violations occur in under 3 minutes', async () => {
      for (let i = 0; i < 3; i++) {
        const flagged = await service.recordProctoringViolation({
          studentId: 'student-1',
          assessmentId: 'exam-1',
          eventType: 'tab_switch',
        });
        expect(flagged).toBe(false);
      }

      // 4th violation triggers burst
      const fourth = await service.recordProctoringViolation({
        studentId: 'student-1',
        assessmentId: 'exam-1',
        eventType: 'tab_switch',
      });
      expect(fourth).toBe(true);
      expect(mockActivityLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHEATING_RADAR_VIOLATION_BURST',
          riskWeight: 4,
        }),
      );
    });
  });

  describe('Heuristic 4: Desktop Client Relaunch', () => {
    it('should log relaunch with LOW severity on first relaunch', async () => {
      const recorded = await service.recordClientRelaunch({
        studentId: 'student-1',
        assessmentId: 'exam-1',
        relaunchCount: 1,
      });
      expect(recorded).toBe(true);
      expect(mockActivityLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHEATING_RADAR_CLIENT_RELAUNCHED',
          riskWeight: 1,
        }),
      );
      expect(mockAlertWebhookService.sendAlert).not.toHaveBeenCalled();
    });

    it('should trigger alert with CRITICAL severity on excessive relaunch (> 2)', async () => {
      const recorded = await service.recordClientRelaunch({
        studentId: 'student-1',
        assessmentId: 'exam-1',
        relaunchCount: 3,
      });
      expect(recorded).toBe(true);
      expect(mockActivityLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHEATING_RADAR_CLIENT_RELAUNCHED',
          riskWeight: 3,
        }),
      );
      expect(mockAlertWebhookService.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHEATING_RADAR_CLIENT_RELAUNCHED',
          severity: 'CRITICAL',
        }),
      );
    });
  });

  describe('Heuristic 5: Media Disconnect Outage', () => {
    it('should log outage without critical alert for brief disconnect (< 30s)', async () => {
      const recorded = await service.recordMediaDisconnectOutage({
        studentId: 'student-1',
        assessmentId: 'exam-1',
        deviceKind: 'videoinput',
        outageDurationMs: 12000,
      });
      expect(recorded).toBe(true);
      expect(mockActivityLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHEATING_RADAR_MEDIA_DISCONNECT_OUTAGE',
          riskWeight: 2,
        }),
      );
      expect(mockAlertWebhookService.sendAlert).not.toHaveBeenCalled();
    });

    it('should alert with HIGH severity when outage exceeds 30 seconds', async () => {
      const recorded = await service.recordMediaDisconnectOutage({
        studentId: 'student-1',
        assessmentId: 'exam-1',
        deviceKind: 'videoinput',
        outageDurationMs: 45000,
        reason: 'unplugged',
      });
      expect(recorded).toBe(true);
      expect(mockActivityLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHEATING_RADAR_MEDIA_DISCONNECT_OUTAGE',
          riskWeight: 3,
        }),
      );
      expect(mockAlertWebhookService.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CHEATING_RADAR_MEDIA_DISCONNECT_OUTAGE',
          severity: 'CRITICAL',
        }),
      );
    });
  });
});
