import { IsOptional, IsIn, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export type ActivityPeriod = '7d' | '30d' | '90d' | '1y' | 'all';
export type LeaderboardType = 'overall' | 'assessments' | 'practice';

export class AnalyticsActivityQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d', '1y', 'all'])
  period?: ActivityPeriod = '7d';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class AnalyticsLeaderboardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['overall', 'assessments', 'practice'])
  type?: LeaderboardType = 'overall';
}
