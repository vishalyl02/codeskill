import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminService } from '../admin.service';

@ApiTags('Admin - Contests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/contests')
export class AdminContestsController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @ApiOperation({ summary: 'List all contests' })
  async getContests(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search: string,
  ) {
    return this.adminService.getContests(
      parseInt(page, 10) || 1,
      parseInt(limit, 10) || 20,
      search,
    );
  }

  @Get(':id/results/export')
  @ApiOperation({ summary: 'Export contest results as CSV' })
  async exportResults(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: any,
  ) {
    const csv = await this.adminService.exportContestResultsCsv(id);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="contest-${id}-results.csv"`,
    });
    return csv;
  }

  @Get(':id/results')
  @ApiOperation({ summary: 'Get contest results, scores, violations and reattempts' })
  async getContestResults(
    @Param('id') id: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('minScore') minScore?: string,
    @Query('maxScore') maxScore?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getContestResults(id, {
      search,
      status,
      minScore,
      maxScore,
      page,
      limit,
    });
  }

  @Post(':id/publish-results')
  @ApiOperation({ summary: 'Publish or unpublish contest results for students' })
  async publishResults(
    @Param('id') id: string,
    @Body('publish') publish?: boolean,
  ) {
    return this.adminService.toggleContestResultsPublish(id, publish);
  }

  @Post(':id/reattempts')
  @ApiOperation({ summary: 'Grant reattempts to one or more students' })
  async grantReattempts(
    @Param('id') id: string,
    @CurrentUser() adminUser: any,
    @Body()
    body: {
      studentIds: string[];
      reason?: string;
      allowedAttempts?: number;
      expiresAt?: string;
    },
  ) {
    return this.adminService.grantContestReattempts(id, adminUser, body);
  }

  @Post(':id/reattempts/revoke')
  @ApiOperation({ summary: 'Revoke active reattempt grant' })
  async revokeReattempt(
    @Param('id') id: string,
    @Body('targetId') targetId: string,
  ) {
    return this.adminService.revokeContestReattempt(id, targetId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a contest by ID' })
  async getContest(@Param('id') id: string) {
    return this.adminService.getContestById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new contest' })
  async createContest(@Body() body: any) {
    return this.adminService.createContest(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a contest' })
  async updateContest(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateContest(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a contest' })
  async deleteContest(@Param('id') id: string) {
    return this.adminService.deleteContest(id);
  }
}

