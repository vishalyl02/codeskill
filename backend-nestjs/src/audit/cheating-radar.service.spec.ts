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
});
