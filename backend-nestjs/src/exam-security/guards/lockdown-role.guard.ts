import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export type LockdownPermission =
  // TA, Teacher, Admin
  | 'VIEW_ROSTER'
  | 'GRANT_EXTRA_TIME'
  | 'SECTION_BROADCAST'
  | 'VIEW_FRICTION_HEATMAP'
  // Teacher, Admin
  | 'CONFIGURE_ACCOMMODATIONS'
  | 'CREATE_PRACTICE_MOCK'
  | 'COURSE_BROADCAST'
  | 'TOGGLE_GRADE_HOLD'
  | 'VIEW_INTEGRITY_DIGEST'
  // Admin Only
  | 'GRANT_PREFLIGHT_WAIVER'
  | 'ROTATE_QUIT_PIN'
  | 'FORCE_QUIT_CLIENT'
  | 'EXPORT_RAW_FORENSICS';

export const LOCKDOWN_PERMISSIONS_KEY = 'lockdown_permissions';
export const RequireLockdownPermissions = (...permissions: LockdownPermission[]) =>
  SetMetadata(LOCKDOWN_PERMISSIONS_KEY, permissions);

const TA_PERMISSIONS: Set<LockdownPermission> = new Set([
  'VIEW_ROSTER',
  'GRANT_EXTRA_TIME',
  'SECTION_BROADCAST',
  'VIEW_FRICTION_HEATMAP',
]);

const TEACHER_PERMISSIONS: Set<LockdownPermission> = new Set([
  ...TA_PERMISSIONS,
  'CONFIGURE_ACCOMMODATIONS',
  'CREATE_PRACTICE_MOCK',
  'COURSE_BROADCAST',
  'TOGGLE_GRADE_HOLD',
  'VIEW_INTEGRITY_DIGEST',
]);

const ADMIN_PERMISSIONS: Set<LockdownPermission> = new Set([
  ...TEACHER_PERMISSIONS,
  'GRANT_PREFLIGHT_WAIVER',
  'ROTATE_QUIT_PIN',
  'FORCE_QUIT_CLIENT',
  'EXPORT_RAW_FORENSICS',
]);

@Injectable()
export class LockdownRoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<LockdownPermission[]>(
      LOCKDOWN_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const userRole = (user.role || '').toLowerCase();
    const isAdmin = Boolean(
      user.isAdmin ||
        ['admin', 'super_admin', 'assessment_admin'].includes(userRole),
    );

    let allowedSet: Set<LockdownPermission>;
    if (isAdmin) {
      allowedSet = ADMIN_PERMISSIONS;
    } else if (['teacher', 'faculty', 'instructor'].includes(userRole)) {
      allowedSet = TEACHER_PERMISSIONS;
    } else if (['ta', 'teaching_assistant'].includes(userRole)) {
      allowedSet = TA_PERMISSIONS;
    } else {
      throw new ForbiddenException(
        'User does not hold instructor or invigilator privileges',
      );
    }

    const hasAll = requiredPermissions.every((perm) => allowedSet.has(perm));
    if (!hasAll) {
      throw new ForbiddenException(
        `Insufficient privileges for this action. Missing required permission(s): ${requiredPermissions
          .filter((p) => !allowedSet.has(p))
          .join(', ')}`,
      );
    }

    return true;
  }
}
