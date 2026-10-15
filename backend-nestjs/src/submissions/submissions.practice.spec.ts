jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
  InjectDataSource: () => () => {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';

const problemId = '00000000-0000-4000-8000-000000000001';
const submissionId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';
const problem = {
  id: problemId,
  source: 'metadata' as const,
  title: 'Published practice',
  slug: 'published-practice',
  testCases: [{ input: '2', output: '4', isHidden: true }],
  config: { timeLimit: 1200, memoryLimit: 128, supportedLanguages: ['python'] },
};
const payload = {
  problemId,
  code: 'print(int(input()) * 2)',
  language: 'python',
};

describe('Practice submission identity', () => {
  let service: SubmissionsService;
  let stored: Record<string, unknown>;
  const submissionRepo = {
    create: jest.fn((body: Record<string, unknown>) => ({
      id: submissionId,
      ...body,
    })),
    save: jest.fn((body: Record<string, unknown>) => {
      stored = { ...body };
      return Promise.resolve(body);
    }),
    find: jest.fn(() => Promise.resolve([stored])),
  };
  const userRepo = {
    manager: {
      transaction: jest.fn(async (callback: (manager: unknown) => unknown) =>
        callback({ findOne: async () => null, save: jest.fn() }),
      ),
    },
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const gateway = { emitToUser: jest.fn() };
  const redis = { getClient: jest.fn().mockReturnValue(null) };
  const problems = {
    getExecutionProblem: jest.fn().mockResolvedValue(problem),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    problems.getExecutionProblem.mockResolvedValue(problem);
    service = new SubmissionsService(
      submissionRepo as never,
      userRepo as never,
      queue as never,
      gateway as never,
      redis as never,
      problems as never,
      undefined,
      {
        reserve: jest.fn().mockResolvedValue(submissionId),
        release: jest.fn().mockResolvedValue(undefined),
      } as never,
    );
  });

  it('persists the server-resolved metadata identity and ignores client source, results, and test data', async () => {
    const result = await service.createSubmission(userId, {
      ...payload,
      problemSource: 'problem',
      userId: 'another-user',
      status: 'accepted',
      runtime: 1,
      memory: 2,
      testCasesPassed: 50,
      totalTestCases: 50,
      testCases: [{ input: 'forged', output: 'forged' }],
    });
    expect(problems.getExecutionProblem).toHaveBeenCalledWith(problemId);
    expect(result).toEqual(
      expect.objectContaining({
        problemId,
        problemSource: 'metadata',
        userId,
        status: 'queued',
        _id: submissionId,
      }),
    );
    expect(submissionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        problemId,
        problemSource: 'metadata',
        userId,
        status: 'queued',
        testResults: [],
      }),
    );
    expect(stored).not.toHaveProperty('testCases');
    expect(stored).not.toHaveProperty('runtime');
    expect(stored).not.toHaveProperty('problem');
    expect(queue.add).toHaveBeenCalledWith(
      'evaluate-code',
      expect.objectContaining({
        problemId,
        problemSource: 'metadata',
        submissionId,
        userId,
        code: payload.code,
      }),
      expect.any(Object),
    );
  });

  it('preserves legacy problem submissions and existing public problemId payloads', async () => {
    problems.getExecutionProblem.mockResolvedValue({
      ...problem,
      source: 'problem',
    });
    const result = await service.createSubmission(userId, payload);
    expect(result.problemId).toBe(problemId);
    expect(result.problemSource).toBe('problem');
    expect(queue.add).toHaveBeenCalledWith(
      'evaluate-code',
      expect.objectContaining({ problemId, problemSource: 'problem' }),
      expect.any(Object),
    );
    const history = await service.getSubmissionsByProblem(userId, problemId);
    expect(submissionRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId, problemId } }),
    );
    expect(history[0]).toEqual(
      expect.objectContaining({
        problemId,
        problemSource: 'problem',
        _id: submissionId,
      }),
    );
  });

  it('stores the canonical ID returned by the resolver rather than a supplied alias', async () => {
    await service.createSubmission(userId, {
      ...payload,
      problemId: ' legacy-alias ',
    });
    expect(problems.getExecutionProblem).toHaveBeenCalledWith('legacy-alias');
    expect(stored.problemId).toBe(problemId);
  });

  it.each([undefined, '', 1, {}])(
    'rejects a missing or malformed ID before resolution: %p',
    async (invalidId) => {
      await expect(
        service.createSubmission(userId, { ...payload, problemId: invalidId }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(problems.getExecutionProblem).not.toHaveBeenCalled();
      expect(submissionRepo.save).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it.each(['Missing problem', 'Private problem', 'Draft problem'])(
    'propagates resolver rejection for %s without a save or enqueue',
    async (message) => {
      problems.getExecutionProblem.mockRejectedValue(
        new NotFoundException(message),
      );
      await expect(
        service.createSubmission(userId, payload),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(submissionRepo.save).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it('honors configured languages while treating supported aliases consistently', async () => {
    problems.getExecutionProblem.mockResolvedValue({
      ...problem,
      config: { ...problem.config, supportedLanguages: ['python3'] },
    });
    await service.createSubmission(userId, { ...payload, language: 'PYTHON' });
    expect(stored.language).toBe('python');
    problems.getExecutionProblem.mockResolvedValue({
      ...problem,
      config: { ...problem.config, supportedLanguages: ['cpp'] },
    });
    await expect(service.createSubmission(userId, payload)).rejects.toThrow(
      'This language is not enabled for the problem',
    );
    expect(submissionRepo.save).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('retains the globally supported language fallback for legacy records without language restrictions', async () => {
    problems.getExecutionProblem.mockResolvedValue({
      ...problem,
      source: 'problem',
      config: { ...problem.config, supportedLanguages: [] },
    });
    await expect(service.createSubmission(userId, payload)).resolves.toEqual(
      expect.objectContaining({ problemSource: 'problem' }),
    );
  });

  it('rejects unsupported languages and problems without authoritative test cases', async () => {
    await expect(
      service.createSubmission(userId, { ...payload, language: 'ruby' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(problems.getExecutionProblem).not.toHaveBeenCalled();
    problems.getExecutionProblem.mockResolvedValue({
      ...problem,
      testCases: [],
    });
    await expect(service.createSubmission(userId, payload)).rejects.toThrow(
      'No test cases configured',
    );
    expect(submissionRepo.save).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
