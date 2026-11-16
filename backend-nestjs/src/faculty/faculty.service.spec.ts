jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FacultyService } from './faculty.service';

describe('FacultyService', () => {
  let service: FacultyService;
  let mockFacultyAssignmentRepo: any;
  let mockAssessmentRepo: any;
  let mockAttemptRepo: any;
  let mockQuestionRepo: any;
  let mockBatchRepo: any;
  let mockEnrollmentRepo: any;
  let mockUserRepo: any;
  let mockS3Service: any;

  const facultyUser = { id: 'faculty-uuid-1', role: 'faculty' };
  const otherFacultyUser = { id: 'faculty-uuid-2', role: 'faculty' };

  beforeEach(() => {
    mockFacultyAssignmentRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ id: 'assignment-1', ...dto })),
      save: jest.fn(async (entity) => entity),
      remove: jest.fn(),
    };

    mockAssessmentRepo = {
      count: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockAttemptRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (entity) => entity),
    };

    mockQuestionRepo = {
      count: jest.fn(),
    };

    mockBatchRepo = {
      findOne: jest.fn(),
    };

    mockEnrollmentRepo = {
      createQueryBuilder: jest.fn(),
      count: jest.fn(),
    };

    mockUserRepo = {
      findOne: jest.fn(),
    };

    mockS3Service = {
      getPresignedUrl: jest.fn(async (url: string) => `https://presigned.s3.amazonaws.com/${url}`),
    };

    service = new FacultyService(
      mockFacultyAssignmentRepo,
      mockAssessmentRepo,
      mockAttemptRepo,
      mockQuestionRepo,
      mockBatchRepo,
      mockEnrollmentRepo,
      mockUserRepo,
      mockS3Service,
    );
  });

  describe('getDashboardStats', () => {
    it('should compute scoped KPIs for the faculty member', async () => {
      mockAssessmentRepo.count
        .mockResolvedValueOnce(5) // myAssessmentsCount
        .mockResolvedValueOnce(2); // activeAssessmentsCount
      mockQuestionRepo.count.mockResolvedValueOnce(18); // myQuestionsCount
      mockFacultyAssignmentRepo.find.mockResolvedValueOnce([
        { batch_id: 'batch-1' },
        { batch_id: 'batch-2' },
      ]);
      mockAssessmentRepo.find.mockResolvedValueOnce([
        { id: 'asmt-1', title: 'Midterm Exam' },
      ]);

      const mockEnrollmentQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ count: '45' }),
      };
      mockEnrollmentRepo.createQueryBuilder.mockReturnValue(mockEnrollmentQb);

      mockAttemptRepo.find.mockResolvedValueOnce([
        { id: 'att-1', score: 85, passed: true, studentName: 'John Doe', studentUid: 'JD101' },
      ]);

      const res = await service.getDashboardStats(facultyUser);

      expect(res.success).toBe(true);
      expect(res.stats.myAssessmentsCount).toBe(5);
      expect(res.stats.activeAssessmentsCount).toBe(2);
      expect(res.stats.myQuestionsCount).toBe(18);
      expect(res.stats.assignedBatchesCount).toBe(2);
      expect(res.stats.assignedStudentsCount).toBe(45);
      expect(res.recentAssessments).toHaveLength(1);
    });
  });

  describe('getMyAssessments', () => {
    it('should calculate attempt and pass rate statistics per assessment', async () => {
      mockAssessmentRepo.find.mockResolvedValueOnce([
        { id: 'asmt-1', title: 'Data Structures Quiz', totalMarks: 100 },
      ]);

      mockAttemptRepo.find.mockResolvedValueOnce([
        { assessmentId: 'asmt-1', score: 80, passed: true, violations: [] },
        { assessmentId: 'asmt-1', score: 40, passed: false, violations: [{ type: 'tab_switch' }] },
      ]);

      const res = await service.getMyAssessments(facultyUser);

      expect(res.success).toBe(true);
      expect(res.assessments).toHaveLength(1);
      expect(res.assessments[0].totalAttempts).toBe(2);
      expect(res.assessments[0].passedAttempts).toBe(1);
      expect(res.assessments[0].avgScore).toBe(60);
      expect(res.assessments[0].flaggedAttempts).toBe(1);
    });
  });

  describe('getAttemptSnapshots', () => {
    it('should throw ForbiddenException if assessment was authored by another faculty', async () => {
      mockAssessmentRepo.findOne.mockResolvedValueOnce({
        id: 'asmt-2',
        created_by_id: 'other-author-uuid',
      });

      await expect(
        service.getAttemptSnapshots('asmt-2', 'att-1', facultyUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return presigned URLs for snapshots when authored by caller', async () => {
      mockAssessmentRepo.findOne.mockResolvedValueOnce({
        id: 'asmt-1',
        created_by_id: facultyUser.id,
      });

      mockAttemptRepo.findOne.mockResolvedValueOnce({
        id: 'att-1',
        assessmentId: 'asmt-1',
        studentName: 'Alice',
        studentUid: 'AL001',
        captures: [
          { type: 'webcam', url: 'proctoring/snap1.jpg', timestamp: new Date() },
        ],
      });

      const res = await service.getAttemptSnapshots('asmt-1', 'att-1', facultyUser);

      expect(res.success).toBe(true);
      expect(res.snapshots).toHaveLength(1);
      expect(res.snapshots[0].url).toContain('https://presigned.s3.amazonaws.com/');
    });
  });

  describe('reviewAttempt', () => {
    it('should apply manual score adjustment and update passed status', async () => {
      const assessment = {
        id: 'asmt-1',
        created_by_id: facultyUser.id,
        passingMarks: 60,
        totalMarks: 100,
      };
      mockAssessmentRepo.findOne.mockResolvedValueOnce(assessment);

      const attempt = {
        id: 'att-1',
        assessmentId: 'asmt-1',
        score: 55,
        rawScore: 55,
        proctoringPenalty: 0,
        maxScore: 100,
        passed: false,
        percentage: 55,
      };
      mockAttemptRepo.findOne.mockResolvedValueOnce(attempt);

      const res = await service.reviewAttempt(
        'asmt-1',
        'att-1',
        {
          manualScoreAdjustment: 10,
          instructorFeedback: 'Awarding partial credit for approach.',
          clearRadarFlags: true,
        },
        facultyUser,
      );

      expect(res.success).toBe(true);
      expect(res.attempt.score).toBe(65);
      expect(res.attempt.passed).toBe(true);
      expect(res.attempt.percentage).toBe(65);
      expect(res.attempt.instructorFeedback).toBe('Awarding partial credit for approach.');
      expect(res.attempt.radarFlagsCleared).toBe(true);
      expect(res.attempt.reviewedById).toBe(facultyUser.id);
    });

    it('should forbid other faculty from reviewing attempts', async () => {
      mockAssessmentRepo.findOne.mockResolvedValueOnce({
        id: 'asmt-1',
        created_by_id: 'different-author',
      });

      await expect(
        service.reviewAttempt('asmt-1', 'att-1', {}, facultyUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
