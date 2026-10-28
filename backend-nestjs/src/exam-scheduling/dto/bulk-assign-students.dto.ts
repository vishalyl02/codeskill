import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class StudentFilterCriteriaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  academicSession?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return isNaN(value) ? undefined : value;
    const num = parseInt(String(value).replace(/\D/g, ''), 10);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  semester?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  program?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  section?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return isNaN(value) ? undefined : value;
    const num = parseInt(String(value).replace(/\D/g, ''), 10);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  isActive?: string;

  @ApiPropertyOptional({ type: [String], description: 'Specific student IDs or UIDs to exclude from filter' })
  @IsOptional()
  @IsArray()
  excludeStudentIds?: string[];
}

export class BulkAssignStudentsDto {
  @ApiProperty({
    enum: ['filter', 'manual', 'csv', 'saved_group'],
    description: 'Source mode for assigning students to eligibility pool',
  })
  @Transform(({ value, obj }) => value || obj?.selectionType)
  @IsEnum(['filter', 'manual', 'csv', 'saved_group'])
  source: 'filter' | 'manual' | 'csv' | 'saved_group';

  @ApiPropertyOptional({ enum: ['filter', 'manual', 'csv', 'saved_group'] })
  @IsOptional()
  selectionType?: 'filter' | 'manual' | 'csv' | 'saved_group';

  @ApiPropertyOptional({ type: StudentFilterCriteriaDto, description: 'Used when source=filter' })
  @IsOptional()
  filterCriteria?: StudentFilterCriteriaDto;

  @ApiPropertyOptional({ type: [String], description: 'Used when source=manual or csv (array of user UUIDs or UIDs)' })
  @Transform(({ value, obj }) => value || obj?.studentUids || obj?.uids)
  @IsOptional()
  @IsArray()
  studentIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  studentUids?: string[];

  @ApiPropertyOptional({ description: 'Used when source=saved_group (UUID of saved cohort)' })
  @IsOptional()
  @IsString()
  savedGroupId?: string;

  @ApiPropertyOptional({ description: 'Optional specific slot to assign these students into directly' })
  @IsOptional()
  @IsString()
  targetSlotId?: string;
}

export class CsvValidationResultDto {
  matchedStudents: Array<{
    id: string;
    uid: string;
    name: string;
    email: string;
    department?: string;
    semester?: number;
    section?: string;
  }>;
  unknownUids: string[];
  duplicateUids: string[];
  alreadyAssignedUids: string[];
  conflictingUids: Array<{
    uid: string;
    conflictingScheduleTitle: string;
    conflictingSlotTime: string;
  }>;
}
