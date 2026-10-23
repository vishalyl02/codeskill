import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubmissionsService } from './submissions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubmissionRateLimitGuard } from '../common/guards/submission-rate-limit.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ADMIN_ROLES } from '../common/guards/admin.guard';

@ApiTags('Submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post()
  @UseGuards(SubmissionRateLimitGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Create a new code submission and queue for isolated execution',
  })
  async createSubmission(
    @CurrentUser('id') userId: string,
    @Body() data: any,
  ) {
    const submission = await this.submissionsService.createSubmission(
      userId,
      data,
    );
    return {
      success: true,
      submissionId: submission._id,
      status: submission.status,
      message: 'Submission successfully queued for execution',
      submission,
    };
  }

  @Get('progress')
  @ApiOperation({ summary: 'Get personal solved/attempted status for visible problems' })
  async getProblemProgress(
    @CurrentUser('id') userId: string,
    @Query('problemIds') problemIds?: string,
  ) {
    return this.submissionsService.getProblemProgress(userId, problemIds);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get recent submissions' })
  async getRecentSubmissions(@CurrentUser('id') userId: string) {
    const submissions =
      await this.submissionsService.getRecentSubmissions(userId);
    return { count: submissions.length, data: submissions };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get user statistics' })
  async getUserStats(@CurrentUser('id') userId: string) {
    return this.submissionsService.getUserStats(userId);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: "Get a specific user's submissions history" })
  async getSubmissionsByUser(
    @CurrentUser('id') currentUserId: string,
    @CurrentUser('role') role: string,
    @Param('userId') targetUserId: string,
    @Query()
    query: {
      page?: number;
      limit?: number;
      problemId?: string;
      status?: string;
    },
  ) {
    const isAdmin = ADMIN_ROLES.includes(role);
    const effectiveUserId = isAdmin ? targetUserId : currentUserId;
    return this.submissionsService.getSubmissionsByUser(effectiveUserId, query);
  }

  @Get('problem/:problemId')
  @ApiOperation({ summary: 'Get submissions for a specific problem' })
  async getSubmissionsByProblem(
    @CurrentUser('id') userId: string,
    @Param('problemId') problemId: string,
  ) {
    const submissions = await this.submissionsService.getSubmissionsByProblem(
      userId,
      problemId,
    );
    return { count: submissions.length, data: submissions };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get submission details by ID' })
  async getSubmission(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
  ) {
    const isAdmin = ADMIN_ROLES.includes(role);
    const submission = await this.submissionsService.getSubmissionById(
      userId,
      id,
      isAdmin,
    );
    return { success: true, submission };
  }

  @Get(':id/result')
  @ApiOperation({ summary: 'Get submission result and status' })
  async getSubmissionResult(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
  ) {
    const isAdmin = ADMIN_ROLES.includes(role);
    const result = await this.submissionsService.getSubmissionResult(
      userId,
      id,
      isAdmin,
    );
    return { success: true, ...result };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a queued submission' })
  async cancelSubmission(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Param('id') id: string,
  ) {
    const isAdmin = ADMIN_ROLES.includes(role);
    return this.submissionsService.cancelSubmission(userId, id, isAdmin);
  }
  @Get('problem/:problemId/stats')
  @ApiOperation({ summary: 'Get live submission statistics for a problem' })
  async getProblemStats(@Param('problemId') problemId: string) {
    return this.submissionsService.getProblemStats(problemId);
  }
}
