import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RevokeStudentAccessDto {
  @ApiPropertyOptional({ type: [String], description: 'List of assignment UUIDs to revoke' })
  @IsOptional()
  @Transform(({ value, obj }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    if (Array.isArray(obj?.studentIds)) return obj.studentIds;
    if (typeof obj?.studentId === 'string' && obj.studentId.trim()) return [obj.studentId.trim()];
    if (typeof obj?.assignmentId === 'string' && obj.assignmentId.trim()) return [obj.assignmentId.trim()];
    return [];
  })
  @IsArray()
  assignmentIds?: string[];

  @ApiPropertyOptional({ description: 'Single student UUID or student UID' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Single assignment UUID' })
  @IsOptional()
  @IsString()
  assignmentId?: string;

  @ApiProperty({ description: 'Mandatory reason for access revocation' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class GrantExceptionAccessDto {
  @ApiPropertyOptional({ description: 'Student assignment UUID or student ID' })
  @IsOptional()
  @Transform(({ value, obj }) => value || obj?.studentId || obj?.id)
  @IsString()
  assignmentId?: string;

  @ApiPropertyOptional({ description: 'Student user UUID' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Additional exam duration in minutes granted as exception' })
  @IsOptional()
  @Transform(({ value }) => value !== undefined ? (Number(value) || 0) : undefined)
  @IsNumber()
  extraTimeMinutes?: number;

  @ApiPropertyOptional({ description: 'Custom extended access window end ISO timestamp' })
  @IsOptional()
  @Transform(({ value, obj }) => value || obj?.customEnd)
  @IsOptional()
  newAccessWindowEnd?: string;

  @ApiPropertyOptional({ description: 'Custom extended access window start ISO timestamp' })
  @IsOptional()
  @Transform(({ value, obj }) => value || obj?.customStart)
  @IsOptional()
  newAccessWindowStart?: string;

  @ApiProperty({ description: 'Mandatory documented administrative justification' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ReinstateStudentAccessDto {
  @ApiPropertyOptional({ type: [String], description: 'List of assignment UUIDs to reinstate' })
  @IsOptional()
  @Transform(({ value, obj }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    if (Array.isArray(obj?.studentIds)) return obj.studentIds;
    if (typeof obj?.studentId === 'string' && obj.studentId.trim()) return [obj.studentId.trim()];
    if (typeof obj?.assignmentId === 'string' && obj.assignmentId.trim()) return [obj.assignmentId.trim()];
    return [];
  })
  @IsArray()
  assignmentIds?: string[];

  @ApiPropertyOptional({ description: 'Student assignment UUID or student ID' })
  @IsOptional()
  @Transform(({ value, obj }) => value || obj?.studentId || obj?.id)
  @IsString()
  assignmentId?: string;

  @ApiPropertyOptional({ description: 'Student user UUID' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Target slot ID to place reinstated student into' })
  @IsOptional()
  @IsString()
  targetSlotId?: string;

  @ApiProperty({ description: 'Mandatory documented administrative justification' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
