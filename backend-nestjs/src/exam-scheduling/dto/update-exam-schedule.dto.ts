import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExamScheduleConfigDto } from './create-exam-schedule.dto';

export class UpdateExamScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

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
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return isNaN(value) ? undefined : value;
    const num = parseInt(String(value).replace(/\D/g, ''), 10);
    return isNaN(num) ? undefined : num;
  })
  @IsNumber()
  academicYear?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxConcurrentSessions?: number;

  @ApiPropertyOptional({ enum: ['draft', 'published', 'completed', 'cancelled'] })
  @IsOptional()
  @IsEnum(['draft', 'published', 'completed', 'cancelled'])
  status?: 'draft' | 'published' | 'completed' | 'cancelled';

  @ApiPropertyOptional({ type: ExamScheduleConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExamScheduleConfigDto)
  config?: ExamScheduleConfigDto;
}
