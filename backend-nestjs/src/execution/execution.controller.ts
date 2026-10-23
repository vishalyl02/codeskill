import { canonicalLanguage } from './execution.types';
import { randomUUID } from 'node:crypto';
import { AdminGuard } from '../common/guards/admin.guard';
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  UseGuards,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ExecutionService, Status } from './execution.service';
import { analyzeComplexity } from './complexity-analyzer';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubmissionRateLimitGuard } from '../common/guards/submission-rate-limit.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ExecutionAdmissionService } from './admission/execution-admission.service';

@ApiTags('Execution')
@UseGuards(JwtAuthGuard, SubmissionRateLimitGuard)
@Controller('execution')
export class ExecutionController {
  private readonly logger = new Logger(ExecutionController.name);

  constructor(
    private readonly executionService: ExecutionService,
    @InjectQueue('submissions') private readonly submissionQueue: Queue,
    private readonly admission: ExecutionAdmissionService,
  ) {}

  @Get('health')
  @SkipThrottle()
  @UseGuards(AdminGuard)
  async executionHealth() {
    const runtimes = await this.runtimes();
    const counts = await this.submissionQueue.getJobCounts(
      'waiting',
      'active',
      'failed',
      'completed',
      'delayed',
    );
    const workers = await this.submissionQueue.getWorkers();
    return {
      provider: this.executionService.provider,
      ready: runtimes.some((r) => r.enabled) && workers.length > 0,
      runtimes,
      queue: counts,
      workers: workers.length,
      execution: this.executionService.executionMetrics(),
    };
  }

