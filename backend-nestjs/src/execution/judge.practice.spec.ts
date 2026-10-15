import { PistonUnavailableError } from './piston/piston.types';
import { Submission } from '../database/entities/submission.entity';
jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => {}, InjectDataSource: () => () => {} }));

import { Logger, NotFoundException } from '@nestjs/common';
import { JudgeProcessor, SubmissionStatus } from './judge.processor';
import { Status } from './execution.types';

const problemId = '00000000-0000-4000-8000-000000000001';
const submissionId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';
const executionProblem = {
  id: problemId,
  source: 'metadata',
  slug: 'published-practice',
  title: 'Practice',
  config: {
    timeLimit: 900,
    memoryLimit: 128,
    supportedLanguages: ['python'],
    executionMode: 'function',
    exactOutput: true,
  },
  testCases: [
    { input: '2', output: '4', isHidden: false },
    { input: 'SECRET-INPUT', output: 'SECRET-EXPECTED', isHidden: true },
  ],
};
const successfulResults = [
  {
    id: 1,
    passed: true,
    status: Status.ACCEPTED,
    output: '4',
    expected: '4',
    executionTime: 1,
  },
  {
    id: 2,
    passed: true,
    status: Status.ACCEPTED,
    output: 'SECRET-EXPECTED',
    expected: 'SECRET-EXPECTED',
    error: 'SECRET-INPUT',
    executionTime: 2,
  },
];

