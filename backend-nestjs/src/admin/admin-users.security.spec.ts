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
});
