
import { canonicalLanguage } from '../execution/execution.types';
import { PistonUnavailableError } from '../execution/piston/piston.types';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, LessThan } from 'typeorm';
import { Assessment } from '../database/entities/assessment.entity';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { CandidateExamAccommodation } from '../database/entities/candidate-exam-accommodation.entity';
import { Question } from '../database/entities/question.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
import { calculateStateDiff } from '../audit/object-diff.util';
import { User } from '../database/entities/user.entity';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';
import { UpsertAccommodationDto, GrantExtraTimeDto, GradeHoldDto } from './dto/accommodations.dto';
import { ExecutionService } from '../execution/execution.service';
import { ExecutionAdmissionService } from '../execution/admission/execution-admission.service';
import { randomUUID } from 'node:crypto';
import { S3Service } from '../s3/s3.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EvaluateAssessmentCodeDto } from './dto/evaluate-code.dto';
import { normalizeSectionIdentifier } from '../common/constants/sections.constant';
import { ExamSecurityService } from '../exam-security/exam-security.service';
import {
  ExecutionJobType,
  ExecutionPriority,
} from '../code-execution/priority-lanes';
import { RedisService } from '../redis/redis.service';

function codingTestCases(question: Question): Array<{ id: string | number; input: string; expected: string; isHidden: boolean }> {
  const cases = question.testCases?.length ? question.testCases : (question.metadata as any)?.testCases || [];
  return cases.map((tc: any, index: number) => ({
    id: tc.id || index + 1, input: tc.input || '',
    expected: tc.expectedOutput ?? tc.output ?? tc.expected ?? '', isHidden: tc.isHidden === true,
  }));
}

function normalizeStarterCode(
  starterCode: any,
  metadata?: any,
  codeSnippet?: string,
  code?: string,
  language?: string,
): Array<{ language: string; code: string }> {
  if (Array.isArray(starterCode) && starterCode.length > 0) {
    return starterCode.map((item: any) => ({
      language: String(item.language || item.lang || 'python'),
      code: String(item.code ?? item.sourceCode ?? item.starterCode ?? ''),
    }));
  }

  if (starterCode && typeof starterCode === 'object' && !Array.isArray(starterCode)) {
    const entries = Object.entries(starterCode).filter(([_, c]) => typeof c === 'string' && c.trim().length > 0);
    if (entries.length > 0) {
      return entries.map(([lang, c]) => ({
        language: lang,
        code: String(c),
      }));
    }
  }

  const metaStarter = metadata?.starterCode;
  if (Array.isArray(metaStarter) && metaStarter.length > 0) {
    return metaStarter.map((item: any) => ({
      language: String(item.language || item.lang || 'python'),
      code: String(item.code ?? item.sourceCode ?? item.starterCode ?? ''),
    }));
  }
  if (metaStarter && typeof metaStarter === 'object') {
    const entries = Object.entries(metaStarter).filter(([_, c]) => typeof c === 'string' && c.trim().length > 0);
    if (entries.length > 0) {
      return entries.map(([lang, c]) => ({
        language: lang,
        code: String(c),
      }));
    }
  }

  if (typeof starterCode === 'string' && starterCode.trim().length > 0) {
    return [{ language: language || 'python', code: starterCode }];
  }

  const singleCode = codeSnippet || code || metadata?.codeSnippet || metadata?.code;
  if (singleCode && typeof singleCode === 'string' && singleCode.trim().length > 0) {
    return [{ language: language || 'python', code: singleCode }];
  }

  return [];
}