describe('Practice judging', () => {
  let processor: JudgeProcessor;
  let submission: Record<string, unknown>;
  let storedSubmission: Record<string, unknown>;
  const execution = { executeCode: jest.fn() };
  const manager = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const submissionRepo = {
    transaction: jest.fn(
      async (_userId: string, callback: (value: typeof manager) => unknown) =>
        callback(manager),
    ),
    findOne: jest.fn(),
    save: jest
      .fn()
      .mockImplementation((value: unknown) => Promise.resolve(value)),
  };
  const problems = { getExecutionProblem: jest.fn() };
  const userRepo = {
    manager: {
      transaction: jest.fn(
        async (callback: (value: typeof manager) => unknown) =>
          callback(manager),
      ),
    },
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
  };
  const gateway = { emitToUser: jest.fn<void, [string, string, unknown]>() };
  const redis = { getClient: jest.fn().mockReturnValue(null) };
  const job = {
    id: 'job-1',
    name: 'evaluate-code',
    data: {
      submissionId,
      problemId: 'forged-id',
      problemSource: 'problem',
      code: 'forged-code',
      language: 'java',
      userId: 'forged-user',
      testCases: [{ input: 'forged', expected: 'forged' }],
      config: { timeLimit: 999999 },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    submission = {
      id: submissionId,
      problemId,
      problemSource: 'metadata',
      userId,
      code: 'saved-code',
      language: 'python',
      status: 'queued',
    };
    storedSubmission = { ...submission };
    submissionRepo.save.mockImplementation(async (value: unknown) => {
      storedSubmission = { ...(value as Record<string, unknown>) };
      return value;
    });
    manager.findOne.mockImplementation(async (entity: unknown) =>
      entity === Submission ? { ...storedSubmission } : null,
    );
    manager.save.mockImplementation(async (_entity: unknown, value: unknown) =>
      submissionRepo.save(value),
    );
    submissionRepo.findOne.mockImplementation(() =>
      Promise.resolve(submission),
    );
    problems.getExecutionProblem.mockResolvedValue(executionProblem);
    execution.executeCode.mockResolvedValue(successfulResults);
    processor = new JudgeProcessor(
      execution as never,
      submissionRepo as never,
      problems as never,
      userRepo as never,
      gateway as never,
      redis as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('skips completed replay jobs without changing counters or executing again', async () => {
    submission.completedAt = new Date();
    submission.status = 'accepted';
    await expect(processor.process(job as never)).resolves.toEqual({
      status: 'accepted',
    });
    expect(execution.executeCode).not.toHaveBeenCalled();
    expect(submissionRepo.transaction).not.toHaveBeenCalled();
  });

  it('retries a transient Piston outage without persisting a final verdict', async () => {
    execution.executeCode.mockRejectedValueOnce(new PistonUnavailableError());
    await expect(
      processor.process({
        ...job,
        attemptsMade: 0,
        opts: { attempts: 2 },
      } as never),
    ).rejects.toBeInstanceOf(PistonUnavailableError);
    expect(submission.completedAt).toBeUndefined();
    expect(submission.status).toBe('queued');
    expect(
      gateway.emitToUser.mock.calls.some(
        ([, event]) => event === 'execution_error',
      ),
    ).toBe(false);
  });

  it('marks exhausted infrastructure retries as system errors', async () => {
    execution.executeCode.mockRejectedValueOnce(new PistonUnavailableError());
    await expect(
      processor.process({
        ...job,
        attemptsMade: 1,
        opts: { attempts: 2 },
      } as never),
    ).rejects.toBeInstanceOf(PistonUnavailableError);
    expect(submission.status).toBe('system_error');
    expect(submission.completedAt).toBeInstanceOf(Date);
    expect(submission.compileOutput).not.toContain('Internal');
  });

  it('never converts an execution system error into wrong answer', async () => {
    execution.executeCode.mockResolvedValueOnce(
      successfulResults.map((r) => ({
        ...r,
        passed: false,
        status: Status.SYSTEM_ERROR,
      })),
    );
    await expect(processor.process(job as never)).resolves.toMatchObject({
      status: 'system_error',
    });
  });

  it('uses persisted metadata identity, source, code, owner and authoritative tests/limits', async () => {
    await expect(processor.process(job as never)).resolves.toEqual({
      status: SubmissionStatus.ACCEPTED,
      passedCount: 2,
      totalCount: 2,
    });
    expect(problems.getExecutionProblem).toHaveBeenCalledWith(
      problemId,
      'metadata',
    );
    expect(execution.executeCode).toHaveBeenCalledWith(
      'python',
      'saved-code',
      [
        { id: 1, input: '2', expected: '4', isHidden: false },
        {
          id: 2,
          input: 'SECRET-INPUT',
          expected: 'SECRET-EXPECTED',
          isHidden: true,
        },
      ],
      executionProblem.config,
    );
    expect(
      gateway.emitToUser.mock.calls.every(([target]) => target === userId),
    ).toBe(true);
    expect(submission).toEqual(
      expect.objectContaining({
        problemId,
        problemSource: 'metadata',
        status: 'accepted',
        testsPassed: 2,
        totalTests: 2,
      }),
    );
  });

  it('defaults historical submissions and old queued jobs to the legacy problem source', async () => {
    delete submission.problemSource;
    problems.getExecutionProblem.mockResolvedValue({
      ...executionProblem,
      source: 'problem',
    });
    await processor.process(job as never);
    expect(problems.getExecutionProblem).toHaveBeenCalledWith(
      problemId,
      'problem',
    );
    expect(execution.executeCode).toHaveBeenCalledWith(
      'python',
      'saved-code',
      expect.any(Array),
      executionProblem.config,
    );
  });

  it('keeps hidden input/output and runtime errors out of stored and emitted results', async () => {
    await processor.process(job as never);
    expect(JSON.stringify(submission.testResults)).not.toContain('SECRET');
    const completion = gateway.emitToUser.mock.calls.find(
      ([, event]) => event === 'submission_completed',
    )?.[2] as { results: unknown[] };
    expect(JSON.stringify(completion.results)).not.toContain('SECRET');
    expect(completion.results).toHaveLength(2);
  });

  it('does not execute a deleted or unpublished problem and reports a system error', async () => {
    const error = new NotFoundException('Problem not found');
    problems.getExecutionProblem.mockRejectedValue(error);
    await expect(processor.process(job as never)).rejects.toBe(error);
    expect(execution.executeCode).not.toHaveBeenCalled();
    expect(submission.status).toBe(SubmissionStatus.SYSTEM_ERROR);
    expect(gateway.emitToUser).toHaveBeenCalledWith(
      userId,
      'execution_error',
      expect.objectContaining({ status: 'system_error' }),
    );
  });

  it('rejects a missing persisted submission instead of judging queue-supplied data', async () => {
    submissionRepo.findOne.mockResolvedValue(null);
    await expect(processor.process(job as never)).rejects.toThrow(
      'Submission not found',
    );
    expect(problems.getExecutionProblem).not.toHaveBeenCalled();
    expect(execution.executeCode).not.toHaveBeenCalled();
    expect(gateway.emitToUser).not.toHaveBeenCalled();
  });

  it('does not execute if authoritative test cases were removed', async () => {
    problems.getExecutionProblem.mockResolvedValue({
      ...executionProblem,
      testCases: [],
    });
    await expect(processor.process(job as never)).resolves.toEqual({
      status: SubmissionStatus.SYSTEM_ERROR,
    });
    expect(execution.executeCode).not.toHaveBeenCalled();
    expect(submission.status).toBe(SubmissionStatus.SYSTEM_ERROR);
  });

  it('retains the existing persisted compilation-error status mapping', async () => {
    execution.executeCode.mockResolvedValue(
      successfulResults.map((result) => ({
        ...result,
        passed: false,
        status: Status.COMPILATION_ERROR,
        error: 'Syntax error',
      })),
    );
    await expect(processor.process(job as never)).resolves.toEqual({
      status: SubmissionStatus.COMPILATION_ERROR,
      passedCount: 0,
      totalCount: 2,
    });
    expect(submission.status).toBe('compilation_error');
  });

  it('preserves the custom Run Code path without requiring a problem reference', async () => {
    const testCases = [{ id: 1, input: '2', expected: '4' }];
    const config = { timeLimit: 500 };
    execution.executeCode.mockResolvedValue([successfulResults[0]]);
    const runJob = {
      id: 'run-1',
      name: 'run-code',
      data: { userId, code: 'run-code', language: 'python', testCases, config },
    };
    await expect(processor.process(runJob as never)).resolves.toEqual(
      expect.objectContaining({
        success: true,
        status: 'accepted',
        passedCount: 1,
        totalCount: 1,
      }),
    );
    expect(execution.executeCode).toHaveBeenCalledWith(
      'python',
      'run-code',
      testCases,
      config,
    );
    expect(problems.getExecutionProblem).not.toHaveBeenCalled();
    expect(submissionRepo.findOne).not.toHaveBeenCalled();
  });
});
