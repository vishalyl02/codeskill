import {
  IsString,
  IsUUID,
  IsOptional,
  IsNumber,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExamScheduleConfigDto {
  @ApiPropertyOptional({ default: 5, description: 'Early access window in minutes' })
  @IsOptional()
  @IsNumber()
  earlyAccessMinutes?: number = 5;

  @ApiPropertyOptional({ default: 15, description: 'Allowed late start window in minutes' })
  @IsOptional()
  @IsNumber()
  lateStartAllowanceMinutes?: number = 15;

  @ApiPropertyOptional({ default: 5, description: 'Submission grace period in minutes' })
  @IsOptional()
  @IsNumber()
  gracePeriodMinutes?: number = 5;

  @ApiPropertyOptional({ default: 60, description: 'Maximum exam duration in minutes' })
  @IsOptional()
  @IsNumber()
  maxDurationMinutes?: number = 60;

  @ApiPropertyOptional({ default: 1, description: 'Number of allowed attempts' })
  @IsOptional()
  @IsNumber()
  allowedAttempts?: number = 1;

  @ApiPropertyOptional({ default: true, description: 'Allow resuming active attempt' })
  @IsOptional()
  @IsBoolean()
  allowResume?: boolean = true;

  @ApiPropertyOptional({ default: true, description: 'Allow reconnection re-entry' })
  @IsOptional()
  @IsBoolean()
  allowDisconnectionReentry?: boolean = true;

  @ApiPropertyOptional({ default: true, description: 'Enforce strict slot end time boundary' })
  @IsOptional()
  @IsBoolean()
  strictTimeBoundary?: boolean = true;

  @ApiPropertyOptional({ description: 'Schedule start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Schedule end date (YYYY-MM-DD, inclusive)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ enum: ['slotted', 'flexible'], default: 'slotted' })
  @IsOptional()
  @IsString()
  scheduleMode?: 'slotted' | 'flexible' = 'slotted';

  @ApiPropertyOptional({ default: false, description: 'Allow flexible access without individual slots' })
  @IsOptional()
  @IsBoolean()
  isFlexibleAvailability?: boolean = false;

  @ApiPropertyOptional({ description: 'Flexible availability window opening timestamp (ISO string)' })
  @IsOptional()
  @IsString()
  flexibleWindowStart?: string;

  @ApiPropertyOptional({ description: 'Flexible availability window closing timestamp (ISO string)' })
  @IsOptional()
  @IsString()
  flexibleWindowEnd?: string;

  @ApiPropertyOptional({ default: 15, description: 'Completion grace period in minutes' })
  @IsOptional()
  @IsNumber()
  completionGracePeriodMinutes?: number = 15;
}

export class CreateExamScheduleDto {
  @ApiProperty({ description: 'Assessment UUID to schedule' })
  @IsUUID()
  assessmentId: string;

  @ApiProperty({ description: 'Title of the exam schedule' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Unique schedule code (e.g. SCH-DSA-2026-F)' })
  @IsString()
  code: string;

  @ApiPropertyOptional({ description: 'Description or notes' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: '2025-2026' })
  @IsOptional()
  @IsString()
  academicSession?: string = '2025-2026';

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return 5;
    if (typeof value === 'number') return isNaN(value) ? 5 : value;
    const num = parseInt(String(value).replace(/\D/g, ''), 10);
    return isNaN(num) ? 5 : num;
  })
  @IsNumber()
  semester?: number = 5;

  @ApiPropertyOptional({ default: 'B.E. Computer Science & Engineering' })
  @IsOptional()
  @IsString()
  program?: string = 'B.E. Computer Science & Engineering';

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return 3;
    if (typeof value === 'number') return isNaN(value) ? 3 : value;
    const num = parseInt(String(value).replace(/\D/g, ''), 10);
    return isNaN(num) ? 3 : num;
  })
  @IsNumber()
  academicYear?: number = 3;

  @ApiPropertyOptional({ default: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  timezone?: string = 'Asia/Kolkata';

  @ApiPropertyOptional({ default: 500, description: 'Max concurrent exam sessions' })
  @IsOptional()
  @IsNumber()
  maxConcurrentSessions?: number = 500;

  @ApiPropertyOptional({ type: ExamScheduleConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExamScheduleConfigDto)
  config?: ExamScheduleConfigDto;
}
