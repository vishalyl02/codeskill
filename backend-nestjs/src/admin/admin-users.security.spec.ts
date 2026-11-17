jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => {}, InjectDataSource: () => () => {} }));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminService } from './admin.service';

describe('Admin User Role Security (AUD-020 & X-06)', () => {
  let adminService: AdminService;

  const mockUserRepo = {
    findOne: jest.fn(),
    count: jest.fn(),
    save: jest.fn(),
    create: jest.fn((dto) => ({ ...dto, id: 'created-uuid' })),
  };

  const mockTokenService = {
    invalidateUserSessions: jest.fn(),
  };

  const superAdminActor = {
    id: 'super-admin-1',
    email: 'super@codeskill.internal',
    role: 'super_admin',
    isAdmin: true,
  };

  const regularAdminActor = {
    id: 'admin-1',
    email: 'admin@codeskill.internal',
    role: 'admin',
    isAdmin: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));

    adminService = new AdminService(
      mockUserRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      mockTokenService as never,
    );
  });

  it('rejects regular admin attempting to elevate a student to admin (AUD-020)', async () => {
    const studentUser = {
      id: 'student-uuid',
      email: 'student@test.com',
      role: 'student',
      isAdmin: false,
      profile: { role: 'student' },
    };

    mockUserRepo.findOne.mockResolvedValue(studentUser);

    await expect(
      adminService.updateUserRole(
        'student-uuid',
        { role: 'admin', isAdmin: true },
        regularAdminActor,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(mockUserRepo.save).not.toHaveBeenCalled();
    expect(mockTokenService.invalidateUserSessions).not.toHaveBeenCalled();
  });

  it('rejects regular admin attempting to modify a super_admin account', async () => {
    const targetSuperAdmin = {
      id: 'target-super-admin',
      email: 'chief@test.com',
      role: 'super_admin',
      isAdmin: true,
    };

    mockUserRepo.findOne.mockResolvedValue(targetSuperAdmin);

    await expect(
      adminService.updateUserRole(
        'target-super-admin',
        { role: 'campus_admin' },
        regularAdminActor,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(mockUserRepo.save).not.toHaveBeenCalled();
  });

  it('prevents demotion of the last super_admin in the system (X-06)', async () => {
    const onlySuperAdmin = {
      id: superAdminActor.id,
      email: superAdminActor.email,
      role: 'super_admin',
      isAdmin: true,
    };

    mockUserRepo.findOne.mockResolvedValue(onlySuperAdmin);
    mockUserRepo.count.mockResolvedValue(1); // Only 1 super_admin exists

    await expect(
      adminService.updateUserRole(
        superAdminActor.id,
        { role: 'student', isAdmin: false },
        superAdminActor,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(mockUserRepo.save).not.toHaveBeenCalled();
    expect(mockTokenService.invalidateUserSessions).not.toHaveBeenCalled();
  });

  it('allows super_admin to elevate user, prevents mass-assignment, and invalidates sessions', async () => {
    const studentUser = {
      id: 'student-uuid',
      email: 'student@test.com',
      password: 'hashed-password-123',
      role: 'student',
      isAdmin: false,
      tokenVersion: 2,
      profile: { role: 'student' },
    };

    mockUserRepo.findOne.mockResolvedValue(studentUser);

    const result = await adminService.updateUserRole(
      'student-uuid',
      {
        role: 'admin',
        isAdmin: true,
        // Malicious mass-assignment payload properties
        password: 'hacked-password',
        tokenVersion: 999,
      } as never,
      superAdminActor,
    );

    expect(mockUserRepo.save).toHaveBeenCalled();
    const savedUser = mockUserRepo.save.mock.calls[0][0];

    // Role and isAdmin were updated
    expect(savedUser.role).toBe('admin');
    expect(savedUser.isAdmin).toBe(true);
    expect(savedUser.profile.role).toBe('admin');

    // Password and tokenVersion were NOT overwritten by payload
    expect(savedUser.password).toBe('hashed-password-123');
    expect(savedUser.tokenVersion).toBe(2);

    // Password must be stripped from response
    expect((result as any).password).toBeUndefined();

    // Session must be invalidated
    expect(mockTokenService.invalidateUserSessions).toHaveBeenCalledWith('student-uuid');
  });

  it('allows super_admin to demote an admin when multiple super_admins exist', async () => {
    const adminUser = {
      id: 'other-admin-uuid',
      email: 'otheradmin@test.com',
      role: 'admin',
      isAdmin: true,
      profile: { role: 'admin' },
    };

    mockUserRepo.findOne.mockResolvedValue(adminUser);

    const result = await adminService.demoteUser(
      'other-admin-uuid',
      superAdminActor,
    );

    expect(result.success).toBe(true);
    expect(mockUserRepo.save).toHaveBeenCalled();
    const savedUser = mockUserRepo.save.mock.calls[0][0];
    expect(savedUser.role).toBe('student');
    expect(savedUser.isAdmin).toBe(false);
    expect(mockTokenService.invalidateUserSessions).toHaveBeenCalledWith('other-admin-uuid');
  });

  describe('createAdminUser', () => {
    it('rejects regular admin attempting to create an admin user', async () => {
      await expect(
        adminService.createAdminUser(
          {
            name: 'New Admin',
            email: 'newadmin@test.com',
            password: 'StrongPassword123!',
            role: 'admin',
          },
          regularAdminActor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects passwords failing security policy', async () => {
      await expect(
        adminService.createAdminUser(
          {
            name: 'New Admin',
            email: 'newadmin@test.com',
            password: 'password123', // common password
            role: 'admin',
          },
          superAdminActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects creating an admin when email is already registered', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'existing-id', email: 'existing@test.com' });

      await expect(
        adminService.createAdminUser(
          {
            name: 'New Admin',
            email: 'existing@test.com',
            password: 'StrongPassword123!',
            role: 'admin',
          },
          superAdminActor,
        ),
      ).rejects.toThrow('A user with this email already exists');
    });

    it('creates an admin successfully when called by super_admin', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const result = await adminService.createAdminUser(
        {
          name: 'New Admin',
          email: 'validadmin@test.com',
          password: 'StrongPassword123!',
          role: 'admin',
        },
        superAdminActor,
      );

      expect(mockUserRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Admin',
          email: 'validadmin@test.com',
          role: 'admin',
          isAdmin: true,
          isActive: true,
        }),
      );
      expect(mockUserRepo.save).toHaveBeenCalled();
      expect(result._id).toBe('created-uuid');
      expect((result as any).password).toBeUndefined();
    });
  });

  describe('Candidate Report Generation (getReport)', () => {
    const mockProblemModel = {
      find: jest.fn(),
    };
    const mockSubmissionModel = {
      find: jest.fn(),
    };
    const mockAssessmentAttemptModel = {
      find: jest.fn(),
    };

    beforeEach(() => {
      (adminService as any).problemModel = mockProblemModel;
      (adminService as any).submissionModel = mockSubmissionModel;
      (adminService as any).assessmentAttemptModel = mockAssessmentAttemptModel;
      mockAssessmentAttemptModel.find.mockResolvedValue([]);
    });

    it('returns candidate report with calculated stats and resolved problem titles for UUID id', async () => {
      const validUuid = '11111111-2222-3333-4444-555555555555';
      const user = {
        id: validUuid,
        name: 'John Doe',
        email: 'john@example.com',
        role: 'student',
        isAdmin: false,
        password: 'hashed-secret',
      };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockSubmissionModel.find.mockResolvedValue([
        { id: 'sub-1', problemId: 'prob-1', status: 'Accepted', createdAt: new Date() },
        { id: 'sub-2', problemId: 'prob-2', status: 'Wrong Answer', createdAt: new Date() },
      ]);
      mockProblemModel.find.mockResolvedValue([
        { id: 'prob-1', title: 'Two Sum' },
        { id: 'prob-2', title: 'Reverse String' },
      ]);

      const res = await adminService.getReport(validUuid);

      expect(res.report).toBeDefined();
      expect(res.report.user.name).toBe('John Doe');
      expect((res.report.user as any).password).toBeUndefined();
      expect(res.report.stats.totalSubmissions).toBe(2);
      expect(res.report.stats.acceptedSubmissions).toBe(1);
      expect(res.report.stats.acceptanceRate).toBe(50);
      expect(res.report.recentSubmissions[0].problem.title).toBe('Two Sum');
    });

    it('safely handles non-UUID legacy identifiers without invalid uuid type error', async () => {
      const legacyMongoId = '654321654321654321654321';
      const user = {
        id: '22222222-3333-4444-5555-666666666666',
        mongoId: legacyMongoId,
        name: 'Legacy User',
        email: 'legacy@example.com',
        role: 'student',
      };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockSubmissionModel.find.mockResolvedValue([]);

      const res = await adminService.getReport(legacyMongoId);

      expect(mockUserRepo.findOne).toHaveBeenCalledWith({
        where: [{ mongoId: legacyMongoId }],
      });
      expect(res.report.stats.acceptanceRate).toBe(0);
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(adminService.getReport('unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('aggregates AssessmentAttempt stats (averageScore, totalAssessmentsPassed, totalViolations) and exposes studentProfile', async () => {
      const studentUuid = '33333333-3333-3333-3333-333333333333';
      const user = {
        id: studentUuid,
        uid: 'CS2026-042',
        name: 'Aarav Patel',
        email: 'aarav@university.edu',
        role: 'student',
        isAdmin: false,
        passwordHash: 'secret-hash',
        salt: 'random-salt',
        tokenVersion: 4,
        studentProfile: {
          university: 'Apex University',
          department: 'Computer Science',
          semester: 6,
          section: 'A',
          batch: '2023-2027',
        },
      };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockSubmissionModel.find.mockResolvedValue([
        { id: 'sub-1', problemId: 'p-1', status: 'accepted', createdAt: new Date() },
        { id: 'sub-2', problemId: 'p-1', status: 'accepted', createdAt: new Date() },
        { id: 'sub-3', problemId: 'p-2', status: 'wrong_answer', createdAt: new Date() },
      ]);
      mockProblemModel.find.mockResolvedValue([{ id: 'p-1', title: 'Binary Search' }]);

      mockAssessmentAttemptModel.find.mockResolvedValue([
        {
          id: 'att-1',
          assessmentId: 'asmt-1',
          assessment: { id: 'asmt-1', title: 'Midterm Algorithms', code: 'ALG101', totalMarks: 100 },
          status: 'submitted',
          score: 85,
          maxScore: 100,
          percentage: 85,
          passed: true,
          tabSwitchCount: 2,
          fullscreenExitCount: 1,
          violations: [{ type: 'audio' }],
          createdAt: new Date('2026-11-01'),
        },
        {
          id: 'att-2',
          assessmentId: 'asmt-2',
          assessment: { id: 'asmt-2', title: 'DBMS Quiz', code: 'DB201', totalMarks: 50 },
          status: 'submitted',
          score: 30,
          maxScore: 50,
          percentage: 60,
          passed: false,
          tabSwitchCount: 0,
          fullscreenExitCount: 0,
          violations: [],
          createdAt: new Date('2026-11-02'),
        },
      ]);

      const res = await adminService.getReport(studentUuid);

      expect(res.report).toBeDefined();
      expect(res.report.user.uid).toBe('CS2026-042');
      expect(res.report.user.studentProfile.department).toBe('Computer Science');
      expect((res.report.user as any).passwordHash).toBeUndefined();
      expect((res.report.user as any).salt).toBeUndefined();
      expect((res.report.user as any).tokenVersion).toBeUndefined();

      // Assessment stats
      expect(res.report.stats.totalAssessmentsAttempted).toBe(2);
      expect(res.report.stats.totalAssessmentsCompleted).toBe(2);
      expect(res.report.stats.totalAssessmentsPassed).toBe(1);
      expect(res.report.stats.averageScore).toBe(72.5); // (85 + 60) / 2 = 72.5
      expect(res.report.stats.highestScore).toBe(85);
      expect(res.report.stats.totalViolations).toBe(4); // 2 tab switches + 1 fullscreen + 1 violation

      // Formatted assessment attempts
      expect(res.report.assessmentAttempts).toHaveLength(2);
      expect(res.report.assessmentAttempts[0].assessmentTitle).toBe('Midterm Algorithms');
      expect(res.report.assessmentAttempts[0].passed).toBe(true);

      // Practice submissions (case-insensitive and unique problems solved)
      expect(res.report.stats.totalSubmissions).toBe(3);
      expect(res.report.stats.acceptedSubmissions).toBe(2);
      expect(res.report.stats.uniqueProblemsSolved).toBe(1); // p-1 was solved twice
    });

    it('avoids querying studentUid when user.uid is empty or whitespace', async () => {
      const studentUuid = '44444444-4444-4444-4444-444444444444';
      const user = {
        id: studentUuid,
        uid: '   ',
        name: 'Empty UID Student',
        email: 'empty@example.com',
        role: 'student',
      };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockSubmissionModel.find.mockResolvedValue([]);
      mockAssessmentAttemptModel.find.mockResolvedValue([]);

      await adminService.getReport(studentUuid);

      expect(mockAssessmentAttemptModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: [{ studentId: studentUuid }],
        }),
      );
    });

    it('falls back cleanly when candidate has zero assessments and zero submissions', async () => {
      const studentUuid = '55555555-5555-5555-5555-555555555555';
      const user = {
        id: studentUuid,
        name: 'New Student',
        email: 'new@example.com',
        role: 'student',
      };
      mockUserRepo.findOne.mockResolvedValue(user);
      mockSubmissionModel.find.mockResolvedValue([]);
      mockAssessmentAttemptModel.find.mockResolvedValue([]);

      const res = await adminService.getReport(studentUuid);

      expect(res.report.stats.totalAssessmentsAttempted).toBe(0);
      expect(res.report.stats.totalAssessmentsCompleted).toBe(0);
      expect(res.report.stats.totalAssessmentsPassed).toBe(0);
      expect(res.report.stats.averageScore).toBe(0);
      expect(res.report.stats.highestScore).toBe(0);
      expect(res.report.stats.totalViolations).toBe(0);
      expect(res.report.stats.totalSubmissions).toBe(0);
      expect(res.report.stats.acceptedSubmissions).toBe(0);
      expect(res.report.stats.acceptanceRate).toBe(0);
      expect(res.report.stats.uniqueProblemsSolved).toBe(0);
      expect(res.report.assessmentAttempts).toEqual([]);
      expect(res.report.recentSubmissions).toEqual([]);
    });
  });
});
