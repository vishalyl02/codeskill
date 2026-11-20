import { BadRequestException } from '@nestjs/common';
jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => {} }));

import { AssessmentsService } from './assessments.service';

describe('Assessment Idempotency & 45-Second Grace Window', () => {
  let service: AssessmentsService;
  let mockAssessmentRepo: any;
  let mockAttemptRepo: any;
  let mockQuestionRepo: any;
  let mockAuditLogRepo: any;
  let mockRedisService: any;

  const studentUser = {
    id: 'candidate-uuid-1',
    name: 'Alice Student',
    email: 'alice@cu.edu',
    uid: 'CU1001',
  };

  const assessmentId = 'assessment-uuid-1';
  const mockAssessment = {
    id: assessmentId,
    title: 'Final Examination',
    status: 'published',
    durationMinutes: 60,
    questions: ['q-mcq-1'],
    totalMarks: 5,
    passingMarks: 3,
    negativeMarking: false,
    endTime: new Date(Date.now() + 3600_000),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockAssessmentRepo = {
      findOne: jest.fn().mockResolvedValue({ ...mockAssessment }),
    };

    mockAttemptRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'attempt-uuid-1',
        assessmentId,
        studentId: studentUser.id,
        status: 'in_progress',
        startedAt: new Date(Date.now() - 30 * 60_000),
        responses: [],
      }),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((a) => Promise.resolve(a)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      count: jest.fn().mockResolvedValue(1),
    };

    mockQuestionRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 'q-mcq-1', questionType: 'MCQ', correctAnswer: 0, marks: 5 },
      ]),
    };

    mockAuditLogRepo = {
      save: jest.fn(),
    };

    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      getClient: () => ({
        set: jest.fn().mockResolvedValue('OK'),
      }),
    };

    service = new AssessmentsService(
      mockAssessmentRepo as any,
      mockAttemptRepo as any,
      mockQuestionRepo as any,
      mockAuditLogRepo as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mockRedisService as any,
    );
  });

  describe('Deterministic Idempotency Key Handling', () => {
    it('returns cached 200 receipt immediately if idempotency key is COMPLETED in Redis', async () => {
      const cachedReceipt = {
        success: true,
        message: 'Assessment submitted successfully.',
        result: { score: 5, status: 'submitted' },
      };
      mockRedisService.get.mockResolvedValueOnce({
        status: 'COMPLETED',
        result: cachedReceipt,
      });

      const key = `submit:${assessmentId}:${studentUser.id}:attempt-1`;
      const result = await service.submitAttempt(
        assessmentId,
        { responses: [] } as any,
        studentUser,
        key,
      );

      expect(result).toEqual(cachedReceipt);
      expect(mockAttemptRepo.save).not.toHaveBeenCalled();
    });

    it('caches serialized receipt in Redis for 24 hours (86400s) on successful submission', async () => {
      const key = `submit:${assessmentId}:${studentUser.id}:attempt-1`;
      const result = await service.submitAttempt(
        assessmentId,
        { responses: [{ questionId: 'q-mcq-1', selectedAnswer: 0 }] } as any,
        studentUser,
        key,
      );

      expect(result.success).toBe(true);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `idempotency:exam:${key}`,
        expect.objectContaining({ status: 'COMPLETED' }),
        86400,
      );
    });

    it('idempotently caches and returns saveProgress receipt', async () => {
      const key = `autosave:${assessmentId}:${studentUser.id}:1`;
      const result = await service.saveProgress(
        assessmentId,
        { responses: [{ questionId: 'q-mcq-1', selectedAnswer: 0 }] } as any,
        studentUser,
        key,
      );

      expect(result.success).toBe(true);
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `idempotency:exam:${key}`,
        expect.objectContaining({ status: 'COMPLETED' }),
        86400,
      );

      // Subsequent identical autosave returns from cache
      mockRedisService.get.mockResolvedValueOnce({
        status: 'COMPLETED',
        result,
      });

      const second = await service.saveProgress(
        assessmentId,
        { responses: [] } as any,
        studentUser,
        key,
      );
      expect(second).toEqual(result);
    });
  });

  describe('45-Second Submission Grace Window', () => {
    it('accepts submit payload arriving up to 45,000ms after endsAtEpochMs and records graceWindowAccepted: true', async () => {
      const now = Date.now();
      // Started 60 mins and 15 seconds ago for a 60 min exam (15s past deadline, within 45s grace)
      mockAttemptRepo.findOne.mockResolvedValue({
        id: 'attempt-grace-1',
        assessmentId,
        studentId: studentUser.id,
        status: 'in_progress',
        startedAt: new Date(now - 60 * 60_000 - 15_000),
        responses: [],
      });

      const res = await service.submitAttempt(
        assessmentId,
        {
          responses: [{ questionId: 'q-mcq-1', selectedAnswer: 0 }],
          clientSubmittedAtMs: now - 15_000,
        } as any,
        studentUser,
      );

      expect(res.success).toBe(true);
      expect(res.submissionMetadata.graceWindowAccepted).toBe(true);
      expect(res.submissionMetadata.serverReceivedAtMs).toBeDefined();
    });

    it('rejects submit payload arriving beyond 45,000ms after endsAtEpochMs', async () => {
      const now = Date.now();
      // Started 60 mins and 46 seconds ago for a 60 min exam (46s past deadline, beyond 45s grace)
      mockAttemptRepo.findOne.mockResolvedValue({
        id: 'attempt-grace-expired',
        assessmentId,
        studentId: studentUser.id,
        status: 'in_progress',
        startedAt: new Date(now - 60 * 60_000 - 46_000),
        responses: [],
      });

      await expect(
        service.submitAttempt(
          assessmentId,
          { responses: [], clientSubmittedAtMs: now } as any,
          studentUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts autosave payload arriving within 45s grace window', async () => {
      const now = Date.now();
      mockAttemptRepo.findOne.mockResolvedValue({
        id: 'attempt-grace-autosave',
        assessmentId,
        studentId: studentUser.id,
        status: 'in_progress',
        startedAt: new Date(now - 60 * 60_000 - 20_000), // 20s past deadline
        responses: [],
      });

      const res = await service.saveProgress(
        assessmentId,
        { responses: [], clientSubmittedAtMs: now - 20_000 } as any,
        studentUser,
      );

      expect(res.success).toBe(true);
      expect(res.submissionMetadata.graceWindowAccepted).toBe(true);
    });

    it('rejects autosave payload arriving after 45s grace window', async () => {
      const now = Date.now();
      mockAttemptRepo.findOne.mockResolvedValue({
        id: 'attempt-grace-autosave-overdue',
        assessmentId,
        studentId: studentUser.id,
        status: 'in_progress',
        startedAt: new Date(now - 60 * 60_000 - 46_000), // 46s past deadline
        responses: [],
      });

      await expect(
        service.saveProgress(
          assessmentId,
          { responses: [] } as any,
          studentUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
