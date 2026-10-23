import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import {
  AnalyticsActivityQueryDto,
  AnalyticsLeaderboardQueryDto,
} from './dto/analytics-query.dto';

@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, AdminGuard)
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  async getOverview() {
    return this.analyticsService.getPlatformOverview();
  }

  @Get('activity')
  async getActivity(@Query() query: AnalyticsActivityQueryDto) {
    return this.analyticsService.getActivity(query);
  }

  @Get('languages')
  async getLanguages() {
    return this.analyticsService.getLanguages();
  }

  @Get('leaderboard')
  async getLeaderboard(@Query() query: AnalyticsLeaderboardQueryDto) {
    return this.analyticsService.getLeaderboard(query);
  }

  @Get('assessments')
  async getAssessments() {
    return this.analyticsService.getAssessmentsOverview();
  }

  @Get('retention')
  async getRetention() {
    return this.analyticsService.getRetention();
  }

  // Assessment-specific existing analytics
  @Get('assessment/:id/overview')
  async getAssessmentOverview(@Param('id') id: string) {
    return this.analyticsService.getAssessmentOverview(id);
  }

  @Get('assessment/:id/leaderboard')
  async getAssessmentLeaderboard(
    @Param('id') id: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    return this.analyticsService.getAssessmentLeaderboard(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('assessment/:id/questions')
  async getQuestionAnalytics(@Param('id') id: string) {
    return this.analyticsService.getQuestionAnalytics(id);
  }
}
