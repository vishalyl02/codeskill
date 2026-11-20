import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  LockdownRoleGuard,
  LockdownPermission,
  LOCKDOWN_PERMISSIONS_KEY,
} from './lockdown-role.guard';

describe('LockdownRoleGuard', () => {
  let guard: LockdownRoleGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new LockdownRoleGuard(reflector);
  });

  function createMockContext(user?: any): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows access when no permissions are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createMockContext({ role: 'student' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when user is not present', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['VIEW_ROSTER'] as LockdownPermission[]);
    const ctx = createMockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows TA to perform TA permissions (VIEW_ROSTER, GRANT_EXTRA_TIME)', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['VIEW_ROSTER', 'GRANT_EXTRA_TIME'] as LockdownPermission[]);
    const ctx = createMockContext({ role: 'ta' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects TA trying to perform Teacher permission (CONFIGURE_ACCOMMODATIONS)', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['CONFIGURE_ACCOMMODATIONS'] as LockdownPermission[]);
    const ctx = createMockContext({ role: 'ta' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows Instructor to perform Teacher & TA permissions (CONFIGURE_ACCOMMODATIONS, TOGGLE_GRADE_HOLD, VIEW_ROSTER)', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([
        'VIEW_ROSTER',
        'CONFIGURE_ACCOMMODATIONS',
        'TOGGLE_GRADE_HOLD',
      ] as LockdownPermission[]);
    const ctx = createMockContext({ role: 'instructor' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects Instructor trying to perform Admin-only permission (ROTATE_QUIT_PIN)', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['ROTATE_QUIT_PIN'] as LockdownPermission[]);
    const ctx = createMockContext({ role: 'teacher' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('strictly allows Admin to perform ALL permissions (TA, Teacher, and Admin-only superset)', () => {
    const allPermissions: LockdownPermission[] = [
      'VIEW_ROSTER',
      'GRANT_EXTRA_TIME',
      'SECTION_BROADCAST',
      'VIEW_FRICTION_HEATMAP',
      'CONFIGURE_ACCOMMODATIONS',
      'CREATE_PRACTICE_MOCK',
      'COURSE_BROADCAST',
      'TOGGLE_GRADE_HOLD',
      'VIEW_INTEGRITY_DIGEST',
      'GRANT_PREFLIGHT_WAIVER',
      'ROTATE_QUIT_PIN',
      'FORCE_QUIT_CLIENT',
      'EXPORT_RAW_FORENSICS',
    ];
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(allPermissions);
    const ctx = createMockContext({ role: 'admin', isAdmin: true });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
