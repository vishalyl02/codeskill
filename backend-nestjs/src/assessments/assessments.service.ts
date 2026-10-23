
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
import { Question } from '../database/entities/question.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';
import { ExecutionService } from '../execution/execution.service';
import { ExecutionAdmissionService } from '../execution/admission/execution-admission.service';
import { randomUUID } from 'node:crypto';
import { S3Service } from '../s3/s3.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EvaluateAssessmentCodeDto } from './dto/evaluate-code.dto';
import { normalizeSectionIdentifier } from '../common/constants/sections.constant';

function codingTestCases(question: Question): Array<{ id: string | number; input: string; expected: string; isHidden: boolean }> {
  const cases = question.testCases?.length ? question.testCases : (question.metadata as any)?.testCases || [];
  return cases.map((tc: any, index: number) => ({
    id: tc.id || index + 1, input: tc.input || '',
    expected: tc.expectedOutput ?? tc.output ?? tc.expected ?? '', isHidden: tc.isHidden === true,
  }));
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
  ) {}

  private attemptExpiresAt(assessment: Assessment, attempt: AssessmentAttempt): Date {
    const durationMinutes = Number(assessment.durationMinutes) > 0
      ? Number(assessment.durationMinutes)
      : 45;
    const durationDeadline = new Date(attempt.startedAt).getTime() + durationMinutes * 60_000;
    const windowDeadline = assessment.endTime
      ? new Date(assessment.endTime).getTime()
      : Infinity;
    return new Date(Math.min(durationDeadline, windowDeadline));
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

  async findAll(query: any = {}) {
    const qb = this.assessmentRepo
      .createQueryBuilder('assessment')
      .leftJoinAndSelect('assessment.createdBy', 'createdBy')
      .orderBy('assessment.createdAt', 'DESC');

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

  async findById(id: string) {
    const assessment = await this.findAssessmentByIdOrCode(id, { createdBy: true });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
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

    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        action: 'UPDATE_ASSESSMENT',
        actorId: adminUser?.id || adminUser?._id,
        actorEmail: adminUser?.email || '',
        targetType: 'Assessment',
        assessmentId: assessment.id,
        target: assessment.title,
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

    const uniqueCandidates = Array.from(studentAttemptsMap.entries()).map(
      ([key, studentAttempts]) => {
        const submitted = studentAttempts.filter(
          (a) => a.status === 'submitted' || a.status === 'auto_submitted',
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

        return {
          ...best,
          _id: best?.id,
          candidateVerification: (best as any)?.candidateVerification || null,
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
      (c) => c.status === 'submitted' || c.status === 'auto_submitted',
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
          (a) => a.status === 'submitted' || a.status === 'auto_submitted',
        ).length,
      },
      attempts: uniqueCandidates,
      rawAttempts: attempts.map((a, idx) => ({
        _id: a.id,
        id: a.id,
        studentId: a.studentId,
        studentUid: a.studentUid,
        studentName: a.studentName,
        studentEmail: a.studentEmail,
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
        submittedAt: a.submittedAt || null,
        timeSpentSeconds: a.timeSpentSeconds || 0,
        tabSwitchCount: a.tabSwitchCount || 0,
        violations: a.violations || [],
        responses: a.responses || [],
      })),
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
    const studentKeys = [studentUser.id, studentUser._id, studentUser.uid]
      .filter(Boolean)
      .map(String);
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
      (!assessment.targetStudentIds?.length || studentKeys.some((key) => assessment.targetStudentIds.includes(key))) &&
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

    const items = filteredAssessments.map((a) => {
      const allForAssessment = existingAttempts.filter(
        (att) => att.assessmentId === a.id || att.assessmentId === a.mongoId,
      );
      const submittedAttempts = allForAssessment.filter(
        (att) => att.status === 'submitted' || att.status === 'auto_submitted',
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

    const submittedAttempts = allAttempts.filter(
      (a) => a.status === 'submitted' || a.status === 'auto_submitted',
    );
    const inProgressAttempt = allAttempts.find(
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
      inProgressAttempt || (allAttempts.length > 0 ? allAttempts[0] : null);

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
        proctoring: assessment.proctoring,
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
            status: In(['submitted', 'auto_submitted']),
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

      const orderedIds = this.buildDifficultyBalancedQuestionIds(
        questionsList,
        Math.min(questionsList.length, assessment.questions?.length || questionsList.length),
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

      await this.attemptRepo.save(attempt);
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

    const sanitizedQuestions = (attempt.questionOrder || [])
      .map((qId, index) => {
        const q = qMap.get(String(qId));
        if (!q) return null;
        const options = Array.isArray(q.options)
          ? q.options.map((opt: any) =>
            typeof opt === 'string' ? opt : opt?.text || String(opt || ''),
          )
          : [];
        const optionOrder = this.getQuestionOptionOrderByQuestionId(attempt, q.id);
        return {
          _id: q.id,
          id: q.id,
          questionIndex: index + 1,
          question: q.question,
          description: q.problemStatement || q.description || '',
          questionType: q.questionType,
          topic: q.topic,
          subtopic: q.subtopic,
          difficulty: q.difficulty,
          marks: q.marks || 1,
          negativeMarks: assessment.negativeMarking ? q.negativeMarks || 0 : 0,
          options: optionOrder ? optionOrder.map((index) => options[index]) : options,
          starterCode: Array.isArray(q.starterCode)
            ? q.starterCode
            : (q.metadata as any)?.starterCode || [],
          codeSnippet: q.codeSnippet,
          language: q.language || 'python',
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

    return {
      success: true,
      attemptId: attempt.id,
      _id: attempt.id,
      startedAt: attempt.startedAt,
      durationMinutes: assessment.durationMinutes,
      ...this.resumeDetails(assessment, attempt),
      proctoring: assessment.proctoring,
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
    if (!language || (question.supportedLanguages?.length && !question.supportedLanguages.some(value => canonicalLanguage(value) === language)))
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
        config: { timeLimit: question.timeLimit, memoryLimit: question.memoryLimit },
      }, {
        jobId: admissionId, attempts: 2, backoff: { type: 'exponential', delay: 2000 },
        priority: 1, removeOnComplete: { age: 900, count: 2000 }, removeOnFail: { age: 3600, count: 2000 },
      });
      return { success: true, status: 'queued', jobId: job.id };
    } catch {
      await this.admission.release(studentId, admissionId);
      throw new ServiceUnavailableException('Unable to queue assessment code; retry shortly');
    }
  }

  async saveProgress(id: string, dto: SubmitAssessmentDto, studentUser: any) {
    const studentId = String(studentUser.id || studentUser._id);
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
    return { success: true, message: 'Progress saved successfully.' };
  }

  async submitAttempt(id: string, dto: SubmitAssessmentDto, studentUser: any) {
    const hasCode = dto.responses?.some(
      (response) =>
        typeof response.code === 'string' && response.code.trim().length > 0,
    );
    if (!hasCode) return this.evaluateAttempt(id, dto, studentUser);
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
      return await this.evaluateAttempt(id, dto, studentUser);
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      await this.admission.release(userId, reservation, owner);
    }
  }

  private async evaluateAttempt(
    id: string,
    dto: SubmitAssessmentDto,
    studentUser: any,
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
    if (attempt.status === 'submitted' || attempt.status === 'auto_submitted') {
      return this.getStudentResult(assessment.id, studentUser);
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
          if (rechecked?.status === 'submitted' || rechecked?.status === 'auto_submitted') {
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
    if (assessment.endTime) {
      const deadline = new Date(assessment.endTime);
      if (now > deadline) {
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
            if (
              !submittedLanguage ||
              (q.supportedLanguages?.length &&
                !q.supportedLanguages.some(
                  (lang) => canonicalLanguage(lang) === submittedLanguage,
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
          status: In(['submitted', 'auto_submitted']),
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

    return {
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
    };
    } catch (evalErr) {
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
    const attempt = await this.attemptRepo.findOne({
      where: [
        {
          assessmentId: assessment.id,
          studentId,
          status: In(['submitted', 'auto_submitted']),
        },
      ],
      order: { score: 'DESC', submittedAt: 'DESC' },
    });

    if (!attempt) {
      throw new BadRequestException('No completed assessment attempt found.');
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

        return {
          questionId: q.id,
          _id: q.id,
          question: q.question,
          options: q.options,
          selectedAnswer: resp.selectedAnswer,
          correctAnswer: assessment.allowReview ? q.correctAnswer : undefined,
          explanation: assessment.allowReview ? q.explanation : undefined,
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
          status: In(['submitted', 'auto_submitted']),
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

    return {
      success: true,
      rank,
      totalParticipants,
      percentile,
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
        score: attempt.score,
        rawScore: attempt.rawScore ?? attempt.score,
        proctoringPenalty: attempt.proctoringPenalty ?? 0,
        mode: attempt.mode,
        maxScore: attempt.maxScore,
        percentage: attempt.percentage,
        passed: attempt.passed,
        accuracy: attempt.accuracy,
        totalAttempted: attempt.totalAttempted,
        totalCorrect: attempt.totalCorrect,
        totalWrong: attempt.totalWrong,
        totalSkipped: attempt.totalSkipped,
        timeSpentSeconds: attempt.timeSpentSeconds,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        tabSwitchCount: attempt.tabSwitchCount,
        violations: attempt.violations || [],
      },
      topicBreakdown,
      reviewQuestions: assessment.allowReview ? reviewQuestions : [],
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

    attempt.violations = [...existingViolations, newViolation];
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
      ? attempt.violations.length * penaltyPerViolation
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
    const captures = Array.isArray((targetAttempt as any).captures) ? (targetAttempt as any).captures : [];
    const updatedCaptures = [...captures, { type: dto.type, url, objectKey, timestamp: capturedAt, filename: dto.filename }];
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
}
