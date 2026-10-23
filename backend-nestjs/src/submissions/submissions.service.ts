import { ExecutionService } from '../execution/execution.service';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
  Optional,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import { SubmissionStore } from '../database/sharding/submission-store';
import { User } from '../database/entities/user.entity';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppGateway } from '../gateway/app.gateway';
import { RedisService } from '../redis/redis.service';
import {
  SUPPORTED_LANGUAGES,
  canonicalLanguage,
} from '../execution/execution.types';
import { ProblemsService } from '../problems/problems.service';
import { ExecutionAdmissionService } from '../execution/admission/execution-admission.service';

export enum SubmissionStatus {
  QUEUED = 'queued',
  PENDING = 'pending',
  RUNNING = 'running',
  ACCEPTED = 'accepted',
  WRONG_ANSWER = 'wrong_answer',
  TIME_LIMIT_EXCEEDED = 'time_limit_exceeded',
  MEMORY_LIMIT_EXCEEDED = 'memory_limit_exceeded',
  COMPILATION_ERROR = 'compilation_error',
  RUNTIME_ERROR = 'runtime_error',
  INTERNAL_ERROR = 'internal_error',
  CANCELLED = 'cancelled',
}

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(
    private readonly submissionRepo: SubmissionStore,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectQueue('submissions') private submissionQueue: Queue,
    private readonly appGateway: AppGateway,
    private readonly redisService: RedisService,
    private readonly problemsService: ProblemsService,
    @Optional() private readonly executionService?: ExecutionService,
    @Optional() private readonly admission?: ExecutionAdmissionService,
  ) {}

  async createSubmission(userId: string, data: unknown) {
    if (!data || typeof data !== 'object') {
      throw new BadRequestException('Invalid submission payload');
    }
    const { code, language, problemId } = data as Record<string, unknown>;

    if (typeof code !== 'string' || !code) {
      throw new BadRequestException('Missing or invalid code');
    }
    if (!language || typeof language !== 'string') {
      throw new BadRequestException('Missing or invalid language');
    }
    if (typeof problemId !== 'string' || !problemId.trim()) {
      throw new BadRequestException('Missing problemId');
    }

    const langLower = language.trim().toLowerCase();
    const resolvedLanguage = canonicalLanguage(langLower);
    if (!resolvedLanguage) {
      throw new BadRequestException(
        `Unsupported language: "${language}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
      );
    }

    if (Buffer.byteLength(code, 'utf8') > 1_000_000) {
      throw new BadRequestException('Source code exceeds the 1MB limit');
    }

    // Resolve publication and judge data on the server; client source/state is ignored.
    const problem = await this.problemsService.getExecutionProblem(
      problemId.trim(),
    );
    const allowedLanguages = problem.config.supportedLanguages;
    if (
      allowedLanguages.length > 0 &&
      !allowedLanguages.some(
        (language) => canonicalLanguage(language) === resolvedLanguage,
      )
    ) {
      throw new BadRequestException(
        'This language is not enabled for the problem',
      );
    }
    if (!problem.testCases.length) {
      throw new BadRequestException(
        'No test cases configured for this problem',
      );
    }

    if (process.env.CODE_EXECUTION_PROVIDER === 'piston') {
      if (!this.executionService)
        throw new ServiceUnavailableException(
          'Code execution is temporarily unavailable',
        );
      const runtimes = await this.executionService.availableLanguages();
      if (
        !runtimes.some(
          (runtime) => runtime.language === resolvedLanguage && runtime.enabled,
        )
      )
        throw new BadRequestException('This language runtime is unavailable');
    }

    if (!this.admission)
      throw new ServiceUnavailableException(
        'Execution admission control is unavailable',
      );
    const admissionId = await this.admission.reserve(userId, {
      kind: 'submission',
      problemId: problem.id,
      language: resolvedLanguage,
      code,
    });
    const submission = this.submissionRepo.create({
      id: admissionId,
      userId,
      user: { id: userId },
      problemId: problem.id,
      problemSource: problem.source,
      code,
      language: langLower,
      status: SubmissionStatus.QUEUED,
      queuedAt: new Date(),
      testResults: [],
    });
    try {
      await this.submissionRepo.save(submission);
      await this.submissionQueue.add(
        'evaluate-code',
        {
          submissionId: submission.id,
          problemId: problem.id,
          problemSource: problem.source,
          code,
          language: langLower,
          userId,
          admissionId,
        },
        {
          jobId: admissionId,
          attempts: 2,
          backoff: { type: 'exponential', delay: 2_000, jitter: 0.25 },
          priority: 100,
          removeOnComplete: { age: 24 * 60 * 60, count: 5000 },
          removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 },
        },
      );
    } catch {
      try {
        submission.status = SubmissionStatus.INTERNAL_ERROR;
        submission.compileOutput =
          'Unable to queue this submission. Please retry.';
        submission.completedAt = new Date();
        await this.submissionRepo.save(submission);
      } finally {
        await this.admission.release(userId, admissionId);
      }
      throw new ServiceUnavailableException(
        'Unable to queue this submission. Please retry.',
      );
    }

    // Lock the same user row as the judge so counters cannot overwrite a
    // concurrently committed accepted verdict.
    await this.userRepo.manager.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (user) {
        user.stats = {
          ...(user.stats || {}),
          totalSubmissions: (user.stats?.totalSubmissions || 0) + 1,
        };
        await manager.save(User, user);
      }
    });

    // 5. Broadcast initial queued status via WebSocket
    this.appGateway.emitToUser(userId, 'submission_status', {
      submissionId: submission.id,
      status: SubmissionStatus.QUEUED,
      problemId: problem.id,
      queuedAt: submission.queuedAt,
    });

    return { ...submission, _id: submission.id };
  }

  async getSubmissionById(
    userId: string,
    submissionId: string,
    isAdmin = false,
  ) {
    const submission = await this.submissionRepo.findOne({
      where: this.submissionLookup(
        submissionId,
        this.submissionRepo.isSharded && !isAdmin ? userId : undefined,
      ),
      relations: { user: true },
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (
      !isAdmin &&
      submission.userId !== userId &&
      (submission as any).user?.id !== userId
    ) {
      throw new ForbiddenException('Access denied to this submission');
    }

    return { ...submission, _id: submission.id };
  }

  async getSubmissionResult(
    userId: string,
    submissionId: string,
    isAdmin = false,
  ) {
    const submission = await this.getSubmissionById(
      userId,
      submissionId,
      isAdmin,
    );

    let comparison: Awaited<ReturnType<SubmissionStore['performanceComparison']>> | null = null;
    let distribution: Awaited<ReturnType<SubmissionStore['runtimeDistribution']>> | null = null;
    if (submission.status === SubmissionStatus.ACCEPTED) {
      try {
        const language = canonicalLanguage(submission.language);
        const aliases = SUPPORTED_LANGUAGES.filter(
          (alias) => canonicalLanguage(alias) === language,
        );
        comparison = await this.submissionRepo.performanceComparison(submission, aliases);
        distribution = await this.submissionRepo.runtimeDistribution(submission, aliases);
      } catch {
        // Comparison availability must never hide the authoritative verdict.
        this.logger.warn('Submission comparison is temporarily unavailable');
      }
    }

    return {
      submissionId: submission.id,
      _id: submission.id,
      status: submission.status,
      runtime: submission.runtime ?? submission.executionTime,
      memory: submission.memory ?? submission.memoryUsed,
      testCasesPassed: submission.testCasesPassed ?? submission.testsPassed,
      totalTestCases: submission.totalTestCases ?? submission.totalTests,
      compileOutput: submission.compileOutput ?? submission.errorMessage,
      testResults: submission.testResults || [],
      queuedAt: submission.queuedAt,
      startedAt: submission.startedAt,
      completedAt: submission.completedAt,
      comparison,
      distribution,
    };
  }

  async cancelSubmission(
    userId: string,
    submissionId: string,
    isAdmin = false,
  ) {
    const submission = await this.submissionRepo.findOne({
      where: this.submissionLookup(
        submissionId,
        this.submissionRepo.isSharded && !isAdmin ? userId : undefined,
      ),
    });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (!isAdmin && submission.userId !== userId) {
      throw new ForbiddenException('Access denied to this submission');
    }

    if (
      submission.status !== SubmissionStatus.QUEUED &&
      submission.status !== 'pending'
    ) {
      throw new BadRequestException(
        `Cannot cancel submission with status "${submission.status}". Only queued submissions can be cancelled.`,
      );
    }

    const job = await this.submissionQueue.getJob(submissionId);
    if (job) {
      if ((await job.getState()) === 'active')
        throw new BadRequestException(
          'A running submission cannot be cancelled',
        );
      try {
        await job.remove();
      } catch {
        throw new ServiceUnavailableException(
          'Submission could not be cancelled; it may have started running',
        );
      }
    }

    submission.status = SubmissionStatus.CANCELLED;
    submission.completedAt = new Date();
    await this.submissionRepo.save(submission);

    if (this.admission)
      await this.admission.release(submission.userId, submission.id);

    this.appGateway.emitToUser(userId, 'submission_status', {
      submissionId: submission.id,
      status: SubmissionStatus.CANCELLED,
      message: 'Submission cancelled by user',
    });

    return { success: true, message: 'Submission cancelled successfully' };
  }

  private submissionLookup(id: string, userId?: string) {
    const scope = userId ? { userId } : {};
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id,
    )
      ? [
          { id, ...scope },
          { mongoId: id, ...scope },
        ]
      : [{ mongoId: id, ...scope }];
  }

  async getProblemProgress(userId: string, input: string = '') {
    if (typeof input !== 'string' || input.length > 5000) {
      throw new BadRequestException('Provide up to 100 valid problem IDs');
    }
    const ids = [...new Set(input.split(',').map(value => value.trim()).filter(Boolean))];
    if (ids.length > 100 || ids.some(id => !isUUID(id))) {
      throw new BadRequestException('Provide up to 100 valid problem IDs');
    }
    return { data: ids.length ? await this.submissionRepo.problemProgress(userId, ids) : [] };
  }

  async getSubmissionsByProblem(userId: string, problemId: string) {
    const list = await this.submissionRepo.find({
      where: { userId, problemId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    return list.map((s) => ({ ...s, _id: s.id }));
  }

  async getProblemStats(problemId: string) {
    const totals = await this.submissionRepo.problemStats(problemId);
    return {
      problemId,
      totalSubmissions: totals.totalSubmissions,
      acceptedSubmissions: totals.acceptedSubmissions,
      acceptanceRate:
        totals.totalSubmissions > 0
          ? Math.round((totals.acceptedSubmissions / totals.totalSubmissions) * 1000) / 10
          : 0,
      solvers: totals.solvers,
      acceptedSolvers: totals.acceptedSolvers,
    };
  }

  async getRecentSubmissions(userId: string) {
    const list = await this.submissionRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 20,
    });
    return list.map((s) => ({ ...s, _id: s.id }));
  }

  async getSubmissionsByUser(
    userId: string,
    query: {
      page?: number;
      limit?: number;
      problemId?: string;
      status?: string;
    },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (query.problemId) where.problemId = query.problemId;
    if (query.status) where.status = query.status;

    const [submissions, total] = await this.submissionRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      submissions: submissions.map((s) => ({ ...s, _id: s.id })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserStats(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: {
        id: true,
        stats: true,
        badges: true,
        activityMap: true,
        name: true,
        avatar: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const totalSubmissions = await this.submissionRepo.count({
      where: { userId },
    });
    const acceptedSubmissions = await this.submissionRepo.count({
      where: { userId, status: 'accepted' },
    });

    return {
      user: { ...user, _id: user.id },
      totalSubmissions,
      acceptedSubmissions,
      acceptanceRate:
        totalSubmissions > 0
          ? (acceptedSubmissions / totalSubmissions) * 100
          : 0,
    };
  }
}
