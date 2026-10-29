import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
  BadRequestException,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { Assessment } from '../database/entities/assessment.entity';
import { Question } from '../database/entities/question.entity';
import type { Response } from 'express';
import { renderToStream } from '@react-pdf/renderer';
import { StudentResultReport, StudentResult } from './student-result.pdf';
import * as React from 'react';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(
    @InjectRepository(AssessmentAttempt)
    private readonly attemptRepo: Repository<AssessmentAttempt>,
    @InjectRepository(Assessment)
    private readonly assessmentRepo: Repository<Assessment>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
  ) {}

  @Get('assessment-attempt/:attemptId')
  async getStudentResultReport(
    @Param('attemptId') attemptId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    if (!attemptId) {
      throw new BadRequestException('Invalid attempt ID');
    }

    const attempt = await this.attemptRepo.findOne({
      where: [{ id: attemptId }, { mongoId: attemptId }],
      relations: { student: true },
    });
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }

    // Confidentiality enforcement (AUD-003):
    // Only the student who completed the attempt or an administrator may view the report.
    const studentId = attempt.studentId;
    const isOwner = user && (user.id === studentId || user.mongoId === studentId);
    const isAdmin =
      user &&
      (user.isAdmin === true ||
        ['admin', 'super_admin', 'assessment_admin'].includes(user.role));

    if (!isOwner && !isAdmin) {
      this.logger.warn(
        `User ${user?.id} attempted unauthorized access to attempt ${attemptId} of student ${studentId}`,
      );
      // Return 404 to prevent resource enumeration
      throw new NotFoundException('Attempt not found');
    }

    const assessmentId = attempt.assessmentId;
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id: assessmentId }, { mongoId: assessmentId }],
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    // Candidate identity mapping: Never use a shared fallback UID
    const studentUid =
      attempt.studentUid ||
      attempt.student?.uid ||
      (attempt.student?.studentProfile as any)?.rollNumber ||
      (attempt.student?.studentProfile as any)?.uid ||
      attempt.studentId ||
      attempt.id;
    const studentName = attempt.studentName || attempt.student?.name || 'Unknown Candidate';
    const studentEmail = attempt.studentEmail || attempt.student?.email || 'N/A';
    const institution =
      (assessment as any).institution ||
      (attempt.student?.studentProfile as any)?.university ||
      'Chandigarh University';
    const program =
      (attempt.student?.studentProfile as any)?.course ||
      (attempt.student?.studentProfile as any)?.department ||
      'B.Tech Computer Science & Engineering';

    // Authoritative ranking and percentile calculation
    const completedStatuses = ['submitted', 'auto_submitted', 'timed_out'];
    const assessmentAttempts = await this.attemptRepo.find({
      where: {
        assessmentId: assessment.id,
        status: In(completedStatuses),
      },
      order: {
        score: 'DESC',
        timeSpentSeconds: 'ASC',
        submittedAt: 'ASC',
      },
    });

    // Group by unique candidate to pick best attempt per candidate for official cohort ranking
    const candidateBestAttemptsMap = new Map<string, AssessmentAttempt>();
    for (const att of assessmentAttempts) {
      const studentKey = att.studentId ? String(att.studentId) : String(att.studentUid || att.id);
      const existing = candidateBestAttemptsMap.get(studentKey);
      if (!existing) {
        candidateBestAttemptsMap.set(studentKey, att);
      } else {
        const existingScore = existing.score ?? 0;
        const currentScore = att.score ?? 0;
        if (
          currentScore > existingScore ||
          (currentScore === existingScore && (att.timeSpentSeconds ?? 0) < (existing.timeSpentSeconds ?? 0))
        ) {
          candidateBestAttemptsMap.set(studentKey, att);
        }
      }
    }

    const eligibleCandidates = Array.from(candidateBestAttemptsMap.values()).sort((a, b) => {
      const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      const timeDiff = (a.timeSpentSeconds ?? 0) - (b.timeSpentSeconds ?? 0);
      if (timeDiff !== 0) return timeDiff;
      const dateA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const dateB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return dateA - dateB;
    });

    const totalParticipants = Math.max(1, eligibleCandidates.length);

    // Standard competition ranking (1224 ranking) with tie handling
    const targetStudentKey = attempt.studentId ? String(attempt.studentId) : String(attempt.studentUid || attempt.id);
    const candidateBest = candidateBestAttemptsMap.get(targetStudentKey) || attempt;
    const targetScore = candidateBest.score ?? 0;
    const targetTime = candidateBest.timeSpentSeconds ?? 0;
    const targetSubmittedAt = candidateBest.submittedAt ? new Date(candidateBest.submittedAt).getTime() : 0;

    let rank = 1;
    for (const other of eligibleCandidates) {
      const otherKey = other.studentId ? String(other.studentId) : String(other.studentUid || other.id);
      if (otherKey === targetStudentKey) continue;
      const otherScore = other.score ?? 0;
      const otherTime = other.timeSpentSeconds ?? 0;
      const otherSubmittedAt = other.submittedAt ? new Date(other.submittedAt).getTime() : 0;

      if (
        otherScore > targetScore ||
        (otherScore === targetScore && otherTime < targetTime) ||
        (otherScore === targetScore && otherTime === targetTime && otherSubmittedAt < targetSubmittedAt)
      ) {
        rank++;
      }
    }

    const topPercent = Math.max(1, Math.round((rank / totalParticipants) * 100));
    const percentile = `Top ${topPercent}%`;

    // Populate question details for responses in a single batched query (eliminates N+1)
    const responses = Array.isArray(attempt.responses) ? attempt.responses : [];
    const questionIds = Array.from(
      new Set(
        responses
          .map((r: any) => r.questionId)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
      ),
    );

    const questionsList =
      questionIds.length > 0
        ? await this.questionRepo.find({
            where: [{ id: In(questionIds) }, { mongoId: In(questionIds) }],
          })
        : [];

    const questionMap = new Map<string, Question>();
    for (const q of questionsList) {
      if (q.id) questionMap.set(q.id, q);
      if (q.mongoId) questionMap.set(q.mongoId, q);
    }

    const questions = responses.map((resp: any) => {
      const q = resp.questionId ? questionMap.get(resp.questionId) || null : null;
      const item: {
        id: string;
        title: string;
        difficulty: string;
        status: 'Passed' | 'Failed' | 'Partial';
        points: number;
      } = {
        id: String(resp.questionId || 'unknown'),
        title: q?.title ? q.title : 'Assessment Question',
        difficulty: q?.difficulty ? q.difficulty : 'Medium',
        status: resp.isCorrect ? 'Passed' : resp.marksAwarded > 0 ? 'Partial' : 'Failed',
        points: Number(resp.marksAwarded || 0),
      };
      return item;
    });

    const resultData: StudentResult = {
      studentName,
      studentEmail,
      rollNumber: studentUid,
      studentId: studentUid,
      institution,
      program,
      examName: assessment.title,
      attemptId: attempt.id,
      attemptStatus: attempt.status,
      dateTaken: attempt.startedAt
        ? new Date(attempt.startedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'Unknown Date',
      score: attempt.score || 0,
      maxScore: attempt.maxScore || 100,
      duration: `${Math.floor((attempt.timeSpentSeconds || 0) / 60)}m ${(attempt.timeSpentSeconds || 0) % 60}s`,
      rank,
      totalParticipants,
      percentile,
      verificationStatus: (attempt as any).candidateVerification?.status === 'verified' ? 'VERIFIED' : 'PROCTORED',
      questions,
    };

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="result-${studentUid || attempt.id}.pdf"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    try {
      const stream = await renderToStream(
        React.createElement(StudentResultReport, { result: resultData }) as any,
      );
      stream.pipe(res);
    } catch (error) {
      this.logger.error('Error generating PDF report', error);
      res.status(500).send('Error generating PDF');
    }
  }
}
