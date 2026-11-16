import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Assessment } from '../database/entities/assessment.entity';
import { ExamSession } from '../database/entities/exam-session.entity';
import { ExamSecurityEvent } from '../database/entities/exam-security-event.entity';
import { CheatingRadarService } from '../audit/cheating-radar.service';
import { AlertWebhookService } from '../audit/alert-webhook.service';

@Injectable()
export class ExamSecurityService {
  constructor(
    @InjectRepository(Assessment)
    private readonly assessmentRepo: Repository<Assessment>,
    @InjectRepository(ExamSession)
    private readonly sessionRepo: Repository<ExamSession>,
    @InjectRepository(ExamSecurityEvent)
    private readonly eventRepo: Repository<ExamSecurityEvent>,
    @Optional() private readonly cheatingRadarService?: CheatingRadarService,
    @Optional() private readonly alertWebhookService?: AlertWebhookService,
  ) {}

  async initSecureSession(
    assessmentId: string,
    candidateId: string,
    clientBody: any,
    headers?: Record<string, string | string[] | undefined>,
    requestUrl?: string,
  ) {
    if (!assessmentId) throw new BadRequestException('Invalid assessment ID');

    const assessment = await this.assessmentRepo.findOne({
      where: [{ id: assessmentId }, { mongoId: assessmentId }],
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    const security = (assessment as any).securityPolicy;
    const isSecureMode = security && security.secureExamMode !== 'DISABLED';

    // Verify SEB request authenticity via genuine SEB headers and user-agent
    const sebReqHash =
      (headers?.['x-safeexambrowser-requesthash'] as string) ||
      (headers?.['x-safeexambrowser-confighash'] as string) ||
      (headers?.['x-safeexambrowser-configkeyhash'] as string);
    const userAgent = String(headers?.['user-agent'] || '');
    const isSebUserAgent = /SEB|SafeExamBrowser/i.test(userAgent);
    const hasSebHeader = Boolean(sebReqHash);

    const clientType = (hasSebHeader || isSebUserAgent) ? 'SEB' : 'BROWSER';
    const clientVersion = clientBody?.clientVersion || 'UNKNOWN';

    if (security?.requireSEB) {
      if (clientType !== 'SEB') {
        throw new ForbiddenException(
          'This assessment requires Safe Exam Browser. Please launch via SEB.',
        );
      }

      // If assessment defines an approved configKey, verify it cryptographically via headers (ISSUE-SEC-001 & ISSUE-SEC-002)
      if (security.configKey) {
        const expectedConfigKey = String(security.configKey).trim();
        if (!sebReqHash) {
          throw new ForbiddenException(
            'Safe Exam Browser configuration key mismatch. Please download the official exam configuration.',
          );
        }

        const candidateUrls = [
          requestUrl,
          headers?.['x-seb-request-url'] as string,
          headers?.referer as string,
          `/exam-security/${assessment.id}/secure-session/init`,
        ].filter(Boolean) as string[];

        const validCandidateHashes: string[] = [
          crypto.createHash('sha256').update(assessment.id + expectedConfigKey).digest('hex'),
          crypto.createHmac('sha256', expectedConfigKey).update(assessment.id).digest('hex'),
        ];

        for (const url of candidateUrls) {
          validCandidateHashes.push(
            crypto.createHash('sha256').update(url + expectedConfigKey).digest('hex'),
            crypto.createHmac('sha256', expectedConfigKey).update(url).digest('hex'),
          );
          try {
            const parsed = new URL(url, 'http://localhost');
            validCandidateHashes.push(
              crypto.createHash('sha256').update(parsed.pathname + expectedConfigKey).digest('hex'),
            );
          } catch {
            // ignore url parse error
          }
        }

        const cleanSentHash = String(sebReqHash).trim().toLowerCase();
        const hasValidHash = validCandidateHashes.some((expected) => {
          try {
            const bufA = Buffer.from(cleanSentHash, 'utf8');
            const bufB = Buffer.from(expected.toLowerCase(), 'utf8');
            return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
          } catch {
            return false;
          }
        });

        if (!hasValidHash) {
          throw new ForbiddenException(
            'Safe Exam Browser configuration key mismatch. Please download the official exam configuration.',
          );
        }
      }
    }

    if (security?.requireSEB && security.allowedSEBVersions?.length > 0) {
      if (!security.allowedSEBVersions.includes(clientVersion)) {
        throw new ForbiddenException(
          `Your Safe Exam Browser version (${clientVersion}) is not supported for this assessment. Please install an approved version.`,
        );
      }
    }

    let session = await this.sessionRepo.findOne({
      where: [
        { assessment: { id: assessment.id } as any, candidate: { id: candidateId } as any },
        { assessmentId: assessment.id, candidateId },
      ],
    });

    if (!session) {
      const expiresAt = new Date(
        Date.now() +
          (assessment.durationMinutes || 60) * 60 * 1000 +
          (security?.heartbeatGracePeriod || 60) * 1000,
      );
      session = this.sessionRepo.create({
        assessment: { id: assessment.id } as any,
        candidate: { id: candidateId } as any,
        assessmentId: assessment.id,
        candidateId,
        status: 'VERIFIED',
        secureMode: security?.secureExamMode || 'DISABLED',
        clientType,
        clientVersion,
        configKey: security?.configKey || clientBody?.configKey || null,
        expiresAt,
        startedAt: new Date(),
        lastHeartbeatAt: new Date(),
        violationCount: 0,
      });
      await this.sessionRepo.save(session);
    } else {
      if (['SUBMITTED', 'EXPIRED', 'TERMINATED'].includes(session.status)) {
        throw new ForbiddenException('Exam session has already ended.');
      }
      session.lastHeartbeatAt = new Date();
      await this.sessionRepo.save(session);
    }

    const sessionSecret = process.env.JWT_SECRET || 'codeskill-secure-exam-token-secret';
    const token = crypto
      .createHmac('sha256', sessionSecret)
      .update(`${session.id}:${candidateId}:${session.expiresAt.getTime()}:${clientType}`)
      .digest('hex');

    return {
      success: true,
      sessionId: session.id,
      expiresAt: session.expiresAt,
      status: session.status,
      secureMode: session.secureMode,
      token,
    };
  }

  async processHeartbeat(sessionId: string, candidateId: string) {
    const session = await this.sessionRepo.findOne({
      where: [{ id: sessionId }, { mongoId: sessionId }],
    });
    if (!session || (session.candidateId !== candidateId && (session as any).candidate?.id !== candidateId)) {
      throw new ForbiddenException('Invalid session');
    }

    if (['SUBMITTED', 'EXPIRED', 'TERMINATED'].includes(session.status)) {
      throw new ForbiddenException('Session ended');
    }

    session.lastHeartbeatAt = new Date();
    if (session.status === 'SUSPENDED') {
      session.status = 'ACTIVE';
    }

    await this.sessionRepo.save(session);
    return { success: true, status: session.status };
  }

  async reportViolation(
    sessionId: string,
    candidateId: string,
    eventType: string,
    metadata: any,
  ) {
    const session = await this.sessionRepo.findOne({
      where: [{ id: sessionId }, { mongoId: sessionId }],
    });
    if (!session || (session.candidateId !== candidateId && (session as any).candidate?.id !== candidateId)) {
      throw new ForbiddenException('Invalid session');
    }

    const assessment = await this.assessmentRepo.findOne({
      where: [{ id: session.assessmentId }, { mongoId: session.assessmentId }],
    });

    const severity = ['TAB_HIDDEN', 'FULLSCREEN_EXIT', 'COPY_ATTEMPT'].includes(
      eventType,
    )
      ? 'WARNING'
      : 'CRITICAL';

    const event = this.eventRepo.create({
      session: { id: session.id } as any,
      candidate: { id: candidateId } as any,
      assessment: { id: session.assessmentId } as any,
      sessionId: session.id,
      candidateId,
      assessmentId: session.assessmentId,
      eventType,
      severity,
      metadata,
    });
    await this.eventRepo.save(event);

    session.violationCount = (session.violationCount || 0) + 1;
    const threshold = (assessment as any)?.securityPolicy?.violationThreshold || 3;

    if (session.violationCount >= threshold) {
      session.status = 'SUSPENDED';
      session.securityState = 'VIOLATED';
    }

    await this.sessionRepo.save(session);

    // Evaluate Cheating Radar for violation bursts
    void this.cheatingRadarService?.recordProctoringViolation({
      studentId: candidateId,
      assessmentId: session.assessmentId,
      eventType,
    });

    if (session.status === 'SUSPENDED') {
      void this.alertWebhookService?.sendAlert({
        action: 'ASSESSMENT_SESSION_SUSPENDED',
        severity: 'CRITICAL',
        riskWeight: 4,
        target: `Assessment ${session.assessmentId}`,
        targetType: 'Assessment',
        details: {
          candidateId,
          sessionId: session.id,
          violations: session.violationCount,
          lastEventType: eventType,
        },
      });
    }

    return {
      success: true,
      status: session.status,
      violations: session.violationCount,
    };
  }
}
