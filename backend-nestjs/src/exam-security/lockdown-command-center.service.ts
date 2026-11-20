import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as crypto from 'crypto';
import { Assessment } from '../database/entities/assessment.entity';
import { ExamSession } from '../database/entities/exam-session.entity';
import { ExamSecurityEvent } from '../database/entities/exam-security-event.entity';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { User } from '../database/entities/user.entity';
import { Question } from '../database/entities/question.entity';
import { CandidateExamAccommodation } from '../database/entities/candidate-exam-accommodation.entity';
import { SubmissionStore } from '../database/sharding/submission-store';
import { RedisService } from '../redis/redis.service';

export interface CandidateDossierEvent {
  id: string;
  timestamp: number;
  eventType: string;
  severity: string;
  title: string;
  description: string;
  metadata: Record<string, any>;
}

export interface PlagiarismPairResult {
  candidateA: { id: string; name: string; email: string };
  candidateB: { id: string; name: string; email: string };
  problemId: string;
  similarityPercentage: number;
  sharedFingerprintCount: number;
  codeA: string;
  codeB: string;
}

@Injectable()
export class LockdownCommandCenterService {
  private readonly logger = new Logger(LockdownCommandCenterService.name);

  constructor(
    @InjectRepository(Assessment)
    private readonly assessmentRepo: Repository<Assessment>,
    @InjectRepository(ExamSession)
    private readonly sessionRepo: Repository<ExamSession>,
    @InjectRepository(ExamSecurityEvent)
    private readonly eventRepo: Repository<ExamSecurityEvent>,
    @InjectRepository(AssessmentAttempt)
    private readonly attemptRepo: Repository<AssessmentAttempt>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Optional()
    @InjectRepository(CandidateExamAccommodation)
    private readonly accommodationRepo: Repository<CandidateExamAccommodation> | undefined,
    @Optional()
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question> | undefined,
    private readonly submissionStore: SubmissionStore,
    private readonly redisService: RedisService,
  ) {}

