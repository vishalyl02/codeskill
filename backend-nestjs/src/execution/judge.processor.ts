import {
  JudgeCapacityError,
  PistonUnavailableError,
} from './piston/piston.types';
import { ExecutionAdmissionService } from './admission/execution-admission.service';
import { randomUUID } from 'node:crypto';
import { DelayedError, UnrecoverableError } from 'bullmq';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExecutionService } from './execution.service';
import { SubmissionStore } from '../database/sharding/submission-store';
import { ProblemsService } from '../problems/problems.service';
import { Submission } from '../database/entities/submission.entity';
import { User } from '../database/entities/user.entity';
import { AppGateway } from '../gateway/app.gateway';
import { RedisService } from '../redis/redis.service';
import { Status } from './execution.types';
import * as os from 'os';
import { presentTestResults, executionMetrics, scoreComparison } from './result-presentation';

export enum SubmissionStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  TESTING = 'testing',
  ACCEPTED = 'accepted',
  WRONG_ANSWER = 'wrong_answer',
  TIME_LIMIT_EXCEEDED = 'time_limit_exceeded',
  MEMORY_LIMIT_EXCEEDED = 'memory_limit_exceeded',
  COMPILATION_ERROR = 'compilation_error',
  RUNTIME_ERROR = 'runtime_error',
  SYSTEM_ERROR = 'system_error',
}

const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 10;

@Processor('submissions', { concurrency: WORKER_CONCURRENCY })
export class JudgeProcessor extends WorkerHost {
  private readonly logger = new Logger(JudgeProcessor.name);
  private readonly runnerId =
    process.env.RUNNER_ID || `runner-${os.hostname()}-${process.pid}`;

  constructor(
    private readonly executionService: ExecutionService,
    private readonly submissionRepo: SubmissionStore,
    private readonly problemsService: ProblemsService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly appGateway: AppGateway,
    private readonly redisService: RedisService,
    @Optional() private readonly admission?: ExecutionAdmissionService,
  ) {
    super();
    this.logger.log(
      `JudgeProcessor initialized on runner: ${this.runnerId} (concurrency: ${WORKER_CONCURRENCY})`,
    );
  }

