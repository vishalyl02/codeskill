import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { LockdownCommandCenterService } from './lockdown-command-center.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TeacherGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('exam-security/assessments/:assessmentId')
@UseGuards(JwtAuthGuard, TeacherGuard)
export class LockdownCommandCenterController {
  constructor(
    private readonly commandCenterService: LockdownCommandCenterService,
  ) {}

  @Get('command-center')
  async getCommandCenter(@Param('assessmentId') assessmentId: string) {
    return this.commandCenterService.getCommandCenter(assessmentId);
  }

  @Get('candidates/:candidateId/forensic-timeline')
  async getCandidateForensicTimeline(
    @Param('assessmentId') assessmentId: string,
    @Param('candidateId') candidateId: string,
  ) {
    return this.commandCenterService.getCandidateForensicTimeline(
      assessmentId,
      candidateId,
    );
  }

  @Post('candidates/:candidateId/unlock')
  @HttpCode(200)
  async unlockCandidate(
    @Param('assessmentId') assessmentId: string,
    @Param('candidateId') candidateId: string,
    @CurrentUser('id') adminUserId: string,
    @Body() body: { reason?: string },
  ) {
    return this.commandCenterService.unlockCandidate(
      assessmentId,
      candidateId,
      adminUserId,
      body?.reason,
    );
  }

  @Post('candidates/:candidateId/reopen-submission')
  @HttpCode(200)
  async reopenSubmission(
    @Param('assessmentId') assessmentId: string,
    @Param('candidateId') candidateId: string,
    @CurrentUser('id') adminUserId: string,
    @Body() body: { reason?: string },
  ) {
    return this.commandCenterService.reopenSubmission(
      assessmentId,
      candidateId,
      adminUserId,
      body?.reason,
    );
  }

  @Post('candidates/:candidateId/extend-time')
  @HttpCode(200)
  async extendTime(
    @Param('assessmentId') assessmentId: string,
    @Param('candidateId') candidateId: string,
    @CurrentUser('id') adminUserId: string,
    @Body() body: { extraMinutes: number; reason?: string },
  ) {
    return this.commandCenterService.extendTime(
      assessmentId,
      candidateId,
      body.extraMinutes,
      adminUserId,
      body?.reason,
    );
  }

  @Post('candidates/:candidateId/preflight-waiver')
  @HttpCode(200)
  async grantPreflightWaiver(
    @Param('assessmentId') assessmentId: string,
    @Param('candidateId') candidateId: string,
    @CurrentUser('id') adminUserId: string,
    @Body() body: { waiverType: string; reason: string },
  ) {
    return this.commandCenterService.grantPreflightWaiver(
      assessmentId,
      candidateId,
      body.waiverType,
      adminUserId,
      body.reason,
    );
  }

  @Post('candidates/:candidateId/proctor-message')
  @HttpCode(200)
  async sendProctorMessage(
    @Param('assessmentId') assessmentId: string,
    @Param('candidateId') candidateId: string,
    @CurrentUser('id') adminUserId: string,
    @Body()
    body: {
      message?: string;
      action?: 'BANNER' | 'FORCE_SUBMIT' | 'FORCE_QUIT';
      reason?: string;
    },
  ) {
    return this.commandCenterService.sendProctorMessage(
      assessmentId,
      candidateId,
      body,
      adminUserId,
    );
  }

  @Post('rotate-quit-pin')
  @HttpCode(200)
  async rotateQuitPin(
    @Param('assessmentId') assessmentId: string,
    @CurrentUser('id') adminUserId: string,
    @Body() body: { reason?: string },
  ) {
    return this.commandCenterService.rotateQuitPin(
      assessmentId,
      adminUserId,
      body?.reason,
    );
  }

  @Post('run-plagiarism-scan')
  @HttpCode(200)
  async runPlagiarismScan(
    @Param('assessmentId') assessmentId: string,
    @CurrentUser('id') adminUserId: string,
  ) {
    return this.commandCenterService.runPlagiarismScan(
      assessmentId,
      adminUserId,
    );
  }

  @Get('candidates/:candidateId/integrity-digest')
  async getCandidateIntegrityDigest(
    @Param('assessmentId') assessmentId: string,
    @Param('candidateId') candidateId: string,
  ) {
    return this.commandCenterService.getCandidateIntegrityDigest(
      assessmentId,
      candidateId,
    );
  }

  @Post('candidates/:candidateId/integrity-decision')
  @HttpCode(200)
  async setCandidateIntegrityDecision(
    @Param('assessmentId') assessmentId: string,
    @Param('candidateId') candidateId: string,
    @CurrentUser('id') adminUserId: string,
    @Body() body: { decision: 'HOLD_GRADE' | 'CLEAR_HOLD'; reason?: string },
  ) {
    return this.commandCenterService.setCandidateIntegrityDecision(
      assessmentId,
      candidateId,
      body.decision,
      body.reason,
      adminUserId,
    );
  }

  @Get('question-friction-analytics')
  async getQuestionFrictionAnalytics(
    @Param('assessmentId') assessmentId: string,
  ) {
    return this.commandCenterService.getQuestionFrictionAnalytics(
      assessmentId,
    );
  }
}
