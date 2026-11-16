jest.mock('@nestjs/typeorm', () => {
  const actual = jest.requireActual('@nestjs/typeorm');
  return {
    ...actual,
    InjectRepository: () => () => {},
    InjectDataSource: () => () => {},
  };
});

import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { QuestionsService } from '../questions/questions.service';
import { AssessmentsService } from '../assessments/assessments.service';

describe('Admin & Faculty Ownership Isolation Specs', () => {
  describe('AdminService - Role Assignment & Faculty Cohorts', () => {
    let adminService: AdminService;
    let mockUserRepo: any;
    let mockFacultyAssignmentRepo: any;
    let mockBatchRepo: any;

    beforeEach(() => {
      mockUserRepo = {
        findOne: jest.fn(),
        find: jest.fn(),
        count: jest.fn(),
        save: jest.fn(async (u) => u),
        create: jest.fn((u) => u),
      };
      mockFacultyAssignmentRepo = {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn((a) => ({ id: 'asgn-1', ...a })),
        save: jest.fn(async (a) => a),
        remove: jest.fn(async () => true),
      };
      mockBatchRepo = {
        findOne: jest.fn(),
      };

      adminService = new AdminService(
        mockUserRepo, // 0: userRepo
        {} as any, // 1: problemModel
        {} as any, // 2: statementModel
        {} as any, // 3: configModel
        {} as any, // 4: testCaseModel
        {} as any, // 5: contestModel
        {} as any, // 6: companyModel
        {} as any, // 7: universityModel
        {} as any, // 8: submissionModel
        {} as any, // 9: assessmentModel
        {} as any, // 10: questionModel
        {} as any, // 11: cacheService
        { invalidateUserSessions: jest.fn().mockResolvedValue(true) } as any, // 12: tokenService
        {} as any, // 13: attemptModel
        {} as any, // 14: reattemptGrantModel
        { log: jest.fn() } as any, // 15: activityLogService
        mockFacultyAssignmentRepo, // 16: facultyAssignmentModel
        mockBatchRepo, // 17: batchModel
      );
    });

    it('should assign faculty role and keep isAdmin = false', async () => {
      const user = { id: 'user-1', email: 'prof@univ.edu', role: 'student', isAdmin: false };
      mockUserRepo.findOne.mockResolvedValueOnce(user);

      const result = await adminService.updateUserRole(
        'user-1',
        { role: 'faculty' },
        { id: 'admin-1', role: 'admin' },
      );

      expect(user.role).toBe('faculty');
      expect(user.isAdmin).toBe(false);
      expect(result.role).toBe('faculty');
    });

    it('should normalize teacher and instructor aliases to faculty', async () => {
      const user = { id: 'user-2', email: 'teacher@univ.edu', role: 'student', isAdmin: false };
      mockUserRepo.findOne.mockResolvedValueOnce(user);

      await adminService.updateUserRole(
        'user-2',
        { role: 'instructor' },
        { id: 'admin-1', role: 'admin' },
      );

      expect(user.role).toBe('faculty');
      expect(user.isAdmin).toBe(false);
    });

    it('should create faculty assignment linking teacher to batch and course', async () => {
      const facultyUser = { id: 'fac-1', email: 'fac@univ.edu', role: 'faculty' };
      const batch = { id: 'batch-1', name: 'CSE 2024' };
      mockUserRepo.findOne.mockResolvedValueOnce(facultyUser);
      mockBatchRepo.findOne.mockResolvedValueOnce(batch);
      mockFacultyAssignmentRepo.findOne.mockResolvedValueOnce(null);

      const res = await adminService.createFacultyAssignment(
        'fac-1',
        { batchId: 'batch-1', courseCode: 'CS101', section: 'A' },
        { id: 'admin-1', role: 'admin' },
      );

      expect(res.success).toBe(true);
      expect(mockFacultyAssignmentRepo.save).toHaveBeenCalled();
    });

    it('should reject duplicate faculty assignments for same batch and course', async () => {
      const facultyUser = { id: 'fac-1', email: 'fac@univ.edu', role: 'faculty' };
      const batch = { id: 'batch-1', name: 'CSE 2024' };
      mockUserRepo.findOne.mockResolvedValueOnce(facultyUser);
      mockBatchRepo.findOne.mockResolvedValueOnce(batch);
      mockFacultyAssignmentRepo.findOne.mockResolvedValueOnce({ id: 'existing-1' });

      await expect(
        adminService.createFacultyAssignment(
          'fac-1',
          { batchId: 'batch-1', courseCode: 'CS101' },
          { id: 'admin-1', role: 'admin' },
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('QuestionsService - Question Bank Ownership Isolation', () => {
    let questionsService: QuestionsService;
    let mockQuestionRepo: any;

    beforeEach(() => {
      mockQuestionRepo = {
        findOne: jest.fn(),
        findBy: jest.fn(),
        save: jest.fn(async (q) => q),
      };

      questionsService = new QuestionsService(
        mockQuestionRepo,
        {} as any,
        { create: jest.fn((dto) => dto), save: jest.fn() } as any,
        { invalidatePrefix: jest.fn() } as any,
      );
    });

    it('should allow author faculty to update own question', async () => {
      mockQuestionRepo.findOne.mockResolvedValueOnce({
        id: 'q-1',
        created_by_id: 'faculty-1',
        status: 'active',
        questionType: 'single_choice',
      });

      const res = await questionsService.update(
        'q-1',
        { title: 'Updated Question' } as any,
        { id: 'faculty-1', role: 'faculty' },
      );

      expect(res).toBeDefined();
      expect(res.id).toBe('q-1');
    });

    it('should prevent faculty from updating questions authored by another faculty', async () => {
      mockQuestionRepo.findOne.mockResolvedValueOnce({
        id: 'q-1',
        created_by_id: 'different-faculty',
        status: 'active',
      });

      await expect(
        questionsService.update(
          'q-1',
          { title: 'Hacked Question' } as any,
          { id: 'faculty-1', role: 'faculty' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent faculty from deleting questions authored by another faculty', async () => {
      mockQuestionRepo.findOne.mockResolvedValueOnce({
        id: 'q-1',
        created_by_id: 'different-faculty',
        status: 'active',
      });

      await expect(
        questionsService.delete('q-1', { id: 'faculty-1', role: 'faculty' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to update and delete any question', async () => {
      mockQuestionRepo.findOne.mockResolvedValueOnce({
        id: 'q-1',
        created_by_id: 'faculty-1',
        status: 'active',
        questionType: 'single_choice',
      });

      const res = await questionsService.update(
        'q-1',
        { title: 'Admin Update' } as any,
        { id: 'admin-1', role: 'admin' },
      );

      expect(res).toBeDefined();
      expect(res.id).toBe('q-1');
    });
  });

  describe('AssessmentsService - Assessment Read Isolation', () => {
    let assessmentsService: AssessmentsService;
    let mockAssessmentRepo: any;

    beforeEach(() => {
      mockAssessmentRepo = {
        createQueryBuilder: jest.fn(),
        findOne: jest.fn(),
      };

      assessmentsService = new AssessmentsService(
        mockAssessmentRepo,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
    });

    it('should filter findAll query by created_by_id when caller is faculty', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 'asmt-1', title: 'My Exam' }]),
      };
      mockAssessmentRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await assessmentsService.findAll({}, { id: 'fac-1', role: 'faculty' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'assessment.created_by_id = :facultyId',
        { facultyId: 'fac-1' },
      );
      expect(res.assessments).toHaveLength(1);
    });

    it('should throw ForbiddenException in findById if faculty does not own the assessment', async () => {
      // Mock findAssessmentByIdOrCode
      (assessmentsService as any).findAssessmentByIdOrCode = jest.fn().mockResolvedValue({
        id: 'asmt-2',
        created_by_id: 'other-author',
      });

      await expect(
        assessmentsService.findById('asmt-2', { id: 'fac-1', role: 'faculty' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
