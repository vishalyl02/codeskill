import { IsNumber, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewAttemptDto {
  @ApiPropertyOptional({ description: 'Manual score adjustment (can be positive or negative)', example: 5 })
  @IsOptional()
  @IsNumber()
  manualScoreAdjustment?: number;

  @ApiPropertyOptional({ description: 'Feedback or remarks for the candidate from the instructor', example: 'Good logic in problem 2, partial credit awarded.' })
  @IsOptional()
  @IsString()
  instructorFeedback?: string;

  @ApiPropertyOptional({ description: 'Flag to clear or forgive proctoring radar alerts', example: true })
  @IsOptional()
  @IsBoolean()
  clearRadarFlags?: boolean;
}
