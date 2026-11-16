import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, MaxLength, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALLOWED_USER_ROLES, UserRole } from './update-user-role.dto';

const ALLOWED_ADMIN_ROLES = [
  'admin',
  'super_admin',
  'student_admin',
  'assessment_admin',
  'faculty',
  'teacher',
  'instructor',
] as const;

export class CreateAdminUserDto {
  @ApiProperty({ example: 'Admin User', description: 'Full name of the admin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 'admin@codeskill.io', description: 'Admin email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'SecureAdminPassword123!', description: 'Password (min 8 chars)' })
  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    enum: ALLOWED_ADMIN_ROLES,
    default: 'admin',
    description: 'Administrative role to grant',
  })
  @IsOptional()
  @IsIn(ALLOWED_ADMIN_ROLES, {
    message: `Role must be one of: ${ALLOWED_ADMIN_ROLES.join(', ')}`,
  })
  role?: string;
}
