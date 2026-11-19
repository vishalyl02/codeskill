import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ExamSecurityService } from './exam-security.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('exam-security')
@UseGuards(JwtAuthGuard)
export class ExamSecurityController {
  constructor(private readonly examSecurityService: ExamSecurityService) {}

  @Post(':assessmentId/secure-session/init')
  @HttpCode(200)
  async initSession(
    @Param('assessmentId') assessmentId: string,
    @CurrentUser('id') userId: string,
    @Body() body: any,
    @Headers() headers: Record<string, string | undefined>,
    @Req() req?: any,
  ) {
    const fullUrl = req
      ? `${req.protocol || 'https'}://${req.get?.('host') || headers?.host || 'localhost'}${req.originalUrl || req.url || ''}`
      : undefined;
    return this.examSecurityService.initSecureSession(
      assessmentId,
      userId,
      body,
      headers,
      fullUrl,
    );
  }

  @Post('attest-client')
  @HttpCode(200)
  async attestClient(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      publicKeyPem: string;
      clientVersion: string;
      os: string;
      preflightPassed: boolean;
      violations?: string[];
      assessmentId?: string;
      attestationTier?: string;
      kioskMode?: string;
      clientBinaryHash?: string;
    },
    @Req() req?: any,
  ) {
    const ip =
      req?.ip ||
      req?.headers?.['x-forwarded-for'] ||
      req?.socket?.remoteAddress;
    return this.examSecurityService.attestClient(userId, body, ip);
  }

  @Post('violations')
  @HttpCode(200)
  async reportViolations(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      assessmentId?: string;
      sessionId?: string;
      eventType?: string;
      violation_type?: string;
      message?: string;
      metadata?: any;
    },
  ) {
    const eventType = body.eventType || body.violation_type || 'ENVIRONMENT_VIOLATION';
    const metadata = {
      message: body.message,
      ...(body.metadata || {}),
    };
    if (body.sessionId) {
      return this.examSecurityService.reportViolation(
        body.sessionId,
        userId,
        eventType,
        metadata,
      );
    }
    return this.examSecurityService.reportDirectViolation(
      userId,
      body.assessmentId,
      eventType,
      metadata,
    );
  }

  @Post('telemetry-batch')
  @HttpCode(202)
  async ingestTelemetryBatch(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      assessmentId?: string;
      sessionId?: string;
      events: Array<{
        eventType: string;
        severity?: string;
        metadata?: any;
        timestamp?: number;
      }>;
      pacingMetrics?: any;
    },
  ) {
    return this.examSecurityService.enqueueTelemetryBatch(userId, body);
  }

  @Post('session/:sessionId/heartbeat')
  @HttpCode(200)
  async heartbeat(
    @Param('sessionId') sessionId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.examSecurityService.processHeartbeat(sessionId, userId);
  }

  @Post('session/:sessionId/violation')
  @HttpCode(200)
  async reportViolation(
    @Param('sessionId') sessionId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { eventType: string; metadata?: any },
  ) {
    return this.examSecurityService.reportViolation(
      sessionId,
      userId,
      body.eventType,
      body.metadata || {},
    );
  }

  @Post('verify-quit-password')
  @HttpCode(200)
  async verifyQuitPassword(
    @CurrentUser('id') userId: string,
    @Body() body: { assessmentId: string; password?: string },
  ) {
    return this.examSecurityService.verifyQuitPassword(
      body.assessmentId,
      userId,
      body.password,
    );
  }

  @Post('proctor-force-quit')
  @HttpCode(200)
  async proctorForceQuit(
    @Body()
    body: {
      assessmentId: string;
      candidateId: string;
      reason?: string;
    },
  ) {
    return this.examSecurityService.proctorForceQuit(
      body.assessmentId,
      body.candidateId,
      body.reason,
    );
  }
}

