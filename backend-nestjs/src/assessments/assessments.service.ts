import { canonicalLanguage } from '../execution/execution.types';
import { PistonUnavailableError } from '../execution/piston/piston.types';
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
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
  ) {}

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
      dto.sections.forEach((sec) => {
        sec.questions.forEach((q) => {
          questionObjIds.push(String(q.questionId));
          totalMarks += q.marks || 1;
        });
        sectionsToSave.push({
          title: sec.title,
          description: sec.description || '',
          order: sec.order || 0,
          timeLimit: sec.timeLimit || 0,
          questions: sec.questions.map((q) => ({
            questionId: String(q.questionId),
            marks: q.marks || 1,
            negativeMarks: q.negativeMarks || 0,
            order: q.order || 0,
          })),
        });
      });
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
      targetSections: dto.targetSections || [],
      targetSemesters: dto.targetSemesters || [],
      targetGroups: this.normalizeTargetGroups(dto.targetGroups || []),
      startTime: dto.startTime ? new Date(dto.startTime) : undefined,
      endTime: dto.endTime ? new Date(dto.endTime) : undefined,
      shuffleQuestions: dto.shuffleQuestions ?? true,
      shuffleOptions: dto.shuffleOptions ?? true,
      showResultImmediately: dto.showResultImmediately ?? true,
      allowReview: dto.allowReview ?? true,
      allowedAttempts:
        dto.allowedAttempts !== undefined ? Number(dto.allowedAttempts) : 1,
      proctoring: dto.proctoring || {
        enforceFullscreen: true,
        blockCopyPaste: true,
        detectTabSwitch: true,
        maxTabSwitches: 3,
        autoSubmitOnViolation: true,
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
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id }, { mongoId: id }],
      relations: { createdBy: true },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    // Populate question details
    let questionsList: Question[] = [];
    if (assessment.questions && assessment.questions.length > 0) {
      questionsList = await this.questionRepo.find({
        where: [
          { id: In(assessment.questions) },
          { mongoId: In(assessment.questions) },
        ],
      });
    }

    const qMap = new Map(questionsList.map((q) => [q.id, { ...q, _id: q.id }]));

    // Populate questions in sections if present
    const sections = (assessment.sections || []).map((sec) => ({
      ...sec,
      questions: sec.questions.map((q) => ({
        ...q,
        questionId: qMap.get(String(q.questionId)) || q.questionId,
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

    if (dto.title !== undefined) assessment.title = dto.title;
    if (dto.code !== undefined) assessment.code = dto.code.toUpperCase().trim();
    if (dto.description !== undefined) assessment.description = dto.description;
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
    if (dto.targetSections !== undefined)
      assessment.targetSections = dto.targetSections;
    if (dto.targetSemesters !== undefined)
      assessment.targetSemesters = dto.targetSemesters;
    if (dto.targetGroups !== undefined)
      assessment.targetGroups = this.normalizeTargetGroups(dto.targetGroups);
    if (!assessment.created_by_id && (adminUser?.id || adminUser?._id)) {
      assessment.created_by_id = adminUser.id || adminUser._id;
    }

    if (dto.proctoring) {
      assessment.proctoring = {
        ...assessment.proctoring,
        ...dto.proctoring,
      };
    }

    if (
      dto.sections &&
      Array.isArray(dto.sections) &&
      dto.sections.length > 0
    ) {
      const qIds: string[] = [];
      let tMarks = 0;
      const sectionsToSave: any[] = [];

      dto.sections.forEach((sec) => {
        sec.questions.forEach((q) => {
          qIds.push(String(q.questionId));
          tMarks += q.marks || 1;
        });
        sectionsToSave.push({
          title: sec.title,
          description: sec.description || '',
          order: sec.order || 0,
          timeLimit: sec.timeLimit || 0,
          questions: sec.questions.map((q) => ({
            questionId: String(q.questionId),
            marks: q.marks || 1,
            negativeMarks: q.negativeMarks || 0,
            order: q.order || 0,
          })),
        });
      });
      assessment.sections = sectionsToSave;
      assessment.questions = qIds;
      assessment.totalMarks = tMarks;
    } else if (dto.questionIds && Array.isArray(dto.questionIds)) {
      const qIds = dto.questionIds.map((qId) => String(qId));
      assessment.questions = qIds;
      const questionsList = await this.questionRepo.find({
        where: [{ id: In(qIds) }, { mongoId: In(qIds) }],
      });
      assessment.totalMarks = questionsList.reduce(
        (sum, q) => sum + (q.marks || 1),
        0,
      );
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

  async getAssessmentResults(id: string) {
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
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
          attemptNumber: studentAttempts.length,
          totalAttempts: studentAttempts.length,
          score: maxScore,
          highestScore: maxScore,
          passed: hasPassed,
          allAttempts: studentAttempts
            .sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0))
            .map((a, idx) => ({
              _id: a.id,
              attemptNumber: a.attemptNumber || idx + 1,
              score: a.score ?? 0,
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
        score: a.score ?? 0,
        maxScore: a.maxScore || assessment.totalMarks || 100,
        percentage: a.percentage ?? 0,
        passed: a.passed,
        status: a.status,
        submittedAt: a.submittedAt || (a as any).createdAt || a.startedAt,
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

  private normalizeTargetGroups(groups: string[]): string[] {
    return [...new Set((groups || []).map((group) =>
      String(group).trim().replace(/^group[\s_-]*/i, '').toUpperCase(),
    ).filter((group) => group === 'A' || group === 'B'))];
  }

  private isStudentTargeted(assessment: Assessment, studentUser: any): boolean {
    const profile = studentUser.studentProfile || {};
    const batch = profile.batch || '';
    const department = profile.department || '';
    const studentKeys = [studentUser.id, studentUser._id, studentUser.uid]
      .filter(Boolean)
      .map(String);
    const group = String(profile.group || '')
      .trim()
      .replace(/^group[\s_-]*/i, '')
      .toUpperCase();
    const matches = (targets: string[] | undefined, value: string) =>
      !targets?.length || (!!value && targets.includes(String(value)));

    return (
      (!assessment.targetStudentIds?.length ||
        studentKeys.some((key) => assessment.targetStudentIds.includes(key))) &&
      matches(assessment.targetBatches, batch) &&
      matches(assessment.targetDepartments, department) &&
      matches(assessment.targetCourses, profile.course || '') &&
      matches(
        assessment.targetSemesters,
        profile.semester == null ? '' : String(profile.semester),
      ) &&
      matches(assessment.targetSections, profile.section || '') &&
      matches(assessment.targetGroups, group)
    );
  }

  async getStudentAssessments(studentUser: any) {
    const studentProfile = studentUser.studentProfile || {};

    const assessments = await this.assessmentRepo
      .createQueryBuilder('a')
      .where('a.status IN (:...statuses)', {
        statuses: ['published', 'ongoing'],
      })
      .orderBy('a.createdAt', 'DESC')
      .getMany();

    const filteredAssessments = assessments.filter((assessment) =>
      this.isStudentTargeted(assessment, studentUser),
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
        attemptStatus: isCompleted
          ? 'submitted'
          : inProgressAttempt
            ? 'in_progress'
            : 'not_started',
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
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    if (!this.isStudentTargeted(assessment, studentUser)) {
      throw new ForbiddenException('This assessment is not assigned to your student account.');
    }

    const studentId = String(studentUser.id || studentUser._id);
    const whereConditions: any[] = [{ assessmentId: assessment.id, studentId }];
    if (id && id !== assessment.id) {
      whereConditions.push({ assessmentId: id, studentId });
    }
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
        }
        : null,
      canRetake,
      completedAttemptsCount: completedCount,
      highestScore,
    };
  }

  async startStudentAttempt(id: string, studentUser: any) {
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id }, { mongoId: id }],
    });
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
        { assessmentId: id, studentId, status: 'in_progress' },
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
          {
            assessmentId: id,
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
          questionType: q.questionType,
          topic: q.topic,
          subtopic: q.subtopic,
          difficulty: q.difficulty,
          marks: q.marks || 1,
          negativeMarks: assessment.negativeMarking ? q.negativeMarks || 0 : 0,
          options: optionOrder ? optionOrder.map((index) => options[index]) : options,
          codeSnippet: q.codeSnippet,
          starterCode:
            (q.metadata as any)?.starterCode ||
            (q.questionType === 'coding' ? q.codeSnippet || '' : ''),
          language: q.language || 'python',
          constraints:
            Array.isArray(q.constraints) && q.constraints.length > 0
              ? q.constraints
              : (q.metadata as any)?.constraints || [],
          timeLimit: q.timeLimit || (q.metadata as any)?.timeLimit || 2000,
          memoryLimit: q.memoryLimit || (q.metadata as any)?.memoryLimit || 256,
          testCases: (((q.metadata as any)?.testCases || []) as any[])
            .filter((tc: any) => !tc.isHidden)
            .map((tc: any, tcIdx: number) => ({
              id: tc.id || String(tcIdx + 1),
              input: tc.input || '',
              expected: tc.output || tc.expected || '',
              output: tc.output || tc.expected || '',
              explanation: tc.explanation || '',
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
      proctoring: assessment.proctoring,
      questions: sanitizedQuestions,
      savedResponses: attempt.responses,
    };
  }

  async retakeStudentAttempt(id: string, studentUser: any) {
    const studentId = String(studentUser.id || studentUser._id);
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }
    if (!this.isStudentTargeted(assessment, studentUser)) {
      throw new ForbiddenException('This assessment is not assigned to your student account.');
    }

    const targetAssessmentId = assessment?.id || id;

    await this.attemptRepo.delete({
      assessmentId: targetAssessmentId,
      studentId,
      status: 'in_progress',
    });
    await this.attemptRepo.delete({
      assessmentId: id,
      studentId,
      status: 'in_progress',
    });

    return this.startStudentAttempt(id, studentUser);
  }

  async saveProgress(id: string, dto: SubmitAssessmentDto, studentUser: any) {
    const studentId = String(studentUser.id || studentUser._id);
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (assessment && !this.isStudentTargeted(assessment, studentUser)) {
      throw new ForbiddenException('This assessment is not assigned to your student account.');
    }
    const targetAssessmentId = assessment?.id || id;

    const attempt = await this.attemptRepo.findOne({
      where: {
        assessmentId: targetAssessmentId,
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
      attempt.violations = dto.violations.map((v) => ({
        type: v.type,
        timestamp: v.timestamp ? new Date(v.timestamp) : new Date(),
        details: v.details || '',
      }));
      attempt.tabSwitchCount = attempt.violations.filter(
        (v) => v.type === 'tab_switch',
      ).length;

      for (const v of dto.violations) {
        this.logger.warn({
          event: 'ASSESSMENT_VIOLATION_RECORDED',
          assessmentId: targetAssessmentId,
          attemptId: attempt.id,
          studentId,
          violationType: v.type,
          details: v.details,
        });
      }
    }

    await this.attemptRepo.save(attempt);
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
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id }, { mongoId: id }],
    });
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
        { assessmentId: id, studentId },
      ],
      order: { startedAt: 'DESC' },
    });

    if (!attempt) {
      return this.getStudentResult(id, studentUser);
    }

    // NEW-001: Candidate attempt ownership validation
    if (attempt.studentId !== studentId) {
      throw new ForbiddenException('You do not own this assessment attempt');
    }

    // NEW-003: Idempotent submission: if already submitted, return the final scorecard
    if (attempt.status === 'submitted' || attempt.status === 'auto_submitted') {
      return this.getStudentResult(id, studentUser);
    }

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

    // SERVER-SIDE EVALUATION (AUD-002 & NEW-003)
    const questionIds = assessment.questions || [];
    const questions =
      questionIds.length > 0
        ? await this.questionRepo.find({
          where: [{ id: In(questionIds) }, { mongoId: In(questionIds) }],
        })
        : [];
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    let totalScore = 0;
    let totalAttempted = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalSkipped = 0;

    const evaluatedResponses: any[] = [];

    for (const r of dto.responses || []) {
      const q = questionMap.get(String(r.questionId));
      if (!q) {
        evaluatedResponses.push({
          questionId: String(r.questionId),
          selectedAnswer: r.selectedAnswer ?? -1,
          isCorrect: false,
          marksAwarded: 0,
          timeSpentSeconds: r.timeSpentSeconds || 0,
          status: 'skipped',
        });
        continue;
      }

      const qType = (q.questionType || '').toLowerCase();
      const optionOrder = this.getQuestionOptionOrderByQuestionId(attempt, q.id);
      const selectedAnswer = this.mapDisplayedAnswerToCanonical(
        r.selectedAnswer, optionOrder,
      ) as number | undefined;
      const selectedAnswers = this.mapDisplayedAnswerToCanonical(
        r.selectedAnswers, optionOrder,
      ) as number[] | undefined;
      const isCoding =
        qType === 'coding' || qType === 'algorithmic' || qType === 'dsa';
      let isAttempted = false;
      let isCorrect = false;
      let marksAwarded = 0;
      let testCasesPassed = 0;
      let totalTestCases = 0;

      if (isCoding) {
        const hasCode = r.code && r.code.trim().length > 0;
        if (hasCode) {
          isAttempted = true;
          totalAttempted++;

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
          const testCases = Array.isArray(q.testCases) ? q.testCases : [];
          totalTestCases = testCases.length;

          if (this.executionService && totalTestCases > 0) {
            try {
              const tcInputs = testCases.map((tc, idx) => ({
                id: tc.id || idx + 1,
                input: tc.input || '',
                expected: tc.expectedOutput || '',
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

          if (isCorrect) totalCorrect++;
          else if (ratio > 0) totalCorrect++;
          else totalWrong++;
        } else {
          totalSkipped++;
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
            totalAttempted++;
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
              totalCorrect++;
            } else {
              const negMarks = assessment.negativeMarking
                ? q.negativeMarks || 0
                : 0;
              marksAwarded = negMarks > 0 ? -negMarks : 0;
              totalWrong++;
            }
          } else {
            totalSkipped++;
          }
        } else {
          // Single-choice MCQ
          isAttempted = selectedAnswer !== undefined && selectedAnswer >= 0;
          if (isAttempted) {
            totalAttempted++;
            isCorrect = selectedAnswer === q.correctAnswer;
            if (isCorrect) {
              marksAwarded = q.marks || 1;
              totalCorrect++;
            } else {
              const negMarks = assessment.negativeMarking
                ? q.negativeMarks || 0
                : 0;
              marksAwarded = negMarks > 0 ? -negMarks : 0;
              totalWrong++;
            }
          } else {
            totalSkipped++;
          }
        }
      }

      totalScore += marksAwarded;

      evaluatedResponses.push({
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
      });
    }

    const finalScore = Math.max(0, Math.round(totalScore * 100) / 100);
    const maxScore = assessment.totalMarks || 1;
    const percentage = Math.round((finalScore / maxScore) * 1000) / 10;
    const passed = finalScore >= (assessment.passingMarks || 0);
    const accuracy =
      totalAttempted > 0
        ? Math.round((totalCorrect / totalAttempted) * 100)
        : 0;

    const violations = (dto.violations || []).map((v) => ({
      type: v.type,
      timestamp: v.timestamp ? new Date(v.timestamp) : new Date(),
      details: v.details || '',
    }));
    const tabSwitches = violations.filter(
      (v) => v.type === 'tab_switch',
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
    attempt.violations = violations;

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
  }

  async getStudentResult(id: string, studentUser: any) {
    const assessment = await this.assessmentRepo.findOne({
      where: [{ id }, { mongoId: id }],
    });
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
        {
          assessmentId: id,
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

    return {
      success: true,
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
      },
      topicBreakdown,
      reviewQuestions: assessment.allowReview ? reviewQuestions : [],
    };
  }
}