  @Get('runtimes')
  @SkipThrottle()
  async runtimes() {
    try {
      return await this.executionService.availableLanguages();
    } catch (error) {
      this.logger.error(
        `Failed to retrieve execution runtimes: ${(error as Error)?.message}`,
        (error as Error)?.stack,
      );
      throw new ServiceUnavailableException(
        'Code execution is temporarily unavailable',
      );
    }
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 3, ttl: 1000 },
    medium: { limit: 10, ttl: 10000 },
    long: { limit: 20, ttl: 60000 },
  })
  @ApiOperation({
    summary: 'Execute code against test cases without saving a submission',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'language', 'testCases'],
      properties: {
        code: { type: 'string', description: 'Source code to execute' },
        language: {
          type: 'string',
          enum: [
            'c',
            'cpp',
            'c++',
            'java',
            'python',
            'python3',
            'py',
            'javascript',
            'js',
            'node',
          ],
          description: 'Programming language',
        },
        testCases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              input: { type: 'string', description: 'Stdin input' },
              expected: {
                type: 'string',
                description: 'Expected stdout output',
              },
            },
          },
        },
        config: {
          type: 'object',
          description:
            'Optional execution configuration (timeLimit, memoryLimit, etc.)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Execution results',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        status: { type: 'string', enum: Object.values(Status) },
        results: { type: 'array' },
        runtime: { type: 'number' },
        passedCount: { type: 'number' },
        totalCount: { type: 'number' },
      },
    },
  })
  async runCode(@CurrentUser('id') userId: string, @Body() body: any) {
    const { language, code, testCases, config = {} } = body;

    // Validate required fields
    if (!code || typeof code !== 'string') {
      throw new BadRequestException('Missing or invalid "code" field');
    }
    if (!language || typeof language !== 'string') {
      throw new BadRequestException('Missing or invalid "language" field');
    }
    if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
      throw new BadRequestException('Missing or invalid "testCases" array');
    }

    // Validate supported language
    const supportedLanguages = [
      'c',
      'cpp',
      'c++',
      'java',
      'python',
      'python3',
      'py',
      'javascript',
      'js',
      'node',
      'typescript',
      'ts',
    ];
    if (!supportedLanguages.includes(language.toLowerCase())) {
      throw new BadRequestException(
        `Unsupported language: "${language}". Supported: ${supportedLanguages.join(', ')}`,
      );
    }

    if (!config || typeof config !== 'object' || Array.isArray(config))
      throw new BadRequestException('Invalid execution configuration');
    const allowedConfig = [
      'timeLimit',
      'memoryLimit',
      'executionMode',
      'functionSignature',
      'exactOutput',
      'trimTrailingWhitespace',
      'floatTolerance',
      'floatRelativeTolerance',
      'customInput',
    ];
    if (Object.keys(config).some((key) => !allowedConfig.includes(key)))
      throw new BadRequestException('Unsupported execution configuration');
    for (const key of [
      'timeLimit',
      'memoryLimit',
      'floatTolerance',
      'floatRelativeTolerance',
    ]) {
      if (
        config[key] !== undefined &&
        (typeof config[key] !== 'number' ||
          !Number.isFinite(config[key]) ||
          config[key] < 0)
      )
        throw new BadRequestException('Invalid execution limits');
    }
    this.executionService.validateRequest(code, testCases);
    await this.assertQueueCapacity();
    const executionId = body.executionId || randomUUID();
    const admissionId = await this.admission.reserve(userId, {
      kind: 'run',
      executionId,
      language: canonicalLanguage(language),
      code,
      testCases,
      config,
    });
    let job;
    try {
      job = await this.submissionQueue.add(
        'run-code',
        { code, language, testCases, config, userId, admissionId, executionId },
        {
          attempts: 2,
          jobId: admissionId,
          backoff: { type: 'exponential', delay: 2_000, jitter: 0.25 },
          priority: 1,
          removeOnComplete: { age: 15 * 60, count: 2000 },
          removeOnFail: { age: 60 * 60, count: 2000 },
        },
      );
    } catch {
      await this.admission.release(userId, admissionId);
      throw new ServiceUnavailableException(
        'Unable to queue this execution; retry shortly',
      );
    }
    return {
      success: true,
      status: 'queued',
      jobId: job.id,
      executionId,
      message: 'Execution queued',
    };
  }

  @Post('analyze-complexity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estimate time and space complexity of a solution' })
  async analyzeCodeComplexity(@Body() body: { code: string; language: string }) {
    if (
      typeof body?.code !== 'string' ||
      !body.code.trim() ||
      Buffer.byteLength(body.code) > 1_000_000
    )
      throw new BadRequestException(
        'Source code must be nonempty and at most 1MB',
      );
    if (typeof body?.language !== 'string' || !body.language.trim())
      throw new BadRequestException('language is required');
    return { success: true, ...analyzeComplexity(body.code, body.language) };
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Get an asynchronous execution result' })
  async getJob(
    @CurrentUser('id') userId: string,
    @Param('jobId') jobId: string,
  ) {
    const job = await this.submissionQueue.getJob(jobId);
    if (
      !job ||
      !job.data.userId ||
      String(job.data.userId) !== String(userId)
    ) {
      throw new NotFoundException('Execution job not found');
    }
    const state = await job.getState();
    if (state === 'completed') return job.returnvalue;
    if (state === 'failed') {
      return {
        success: false,
        status: Status.SYSTEM_ERROR,
        message: 'The judge worker could not complete this execution',
        results: [],
        runtime: 0,
        passedCount: 0,
        totalCount: Array.isArray(job.data.testCases)
          ? job.data.testCases.length
          : 0,
      };
    }
    return { success: true, status: state, jobId };
  }

  /**
   * Reject-fast when the runner queue is already saturated, instead of letting
   * a burst of submissions grow an unbounded backlog (and unbounded latency).
   */
  private async assertQueueCapacity(): Promise<void> {
    const maxWaiting = Number(process.env.MAX_QUEUE_WAITING) || 500;
    try {
      const counts = await this.submissionQueue.getJobCounts('waiting');
      if ((counts.waiting ?? 0) >= maxWaiting) {
        throw new ServiceUnavailableException(
          'The execution queue is at capacity. Please retry shortly.',
        );
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(
        'Execution queue status is unavailable',
      );
    }
  }
}
