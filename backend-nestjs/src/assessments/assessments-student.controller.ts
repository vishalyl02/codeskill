import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AssessmentsService } from './assessments.service';
import { EvaluateAssessmentCodeDto } from './dto/evaluate-code.dto';
import { SubmissionRateLimitGuard } from '../common/guards/submission-rate-limit.guard';
import { SebGuard } from '../exam-security/guards/seb.guard';
import {
  SubmitAssessmentDto,
  RecordViolationDto,
  VerifyIdentityDto,
  ProctorCaptureDto,
} from './dto/submit-assessment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Student Assessments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('assessments')
export class AssessmentsStudentController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get('my-assessments')
  @ApiOperation({ summary: 'Get assigned assessments for current candidate' })
  async getMyAssessments(@CurrentUser() studentUser: any) {
    return this.assessmentsService.getStudentAssessments(studentUser);
  }

  @Get(':id/overview')
  @ApiOperation({
    summary: 'Get assessment briefing and candidate eligibility',
  })
  async getOverview(@Param('id') id: string, @CurrentUser() studentUser: any) {
    return this.assessmentsService.getStudentAssessmentOverview(
      id,
      studentUser,
    );
  }

  @Post(':id/start')
  @UseGuards(SebGuard)
  @ApiOperation({ summary: 'Begin or resume assessment attempt session' })
  @Throttle({
    short: { limit: 10, ttl: 1000 },
    medium: { limit: 50, ttl: 10000 },
    long: { limit: 120, ttl: 60000 },
  })
  async startAttempt(@Param('id') id: string, @CurrentUser() studentUser: any) {
    return this.assessmentsService.startStudentAttempt(id, studentUser);
  }

  @Post(':id/retake')
  @ApiOperation({ summary: 'Redo / Retake assessment session for practice' })
  @Throttle({
    short: { limit: 10, ttl: 1000 },
    medium: { limit: 50, ttl: 10000 },
    long: { limit: 60, ttl: 60000 },
  })
  async retakeAttempt(
    @Param('id') id: string,
    @CurrentUser() studentUser: any,
  ) {
    return this.assessmentsService.retakeStudentAttempt(id, studentUser);
  }

  @Post(':id/verify-identity')
  @ApiOperation({ summary: 'Verify candidate identity before assessment start' })
  async verifyIdentity(
    @Param('id') id: string,
    @Body() dto: VerifyIdentityDto,
    @CurrentUser() studentUser: any,
  ) {
    return this.assessmentsService.verifyIdentity(id, dto, studentUser);
  }

  @Post(':id/violations')
  @ApiOperation({ summary: 'Record timestamped proctoring violation and secure evidence' })
  @Throttle({
    short: { limit: 20, ttl: 1000 },
    medium: { limit: 120, ttl: 10000 },
    long: { limit: 300, ttl: 60000 },
  })
  async recordViolation(
    @Param('id') id: string,
    @Body() dto: RecordViolationDto,
    @CurrentUser() studentUser: any,
  ) {
    return this.assessmentsService.recordViolation(id, dto, studentUser);
  }

  @Post(':id/proctor-capture')
  @ApiOperation({ summary: 'Receive proctoring frame capture from @peepl/proctoring' })
  @Throttle({
    short: { limit: 20, ttl: 1000 },
    medium: { limit: 120, ttl: 10000 },
    long: { limit: 300, ttl: 60000 },
  })
  async recordProctorCapture(
    @Param('id') id: string,
    @Body() dto: ProctorCaptureDto,
    @CurrentUser() studentUser: any,
  ) {
    return this.assessmentsService.recordProctorCapture(id, dto, studentUser);
  }

  @Post(':id/save-progress')
  @UseGuards(SebGuard)
  @ApiOperation({ summary: 'Autosave candidate responses during test' })
  @Throttle({
    short: { limit: 20, ttl: 1000 },
    medium: { limit: 120, ttl: 10000 },
    long: { limit: 300, ttl: 60000 },
  })
  async saveProgress(
    @Param('id') id: string,
    @Body() dto: SubmitAssessmentDto,
    @CurrentUser() studentUser: any,
  ) {
    return this.assessmentsService.saveProgress(id, dto, studentUser);
  }

  @Post(':id/submit')
  @UseGuards(SebGuard)
  @ApiOperation({
    summary: 'Submit completed assessment for server evaluation',
  })
  @Throttle({
    short: { limit: 10, ttl: 1000 },
    medium: { limit: 50, ttl: 10000 },
    long: { limit: 60, ttl: 60000 },
  })
  async submitAttempt(
    @Param('id') id: string,
    @Body() dto: SubmitAssessmentDto,
    @CurrentUser() studentUser: any,
  ) {
    return this.assessmentsService.submitAttempt(id, dto, studentUser);
  }

  @Post(':id/evaluate-code')
  @UseGuards(SebGuard, SubmissionRateLimitGuard)
  @Throttle({
    short: { limit: 1, ttl: 4000 },
    medium: { limit: 6, ttl: 30000 },
    long: { limit: 12, ttl: 60000 },
  })
  async evaluateCode(
    @Param('id') id: string,
    @Body() dto: EvaluateAssessmentCodeDto,
    @CurrentUser() studentUser: any,
  ) {
    return this.assessmentsService.evaluateCode(id, dto, studentUser);
  }

  @Get(':id/result')
  @ApiOperation({ summary: 'Get candidate scorecard and performance review' })
  async getResult(@Param('id') id: string, @CurrentUser() studentUser: any) {
    return this.assessmentsService.getStudentResult(id, studentUser);
  }

  @Get(':id/resume-state')
  @ApiOperation({ summary: 'Get candidate server-persisted answers, timer, and submission status' })
  async getResumeState(@Param('id') id: string, @CurrentUser() studentUser: any) {
    return this.assessmentsService.getStudentResumeState(id, studentUser);
  }

  @Post(':id/lockdown-feedback')
  @ApiOperation({ summary: 'Submit post-assessment candidate technical and experience feedback' })
  async submitLockdownFeedback(
    @Param('id') id: string,
    @Body() dto: { rating: number; technicalIssues?: string[]; comments?: string; kioskMode?: string },
    @CurrentUser() studentUser: any,
  ) {
    return this.assessmentsService.saveLockdownFeedback(id, dto, studentUser);
  }
}
