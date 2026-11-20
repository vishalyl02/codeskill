import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Optional,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Assessment } from '../database/entities/assessment.entity';
import { ExamSession } from '../database/entities/exam-session.entity';
import { ExamSecurityEvent } from '../database/entities/exam-security-event.entity';
import { CheatingRadarService } from '../audit/cheating-radar.service';
import { AlertWebhookService } from '../audit/alert-webhook.service';
import { RedisService } from '../redis/redis.service';
import { OperationalHealthService } from './operational-health.service';

function compareVersions(v1: string, v2: string): number {
  const p1 = (v1 || '').replace(/^[^0-9]*/, '').split('.').map((x) => parseInt(x, 10) || 0);
  const p2 = (v2 || '').replace(/^[^0-9]*/, '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length, 3); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

@Injectable()
export class ExamSecurityService implements OnModuleInit, OnModuleDestroy {
  private flushTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Assessment)
    private readonly assessmentRepo: Repository<Assessment>,
    @InjectRepository(ExamSession)
    private readonly sessionRepo: Repository<ExamSession>,
    @InjectRepository(ExamSecurityEvent)
    private readonly eventRepo: Repository<ExamSecurityEvent>,
    @Optional() private readonly cheatingRadarService?: CheatingRadarService,
    @Optional() private readonly alertWebhookService?: AlertWebhookService,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly operationalHealthService?: OperationalHealthService,
  ) {}

  onModuleInit() {
    this.flushTimer = setInterval(async () => {
      try {
        await this.flushTelemetryBuffer(200);
      } catch {
        // non-blocking
      }
    }, 5000);
    if (this.flushTimer?.unref) {
      this.flushTimer.unref();
    }
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

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

    // Verify request authenticity via headers and user-agent
    const sebReqHash =
      (headers?.['x-safeexambrowser-requesthash'] as string) ||
      (headers?.['x-safeexambrowser-confighash'] as string) ||
      (headers?.['x-safeexambrowser-configkeyhash'] as string);
    const userAgent = String(headers?.['user-agent'] || '');
    const isSebUserAgent = /SEB|SafeExamBrowser/i.test(userAgent);
    const hasSebHeader = Boolean(sebReqHash);

    const clientType = (hasSebHeader || isSebUserAgent) ? 'SEB' : 'BROWSER';
    const clientVersion = clientBody?.clientVersion || 'UNKNOWN';

    if (security?.requireSEB || security?.requireLockdown) {
      if (clientType !== 'SEB' && !headers?.['x-codeskill-session-id'] && !headers?.['x-lockdown-session-id']) {
        throw new ForbiddenException(
          'This assessment requires CodeSkill LockDown. Please launch via the official CodeSkill LockDown desktop application.',
        );
      }

      // If assessment defines an approved configKey, verify it cryptographically via headers (ISSUE-SEC-001 & ISSUE-SEC-002)
      if (security.configKey) {
        const expectedConfigKey = String(security.configKey).trim();
        if (!sebReqHash) {
          throw new ForbiddenException(
            'CodeSkill LockDown configuration key mismatch. Please ensure you are running the official CodeSkill LockDown application.',
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
            'CodeSkill LockDown configuration key mismatch. Please ensure you are running the official CodeSkill LockDown application.',
          );
        }
      }
    }

    if ((security?.requireSEB || security?.requireLockdown) && security.allowedSEBVersions?.length > 0) {
      if (!security.allowedSEBVersions.includes(clientVersion)) {
        throw new ForbiddenException(
          `Your CodeSkill LockDown version (${clientVersion}) is not supported for this assessment. Please install an approved version.`,
        );
      }
    }

    if (this.redisService) {
      const activeDeviceKey = `exam:active-device:${assessment.id}:${candidateId}`;
      const existingDevice = await this.redisService.get<{
        deviceFingerprint: string;
        attestationToken?: string;
        boundAt: string;
      }>(activeDeviceKey);

      const rawUserAgent = headers?.['user-agent'];
      const userAgentStr = Array.isArray(rawUserAgent) ? rawUserAgent.join(' ') : rawUserAgent;
      const incomingFingerprint =
        clientBody?.deviceFingerprint ||
        headers?.['x-device-fingerprint'] ||
        (userAgentStr ? crypto.createHash('md5').update(userAgentStr).digest('hex') : null);

      if (existingDevice && incomingFingerprint && existingDevice.deviceFingerprint && existingDevice.deviceFingerprint !== incomingFingerprint) {
        throw new ForbiddenException({
          code: 'CONCURRENT_SESSION_DETECTED',
          message: 'Concurrent session detected. This assessment attempt is already active on another device or browser.',
        });
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

    // Check remote proctor force-quit signal in Redis
    if (this.redisService) {
      const forceQuitReason = await this.redisService.get<string>(
        `exam:force-quit:${session.assessmentId}:${candidateId}`,
      );
      if (forceQuitReason) {
        session.status = 'TERMINATED';
        session.securityState = 'VIOLATED';
        await this.sessionRepo.save(session);
        return {
          success: true,
          status: 'TERMINATED',
          forceQuitReason,
        };
      }
    }

    session.lastHeartbeatAt = new Date();
    if (session.status === 'SUSPENDED') {
      session.status = 'ACTIVE';
    }

    await this.sessionRepo.save(session);
    const serverEndsAtEpochMs = session.expiresAt
      ? new Date(session.expiresAt).getTime()
      : undefined;
    return {
      success: true,
      status: session.status,
      serverEndsAtEpochMs,
      serverNowMs: Date.now(),
    };
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

    const severity = eventType === 'CANDIDATE_POST_EXAM_FEEDBACK'
      ? 'INFO'
      : ['TAB_HIDDEN', 'FULLSCREEN_EXIT', 'COPY_ATTEMPT', 'CAMERA_OR_MIC_RESTORED'].includes(eventType)
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

    if (eventType !== 'CAMERA_OR_MIC_RESTORED' && eventType !== 'CANDIDATE_POST_EXAM_FEEDBACK') {
      session.violationCount = (session.violationCount || 0) + 1;
      const threshold = (assessment as any)?.securityPolicy?.violationThreshold || 3;

      if (session.violationCount >= threshold) {
        session.status = 'SUSPENDED';
        session.securityState = 'VIOLATED';
      }

      await this.sessionRepo.save(session);
    }

    // Evaluate Cheating Radar for violation bursts
    void this.cheatingRadarService?.recordProctoringViolation({
      studentId: candidateId,
      assessmentId: session.assessmentId,
      eventType,
    });

    if (eventType === 'CAMERA_OR_MIC_RESTORED' || eventType === 'CAMERA_OR_MIC_DISCONNECTED') {
      void this.cheatingRadarService?.recordMediaDisconnectOutage({
        studentId: candidateId,
        assessmentId: session.assessmentId,
        deviceKind: metadata?.deviceKind || 'camera_or_mic',
        outageDurationMs: metadata?.outageDurationMs,
        reason: metadata?.reason,
      });
    }

    if (['HID_MACRO_INJECTION_SUSPECTED', 'WATERMARK_TAMPER_ATTEMPT', 'RUNTIME_TAMPER_DETECTED', 'INVALID_REQUEST_SIGNATURE'].includes(eventType)) {
      void this.cheatingRadarService?.recordSecurityViolationAnomaly({
        studentId: candidateId,
        assessmentId: session.assessmentId,
        eventType,
        metadata,
      });
    }

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

  async reportDirectViolation(
    candidateId: string,
    assessmentId?: string,
    eventType: string = 'ENVIRONMENT_VIOLATION',
    metadata: any = {},
  ) {
    let session: ExamSession | null = null;
    let resolvedAssessmentId = assessmentId;
    if (assessmentId) {
      try {
        const assessment = await this.assessmentRepo.findOne({
          where: [{ id: assessmentId }, { mongoId: assessmentId }],
        });
        if (assessment) {
          resolvedAssessmentId = assessment.id;
          session = await this.sessionRepo.findOne({
            where: [
              { assessment: { id: assessment.id } as any, candidate: { id: candidateId } as any },
              { assessmentId: assessment.id, candidateId },
            ],
            order: { createdAt: 'DESC' },
          });
        }
      } catch {
        // Safe fallback if assessment query fails
      }
    }
    if (!session) {
      session = await this.sessionRepo.findOne({
        where: [
          { candidate: { id: candidateId } as any },
          { candidateId },
        ],
        order: { createdAt: 'DESC' },
      });
    }

    if (session) {
      return this.reportViolation(session.id, candidateId, eventType, metadata);
    }

    const validUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const nilUuid = '00000000-0000-0000-0000-000000000000';

    const safeAssessmentId =
      resolvedAssessmentId && validUuidRegex.test(resolvedAssessmentId)
        ? resolvedAssessmentId
        : nilUuid;
    const safeSessionId = nilUuid;

    try {
      const severity = eventType === 'CANDIDATE_POST_EXAM_FEEDBACK'
        ? 'INFO'
        : ['TAB_HIDDEN', 'FULLSCREEN_EXIT', 'COPY_ATTEMPT', 'CAMERA_OR_MIC_RESTORED'].includes(eventType)
          ? 'WARNING'
          : 'CRITICAL';

      const event = this.eventRepo.create({
        candidate: { id: candidateId } as any,
        candidateId,
        assessmentId: safeAssessmentId,
        sessionId: safeSessionId,
        eventType,
        severity,
        metadata,
      });
      await this.eventRepo.save(event);

      if (eventType === 'CAMERA_OR_MIC_RESTORED' || eventType === 'CAMERA_OR_MIC_DISCONNECTED') {
        void this.cheatingRadarService?.recordMediaDisconnectOutage({
          studentId: candidateId,
          assessmentId: safeAssessmentId,
          deviceKind: metadata?.deviceKind || 'camera_or_mic',
          outageDurationMs: metadata?.outageDurationMs,
          reason: metadata?.reason,
        });
      }

      if (['HID_MACRO_INJECTION_SUSPECTED', 'WATERMARK_TAMPER_ATTEMPT', 'RUNTIME_TAMPER_DETECTED', 'INVALID_REQUEST_SIGNATURE'].includes(eventType)) {
        void this.cheatingRadarService?.recordSecurityViolationAnomaly({
          studentId: candidateId,
          assessmentId: safeAssessmentId,
          eventType,
          metadata,
        });
      }

      return {
        success: true,
        status: 'LOGGED',
        violations: 1,
      };
    } catch {
      // Safe fallback if foreign key constraint on session_id or assessment_id is enforced in DB
      return {
        success: true,
        status: 'LOGGED',
        violations: 1,
      };
    }
  }

  async attestClient(
    userId: string,
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
      sessionHmacKey?: string;
    },
    ip?: string,
  ) {
    try {
      const res = await this.performAttestClient(userId, body, ip);
      void this.operationalHealthService?.recordAttestation(true);
      return res;
    } catch (err) {
      void this.operationalHealthService?.recordAttestation(false);
      throw err;
    }
  }

  private async performAttestClient(
    userId: string,
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
      sessionHmacKey?: string;
    },
    ip?: string,
  ) {
    if (!body?.publicKeyPem || typeof body.publicKeyPem !== 'string') {
      throw new BadRequestException('Invalid or missing publicKeyPem');
    }

    let vdiOverride = false;

    if (!body.preflightPassed) {
      const rawViolations = Array.isArray(body.violations) ? body.violations : [];
      const isVmViolation = (v: string) =>
        v === 'VIRTUAL_MACHINE_DETECTED' ||
        v.toLowerCase().includes('virtual machine') ||
        v.toLowerCase().includes('hypervisor');

      const onlyVmDetected =
        rawViolations.length > 0 &&
        rawViolations.every(isVmViolation);

      if (onlyVmDetected && body.assessmentId) {
        try {
          const assessment = await this.assessmentRepo.findOne({
            where: [{ id: body.assessmentId }, { mongoId: body.assessmentId }],
          });
          if (assessment?.allowVirtualMachine) {
            vdiOverride = true;
          }
        } catch {
          // Safe fallback if schema sync is disabled and allowVirtualMachine column is missing
          try {
            const raw = await this.assessmentRepo.query(
              `SELECT "allowVirtualMachine" FROM "assessments" WHERE id::text = $1 OR "mongoId" = $1 LIMIT 1`,
              [body.assessmentId],
            );
            if (raw && raw[0] && raw[0].allowVirtualMachine) {
              vdiOverride = true;
            }
          } catch {
            // Column does not exist in DB yet; safe fallback defaults allowVirtualMachine to false
            vdiOverride = false;
          }
        }
      }

      if (!vdiOverride) {
        const reasons = rawViolations.length
          ? rawViolations.join('; ')
          : 'Environment check failed';
        throw new ForbiddenException(`Preflight security checks failed: ${reasons}`);
      }
    }

    let minVersion = process.env.LOCKDOWN_MIN_VERSION || '1.0.0';
    if (body.assessmentId) {
      try {
        const assessment = await this.assessmentRepo.findOne({
          where: [{ id: body.assessmentId }, { mongoId: body.assessmentId }],
        });
        if ((assessment as any)?.minLockdownVersion) {
          minVersion = (assessment as any).minLockdownVersion;
        }
      } catch {
        // safe fallback
      }
    }

    if (!body.clientVersion || compareVersions(body.clientVersion, minVersion) < 0) {
      throw new ForbiddenException({
        code: 'CLIENT_UPDATE_REQUIRED',
        minVersion,
        message: `LockDown client version (${body.clientVersion || 'unknown'}) is below minimum required version (${minVersion}). Please update your application.`,
      });
    }

    const attestedSessionId = crypto.randomUUID();
    const serverTime = Date.now();
    const attestationTier = body.attestationTier || 'software_binary_bound';
    const kioskMode = body.kioskMode || 'standard';
    const clientBinaryHash = body.clientBinaryHash || 'unknown';
    const sessionHmacKey =
      body.sessionHmacKey ||
      (body as any).session_hmac_key ||
      crypto.randomBytes(32).toString('hex');

    if (this.redisService && body.assessmentId) {
      const activeDeviceKey = `exam:active-device:${body.assessmentId}:${userId}`;
      const existingDevice = await this.redisService.get<{
        deviceFingerprint: string;
        attestationToken?: string;
        boundAt: string;
      }>(activeDeviceKey);

      const incomingFingerprint =
        (body as any).deviceFingerprint ||
        (body as any).fingerprint ||
        ip ||
        'unknown-device';

      if (
        existingDevice &&
        existingDevice.deviceFingerprint &&
        existingDevice.deviceFingerprint !== incomingFingerprint
      ) {
        throw new ForbiddenException({
          code: 'CONCURRENT_SESSION_DETECTED',
          message: 'Concurrent session detected. This assessment attempt is already active on another device.',
        });
      }

      if (!existingDevice) {
        await this.redisService.set(
          activeDeviceKey,
          {
            deviceFingerprint: incomingFingerprint,
            attestationToken: attestedSessionId,
            boundAt: new Date().toISOString(),
          },
          14400,
        );
      }
    }

    const attestationRecord: Record<string, any> = {
      userId,
      publicKeyPem: body.publicKeyPem.trim(),
      os: body.os || 'unknown',
      clientVersion: body.clientVersion,
      ip: ip || 'unknown',
      attestationTier,
      kioskMode,
      clientBinaryHash,
      sessionHmacKey,
      createdAt: new Date().toISOString(),
    };

    if (vdiOverride) {
      attestationRecord.vdiOverride = true;
    }

    if (this.redisService) {
      await this.redisService.set(
        `exam:attestation:${attestedSessionId}`,
        attestationRecord,
        14400,
      );

      // Support Crash/Network Relaunch Re-Attestation with Abuse Tracking
      if (body.assessmentId) {
        const activeAttestationKey = `exam:active-attestation:${userId}:${body.assessmentId}`;
        const relaunchCountKey = `exam:relaunch-count:${userId}:${body.assessmentId}`;
        const existingSessionId = await this.redisService.get<string>(activeAttestationKey);

        if (existingSessionId) {
          const prevCount = (await this.redisService.get<number>(relaunchCountKey)) || 0;
          const relaunchCount = Number(prevCount) + 1;
          await this.redisService.set(relaunchCountKey, relaunchCount, 14400);

          void this.cheatingRadarService?.recordClientRelaunch({
            studentId: userId,
            assessmentId: body.assessmentId,
            relaunchCount,
            ipAddress: ip,
          });
        }

        await this.redisService.set(activeAttestationKey, attestedSessionId, 14400);
      }
    }

    if (body.assessmentId) {
      try {
        const event = this.eventRepo.create({
          candidate: { id: userId } as any,
          candidateId: userId,
          assessmentId: body.assessmentId,
          sessionId: attestedSessionId,
          eventType: 'CLIENT_ATTESTED',
          severity: 'INFO',
          metadata: {
            kioskMode,
            attestationTier,
            clientBinaryHash,
            os: body.os,
            clientVersion: body.clientVersion,
          },
        });
        await this.eventRepo.save(event);
      } catch {
        // Non-blocking attestation event logging
      }
    }

    return {
      success: true,
      verified: true,
      attestedSessionId,
      sessionToken: attestedSessionId,
      sessionHmacKey,
      attestationTier,
      clientBinaryHash,
      serverTime,
      ...(vdiOverride ? { vdiOverride: true } : {}),
    };
  }

  async verifyQuitPassword(
    assessmentId: string,
    candidateId: string,
    password?: string,
  ): Promise<{ authorized: boolean }> {
    if (!assessmentId) {
      throw new BadRequestException('Assessment ID is required');
    }
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id: assessmentId }, { mongoId: assessmentId }],
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    const expectedPassword =
      assessment.lockdownQuitPassword ||
      (assessment.securityPolicy as any)?.lockdownQuitPassword;

    const isMatch = expectedPassword
      ? String(password || '').trim() === String(expectedPassword).trim()
      : true;

    if (!isMatch) {
      throw new ForbiddenException('Invalid proctor quit password');
    }

    try {
      await this.reportDirectViolation(
        candidateId,
        assessment.id,
        'PROCTOR_QUIT_AUTHORIZED',
        { authorizedAt: new Date().toISOString() },
      );
    } catch {
      // Safe fallback if logging encounters non-fatal DB constraint
    }

    return { authorized: true };
  }

  async proctorForceQuit(
    assessmentId: string,
    candidateId: string,
    reason?: string,
  ): Promise<{ success: boolean; message: string }> {
    const forceQuitReason =
      reason || 'Proctor remotely terminated this examination attempt.';

    if (this.redisService) {
      const key = `exam:force-quit:${assessmentId}:${candidateId}`;
      await this.redisService.set(key, forceQuitReason, 86400);
    }

    const session = await this.sessionRepo.findOne({
      where: [
        { assessmentId, candidateId },
        { assessment: { id: assessmentId } as any, candidate: { id: candidateId } as any },
      ],
      order: { createdAt: 'DESC' },
    });

    if (session && !['SUBMITTED', 'EXPIRED'].includes(session.status)) {
      session.status = 'TERMINATED';
      session.securityState = 'VIOLATED';
      await this.sessionRepo.save(session);
    }

    try {
      const event = this.eventRepo.create({
        candidate: { id: candidateId } as any,
        candidateId,
        assessmentId,
        sessionId: session?.id || '00000000-0000-0000-0000-000000000000',
        eventType: 'PROCTOR_REMOTE_TERMINATED',
        severity: 'CRITICAL',
        metadata: { reason: forceQuitReason },
      });
      await this.eventRepo.save(event);
    } catch {
      // Non-blocking fallback
    }

    return {
      success: true,
      message: 'Proctor force-quit signal registered successfully',
    };
  }

  async getAssessmentCandidateSecuritySummary(assessmentId: string): Promise<
    Record<
      string,
      {
        kioskMode?: string;
        attestationTier?: string;
        clientBinaryHash?: string;
        feedback?: { rating: number; technicalIssues?: string[]; comments?: string; kioskMode?: string };
      }
    >
  > {
    const summary: Record<string, any> = {};
    if (!this.eventRepo) return summary;

    try {
      const events = await this.eventRepo.find({
        where: [{ assessmentId }],
        order: { createdAt: 'ASC' },
      });

      for (const ev of events) {
        const cid = ev.candidateId || (ev.candidate as any)?.id;
        if (!cid) continue;
        if (!summary[cid]) {
          summary[cid] = {};
        }

        if (ev.eventType === 'CLIENT_ATTESTED') {
          if (ev.metadata?.kioskMode) summary[cid].kioskMode = ev.metadata.kioskMode;
          if (ev.metadata?.attestationTier) summary[cid].attestationTier = ev.metadata.attestationTier;
          if (ev.metadata?.clientBinaryHash) summary[cid].clientBinaryHash = ev.metadata.clientBinaryHash;
        } else if (ev.eventType === 'CANDIDATE_POST_EXAM_FEEDBACK') {
          summary[cid].feedback = {
            rating: ev.metadata?.rating,
            technicalIssues: ev.metadata?.technicalIssues,
            comments: ev.metadata?.comments,
            kioskMode: ev.metadata?.kioskMode,
          };
          if (ev.metadata?.kioskMode && !summary[cid].kioskMode) {
            summary[cid].kioskMode = ev.metadata.kioskMode;
          }
        }
      }
    } catch {
      // non-blocking
    }

    return summary;
  }

  async clearConcurrentDeviceLock(assessmentId: string, candidateId: string): Promise<void> {
    if (this.redisService) {
      await this.redisService.del(`exam:active-device:${assessmentId}:${candidateId}`);
    }
  }

  async enqueueTelemetryBatch(
    userId: string,
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
  ): Promise<{ accepted: boolean; count: number }> {
    const events = Array.isArray(body?.events) ? body.events : [];

    if (this.redisService && events.length > 0) {
      for (const ev of events) {
        const item = JSON.stringify({
          userId,
          assessmentId: body.assessmentId,
          sessionId: body.sessionId,
          eventType: ev.eventType || 'TELEMETRY_EVENT',
          severity: ev.severity || 'INFO',
          metadata: {
            ...(ev.metadata || {}),
            timestamp: ev.timestamp || Date.now(),
            pacingMetrics: body.pacingMetrics,
          },
          createdAt: new Date(ev.timestamp || Date.now()).toISOString(),
        });
        await this.redisService.rpush('exam:telemetry:buffer', item);
      }
    } else if (events.length > 0 && this.eventRepo) {
      const entities = events.map((ev) =>
        this.eventRepo.create({
          candidate: { id: userId } as any,
          candidateId: userId,
          assessmentId: body.assessmentId || undefined,
          sessionId: body.sessionId || undefined,
          eventType: ev.eventType || 'TELEMETRY_EVENT',
          severity: ev.severity || 'INFO',
          metadata: {
            ...(ev.metadata || {}),
            timestamp: ev.timestamp || Date.now(),
            pacingMetrics: body.pacingMetrics,
          },
        }),
      );
      await this.eventRepo.save(entities);
    }

    return { accepted: true, count: events.length };
  }

  async flushTelemetryBuffer(batchLimit = 100): Promise<number> {
    if (!this.redisService || !this.eventRepo) return 0;
    try {
      const items: any[] = [];
      for (let i = 0; i < batchLimit; i++) {
        const raw = await this.redisService.lpop('exam:telemetry:buffer');
        if (!raw) break;
        try {
          items.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
        } catch {
          // ignore parsing error
        }
      }

      if (items.length === 0) return 0;

      const entities = items.map((item) =>
        this.eventRepo.create({
          candidate: { id: item.userId } as any,
          candidateId: item.userId,
          assessmentId: item.assessmentId,
          sessionId: item.sessionId,
          eventType: item.eventType,
          severity: item.severity || 'INFO',
          metadata: item.metadata || {},
        }),
      );

      await this.eventRepo.save(entities);
      return entities.length;
    } catch {
      return 0;
    }
  }

  async getCachedLockdownAnalytics(assessmentId: string, computeFn: () => Promise<any>): Promise<any> {
    const cacheKey = `exam:lockdown-analytics:${assessmentId}`;
    if (this.redisService) {
      const cached = await this.redisService.get(cacheKey);
      if (cached) return cached;
    }

    const computed = await computeFn();

    if (this.redisService && computed) {
      await this.redisService.set(cacheKey, computed, 10); // 10s TTL
    }

    return computed;
  }
}
