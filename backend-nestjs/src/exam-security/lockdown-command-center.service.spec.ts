import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LockdownCommandCenterService } from './lockdown-command-center.service';
import { Assessment } from '../database/entities/assessment.entity';
import { ExamSession } from '../database/entities/exam-session.entity';
import { ExamSecurityEvent } from '../database/entities/exam-security-event.entity';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { User } from '../database/entities/user.entity';
import { SubmissionStore } from '../database/sharding/submission-store';
import { RedisService } from '../redis/redis.service';

describe('LockdownCommandCenterService', () => {
  let service: LockdownCommandCenterService;
  let mockAssessmentRepo: any;
  let mockSessionRepo: any;
  let mockEventRepo: any;
  let mockAttemptRepo: any;
  let mockUserRepo: any;
  let mockSubmissionStore: any;
  let mockRedis: any;

  beforeEach(async () => {
    mockAssessmentRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'asmt-1',
        title: 'Algorithms Midterm',
        durationMinutes: 90,
      }),
    };

    mockSessionRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'sess-1',
          assessmentId: 'asmt-1',
          candidateId: 'cand-1',
          candidate: { id: 'cand-1', name: 'Alice', email: 'alice@test.com' },
          status: 'ACTIVE',
          violationCount: 1,
          lastHeartbeatAt: new Date(),
        },
      ]),
      findOne: jest.fn().mockResolvedValue({
        id: 'sess-1',
        assessmentId: 'asmt-1',
        candidateId: 'cand-1',
        status: 'TERMINATED',
        securityState: 'VIOLATED',
        expiresAt: new Date(Date.now() + 3600000),
      }),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };

    mockEventRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'ev-1',
          assessmentId: 'asmt-1',
          candidateId: 'cand-1',
          eventType: 'CLIENT_ATTESTED',
          severity: 'INFO',
          metadata: { os: 'macos', kioskMode: 'macos_aac_enforced', attestationTier: 'hardware_tpm_enclave' },
          createdAt: new Date('2026-11-20T10:00:00Z'),
        },
        {
          id: 'ev-2',
          assessmentId: 'asmt-1',
          candidateId: 'cand-1',
          eventType: 'SECONDARY_DISPLAY_CONNECTED',
          severity: 'WARN',
          metadata: { message: '2 monitors detected' },
          createdAt: new Date('2026-11-20T10:15:00Z'),
        },
      ]),
      create: jest.fn().mockImplementation((dto) => ({ id: 'ev-created', ...dto })),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };

    mockAttemptRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'att-1',
          assessmentId: 'asmt-1',
          studentId: 'cand-1',
          student: { id: 'cand-1', name: 'Alice', email: 'alice@test.com' },
          status: 'in_progress',
        },
      ]),
      findOne: jest.fn().mockResolvedValue({
        id: 'att-1',
        assessmentId: 'asmt-1',
        studentId: 'cand-1',
        status: 'auto_submitted',
      }),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };

    mockUserRepo = {
      findOne: jest.fn(),
    };

    mockSubmissionStore = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'sub-1',
          userId: 'cand-1',
          assessmentId: 'asmt-1',
          problemId: 'prob-1',
          status: 'submitted',
          code: 'def solve(n):\n    total = 0\n    for i in range(n):\n        total += i\n    return total',
        },
      ]),
      save: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LockdownCommandCenterService,
        { provide: getRepositoryToken(Assessment), useValue: mockAssessmentRepo },
        { provide: getRepositoryToken(ExamSession), useValue: mockSessionRepo },
        { provide: getRepositoryToken(ExamSecurityEvent), useValue: mockEventRepo },
        { provide: getRepositoryToken(AssessmentAttempt), useValue: mockAttemptRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: SubmissionStore, useValue: mockSubmissionStore },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<LockdownCommandCenterService>(LockdownCommandCenterService);
  });

  describe('getCommandCenter', () => {
    it('aggregates OS distribution, Kiosk tier, attestation posture, and candidates', async () => {
      const result = await service.getCommandCenter('asmt-1');
      expect(result.success).toBe(true);
      expect(result.kpi.totalCandidates).toBe(1);
      expect(result.analytics.osDistribution.macos).toBe(1);
      expect(result.analytics.kioskTierBreakdown.macos_aac_enforced).toBe(1);
      expect(result.analytics.attestationPosture.hardwareTPM).toBe(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'exam:lockdown-analytics:asmt-1',
        expect.any(Object),
        10,
      );
    });

    it('returns cached analytics when available in Redis', async () => {
      mockRedis.get.mockResolvedValueOnce({ cached: true, kpi: { totalCandidates: 42 } });
      const result = await service.getCommandCenter('asmt-1');
      expect(result.cached).toBe(true);
      expect(mockEventRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('getCandidateForensicTimeline', () => {
    it('returns chronological lifecycle dossier for a candidate', async () => {
      const result = await service.getCandidateForensicTimeline('asmt-1', 'cand-1');
      expect(result.success).toBe(true);
      expect(result.timeline.length).toBe(2);
      expect(result.timeline[0].title).toBe('Hardware & Cryptographic Attestation');
      expect(result.timeline[1].title).toBe('External Display Connected');
    });
  });

  describe('unlockCandidate', () => {
    it('clears device lock, unblocks session, and records admin audit event', async () => {
      const res = await service.unlockCandidate('asmt-1', 'cand-1', 'admin-99', 'Student reconnected');
      expect(res.success).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('exam:active-device:asmt-1:cand-1');
      expect(mockRedis.del).toHaveBeenCalledWith('exam:force-quit:asmt-1:cand-1');
      expect(mockSessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ACTIVE', securityState: 'VERIFIED' }),
      );
      expect(mockEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'ADMIN_UNLOCK_OVERRIDE' }),
      );
    });
  });

  describe('reopenSubmission', () => {
    it('restores submission via SubmissionStore with userId and restores attempt', async () => {
      const res = await service.reopenSubmission('asmt-1', 'cand-1', 'admin-99', 'Technical glitch');
      expect(res.success).toBe(true);
      // Critical invariant check: uses SubmissionStore
      expect(mockSubmissionStore.find).toHaveBeenCalledWith({
        where: { assessmentId: 'asmt-1', userId: 'cand-1' },
      });
      expect(mockSubmissionStore.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_progress' }),
      );
      expect(mockAttemptRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_progress' }),
      );
      expect(mockEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'ADMIN_REOPEN_SUBMISSION' }),
      );
    });
  });

  describe('extendTime', () => {
    it('extends session deadline by given minutes and logs audit event', async () => {
      const res = await service.extendTime('asmt-1', 'cand-1', 15, 'admin-99', 'Disability accommodation');
      expect(res.success).toBe(true);
      expect(res.extraMinutes).toBe(15);
      expect(mockSessionRepo.save).toHaveBeenCalled();
      expect(mockEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'ADMIN_EXTEND_TIME' }),
      );
    });
  });

  describe('grantPreflightWaiver', () => {
    it('stores waiver in Redis and logs audit event', async () => {
      const res = await service.grantPreflightWaiver(
        'asmt-1',
        'cand-1',
        'secondary_display',
        'admin-99',
        'Built-in iMac secondary display',
      );
      expect(res.success).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'exam:waiver:asmt-1:cand-1:secondary_display',
        expect.any(Object),
        86400,
      );
      expect(mockEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'ADMIN_PREFLIGHT_WAIVER' }),
      );
    });

    it('rejects unrecognized waiver types', async () => {
      await expect(
        service.grantPreflightWaiver('asmt-1', 'cand-1', 'invalid_waiver', 'admin-99', 'test'),
      ).rejects.toThrow(/Invalid waiverType/);
    });
  });

  describe('sendProctorMessage', () => {
    it('queues force-quit when action is FORCE_QUIT', async () => {
      const res = await service.sendProctorMessage(
        'asmt-1',
        'cand-1',
        { action: 'FORCE_QUIT', reason: 'Severe cheating observed' },
        'admin-99',
      );
      expect(res.success).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'exam:force-quit:asmt-1:cand-1',
        'Severe cheating observed',
        14400,
      );
    });

    it('queues banner message when action is BANNER', async () => {
      const res = await service.sendProctorMessage(
        'asmt-1',
        'cand-1',
        { action: 'BANNER', message: '5 minutes remaining' },
        'admin-99',
      );
      expect(res.success).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'exam:proctor-banner:asmt-1:cand-1',
        expect.objectContaining({ message: '5 minutes remaining' }),
        3600,
      );
    });
  });

  describe('rotateQuitPin', () => {
    it('generates a 6-digit random PIN and caches in Redis', async () => {
      const res = await service.rotateQuitPin('asmt-1', 'admin-99', 'Routine exam reset');
      expect(res.success).toBe(true);
      expect(res.quitPin).toMatch(/^[0-9]{6}$/);
      expect(mockRedis.set).toHaveBeenCalledWith('exam:quit-pin:asmt-1', res.quitPin, 86400);
    });
  });

  describe('runPlagiarismScan', () => {
    it('detects near-identical code across different candidates and flags pairs >= 70%', async () => {
      mockAttemptRepo.find.mockResolvedValueOnce([
        { studentId: 'cand-1', student: { id: 'cand-1', name: 'Alice', email: 'alice@test.com' } },
        { studentId: 'cand-2', student: { id: 'cand-2', name: 'Bob', email: 'bob@test.com' } },
      ]);

      mockSubmissionStore.find
        .mockResolvedValueOnce([
          {
            problemId: 'two-sum',
            code: 'def twoSum(nums, target):\n    lookup = {}\n    for i, num in enumerate(nums):\n        diff = target - num\n        if diff in lookup:\n            return [lookup[diff], i]\n        lookup[num] = i',
          },
        ])
        .mockResolvedValueOnce([
          {
            problemId: 'two-sum',
            // Bob renamed variables and tweaked comments, but AST tokens match
            code: 'def twoSum(arr, total):\n    # Hash map\n    seen = {}\n    for idx, val in enumerate(arr):\n        comp = total - val\n        if comp in seen:\n            return [seen[comp], idx]\n        seen[val] = idx',
          },
        ]);

      const res = await service.runPlagiarismScan('asmt-1', 'admin-99');
      expect(res.success).toBe(true);
      expect(res.flaggedPairsCount).toBe(1);
      expect(res.flaggedPairs[0].similarityPercentage).toBeGreaterThanOrEqual(70);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'exam:plagiarism-results:asmt-1',
        expect.any(Array),
        86400,
      );
    });
  });

  describe('getCandidateIntegrityDigest', () => {
    it('returns composite risk score, plain English findings, and code snapshots via SubmissionStore', async () => {
      mockEventRepo.find.mockResolvedValueOnce([
        {
          eventType: 'CLIENT_ATTESTED',
          metadata: { attestationTier: 'hardware_tpm_enclave' },
        },
        {
          eventType: 'SECONDARY_DISPLAY_CONNECTED',
          metadata: {},
        },
      ]);

      mockAttemptRepo.findOne.mockResolvedValueOnce({
        id: 'att-1',
        studentId: 'cand-1',
        student: { name: 'Charlie', email: 'charlie@test.com' },
        gradeHeld: false,
      });

      mockSubmissionStore.find.mockResolvedValueOnce([
        {
          id: 'sub-1',
          problemId: 'p-1',
          language: 'python',
          code: 'print("hello")',
          status: 'Accepted',
          testsPassed: 5,
          totalTests: 5,
        },
      ]);

      const res = await service.getCandidateIntegrityDigest('asmt-1', 'cand-1');
      expect(res.success).toBe(true);
      expect(res.compositeRiskScore).toBe(25);
      expect(res.integrityStatus).toBe('SUSPICIOUS');
      expect(res.plainEnglishFindings).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Cryptographic hardware enclave'),
          expect.stringContaining('Detected unauthorized secondary monitor connection'),
        ]),
      );
      expect(mockSubmissionStore.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'cand-1' }),
        }),
      );
      expect(res.codeSnapshots).toHaveLength(1);
      expect(res.codeSnapshots[0].code).toBe('print("hello")');
    });
  });

  describe('setCandidateIntegrityDecision', () => {
    it('places grade hold and records audit event', async () => {
      const mockAttempt = {
        id: 'att-1',
        studentId: 'cand-1',
        gradeHeld: false,
        gradeHoldReason: '',
      };
      mockAttemptRepo.findOne.mockResolvedValueOnce(mockAttempt);

      const res = await service.setCandidateIntegrityDecision(
        'asmt-1',
        'cand-1',
        'HOLD_GRADE',
        'Suspected secondary monitor usage',
        'teacher-1',
      );

      expect(res.success).toBe(true);
      expect(res.gradeHeld).toBe(true);
      expect(res.gradeHoldReason).toBe('Suspected secondary monitor usage');
      expect(mockAttemptRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          gradeHeld: true,
          gradeHoldReason: 'Suspected secondary monitor usage',
        }),
      );
      expect(mockEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'GRADE_HOLD_PLACED',
          severity: 'HIGH',
        }),
      );
    });

    it('clears grade hold when decision is CLEAR_HOLD', async () => {
      const mockAttempt = {
        id: 'att-1',
        studentId: 'cand-1',
        gradeHeld: true,
        gradeHoldReason: 'Flagged for review',
      };
      mockAttemptRepo.findOne.mockResolvedValueOnce(mockAttempt);

      const res = await service.setCandidateIntegrityDecision(
        'asmt-1',
        'cand-1',
        'CLEAR_HOLD',
        'Waiver verified',
        'teacher-1',
      );

      expect(res.success).toBe(true);
      expect(res.gradeHeld).toBe(false);
      expect(res.gradeHoldReason).toBe('');
      expect(mockEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'GRADE_HOLD_CLEARED',
          severity: 'LOW',
        }),
      );
    });
  });

  describe('getQuestionFrictionAnalytics', () => {
    it('aggregates per-question solve time, error rates, and difficulty category', async () => {
      mockAttemptRepo.find.mockResolvedValueOnce([
        {
          responses: [
            {
              questionId: 'q-1',
              timeSpentSeconds: 400,
              marksAwarded: 2,
              maxMarks: 10,
              isCorrect: false,
            },
            {
              questionId: 'q-2',
              timeSpentSeconds: 60,
              marksAwarded: 10,
              maxMarks: 10,
              isCorrect: true,
            },
          ],
        },
      ]);

      const res = await service.getQuestionFrictionAnalytics('asmt-1');
      expect(res.success).toBe(true);
      expect(res.questions.length).toBeGreaterThanOrEqual(1);

      const q1 = res.questions.find((q: any) => q.questionId === 'q-1');
      expect(q1).toBeDefined();
      expect(q1.difficultyCategory).toBe('HIGH_FRICTION');
      expect(q1.frictionScore).toBeGreaterThanOrEqual(65);
    });
  });
});
