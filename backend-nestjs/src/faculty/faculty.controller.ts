import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FacultyService } from './faculty.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TeacherGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReviewAttemptDto } from './dto/review-attempt.dto';

@ApiTags('Faculty Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TeacherGuard)
@Controller('faculty')
export class FacultyController {
  constructor(private readonly facultyService: FacultyService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get scoped faculty KPIs and recent activities' })
  async getDashboard(@CurrentUser() user: any) {
    return this.facultyService.getDashboardStats(user);
  }

  @Get('assessments')
  @ApiOperation({
    summary: 'Get all assessments authored by the logged-in faculty with statistics',
  })
  async getMyAssessments(@CurrentUser() user: any) {
    return this.facultyService.getMyAssessments(user);
  }

  @Get('batches')
  @ApiOperation({
    summary: 'Get all cohorts/batches assigned to the logged-in faculty',
  })
  async getAssignedBatches(@CurrentUser() user: any) {
    return this.facultyService.getAssignedBatches(user);
  }

  @Get('students')
  @ApiOperation({
    summary: 'Get all students enrolled in cohorts assigned to the logged-in faculty',
  })
  async getAssignedStudents(
    @Query('batchId') batchId: string,
    @Query('search') search: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: any,
  ) {
    return this.facultyService.getAssignedStudents(user, {
      batchId,
      search,
      page,
      limit,
    });
  }

  @Get('assessments/:id/attempts/:attemptId/snapshots')
  @ApiOperation({
    summary:
      'Get presigned S3 URLs for candidate proctoring snapshots on owned assessment',
  })
  async getAttemptSnapshots(
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @CurrentUser() user: any,
  ) {
    return this.facultyService.getAttemptSnapshots(id, attemptId, user);
  }

  @Patch('assessments/:id/attempts/:attemptId/review')
  @ApiOperation({
    summary:
      'Record instructor manual score adjustment, feedback, or clear radar flags',
  })
  async reviewAttempt(
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @Body() dto: ReviewAttemptDto,
    @CurrentUser() user: any,
  ) {
    return this.facultyService.reviewAttempt(id, attemptId, dto, user);
  }
}
