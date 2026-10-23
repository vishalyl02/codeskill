import { NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockAssessmentRepo: any;
  let mockAttemptRepo: any;
  let mockQuestionRepo: any;
  let mockSecurityEventRepo: any;
  let mockAuditLogRepo: any;
  let mockUserRepo: any;
  let mockSubmissionRepo: any;

  const mockAssessment = {
    id: 'af3df981-0978-4b0e-91a8-4bc3027e2363',
    title: 'Practice Assessment 3 - Problem Solving',
    code: 'EXAM-4103',
    status: 'published',
    type: 'mixed',
    durationMinutes: 60,
    totalMarks: 50,
    passingMarks: 25,
    questions: ['q-1', 'q-2'],
    sections: [],
  };

  beforeEach(() => {
    mockAssessmentRepo = {
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
      find: jest.fn().mockResolvedValue([mockAssessment]),
      createQueryBuilder: jest.fn(),
    };

    const mockAttemptQueryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        avgScore: '32.5',
        maxScore: '50',
        minScore: '15',
        avgTimeSpent: '2542',
        totalPassed: '4',
        totalTabSwitches: '7',
        totalFullscreenExits: '3',
        total: '6',
        completed: '6',
      }),
    };

    const mockCandidateQueryBuilder: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({
        totalCandidates: '6',
        completedCandidates: '6',
      }),
    };

    let qbCallCount = 0;
    mockAttemptRepo = {
      count: jest.fn().mockResolvedValue(6),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      query: jest.fn().mockResolvedValue([
        { bracket: '0-20%', count: '1' },
        { bracket: '21-40%', count: '1' },
        { bracket: '41-60%', count: '2' },
        { bracket: '61-80%', count: '1' },
        { bracket: '81-100%', count: '1' },
      ]),
      createQueryBuilder: jest.fn(() => {
        qbCallCount++;
        return qbCallCount === 1
          ? mockAttemptQueryBuilder
          : mockCandidateQueryBuilder;
      }),
    };

    mockQuestionRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 'q-1', title: 'Two Sum', type: 'coding', difficulty: 'easy' },
        { id: 'q-2', title: 'Valid Parentheses', type: 'mcq', difficulty: 'easy' },
      ]),
    };

    mockSecurityEventRepo = {
      findAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 'evt-1',
            eventType: 'WINDOW_BLUR_OR_TAB_SWITCH',
            severity: 'MEDIUM',
            candidate: { name: 'Rohan Gupta', email: 'rohan@test.com' },
            createdAt: new Date(),
          },
        ],
        1,
      ]),
    };

    mockAuditLogRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'audit-1',
          action: 'ASSESSMENT_ANALYTICS_REVIEW',
          actorEmail: 'admin@codeskill.local',
          timestamp: new Date(),
          event: 'Reviewed analytics',
          riskWeight: 0,
        },
      ]),
    };

    mockUserRepo = {
      count: jest.fn().mockResolvedValue(27),
      query: jest.fn().mockResolvedValue([{ count: '12' }]),
    };

    mockSubmissionRepo = {
      count: jest.fn().mockResolvedValue(145),
      query: jest.fn().mockImplementation((queryStr: string) => {
        if (queryStr.includes('GROUP BY LOWER(language)')) {
          return Promise.resolve([
            { lang: 'python', name: 'python', submissions: '65', count: '65' },
            { lang: 'cpp', name: 'cpp', submissions: '45', count: '45' },
            { lang: 'java', name: 'java', submissions: '35', count: '35' },
          ]);
        }
        if (queryStr.includes('GROUP BY DATE(s."createdAt")')) {
          return Promise.resolve([
            {
              dateKey: new Date().toISOString().slice(0, 10),
              total: '20',
              accepted: '15',
              failed: '5',
            },
          ]);
        }
        return Promise.resolve([]);
      }),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          total: '145',
          accepted: '110',
          failed: '35',
        }),
      })),
    };

    service = new AnalyticsService(
      mockAttemptRepo,
      mockAssessmentRepo,
      mockQuestionRepo,
      mockSecurityEventRepo,
      mockAuditLogRepo,
      mockUserRepo,
      mockSubmissionRepo,
    );
  });

  describe('resolveAssessment', () => {
    it('resolves assessment by valid UUID', async () => {
      mockAssessmentRepo.findOne.mockResolvedValueOnce(mockAssessment);

      const result = await service.resolveAssessment(
        'af3df981-0978-4b0e-91a8-4bc3027e2363',
      );
      expect(result).toEqual(mockAssessment);
    });

    it('throws NotFoundException when assessment does not exist', async () => {
      mockAssessmentRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.resolveAssessment('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPlatformOverview', () => {
    it('returns calculated platform metrics from actual database repos', async () => {
      const overview = await service.getPlatformOverview();

      expect(overview).toBeDefined();
      expect(overview.totalStudents).toBe(27);
      expect(overview.totalSubmissions).toBe(145);
      expect(overview.acceptedSubmissions).toBe(110);
      expect(overview.overallAcceptanceRate).toBeCloseTo(75.9, 1);
      expect(overview.primaryLanguage).toBe('Python');
    });
  });

  describe('getActivity', () => {
    it('aggregates daily activity, engagement, and weekly rhythm', async () => {
      const activity = await service.getActivity({ period: '7d' });

      expect(activity).toBeDefined();
      expect(activity.period).toBe('7d');
      expect(Array.isArray(activity.codingActivity)).toBe(true);
      expect(Array.isArray(activity.engagement)).toBe(true);
      expect(Array.isArray(activity.weeklyActivity)).toBe(true);
      expect(activity.weeklyActivity.length).toBe(7);
    });
  });

  describe('getLanguages', () => {
    it('calculates language breakdown and shares', async () => {
      const result = await service.getLanguages();

      expect(result).toBeDefined();
      expect(result.totalSubmissions).toBe(145);
      expect(Array.isArray(result.languages)).toBe(true);
      expect(result.languages[0].name).toBe('Python');
      expect(result.languages[0].submissions).toBe(65);
    });
  });

  describe('getLeaderboard', () => {
    it('returns paginated rankings with score and problem counts', async () => {
      mockUserRepo.query
        .mockResolvedValueOnce([
          {
            userId: 'u-1',
            name: 'Ishita Patel',
            uid: 'CU-2026-002',
            points: 150,
            assessmentScore: 50,
            problemsSolved: 10,
            assessmentsCompleted: 1,
          },
        ])
        .mockResolvedValueOnce([{ count: '1' }]);

      const result = await service.getLeaderboard({ page: 1, limit: 10 });

      expect(result).toBeDefined();
      expect(result.data.length).toBe(1);
      expect(result.data[0].rank).toBe(1);
      expect(result.data[0].name).toBe('Ishita Patel');
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('getAssessmentsOverview', () => {
    it('calculates score distribution and assessment summary metrics', async () => {
      const result = await service.getAssessmentsOverview();

      expect(result).toBeDefined();
      expect(result.totalAssessments).toBe(1);
      expect(Array.isArray(result.scoreDistribution)).toBe(true);
      expect(result.scoreDistribution.length).toBe(5);
    });
  });

  describe('getRetention', () => {
    it('calculates DAU, WAU, MAU, and stickiness ratio', async () => {
      const result = await service.getRetention();

      expect(result).toBeDefined();
      expect(result.metrics.dau).toBe(12);
      expect(result.metrics.wau).toBe(12);
      expect(result.metrics.mau).toBe(12);
      expect(result.metrics.stickinessRatio).toBe(100);
      expect(Array.isArray(result.frequencyDistribution)).toBe(true);
    });
  });

  describe('getAssessmentOverview', () => {
    it('returns calculated analytics with candidate metrics and proctoring violations', async () => {
      mockAssessmentRepo.findOne.mockResolvedValueOnce(mockAssessment);

      const overview = await service.getAssessmentOverview(mockAssessment.id);

      expect(overview).toBeDefined();
      expect(overview.assessment.id).toBe(mockAssessment.id);
      expect(overview.participation.total).toBe(6);
      expect(overview.metrics.avgScore).toBe(32.5);
      expect(overview.metrics.passRate).toBe(66.7);
      expect(overview.proctoring.totalViolations).toBe(10);
      expect(overview.proctoring.securityEventsCount).toBe(1);
    });
  });

  describe('getQuestionAnalytics', () => {
    it('aggregates response data and maps defined questions', async () => {
      mockAssessmentRepo.findOne.mockResolvedValueOnce(mockAssessment);
      mockAttemptRepo.find.mockResolvedValueOnce([
        {
          id: 'att-1',
          responses: [
            {
              questionId: 'q-1',
              isCorrect: true,
              timeSpentSeconds: 120,
              marksAwarded: 5,
            },
          ],
        },
      ]);

      const questions = await service.getQuestionAnalytics(mockAssessment.id);

      expect(Array.isArray(questions)).toBe(true);
      expect(questions.length).toBeGreaterThanOrEqual(1);
    });
  });
});
