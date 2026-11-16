import { IsOptional, IsString, IsNumberString, IsIn, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ActivityCategory,
  ActivityRole,
  ActivitySeverity,
} from '../../audit/activity-log.types';

export class GetActivityQueryDto {
  @ApiPropertyOptional({ description: 'Base64 cursor for keyset pagination' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Number of items per page (1-100)' })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({ description: 'Search term (name, email, roll number, IP, target)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Category filter',
    enum: ['all', 'auth', 'assessment', 'submission', 'security', 'radar', 'question', 'user', 'contest'],
  })
  @IsOptional()
  @IsIn(['all', 'auth', 'assessment', 'submission', 'security', 'radar', 'question', 'user', 'contest'])
  category?: ActivityCategory;

  @ApiPropertyOptional({
    description: 'Role filter',
    enum: ['all', 'student', 'admin', 'teacher'],
  })
  @IsOptional()
  @IsIn(['all', 'student', 'admin', 'teacher'])
  role?: ActivityRole;

  @ApiPropertyOptional({
    description: 'Severity filter',
    enum: ['all', 'normal', 'warning', 'critical'],
  })
  @IsOptional()
  @IsIn(['all', 'normal', 'warning', 'critical'])
  severity?: ActivitySeverity;

  @ApiPropertyOptional({ description: 'Filter by specific action string' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'Filter by specific actorId / studentId (Student 360°)' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Start date filter (ISO string)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter (ISO string)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class GetActivityCountQueryDto {
  @ApiPropertyOptional({ description: 'ISO timestamp since when to count new events' })
  @IsString()
  since: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['all', 'auth', 'assessment', 'submission', 'security', 'radar', 'question', 'user', 'contest'])
  category?: ActivityCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['all', 'student', 'admin', 'teacher'])
  role?: ActivityRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['all', 'normal', 'warning', 'critical'])
  severity?: ActivitySeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  actorId?: string;
}
