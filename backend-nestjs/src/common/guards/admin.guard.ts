import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

export const ADMIN_ROLES = [
  'admin',
  'super_admin',
  'student_admin',
  'assessment_admin',
];
export const ADMIN_OR_TEACHER_ROLES = ADMIN_ROLES;

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (
      user &&
      (user.isAdmin || ADMIN_ROLES.includes(user.role))
    ) {
      return true;
    }

    throw new ForbiddenException('Not authorized as an admin');
  }
}

@Injectable()
export class TeacherGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (
      user &&
      (user.isAdmin ||
        [
          'admin',
          'super_admin',
          'assessment_admin',
          'teacher',
          'faculty',
          'instructor',
        ].includes(user.role))
    ) {
      return true;
    }

    throw new ForbiddenException('Not authorized as a teacher or admin');
  }
}
