import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { ActivityLogService } from '../../audit/activity-log.service';
import {
  GetActivityQueryDto,
  GetActivityCountQueryDto,
} from '../dto/get-activity-query.dto';

@ApiTags('Admin - Activity Monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/activity')
export class AdminActivityController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  @ApiOperation({
    summary: 'Get keyset-paginated activity logs with multi-dimensional filters',
  })
  async getActivityLogs(@Query() query: GetActivityQueryDto) {
    const result = await this.activityLogService.getPaginatedLogs({
      cursor: query.cursor,
      limit: query.limit ? parseInt(query.limit, 10) : 25,
      search: query.search,
      category: query.category,
      role: query.role,
      severity: query.severity,
      action: query.action,
      actorId: query.actorId,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    return {
      success: true,
      data: result,
    };
  }

  @Get('count')
  @ApiOperation({
    summary: 'Get count of new events since a given timestamp for live badge polling',
  })
  async getNewEventsCount(@Query() query: GetActivityCountQueryDto) {
    const count = await this.activityLogService.getCountSince(query.since, {
      search: query.search,
      category: query.category,
      role: query.role,
      severity: query.severity,
      action: query.action,
      actorId: query.actorId,
    });

    return {
      success: true,
      count,
    };
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get overall activity KPI statistics for the executive dashboard',
  })
  async getActivityStats() {
    const stats = await this.activityLogService.getActivityStats();
    return {
      success: true,
      stats,
    };
  }

  @Get('radar')
  @ApiOperation({
    summary: 'Get active Cheating Radar alerts and anomalies',
  })
  async getRadarAlerts(@Query('limit') limit?: string) {
    const result = await this.activityLogService.getPaginatedLogs({
      category: 'security',
      limit: limit ? parseInt(limit, 10) : 30,
    });
    const radarAlerts = result.items.filter((item) =>
      item.action.startsWith('CHEATING_RADAR_') || item.riskWeight >= 4,
    );
    return {
      success: true,
      alerts: radarAlerts,
    };
  }

  @Get('export')
  @ApiOperation({
    summary: 'Stream activity logs as CSV with chunked streaming',
  })
  async exportActivityCsv(
    @Query() query: GetActivityQueryDto,
    @Res() res: Response,
  ) {
    await this.activityLogService.streamCsvExport(
      {
        search: query.search,
        category: query.category,
        role: query.role,
        severity: query.severity,
        action: query.action,
        actorId: query.actorId,
        startDate: query.startDate,
        endDate: query.endDate,
        limit: query.limit ? parseInt(query.limit, 10) : 20000,
      },
      res,
    );
  }
}