  async process(job: Job<any, any, string>, token?: string): Promise<any> {
    const { admissionId, userId } = job.data as {
      admissionId?: string;
      userId?: string;
    };
    if (!admissionId) return this.processJob(job);
    if (!userId || !this.admission)
      throw new UnrecoverableError('Execution admission control is required');
    const owner = randomUUID();
    if (job.timestamp && Date.now() - job.timestamp > this.admission.leaseMs) {
      await this.admission.release(userId, admissionId);
      throw new UnrecoverableError('Execution queue deadline expired');
    }
    const claim = await this.admission.claim(userId, admissionId, owner);
    if (claim === 'busy') {
      // A stalled replay must not consume retries or release the original owner.
      if (!token) throw new PistonUnavailableError();
      await job.moveToDelayed(
        Date.now() + this.admission.heartbeatMs * 2,
        token,
      );
      throw new DelayedError();
    }
    if (claim === 'expired') {
      if (job.name === 'evaluate-code') {
        const submission = await this.submissionRepo.findOne({
          where: { id: job.data.submissionId, userId },
        });
        if (submission && !submission.completedAt) {
          submission.status = 'cancelled';
          submission.completedAt = new Date();
          submission.compileOutput =
            'This execution expired while waiting in the queue. Please submit again.';
          await this.submissionRepo.save(submission);
        }
      }
      throw new UnrecoverableError('Execution reservation expired');
    }
    let renewing = false,
      retry = false;
    const heartbeat = setInterval(() => {
      if (renewing) return;
      renewing = true;
      void this.admission!.renew(userId, admissionId, owner)
        .catch(() => this.logger.warn('Execution lease heartbeat unavailable'))
        .finally(() => {
          renewing = false;
        });
    }, this.admission.heartbeatMs);
    heartbeat.unref();
    try {
      return await this.processJob(job);
    } catch (error) {
      if (error instanceof JudgeCapacityError && token) {
        retry = true;
        this.appGateway.emitToUser(
          userId,
          job.name === 'run-code' ? 'run_status' : 'submission_status',
          {
            jobId: job.id,
            submissionId: job.data.submissionId,
            status: SubmissionStatus.QUEUED,
            message: 'Waiting for available judge capacity.',
          },
        );
        await job.moveToDelayed(
          Date.now() + 2000 + Math.floor(Math.random() * 2000),
          token,
        );
        throw new DelayedError();
      }
      retry =
        error instanceof PistonUnavailableError &&
        job.attemptsMade + 1 < (job.opts?.attempts || 1);
      throw error;
    } finally {
      clearInterval(heartbeat);
      if (retry) await this.admission.unclaim(userId, admissionId, owner);
      else await this.admission.release(userId, admissionId, owner);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job | undefined, error: Error) {
    if (
      !job ||
      (job.attemptsMade < (job.opts.attempts || 1) &&
        !(error instanceof UnrecoverableError))
    )
      return;
    if (job.name === 'evaluate-code') {
      // Covers failures before processJob (e.g. admission Redis unavailable).
      // Never overwrite a verdict already committed by a stalled worker.
      const { userId, submissionId } = job.data;
      if (userId && submissionId) {
        try {
          const changed = await this.submissionRepo.transaction(
            userId,
            async (manager) => {
              const sub = await manager.findOne(Submission, {
                where: { id: submissionId },
                lock: { mode: 'pessimistic_write' },
              });
              if (!sub || sub.completedAt) return false;
              sub.status = SubmissionStatus.SYSTEM_ERROR;
              sub.compileOutput =
                'Code execution is temporarily unavailable. Please submit again.';
              sub.completedAt = new Date();
              await manager.save(Submission, sub);
              return true;
            },
          );
          if (changed)
            this.appGateway.emitToUser(userId, 'execution_error', {
              submissionId,
              status: SubmissionStatus.SYSTEM_ERROR,
              error: 'Code execution is temporarily unavailable.',
            });
        } catch {
          this.logger.error('Could not finalize failed submission');
        }
      }
    }
    if (job.name === 'run-code' && job.data.userId)
      this.appGateway.emitToUser(job.data.userId, 'execution_error', {
        jobId: job.id,
        executionId: job.data.executionId,
        status: SubmissionStatus.SYSTEM_ERROR,
        error: 'Code execution is temporarily unavailable.',
      });
    if (job.data.userId && job.data.admissionId && this.admission)
      await this.admission.release(job.data.userId, job.data.admissionId);
  }

  private async processJob(job: Job<any, any, string>): Promise<any> {
    this.logger.log(
      `[Judge:${this.runnerId}] Processing job ${job.id} — type: ${job.name}`,
    );

    if (job.name === 'run-code') {
      const { code, language, testCases, config = {}, userId, executionId } = job.data;
      if (userId) {
        this.appGateway.emitToUser(userId, 'run_status', {
          jobId: job.id,
          executionId,
          status: 'running',
          message: `Running code in isolated container sandbox...`,
        });
      }

      const results = await this.executionService.executeCode(
        language,
        code,
        testCases,
        config,
      );
      const passedCount = results.filter((result) => result.passed).length;
      const status = results.length === testCases.length ? this.overallStatus(results) : Status.SYSTEM_ERROR;

      const payload = {
        executionId,
        success: true,
        status,
        results: job.data.resultContext === 'assessment'
          ? presentTestResults(results, testCases, 'assessment') : results,
        ...executionMetrics(results),
        comparison: job.data.resultContext === 'assessment'
          ? { score: scoreComparison(passedCount, job.data.peerScores || []) } : undefined,
        passedCount,
        totalCount: testCases.length,
      };

      if (userId) {
        this.appGateway.emitToUser(userId, 'run_complete', {
          jobId: job.id,
          ...payload,
        });
      }

      return payload;
    }

    if (job.name === 'evaluate-code') {
      const { submissionId } = job.data;
      let userId: string | undefined;
      let finalizedHere = false;

      try {
        // 1. Mark as running in DB
        const submission = await this.submissionRepo.findOne({
          where: this.submissionLookup(submissionId, job.data.userId),
        });

        if (!submission) throw new Error('Submission not found');
        if (submission.completedAt || submission.status === 'cancelled')
          return { status: submission.status };
        const { problemId, code, language } = submission;
        userId = submission.userId;

        this.logger.log({
          event: 'JUDGE_JOB_STARTED',
          jobId: job.id,
          submissionId,
          userId,
          language,
        });

        const claimed = await this.submissionRepo.transaction(
          submission.userId,
          async (manager) => {
            const current = await manager.findOne(Submission, {
              where: { id: submission.id },
              lock: { mode: 'pessimistic_write' },
            });
            if (
              !current ||
              current.completedAt ||
              current.status === 'cancelled'
            )
              return false;
            submission.status = SubmissionStatus.RUNNING;
            submission.startedAt = new Date();
            await manager.save(Submission, submission);
            return true;
          },
        );
        if (!claimed) return { status: 'already_processed' };

        this.appGateway.emitToUser(userId, 'submission_status', {
          submissionId,
          status: SubmissionStatus.RUNNING,
          message: `Worker picked up submission on ${this.runnerId}`,
        });

        // 2. Resolve the persisted source and authoritative judge data.
        const problem = await this.problemsService.getExecutionProblem(
          problemId,
          submission.problemSource || 'problem',
        );
        const testCases = problem.testCases.map((tc, i) => ({
          id: i + 1,
          input: tc.input || '',
          expected: tc.output || '',
          isHidden: tc.isHidden === true,
        }));

        if (testCases.length === 0) {
          this.logger.warn(
            `[Judge] No test cases found for problem ${problemId}`,
          );
          if (submission) {
            submission.status = SubmissionStatus.SYSTEM_ERROR;
            submission.compileOutput =
              'No test cases configured for this problem';
            submission.completedAt = new Date();
            await this.submissionRepo.save(submission);
            finalizedHere = true;
          }
          this.appGateway.emitToUser(userId, 'execution_error', {
            submissionId,
            status: SubmissionStatus.SYSTEM_ERROR,
            error: 'No test cases configured for this problem',
          });
          return { status: SubmissionStatus.SYSTEM_ERROR };
        }

        // 3. Notify user of testing phase
        this.appGateway.emitToUser(userId, 'submission_status', {
          submissionId,
          status: SubmissionStatus.TESTING,
          message: `Executing your ${language} code against ${testCases.length} test case(s)...`,
          totalTestCases: testCases.length,
        });

        // 4. Build execution config
        const config = problem.config;

        // 5. Execute code in sandbox
        const start = Date.now();
        const results = await this.executionService.executeCode(
          language,
          code,
          testCases,
          config,
        );
        const processingLatencyMs = Date.now() - start;
        const runtime = results.every((r) => r.executionTime !== undefined)
          ? results.reduce((sum, r) => sum + r.executionTime!, 0)
          : undefined;

        // 6. Evaluate results
        let passedCount = 0;
        let hasCompileError = false;
        let hasRuntimeError = false;
        let hasTLE = false;
        let hasMemoryLimit = false;
        let compileOutput = '';

        for (const res of results) {
          if (res.passed) {
            passedCount++;
          }
          if (res.status === Status.COMPILATION_ERROR) {
            hasCompileError = true;
            compileOutput = res.error || '';
          }
          if (res.status === Status.RUNTIME_ERROR) hasRuntimeError = true;
          if (res.status === Status.TIME_LIMIT_EXCEEDED) hasTLE = true;
          if (res.status === Status.MEMORY_LIMIT_EXCEEDED)
            hasMemoryLimit = true;
        }

        const allPassed = passedCount === testCases.length;
        let status: string;
        if (allPassed) {
          status = SubmissionStatus.ACCEPTED;
        } else if (results.some((r) => r.status === Status.SYSTEM_ERROR)) {
          status = SubmissionStatus.SYSTEM_ERROR;
        } else if (hasCompileError) {
          status = SubmissionStatus.COMPILATION_ERROR;
        } else if (hasMemoryLimit) {
          status = SubmissionStatus.MEMORY_LIMIT_EXCEEDED;
        } else if (hasRuntimeError) {
          status = SubmissionStatus.RUNTIME_ERROR;
        } else if (hasTLE) {
          status = SubmissionStatus.TIME_LIMIT_EXCEEDED;
        } else {
          status = SubmissionStatus.WRONG_ANSWER;
        }

        // 7. Update DB with final results
        if (submission) {
          submission.status = status;
          submission.runtime = runtime;
          submission.executionTime = runtime;
          const memory = results.every((r) => r.memoryUsed !== undefined)
            ? Math.max(...results.map((r) => r.memoryUsed!))
            : undefined;
          submission.memory = memory;
          submission.memoryUsed = memory;
          submission.testCasesPassed = passedCount;
          submission.testsPassed = passedCount;
          submission.totalTestCases = testCases.length;
          submission.totalTests = testCases.length;
          submission.compileOutput = compileOutput || undefined;
          submission.completedAt = new Date();
          submission.testResults = presentTestResults(results, testCases, 'practice')
            .map(({ id, ...result }) => ({ ...result, testId: String(id) }));
          // Commit verdict and counters under a row lock. Concurrent/stalled replays
          // may execute twice, but only one verdict changes scoring/counters.
          const committed = await this.submissionRepo.transaction(
            submission.userId,
            async (manager) => {
              const locked = await manager.findOne(Submission, {
                where: { id: submission.id },
                lock: { mode: 'pessimistic_write' },
              });
              if (
                !locked ||
                locked.completedAt ||
                locked.status === 'cancelled'
              )
                return false;
              await manager.save(Submission, submission);
              return true;
            },
          );
          if (!committed) return { status: 'already_processed' };
          if (status === SubmissionStatus.ACCEPTED && userId) {
            await this.userRepo.manager.transaction(async (manager) => {
              const user = await manager.findOne(User, {
                where: { id: userId },
                lock: { mode: 'pessimistic_write' },
              });
              if (user) {
                user.stats = {
                  ...(user.stats || {}),
                  acceptedSubmissions:
                    (user.stats?.acceptedSubmissions || 0) + 1,
                };
                await manager.save(User, user);
              }
            });
          }
          finalizedHere = true;
        }

        // 8. Notify user of completion
        const completionPayload = {
          submissionId,
          status,
          runtime,
          memory: submission.memory,
          passedCount,
          totalCount: testCases.length,
          results: presentTestResults(results, testCases, 'practice'),
        };

        this.appGateway.emitToUser(
          userId,
          'submission_completed',
          completionPayload,
        );
        this.appGateway.emitToUser(
          userId,
          'execution_complete',
          completionPayload,
        );

        this.logger.log({
          event: 'JUDGE_JOB_COMPLETED',
          message: `[Judge] Submission ${submissionId}: ${status} (${passedCount}/${testCases.length}) processingLatency=${processingLatencyMs}ms`,
          jobId: job.id,
          submissionId,
          userId,
          status,
          passedCount,
          totalCount: testCases.length,
          processingLatencyMs,
        });

        return { status, passedCount, totalCount: testCases.length };
      } catch (err: any) {
        this.logger.error({
          event: 'JUDGE_JOB_FAILED',
          message: `[Judge] Error processing submission ${submissionId}: ${err?.message}`,
          jobId: job.id,
          submissionId,
          userId: userId || job.data.userId,
          error: err?.message,
          stack: err?.stack,
        });

        const willRetry =
          err instanceof JudgeCapacityError ||
          (err instanceof PistonUnavailableError &&
            job.attemptsMade + 1 < (job.opts?.attempts || 1));
        const sub = await this.submissionRepo.findOne({
          where: this.submissionLookup(submissionId, userId || job.data.userId),
        });
        if (sub?.completedAt || sub?.status === 'cancelled')
          return { status: sub.status };
        if (sub) {
          sub.status = willRetry
            ? SubmissionStatus.QUEUED
            : SubmissionStatus.SYSTEM_ERROR;
          sub.compileOutput = willRetry
            ? undefined
            : 'Code execution is temporarily unavailable.';
          sub.completedAt = willRetry ? undefined : new Date();
          await this.submissionRepo.save(sub);
          finalizedHere = !willRetry;
        }

        if (userId && !willRetry) {
          this.appGateway.emitToUser(userId, 'execution_error', {
            submissionId,
            status: SubmissionStatus.SYSTEM_ERROR,
            error: 'An internal error occurred during execution.',
          });
        }

        throw err;
      } finally {
        const client = this.redisService.getClient();
        if (client && userId && finalizedHere && !job.data.admissionId) {
          try {
            const latest = await this.submissionRepo.findOne({
              where: { id: submissionId },
            });
            if (latest?.completedAt)
              await client.eval(
                "local n = tonumber(redis.call('GET', KEYS[1]) or '0'); if n > 0 then return redis.call('DECR', KEYS[1]) end; return 0",
                1,
                `active:submissions:${userId}`,
              );
          } catch (e) {
            // Ignore redis cleanup error
          }
        }
      }
    }
  }

  private submissionLookup(id: string, userId?: string) {
    const scope = this.submissionRepo.isSharded && userId ? { userId } : {};
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id,
    )
      ? [
          { id, ...scope },
          { mongoId: id, ...scope },
        ]
      : [{ mongoId: id, ...scope }];
  }

  private overallStatus(
    results: Array<{ passed: boolean; status: string }>,
  ): string {
    if (
      !results.length ||
      results.some((result) => result.status === Status.SYSTEM_ERROR)
    )
      return Status.SYSTEM_ERROR;
    if (results.every((result) => result.passed)) return Status.ACCEPTED;
    if (results.some((result) => result.status === Status.COMPILATION_ERROR)) {
      return Status.COMPILATION_ERROR;
    }
    if (
      results.some((result) => result.status === Status.MEMORY_LIMIT_EXCEEDED)
    ) {
      return Status.MEMORY_LIMIT_EXCEEDED;
    }
    if (results.some((result) => result.status === Status.RUNTIME_ERROR)) {
      return Status.RUNTIME_ERROR;
    }
    if (
      results.some((result) => result.status === Status.TIME_LIMIT_EXCEEDED)
    ) {
      return Status.TIME_LIMIT_EXCEEDED;
    }
    if (results.some((result) => result.status === Status.SYSTEM_ERROR)) {
      return Status.SYSTEM_ERROR;
    }
    return Status.WRONG_ANSWER;
  }
}
