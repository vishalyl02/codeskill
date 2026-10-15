jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
  InjectDataSource: () => () => {},
}));
import { ServiceUnavailableException } from '@nestjs/common';
import { DelayedError } from 'bullmq';
import { ExecutionController } from '../execution.controller';
import { JudgeProcessor } from '../judge.processor';
import {
  JudgeCapacityError,
  PistonUnavailableError,
} from '../piston/piston.types';
import { SubmissionsService } from '../../submissions/submissions.service';

describe('Admission lifecycle at API and worker boundaries', () => {
  const userId = 'user',
    id = '00000000-0000-4000-8000-000000000001';
  const admission = {
    reserve: jest.fn(),
    release: jest.fn(),
    claim: jest.fn(),
    renew: jest.fn(),
    unclaim: jest.fn(),
    heartbeatMs: 15000,
  };
  const execution = { validateRequest: jest.fn(), executeCode: jest.fn() };
  const queue = { add: jest.fn(), getJobCounts: jest.fn(), getJob: jest.fn() };
  const store = {
    create: jest.fn((value) => value),
    save: jest.fn(),
    findOne: jest.fn(),
    transaction: jest.fn(),
  };
  const users = { manager: { transaction: jest.fn() } };
  const gateway = { emitToUser: jest.fn() };
  const problems = { getExecutionProblem: jest.fn() };
  const redis = { getClient: () => null };
  const controller = () =>
    new ExecutionController(
      execution as never,
      {} as never,
      queue as never,
      admission as never,
    );
  const submissions = () =>
    new SubmissionsService(
      store as never,
      users as never,
      queue as never,
      gateway as never,
      redis as never,
      problems as never,
      undefined,
      admission as never,
    );
  const processor = () =>
    new JudgeProcessor(
      execution as never,
      store as never,
      problems as never,
      users as never,
      gateway as never,
      redis as never,
      admission as never,
    );
  const body = {
    code: 'print(30)',
    language: 'python',
    testCases: [{ id: 1, input: '', expected: '30' }],
  };
  const job = () => ({
    id,
    name: 'run-code',
    data: { ...body, userId, admissionId: id },
    attemptsMade: 0,
    opts: { attempts: 2 },
  });
  beforeEach(() => {
    jest.resetAllMocks();
    admission.reserve.mockResolvedValue(id);
    admission.release.mockResolvedValue(undefined);
    admission.claim.mockResolvedValue('claimed');
    admission.unclaim.mockResolvedValue(undefined);
    queue.getJobCounts.mockResolvedValue({
      waiting: 0,
      delayed: 0,
      prioritized: 0,
    });
    queue.add.mockResolvedValue({ id });
    store.create.mockImplementation((value) => value);
    store.save.mockImplementation(async (value) => value);
    problems.getExecutionProblem.mockResolvedValue({
      id: 'problem',
      source: 'problem',
      testCases: [{ input: '', output: '30' }],
      config: { supportedLanguages: ['python'] },
    });
    execution.executeCode.mockResolvedValue([
      { id: 1, passed: true, status: 'accepted', output: '30' },
    ]);
  });
  it('does not reserve malformed Run requests', async () => {
    await expect(
      controller().runCode(userId, { ...body, code: '' }),
    ).rejects.toThrow();
    expect(admission.reserve).not.toHaveBeenCalled();
  });
  it('releases a Run reservation when queue insertion fails', async () => {
    queue.add.mockRejectedValue(new Error('queue offline'));
    await expect(controller().runCode(userId, body)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(admission.release).toHaveBeenCalledWith(userId, id);
  });
  it('fails closed when queue inspection fails', async () => {
    queue.getJobCounts.mockRejectedValue(new Error('Redis offline'));
    await expect(controller().runCode(userId, body)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(admission.reserve).not.toHaveBeenCalled();
  });
  it('marks a submission as failed and releases its reservation if queue insertion fails', async () => {
    queue.add.mockRejectedValue(new Error('queue offline'));
    await expect(
      submissions().createSubmission(userId, {
        code: body.code,
        language: 'python',
        problemId: 'problem',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(store.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id,
        status: 'internal_error',
        completedAt: expect.any(Date),
      }),
    );
    expect(admission.release).toHaveBeenCalledWith(userId, id);
  });
  it('does not release a running job when cancellation races with dequeue', async () => {
    store.findOne.mockResolvedValue({ id, userId, status: 'queued' });
    queue.getJob.mockResolvedValue({
      getState: async () => 'active',
      remove: jest.fn(),
    });
    await expect(submissions().cancelSubmission(userId, id)).rejects.toThrow(
      'running submission',
    );
    expect(admission.release).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });
  it('does not cancel or release a job if queue removal fails', async () => {
    store.findOne.mockResolvedValue({ id, userId, status: 'queued' });
    queue.getJob.mockResolvedValue({
      getState: async () => 'waiting',
      remove: jest.fn().mockRejectedValue(new Error('became active')),
    });
    await expect(
      submissions().cancelSubmission(userId, id),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(admission.release).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });
  it('releases queued cancellations under the actual owner', async () => {
    store.findOne.mockResolvedValue({ id, userId, status: 'queued' });
    queue.getJob.mockResolvedValue({
      getState: async () => 'waiting',
      remove: jest.fn().mockResolvedValue(undefined),
    });
    await submissions().cancelSubmission('admin', id, true);
    expect(admission.release).toHaveBeenCalledWith(userId, id);
  });
  it('holds a reservation until execution has completed', async () => {
    let finish!: (value: unknown) => void;
    execution.executeCode.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const work = processor().process(job() as never);
    await new Promise((resolve) => setImmediate(resolve));
    expect(admission.release).not.toHaveBeenCalled();
    finish([]);
    await work;
    expect(admission.release).toHaveBeenCalledWith(
      userId,
      id,
      expect.any(String),
    );
  });
  it('retains the reservation across a retriable infrastructure failure', async () => {
    execution.executeCode.mockRejectedValue(new PistonUnavailableError());
    await expect(processor().process(job() as never)).rejects.toBeInstanceOf(
      PistonUnavailableError,
    );
    expect(admission.unclaim).toHaveBeenCalledWith(
      userId,
      id,
      expect.any(String),
    );
    expect(admission.release).not.toHaveBeenCalled();
  });
  it('releases exhausted retries', async () => {
    execution.executeCode.mockRejectedValue(new PistonUnavailableError());
    await expect(
      processor().process({ ...job(), attemptsMade: 1 } as never),
    ).rejects.toBeInstanceOf(PistonUnavailableError);
    expect(admission.unclaim).not.toHaveBeenCalled();
    expect(admission.release).toHaveBeenCalledWith(
      userId,
      id,
      expect.any(String),
    );
  });
  it('waits for fleet capacity without consuming infrastructure retries', async () => {
    execution.executeCode.mockRejectedValue(new JudgeCapacityError());
    const moveToDelayed = jest.fn().mockResolvedValue(undefined);
    await expect(
      processor().process(
        { ...job(), attemptsMade: 1, moveToDelayed } as never,
        'bull-lock',
      ),
    ).rejects.toBeInstanceOf(DelayedError);
    expect(moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'bull-lock');
    expect(admission.unclaim).toHaveBeenCalled();
    expect(admission.release).not.toHaveBeenCalled();
  });
  it('delays a stalled duplicate without releasing or executing the original owner', async () => {
    admission.claim.mockResolvedValue('busy');
    const moveToDelayed = jest.fn().mockResolvedValue(undefined);
    await expect(
      processor().process({ ...job(), moveToDelayed } as never, 'bull-lock'),
    ).rejects.toBeInstanceOf(DelayedError);
    expect(moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'bull-lock');
    expect(execution.executeCode).not.toHaveBeenCalled();
    expect(admission.release).not.toHaveBeenCalled();
  });
});