const MAX_RESUME_ATTEMPTS = 3;

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);
  constructor(
    @InjectRepository(Assessment)
    private readonly assessmentRepo: Repository<Assessment>,
    @InjectRepository(AssessmentAttempt)
    private readonly attemptRepo: Repository<AssessmentAttempt>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @Optional()
    private readonly executionService?: ExecutionService,
    @Optional() private readonly admission?: ExecutionAdmissionService,
    @Optional()
    private readonly s3Service?: S3Service,
    @Optional() @InjectQueue('submissions') private readonly codeQueue?: Queue,
    @Optional()
    @InjectRepository(User)
    private readonly userRepo?: Repository<User>,
    @Optional()
    private readonly examSecurityService?: ExamSecurityService,
    @Optional()
    private readonly redisService?: RedisService,
    @Optional()
    @InjectRepository(CandidateExamAccommodation)
    private readonly accommodationRepo?: Repository<CandidateExamAccommodation>,
  ) {}

  private attemptExpiresAt(assessment: Assessment, attempt: AssessmentAttempt): Date {
    const extraMinutes =
      Number((attempt as any)?.extraTimeMinutes) ||
      Number(attempt?.extraTimeGrantedMinutes) ||
      0;
    const timeMultiplier = Number((attempt as any)?.timeMultiplier) || 1.0;
    const baseDuration =
      Number(assessment.durationMinutes) > 0
        ? Number(assessment.durationMinutes)
        : 45;
    const durationMinutes = baseDuration * timeMultiplier + extraMinutes;
    const startedAtTime = attempt.startedAt
      ? new Date(attempt.startedAt).getTime()
      : Date.now();
    const durationDeadline = startedAtTime + durationMinutes * 60_000;
    const windowDeadline = assessment.endTime
      ? new Date(assessment.endTime).getTime() + extraMinutes * 60_000
      : Infinity;
    return new Date(Math.min(durationDeadline, windowDeadline));
  }

  isAttemptExpired(assessment: Assessment, attempt: AssessmentAttempt): boolean {
    if (attempt.status !== 'in_progress') {
      return false;
    }
    const expiresAt = this.attemptExpiresAt(assessment, attempt);
    return Date.now() >= expiresAt.getTime();
  }

  async autoFinalizeAttempt(
    assessment: Assessment,
    attempt: AssessmentAttempt,
    targetStatus: 'timed_out' | 'auto_submitted' = 'timed_out',
  ): Promise<AssessmentAttempt> {
    if (attempt.status !== 'in_progress' && attempt.status !== 'evaluating') {
      return attempt;
    }

    if (attempt.status === 'in_progress' && typeof this.attemptRepo.update === 'function') {
      const transitionResult = await this.attemptRepo.update(
        { id: attempt.id, status: 'in_progress' },
        { status: 'evaluating' as any },
      );
      if (transitionResult && transitionResult.affected === 0) {
        const reloaded = await this.attemptRepo.findOne({ where: { id: attempt.id } });
        return reloaded || attempt;
      }
    }
    attempt.status = 'evaluating' as any;

    try {
      const questionIds = assessment.questions || [];
      const questions =
        questionIds.length > 0
          ? await this.questionRepo.find({
              where: [{ id: In(questionIds) }, { mongoId: In(questionIds) }],
            })
          : [];
      const questionMap = new Map(questions.map((q) => [q.id, q]));

      const rawResponses = Array.isArray(attempt.responses) ? attempt.responses : [];
      const responseMap = new Map<string, any>(
        rawResponses.map((r: any) => [String(r.questionId), r]),
      );

      const orderedQuestionIds =
        Array.isArray(attempt.questionOrder) && attempt.questionOrder.length > 0
          ? attempt.questionOrder
          : questionIds;

      const evaluatedResponses = await Promise.all(
        orderedQuestionIds.map(async (qIdStr) => {
          const qId = String(qIdStr);
          const q = questionMap.get(qId);
          const r = responseMap.get(qId) || { questionId: qId };

          if (!q) {
            return {
              questionId: qId,
              selectedAnswer: r.selectedAnswer ?? -1,
              isCorrect: false,
              marksAwarded: 0,
              timeSpentSeconds: r.timeSpentSeconds || 0,
              status: 'skipped',
              isAttempted: false,
              partialCredit: false,
            };
          }

          const qType = (q.questionType || '').toLowerCase();
          const optionOrder = this.getQuestionOptionOrderByQuestionId(attempt, q.id);
          const selectedAnswer = this.mapDisplayedAnswerToCanonical(
            r.selectedAnswer,
            optionOrder,
          ) as number | undefined;
          const selectedAnswers = this.mapDisplayedAnswerToCanonical(
            r.selectedAnswers,
            optionOrder,
          ) as number[] | undefined;
          const isCoding =
            qType === 'coding' || qType === 'algorithmic' || qType === 'dsa';

          let isAttempted = false;
          let isCorrect = false;
          let marksAwarded = 0;
          let testCasesPassed = 0;
          let totalTestCases = 0;
          let partialCredit = false;

          if (isCoding) {
            const hasCode = r.code && typeof r.code === 'string' && r.code.trim().length > 0;
            if (hasCode) {
              isAttempted = true;
              const testCases = codingTestCases(q);
              totalTestCases = testCases.length;

              if (this.executionService && totalTestCases > 0) {
                try {
                  const tcInputs = testCases.map((tc, idx) => ({
                    id: tc.id || idx + 1,
                    input: tc.input || '',
                    expected: tc.expected,
                  }));
                  const results = await this.executionService.runCode(
                    r.code,
                    r.language || 'python',
                    tcInputs,
                    { timeLimit: Math.min(q.timeLimit || 2, 2), memoryLimit: q.memoryLimit },
                  );
                  testCasesPassed = results.filter((res) => res.passed).length;
                } catch (execErr: any) {
                  this.logger.warn({
                    message: `Auto-finalize code execution skipped or failed for question ${q.id}`,
                    error: execErr?.message || String(execErr),
                  });
                  testCasesPassed = 0;
                }
              } else {
                testCasesPassed = 0;
              }

              const ratio =
                totalTestCases > 0
                  ? Math.min(1, Math.max(0, testCasesPassed / totalTestCases))
                  : 0;
              marksAwarded = Math.round(ratio * (q.marks || 5) * 10) / 10;
              isCorrect = ratio >= 0.99;
              partialCredit = ratio > 0 && !isCorrect;
            }
          } else {
            const isMulti =
              qType === 'multiple_choice' ||
              (Array.isArray(q.correctAnswers) && q.correctAnswers.length > 0);

            if (isMulti) {
              const selectedList = Array.isArray(selectedAnswers)
                ? selectedAnswers
                : selectedAnswer !== undefined && selectedAnswer >= 0
                  ? [selectedAnswer]
                  : [];
              isAttempted = selectedList.length > 0;
              if (isAttempted) {
                const correctList = Array.isArray(q.correctAnswers)
                  ? q.correctAnswers
                  : [q.correctAnswer];
                const sortedSelected = [...selectedList].sort((a, b) => a - b);
                const sortedCorrect = [...correctList].sort((a, b) => a - b);
                isCorrect =
                  sortedSelected.length === sortedCorrect.length &&
                  sortedSelected.every((val, idx) => val === sortedCorrect[idx]);

                if (isCorrect) {
                  marksAwarded = q.marks || 1;
                } else {
                  const negMarks = assessment.negativeMarking
                    ? q.negativeMarks || 0
                    : 0;
                  marksAwarded = negMarks > 0 ? -negMarks : 0;
                }
              }
            } else {
              isAttempted = selectedAnswer !== undefined && selectedAnswer >= 0;
              if (isAttempted) {
                isCorrect = selectedAnswer === q.correctAnswer;
                if (isCorrect) {
                  marksAwarded = q.marks || 1;
                } else {
                  const negMarks = assessment.negativeMarking
                    ? q.negativeMarks || 0
                    : 0;
                  marksAwarded = negMarks > 0 ? -negMarks : 0;
                }
              }
            }
          }

          return {
            questionId: q.id,
            selectedAnswer: selectedAnswer ?? -1,
            selectedAnswers,
            optionOrder,
            code: r.code || '',
            language: r.language || 'python',
            testCasesPassed,
            totalTestCases,
            isCorrect,
            marksAwarded,
            timeSpentSeconds: r.timeSpentSeconds || 0,
            status: isAttempted ? 'answered' : 'skipped',
            isAttempted,
            partialCredit,
          };
        }),
      );

      let totalScore = 0;
      let totalAttempted = 0;
      let totalCorrect = 0;
      let totalWrong = 0;
      let totalSkipped = 0;

      for (const er of evaluatedResponses) {
        totalScore += er.marksAwarded;
        if (er.isAttempted) {
          totalAttempted++;
          if (er.isCorrect || er.partialCredit) {
            totalCorrect++;
          } else {
            totalWrong++;
          }
        } else {
          totalSkipped++;
        }
      }

      const maxScore = assessment.totalMarks || 1;
      const rawScore = Math.min(
        maxScore,
        Math.max(0, Math.round(totalScore * 100) / 100),
      );

      const violations = Array.isArray(attempt.violations) ? attempt.violations : [];
      const penaltyPerViolation =
        Number(assessment.proctoring?.violationPenaltyMarks) || 0;
      const isPartialProctored =
        assessment.proctoring?.mode === 'partial_proctored' ||
        (!assessment.proctoring?.autoSubmitOnViolation && penaltyPerViolation > 0);
      const proctoringPenalty = isPartialProctored
        ? Math.round(violations.length * penaltyPerViolation * 100) / 100
        : 0;

      const finalScore = Math.max(
        0,
        Math.round((rawScore - proctoringPenalty) * 100) / 100,
      );
      const percentage = Math.round((finalScore / maxScore) * 1000) / 10;
      const passed = finalScore >= (assessment.passingMarks || 0);
      const accuracy =
        totalAttempted > 0
          ? Math.round((totalCorrect / totalAttempted) * 100)
          : 0;

      const tabSwitches = violations.filter(
        (v: any) => v.type === 'tab_switch',
      ).length;
      const fullscreenExits = violations.filter(
        (v: any) => v.type === 'fullscreen_exit',
      ).length;

      const studentId = attempt.studentId;
      const prevAttempts = studentId
        ? await this.attemptRepo.find({
            where: [
              {
                assessmentId: assessment.id,
                studentId,
                status: In(['submitted', 'auto_submitted', 'timed_out']),
                id: Not(attempt.id),
              },
            ],
          })
        : [];

      const prevMax =
        prevAttempts.length > 0
          ? Math.max(...prevAttempts.map((a) => a.score || 0))
          : 0;
      const finalHighestScore = Math.max(finalScore, prevMax);

      const durationSeconds = (assessment.durationMinutes || 45) * 60;
      const elapsedSeconds = attempt.startedAt
        ? Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000)
        : durationSeconds;
      const timeSpentSeconds = attempt.timeSpentSeconds
        ? Math.max(attempt.timeSpentSeconds, Math.min(elapsedSeconds, durationSeconds))
        : Math.min(elapsedSeconds, durationSeconds);

      attempt.status = targetStatus;
      attempt.submittedAt = attempt.submittedAt || new Date();
      attempt.timeSpentSeconds = timeSpentSeconds;
      attempt.responses = evaluatedResponses;
      attempt.rawScore = rawScore;
      attempt.proctoringPenalty = proctoringPenalty;
      attempt.score = finalScore;
      attempt.highestScore = finalHighestScore;
      attempt.maxScore = maxScore;
      attempt.percentage = percentage;
      attempt.passed = passed || prevMax >= (assessment.passingMarks || 0);
      attempt.totalAttempted = totalAttempted;
      attempt.totalCorrect = totalCorrect;
      attempt.totalWrong = totalWrong;
      attempt.totalSkipped = totalSkipped;
      attempt.accuracy = accuracy;
      attempt.tabSwitchCount = tabSwitches;
      attempt.fullscreenExitCount = fullscreenExits;
      attempt.submissionPolicy = 'auto';

      await this.attemptRepo.save(attempt);

      this.logger.log({
        event: 'ASSESSMENT_ATTEMPT_AUTO_FINALIZED',
        assessmentId: assessment.id,
        attemptId: attempt.id,
        studentId,
        score: finalScore,
        percentage,
        passed: attempt.passed,
        status: attempt.status,
      });

      return attempt;
    } catch (err) {
      this.logger.error({
        message: `Failed to auto-finalize attempt ${attempt.id}`,
        error: (err as any)?.message || String(err),
      });
      attempt.status = targetStatus;
      attempt.submittedAt = attempt.submittedAt || new Date();
      attempt.submissionPolicy = 'auto';
      await this.attemptRepo.save(attempt);
      return attempt;
    }
  }

  private resumeDetails(assessment: Assessment, attempt: AssessmentAttempt) {
    const resumeAttemptsUsed = Math.max(0, attempt.resumeCount || 0);
    return {
      attemptExpiresAt: this.attemptExpiresAt(assessment, attempt),
      resumeAttemptsUsed,
      resumeAttemptsRemaining: Math.max(0, MAX_RESUME_ATTEMPTS - resumeAttemptsUsed),
      maxResumeAttempts: MAX_RESUME_ATTEMPTS,
    };
  }

  private shuffleList<T>(items: T[]): T[] {
    const next = [...items];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  private isOptionShuffledQuestion(question: Question | null | undefined): boolean {
    if (!question || !Array.isArray(question.options) || question.options.length < 2) {
      return false;
    }

    const qType = String(question.questionType || '').toLowerCase();
    if (['coding', 'algorithmic', 'dsa', 'subjective', 'descriptive', 'essay', 'short_answer', 'fill_in_the_blank', 'matching'].includes(qType)) {
      return false;
    }

    return true;
  }

  private buildOptionOrder(question: Question | null | undefined): number[] | null {
    if (!this.isOptionShuffledQuestion(question)) {
      return null;
    }

    const options = question?.options ?? [];
    const order = options.map((_, index) => index);
    return this.shuffleList(order);
  }

  private getQuestionOptionOrderByQuestionId(attempt: any, questionId: string): number[] | null {
    const response = (attempt?.responses || []).find((item: any) => String(item.questionId) === String(questionId));
    const optionOrder = response?.optionOrder;
    return Array.isArray(optionOrder) && optionOrder.length > 0 ? optionOrder : null;
  }

  private mapDisplayedAnswerToCanonical(
    selectedAnswer: number | number[] | undefined,
    optionOrder: number[] | null,
  ): number | number[] | undefined {
    if (selectedAnswer === undefined || selectedAnswer === null) {
      return selectedAnswer;
    }

    if (Array.isArray(selectedAnswer)) {
      return selectedAnswer.map((value) => {
        if (value === undefined || value === null || value < 0) return value;
        if (optionOrder && value < optionOrder.length) return optionOrder[value];
        return value;
      });
    }

    if (selectedAnswer < 0) {
      return selectedAnswer;
    }

    if (optionOrder && selectedAnswer < optionOrder.length) {
      return optionOrder[selectedAnswer];
    }

    return selectedAnswer;
  }

  private validateNoDuplicateQuestionIds(questionIds: string[]) {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    questionIds.forEach((questionId) => {
      const normalized = String(questionId || '').trim();
      if (!normalized) return;
      if (seen.has(normalized)) {
        duplicates.add(normalized);
        return;
      }
      seen.add(normalized);
    });

    if (duplicates.size > 0) {
      throw new BadRequestException(
        `Duplicate questions detected across the assessment: ${Array.from(duplicates).join(', ')}`,
      );
    }
  }

  private normalizeDifficulty(value?: string): 'easy' | 'medium' | 'hard' {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized.startsWith('e')) return 'easy';
    if (normalized.startsWith('h')) return 'hard';
    return 'medium';
  }

  private calculateDifficultyTargets(total: number): Record<'easy' | 'medium' | 'hard', number> {
    const raw = {
      easy: total * 0.3,
      medium: total * 0.4,
      hard: total * 0.3,
    };

    const targets = {
      easy: Math.floor(raw.easy),
      medium: Math.floor(raw.medium),
      hard: Math.floor(raw.hard),
    };

    let remainder = total - (targets.easy + targets.medium + targets.hard);
    const levelOrder: Array<'easy' | 'medium' | 'hard'> = ['easy', 'medium', 'hard'];
    const order = [...levelOrder].sort(
      (left: 'easy' | 'medium' | 'hard', right: 'easy' | 'medium' | 'hard') =>
        (raw[right] - Math.floor(raw[right])) - (raw[left] - Math.floor(raw[left])),
    );

    while (remainder > 0) {
      const nextLevel =
        order[(targets.easy + targets.medium + targets.hard + remainder) % order.length] ?? 'medium';
      targets[nextLevel] += 1;
      remainder -= 1;
    }

    return targets;
  }

  private buildDifficultyBalancedQuestionIds(
    questions: Array<Pick<Question, 'id' | 'difficulty'>>,
    targetCount: number,
  ): string[] {
    const safeTarget = Math.max(0, Math.min(targetCount, questions.length));
    if (safeTarget === 0 || questions.length === 0) {
      return [];
    }

    const grouped = {
      easy: [] as Array<Pick<Question, 'id' | 'difficulty'>>,
      medium: [] as Array<Pick<Question, 'id' | 'difficulty'>>,
      hard: [] as Array<Pick<Question, 'id' | 'difficulty'>>,
    };

    questions.forEach((question) => {
      const difficulty = this.normalizeDifficulty(question.difficulty);
      grouped[difficulty].push(question);
    });

    const targets = this.calculateDifficultyTargets(safeTarget);
    const selected: Array<Pick<Question, 'id' | 'difficulty'>> = [];

    (['easy', 'medium', 'hard'] as const).forEach((level) => {
      const quota = Math.min(targets[level], grouped[level].length);
      const tierChoices = this.shuffleList(grouped[level]).slice(0, quota);
      selected.push(...tierChoices);
      grouped[level] = grouped[level].filter((question) => !tierChoices.some((choice) => choice.id === question.id));
    });

    if (selected.length < safeTarget) {
      const remaining = this.shuffleList(
        questions.filter((question) => !selected.some((choice) => choice.id === question.id)),
      );
      selected.push(...remaining.slice(0, safeTarget - selected.length));
    }

    const finalSelected = this.shuffleList(selected);
    const counts = { easy: 0, medium: 0, hard: 0 };
    finalSelected.forEach((question) => {
      const level = this.normalizeDifficulty(question.difficulty);
      counts[level] += 1;
    });

    const targetMatch = counts.easy === targets.easy && counts.medium === targets.medium && counts.hard === targets.hard;
    if (!targetMatch) {
      console.warn(
        '[Assessment] Difficulty-balanced question selection could not fully match the 30/40/30 target. ' +
        `Targeted=${JSON.stringify(targets)} Actual=${JSON.stringify(counts)} Available=${JSON.stringify({
          easy: grouped.easy.length + counts.easy,
          medium: grouped.medium.length + counts.medium,
          hard: grouped.hard.length + counts.hard,
        })}`,
      );
    }

    return finalSelected.map((question) => question.id);
  }

  private isCodingQuestion(q: Question): boolean {
    const qType = (q.questionType || '').toLowerCase();
    if (['coding', 'algorithmic', 'dsa'].includes(qType)) return true;
    if ((!q.options || q.options.length === 0) && Boolean(q.starterCode || q.codeSnippet)) return true;
    return false;
  }

  private buildSectionOrderedQuestionIds(
    assessment: Assessment,
    questionsList: Question[],
  ): {
    orderedIds: string[];
    questionSectionMap: Map<string, { sectionId: string; sectionTitle: string; sectionOrder: number }>;
    resolvedSections: Array<{ id: string; title: string; order: number; questionCount: number }>;
  } {
    const qMap = new Map(questionsList.map((q) => [String(q.id), q]));
    const shouldShuffle = assessment.shuffleQuestions !== false;
    const questionSectionMap = new Map<string, { sectionId: string; sectionTitle: string; sectionOrder: number }>();
    const resolvedSections: Array<{ id: string; title: string; order: number; questionCount: number }> = [];
    const orderedIds: string[] = [];

    const rawSections = Array.isArray(assessment.sections) ? assessment.sections : [];
    const validSections = rawSections
      .filter((s) => s && Array.isArray(s.questions) && s.questions.length > 0)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    if (validSections.length > 0) {
      // 1. Explicit sections defined on the assessment:
      // Questions remain segregated within their owning section. Shuffling stays strictly within each section.
      validSections.forEach((sec, idx) => {
        const secTitle = sec.title?.trim() || `Section ${String.fromCharCode(65 + idx)}`;
        const secId = String(sec.order !== undefined ? sec.order : idx);
        const secOrder = Number(sec.order !== undefined ? sec.order : idx);
        const secQuestionIds = (sec.questions || [])
          .map((q: any) => String(q.questionId))
          .filter((qId: string) => qMap.has(qId));

        if (secQuestionIds.length > 0) {
          const sectionOrderedIds = shouldShuffle
            ? this.shuffleList(secQuestionIds)
            : secQuestionIds;

          sectionOrderedIds.forEach((qId) => {
            questionSectionMap.set(qId, {
              sectionId: secId,
              sectionTitle: secTitle,
              sectionOrder: secOrder,
            });
            orderedIds.push(qId);
          });

          resolvedSections.push({
            id: secId,
            title: secTitle,
            order: secOrder,
            questionCount: sectionOrderedIds.length,
          });
        }
      });

      // Handle any assessment questions not explicitly mapped to a section
      const unassigned = questionsList.filter((q) => !questionSectionMap.has(String(q.id)));
      if (unassigned.length > 0) {
        const unassignedIds = shouldShuffle
          ? this.shuffleList(unassigned.map((q) => String(q.id)))
          : unassigned.map((q) => String(q.id));
        const extraSectionTitle = 'General';
        const extraSectionOrder = resolvedSections.length;
        unassignedIds.forEach((qId) => {
          questionSectionMap.set(qId, {
            sectionId: `sec-${extraSectionOrder}`,
            sectionTitle: extraSectionTitle,
            sectionOrder: extraSectionOrder,
          });
          orderedIds.push(qId);
        });
        resolvedSections.push({
          id: `sec-${extraSectionOrder}`,
          title: extraSectionTitle,
          order: extraSectionOrder,
          questionCount: unassignedIds.length,
        });
      }
    } else {
      // 2. No explicit multi-section structure.
      // If assessment contains both MCQ and coding questions, keep sections segregated so shuffling does not mix them.
      const mcqs = questionsList.filter((q) => !this.isCodingQuestion(q));
      const codings = questionsList.filter((q) => this.isCodingQuestion(q));

      if (mcqs.length > 0 && codings.length > 0) {
        const mcqOrderedIds = shouldShuffle
          ? this.shuffleList(mcqs.map((q) => String(q.id)))
          : mcqs.map((q) => String(q.id));

        mcqOrderedIds.forEach((qId) => {
          questionSectionMap.set(qId, {
            sectionId: 'sec-mcq',
            sectionTitle: 'Multiple Choice Questions',
            sectionOrder: 0,
          });
          orderedIds.push(qId);
        });
        resolvedSections.push({
          id: 'sec-mcq',
          title: 'Multiple Choice Questions',
          order: 0,
          questionCount: mcqOrderedIds.length,
        });

        const codingOrderedIds = shouldShuffle
          ? this.shuffleList(codings.map((q) => String(q.id)))
          : codings.map((q) => String(q.id));

        codingOrderedIds.forEach((qId) => {
          questionSectionMap.set(qId, {
            sectionId: 'sec-coding',
            sectionTitle: 'Coding Challenges',
            sectionOrder: 1,
          });
          orderedIds.push(qId);
        });
        resolvedSections.push({
          id: 'sec-coding',
          title: 'Coding Challenges',
          order: 1,
          questionCount: codingOrderedIds.length,
        });
      } else {
        // Purely single-type assessment without explicit sections:
        // Use difficulty-balanced selection or section-local shuffle.
        const allIds = shouldShuffle
          ? this.buildDifficultyBalancedQuestionIds(
              questionsList,
              Math.min(questionsList.length, assessment.questions?.length || questionsList.length),
            )
          : questionsList.map((q) => String(q.id));

        const singleSectionTitle = codings.length > 0 ? 'Coding Challenges' : 'Questions';
        allIds.forEach((qId) => {
          questionSectionMap.set(qId, {
            sectionId: 'sec-1',
            sectionTitle: singleSectionTitle,
            sectionOrder: 0,
          });
          orderedIds.push(qId);
        });
        resolvedSections.push({
          id: 'sec-1',
          title: singleSectionTitle,
          order: 0,
          questionCount: allIds.length,
        });
      }
    }

    return { orderedIds, questionSectionMap, resolvedSections };
  }

  private async selectQuestionsForCreation(
    selection: {
      topic: string;
      easyCount: number;
      mediumCount: number;
      hardCount: number;
    },
    excludedIds: Set<string>,
  ): Promise<Question[]> {
    const topic = String(selection.topic || '').trim();
    const requested = {
      easy: Number(selection.easyCount),
      medium: Number(selection.mediumCount),
      hard: Number(selection.hardCount),
    };
    const total = requested.easy + requested.medium + requested.hard;

    if (!topic || total <= 0 || Object.values(requested).some((count) => !Number.isInteger(count) || count < 0)) {
      throw new BadRequestException('Auto-selection requires a topic and non-negative whole-number difficulty counts, with at least one question.');
    }

    const candidates = await this.questionRepo.find({
      where: { topic, status: 'approved' },
    });
    const available = {
      easy: [] as Question[],
      medium: [] as Question[],
      hard: [] as Question[],
    };

    candidates.forEach((question) => {
      const ids = [question.id, question.mongoId].filter(Boolean).map(String);
      if (ids.some((id) => excludedIds.has(id))) return;
      const difficulty = String(question.difficulty || '').trim().toLowerCase();
      if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') {
        available[difficulty].push(question);
      }
    });

    const insufficient = (['easy', 'medium', 'hard'] as const).filter(
      (level) => available[level].length < requested[level],
    );
    if (insufficient.length > 0) {
      throw new BadRequestException(
        `Not enough approved questions in topic '${topic}' for the requested difficulty counts.`,
      );
    }

    return (['easy', 'medium', 'hard'] as const).flatMap((level) =>
      this.shuffleList(available[level]).slice(0, requested[level]),
    );
  }

  // -------------------------------------------------------------
  // ADMIN METHODS
  // -------------------------------------------------------------

  async create(
    dto: CreateAssessmentDto,
    adminUser: any,
    ip = '',
    userAgent = '',
  ) {
    let questionObjIds: string[] = [];
    let totalMarks = 0;
    const sectionsToSave: any[] = [];

    if (dto.sections && dto.sections.length > 0) {
      const excludedIds = new Set(
        dto.sections
          .filter((section) => !section.autoSelection)
          .flatMap((section) => section.questions.map((question) => String(question.questionId))),
      );

      for (const sec of dto.sections) {
        let questionsToSave: Array<{
          questionId: string;
          marks: number;
          negativeMarks: number;
          order: number;
        }>;

        if (sec.autoSelection) {
          const selectedQuestions = await this.selectQuestionsForCreation(sec.autoSelection, excludedIds);
          questionsToSave = selectedQuestions.map((question, index) => {
            excludedIds.add(String(question.id));
            if (question.mongoId) excludedIds.add(String(question.mongoId));
            return {
              questionId: String(question.id),
              marks: question.marks || 1,
              negativeMarks: question.negativeMarks || 0,
              order: index,
            };
          });
        } else {
          questionsToSave = sec.questions.map((question) => ({
            questionId: String(question.questionId),
            marks: question.marks || 1,
            negativeMarks: question.negativeMarks || 0,
            order: question.order || 0,
          }));
        }

        questionsToSave.forEach((q) => {
          questionObjIds.push(String(q.questionId));
          totalMarks += q.marks || 1;
        });
        sectionsToSave.push({
          title: sec.title,
          description: sec.description || '',
          order: sec.order || 0,
          timeLimit: sec.timeLimit || 0,
          autoSelection: sec.autoSelection,
          questions: questionsToSave,
        });
      }
    } else if (dto.questionIds && dto.questionIds.length > 0) {
      questionObjIds = dto.questionIds.map((id) => String(id));
      const questions = await this.questionRepo.find({
        where: [{ id: In(questionObjIds) }, { mongoId: In(questionObjIds) }],
      });
      totalMarks = questions.reduce((sum, q) => sum + (q.marks || 1), 0);
    } else {
      throw new BadRequestException(
        'At least one section or question must be provided.',
      );
    }

    this.validateNoDuplicateQuestionIds(questionObjIds);

    if (questionObjIds.length > 0) {
      const qCount = await this.questionRepo.count({
        where: [{ id: In(questionObjIds) }, { mongoId: In(questionObjIds) }],
      });
      if (qCount !== questionObjIds.length) {
        throw new BadRequestException(
          'One or more valid questions could not be found.',
        );
      }
    }

    const passingMarks = dto.passingMarks ?? Math.ceil(totalMarks * 0.4);

    const code = (dto.code || `TEST-${Date.now().toString().slice(-6)}`)
      .toUpperCase()
      .trim();

    const existingCode = await this.assessmentRepo.findOne({ where: { code } });
    if (existingCode) {
      throw new BadRequestException(
        `Assessment code '${code}' is already in use.`,
      );
    }

    if (dto.startTime && dto.endTime && new Date(dto.startTime) >= new Date(dto.endTime)) {
      throw new BadRequestException('Assessment end time must be later than its start time.');
    }

    const assessment = this.assessmentRepo.create({
      title: dto.title.trim(),
      code,
      description: dto.description || '',
      type: dto.type || 'mcq',
      category: dto.category || 'exam',
      durationMinutes: dto.durationMinutes,
      totalMarks,
      passingMarks,
      negativeMarking: dto.negativeMarking ?? true,
      questions: questionObjIds,
      targetBatches: dto.targetBatches || [],
      targetDepartments: dto.targetDepartments || [],
      targetCourses: dto.targetCourses || [],
      targetSections: this.normalizeTargetSections(dto.targetSections),
      targetGroups: this.normalizeTargetGroups(dto.targetGroups || []),
      targetStudentIds: dto.targetStudentIds || [],
      targetSemesters: dto.targetSemesters || [],
      startTime: dto.startTime ? new Date(dto.startTime) : undefined,
      endTime: dto.endTime ? new Date(dto.endTime) : undefined,
      shuffleQuestions: dto.shuffleQuestions ?? true,
      shuffleOptions: dto.shuffleOptions ?? true,
      showResultImmediately: dto.showResultImmediately ?? true,
      allowReview: dto.allowReview ?? true,
      lockSectionsSequentially: dto.lockSectionsSequentially ?? false,
      allowVirtualMachine: dto.allowVirtualMachine ?? false,
      requireLockdown: dto.requireLockdown ?? (dto as any).securityPolicy?.requireSEB ?? false,
      lockdownQuitPassword: dto.lockdownQuitPassword ?? (dto as any).securityPolicy?.lockdownQuitPassword,
      allowCalculators: dto.allowCalculators ?? (dto as any).securityPolicy?.allowCalculators ?? false,
      allowScratchpad: dto.allowScratchpad ?? (dto as any).securityPolicy?.allowScratchpad ?? true,
      allowReferenceDoc: dto.allowReferenceDoc ?? (dto as any).securityPolicy?.allowReferenceDoc ?? false,
      referencePdfUrl: dto.referencePdfUrl ?? (dto as any).securityPolicy?.referencePdfUrl,
      requireCloseOtherApps: dto.requireCloseOtherApps ?? (dto as any).securityPolicy?.requireCloseOtherApps ?? true,
      allowSpellCheck: dto.allowSpellCheck ?? (dto as any).securityPolicy?.allowSpellCheck ?? false,
      allowFindOnPage: dto.allowFindOnPage ?? (dto as any).securityPolicy?.allowFindOnPage ?? true,
      allowedUrlPatterns: dto.allowedUrlPatterns ?? (dto as any).securityPolicy?.allowedUrlPatterns ?? [],
      enableScreenCaptureSnapshots: dto.enableScreenCaptureSnapshots ?? (dto as any).securityPolicy?.enableScreenCaptureSnapshots ?? false,
      enableForensicWatermark: dto.enableForensicWatermark ?? (dto as any).securityPolicy?.enableForensicWatermark ?? false,
      securityPolicy: {
        ...((dto as any).securityPolicy || {}),
        requireSEB: dto.requireLockdown ?? (dto as any).securityPolicy?.requireSEB ?? false,
        lockdownQuitPassword: dto.lockdownQuitPassword ?? (dto as any).securityPolicy?.lockdownQuitPassword,
        allowCalculators: dto.allowCalculators ?? (dto as any).securityPolicy?.allowCalculators ?? false,
        allowScratchpad: dto.allowScratchpad ?? (dto as any).securityPolicy?.allowScratchpad ?? true,
        allowReferenceDoc: dto.allowReferenceDoc ?? (dto as any).securityPolicy?.allowReferenceDoc ?? false,
        referencePdfUrl: dto.referencePdfUrl ?? (dto as any).securityPolicy?.referencePdfUrl,
        requireCloseOtherApps: dto.requireCloseOtherApps ?? (dto as any).securityPolicy?.requireCloseOtherApps ?? true,
        allowSpellCheck: dto.allowSpellCheck ?? (dto as any).securityPolicy?.allowSpellCheck ?? false,
        allowFindOnPage: dto.allowFindOnPage ?? (dto as any).securityPolicy?.allowFindOnPage ?? true,
        allowedUrlPatterns: dto.allowedUrlPatterns ?? (dto as any).securityPolicy?.allowedUrlPatterns ?? [],
        enableScreenCaptureSnapshots: dto.enableScreenCaptureSnapshots ?? (dto as any).securityPolicy?.enableScreenCaptureSnapshots ?? false,
        enableForensicWatermark: dto.enableForensicWatermark ?? (dto as any).securityPolicy?.enableForensicWatermark ?? false,
      },
      resultDisplaySettings: dto.resultDisplaySettings || {},
      allowedAttempts:
        dto.allowedAttempts !== undefined ? Number(dto.allowedAttempts) : 1,
      mode: dto.proctoring?.mode || 'fully_proctored',
      submissionPolicy:
        dto.proctoring?.mode === 'partial_proctored' ||
        dto.proctoring?.mode === 'non_proctored'
          ? 'manual'
          : 'auto',
      proctoring: {
        mode: dto.proctoring?.mode || 'fully_proctored',
        cameraSelectionPolicy:
          dto.proctoring?.cameraSelectionPolicy || 'student_select',
        violationPenaltyMarks:
          dto.proctoring?.violationPenaltyMarks !== undefined
            ? Number(dto.proctoring.violationPenaltyMarks)
            : dto.proctoring?.mode === 'partial_proctored'
              ? 2
              : 0,
        useCamera:
          dto.proctoring?.mode === 'non_proctored'
            ? false
            : (dto.proctoring?.useCamera ?? true),
        enforceFullscreen:
          dto.proctoring?.mode === 'non_proctored'
            ? false
            : (dto.proctoring?.enforceFullscreen ?? true),
        blockCopyPaste:
          dto.proctoring?.mode === 'non_proctored'
            ? false
            : (dto.proctoring?.blockCopyPaste ?? true),
        detectTabSwitch:
          dto.proctoring?.mode === 'non_proctored'
            ? false
            : (dto.proctoring?.detectTabSwitch ?? true),
        maxTabSwitches: dto.proctoring?.maxTabSwitches ?? 3,
        autoSubmitOnViolation:
          dto.proctoring?.mode === 'partial_proctored'
            ? false
            : dto.proctoring?.mode === 'non_proctored'
              ? false
              : (dto.proctoring?.autoSubmitOnViolation ?? true),
      },
      instructions: dto.instructions || [
        'Ensure a stable internet connection throughout the test duration.',
        'Fullscreen mode is strictly enforced. Leaving fullscreen or switching tabs will be recorded.',
        'Negative marking applies for incorrect answers where specified.',
        'The assessment will automatically submit when the countdown reaches zero.',
      ],
      sections: sectionsToSave,
      status: dto.status || 'draft',
      created_by_id: adminUser?.id || adminUser?._id,
    });

    await this.assessmentRepo.save(assessment);

    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        actorId: adminUser?.id || adminUser?._id,
        actorEmail: adminUser?.email || '',
        action: 'CREATE_ASSESSMENT',
        target: assessment.id,
        targetType: 'Assessment',
        ipAddress: ip,
        userAgent: userAgent,
        metadata: {
          title: assessment.title,
          code: assessment.code,
          questionCount: questionObjIds.length,
          totalMarks,
        },
      }),
    );

    return { ...assessment, _id: assessment.id };
  }

  async findAll(query: any = {}, adminUser?: any) {
    const qb = this.assessmentRepo
      .createQueryBuilder('assessment')
      .leftJoinAndSelect('assessment.createdBy', 'createdBy')
      .orderBy('assessment.createdAt', 'DESC');

    if (adminUser && ['teacher', 'faculty', 'instructor'].includes(adminUser.role)) {
      const facultyId = adminUser.id || adminUser._id;
      if (facultyId) {
        qb.andWhere('assessment.created_by_id = :facultyId', { facultyId });
      }
    }

    if (query.status && query.status !== 'all') {
      qb.andWhere('assessment.status = :status', { status: query.status });
    } else {
      qb.andWhere('assessment.status != :archived', { archived: 'archived' });
    }

    if (query.search && query.search.trim()) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(
        '(assessment.title ILIKE :search OR assessment.code ILIKE :search)',
        { search },
      );
    }

    const rawAssessments = await qb.getMany();
    const assessments = rawAssessments.map((a) => ({
      ...a,
      _id: a.id,
    }));

    return { success: true, assessments, count: assessments.length };
  }

  async findById(id: string, adminUser?: any) {
    const assessment = await this.findAssessmentByIdOrCode(id, { createdBy: true });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (adminUser && ['teacher', 'faculty', 'instructor'].includes(adminUser.role)) {
      const facultyId = adminUser.id || adminUser._id;
      if (facultyId && assessment.created_by_id && assessment.created_by_id !== facultyId) {
        throw new ForbiddenException('You are not authorized to view this assessment');
      }
    }

    // Resolve question details from both legacy top-level IDs and section references.
    const questionIds = Array.from(new Set([
      ...(assessment.questions || []).map(String),
      ...(assessment.sections || []).flatMap((section) =>
        (section.questions || []).map((question) => String(question.questionId)),
      ),
    ]));
    const questionsList: Question[] = questionIds.length
      ? await this.questionRepo.find({
          where: [{ id: In(questionIds) }, { mongoId: In(questionIds) }],
        })
      : [];

    const qMap = new Map<string, Question & { _id: string }>();
    questionsList.forEach((question) => {
      const populated = { ...question, _id: question.id };
      qMap.set(question.id, populated);
      if (question.mongoId) qMap.set(question.mongoId, populated);
    });
    const orderedQuestions = questionIds
      .map((questionId) => qMap.get(questionId))
      .filter((question): question is Question & { _id: string } => Boolean(question))
      .filter((question, index, questions) =>
        questions.findIndex((item) => item.id === question.id) === index,
      );

    const sections = (assessment.sections || []).map((section) => ({
      ...section,
      questions: (section.questions || []).map((question) => ({
        ...question,
        questionId: qMap.get(String(question.questionId)) || question.questionId,
      })),
    }));

    return {
      success: true,
      assessment: {
        ...assessment,
        _id: assessment.id,
        questions: questionsList.map((q) => ({ ...q, _id: q.id })),
        sections,
      },
    };
  }

  async delete(id: string, adminUser: any) {
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    if (adminUser && ['teacher', 'faculty', 'instructor'].includes(adminUser.role)) {
      if (assessment.created_by_id && assessment.created_by_id !== (adminUser.id || adminUser._id)) {
        throw new ForbiddenException('You are not authorized to modify this assessment');
      }
    }

    const beforeState = { ...assessment };
    assessment.status = 'archived';
    await this.assessmentRepo.save(assessment);
    return { success: true, message: 'Assessment archived successfully' };
  }

  async update(id: string, dto: UpdateAssessmentDto, adminUser: any) {
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    if (adminUser && ['teacher', 'faculty', 'instructor'].includes(adminUser.role)) {
      if (assessment.created_by_id && assessment.created_by_id !== (adminUser.id || adminUser._id)) {
        throw new ForbiddenException('You are not authorized to modify this assessment');
      }
    }

    const beforeState = { ...assessment };

    if (dto.title !== undefined) assessment.title = dto.title;
    if (dto.code !== undefined) assessment.code = dto.code.toUpperCase().trim();
    if (dto.description !== undefined) assessment.description = dto.description;
    if (dto.instructions !== undefined) assessment.instructions = dto.instructions;
    if (dto.category !== undefined) assessment.category = dto.category;
    if (dto.durationMinutes !== undefined)
      assessment.durationMinutes = dto.durationMinutes;
    if (dto.passingMarks !== undefined)
      assessment.passingMarks = dto.passingMarks;
    if (dto.negativeMarking !== undefined)
      assessment.negativeMarking = dto.negativeMarking;
    if (dto.startTime !== undefined)
      assessment.startTime = dto.startTime
        ? new Date(dto.startTime)
        : undefined;
    if (dto.endTime !== undefined)
      assessment.endTime = dto.endTime ? new Date(dto.endTime) : undefined;
    if (dto.status !== undefined) assessment.status = dto.status;
    if (dto.shuffleQuestions !== undefined)
      assessment.shuffleQuestions = dto.shuffleQuestions;
    if (dto.shuffleOptions !== undefined)
      assessment.shuffleOptions = dto.shuffleOptions;
    if (dto.showResultImmediately !== undefined)
      assessment.showResultImmediately = dto.showResultImmediately;
    if (dto.allowReview !== undefined) assessment.allowReview = dto.allowReview;
    if (dto.lockSectionsSequentially !== undefined)
      assessment.lockSectionsSequentially = dto.lockSectionsSequentially;
    if (dto.allowVirtualMachine !== undefined)
      assessment.allowVirtualMachine = dto.allowVirtualMachine;
    if (dto.requireLockdown !== undefined) {
      assessment.requireLockdown = dto.requireLockdown;
      assessment.securityPolicy = {
        ...(assessment.securityPolicy || {}),
        requireSEB: dto.requireLockdown,
      };
    }
    if (dto.lockdownQuitPassword !== undefined) {
      assessment.lockdownQuitPassword = dto.lockdownQuitPassword;
      assessment.securityPolicy = {
        ...(assessment.securityPolicy || {}),
        lockdownQuitPassword: dto.lockdownQuitPassword,
      };
    }
    if (dto.allowCalculators !== undefined) {
      assessment.allowCalculators = dto.allowCalculators;
      assessment.securityPolicy = {
        ...(assessment.securityPolicy || {}),
        allowCalculators: dto.allowCalculators,
      };
    }
    if (dto.allowScratchpad !== undefined) {
      assessment.allowScratchpad = dto.allowScratchpad;
      assessment.securityPolicy = {
        ...(assessment.securityPolicy || {}),
        allowScratchpad: dto.allowScratchpad,
      };
    }
    if (dto.allowReferenceDoc !== undefined) {
      assessment.allowReferenceDoc = dto.allowReferenceDoc;
      assessment.securityPolicy = {
        ...(assessment.securityPolicy || {}),
        allowReferenceDoc: dto.allowReferenceDoc,
      };
    }
    if (dto.referencePdfUrl !== undefined) {
      assessment.referencePdfUrl = dto.referencePdfUrl;
      assessment.securityPolicy = {
        ...(assessment.securityPolicy || {}),
        referencePdfUrl: dto.referencePdfUrl,
      };
    }
    if (dto.requireCloseOtherApps !== undefined) {
      assessment.requireCloseOtherApps = dto.requireCloseOtherApps;
      assessment.securityPolicy = {
        ...(assessment.securityPolicy || {}),
        requireCloseOtherApps: dto.requireCloseOtherApps,
      };
    }
    if (dto.allowSpellCheck !== undefined) {
      assessment.allowSpellCheck = dto.allowSpellCheck;
      assessment.securityPolicy = {
        ...(assessment.securityPolicy || {}),
        allowSpellCheck: dto.allowSpellCheck,
      };
    }
    if (dto.allowFindOnPage !== undefined) {
      assessment.allowFindOnPage = dto.allowFindOnPage;
      assessment.securityPolicy = {
        ...(assessment.securityPolicy || {}),
        allowFindOnPage: dto.allowFindOnPage,
      };
    }
    if (dto.allowedUrlPatterns !== undefined) {
      assessment.allowedUrlPatterns = dto.allowedUrlPatterns;
      assessment.securityPolicy = {
        ...(assessment.securityPolicy || {}),
        allowedUrlPatterns: dto.allowedUrlPatterns,
      };
    }
    if (dto.enableScreenCaptureSnapshots !== undefined) {
      assessment.enableScreenCaptureSnapshots = dto.enableScreenCaptureSnapshots;
      assessment.securityPolicy = {
        ...(assessment.securityPolicy || {}),
        enableScreenCaptureSnapshots: dto.enableScreenCaptureSnapshots,
      };
    }
    if (dto.enableForensicWatermark !== undefined) {
      assessment.enableForensicWatermark = dto.enableForensicWatermark;
      assessment.securityPolicy = {
        ...(assessment.securityPolicy || {}),
        enableForensicWatermark: dto.enableForensicWatermark,
      };
    }
    if (dto.resultDisplaySettings !== undefined)
      assessment.resultDisplaySettings = dto.resultDisplaySettings;
    if (dto.allowedAttempts !== undefined)
      assessment.allowedAttempts = Number(dto.allowedAttempts);
    if (dto.targetBatches !== undefined)
      assessment.targetBatches = dto.targetBatches;
    if (dto.targetDepartments !== undefined)
      assessment.targetDepartments = dto.targetDepartments;
    if (dto.targetCourses !== undefined)
      assessment.targetCourses = dto.targetCourses;
    if (dto.targetSections !== undefined)
      assessment.targetSections = this.normalizeTargetSections(dto.targetSections);
    if (dto.targetGroups !== undefined)
      assessment.targetGroups = this.normalizeTargetGroups(dto.targetGroups);
    if (dto.targetStudentIds !== undefined)
      assessment.targetStudentIds = dto.targetStudentIds;
    if (dto.targetSemesters !== undefined)
      assessment.targetSemesters = dto.targetSemesters;
    if (!assessment.created_by_id && (adminUser?.id || adminUser?._id)) {
      assessment.created_by_id = adminUser.id || adminUser._id;
    }

    if (dto.proctoring) {
      const mode = dto.proctoring.mode || assessment.proctoring?.mode;
      const autoSubmit =
        mode === 'partial_proctored'
          ? false
          : mode === 'non_proctored'
            ? false
            : (dto.proctoring.autoSubmitOnViolation ??
              assessment.proctoring?.autoSubmitOnViolation ??
              true);
      const violationPenaltyMarks =
        dto.proctoring.violationPenaltyMarks !== undefined
          ? Number(dto.proctoring.violationPenaltyMarks)
          : assessment.proctoring?.violationPenaltyMarks;

      assessment.proctoring = {
        ...assessment.proctoring,
        ...dto.proctoring,
        ...(mode ? { mode } : {}),
        autoSubmitOnViolation: autoSubmit,
        ...(violationPenaltyMarks !== undefined
          ? { violationPenaltyMarks }
          : {}),
      };
      if (mode) {
        assessment.mode = mode;
        assessment.submissionPolicy =
          mode === 'partial_proctored' || mode === 'non_proctored'
            ? 'manual'
            : 'auto';
      }
    }

    if (dto.sections !== undefined && Array.isArray(dto.sections)) {
      const qIds: string[] = [];
      let tMarks = 0;
      const sectionsToSave: any[] = [];

      for (const sec of dto.sections) {
        const sectionQuestions = (sec.questions || []).map((question) => ({
          questionId: String(question.questionId),
          marks: Number(question.marks),
          negativeMarks: Number(question.negativeMarks || 0),
          order: Number(question.order || 0),
        }));
        sectionQuestions.forEach((question) => {
          qIds.push(question.questionId);
          tMarks += question.marks;
        });
        sectionsToSave.push({
          title: sec.title,
          description: sec.description || '',
          order: sec.order || 0,
          timeLimit: sec.timeLimit || 0,
          autoSelection: sec.autoSelection,
          questions: sectionQuestions,
        });
      }
      if (qIds.length === 0) {
        throw new BadRequestException('At least one question is required across the assessment sections.');
      }
      this.validateNoDuplicateQuestionIds(qIds);
      const questionCount = await this.questionRepo.count({
        where: [{ id: In(qIds) }, { mongoId: In(qIds) }],
      });
      if (questionCount !== qIds.length) {
        throw new BadRequestException('One or more valid questions could not be found.');
      }
      assessment.sections = sectionsToSave;
      assessment.questions = qIds;
      assessment.totalMarks = tMarks;
    } else if (dto.questionIds && Array.isArray(dto.questionIds)) {
      const qIds = dto.questionIds.map((qId) => String(qId));
      if (qIds.length === 0) {
        throw new BadRequestException('At least one question is required for the assessment.');
      }
      this.validateNoDuplicateQuestionIds(qIds);
      assessment.questions = qIds;
      const questionsList = await this.questionRepo.find({
        where: [{ id: In(qIds) }, { mongoId: In(qIds) }],
      });
      if (questionsList.length !== qIds.length) {
        throw new BadRequestException('One or more valid questions could not be found.');
      }
      assessment.totalMarks = questionsList.reduce(
        (sum, q) => sum + (q.marks || 1),
        0,
      );
    }

    if (assessment.passingMarks < 0 || assessment.passingMarks > assessment.totalMarks) {
      throw new BadRequestException('Passing marks must be between zero and total marks.');
    }
    await this.assessmentRepo.save(assessment);

    const diff = calculateStateDiff(beforeState, assessment);

    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        action: 'UPDATE_ASSESSMENT',
        actorId: adminUser?.id || adminUser?._id,
        actorEmail: adminUser?.email || '',
        targetType: 'Assessment',
        assessmentId: assessment.id,
        target: assessment.title,
        metadata: {
          actorName: adminUser?.name,
          actorRole: adminUser?.role || 'admin',
          diff,
        },
      }),
    );

    return {
      success: true,
      message: 'Assessment updated successfully',
      assessment: { ...assessment, _id: assessment.id },
    };
  }

  async updateStatus(id: string, status: string, adminUser: any) {
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id }, { mongoId: id }],
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    if (adminUser && ['teacher', 'faculty', 'instructor'].includes(adminUser.role)) {
      if (assessment.created_by_id && assessment.created_by_id !== (adminUser.id || adminUser._id)) {
        throw new ForbiddenException('You are not authorized to modify this assessment');
      }
    }

    const beforeState = { ...assessment };

    assessment.status = status;
    await this.assessmentRepo.save(assessment);

    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        action: 'TOGGLE_ASSESSMENT_STATUS',
        actorId: adminUser?.id || adminUser?._id,
        actorEmail: adminUser?.email || '',
        targetType: 'Assessment',
        assessmentId: assessment.id,
        target: `Status -> ${status}`,
      }),
    );

    return {
      success: true,
      message: `Assessment status updated to ${status}`,
      assessment: { ...assessment, _id: assessment.id },
    };
  }

  async getAssessmentResults(id: string, adminUser?: any) {
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    if (adminUser && ['teacher', 'faculty', 'instructor'].includes(adminUser.role)) {
      if (assessment.created_by_id && assessment.created_by_id !== (adminUser.id || adminUser._id)) {
        throw new ForbiddenException('You are not authorized to access results for this assessment');
      }
    }

    const attempts = await this.attemptRepo.find({
      where: [{ assessmentId: assessment.id }, { assessmentId: id }],
      order: { score: 'DESC', timeSpentSeconds: 'ASC' },
    });

    // Auto-finalize any overdue in_progress attempts
    for (const att of attempts) {
      if (att.status === 'in_progress' && this.isAttemptExpired(assessment, att)) {
        await this.autoFinalizeAttempt(assessment, att, 'timed_out');
      }
    }

    // Deduplicate / Aggregate by student: group attempts per unique student
    const studentAttemptsMap = new Map<string, any[]>();
    for (const att of attempts) {
      const studentKey = att.studentId
        ? att.studentId.toString()
        : att.studentUid;
      const list = studentAttemptsMap.get(studentKey) || [];
      list.push(att);
      studentAttemptsMap.set(studentKey, list);
    }

    const securitySummary = this.examSecurityService
      ? await this.examSecurityService.getAssessmentCandidateSecuritySummary(assessment.id)
      : {};

    const uniqueCandidates = Array.from(studentAttemptsMap.entries()).map(
      ([key, studentAttempts]) => {
        const submitted = studentAttempts.filter(
          (a) => a.status === 'submitted' || a.status === 'auto_submitted' || a.status === 'timed_out',
        );
        const best =
          submitted.length > 0
            ? [...submitted].sort((a, b) => (b.score || 0) - (a.score || 0))[0]
            : [...studentAttempts].sort(
              (a, b) =>
                new Date(b.createdAt || 0).getTime() -
                new Date(a.createdAt || 0).getTime(),
            )[0];

        const maxScore =
          submitted.length > 0
            ? Math.max(...submitted.map((s) => s.score || 0))
            : best?.score || 0;

        const hasPassed =
          submitted.length > 0
            ? submitted.some((s) => s.passed)
            : best?.passed || false;

        const studentId = best?.studentId || key;
        const secInfo = securitySummary[studentId] || {};

        return {
          ...best,
          _id: best?.id,
          candidateVerification: (best as any)?.candidateVerification || null,
          kioskMode: secInfo.kioskMode || (best as any)?.kioskMode,
          attestationTier: secInfo.attestationTier || (best as any)?.attestationTier,
          clientBinaryHash: secInfo.clientBinaryHash || (best as any)?.clientBinaryHash,
          feedback: secInfo.feedback || (best as any)?.feedback,
          attemptNumber: studentAttempts.length,
          totalAttempts: studentAttempts.length,
          score: maxScore,
          highestScore: maxScore,
          rawScore: best?.rawScore ?? maxScore,
          proctoringPenalty: best?.proctoringPenalty ?? 0,
          passed: hasPassed,
          allAttempts: studentAttempts
            .sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0))
            .map((a, idx) => ({
              _id: a.id,
              attemptNumber: a.attemptNumber || idx + 1,
              score: a.score ?? 0,
              rawScore: a.rawScore ?? a.score ?? 0,
              proctoringPenalty: a.proctoringPenalty ?? 0,
              maxScore: a.maxScore || assessment.totalMarks || 100,
              status: a.status,
              percentage: a.percentage ?? 0,
              submittedAt: a.submittedAt || a.createdAt || a.startedAt,
              passed: a.passed,
              timeSpentSeconds: a.timeSpentSeconds || 0,
              tabSwitchCount: a.tabSwitchCount || 0,
              violationsCount: a.violations?.length || 0,
              responses: a.responses || [],
              violations: a.violations || [],
              candidateVerification: (a as any).candidateVerification || null,
              captures: (a as any).captures || [],
            })),
        };
      },
    );

    const totalCandidates = uniqueCandidates.length;
    const submittedCandidates = uniqueCandidates.filter(
      (c) => c.status === 'submitted' || c.status === 'auto_submitted' || c.status === 'timed_out',
    );
    const submittedCount = submittedCandidates.length;
    const passedCount = uniqueCandidates.filter((c) => c.passed).length;
    const avgScore =
      submittedCount > 0
        ? Number(
          (
            submittedCandidates.reduce((sum, c) => sum + (c.score || 0), 0) /
            submittedCount
          ).toFixed(1),
        )
        : 0;

    return {
      success: true,
      assessment: {
        id: assessment.id,
        _id: assessment.id,
        title: assessment.title,
        code: assessment.code,
        totalMarks: assessment.totalMarks || 100,
        passingMarks: assessment.passingMarks || 40,
        allowedAttempts:
          assessment.allowedAttempts !== undefined
            ? assessment.allowedAttempts
            : 0,
      },
      stats: {
        totalCandidates,
        submittedCount,
        passedCount,
        passPercentage:
          submittedCount > 0
            ? Number(((passedCount / submittedCount) * 100).toFixed(1))
            : 0,
        avgScore,
        totalSubmissionsCount: attempts.filter(
          (a) => a.status === 'submitted' || a.status === 'auto_submitted' || a.status === 'timed_out',
        ).length,
      },
      attempts: uniqueCandidates,
      rawAttempts: attempts.map((a, idx) => {
        const secInfo = securitySummary[a.studentId] || {};
        return {
          _id: a.id,
          id: a.id,
          studentId: a.studentId,
          studentUid: a.studentUid,
          studentName: a.studentName,
          studentEmail: a.studentEmail,
          kioskMode: secInfo.kioskMode,
          attestationTier: secInfo.attestationTier,
          clientBinaryHash: secInfo.clientBinaryHash,
          feedback: secInfo.feedback,
          attemptNumber: a.attemptNumber || idx + 1,
          rawScore: a.rawScore,
          proctoringPenalty: a.proctoringPenalty,
          totalAttempted: a.totalAttempted,
          totalCorrect: a.totalCorrect,
          totalWrong: a.totalWrong,
          totalSkipped: a.totalSkipped,
          accuracy: a.accuracy,
          startedAt: a.startedAt,
          score: a.score ?? 0,
          maxScore: a.maxScore || assessment.totalMarks || 100,
          percentage: a.percentage ?? 0,
          passed: a.passed,
          status: a.status,
          timeSpentSeconds: a.timeSpentSeconds,
          violations: a.violations || [],
        };
      }),
    };
  }

  // -------------------------------------------------------------
  // STUDENT CANDIDATE METHODS
  // -------------------------------------------------------------

  private readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async findAssessmentByIdOrCode(
    identifier: string,
    relations?: any,
  ): Promise<Assessment | null> {
    if (!identifier || typeof identifier !== 'string') return null;
    const trimmed = identifier.trim();

    if (this.UUID_REGEX.test(trimmed)) {
      return this.assessmentRepo.findOne({
        where: [{ id: trimmed }, { mongoId: trimmed }],
        ...(relations ? { relations } : {}),
      });
    }

    const found = await this.assessmentRepo.findOne({
      where: [{ code: trimmed }, { mongoId: trimmed }],
      ...(relations ? { relations } : {}),
    });
    if (found) return found;

    const qb = this.assessmentRepo
      .createQueryBuilder('assessment')
      .where('LOWER(assessment.code) = LOWER(:code)', { code: trimmed })
      .orWhere('assessment.mongoId = :code', { code: trimmed });

    if (relations?.createdBy) {
      qb.leftJoinAndSelect('assessment.createdBy', 'createdBy');
    }

    return qb.getOne();
  }

  private normalizeSemester(val: any): string {
    if (val == null) return '';
    return String(val).replace(/^(semester|sem)[\s_-]*/i, '').trim();
  }

  private isStudentTargeted(
    assessment: Assessment,
    studentUser: any,
    profileContext?: { batch: string; dept: string; studentProfile: any },
  ) {
    const studentKeys = [studentUser.id, studentUser._id, studentUser.uid]
      .filter(Boolean)
      .map(String);

    const hasSpecificTargets =
      Array.isArray(assessment.targetStudentIds) &&
      assessment.targetStudentIds.length > 0;
    const isDirectlyTargeted =
      hasSpecificTargets &&
      studentKeys.some((k) => assessment.targetStudentIds.includes(k));

    // When an individual student is targeted by ID, they are eligible irrespective of semesters, sections, or cohorts
    if (isDirectlyTargeted) {
      return true;
    }

    const hasCohortFilters = Boolean(
      (assessment.targetSemesters && assessment.targetSemesters.length > 0) ||
      (assessment.targetSections && assessment.targetSections.length > 0) ||
      (assessment.targetBatches && assessment.targetBatches.length > 0) ||
      (assessment.targetDepartments && assessment.targetDepartments.length > 0) ||
      (assessment.targetCourses && assessment.targetCourses.length > 0) ||
      (assessment.targetGroups && assessment.targetGroups.length > 0),
    );

    // If specific students were targeted and no cohort filters were set, unlisted students are excluded
    if (hasSpecificTargets && !hasCohortFilters) {
      return false;
    }

    // If neither specific students nor cohort filters exist, open access to all students
    if (!hasSpecificTargets && !hasCohortFilters) {
      return true;
    }

    let rawProfile = profileContext?.studentProfile ?? studentUser.studentProfile ?? {};
    if (typeof rawProfile === 'string') {
      try {
        rawProfile = JSON.parse(rawProfile);
      } catch {
        rawProfile = {};
      }
    }
    const profile = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
    const batch = profileContext?.batch ?? profile.batch ?? '';
    const dept = profileContext?.dept ?? profile.department ?? '';
    const matches = (targets: string[] | undefined, value: string) =>
      !targets?.length || (!!value && targets.map((t) => String(t).trim().toLowerCase()).includes(String(value).trim().toLowerCase()));
    const group = String(profile.group || '')
      .trim()
      .replace(/^group[\s_-]*/i, '')
      .toUpperCase();

    const studentSem = this.normalizeSemester(profile.semester);
    const normalizedTargetSemesters = (assessment.targetSemesters || [])
      .map((s) => this.normalizeSemester(s))
      .filter(Boolean);

    const matchesSemester =
      !normalizedTargetSemesters.length ||
      (!!studentSem && normalizedTargetSemesters.includes(studentSem));

    const studentSection = normalizeSectionIdentifier(profile.section || '');
    const normalizedTargetSections = this.normalizeTargetSections(
      assessment.targetSections,
    );
    const matchesSection =
      !normalizedTargetSections.length ||
      (!!studentSection &&
        normalizedTargetSections
          .map((s) => s.toLowerCase())
          .includes(studentSection.toLowerCase()));

    return (
      matches(assessment.targetBatches, batch) &&
      matches(assessment.targetDepartments, dept) &&
      matches(assessment.targetCourses, profile.course || '') &&
      matchesSemester &&
      matchesSection &&
      matches(assessment.targetGroups, group)
    );
  }

  private normalizeTargetSections(sections?: string[]): string[] {
    if (!sections || !Array.isArray(sections)) return [];
    const normalized = sections
      .map((sec) => normalizeSectionIdentifier(sec))
      .filter(Boolean);
    return [...new Set(normalized)];
  }

  private normalizeTargetGroups(groups: string[]): string[] {
    return [...new Set((groups || []).map((group) =>
      String(group).trim().replace(/^group[\s_-]*/i, '').toUpperCase(),
    ).filter((group) => group === 'A' || group === 'B'))];
  }

  async getTargetingOptions() {
    if (!this.userRepo) {
      return {
        success: true,
        years: ['1', '2', '3', '4'],
        semesters: ['1', '2', '3', '4', '5', '6', '7', '8'],
        sections: ['A', 'B'],
        batches: [],
        departments: [],
        groups: ['A', 'B'],
        totalStudents: 0,
      };
    }

    const users = await this.userRepo
      .createQueryBuilder('u')
      .where("u.role = 'student' OR u.isAssessmentStudent = true")
      .andWhere('u.isActive = true')
      .select(['u.id', 'u.studentProfile'])
      .getMany();

    const yearsSet = new Set<string>();
    const semestersSet = new Set<string>();
    const sectionsSet = new Set<string>();
    const batchesSet = new Set<string>();
    const departmentsSet = new Set<string>();

    for (const u of users) {
      const profile = u.studentProfile || {};
      if (profile.year != null && String(profile.year).trim()) {
        yearsSet.add(String(profile.year).trim());
      }
      if (profile.semester != null && String(profile.semester).trim()) {
        const sem = this.normalizeSemester(profile.semester);
        if (sem) semestersSet.add(sem);
      }
      if (profile.section != null && String(profile.section).trim()) {
        const sec = normalizeSectionIdentifier(profile.section);
        if (sec) sectionsSet.add(sec);
      }
      if (profile.batch != null && String(profile.batch).trim()) {
        batchesSet.add(String(profile.batch).trim());
      }
      if (profile.department != null && String(profile.department).trim()) {
        departmentsSet.add(String(profile.department).trim());
      }
    }

    const sortNumericOrAlpha = (arr: string[]) =>
      [...arr].sort((a, b) => {
        const numA = Number(a);
        const numB = Number(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });

    ['1', '2', '3', '4'].forEach((y) => yearsSet.add(y));
    ['1', '2', '3', '4', '5', '6', '7', '8'].forEach((s) => semestersSet.add(s));

    return {
      success: true,
      years: sortNumericOrAlpha(Array.from(yearsSet)),
      semesters: sortNumericOrAlpha(Array.from(semestersSet)),
      sections: sortNumericOrAlpha(Array.from(sectionsSet)),
      batches: sortNumericOrAlpha(Array.from(batchesSet)),
      departments: sortNumericOrAlpha(Array.from(departmentsSet)),
      groups: ['A', 'B'],
      totalStudents: users.length,
    };
  }

  async searchStudents(query: {
    search?: string;
    semester?: string;
    section?: string;
    year?: string;
    batch?: string;
    limit?: number;
  }) {
    if (!this.userRepo) {
      return { success: true, students: [] };
    }

    const qb = this.userRepo
      .createQueryBuilder('u')
      .where("u.role = 'student' OR u.isAssessmentStudent = true")
      .andWhere('u.isActive = true');

    if (query.search?.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(u.name) LIKE :term OR LOWER(u.email) LIKE :term OR LOWER(COALESCE(u.uid, \'\')) LIKE :term)',
        { term },
      );
    }

    const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
    const users = await qb
      .select(['u.id', 'u.name', 'u.email', 'u.uid', 'u.studentProfile'])
      .take(limit * 2)
      .getMany();

    const filtered = users.filter((u) => {
      const profile = u.studentProfile || {};
      if (query.semester) {
        const studentSem = this.normalizeSemester(profile.semester);
        const targetSem = this.normalizeSemester(query.semester);
        if (studentSem !== targetSem) return false;
      }
      if (query.section) {
        const studentSec = normalizeSectionIdentifier(profile.section || '');
        const targetSec = normalizeSectionIdentifier(query.section);
        if (studentSec.toLowerCase() !== targetSec.toLowerCase()) return false;
      }
      if (query.year) {
        if (String(profile.year || '').trim() !== String(query.year).trim())
          return false;
      }
      if (query.batch) {
        if (
          String(profile.batch || '').trim().toLowerCase() !==
          String(query.batch).trim().toLowerCase()
        )
          return false;
      }
      return true;
    });

    return {
      success: true,
      students: filtered.slice(0, limit).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        uid: u.uid || '',
        semester: u.studentProfile?.semester ?? null,
        section: u.studentProfile?.section ?? '',
        year: u.studentProfile?.year ?? null,
        batch: u.studentProfile?.batch ?? '',
      })),
    };
  }

  async previewTargetAudience(dto: {
    targetSemesters?: string[];
    targetSections?: string[];
    targetBatches?: string[];
    targetGroups?: string[];
    targetStudentIds?: string[];
    targetDepartments?: string[];
    targetCourses?: string[];
  }) {
    if (!this.userRepo) {
      return {
        success: true,
        accessMode: 'open_access',
        totalCount: 0,
        sampleStudents: [],
      };
    }

    const users = await this.userRepo
      .createQueryBuilder('u')
      .where("u.role = 'student' OR u.isAssessmentStudent = true")
      .andWhere('u.isActive = true')
      .select(['u.id', 'u.uid', 'u.name', 'u.email', 'u.studentProfile'])
      .getMany();

    const mockAssessment: any = {
      targetSemesters: dto.targetSemesters || [],
      targetSections: this.normalizeTargetSections(dto.targetSections),
      targetBatches: dto.targetBatches || [],
      targetGroups: this.normalizeTargetGroups(dto.targetGroups || []),
      targetStudentIds: dto.targetStudentIds || [],
      targetDepartments: dto.targetDepartments || [],
      targetCourses: dto.targetCourses || [],
    };

    const hasSpecificTargets = mockAssessment.targetStudentIds.length > 0;
    const hasCohortFilters = Boolean(
      mockAssessment.targetSemesters.length > 0 ||
      mockAssessment.targetSections.length > 0 ||
      mockAssessment.targetBatches.length > 0 ||
      mockAssessment.targetGroups.length > 0 ||
      mockAssessment.targetDepartments.length > 0 ||
      mockAssessment.targetCourses.length > 0,
    );

    let accessMode:
      | 'open_access'
      | 'specific_only'
      | 'cohort_only'
      | 'combined' = 'open_access';
    if (hasSpecificTargets && hasCohortFilters) {
      accessMode = 'combined';
    } else if (hasSpecificTargets) {
      accessMode = 'specific_only';
    } else if (hasCohortFilters) {
      accessMode = 'cohort_only';
    }

    const matchedStudents = users.filter((u) =>
      this.isStudentTargeted(mockAssessment, u),
    );

    return {
      success: true,
      accessMode,
      totalCount: matchedStudents.length,
      sampleStudents: matchedStudents.slice(0, 10).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        uid: u.uid || '',
        semester: u.studentProfile?.semester ?? null,
        section: u.studentProfile?.section ?? '',
        year: u.studentProfile?.year ?? null,
        batch: u.studentProfile?.batch ?? '',
      })),
    };
  }

  async getStudentAssessments(studentUser: any) {
    const studentProfile = studentUser.studentProfile || {};
    const batch = studentProfile.batch || '';
    const dept = studentProfile.department || '';

    const assessments = await this.assessmentRepo
      .createQueryBuilder('a')
      .where('a.status IN (:...statuses)', {
        statuses: ['published', 'ongoing'],
      })
      .orderBy('a.createdAt', 'DESC')
      .getMany();

    const filteredAssessments = assessments.filter((a) =>
      this.isStudentTargeted(a, studentUser, { batch, dept, studentProfile }),
    );

    const studentId = String(studentUser.id || studentUser._id);
    const attemptWhere: any[] = [{ studentId }];
    if (studentUser.uid) {
      attemptWhere.push({ studentUid: studentUser.uid });
    }
    const existingAttempts = await this.attemptRepo.find({
      where: attemptWhere,
      order: { score: 'DESC', createdAt: 'DESC' },
    });

    const questionIds = [
      ...new Set(filteredAssessments.flatMap((a) => a.questions || [])),
    ];
    const questionMetadata = questionIds.length
      ? await this.questionRepo.find({
          where: [{ id: In(questionIds) }, { mongoId: In(questionIds) }],
          select: {
            id: true,
            mongoId: true,
            questionType: true,
            difficulty: true,
          },
        })
      : [];

    for (const att of existingAttempts) {
      if (att.status === 'in_progress') {
        const matchingAssessment = filteredAssessments.find(
          (a) => a.id === att.assessmentId || a.mongoId === att.assessmentId,
        );
        if (matchingAssessment && this.isAttemptExpired(matchingAssessment, att)) {
          await this.autoFinalizeAttempt(matchingAssessment, att, 'timed_out');
        }
      }
    }

    const items = filteredAssessments.map((a) => {
      const allForAssessment = existingAttempts.filter(
        (att) => att.assessmentId === a.id || att.assessmentId === a.mongoId,
      );
      const submittedAttempts = allForAssessment.filter(
        (att) => att.status === 'submitted' || att.status === 'auto_submitted' || att.status === 'timed_out',
      );
      const isCompleted = submittedAttempts.length > 0;
      const inProgressAttempt = allForAssessment.find(
        (att) => att.status === 'in_progress',
      );

      const maxScore = isCompleted
        ? Math.max(...submittedAttempts.map((s) => s.score || 0))
        : (inProgressAttempt?.score ?? null);

      const hasPassed = isCompleted
        ? submittedAttempts.some((s) => s.passed)
        : false;

      const allowedAttempts =
        (a as any).allowedAttempts !== undefined
          ? (a as any).allowedAttempts
          : 1;
      const completedCount = submittedAttempts.length;
      const canRetake =
        allowedAttempts === 0 ? true : completedCount < allowedAttempts;

      return {
        ...a,
        _id: a.id,
        allowedAttempts,
        completedAttemptsCount: completedCount,
        questionCount: a.questions?.length || 0,
        questionTypes: [
          ...new Set(
            questionMetadata
              .filter(
                (q) =>
                  a.questions?.includes(q.id) ||
                  (!!q.mongoId && a.questions?.includes(q.mongoId)),
              )
              .map((q) => q.questionType),
          ),
        ],
        difficulties: [
          ...new Set(
            questionMetadata
              .filter(
                (q) =>
                  a.questions?.includes(q.id) ||
                  (!!q.mongoId && a.questions?.includes(q.mongoId)),
              )
              .map((q) => q.difficulty),
          ),
        ],
        attemptStatus: inProgressAttempt
          ? 'in_progress'
          : isCompleted
            ? 'submitted'
            : 'not_started',
        ...(inProgressAttempt
          ? {
              attemptStartedAt: inProgressAttempt.startedAt,
              ...this.resumeDetails(a, inProgressAttempt),
            }
          : {}),
        attemptScore: maxScore,
        attemptPassed: hasPassed,
        highestScore: maxScore,
        totalAttempts: allForAssessment.length,
        canRetake,
      };
    });

    return { success: true, assessments: items };
  }

  async getStudentAssessmentOverview(id: string, studentUser: any) {
    const assessment = await this.findAssessmentByIdOrCode(id);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    if (!this.isStudentTargeted(assessment, studentUser)) {
      throw new ForbiddenException('This assessment is not assigned to your student account.');
    }

    const studentId = String(studentUser.id || studentUser._id);
    const whereConditions: any[] = [{ assessmentId: assessment.id, studentId }];
    if (studentUser.uid) {
      whereConditions.push({
        assessmentId: assessment.id,
        studentUid: studentUser.uid,
      });
    }
    const allAttempts = await this.attemptRepo.find({
      where: whereConditions,
      order: { score: 'DESC', startedAt: 'DESC' },
    });

    const inProgressAttempt = allAttempts.find(
      (a) => a.status === 'in_progress',
    );
    if (inProgressAttempt && this.isAttemptExpired(assessment, inProgressAttempt)) {
      await this.autoFinalizeAttempt(assessment, inProgressAttempt, 'timed_out');
    }

    const submittedAttempts = allAttempts.filter(
      (a) => a.status === 'submitted' || a.status === 'auto_submitted' || a.status === 'timed_out',
    );
    const activeInProgressAttempt = allAttempts.find(
      (a) => a.status === 'in_progress',
    );

    const allowedAttempts =
      assessment.allowedAttempts !== undefined ? assessment.allowedAttempts : 1;
    const completedCount = submittedAttempts.length;
    const canRetake =
      allowedAttempts === 0 ? true : completedCount < allowedAttempts;
    const highestScore =
      submittedAttempts.length > 0
        ? Math.max(...submittedAttempts.map((s) => s.score || 0))
        : null;

    const latestAttempt =
      activeInProgressAttempt || (allAttempts.length > 0 ? allAttempts[0] : null);

    const now = new Date();
    let isAvailable =
      assessment.status === 'published' || assessment.status === 'ongoing';
    let unavailabilityReason = '';

    if (assessment.status === 'draft') {
      isAvailable = false;
      unavailabilityReason =
        'Assessment is currently in draft mode (disabled by administrator).';
    } else if (
      assessment.status === 'completed' ||
      assessment.status === 'archived'
    ) {
      isAvailable = false;
      unavailabilityReason = 'Assessment has concluded and is closed.';
    } else if (assessment.startTime && now < new Date(assessment.startTime)) {
      isAvailable = false;
      unavailabilityReason = `Assessment window has not opened yet. Scheduled to open at ${new Date(assessment.startTime).toLocaleString()}.`;
    } else if (assessment.endTime && now > new Date(assessment.endTime)) {
      isAvailable = false;
      unavailabilityReason = 'Assessment submission deadline has passed.';
    }

    return {
      success: true,
      assessment: {
        _id: assessment.id,
        id: assessment.id,
        title: assessment.title,
        code: assessment.code,
        description: assessment.description,
        type: assessment.type,
        status: assessment.status,
        startTime: assessment.startTime,
        endTime: assessment.endTime,
        isAvailable,
        unavailabilityReason,
        durationMinutes: assessment.durationMinutes,
        totalMarks: assessment.totalMarks,
        passingMarks: assessment.passingMarks,
        negativeMarking: assessment.negativeMarking,
        questionCount: assessment.questions.length,
        allowedAttempts,
        lockSectionsSequentially: assessment.lockSectionsSequentially ?? false,
        allowVirtualMachine: assessment.allowVirtualMachine ?? false,
        requireLockdown: assessment.requireLockdown ?? assessment.securityPolicy?.requireSEB ?? false,
        allowCalculators: assessment.allowCalculators ?? assessment.securityPolicy?.allowCalculators ?? false,
        allowScratchpad: assessment.allowScratchpad ?? assessment.securityPolicy?.allowScratchpad ?? true,
        allowReferenceDoc: assessment.allowReferenceDoc ?? assessment.securityPolicy?.allowReferenceDoc ?? false,
        referencePdfUrl: assessment.referencePdfUrl ?? assessment.securityPolicy?.referencePdfUrl,
        requireCloseOtherApps: assessment.requireCloseOtherApps ?? assessment.securityPolicy?.requireCloseOtherApps ?? true,
        allowSpellCheck: assessment.allowSpellCheck ?? assessment.securityPolicy?.allowSpellCheck ?? false,
        allowFindOnPage: assessment.allowFindOnPage ?? assessment.securityPolicy?.allowFindOnPage ?? true,
        allowedUrlPatterns: assessment.allowedUrlPatterns ?? assessment.securityPolicy?.allowedUrlPatterns ?? [],
        enableScreenCaptureSnapshots: assessment.enableScreenCaptureSnapshots ?? assessment.securityPolicy?.enableScreenCaptureSnapshots ?? false,
        enableForensicWatermark: assessment.enableForensicWatermark ?? assessment.securityPolicy?.enableForensicWatermark ?? false,
        proctoring: assessment.proctoring,
        securityPolicy: assessment.securityPolicy
          ? (({ lockdownQuitPassword, ...rest }: any) => rest)(assessment.securityPolicy)
          : assessment.securityPolicy,
        instructions: assessment.instructions,
      },
      attempt: latestAttempt
        ? {
          _id: latestAttempt.id,
          status: latestAttempt.status,
          score: latestAttempt.score,
          percentage: latestAttempt.percentage,
          passed: latestAttempt.passed,
          startedAt: latestAttempt.startedAt,
          submittedAt: latestAttempt.submittedAt,
          attemptNumber: latestAttempt.attemptNumber,
          ...(latestAttempt.status === 'in_progress'
            ? this.resumeDetails(assessment, latestAttempt)
            : {}),
        }
        : null,
      canRetake,
      completedAttemptsCount: completedCount,
      highestScore,
    };
  }

  async startStudentAttempt(id: string, studentUser: any) {
    const assessment = await this.findAssessmentByIdOrCode(id);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    if (!this.isStudentTargeted(assessment, studentUser)) {
      throw new ForbiddenException('This assessment is not assigned to your student account.');
    }

    if (assessment.status === 'draft' || assessment.status === 'archived') {
      throw new BadRequestException(
        'This assessment is currently disabled by administrator.',
      );
    }
    const now = new Date();
    if (assessment.startTime && now < new Date(assessment.startTime)) {
      throw new BadRequestException(
        `Assessment has not started yet. Scheduled to begin at ${new Date(assessment.startTime).toLocaleString()}.`,
      );
    }
    if (assessment.endTime && now > new Date(assessment.endTime)) {
      throw new BadRequestException(
        'Assessment window has expired. Submissions are closed.',
      );
    }

    const questionIds = assessment.questions || [];
    const questionsList =
      questionIds.length > 0
        ? await this.questionRepo.find({
          where: [{ id: In(questionIds) }, { mongoId: In(questionIds) }],
        })
        : [];
    const qMap = new Map(questionsList.map((q) => [q.id, q]));

    const studentId = String(studentUser.id || studentUser._id);
    let attempt = await this.attemptRepo.findOne({
      where: [
        { assessmentId: assessment.id, studentId, status: 'in_progress' },
      ],
    });

    if (!attempt) {
      const previousSubmitted = await this.attemptRepo.find({
        where: [
          {
            assessmentId: assessment.id,
            studentId,
            status: In(['submitted', 'auto_submitted', 'timed_out']),
          },
        ],
        order: { score: 'DESC' },
      });

      const allowedAttempts =
        assessment.allowedAttempts !== undefined
          ? assessment.allowedAttempts
          : 1;
      if (allowedAttempts > 0 && previousSubmitted.length >= allowedAttempts) {
        throw new BadRequestException(
          allowedAttempts === 1
            ? 'Only 1 attempt is allowed for this examination and you have already completed it.'
            : `You have reached the maximum limit of ${allowedAttempts} attempts for this examination.`,
        );
      }

      const highestPreviousScore =
        previousSubmitted.length > 0 ? previousSubmitted[0].score || 0 : 0;
      const attemptNum = previousSubmitted.length + 1;

      const { orderedIds } = this.buildSectionOrderedQuestionIds(
        assessment,
        questionsList,
      );

      attempt = this.attemptRepo.create({
        assessmentId: assessment.id,
        studentId,
        studentUid: studentUser.uid || 'UNKNOWN',
        studentName: studentUser.name || 'Student Candidate',
        studentEmail: studentUser.email || '',
        status: 'in_progress',
        startedAt: new Date(),
        attemptNumber: attemptNum,
        resumeCount: 0,
        highestScore: highestPreviousScore,
        questionOrder: orderedIds,
        maxScore: assessment.totalMarks,
        responses: orderedIds.map((qId) => ({
          questionId: qId,
          optionOrder: assessment.shuffleOptions
            ? this.buildOptionOrder(qMap.get(String(qId)))
            : null,
          selectedAnswer: -1,
          isCorrect: false,
          marksAwarded: 0,
          timeSpentSeconds: 0,
          status: 'unvisited',
        })),
      });

      try {
        await this.attemptRepo.save(attempt);
      } catch (err: any) {
        // AUD-CON-008: Handle concurrent attempt creation race condition (PostgreSQL 23505)
        if (
          err?.code === '23505' ||
          String(err?.message || '').includes('idx_unique_in_progress_assessment_attempt') ||
          String(err?.message || '').includes('duplicate key')
        ) {
          const concurrentAttempt = await this.attemptRepo.findOne({
            where: [{ assessmentId: assessment.id, studentId, status: 'in_progress' }],
          });
          if (concurrentAttempt) {
            attempt = concurrentAttempt;
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
    } else {
      if (now.getTime() >= this.attemptExpiresAt(assessment, attempt).getTime()) {
        throw new BadRequestException('This assessment attempt has run out of time.');
      }
      const previousResumeCount = attempt.resumeCount || 0;
      if (previousResumeCount >= MAX_RESUME_ATTEMPTS) {
        throw new BadRequestException('All 3 resume opportunities have been used for this attempt.');
      }

      // The database claims one resume atomically, including when two tabs open together.
      const claimed = await this.attemptRepo.update(
        {
          id: attempt.id,
          studentId,
          status: 'in_progress',
          resumeCount: LessThan(MAX_RESUME_ATTEMPTS),
        },
        { resumeCount: () => '"resumeCount" + 1' },
      );
      if (!claimed.affected) {
        throw new BadRequestException('No resume opportunities remain for this assessment attempt.');
      }
      const updatedAttempt = await this.attemptRepo.findOne({ where: { id: attempt.id } });
      attempt.resumeCount = Math.max(
        previousResumeCount + 1,
        updatedAttempt?.resumeCount || 0,
      );
    }

    const { questionSectionMap, resolvedSections } = this.buildSectionOrderedQuestionIds(
      assessment,
      questionsList,
    );

    const sanitizedQuestions = (attempt.questionOrder || [])
      .map((qId, index) => {
        const q = qMap.get(String(qId));
        if (!q) return null;
        const sectionMeta = questionSectionMap.get(String(q.id));
        const options = Array.isArray(q.options)
          ? q.options.map((opt: any) =>
            typeof opt === 'string' ? opt : opt?.text || String(opt || ''),
          )
          : [];
        const optionOrder = this.getQuestionOptionOrderByQuestionId(attempt, q.id);
        const normalizedStarters = normalizeStarterCode(
          q.starterCode,
          q.metadata,
          q.codeSnippet,
          q.code,
          q.language,
        );
        const rawSupported =
          Array.isArray(q.supportedLanguages) && q.supportedLanguages.length > 0
            ? q.supportedLanguages
            : (q.metadata as any)?.supportedLanguages;
        const supportedLanguages =
          Array.isArray(rawSupported) && rawSupported.length > 0
            ? rawSupported
            : normalizedStarters.length > 0
              ? [...new Set(normalizedStarters.map((s) => s.language))]
              : (q.language ? [q.language] : []);
        const preferredLang = q.language || (q.metadata as any)?.language;
        const resolvedLanguage =
          preferredLang && (supportedLanguages.length === 0 || supportedLanguages.some((l) => canonicalLanguage(l) === canonicalLanguage(preferredLang)))
            ? preferredLang
            : supportedLanguages[0] || 'python';

        return {
          _id: q.id,
          id: q.id,
          questionIndex: index + 1,
          question: q.question,
          description: q.problemStatement || q.description || '',
          questionType: q.questionType,
          sectionId: sectionMeta?.sectionId,
          sectionTitle: sectionMeta?.sectionTitle,
          sectionOrder: sectionMeta?.sectionOrder,
          topic: q.topic,
          subtopic: q.subtopic,
          difficulty: q.difficulty,
          marks: q.marks || 1,
          negativeMarks: assessment.negativeMarking ? q.negativeMarks || 0 : 0,
          options: optionOrder ? optionOrder.map((index) => options[index]) : options,
          starterCode: normalizedStarters,
          codeSnippet: q.codeSnippet,
          language: resolvedLanguage,
          supportedLanguages,
          hideMainMethod: Boolean(q.hideMainMethod ?? (q.metadata as any)?.hideMainMethod ?? false),
          constraints:
            Array.isArray(q.constraints) && q.constraints.length > 0
              ? q.constraints
              : (q.metadata as any)?.constraints || [],
          timeLimit: q.timeLimit || (q.metadata as any)?.timeLimit || 2000,
          memoryLimit: q.memoryLimit || (q.metadata as any)?.memoryLimit || 256,
          testCases: codingTestCases(q)
            .filter((tc: any) => !tc.isHidden)
            .map((tc: any, tcIdx: number) => ({
              id: tc.id || String(tcIdx + 1),
              input: tc.input || '',
              expected: tc.expected,
              output: tc.expected,
            })),
        };
      })
      .filter(Boolean);

    this.logger.log({
      event: 'ASSESSMENT_ATTEMPT_STARTED',
      assessmentId: assessment.id,
      attemptId: attempt.id,
      studentId,
      status: attempt.status,
    });

    const expiresAt = this.attemptExpiresAt(assessment, attempt);
    const serverEndsAtEpochMs = expiresAt.getTime();
    const serverNowMs = Date.now();

    return {
      success: true,
      attemptId: attempt.id,
      _id: attempt.id,
      startedAt: attempt.startedAt,
      durationMinutes: assessment.durationMinutes,
      ...this.resumeDetails(assessment, attempt),
      serverEndsAtEpochMs,
      serverNowMs,
      proctoring: assessment.proctoring,
      securityPolicy: assessment.securityPolicy
        ? (({ lockdownQuitPassword, ...rest }: any) => rest)(assessment.securityPolicy)
        : assessment.securityPolicy,
      lockSectionsSequentially: assessment.lockSectionsSequentially ?? false,
      allowVirtualMachine: assessment.allowVirtualMachine ?? false,
      requireLockdown: assessment.requireLockdown ?? assessment.securityPolicy?.requireSEB ?? false,
      allowCalculators: assessment.allowCalculators ?? assessment.securityPolicy?.allowCalculators ?? false,
      allowScratchpad: assessment.allowScratchpad ?? assessment.securityPolicy?.allowScratchpad ?? true,
      allowReferenceDoc: assessment.allowReferenceDoc ?? assessment.securityPolicy?.allowReferenceDoc ?? false,
      referencePdfUrl: assessment.referencePdfUrl ?? assessment.securityPolicy?.referencePdfUrl,
      requireCloseOtherApps: assessment.requireCloseOtherApps ?? assessment.securityPolicy?.requireCloseOtherApps ?? true,
      allowSpellCheck: assessment.allowSpellCheck ?? assessment.securityPolicy?.allowSpellCheck ?? false,
      allowFindOnPage: assessment.allowFindOnPage ?? assessment.securityPolicy?.allowFindOnPage ?? true,
      allowedUrlPatterns: assessment.allowedUrlPatterns ?? assessment.securityPolicy?.allowedUrlPatterns ?? [],
      enableScreenCaptureSnapshots: assessment.enableScreenCaptureSnapshots ?? assessment.securityPolicy?.enableScreenCaptureSnapshots ?? false,
      enableForensicWatermark: assessment.enableForensicWatermark ?? assessment.securityPolicy?.enableForensicWatermark ?? false,
      sections: resolvedSections,
      questions: sanitizedQuestions,
      savedResponses: attempt.responses,
    };
  }

  async retakeStudentAttempt(id: string, studentUser: any) {
    const studentId = String(studentUser.id || studentUser._id);
    const assessment = await this.findAssessmentByIdOrCode(id);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    if (!this.isStudentTargeted(assessment, studentUser)) {
      throw new ForbiddenException('This assessment is not assigned to your student account.');
    }

    const activeAttempt = await this.attemptRepo.findOne({
      where: { assessmentId: assessment.id, studentId, status: 'in_progress' },
    });
    if (activeAttempt) {
      throw new BadRequestException('An attempt is already in progress. Resume it instead of starting over.');
    }

    return this.startStudentAttempt(assessment.id, studentUser);
  }

  async evaluateCode(id: string, dto: EvaluateAssessmentCodeDto, studentUser: any) {
    const studentId = String(studentUser.id || studentUser._id);
    const assessment = await this.findAssessmentByIdOrCode(id);
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (!['published', 'ongoing'].includes(assessment.status)) throw new ForbiddenException('Assessment is not open for code evaluation');
    if (!this.isStudentTargeted(assessment, studentUser)) throw new ForbiddenException('Assessment is not assigned to you');
    const attempt = await this.attemptRepo.findOne({ where: {
      assessmentId: assessment.id, studentId, status: 'in_progress',
    } });
    if (!attempt || attempt.studentId !== studentId) throw new ForbiddenException('No active assessment attempt');
    const now = Date.now();
    const attemptDeadline = new Date(attempt.startedAt).getTime() + assessment.durationMinutes * 60_000;
    if ((assessment.endTime && now > new Date(assessment.endTime).getTime()) || now > attemptDeadline)
      throw new BadRequestException('The assessment execution deadline has expired');
    if (!(assessment.questions || []).includes(dto.questionId)) throw new ForbiddenException('Question is not part of this assessment');
    const question = await this.questionRepo.findOne({ where: { id: dto.questionId } });
    if (!question || !['coding', 'dsa', 'algorithmic'].includes(question.questionType.toLowerCase()))
      throw new BadRequestException('Coding question not found');
    const language = canonicalLanguage(dto.language);
    const effectiveSupported =
      Array.isArray(question.supportedLanguages) && question.supportedLanguages.length > 0
        ? question.supportedLanguages
        : (question.metadata as any)?.supportedLanguages || [];
    if (!language || (effectiveSupported.length && !effectiveSupported.some((value: string) => canonicalLanguage(value) === language)))
      throw new BadRequestException('This language is not enabled for the assessment question');
    const testCases = codingTestCases(question);
    if (!testCases.length) throw new BadRequestException('No test cases configured for this question');
    if (!this.executionService || !this.admission || !this.codeQueue) throw new ServiceUnavailableException('Code execution is unavailable');
    this.executionService.validateRequest(dto.code, testCases);
    const counts = await this.codeQueue.getJobCounts('waiting');
    if ((counts.waiting || 0) >= (Number(process.env.MAX_QUEUE_WAITING) || 500))
      throw new ServiceUnavailableException('Execution queue is at capacity; retry shortly');

    // Anonymous pass-count histogram from each other candidate's latest graded attempt.
    // No peer source code, identity, answers, or hidden case content enters the job.
    let peerScores: Array<{ passed: number; count: number }> = [];
    try {
      peerScores = await this.attemptRepo.query(`SELECT (response->>'testCasesPassed')::int AS passed, count(*)::int AS count
        FROM (SELECT DISTINCT ON (student_id) responses FROM assessment_attempts
          WHERE assessment_id = $1 AND student_id <> $2 AND status IN ('submitted', 'auto_submitted')
          ORDER BY student_id, "submittedAt" DESC NULLS LAST) attempts
        CROSS JOIN LATERAL jsonb_array_elements(attempts.responses) response
        WHERE response->>'questionId' = $3 AND (response->>'totalTestCases')::int = $4
        GROUP BY (response->>'testCasesPassed')::int`, [assessment.id, studentId, question.id, testCases.length]);
    } catch {
      this.logger.warn('Assessment comparison is temporarily unavailable');
    }
    const admissionId = await this.admission.reserve(studentId, {
      kind: 'run', assessmentId: assessment.id, questionId: question.id, code: dto.code, language,
    });
    try {
      const job = await this.codeQueue.add('run-code', {
        code: dto.code, language, testCases, userId: studentId, admissionId,
        resultContext: 'assessment', peerScores,
        jobType: ExecutionJobType.RUN_SAMPLE_TESTS,
        config: { timeLimit: question.timeLimit, memoryLimit: question.memoryLimit },
      }, {
        jobId: admissionId, attempts: 2, backoff: { type: 'exponential', delay: 2000 },
        priority: ExecutionPriority.INTERACTIVE_SAMPLE, removeOnComplete: { age: 900, count: 2000 }, removeOnFail: { age: 3600, count: 2000 },
      });
      return { success: true, status: 'queued', jobId: job.id };
    } catch {
      await this.admission.release(studentId, admissionId);
      throw new ServiceUnavailableException('Unable to queue assessment code; retry shortly');
    }
  }

  async saveProgress(
    id: string,
    dto: SubmitAssessmentDto,
    studentUser: any,
    headerKey?: string,
  ) {
    const studentId = String(studentUser.id || studentUser._id);
    const idempotencyKey = headerKey || dto.idempotencyKey;

    if (idempotencyKey && this.redisService) {
      const cached = await this.redisService.get<any>(
        `idempotency:exam:${idempotencyKey}`,
      );
      if (cached && cached.status === 'COMPLETED') {
        return cached.result;
      }
    }

    const assessment = await this.findAssessmentByIdOrCode(id);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    if (!this.isStudentTargeted(assessment, studentUser)) {
      throw new ForbiddenException('This assessment is not assigned to your student account.');
    }

    const attempt = await this.attemptRepo.findOne({
      where: {
        assessmentId: assessment.id,
        studentId,
        status: 'in_progress',
      },
    });

    if (!attempt) {
      throw new BadRequestException(
        'No active attempt found for this assessment.',
      );
    }

    // NEW-001: Attempt candidate ownership validation
    if (attempt.studentId !== studentId) {
      throw new ForbiddenException('You do not own this assessment attempt');
    }

    const expiresAt = this.attemptExpiresAt(assessment, attempt);
    const endsAtEpochMs = expiresAt.getTime();
    const serverReceivedAtMs = Date.now();
    const SUBMISSION_GRACE_WINDOW_MS = 45_000;
    const clientSubmittedAtMs = dto.clientSubmittedAtMs || serverReceivedAtMs;

    if (serverReceivedAtMs > endsAtEpochMs + SUBMISSION_GRACE_WINDOW_MS) {
      throw new BadRequestException(
        'The assessment submission deadline has expired.',
      );
    }
    const graceWindowAccepted = serverReceivedAtMs > endsAtEpochMs;

    if (dto.responses && Array.isArray(dto.responses)) {
      const previousResponses = attempt.responses || [];
      const updatedResponses = dto.responses.map((r) => ({
        questionId: String(r.questionId),
        optionOrder: this.getQuestionOptionOrderByQuestionId(attempt, String(r.questionId)),
        selectedAnswer: r.selectedAnswer ?? -1,
        selectedAnswers: r.selectedAnswers,
        code: r.code || '',
        language: r.language || 'python',
        // AUD-002: Server-controlled evaluation only; zeroed out during autosave
        testCasesPassed: 0,
        totalTestCases: 0,
        isCorrect: false,
        marksAwarded: 0,
        timeSpentSeconds: r.timeSpentSeconds || 0,
        status:
          r.status ||
          ((r.selectedAnswer !== undefined && r.selectedAnswer >= 0) ||
            (r.code && r.code.trim().length > 0)
            ? 'answered'
            : 'unvisited'),
      }));
      const updatedIds = new Set(updatedResponses.map((r) => r.questionId));
      attempt.responses = [
        ...previousResponses.filter((r) => !updatedIds.has(String(r.questionId))),
        ...updatedResponses,
      ];
    }

    if (dto.timeSpentSeconds) {
      attempt.timeSpentSeconds = dto.timeSpentSeconds;
    }

    if (dto.violations && Array.isArray(dto.violations)) {
      const existingViolations = Array.isArray(attempt.violations) ? attempt.violations : [];
      const existingTypesWithoutTimestamp = new Set(
        existingViolations.filter((v: any) => !v.timestamp).map((v: any) => v.type),
      );
      const existingKeys = new Set(
        existingViolations
          .filter((v: any) => v.timestamp)
          .map((v: any) => `${v.type}_${new Date(v.timestamp).getTime()}`),
      );
      const incomingViolations = dto.violations.map((v: any) => ({
        type: v.type,
        timestamp: v.timestamp ? new Date(v.timestamp) : new Date(),
        details: v.details || '',
        evidenceUrl: v.evidenceUrl || '',
        metadata: v.metadata || {},
        warningIndex: v.warningIndex,
        rawTimestamp: v.timestamp,
      }));
      const newViolations = incomingViolations.filter((v: any) => {
        if (!v.rawTimestamp && existingTypesWithoutTimestamp.has(v.type)) {
          return false;
        }
        return !existingKeys.has(`${v.type}_${v.timestamp.getTime()}`);
      });
      attempt.violations = [...existingViolations, ...newViolations];
      attempt.tabSwitchCount = attempt.violations.filter(
        (v) => v.type === 'tab_switch',
      ).length;
      attempt.fullscreenExitCount = attempt.violations.filter(
        (v) => v.type === 'fullscreen_exit',
      ).length;

      const penaltyPerViolation =
        Number(assessment.proctoring?.violationPenaltyMarks) || 0;
      const isPartialProctored =
        assessment.proctoring?.mode === 'partial_proctored' ||
        (!assessment.proctoring?.autoSubmitOnViolation &&
          penaltyPerViolation > 0);
      attempt.proctoringPenalty = isPartialProctored
        ? attempt.violations.length * penaltyPerViolation
        : 0;

      for (const v of newViolations) {
        this.logger.warn({
          event: 'ASSESSMENT_VIOLATION_RECORDED',
          assessmentId: assessment.id,
          attemptId: attempt.id,
          studentId,
          violationType: v.type,
          details: v.details,
        });
      }
    }

    // Reload fresh attempt state right before saving so any proctoring captures or background
    // telemetry saved while saveProgress was processing are fully preserved
    const freshAttempt = await this.attemptRepo.findOne({
      where: { id: attempt.id },
    });
    const targetAttempt = freshAttempt || attempt;
    targetAttempt.responses = attempt.responses;
    targetAttempt.timeSpentSeconds = attempt.timeSpentSeconds;
    targetAttempt.violations = attempt.violations;
    targetAttempt.tabSwitchCount = attempt.tabSwitchCount;
    targetAttempt.fullscreenExitCount = attempt.fullscreenExitCount;
    targetAttempt.proctoringPenalty = attempt.proctoringPenalty;

    await this.attemptRepo.save(targetAttempt);
    const result = {
      success: true,
      message: 'Progress saved successfully.',
      submissionMetadata: {
        graceWindowAccepted,
        clientSubmittedAtMs,
        serverReceivedAtMs,
        endsAtEpochMs,
      },
    };

    if (idempotencyKey && this.redisService) {
      await this.redisService.set(
        `idempotency:exam:${idempotencyKey}`,
        { status: 'COMPLETED', result },
        86400,
      );
    }

    return result;
  }

  async submitAttempt(
    id: string,
    dto: SubmitAssessmentDto,
    studentUser: any,
    headerKey?: string,
  ) {
    const studentId = String(studentUser.id || studentUser._id);
    const idempotencyKey =
      headerKey ||
      dto.idempotencyKey ||
      `submit:${id}:${studentId}`;

    if (this.redisService && idempotencyKey) {
      const cached = await this.redisService.get<any>(
        `idempotency:exam:${idempotencyKey}`,
      );
      if (cached && cached.status === 'COMPLETED') {
        return cached.result;
      }
      if (cached && cached.status === 'IN_FLIGHT') {
        for (let poll = 0; poll < 15; poll++) {
          await new Promise((r) => setTimeout(r, 200));
          const latest = await this.redisService.get<any>(
            `idempotency:exam:${idempotencyKey}`,
          );
          if (latest && latest.status === 'COMPLETED') {
            return latest.result;
          }
        }
      }
      try {
        const client = this.redisService.getClient() as any;
        if (typeof client.set === 'function') {
          await client.set(
            `idempotency:exam:${idempotencyKey}`,
            JSON.stringify({ status: 'IN_FLIGHT', startedAt: Date.now() }),
            'EX',
            10,
            'NX',
          );
        }
      } catch {}
    }

    const hasCode = dto.responses?.some(
      (response) =>
        typeof response.code === 'string' && response.code.trim().length > 0,
    );
    if (!hasCode) return this.evaluateAttempt(id, dto, studentUser, idempotencyKey);
    if (!this.admission) throw new PistonUnavailableError();
    const userId = String(studentUser.id || studentUser._id);
    const reservation = await this.admission.reserve(userId, {
      kind: 'assessment',
      id,
      responses: dto.responses,
    });
    const owner = randomUUID();
    let heartbeat: NodeJS.Timeout | undefined;
    try {
      if (
        (await this.admission.claim(userId, reservation, owner)) !== 'claimed'
      )
        throw new PistonUnavailableError();
      let renewing = false;
      heartbeat = setInterval(() => {
        if (renewing) return;
        renewing = true;
        void this.admission!.renew(userId, reservation, owner)
          .catch(() => {})
          .finally(() => {
            renewing = false;
          });
      }, this.admission.heartbeatMs);
      heartbeat.unref();
      return await this.evaluateAttempt(id, dto, studentUser, idempotencyKey);
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      await this.admission.release(userId, reservation, owner);
    }
  }

  private async evaluateAttempt(
    id: string,
    dto: SubmitAssessmentDto,
    studentUser: any,
    idempotencyKey?: string,
  ) {
    const assessment = await this.findAssessmentByIdOrCode(id);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    if (!this.isStudentTargeted(assessment, studentUser)) {
      throw new ForbiddenException('This assessment is not assigned to your student account.');
    }

    const studentId = String(studentUser.id || studentUser._id);
    const attempt = await this.attemptRepo.findOne({
      where: [
        { assessmentId: assessment.id, studentId },
      ],
      order: { startedAt: 'DESC' },
    });

    if (!attempt) {
      return this.getStudentResult(assessment.id, studentUser);
    }

    // NEW-001: Candidate attempt ownership validation
    if (attempt.studentId !== studentId) {
      throw new ForbiddenException('You do not own this assessment attempt');
    }

    // NEW-003: Idempotent submission: if already submitted, return the final scorecard
    if (attempt.status === 'submitted' || attempt.status === 'auto_submitted' || attempt.status === 'timed_out') {
      const studentResult = await this.getStudentResult(assessment.id, studentUser);
      if (idempotencyKey && this.redisService) {
        await this.redisService.set(
          `idempotency:exam:${idempotencyKey}`,
          { status: 'COMPLETED', result: studentResult, completedAt: Date.now() },
          86400,
        );
      }
      return studentResult;
    }

    if (attempt.status === 'evaluating') {
      const evaluatingDurationMs =
        Date.now() - new Date(attempt.updatedAt || attempt.startedAt).getTime();
      const LEASE_TIMEOUT_MS = 60_000;
      if (evaluatingDurationMs > LEASE_TIMEOUT_MS) {
        this.logger.warn({
          message: `Attempt ${attempt.id} evaluation lease expired (${evaluatingDurationMs}ms). Reclaiming attempt.`,
          attemptId: attempt.id,
          studentId,
        });
        if (typeof this.attemptRepo.update === 'function') {
          await this.attemptRepo.update(
            { id: attempt.id, status: 'evaluating' as any },
            { status: 'in_progress' as any },
          );
        }
        attempt.status = 'in_progress';
      } else {
        throw new ConflictException(
          'Assessment submission is currently being evaluated. Please wait.',
        );
      }
    }

    // Atomic CAS transition: in_progress -> evaluating to prevent duplicate concurrent evaluations
    if (attempt.status === 'in_progress') {
      if (typeof this.attemptRepo.update === 'function') {
        const transitionResult = await this.attemptRepo.update(
          { id: attempt.id, status: 'in_progress' },
          { status: 'evaluating' as any },
        );
        if (transitionResult && transitionResult.affected === 0) {
          const rechecked = await this.attemptRepo.findOne({ where: { id: attempt.id } });
          if (rechecked?.status === 'submitted' || rechecked?.status === 'auto_submitted' || rechecked?.status === 'timed_out') {
            return this.getStudentResult(assessment.id, studentUser);
          }
          throw new ConflictException(
            'Assessment submission is currently being evaluated. Please wait.',
          );
        }
      }
      attempt.status = 'evaluating' as any;
    }

    try {
      // Accept before the deadline; execution may finish after it.
      const now = new Date();
      const serverReceivedAtMs = now.getTime();
      const expiresAt = this.attemptExpiresAt(assessment, attempt);
      const endsAtEpochMs = expiresAt.getTime();
      const SUBMISSION_GRACE_WINDOW_MS = 45_000;

      let graceWindowAccepted = false;
      const clientSubmittedAtMs = dto.clientSubmittedAtMs;

      if (assessment.endTime) {
        const deadline = new Date(assessment.endTime).getTime();
        if (serverReceivedAtMs > deadline) {
          if (
            (clientSubmittedAtMs &&
              clientSubmittedAtMs <= deadline + SUBMISSION_GRACE_WINDOW_MS &&
              serverReceivedAtMs <= deadline + SUBMISSION_GRACE_WINDOW_MS) ||
            (serverReceivedAtMs <= deadline + SUBMISSION_GRACE_WINDOW_MS &&
              attempt.startedAt)
          ) {
            graceWindowAccepted = true;
          } else {
            throw new BadRequestException(
              'The examination submission deadline has expired.',
            );
          }
        }
      }

      if (!graceWindowAccepted && serverReceivedAtMs > endsAtEpochMs) {
        if (
          (clientSubmittedAtMs &&
            clientSubmittedAtMs <= endsAtEpochMs + SUBMISSION_GRACE_WINDOW_MS &&
            serverReceivedAtMs <= endsAtEpochMs + SUBMISSION_GRACE_WINDOW_MS) ||
          (serverReceivedAtMs <= endsAtEpochMs + SUBMISSION_GRACE_WINDOW_MS &&
            attempt.startedAt)
        ) {
          graceWindowAccepted = true;
        } else {
          throw new BadRequestException(
            'The examination submission deadline has expired.',
          );
        }
      }

    const responseIds = (dto.responses || []).map((answer) => String(answer.questionId));
    if (new Set(responseIds).size !== responseIds.length) {
      throw new BadRequestException('Duplicate question responses are not allowed');
    }

    // SERVER-SIDE EVALUATION (AUD-002 & NEW-003)
    const questionIds = assessment.questions || [];
    const questions =
      questionIds.length > 0
        ? await this.questionRepo.find({
          where: [{ id: In(questionIds) }, { mongoId: In(questionIds) }],
        })
        : [];
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    const seenQuestionIds = new Set<string>();
    for (const r of dto.responses || []) {
      const qId = String(r.questionId);
      if (seenQuestionIds.has(qId)) {
        throw new BadRequestException(
          `Duplicate response for question ID ${qId} is not permitted.`,
        );
      }
      seenQuestionIds.add(qId);
    }

    const evaluatedResponses = await Promise.all(
      (dto.responses || []).map(async (r) => {
        const qId = String(r.questionId);
        const q = questionMap.get(qId);
        if (!q) {
          return {
            questionId: String(r.questionId),
            selectedAnswer: r.selectedAnswer ?? -1,
            isCorrect: false,
            marksAwarded: 0,
            timeSpentSeconds: r.timeSpentSeconds || 0,
            status: 'skipped',
            isAttempted: false,
            partialCredit: false,
          };
        }

        const qType = (q.questionType || '').toLowerCase();
        const optionOrder = this.getQuestionOptionOrderByQuestionId(attempt, q.id);
        const selectedAnswer = this.mapDisplayedAnswerToCanonical(
          r.selectedAnswer,
          optionOrder,
        ) as number | undefined;
        const selectedAnswers = this.mapDisplayedAnswerToCanonical(
          r.selectedAnswers,
          optionOrder,
        ) as number[] | undefined;
        const isCoding =
          qType === 'coding' || qType === 'algorithmic' || qType === 'dsa';
        let isAttempted = false;
        let isCorrect = false;
        let marksAwarded = 0;
        let testCasesPassed = 0;
        let totalTestCases = 0;
        let partialCredit = false;

        if (isCoding) {
          const hasCode = r.code && r.code.trim().length > 0;
          if (hasCode) {
            isAttempted = true;

            const submittedLanguage = canonicalLanguage(r.language || 'python');
            const effectiveSupported =
              Array.isArray(q.supportedLanguages) && q.supportedLanguages.length > 0
                ? q.supportedLanguages
                : (q.metadata as any)?.supportedLanguages || [];
            if (
              !submittedLanguage ||
              (effectiveSupported.length &&
                !effectiveSupported.some(
                  (lang: string) => canonicalLanguage(lang) === submittedLanguage,
                ))
            ) {
              throw new BadRequestException(
                'This language is not enabled for the assessment question',
              );
            }
            // Server-side code execution against verified test cases (AUD-002)
            const testCases = codingTestCases(q);
            totalTestCases = testCases.length;

            if (this.executionService && totalTestCases > 0) {
              try {
                const tcInputs = testCases.map((tc, idx) => ({
                  id: tc.id || idx + 1,
                  input: tc.input || '',
                  expected: tc.expected,
                }));
                const results = await this.executionService.runCode(
                  r.code!,
                  r.language || 'python',
                  tcInputs,
                  { timeLimit: q.timeLimit, memoryLimit: q.memoryLimit },
                );
                testCasesPassed = results.filter((res) => res.passed).length;
              } catch (execErr: any) {
                this.logger.error({
                  message: `Assessment code execution failed for question ${q.id}`,
                  questionId: q.id,
                  attemptId: attempt?.id,
                  studentId,
                  error: execErr?.message || String(execErr),
                });
                if (execErr instanceof PistonUnavailableError) throw execErr;
                testCasesPassed = 0;
              }
            } else {
              testCasesPassed = 0;
            }

            const ratio =
              totalTestCases > 0
                ? Math.min(1, Math.max(0, testCasesPassed / totalTestCases))
                : 0;
            marksAwarded = Math.round(ratio * (q.marks || 5) * 10) / 10;
            isCorrect = ratio >= 0.99;
            partialCredit = ratio > 0 && !isCorrect;
          }
        } else {
          // MCQ (single choice or multiple choice)
          const isMulti =
            qType === 'multiple_choice' ||
            (Array.isArray(q.correctAnswers) && q.correctAnswers.length > 0);

          if (isMulti) {
            const selectedList = Array.isArray(selectedAnswers)
              ? selectedAnswers
              : selectedAnswer !== undefined && selectedAnswer >= 0
                ? [selectedAnswer]
                : [];
            isAttempted = selectedList.length > 0;
            if (isAttempted) {
              const correctList = Array.isArray(q.correctAnswers)
                ? q.correctAnswers
                : [q.correctAnswer];
              const sortedSelected = [...selectedList].sort((a, b) => a - b);
              const sortedCorrect = [...correctList].sort((a, b) => a - b);
              isCorrect =
                sortedSelected.length === sortedCorrect.length &&
                sortedSelected.every((val, idx) => val === sortedCorrect[idx]);

              if (isCorrect) {
                marksAwarded = q.marks || 1;
              } else {
                const negMarks = assessment.negativeMarking
                  ? q.negativeMarks || 0
                  : 0;
                marksAwarded = negMarks > 0 ? -negMarks : 0;
              }
            }
          } else {
            // Single-choice MCQ
            isAttempted = selectedAnswer !== undefined && selectedAnswer >= 0;
            if (isAttempted) {
              isCorrect = selectedAnswer === q.correctAnswer;
              if (isCorrect) {
                marksAwarded = q.marks || 1;
              } else {
                const negMarks = assessment.negativeMarking
                  ? q.negativeMarks || 0
                  : 0;
                marksAwarded = negMarks > 0 ? -negMarks : 0;
              }
            }
          }
        }

        return {
          questionId: q.id,
          selectedAnswer: selectedAnswer ?? -1,
          selectedAnswers,
          optionOrder,
          code: r.code || '',
          language: r.language || 'python',
          testCasesPassed,
          totalTestCases,
          isCorrect,
          marksAwarded,
          timeSpentSeconds: r.timeSpentSeconds || 0,
          status: isAttempted ? 'answered' : 'skipped',
          isAttempted,
          partialCredit,
        };
      }),
    );

    let totalScore = 0;
    let totalAttempted = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalSkipped = 0;

    for (const er of evaluatedResponses) {
      totalScore += er.marksAwarded;
      if (er.isAttempted) {
        totalAttempted++;
        if (er.isCorrect || er.partialCredit) {
          totalCorrect++;
        } else {
          totalWrong++;
        }
      } else {
        totalSkipped++;
      }
    }

    const maxScore = assessment.totalMarks || 1;
    const rawScore = Math.min(
      maxScore,
      Math.max(0, Math.round(totalScore * 100) / 100),
    );

    const existingViolations = Array.isArray(attempt.violations) ? attempt.violations : [];
    const existingTypesWithoutTimestamp = new Set(
      existingViolations.filter((v: any) => !v.timestamp).map((v: any) => v.type),
    );
    const existingKeys = new Set(
      existingViolations
        .filter((v: any) => v.timestamp)
        .map((v: any) => `${v.type}_${new Date(v.timestamp).getTime()}`),
    );
    const clientViolations = (dto.violations || []).map((v: any) => ({
      type: v.type,
      timestamp: v.timestamp ? new Date(v.timestamp) : new Date(),
      details: v.details || '',
      evidenceUrl: v.evidenceUrl || '',
      metadata: v.metadata || {},
      warningIndex: v.warningIndex,
      rawTimestamp: v.timestamp,
    }));
    const newClientViolations = clientViolations.filter((v: any) => {
      if (!v.rawTimestamp && existingTypesWithoutTimestamp.has(v.type)) {
        return false;
      }
      return !existingKeys.has(`${v.type}_${v.timestamp.getTime()}`);
    });
    const violations = [...existingViolations, ...newClientViolations];

    const penaltyPerViolation =
      Number(assessment.proctoring?.violationPenaltyMarks) || 0;
    const isPartialProctored =
      assessment.proctoring?.mode === 'partial_proctored' ||
      (!assessment.proctoring?.autoSubmitOnViolation && penaltyPerViolation > 0);
    const proctoringPenalty = isPartialProctored
      ? Math.round(violations.length * penaltyPerViolation * 100) / 100
      : 0;

    const finalScore = Math.max(
      0,
      Math.round((rawScore - proctoringPenalty) * 100) / 100,
    );
    const percentage = Math.round((finalScore / maxScore) * 1000) / 10;
    const passed = finalScore >= (assessment.passingMarks || 0);
    const accuracy =
      totalAttempted > 0
        ? Math.round((totalCorrect / totalAttempted) * 100)
        : 0;

    const tabSwitches = violations.filter(
      (v) => v.type === 'tab_switch',
    ).length;
    const fullscreenExits = violations.filter(
      (v) => v.type === 'fullscreen_exit',
    ).length;

    const prevAttempts = await this.attemptRepo.find({
      where: [
        {
          assessmentId: assessment.id,
          studentId,
          status: In(['submitted', 'auto_submitted', 'timed_out']),
          id: Not(attempt.id),
        },
      ],
    });

    const prevMax =
      prevAttempts.length > 0
        ? Math.max(...prevAttempts.map((a) => a.score || 0))
        : 0;
    const finalHighestScore = Math.max(finalScore, prevMax);

    // State machine transition: in_progress -> submitted
    attempt.status = 'submitted';
    attempt.submittedAt = now;
    attempt.timeSpentSeconds = dto.timeSpentSeconds || 0;
    attempt.responses = evaluatedResponses;
    attempt.rawScore = rawScore;
    attempt.proctoringPenalty = proctoringPenalty;
    attempt.score = finalScore;
    attempt.highestScore = finalHighestScore;
    attempt.maxScore = maxScore;
    attempt.percentage = percentage;
    attempt.passed = passed || prevMax >= (assessment.passingMarks || 0);
    attempt.totalAttempted = totalAttempted;
    attempt.totalCorrect = totalCorrect;
    attempt.totalWrong = totalWrong;
    attempt.totalSkipped = totalSkipped;
    attempt.accuracy = accuracy;
    attempt.tabSwitchCount = tabSwitches;
    attempt.fullscreenExitCount = fullscreenExits;
    attempt.violations = violations;
    attempt.mode = assessment.proctoring?.mode || 'fully_proctored';
    attempt.submissionPolicy =
      assessment.proctoring?.mode === 'partial_proctored' ||
      assessment.proctoring?.mode === 'non_proctored'
        ? 'manual'
        : 'auto';

    await this.attemptRepo.save(attempt);

    this.logger.log({
      event: 'ASSESSMENT_ATTEMPT_SUBMITTED',
      assessmentId: assessment.id,
      attemptId: attempt.id,
      studentId,
      score: finalScore,
      percentage,
      passed: attempt.passed,
      status: attempt.status,
    });

    const receipt = {
      success: true,
      message: 'Assessment submitted successfully.',
      result: {
        score: finalScore,
        highestScore: finalHighestScore,
        maxScore,
        percentage,
        passed: attempt.passed,
        accuracy,
        totalAttempted,
        totalCorrect,
        totalWrong,
        totalSkipped,
        submittedAt: attempt.submittedAt,
        timeSpentSeconds: attempt.timeSpentSeconds,
        tabSwitchCount: tabSwitches,
      },
      submissionMetadata: {
        graceWindowAccepted,
        clientSubmittedAtMs: clientSubmittedAtMs || serverReceivedAtMs,
        serverReceivedAtMs,
        endsAtEpochMs,
      },
    };

    if (idempotencyKey && this.redisService) {
      await this.redisService.set(
        `idempotency:exam:${idempotencyKey}`,
        { status: 'COMPLETED', result: receipt, completedAt: Date.now() },
        86400,
      );
    }

    return receipt;
    } catch (evalErr) {
      if (idempotencyKey && this.redisService) {
        try {
          const cached = await this.redisService.get<any>(
            `idempotency:exam:${idempotencyKey}`,
          );
          if (cached && cached.status === 'IN_FLIGHT') {
            await this.redisService.del(`idempotency:exam:${idempotencyKey}`);
          }
        } catch {}
      }
      if (attempt.status === 'evaluating') {
        try {
          if (typeof this.attemptRepo.update === 'function') {
            await this.attemptRepo.update(
              { id: attempt.id, status: 'evaluating' as any },
              { status: 'in_progress' as any },
            );
          }
          attempt.status = 'in_progress';
        } catch (revertErr) {
          this.logger.error('Failed to revert attempt status from evaluating to in_progress', revertErr);
        }
      }
      throw evalErr;
    }
  }

  async getStudentResult(id: string, studentUser: any) {
    const assessment = await this.findAssessmentByIdOrCode(id);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    if (!this.isStudentTargeted(assessment, studentUser)) {
      throw new ForbiddenException('This assessment is not assigned to your student account.');
    }

    const studentId = String(studentUser.id || studentUser._id);
    let attempt = await this.attemptRepo.findOne({
      where: [
        {
          assessmentId: assessment.id,
          studentId,
          status: In(['submitted', 'auto_submitted', 'timed_out']),
        },
      ],
      order: { score: 'DESC', submittedAt: 'DESC' },
    });

    if (!attempt) {
      // Look up active attempt (evaluating or in_progress) (AUD-PRF-001)
      const activeAttempt = await this.attemptRepo.findOne({
        where: [
          {
            assessmentId: assessment.id,
            studentId,
            status: In(['in_progress', 'evaluating']),
          },
        ],
      });
      if (activeAttempt?.status === 'evaluating') {
        return {
          success: true,
          status: 'evaluating',
          resultsPending: true,
          message:
            'Your assessment submission is currently being evaluated. Please wait...',
          assessment: {
            title: assessment.title,
            code: assessment.code,
            totalMarks: assessment.totalMarks,
            durationMinutes: assessment.durationMinutes,
          },
          attempt: {
            _id: activeAttempt.id,
            status: 'evaluating',
            startedAt: activeAttempt.startedAt,
          },
        };
      }
      if (activeAttempt && activeAttempt.status === 'in_progress' && this.isAttemptExpired(assessment, activeAttempt)) {
        attempt = await this.autoFinalizeAttempt(assessment, activeAttempt, 'timed_out');
      }
    }

    if (!attempt) {
      throw new BadRequestException('No completed assessment attempt found.');
    }

    const showImmediately = assessment.showResultImmediately ?? true;
    const displaySettings = assessment.resultDisplaySettings || {};

    if (!showImmediately) {
      return {
        success: true,
        resultsPending: true,
        message:
          displaySettings.customSubmissionMessage ||
          'Your assessment has been submitted successfully. Results will be published by your instructor after evaluation.',
        assessment: {
          title: assessment.title,
          code: assessment.code,
          totalMarks: assessment.totalMarks,
          durationMinutes: assessment.durationMinutes,
        },
        attempt: {
          _id: attempt.id,
          status: attempt.status,
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
          timeSpentSeconds: attempt.timeSpentSeconds,
        },
      };
    }

    const questionIds = assessment.questions || [];
    const questions =
      questionIds.length > 0
        ? await this.questionRepo.find({
          where: [{ id: In(questionIds) }, { mongoId: In(questionIds) }],
        })
        : [];
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    const topicStats: Record<
      string,
      { total: number; correct: number; marks: number }
    > = {};

    const reviewQuestions = (attempt.responses || [])
      .map((resp) => {
        const q = questionMap.get(String(resp.questionId));
        if (!q) return null;

        const topic = q.topic || 'General';
        if (!topicStats[topic]) {
          topicStats[topic] = { total: 0, correct: 0, marks: 0 };
        }
        topicStats[topic].total++;
        if (resp.isCorrect) {
          topicStats[topic].correct++;
        }
        topicStats[topic].marks += resp.marksAwarded;

        const revealAnswers =
          assessment.allowReview &&
          displaySettings.showCorrectAnswers !== false;

        return {
          questionId: q.id,
          _id: q.id,
          question: q.question,
          options: q.options,
          selectedAnswer: resp.selectedAnswer,
          correctAnswer: revealAnswers ? q.correctAnswer : undefined,
          explanation: revealAnswers ? q.explanation : undefined,
          isCorrect: resp.isCorrect,
          marksAwarded: resp.marksAwarded,
          topic: q.topic,
          difficulty: q.difficulty,
        };
      })
      .filter(Boolean);

    const topicBreakdown = Object.entries(topicStats).map(([topic, stat]) => ({
      topic,
      total: stat.total,
      correct: stat.correct,
      accuracy: Math.round((stat.correct / stat.total) * 100),
      marksEarned: stat.marks,
    }));

    const submittedCount = await this.attemptRepo.count({
      where: [
        {
          assessmentId: assessment.id,
          studentId,
          status: In(['submitted', 'auto_submitted', 'timed_out']),
        },
      ],
    });

    // Calculate authoritative candidate rank and percentile
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

    const candidateBestAttemptsMap = new Map<string, AssessmentAttempt>();
    for (const att of assessmentAttempts) {
      const sKey = att.studentId ? String(att.studentId) : String(att.studentUid || att.id);
      const existing = candidateBestAttemptsMap.get(sKey);
      if (!existing) {
        candidateBestAttemptsMap.set(sKey, att);
      } else {
        const existingScore = existing.score ?? 0;
        const currentScore = att.score ?? 0;
        if (
          currentScore > existingScore ||
          (currentScore === existingScore && (att.timeSpentSeconds ?? 0) < (existing.timeSpentSeconds ?? 0))
        ) {
          candidateBestAttemptsMap.set(sKey, att);
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
    const targetStudentKey = String(studentId);
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

    const showScore = displaySettings.showScore !== false;
    const showRank = displaySettings.showRankAndPercentile !== false;
    const showTopic = displaySettings.showTopicBreakdown !== false;
    const showReview =
      assessment.allowReview && displaySettings.showQuestionReview !== false;

    return {
      success: true,
      rank: showRank ? rank : undefined,
      totalParticipants: showRank ? totalParticipants : undefined,
      percentile: showRank ? percentile : undefined,
      canRetake:
        assessment.allowedAttempts === 0
          ? true
          : submittedCount <
            (assessment.allowedAttempts !== undefined
              ? assessment.allowedAttempts
              : 1),
      assessment: {
        title: assessment.title,
        code: assessment.code,
        totalMarks: assessment.totalMarks,
        passingMarks: assessment.passingMarks,
        allowReview: assessment.allowReview,
        allowedAttempts:
          assessment.allowedAttempts !== undefined
            ? assessment.allowedAttempts
            : 1,
      },
      attempt: {
        _id: attempt.id,
        status: attempt.status,
        score: showScore ? attempt.score : undefined,
        rawScore: showScore ? (attempt.rawScore ?? attempt.score) : undefined,
        proctoringPenalty: showScore ? (attempt.proctoringPenalty ?? 0) : undefined,
        mode: attempt.mode,
        maxScore: attempt.maxScore,
        percentage: showScore ? attempt.percentage : undefined,
        passed: showScore ? attempt.passed : undefined,
        accuracy: showScore ? attempt.accuracy : undefined,
        totalAttempted: attempt.totalAttempted,
        totalCorrect: showScore ? attempt.totalCorrect : undefined,
        totalWrong: showScore ? attempt.totalWrong : undefined,
        totalSkipped: attempt.totalSkipped,
        timeSpentSeconds: attempt.timeSpentSeconds,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        tabSwitchCount: attempt.tabSwitchCount,
        violations: attempt.violations || [],
      },
      topicBreakdown: showTopic ? topicBreakdown : [],
      reviewQuestions: showReview ? reviewQuestions : [],
    };
  }

  async verifyIdentity(
    id: string,
    dto: { faceDescriptor?: number[]; snapshot?: string },
    studentUser: any,
  ) {
    const studentId = studentUser._id || studentUser.id;
    const assessment = await this.findAssessmentByIdOrCode(id);
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (!this.isStudentTargeted(assessment, studentUser)) {
      throw new ForbiddenException('Assessment is not assigned to you');
    }

    const attempt = await this.attemptRepo.findOne({
      where: [{ assessmentId: assessment.id, studentId, status: 'in_progress' }],
      order: { createdAt: 'DESC' },
    });

    let snapshotUrl = '';
    if (dto.snapshot && this.s3Service) {
      snapshotUrl = await this.s3Service.uploadBase64Image(dto.snapshot, 'proctoring', 'verified-ref');
    }

    const verificationRecord = {
      faceDescriptor: dto.faceDescriptor || [],
      snapshotUrl,
      verifiedAt: new Date().toISOString(),
    };

    if (attempt) {
      (attempt as any).candidateVerification = verificationRecord;
      await this.attemptRepo.save(attempt);
    }

    return {
      success: true,
      verified: true,
      snapshotUrl,
    };
  }

  async recordViolation(
    id: string,
    dto: { type: string; timestamp?: string; details?: string; metadata?: any; evidenceSnapshot?: string },
    studentUser: any,
  ) {
    const studentId = studentUser._id || studentUser.id;
    const assessment = await this.findAssessmentByIdOrCode(id);
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (!this.isStudentTargeted(assessment, studentUser)) {
      throw new ForbiddenException('Assessment is not assigned to you');
    }

    let attempt = await this.attemptRepo.findOne({
      where: [{ assessmentId: assessment.id, studentId, status: 'in_progress' }],
      order: { createdAt: 'DESC' },
    });

    if (!attempt) {
      attempt = await this.attemptRepo.findOne({
        where: [{ assessmentId: assessment.id, studentId }],
        order: { createdAt: 'DESC' },
      });
    }

    if (!attempt) {
      throw new NotFoundException('Active assessment attempt not found');
    }

    let evidenceUrl = '';
    if (dto.evidenceSnapshot && this.s3Service) {
      evidenceUrl = await this.s3Service.uploadBase64Image(dto.evidenceSnapshot, 'proctoring', `violation-${dto.type}`);
    }

    const existingViolations = Array.isArray(attempt.violations) ? attempt.violations : [];
    const warningIndex = existingViolations.length + 1;

    const penaltyPerViolation =
      Number(assessment.proctoring?.violationPenaltyMarks) || 0;
    const isPartialProctored =
      assessment.proctoring?.mode === 'partial_proctored' ||
      (!assessment.proctoring?.autoSubmitOnViolation && penaltyPerViolation > 0);

    const newViolation = {
      type: dto.type,
      timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
      details: dto.details || '',
      evidenceUrl,
      metadata: dto.metadata || {},
      warningIndex,
      penaltyMarks: isPartialProctored ? penaltyPerViolation : 0,
    };

    const totalViolationCount = existingViolations.length + 1;
    const allViolations = [...existingViolations, newViolation];
    // AUD-DAT-006: Prevent unbounded JSONB growth by capping stored violations to 100 entries
    // (retains initial 10 baseline security events and latest 90)
    attempt.violations =
      allViolations.length > 100
        ? [...allViolations.slice(0, 10), ...allViolations.slice(-90)]
        : allViolations;

    if (dto.type === 'tab_switch') {
      attempt.tabSwitchCount = (attempt.tabSwitchCount || 0) + 1;
    }
    if (dto.type === 'fullscreen_exit') {
      attempt.fullscreenExitCount = (attempt.fullscreenExitCount || 0) + 1;
    }

    const faceWarningTypes = new Set([
      'face_not_detected',
      'multiple_faces',
      'face_mismatch',
      'looking_away',
    ]);
    const faceWarningCount = attempt.violations.filter((event: any) =>
      faceWarningTypes.has(event.type),
    ).length;
    const warningLimit = assessment.proctoring?.maxTabSwitches ?? 5;
    const autoSubmitOnViolation =
      assessment.proctoring?.autoSubmitOnViolation !== false &&
      assessment.proctoring?.mode !== 'partial_proctored';
    const forceSubmit = autoSubmitOnViolation && faceWarningCount >= warningLimit;

    const totalPenaltyMarks = isPartialProctored
      ? totalViolationCount * penaltyPerViolation
      : 0;
    attempt.proctoringPenalty = totalPenaltyMarks;

    await this.attemptRepo.save(attempt);

    return {
      success: true,
      warnings: faceWarningCount,
      warningLimit,
      forceSubmit,
      violation: newViolation,
      penaltyDeducted: isPartialProctored ? penaltyPerViolation : 0,
      totalPenaltyMarks,
      mode: assessment.proctoring?.mode || 'fully_proctored',
    };
  }

  async recordProctorCapture(
    id: string,
    dto: { type: string; image: string; filename?: string; timestamp?: string; identifier?: string; project?: string },
    studentUser: any,
  ) {
    const studentId = studentUser._id || studentUser.id;
    const assessment = await this.findAssessmentByIdOrCode(id);
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (!this.isStudentTargeted(assessment, studentUser)) {
      throw new ForbiddenException('Assessment is not assigned to you');
    }

    const attempt = await this.attemptRepo.findOne({
      where: { assessmentId: assessment.id, studentId, status: 'in_progress' },
      order: { createdAt: 'DESC' },
    });
    if (!attempt) throw new NotFoundException('Active assessment attempt not found');

    const capturedAt = dto.timestamp ? new Date(dto.timestamp) : new Date();
    if (Number.isNaN(capturedAt.getTime())) throw new BadRequestException('Invalid capture timestamp');
    if (!this.s3Service) throw new BadRequestException('Proctoring storage is not available');
    const url = await this.s3Service.uploadBase64Image(dto.image, 'proctoring', `capture-${dto.type}`);
    const objectKey = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));

    // Reload fresh attempt state after S3 upload so any student responses saved while upload was in flight are preserved
    const freshAttempt = await this.attemptRepo.findOne({
      where: { id: attempt.id },
    });
    const targetAttempt = freshAttempt || attempt;
    // AUD-DAT-006: Prevent unbounded JSONB growth by capping stored captures to 50 entries
    // (retains initial 5 baseline verification captures and latest 45)
    const MAX_STORED_CAPTURES = 50;
    const captures = Array.isArray((targetAttempt as any).captures) ? (targetAttempt as any).captures : [];
    const allCaptures = [...captures, { type: dto.type, url, objectKey, timestamp: capturedAt, filename: dto.filename }];
    const updatedCaptures =
      allCaptures.length > MAX_STORED_CAPTURES
        ? [...allCaptures.slice(0, 5), ...allCaptures.slice(-45)]
        : allCaptures;
    (targetAttempt as any).captures = updatedCaptures;

    await this.attemptRepo.save(targetAttempt);

    return {
      success: true,
      savedToS3: true,
      url,
      objectKey,
      timestamp: capturedAt.toISOString(),
    };
  }

  async getStudentResumeState(id: string, studentUser: any) {
    const studentId = String(studentUser.id || studentUser._id);
    const assessment = await this.findAssessmentByIdOrCode(id);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    if (!this.isStudentTargeted(assessment, studentUser)) {
      throw new ForbiddenException('This assessment is not assigned to your student account.');
    }

    const latestAttempt = await this.attemptRepo.findOne({
      where: { assessmentId: assessment.id, studentId },
      order: { createdAt: 'DESC' },
    });

    if (!latestAttempt) {
      return {
        success: true,
        hasAttempt: false,
        alreadySubmitted: false,
        remainingSeconds: Number(assessment.durationMinutes || 45) * 60,
        responses: {},
      };
    }

    const isSubmitted = ['completed', 'evaluated', 'timed_out', 'auto_submitted'].includes(
      latestAttempt.status,
    );

    const expiresAt = this.attemptExpiresAt(assessment, latestAttempt);
    const serverEndsAtEpochMs = expiresAt.getTime();
    const serverNowMs = Date.now();
    const remainingSeconds = isSubmitted
      ? 0
      : Math.max(0, Math.floor((serverEndsAtEpochMs - serverNowMs) / 1000));

    const responses: Record<string, any> = {};
    (latestAttempt.responses || []).forEach((r: any) => {
      if (r.questionId) {
        responses[r.questionId.toString()] = {
          selectedAnswer: r.selectedAnswer ?? -1,
          selectedAnswers: r.selectedAnswers,
          code: r.code || '',
          language: r.language,
          status: r.status,
        };
      }
    });

    return {
      success: true,
      hasAttempt: true,
      attemptId: latestAttempt.id,
      alreadySubmitted: isSubmitted,
      remainingSeconds,
      serverEndsAtEpochMs,
      serverNowMs,
      responses,
      resumeDetails: this.resumeDetails(assessment, latestAttempt),
    };
  }

  async saveLockdownFeedback(
    id: string,
    dto: { rating: number; technicalIssues?: string[]; comments?: string; kioskMode?: string },
    studentUser: any,
  ) {
    const studentId = String(studentUser.id || studentUser._id);
    const assessment = await this.findAssessmentByIdOrCode(id);
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    const metadata = {
      rating: Math.min(5, Math.max(1, Number(dto.rating) || 5)),
      technicalIssues: dto.technicalIssues || [],
      comments: dto.comments || '',
      kioskMode: dto.kioskMode || 'unknown',
      submittedAt: new Date().toISOString(),
    };

    if (this.examSecurityService) {
      await this.examSecurityService.reportDirectViolation(
        studentId,
        assessment.id,
        'CANDIDATE_POST_EXAM_FEEDBACK',
        metadata,
      );
    }

    return { success: true };
  }

  async createPracticeMock(id: string, adminUser: any) {
    const original = await this.findAssessmentByIdOrCode(id);
    if (!original) {
      throw new NotFoundException('Assessment not found');
    }

    const mockCode = `${original.code || 'exam'}-mock-${Date.now().toString(36)}`;
    const cloned = this.assessmentRepo.create({
      ...original,
      id: undefined,
      title: `[PRACTICE MOCK] ${original.title}`,
      code: mockCode,
      durationMinutes: 5,
      totalMarks: 10,
      passingMarks: 0,
      status: 'published',
      instructions: [
        'This is a 5-minute non-graded practice mock to verify your CodeSkill LockDown setup and hardware attestation before your exam.',
        'No exam grades or records will be affected by this practice session.',
      ],
      created_by_id: adminUser?.id || adminUser?._id,
    });

    const saved = await this.assessmentRepo.save(cloned);
    return {
      success: true,
      message: '5-Minute Practice Mock created successfully',
      data: saved,
    };
  }

  async getAccommodations(assessmentId: string) {
    const assessment = await this.findAssessmentByIdOrCode(assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');

    if (!this.accommodationRepo) return [];
    return this.accommodationRepo.find({
      where: { assessment_id: assessment.id },
      relations: { user: true },
      order: { created_at: 'DESC' },
    });
  }

  async upsertAccommodation(assessmentId: string, dto: UpsertAccommodationDto, adminUser: any) {
    const assessment = await this.findAssessmentByIdOrCode(assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (!this.accommodationRepo) throw new ServiceUnavailableException('Accommodations repository not ready');

    let existing = await this.accommodationRepo.findOne({
      where: { assessment_id: assessment.id, user_id: dto.userId },
    });

    if (existing) {
      if (dto.timeMultiplier !== undefined) existing.time_multiplier = dto.timeMultiplier;
      if (dto.secondaryDisplayAllowed !== undefined) existing.secondary_display_allowed = dto.secondaryDisplayAllowed;
      if (dto.screenReaderAllowed !== undefined) existing.screen_reader_allowed = dto.screenReaderAllowed;
      if (dto.customNotes !== undefined) existing.custom_notes = dto.customNotes;
      existing.granted_by = adminUser?.id || adminUser?._id;
      return this.accommodationRepo.save(existing);
    } else {
      const created = this.accommodationRepo.create({
        assessment_id: assessment.id,
        user_id: dto.userId,
        time_multiplier: dto.timeMultiplier || 1.0,
        secondary_display_allowed: dto.secondaryDisplayAllowed || false,
        screen_reader_allowed: dto.screenReaderAllowed || false,
        custom_notes: dto.customNotes,
        granted_by: adminUser?.id || adminUser?._id,
      });
      return this.accommodationRepo.save(created);
    }
  }

  async deleteAccommodation(assessmentId: string, userId: string) {
    const assessment = await this.findAssessmentByIdOrCode(assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');
    if (!this.accommodationRepo) return { success: true };

    await this.accommodationRepo.delete({ assessment_id: assessment.id, user_id: userId });
    return { success: true };
  }

  async getInvigilationRoster(assessmentId: string) {
    const assessment = await this.findAssessmentByIdOrCode(assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');

    const attempts = await this.attemptRepo.find({
      where: { assessmentId: assessment.id },
      relations: { student: true },
      order: { startedAt: 'DESC' },
    });

    const accommodations = this.accommodationRepo
      ? await this.accommodationRepo.find({ where: { assessment_id: assessment.id } })
      : [];
    const accMap = new Map(accommodations.map((a) => [a.user_id, a]));

    return attempts.map((att) => {
      const student = att.student || ({} as any);
      const acc = accMap.get(att.studentId);
      const expiresAt = this.attemptExpiresAt(assessment, att);
      return {
        attemptId: att.id,
        studentId: att.studentId,
        studentName: student.name || 'Anonymous Student',
        studentEmail: student.email || '',
        status: att.status,
        score: att.score,
        startedAt: att.startedAt,
        expiresAt,
        timeSpentSeconds: att.timeSpentSeconds,
        tabSwitchCount: att.tabSwitchCount,
        fullscreenExitCount: att.fullscreenExitCount,
        violationsCount: (att.violations || []).length,
        extraTimeGrantedMinutes: att.extraTimeGrantedMinutes || 0,
        gradeHeld: att.gradeHeld || false,
        gradeHoldReason: att.gradeHoldReason || '',
        accommodation: acc ? {
          timeMultiplier: acc.time_multiplier,
          secondaryDisplayAllowed: acc.secondary_display_allowed,
          screenReaderAllowed: acc.screen_reader_allowed,
        } : null,
      };
    });
  }

  async grantExtraTime(assessmentId: string, dto: GrantExtraTimeDto, adminUser: any) {
    const assessment = await this.findAssessmentByIdOrCode(assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');

    const attempt = await this.attemptRepo.findOne({
      where: { assessmentId: assessment.id, studentId: dto.studentId, status: 'in_progress' },
    });

    if (!attempt) {
      throw new NotFoundException('Active in-progress attempt not found for this candidate');
    }

    const current = Number(attempt.extraTimeGrantedMinutes) || 0;
    attempt.extraTimeGrantedMinutes = current + dto.extraMinutes;
    await this.attemptRepo.save(attempt);

    if (this.auditLogRepo) {
      await this.auditLogRepo.save(
        this.auditLogRepo.create({
          action: 'INVIGILATION_EXTRA_TIME_GRANTED',
          target: attempt.id,
          targetType: 'AssessmentAttempt',
          attemptId: attempt.id,
          actorId: adminUser?.id || adminUser?._id,
          actorEmail: adminUser?.email || '',
          metadata: { extraMinutes: dto.extraMinutes, totalExtraMinutes: attempt.extraTimeGrantedMinutes },
        }),
      );
    }

    return {
      success: true,
      message: `Granted ${dto.extraMinutes} minutes of extra time`,
      totalExtraMinutes: attempt.extraTimeGrantedMinutes,
      expiresAt: this.attemptExpiresAt(assessment, attempt),
    };
  }

  async holdGrade(assessmentId: string, dto: GradeHoldDto, adminUser: any) {
    const assessment = await this.findAssessmentByIdOrCode(assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');

    const attempt = await this.attemptRepo.findOne({
      where: { id: dto.attemptId, assessmentId: assessment.id },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');

    attempt.gradeHeld = dto.hold;
    attempt.gradeHoldReason = dto.reason || (dto.hold ? 'Held by invigilator for academic integrity review' : '');
    await this.attemptRepo.save(attempt);

    return {
      success: true,
      gradeHeld: attempt.gradeHeld,
      gradeHoldReason: attempt.gradeHoldReason,
    };
  }

  async getFrictionAnalytics(assessmentId: string) {
    const assessment = await this.findAssessmentByIdOrCode(assessmentId);
    if (!assessment) throw new NotFoundException('Assessment not found');

    const attempts = await this.attemptRepo.find({
      where: { assessmentId: assessment.id },
    });

    const questionStats: Record<string, {
      questionId: string;
      totalAttempts: number;
      totalCorrect: number;
      totalTimeSpentSeconds: number;
      pasteCount: number;
      errorCount: number;
    }> = {};

    attempts.forEach((att) => {
      (att.responses || []).forEach((resp: any) => {
        const qId = String(resp.questionId || resp.id);
        if (!questionStats[qId]) {
          questionStats[qId] = {
            questionId: qId,
            totalAttempts: 0,
            totalCorrect: 0,
            totalTimeSpentSeconds: 0,
            pasteCount: 0,
            errorCount: 0,
          };
        }
        questionStats[qId].totalAttempts += 1;
        if (resp.isCorrect) questionStats[qId].totalCorrect += 1;
        questionStats[qId].totalTimeSpentSeconds += Number(resp.timeSpentSeconds) || 0;
        if (resp.pasteCount) questionStats[qId].pasteCount += Number(resp.pasteCount);
      });
    });

    return Object.values(questionStats).map((stat) => {
      const avgTimeSeconds = stat.totalAttempts > 0 ? Math.round(stat.totalTimeSpentSeconds / stat.totalAttempts) : 0;
      const successRate = stat.totalAttempts > 0 ? Math.round((stat.totalCorrect / stat.totalAttempts) * 100) : 0;
      const frictionScore = Math.min(100, Math.round((100 - successRate) * 0.6 + (stat.pasteCount > 5 ? 20 : 0) + (avgTimeSeconds > 300 ? 20 : 0)));

      return {
        questionId: stat.questionId,
        totalAttempts: stat.totalAttempts,
        successRate,
        averageTimeSpentSeconds: avgTimeSeconds,
        pasteCount: stat.pasteCount,
        frictionScore,
        difficultyTier: frictionScore > 70 ? 'HIGH_FRICTION' : frictionScore > 40 ? 'MODERATE' : 'SMOOTH',
      };
    });
  }
}
