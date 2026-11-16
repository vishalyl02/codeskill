import { IsIn, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const ALLOWED_USER_ROLES = [
  'student',
  'admin',
  'super_admin',
  'campus_admin',
  'company_admin',
  'student_admin',
  'assessment_admin',
  'faculty',
  'teacher',
  'instructor',
] as const;

export type UserRole = (typeof ALLOWED_USER_ROLES)[number];

export class UpdateUserRoleDto {
  @ApiPropertyOptional({ enum: ALLOWED_USER_ROLES, example: 'admin' })
  @IsOptional()
  @IsIn(ALLOWED_USER_ROLES, {
    message: `Role must be one of: ${ALLOWED_USER_ROLES.join(', ')}`,
  })
  role?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;
}
