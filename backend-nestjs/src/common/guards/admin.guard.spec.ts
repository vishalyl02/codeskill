import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { AdminGuard, TeacherGuard } from './admin.guard';

describe('AdminGuard & TeacherGuard (AUD-025)', () => {
  let adminGuard: AdminGuard;
  let teacherGuard: TeacherGuard;

  beforeEach(() => {
    adminGuard = new AdminGuard();
    teacherGuard = new TeacherGuard();
  });

  const createMockContext = (user: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  };

  it('allows user with isAdmin: true', () => {
    const ctx = createMockContext({ id: 'u-1', isAdmin: true, role: 'student' });
    expect(adminGuard.canActivate(ctx)).toBe(true);
    expect(teacherGuard.canActivate(ctx)).toBe(true);
  });

  it('allows user with admin or super_admin role', () => {
    const ctx = createMockContext({ id: 'u-2', role: 'admin' });
    expect(adminGuard.canActivate(ctx)).toBe(true);
    expect(teacherGuard.canActivate(ctx)).toBe(true);
  });

  it('allows teacher role only through the teacher guard (AUD-025)', () => {
    const ctx = createMockContext({ id: 'u-3', role: 'teacher' });
    expect(() => adminGuard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(teacherGuard.canActivate(ctx)).toBe(true);
  });

  it('allows faculty and instructor roles (AUD-025)', () => {
    const ctxFaculty = createMockContext({ id: 'u-4', role: 'faculty' });
    const ctxInstructor = createMockContext({ id: 'u-5', role: 'instructor' });
    expect(() => adminGuard.canActivate(ctxFaculty)).toThrow(ForbiddenException);
    expect(() => adminGuard.canActivate(ctxInstructor)).toThrow(ForbiddenException);
    expect(teacherGuard.canActivate(ctxFaculty)).toBe(true);
    expect(teacherGuard.canActivate(ctxInstructor)).toBe(true);
  });

  it('rejects student or unauthorized user', () => {
    const ctxStudent = createMockContext({ id: 'u-6', role: 'student' });
    const ctxAnonymous = createMockContext(null);

    expect(() => adminGuard.canActivate(ctxStudent)).toThrow(ForbiddenException);
    expect(() => adminGuard.canActivate(ctxAnonymous)).toThrow(ForbiddenException);

    expect(() => teacherGuard.canActivate(ctxStudent)).toThrow(ForbiddenException);
    expect(() => teacherGuard.canActivate(ctxAnonymous)).toThrow(ForbiddenException);
  });
});