  /**
   * 1. GET /api/exam-security/assessments/:assessmentId/command-center
   * Cached with a 10s TTL in Redis.
   */
  async getCommandCenter(assessmentId: string) {
    const cacheKey = `exam:lockdown-analytics:${assessmentId}`;
    if (this.redisService) {
      const cached = await this.redisService.get<any>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const assessment = await this.assessmentRepo.findOne({
      where: [{ id: assessmentId }, { mongoId: assessmentId }],
    });
    if (!assessment) {
      throw new NotFoundException(`Assessment ${assessmentId} not found`);
    }

    // 1. Fetch events
    const events = await this.eventRepo.find({
      where: [{ assessmentId: assessment.id }],
      order: { createdAt: 'ASC' },
    });

    // 2. Fetch sessions
    const sessions = await this.sessionRepo.find({
      where: [{ assessmentId: assessment.id }],
      relations: { candidate: true },
    });

    // 3. Fetch attempts
    const attempts = await this.attemptRepo.find({
      where: [{ assessmentId: assessment.id }],
      relations: { student: true },
    });

    // 4. Fetch stored plagiarism flags
    let plagiarismPairs: PlagiarismPairResult[] = [];
    if (this.redisService) {
      plagiarismPairs =
        (await this.redisService.get<PlagiarismPairResult[]>(
          `exam:plagiarism-results:${assessment.id}`,
        )) || [];
    }

    // Build aggregate metrics
    const osDistribution: Record<string, number> = {};
    const kioskTierBreakdown: Record<string, number> = {};
    let hardwareAttestationCount = 0;
    let softwareAttestationCount = 0;
    const violationHeatmap: Record<string, number> = {};
    let totalDisconnectEvents = 0;
    let totalOutageDurationMs = 0;
    let cleanSubmissions = 0;
    let abruptSubmissions = 0;
    let activeAttempts = 0;
    let blockedAttempts = 0;

    const feedbackRatings: number[] = [];
    const technicalIssuesCounts: Record<string, number> = {};
    const recentComments: Array<{ rating: number; comment?: string; candidateId: string }> = [];

    // Per-candidate state map
    const candidateMap = new Map<string, any>();

    // Seed candidate records from sessions and attempts
    for (const s of sessions) {
      const cid = s.candidateId || s.candidate?.id;
      if (!cid) continue;
      candidateMap.set(cid, {
        candidateId: cid,
        name: s.candidate?.name || 'Candidate',
        email: s.candidate?.email || 'student@codeskill.org',
        status: s.status === 'TERMINATED' ? 'BLOCKED' : s.status,
        kioskTier: 'standard',
        os: 'unknown',
        attestationTier: 'software_binary_bound',
        compositeRiskScore: 0,
        plagiarismSimilarity: 0,
        lastHeartbeatAt: s.lastHeartbeatAt,
        dwellTimeMs: 0,
        violationCount: s.violationCount || 0,
      });
    }

    for (const a of attempts) {
      const cid = a.studentId || a.student?.id;
      if (!cid) continue;
      let cand = candidateMap.get(cid);
      if (!cand) {
        cand = {
          candidateId: cid,
          name: a.student?.name || 'Candidate',
          email: a.student?.email || 'student@codeskill.org',
          status: a.status === 'disqualified' ? 'BLOCKED' : a.status.toUpperCase(),
          kioskTier: 'standard',
          os: 'unknown',
          attestationTier: 'software_binary_bound',
          compositeRiskScore: 0,
          plagiarismSimilarity: 0,
          lastHeartbeatAt: a.updatedAt,
          dwellTimeMs: 0,
          violationCount: 0,
        };
        candidateMap.set(cid, cand);
      }
      if (a.status === 'submitted') {
        cleanSubmissions++;
      } else if (a.status === 'auto_submitted' || a.status === 'disqualified') {
        abruptSubmissions++;
        cand.status = 'ABRUPT_SUBMIT';
      } else if (a.status === 'in_progress') {
        activeAttempts++;
      }
    }

    // Process events
    for (const ev of events) {
      const cid = ev.candidateId || (ev.candidate as any)?.id;
      const meta = ev.metadata || {};

      // Analytics aggregation
      if (ev.eventType === 'CLIENT_ATTESTED') {
        const os = (meta.os || 'unknown').toLowerCase();
        osDistribution[os] = (osDistribution[os] || 0) + 1;

        const tier = meta.kioskMode || 'standard';
        kioskTierBreakdown[tier] = (kioskTierBreakdown[tier] || 0) + 1;

        if (meta.attestationTier === 'hardware_tpm_enclave') {
          hardwareAttestationCount++;
        } else {
          softwareAttestationCount++;
        }

        if (cid && candidateMap.has(cid)) {
          const c = candidateMap.get(cid);
          c.os = os;
          c.kioskTier = tier;
          c.attestationTier = meta.attestationTier || 'software_binary_bound';
        }
      } else if (
        ev.eventType.includes('VIOLATION') ||
        ev.eventType === 'SECONDARY_DISPLAY_CONNECTED' ||
        ev.eventType === 'OVERLAY_WINDOW_DETECTED' ||
        ev.eventType === 'MITM_PROXY_DETECTED' ||
        ev.eventType === 'HID_MACRO_INJECTION_SUSPECTED' ||
        ev.eventType === 'WATERMARK_TAMPER_ATTEMPT' ||
        ev.eventType === 'RUNTIME_TAMPER_DETECTED' ||
        ev.eventType === 'INVALID_REQUEST_SIGNATURE'
      ) {
        violationHeatmap[ev.eventType] = (violationHeatmap[ev.eventType] || 0) + 1;
        if (cid && candidateMap.has(cid)) {
          const c = candidateMap.get(cid);
          c.violationCount = (c.violationCount || 0) + 1;
          c.compositeRiskScore = Math.min(100, c.compositeRiskScore + (ev.severity === 'CRITICAL' ? 35 : 15));
        }
      } else if (ev.eventType === 'DISCONNECTED_MEDIA' || ev.eventType === 'HARDWARE_DISCONNECT') {
        totalDisconnectEvents++;
        const duration = Number(meta.outageDurationMs) || 0;
        totalOutageDurationMs += duration;
        if (cid && candidateMap.has(cid)) {
          const c = candidateMap.get(cid);
          c.compositeRiskScore = Math.min(100, c.compositeRiskScore + 10);
        }
      } else if (ev.eventType === 'CANDIDATE_POST_EXAM_FEEDBACK') {
        if (typeof meta.rating === 'number') {
          feedbackRatings.push(meta.rating);
        }
        if (Array.isArray(meta.technicalIssues)) {
          for (const issue of meta.technicalIssues) {
            technicalIssuesCounts[issue] = (technicalIssuesCounts[issue] || 0) + 1;
          }
        }
        if (meta.comments) {
          recentComments.push({
            candidateId: cid,
            rating: meta.rating || 5,
            comment: meta.comments,
          });
        }
      }
    }

    // Attach highest plagiarism similarity per candidate
    for (const pair of plagiarismPairs) {
      if (candidateMap.has(pair.candidateA.id)) {
        const c = candidateMap.get(pair.candidateA.id);
        c.plagiarismSimilarity = Math.max(c.plagiarismSimilarity || 0, pair.similarityPercentage);
      }
      if (candidateMap.has(pair.candidateB.id)) {
        const c = candidateMap.get(pair.candidateB.id);
        c.plagiarismSimilarity = Math.max(c.plagiarismSimilarity || 0, pair.similarityPercentage);
      }
    }

    const candidateList = Array.from(candidateMap.values());
    for (const c of candidateList) {
      if (c.status === 'BLOCKED') blockedAttempts++;
    }

    const avgRating = feedbackRatings.length
      ? Math.round((feedbackRatings.reduce((a, b) => a + b, 0) / feedbackRatings.length) * 10) / 10
      : 5.0;

    const payload = {
      success: true,
      assessment: {
        id: assessment.id,
        title: assessment.title,
        durationMinutes: assessment.durationMinutes || 60,
        minLockdownVersion: (assessment as any).minLockdownVersion || '1.0.0',
      },
      kpi: {
        activeCandidates: activeAttempts,
        blockedCandidates: blockedAttempts,
        cleanSubmissions,
        abruptSubmissions,
        totalCandidates: candidateList.length,
        hardwareAttestationRatio:
          hardwareAttestationCount + softwareAttestationCount > 0
            ? Math.round((hardwareAttestationCount / (hardwareAttestationCount + softwareAttestationCount)) * 100)
            : 0,
        mediaDisconnectRate:
          candidateList.length > 0
            ? Math.round((totalDisconnectEvents / candidateList.length) * 100) / 100
            : 0,
        plagiarismAlertCount: plagiarismPairs.length,
        candidateFeedbackAverage: avgRating,
      },
      analytics: {
        osDistribution,
        kioskTierBreakdown,
        attestationPosture: {
          hardwareTPM: hardwareAttestationCount,
          softwareAttestation: softwareAttestationCount,
        },
        violationHeatmap,
        mediaOutageStats: {
          disconnectCount: totalDisconnectEvents,
          totalOutageDurationSeconds: Math.round(totalOutageDurationMs / 1000),
        },
        feedback: {
          averageRating: avgRating,
          totalResponses: feedbackRatings.length,
          technicalIssuesCounts,
          recentComments: recentComments.slice(-10),
        },
      },
      candidates: candidateList,
      plagiarismFlaggedPairs: plagiarismPairs,
    };

    if (this.redisService) {
      await this.redisService.set(cacheKey, payload, 10); // 10s TTL
    }

    return payload;
  }

  /**
   * 2. GET /api/exam-security/assessments/:assessmentId/candidates/:candidateId/forensic-timeline
   */
  async getCandidateForensicTimeline(assessmentId: string, candidateId: string) {
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id: assessmentId }, { mongoId: assessmentId }],
    });
    if (!assessment) {
      throw new NotFoundException(`Assessment ${assessmentId} not found`);
    }

    const events = await this.eventRepo.find({
      where: [{ assessmentId: assessment.id, candidateId }],
      order: { createdAt: 'ASC' },
    });

    const session = await this.sessionRepo.findOne({
      where: [{ assessmentId: assessment.id, candidateId }],
    });

    const attempt = await this.attemptRepo.findOne({
      where: [{ assessmentId: assessment.id, studentId: candidateId }],
    });

    const timeline: CandidateDossierEvent[] = events.map((ev) => {
      let title = ev.eventType.replace(/_/g, ' ');
      let description = (ev.metadata?.message as string) || '';

      if (ev.eventType === 'CLIENT_ATTESTED') {
        title = 'Hardware & Cryptographic Attestation';
        description = `Launched on ${ev.metadata?.os} using ${ev.metadata?.kioskMode} kiosk tier (${ev.metadata?.attestationTier}).`;
      } else if (ev.eventType === 'SECONDARY_DISPLAY_CONNECTED') {
        title = 'External Display Connected';
        description = ev.metadata?.message || 'Secondary monitor connected mid-exam.';
      } else if (ev.eventType === 'OVERLAY_WINDOW_DETECTED') {
        title = 'Stealth Overlay Window';
        description = ev.metadata?.message || 'Unauthorized floating window detected.';
      } else if (ev.eventType === 'MITM_PROXY_DETECTED') {
        title = 'System Proxy / MITM Tool Detected';
        description = ev.metadata?.message || 'Active HTTP/SOCKS proxy prohibited during exam.';
      } else if (ev.eventType === 'ADMIN_UNLOCK_OVERRIDE') {
        title = 'Admin Proctor Unlock';
        description = `Session lockout cleared by Admin (${ev.metadata?.adminUserId}). Reason: ${ev.metadata?.reason || 'Proctor Override'}`;
      } else if (ev.eventType === 'ADMIN_REOPEN_SUBMISSION') {
        title = 'Submission Re-opened to In-Progress';
        description = `Auto-submitted attempt restored to in_progress by Admin. Reason: ${ev.metadata?.reason}`;
      } else if (ev.eventType === 'ADMIN_EXTEND_TIME') {
        title = 'Authoritative Exam Time Extended';
        description = `+${ev.metadata?.extraMinutes}m added. Reason: ${ev.metadata?.reason}`;
      } else if (ev.eventType === 'HID_MACRO_INJECTION_SUSPECTED') {
        title = 'HID Macro / Keystroke Injection Suspected';
        description = ev.metadata?.message || 'Robotic keystroke cadence detected (sub-18ms flight time with minimal jitter).';
      } else if (ev.eventType === 'WATERMARK_TAMPER_ATTEMPT') {
        title = 'Forensic Watermark Tamper Attempt';
        description = ev.metadata?.message || 'Forensic screen watermark DOM node was modified, hidden, or removed.';
      } else if (ev.eventType === 'RUNTIME_TAMPER_DETECTED') {
        title = 'Runtime Tamper / Debugger Detected';
        description = ev.metadata?.message || 'Runtime debugger attachment or unauthorized dylib/DLL injection detected.';
      } else if (ev.eventType === 'INVALID_REQUEST_SIGNATURE') {
        title = 'Invalid Request Signature';
        description = ev.metadata?.message || 'Per-request hardware HMAC signature verification failed or payload tampered.';
      }

      return {
        id: ev.id,
        timestamp: new Date(ev.createdAt).getTime(),
        eventType: ev.eventType,
        severity: ev.severity,
        title,
        description,
        metadata: ev.metadata || {},
      };
    });

    return {
      success: true,
      assessmentId: assessment.id,
      candidateId,
      sessionStatus: session?.status || 'UNKNOWN',
      attemptStatus: attempt?.status || 'UNKNOWN',
      timeline,
    };
  }

  /**
   * 3.1 POST /api/exam-security/assessments/:assessmentId/candidates/:candidateId/unlock
   */
  async unlockCandidate(
    assessmentId: string,
    candidateId: string,
    adminUserId: string,
    reason?: string,
  ) {
    if (this.redisService) {
      await this.redisService.del(`exam:active-device:${assessmentId}:${candidateId}`);
      await this.redisService.del(`exam:force-quit:${assessmentId}:${candidateId}`);
      await this.redisService.del(`exam:lockdown-analytics:${assessmentId}`);
    }

    const session = await this.sessionRepo.findOne({
      where: [{ assessmentId, candidateId }],
    });
    if (session) {
      session.status = 'ACTIVE';
      session.securityState = 'VERIFIED';
      session.lastHeartbeatAt = new Date();
      await this.sessionRepo.save(session);
    }

    const attempt = await this.attemptRepo.findOne({
      where: [{ assessmentId, studentId: candidateId }],
    });
    if (attempt && (attempt.status === 'disqualified' || attempt.status === 'timed_out')) {
      attempt.status = 'in_progress';
      await this.attemptRepo.save(attempt);
    }

    // Log admin audit action
    const auditEvent = this.eventRepo.create({
      candidate: { id: candidateId } as any,
      candidateId,
      assessmentId,
      sessionId: session?.id || undefined,
      eventType: 'ADMIN_UNLOCK_OVERRIDE',
      severity: 'INFO',
      metadata: {
        adminUserId,
        reason: reason || 'Admin unblock override',
        unlockedAt: new Date().toISOString(),
      },
    });
    await this.eventRepo.save(auditEvent);

    return {
      success: true,
      message: 'Candidate lockout and concurrent device lock successfully cleared.',
    };
  }

  /**
   * 3.2 POST /api/exam-security/assessments/:assessmentId/candidates/:candidateId/reopen-submission
   * INVARIANT: Uses SubmissionStore with userId for 128-bucket MD5 routing.
   */
  async reopenSubmission(
    assessmentId: string,
    candidateId: string,
    adminUserId: string,
    reason?: string,
  ) {
    // 1. Restore submissions via SubmissionStore using userId
    const submissions = await this.submissionStore.find({
      where: { assessmentId, userId: candidateId } as any,
    });
    for (const sub of submissions) {
      if (sub.status !== 'accepted') {
        sub.status = 'in_progress';
        await this.submissionStore.save(sub);
      }
    }

    // 2. Restore AssessmentAttempt
    const attempt = await this.attemptRepo.findOne({
      where: [{ assessmentId, studentId: candidateId }],
    });
    if (attempt) {
      attempt.status = 'in_progress';
      (attempt as any).submittedAt = null;
      await this.attemptRepo.save(attempt);
    }

    // 3. Restore ExamSession
    const session = await this.sessionRepo.findOne({
      where: [{ assessmentId, candidateId }],
    });
    if (session) {
      session.status = 'ACTIVE';
      session.securityState = 'VERIFIED';
      session.lastHeartbeatAt = new Date();
      await this.sessionRepo.save(session);
    }

    // 4. Invalidate cache
    if (this.redisService) {
      await this.redisService.del(`exam:lockdown-analytics:${assessmentId}`);
    }

    // 5. Audit event in DB
    const auditEvent = this.eventRepo.create({
      candidate: { id: candidateId } as any,
      candidateId,
      assessmentId,
      sessionId: session?.id || undefined,
      eventType: 'ADMIN_REOPEN_SUBMISSION',
      severity: 'WARN',
      metadata: {
        adminUserId,
        reason: reason || 'Abrupt submission restored to in-progress by Admin',
        restoredSubmissionsCount: submissions.length,
      },
    });
    await this.eventRepo.save(auditEvent);

    return {
      success: true,
      message: 'Candidate submission successfully restored to in_progress.',
      restoredSubmissionsCount: submissions.length,
    };
  }

  /**
   * 3.3 POST /api/exam-security/assessments/:assessmentId/candidates/:candidateId/extend-time
   */
  async extendTime(
    assessmentId: string,
    candidateId: string,
    extraMinutes: number,
    adminUserId: string,
    reason?: string,
  ) {
    if (!extraMinutes || extraMinutes <= 0) {
      throw new BadRequestException('extraMinutes must be a positive integer');
    }

    const session = await this.sessionRepo.findOne({
      where: [{ assessmentId, candidateId }],
    });

    let newExpiresAt: Date;
    if (session) {
      newExpiresAt = new Date(
        (session.expiresAt ? session.expiresAt.getTime() : Date.now()) + extraMinutes * 60 * 1000,
      );
      session.expiresAt = newExpiresAt;
      await this.sessionRepo.save(session);
    } else {
      newExpiresAt = new Date(Date.now() + extraMinutes * 60 * 1000);
    }

    const attempt = await this.attemptRepo.findOne({
      where: [{ assessmentId, studentId: candidateId }],
    });
    if (attempt) {
      (attempt as any).extraTimeMinutes = ((attempt as any).extraTimeMinutes || 0) + extraMinutes;
      await this.attemptRepo.save(attempt);
    }

    if (this.redisService) {
      await this.redisService.del(`exam:lockdown-analytics:${assessmentId}`);
    }

    const auditEvent = this.eventRepo.create({
      candidate: { id: candidateId } as any,
      candidateId,
      assessmentId,
      sessionId: session?.id || undefined,
      eventType: 'ADMIN_EXTEND_TIME',
      severity: 'INFO',
      metadata: {
        adminUserId,
        extraMinutes,
        reason: reason || 'Extra time granted by proctor',
        newExpiresAt: newExpiresAt.toISOString(),
      },
    });
    await this.eventRepo.save(auditEvent);

    return {
      success: true,
      extraMinutes,
      newExpiresAt,
      message: `Successfully extended deadline by +${extraMinutes} minutes.`,
    };
  }

  /**
   * 3.4 POST /api/exam-security/assessments/:assessmentId/candidates/:candidateId/preflight-waiver
   */
  async grantPreflightWaiver(
    assessmentId: string,
    candidateId: string,
    waiverType: string,
    adminUserId: string,
    reason: string,
  ) {
    const validWaivers = [
      'x11_session',
      'secondary_display',
      'hardware_mic',
      'software_attestation',
    ];
    if (!validWaivers.includes(waiverType)) {
      throw new BadRequestException(
        `Invalid waiverType: ${waiverType}. Must be one of: ${validWaivers.join(', ')}`,
      );
    }

    if (this.redisService) {
      const waiverKey = `exam:waiver:${assessmentId}:${candidateId}:${waiverType}`;
      await this.redisService.set(
        waiverKey,
        {
          waivedBy: adminUserId,
          reason,
          grantedAt: Date.now(),
        },
        86400,
      );
    }

    const auditEvent = this.eventRepo.create({
      candidate: { id: candidateId } as any,
      candidateId,
      assessmentId,
      eventType: 'ADMIN_PREFLIGHT_WAIVER',
      severity: 'WARN',
      metadata: {
        adminUserId,
        waiverType,
        reason,
        grantedAt: new Date().toISOString(),
      },
    });
    await this.eventRepo.save(auditEvent);

    return {
      success: true,
      waiverType,
      candidateId,
      message: `Preflight waiver [${waiverType}] granted for candidate.`,
    };
  }

  /**
   * 3.5 POST /api/exam-security/assessments/:assessmentId/candidates/:candidateId/proctor-message
   */
  async sendProctorMessage(
    assessmentId: string,
    candidateId: string,
    payload: {
      message?: string;
      action?: 'BANNER' | 'FORCE_SUBMIT' | 'FORCE_QUIT';
      reason?: string;
    },
    adminUserId: string,
  ) {
    const action = payload.action || 'BANNER';

    if (this.redisService) {
      if (action === 'FORCE_QUIT' || action === 'FORCE_SUBMIT') {
        const quitKey = `exam:force-quit:${assessmentId}:${candidateId}`;
        await this.redisService.set(
          quitKey,
          payload.reason || payload.message || 'Remote proctor force termination',
          14400,
        );
      } else {
        const bannerKey = `exam:proctor-banner:${assessmentId}:${candidateId}`;
        await this.redisService.set(
          bannerKey,
          {
            message: payload.message || 'Important Proctor Notice',
            sentAt: Date.now(),
            adminUserId,
          },
          3600,
        );
      }
    }

    const auditEvent = this.eventRepo.create({
      candidate: { id: candidateId } as any,
      candidateId,
      assessmentId,
      eventType: action === 'BANNER' ? 'PROCTOR_BANNER_MESSAGE' : 'PROCTOR_FORCE_QUIT',
      severity: action === 'BANNER' ? 'INFO' : 'CRITICAL',
      metadata: {
        adminUserId,
        action,
        message: payload.message,
        reason: payload.reason,
      },
    });
    await this.eventRepo.save(auditEvent);

    return {
      success: true,
      action,
      message: `Proctor command [${action}] queued for candidate delivery on next heartbeat.`,
    };
  }

  /**
   * 3.6 POST /api/exam-security/assessments/:assessmentId/rotate-quit-pin
   */
  async rotateQuitPin(assessmentId: string, adminUserId: string, reason?: string) {
    const quitPin = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 86400 * 1000;

    if (this.redisService) {
      await this.redisService.set(`exam:quit-pin:${assessmentId}`, quitPin, 86400);
    }

    const auditEvent = this.eventRepo.create({
      candidateId: adminUserId,
      assessmentId,
      eventType: 'PROCTOR_QUIT_PIN_ROTATED',
      severity: 'INFO',
      metadata: {
        adminUserId,
        reason: reason || 'Proctor exit PIN rotation',
        expiresAt: new Date(expiresAt).toISOString(),
      },
    });
    await this.eventRepo.save(auditEvent);

    return {
      success: true,
      quitPin,
      expiresAt,
    };
  }

  /**
   * 4. POST /api/exam-security/assessments/:assessmentId/run-plagiarism-scan
   * Cross-Candidate Code Similarity (AST/Token Winnowing + Jaccard) Scanner
   * INVARIANT: Code submissions read strictly via SubmissionStore using userId.
   */
  async runPlagiarismScan(assessmentId: string, adminUserId: string) {
    const attempts = await this.attemptRepo.find({
      where: [{ assessmentId }],
      relations: { student: true },
    });

    const candidateCodes: Array<{
      candidate: { id: string; name: string; email: string };
      problemId: string;
      code: string;
      fingerprints: Set<string>;
    }> = [];

    // Read submissions through SubmissionStore for each candidate
    for (const att of attempts) {
      const cid = att.studentId || att.student?.id;
      if (!cid) continue;

      const submissions = await this.submissionStore.find({
        where: { assessmentId, userId: cid } as any,
      });

      for (const sub of submissions) {
        if (!sub.code || sub.code.trim().length < 20) continue;
        const fps = this.computeWinnowingFingerprints(sub.code);
        candidateCodes.push({
          candidate: {
            id: cid,
            name: att.student?.name || 'Candidate',
            email: att.student?.email || 'student@codeskill.org',
          },
          problemId: sub.problemId || 'general',
          code: sub.code,
          fingerprints: fps,
        });
      }
    }

    const flaggedPairs: PlagiarismPairResult[] = [];

    // Compare all pairs for each problem
    for (let i = 0; i < candidateCodes.length; i++) {
      for (let j = i + 1; j < candidateCodes.length; j++) {
        const a = candidateCodes[i];
        const b = candidateCodes[j];

        // Only compare different candidates working on the same problem
        if (a.candidate.id === b.candidate.id || a.problemId !== b.problemId) {
          continue;
        }

        const similarity = this.calculateJaccardSimilarity(a.fingerprints, b.fingerprints);
        if (similarity >= 70) {
          let sharedCount = 0;
          for (const fp of a.fingerprints) {
            if (b.fingerprints.has(fp)) sharedCount++;
          }

          flaggedPairs.push({
            candidateA: a.candidate,
            candidateB: b.candidate,
            problemId: a.problemId,
            similarityPercentage: Math.round(similarity),
            sharedFingerprintCount: sharedCount,
            codeA: a.code,
            codeB: b.code,
          });
        }
      }
    }

    if (this.redisService) {
      await this.redisService.set(
        `exam:plagiarism-results:${assessmentId}`,
        flaggedPairs,
        86400,
      );
      await this.redisService.del(`exam:lockdown-analytics:${assessmentId}`);
    }

    const auditEvent = this.eventRepo.create({
      candidateId: adminUserId,
      assessmentId,
      eventType: 'PLAGIARISM_SCAN_COMPLETED',
      severity: 'INFO',
      metadata: {
        adminUserId,
        scannedSubmissionsCount: candidateCodes.length,
        flaggedPairsCount: flaggedPairs.length,
      },
    });
    await this.eventRepo.save(auditEvent);

    return {
      success: true,
      scannedSubmissionsCount: candidateCodes.length,
      flaggedPairsCount: flaggedPairs.length,
      flaggedPairs,
    };
  }

  /**
   * Normalized AST/Token Winnowing Fingerprinting
   * Strips comments, normalizes identifiers & string literals, computes k-grams.
   */
  private computeWinnowingFingerprints(code: string, k = 4, w = 4): Set<string> {
    // 1. Strip comments
    const stripped = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '')
      .replace(/#.*/g, '')
      .replace(/"""[\s\S]*?"""/g, '');

    // 2. Tokenize and normalize
    const rawTokens = stripped.match(/[a-zA-Z_][a-zA-Z0-9_]*|[0-9]+|[+\-*\/=<>!&|^~%]+|[{}\[\](),;]/g) || [];
    const keywords = new Set([
      'def', 'class', 'return', 'if', 'else', 'elif', 'for', 'while', 'in', 'function',
      'const', 'let', 'var', 'import', 'from', 'public', 'private', 'static', 'int', 'void',
      'bool', 'true', 'false', 'null', 'None',
    ]);

    const normalizedTokens = rawTokens.map((tok) => {
      if (keywords.has(tok)) return tok;
      if (/^[0-9]+$/.test(tok)) return 'NUM';
      if (/^[a-zA-Z_]/.test(tok)) return 'ID';
      return tok;
    });

    if (normalizedTokens.length < k) {
      return new Set([normalizedTokens.join('')]);
    }

    // 3. Compute k-gram hashes
    const hashes: string[] = [];
    for (let i = 0; i <= normalizedTokens.length - k; i++) {
      const kgram = normalizedTokens.slice(i, i + k).join('');
      const hash = crypto.createHash('md5').update(kgram).digest('hex').substring(0, 8);
      hashes.push(hash);
    }

    // 4. Winnowing: pick min hash in window w
    const fingerprints = new Set<string>();
    if (hashes.length <= w) {
      hashes.forEach((h) => fingerprints.add(h));
      return fingerprints;
    }

    for (let i = 0; i <= hashes.length - w; i++) {
      const window = hashes.slice(i, i + w);
      let minHash = window[0];
      for (const h of window) {
        if (h < minHash) minHash = h;
      }
      fingerprints.add(minHash);
    }

    return fingerprints;
  }

  private calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union > 0 ? (intersection / union) * 100 : 0;
  }

  /**
   * 8. GET /api/exam-security/assessments/:assessmentId/candidates/:candidateId/integrity-digest
   * Returns composite risk score, status, plain-English findings, candidate accommodations,
   * grade hold state, and code snapshots loaded strictly via SubmissionStore.
   */
  async getCandidateIntegrityDigest(assessmentId: string, candidateId: string) {
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id: assessmentId }, { mongoId: assessmentId }],
      relations: { questions: true },
    });
    if (!assessment) {
      throw new NotFoundException(`Assessment ${assessmentId} not found`);
    }

    const [events, session, attempt, accommodation] = await Promise.all([
      this.eventRepo.find({
        where: [{ assessmentId: assessment.id, candidateId }],
        order: { createdAt: 'ASC' },
      }),
      this.sessionRepo.findOne({
        where: [{ assessmentId: assessment.id, candidateId }],
      }),
      this.attemptRepo.findOne({
        where: [{ assessmentId: assessment.id, studentId: candidateId }],
        relations: { student: true },
      }),
      this.accommodationRepo
        ? this.accommodationRepo.findOne({
            where: { assessment_id: assessment.id, user_id: candidateId },
          })
        : null,
    ]);

    // Compute plain-English findings and risk score
    let riskScore = 0;
    const plainEnglishFindings: string[] = [];

    const attestedEvent = events.find((ev) => ev.eventType === 'CLIENT_ATTESTED');
    const attestationTier = (attestedEvent?.metadata?.attestationTier as string) || 'software_binary_bound';
    if (attestationTier === 'hardware_tpm_enclave') {
      plainEnglishFindings.push('Cryptographic hardware enclave (TPM / Apple Secure Enclave) confirmed active.');
    } else {
      plainEnglishFindings.push('Software-bound binary attestation verified (non-hardware TPM).');
    }

    let tabSwitchCount = 0;
    let secondaryDisplayCount = 0;
    let unauthorizedAppCount = 0;
    let mitmProxyCount = 0;
    let vmDetected = false;

    for (const ev of events) {
      if (ev.eventType === 'TAB_SWITCH' || ev.eventType === 'FOCUS_LOST') {
        tabSwitchCount++;
      } else if (ev.eventType === 'SECONDARY_DISPLAY_CONNECTED') {
        secondaryDisplayCount++;
      } else if (ev.eventType === 'FORBIDDEN_PROCESS_DETECTED' || ev.eventType === 'BACKGROUND_APP_LAUNCHED') {
        unauthorizedAppCount++;
      } else if (ev.eventType === 'MITM_PROXY_DETECTED') {
        mitmProxyCount++;
      } else if (ev.eventType === 'VM_DETECTED') {
        vmDetected = true;
      }
    }

    if (tabSwitchCount > 0) {
      riskScore += Math.min(30, tabSwitchCount * 10);
      plainEnglishFindings.push(`Detected ${tabSwitchCount} tab-switching or window focus loss event(s).`);
    }
    if (secondaryDisplayCount > 0) {
      if (accommodation?.secondary_display_allowed) {
        plainEnglishFindings.push(`Secondary display connected (Waived under approved accessibility accommodation).`);
      } else {
        riskScore += 25;
        plainEnglishFindings.push(`Detected unauthorized secondary monitor connection (${secondaryDisplayCount} time(s)).`);
      }
    }
    if (unauthorizedAppCount > 0) {
      riskScore += Math.min(35, unauthorizedAppCount * 15);
      plainEnglishFindings.push(`Detected ${unauthorizedAppCount} attempt(s) to run prohibited background processes.`);
    }
    if (mitmProxyCount > 0) {
      riskScore += 35;
      plainEnglishFindings.push('System HTTP/SOCKS network proxy detected during active exam session.');
    }
    if (vmDetected) {
      riskScore += 40;
      plainEnglishFindings.push('Virtual machine or hypervisor environment identified.');
    }

    if (plainEnglishFindings.length <= 1 && attestationTier === 'hardware_tpm_enclave') {
      plainEnglishFindings.push('No suspicious environmental, network, or keyboard anomalies detected.');
    }

    const compositeRiskScore = Math.min(100, riskScore);
    const integrityStatus =
      compositeRiskScore >= 60 ? 'HIGH_RISK' : compositeRiskScore >= 25 ? 'SUSPICIOUS' : 'CLEAN';

    // Strict Submission Sharding Invariant: Read submissions via SubmissionStore using userId
    const submissions = await this.submissionStore.find({
      where: { assessmentId: assessment.id, userId: candidateId } as any,
      order: { createdAt: 'ASC' } as any,
    });

    const codeSnapshots = submissions.map((sub) => ({
      submissionId: sub.id,
      problemId: sub.problemId,
      language: sub.language,
      code: sub.code,
      status: sub.status,
      testsPassed: sub.testsPassed,
      totalTests: sub.totalTests,
      createdAt: sub.createdAt,
    }));

    return {
      success: true,
      assessmentId: assessment.id,
      candidateId,
      candidateName: attempt?.student?.name || 'Anonymous Candidate',
      candidateEmail: attempt?.student?.email || '',
      attemptId: attempt?.id || null,
      compositeRiskScore,
      integrityStatus,
      gradeHeld: Boolean(attempt?.gradeHeld),
      gradeHoldReason: attempt?.gradeHoldReason || '',
      plainEnglishFindings,
      codeSnapshots,
      accommodation: accommodation
        ? {
            timeMultiplier: accommodation.time_multiplier,
            extraMinutesFlat: accommodation.extra_minutes_flat,
            configuredByRole: accommodation.configured_by_role,
            secondaryDisplayAllowed: accommodation.secondary_display_allowed,
            screenReaderAllowed: accommodation.screen_reader_allowed,
          }
        : null,
      totalViolations: events.length,
      startedAt: attempt?.startedAt || session?.startedAt || null,
    };
  }

  /**
   * 9. POST /api/exam-security/assessments/:assessmentId/candidates/:candidateId/integrity-decision
   * Applies instructor or admin grade hold decision on candidate's attempt.
   */
  async setCandidateIntegrityDecision(
    assessmentId: string,
    candidateId: string,
    decision: 'HOLD_GRADE' | 'CLEAR_HOLD',
    reason?: string,
    adminUserId?: string,
  ) {
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id: assessmentId }, { mongoId: assessmentId }],
    });
    if (!assessment) {
      throw new NotFoundException(`Assessment ${assessmentId} not found`);
    }

    const attempt = await this.attemptRepo.findOne({
      where: [{ assessmentId: assessment.id, studentId: candidateId }],
    });
    if (!attempt) {
      throw new NotFoundException(`Candidate attempt not found for assessment ${assessmentId}`);
    }

    const session = await this.sessionRepo.findOne({
      where: [{ assessmentId: assessment.id, candidateId }],
    });

    const isHold = decision === 'HOLD_GRADE';
    attempt.gradeHeld = isHold;
    attempt.gradeHoldReason = isHold
      ? reason || 'Held by instructor for exam integrity review'
      : '';

    await this.attemptRepo.save(attempt);

    // Audit log
    const auditEvent = this.eventRepo.create({
      assessmentId: assessment.id,
      candidateId,
      sessionId: session?.id || assessment.id,
      eventType: isHold ? 'GRADE_HOLD_PLACED' : 'GRADE_HOLD_CLEARED',
      severity: isHold ? 'HIGH' : 'LOW',
      metadata: {
        reason: attempt.gradeHoldReason,
        configuredBy: adminUserId,
      },
    });
    await this.eventRepo.save(auditEvent);

    return {
      success: true,
      candidateId,
      attemptId: attempt.id,
      gradeHeld: attempt.gradeHeld,
      gradeHoldReason: attempt.gradeHoldReason,
    };
  }

  /**
   * 10. GET /api/exam-security/assessments/:assessmentId/question-friction-analytics
   * Aggregates per-question average solve time, error rates, and difficulty category.
   */
  async getQuestionFrictionAnalytics(assessmentId: string) {
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id: assessmentId }, { mongoId: assessmentId }],
    });
    if (!assessment) {
      throw new NotFoundException(`Assessment ${assessmentId} not found`);
    }

    const attempts = await this.attemptRepo.find({
      where: [{ assessmentId: assessment.id }],
    });

    // Extract all question IDs from assessment.questions and assessment.sections
    const qIdSet = new Set<string>();
    if (Array.isArray(assessment.questions)) {
      assessment.questions.forEach((id) => qIdSet.add(String(id)));
    }
    if (Array.isArray(assessment.sections)) {
      assessment.sections.forEach((sec) => {
        (sec.questions || []).forEach((q) => qIdSet.add(String(q.questionId)));
      });
    }

    const questionIds = Array.from(qIdSet);
    const questionEntities =
      this.questionRepo && questionIds.length > 0
        ? await this.questionRepo.findBy({ id: In(questionIds) as any })
        : [];
    const questionMap = new Map(questionEntities.map((q) => [String(q.id), q]));

    const questionStats = new Map<
      string,
      { totalTimeSeconds: number; attemptsCount: number; totalScorePct: number }
    >();

    for (const qId of questionIds) {
      questionStats.set(qId, { totalTimeSeconds: 0, attemptsCount: 0, totalScorePct: 0 });
    }

    for (const att of attempts) {
      const responses = (att.responses as any[]) || [];
      for (const r of responses) {
        const qId = String(r.questionId);
        if (!questionStats.has(qId)) {
          questionStats.set(qId, { totalTimeSeconds: 0, attemptsCount: 0, totalScorePct: 0 });
        }
        const stats = questionStats.get(qId)!;
        stats.attemptsCount++;
        stats.totalTimeSeconds += Number(r.timeSpentSeconds) || 0;
        const maxMarks = Number(r.maxMarks) || 10;
        const awarded = Number(r.marksAwarded) || (r.isCorrect ? maxMarks : 0);
        stats.totalScorePct += maxMarks > 0 ? (awarded / maxMarks) * 100 : 0;
      }
    }

    const frictionList = Array.from(questionStats.keys()).map((qId) => {
      const qEntity = questionMap.get(qId);
      const stats = questionStats.get(qId)!;
      const attemptsCount = stats.attemptsCount;
      const averageTimeSpentSeconds =
        attemptsCount > 0 ? Math.round(stats.totalTimeSeconds / attemptsCount) : 0;
      const averageScorePct =
        attemptsCount > 0 ? Math.round(stats.totalScorePct / attemptsCount) : 0;

      // Friction score: high time + low score = high friction (0 - 100)
      const scoreInversion = 100 - averageScorePct;
      const timeFactor = Math.min(100, Math.round((averageTimeSpentSeconds / 300) * 100));
      const frictionScore = Math.round(scoreInversion * 0.6 + timeFactor * 0.4);

      let difficultyCategory: 'LOW_FRICTION' | 'MODERATE' | 'HIGH_FRICTION' =
        'LOW_FRICTION';
      if (frictionScore >= 65) difficultyCategory = 'HIGH_FRICTION';
      else if (frictionScore >= 35) difficultyCategory = 'MODERATE';

      return {
        questionId: qId,
        title:
          qEntity?.question?.slice(0, 50) ||
          qEntity?.topic ||
          `Question ${qId.slice(0, 8)}`,
        type: qEntity?.questionType || 'coding',
        marks: qEntity?.marks || 10,
        attemptsCount,
        averageTimeSpentSeconds,
        averageScorePercentage: averageScorePct,
        frictionScore,
        difficultyCategory,
      };
    });

    return {
      success: true,
      assessmentId: assessment.id,
      questions: frictionList,
    };
  }
}
