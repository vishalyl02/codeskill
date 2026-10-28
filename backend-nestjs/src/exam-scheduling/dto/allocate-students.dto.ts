import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type AllocationStrategy =
  | 'balanced'
  | 'sequential'
  | 'section_grouped'
  | 'random';

export class AllocateStudentsDto {
  @ApiProperty({
    enum: ['balanced', 'sequential', 'section_grouped', 'random'],
    default: 'balanced',
    description: 'Distribution strategy for assigning students to slots',
  })
  @IsEnum(['balanced', 'sequential', 'section_grouped', 'random'])
  strategy: AllocationStrategy;

  @ApiPropertyOptional({
    type: [String],
    description: 'Target slot IDs to allocate into (omit to use all active slots in schedule)',
  })
  @IsOptional()
  @IsArray()
  slotIds?: string[];

  @ApiPropertyOptional({
    default: false,
    description: 'Whether to rebalance students who are already assigned to a slot but have not started',
  })
  @IsOptional()
  @IsBoolean()
  rebalanceExisting?: boolean = false;
}

export class ReassignStudentSlotDto {
  @ApiPropertyOptional({ description: 'Student assignment UUID or student ID' })
  @IsOptional()
  @Transform(({ value, obj }) => value || obj?.studentId || obj?.id)
  @IsString()
  assignmentId?: string;

  @ApiPropertyOptional({ description: 'Student user UUID' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiProperty({ description: 'Destination slot UUID' })
  @IsString()
  targetSlotId: string;

  @ApiPropertyOptional({ description: 'Administrative reason for moving student' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BatchReassignSlotDto {
  @ApiPropertyOptional({ type: [String], description: 'List of assignment UUIDs to move' })
  @IsOptional()
  @Transform(({ value, obj }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    if (Array.isArray(obj?.studentIds)) return obj.studentIds;
    if (typeof obj?.studentId === 'string') return [obj.studentId];
    if (typeof obj?.assignmentId === 'string') return [obj.assignmentId];
    return [];
  })
  @IsArray()
  assignmentIds?: string[];

  @ApiProperty({ description: 'Destination slot UUID' })
  @IsString()
  targetSlotId: string;

  @ApiPropertyOptional({ description: 'Administrative reason for batch move' })
  @IsOptional()
  @IsString()
  reason?: string;
}
