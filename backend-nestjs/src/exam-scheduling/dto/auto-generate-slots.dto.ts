import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AutoGenerateSlotsDto {
  @ApiProperty({ description: 'Start date (YYYY-MM-DD)' })
  @IsString()
  startDate: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiProperty({ description: 'Start time of first slot in HH:mm (e.g. 09:00)' })
  @IsString()
  dailyStartTime: string;

  @ApiPropertyOptional({ description: 'End time of slots in HH:mm (e.g. 17:00)' })
  @IsOptional()
  @IsString()
  dailyEndTime?: string;

  @ApiPropertyOptional({ default: 60, description: 'Duration of each exam slot in minutes (e.g. 60)' })
  @IsOptional()
  @Transform(({ value }) => {
    const n = Number(value);
    return isNaN(n) ? 60 : Math.max(15, Math.min(360, n));
  })
  @IsNumber()
  @Min(15)
  @Max(360)
  slotDurationMinutes?: number = 60;

  @ApiPropertyOptional({ default: 30, description: 'Break / gap between consecutive slots in minutes' })
  @IsOptional()
  @Transform(({ value, obj }) => {
    const raw = value !== undefined ? value : (obj?.breakDurationMinutes ?? obj?.gap);
    const n = Number(raw);
    return isNaN(n) ? 30 : Math.max(0, Math.min(240, n));
  })
  @IsNumber()
  @Min(0)
  @Max(240)
  gapMinutes?: number = 30;

  @ApiPropertyOptional()
  @IsOptional()
  breakDurationMinutes?: number;

  @ApiPropertyOptional({ default: 300, description: 'Student capacity per slot' })
  @IsOptional()
  @Transform(({ value }) => {
    const n = Number(value);
    return isNaN(n) ? 300 : Math.max(1, n);
  })
  @IsNumber()
  @Min(1)
  capacityPerSlot?: number = 300;

  @ApiPropertyOptional({ default: 4, description: 'Number of slots to generate per day' })
  @IsOptional()
  @Transform(({ value, obj }) => {
    if (value !== undefined) {
      const n = Number(value);
      if (!isNaN(n) && n >= 1) return Math.min(10, n);
    }
    if (obj?.dailyStartTime && obj?.dailyEndTime) {
      const [startH, startM] = String(obj.dailyStartTime).split(':').map(Number);
      const [endH, endM] = String(obj.dailyEndTime).split(':').map(Number);
      const startMin = (startH || 9) * 60 + (startM || 0);
      const endMin = (endH || 17) * 60 + (endM || 0);
      const duration = Number(obj.slotDurationMinutes) || 60;
      const gap = Number(obj.gapMinutes ?? obj.breakDurationMinutes) || 30;
      const available = Math.max(0, endMin - startMin);
      if (available > 0) {
        const slots = Math.floor((available + gap) / (duration + gap));
        return Math.max(1, Math.min(10, slots || 4));
      }
    }
    return 4;
  })
  @IsNumber()
  @Min(1)
  @Max(10)
  slotsPerDay?: number = 4;

  @ApiPropertyOptional({ default: 1, description: 'Number of consecutive days' })
  @IsOptional()
  @Transform(({ value, obj }) => {
    if (value !== undefined) {
      const n = Number(value);
      if (!isNaN(n) && n >= 1) return Math.min(14, n);
    }
    if (obj?.startDate && obj?.endDate) {
      const d1 = new Date(obj.startDate);
      const d2 = new Date(obj.endDate);
      const diffMs = d2.getTime() - d1.getTime();
      const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
      return Math.max(1, Math.min(14, days || 1));
    }
    return 1;
  })
  @IsNumber()
  @Min(1)
  @Max(14)
  totalDays?: number = 1;

  @ApiPropertyOptional({ default: 'Slot', description: 'Name prefix for slots' })
  @IsOptional()
  @Transform(({ value, obj }) => value || obj?.slotPrefix || 'Slot')
  @IsString()
  namePrefix?: string = 'Slot';

  @ApiPropertyOptional()
  @IsOptional()
  slotPrefix?: string;
}
