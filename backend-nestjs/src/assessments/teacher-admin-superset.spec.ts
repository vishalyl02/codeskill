import { AssessmentsService } from './assessments.service';
import { Assessment } from '../database/entities/assessment.entity';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { CandidateExamAccommodation } from '../database/entities/candidate-exam-accommodation.entity';

describe('AssessmentsService - Unified Teacher + Admin Superset Capabilities', () => {
  let service: AssessmentsService;
  let mockAssessmentRepo: any;
  let mockAttemptRepo: any;
  let mockQuestionRepo: any;
  let mockAuditLogRepo: any;
  let mockAccommodationRepo: any;

  const mockAdminUser = { id: '550e8400-e29b-41d4-a716-446655440001', email: 'instructor@codeskill.com', role: 'INSTRUCTOR' };
  const mockAssessmentId = '550e8400-e29b-41d4-a716-446655440000';
  const mockAssessment: Partial<Assessment> = {
    id: mockAssessmentId,
    title: 'Midterm Examination',
    code: 'CS101-MIDTERM',
    durationMinutes: 60,
    totalMarks: 100,
    passingMarks: 50,
    status: 'published',
    questions: ['q1', 'q2'],
    instructions: ['Sample instruction 1', 'Sample instruction 2'],
  };

  beforeEach(() => {
    mockAssessmentRepo = {
      findOne: jest.fn().mockImplementation(({ where }) => {
        if (where?.id === mockAssessmentId || where?.[0]?.code === 'CS101-MIDTERM') {
          return Promise.resolve({ ...mockAssessment });
        }
        return Promise.resolve({ ...mockAssessment });
      }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ ...mockAssessment }),
      }),
      create: jest.fn().mockImplementation((dto) => ({ ...dto, id: 'cloned-mock-uuid' })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve({ ...entity })),
    };

    mockAttemptRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: '550e8400-e29b-41d4-a716-446655440010',
          studentId: '550e8400-e29b-41d4-a716-446655440020',
          assessmentId: mockAssessmentId,
          student: { name: 'Alice Smith', email: 'alice@school.edu' },
          status: 'in_progress',
          score: 85,
          startedAt: new Date(Date.now() - 1000 * 60 * 15),
          timeSpentSeconds: 900,
          tabSwitchCount: 0,
          fullscreenExitCount: 0,
          violations: [],
          extraTimeGrantedMinutes: 0,
          gradeHeld: false,
          responses: [
            { questionId: 'q1', isCorrect: true, timeSpentSeconds: 120, pasteCount: 0 },
            { questionId: 'q2', isCorrect: false, timeSpentSeconds: 450, pasteCount: 6 },
          ],
        },
      ]),
      findOne: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve({
          id: '550e8400-e29b-41d4-a716-446655440010',
          studentId: '550e8400-e29b-41d4-a716-446655440020',
          assessmentId: mockAssessmentId,
          status: 'in_progress',
          startedAt: new Date(Date.now() - 1000 * 60 * 15),
          extraTimeGrantedMinutes: 0,
          gradeHeld: false,
        });
      }),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    mockQuestionRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    mockAuditLogRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockResolvedValue({}),
    };

    mockAccommodationRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'acc-1',
          assessment_id: mockAssessmentId,
          user_id: '550e8400-e29b-41d4-a716-446655440020',
          time_multiplier: 1.5,
          secondary_display_allowed: true,
          screen_reader_allowed: false,
          custom_notes: 'Approved medical waiver',
        },
      ]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((dto) => ({ id: 'new-acc-id', ...dto })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    service = new AssessmentsService(
      mockAssessmentRepo,
      mockAttemptRepo,
      mockQuestionRepo,
      mockAuditLogRepo,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mockAccommodationRepo,
    );
  });

  describe('5-Minute Practice Mock Generator', () => {
    it('clones assessment into a 5-minute practice mock with practice prefix and sample questions', async () => {
      const result = await service.createPracticeMock(mockAssessmentId, mockAdminUser);
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('[PRACTICE MOCK] Midterm Examination');
      expect(result.data.durationMinutes).toBe(5);
      expect(result.data.totalMarks).toBe(10);
      expect(result.data.passingMarks).toBe(0);
      expect(mockAssessmentRepo.save).toHaveBeenCalled();
    });
  });

  describe('Candidate Accommodations Engine', () => {
    it('retrieves accommodations list for assessment', async () => {
      const accommodations = await service.getAccommodations(mockAssessmentId);
      expect(accommodations.length).toBe(1);
      expect(accommodations[0].time_multiplier).toBe(1.5);
      expect(accommodations[0].secondary_display_allowed).toBe(true);
    });

    it('upserts candidate accommodation with custom multiplier and display waiver', async () => {
      const result = await service.upsertAccommodation(
        mockAssessmentId,
        {
          userId: '550e8400-e29b-41d4-a716-446655440021',
          timeMultiplier: 2.0,
          secondaryDisplayAllowed: true,
          screenReaderAllowed: true,
          customNotes: 'Assistive tech approved',
        },
        mockAdminUser,
      );
      expect(result.time_multiplier).toBe(2.0);
      expect(result.secondary_display_allowed).toBe(true);
      expect(result.screen_reader_allowed).toBe(true);
      expect(mockAccommodationRepo.save).toHaveBeenCalled();
    });

    it('deletes candidate accommodation', async () => {
      const res = await service.deleteAccommodation(mockAssessmentId, '550e8400-e29b-41d4-a716-446655440020');
      expect(res.success).toBe(true);
      expect(mockAccommodationRepo.delete).toHaveBeenCalledWith({
        assessment_id: mockAssessmentId,
        user_id: '550e8400-e29b-41d4-a716-446655440020',
      });
    });
  });

  describe('Role-Aware Classroom Invigilation', () => {
    it('returns invigilation roster with attempt telemetry, flags, and accommodations', async () => {
      const roster = await service.getInvigilationRoster(mockAssessmentId);
      expect(roster.length).toBe(1);
      expect(roster[0].studentName).toBe('Alice Smith');
      expect(roster[0].status).toBe('in_progress');
      expect(roster[0].accommodation).not.toBeNull();
      expect(roster[0].accommodation?.timeMultiplier).toBe(1.5);
    });

    it('grants extra exam time (+10m) to in-progress candidate', async () => {
      const result = await service.grantExtraTime(
        mockAssessmentId,
        { studentId: '550e8400-e29b-41d4-a716-446655440020', extraMinutes: 10 },
        mockAdminUser,
      );
      expect(result.success).toBe(true);
      expect(result.totalExtraMinutes).toBe(10);
      expect(mockAttemptRepo.save).toHaveBeenCalled();
      expect(mockAuditLogRepo.save).toHaveBeenCalled();
    });

    it('toggles grade hold on student attempt', async () => {
      const result = await service.holdGrade(
        mockAssessmentId,
        { attemptId: '550e8400-e29b-41d4-a716-446655440010', hold: true, reason: 'Suspicious dual-display usage' },
        mockAdminUser,
      );
      expect(result.success).toBe(true);
      expect(result.gradeHeld).toBe(true);
      expect(result.gradeHoldReason).toBe('Suspicious dual-display usage');
    });
  });

  describe('Per-Question Friction & Struggle Analytics', () => {
    it('aggregates per-question friction scores, avg time spent, and struggle tiers', async () => {
      const analytics = await service.getFrictionAnalytics(mockAssessmentId);
      expect(analytics.length).toBe(2);

      const q2 = analytics.find((s) => s.questionId === 'q2');
      expect(q2).toBeDefined();
      expect(q2?.pasteCount).toBe(6);
      expect(q2?.successRate).toBe(0);
      expect(q2?.difficultyTier).toBe('HIGH_FRICTION');

      const q1 = analytics.find((s) => s.questionId === 'q1');
      expect(q1).toBeDefined();
      expect(q1?.successRate).toBe(100);
      expect(q1?.difficultyTier).toBe('SMOOTH');
    });
  });
});
