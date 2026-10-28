import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExamSlotDto {
  @ApiProperty({ description: 'Slot title/name (e.g. Slot 1 - Morning CSE)' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Unique slot code within schedule (e.g. SLOT-01)' })
  @IsString()
  slotCode: string;

  @ApiProperty({ description: 'Exam date (YYYY-MM-DD)' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Start time ISO string (with timezone)' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ description: 'End time ISO string (with timezone)' })
  @IsDateString()
  endTime: string;

  @ApiProperty({ default: 300, description: 'Slot student capacity' })
  @IsNumber()
  capacity: number;

  @ApiPropertyOptional({ description: 'Physical examination hall, lab, or room' })
  @IsOptional()
  @IsString()
  roomOrLab?: string;
}
