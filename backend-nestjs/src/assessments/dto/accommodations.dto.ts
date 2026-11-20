import { IsUUID, IsNumber, IsBoolean, IsOptional, IsString, Min, Max } from 'class-validator';

export class UpsertAccommodationDto {
  @IsUUID()
  userId: string;

  @IsNumber()
  @IsOptional()
  @Min(1.0)
  @Max(5.0)
  timeMultiplier?: number;

  @IsBoolean()
  @IsOptional()
  secondaryDisplayAllowed?: boolean;

  @IsBoolean()
  @IsOptional()
  screenReaderAllowed?: boolean;

  @IsString()
  @IsOptional()
  customNotes?: string;
}

export class GrantExtraTimeDto {
  @IsUUID()
  studentId: string;

  @IsNumber()
  @Min(1)
  @Max(120)
  extraMinutes: number;
}

export class GradeHoldDto {
  @IsUUID()
  attemptId: string;

  @IsBoolean()
  hold: boolean;

  @IsString()
  @IsOptional()
  reason?: string;
}
