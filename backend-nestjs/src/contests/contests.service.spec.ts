jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
  InjectDataSource: () => () => undefined,
}));
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ContestsService } from './contests.service';
const id = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const contest = {
  id,
  title: 'Real Contest',
  slug: 'real-contest',
  description: 'Description',
  isPublished: true,
  isPrivate: false,
  password: 'SECRET-PASSWORD',
  participants: [userId],
  problems: [id],
  startTime: new Date(Date.now() - 60000),
  endTime: new Date(Date.now() + 3600000),
  antiCheatConfig: { warningLimit: 3 },
};
function setup(submissions?: unknown) {
  const builder = {
    insert: jest.fn(),
    values: jest.fn(),
    orIgnore: jest.fn(),
    update: jest.fn(),
    set: jest.fn(),
    where: jest.fn(),
    execute: jest.fn().mockResolvedValue({}),
  };
  for (const key of [
    'insert',
    'values',
    'orIgnore',
    'update',
    'set',
    'where',
  ] as const)
    builder[key].mockReturnValue(builder);
  const contests = {
    find: jest.fn().mockResolvedValue([contest]),
    findOne: jest.fn().mockResolvedValue(contest),
    save: jest.fn().mockResolvedValue(contest),
  };
  const attempts = {
    query: jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => builder),
    findOne: jest.fn().mockResolvedValue({
      id,
      sessionId: 'real-session',
      status: 'InProgress',
      startedAt: contest.startTime,
    }),
  };
  const problems = {
    getExecutionProblem: jest
      .fn()
      .mockResolvedValue({ id, title: 'Real problem', slug: 'real-problem' }),
  };
  const questions = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  const metadata = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  return {
    service: new ContestsService(
      contests as never,
      attempts as never,
      problems as never,
      submissions as never,
      undefined,
      questions as never,
      metadata as never,
    ),
    contests,
    attempts,
    problems,
    questions,
    metadata,
    builder,
  };
}
it('merges sharded contest results, keeps zero-score participants, and ranks ties by solve time', async () => {
  const second = '00000000-0000-4000-8000-000000000003';
  const third = '00000000-0000-4000-8000-000000000004';
  const windows = {
    start: '2026-10-13T10:00:00.000000',
    end: '2026-10-13T11:00:00.000000',
  };
  const submissions = {
    isSharded: true,
    contestSolvedProblems: jest.fn().mockResolvedValue([
      { userId, problemId: id, solvedAt: '2026-10-13T10:20:00' },
      { userId: second, problemId: id, solvedAt: '2026-10-13T10:10:00' },
    ]),
  };
  const { service, attempts } = setup(submissions);
  attempts.query.mockResolvedValueOnce([
    { id: userId, name: 'First', username: 'first', ...windows },
    { id: second, name: 'Second', username: 'second', ...windows },
    { id: third, name: 'Third', username: 'third', start: null, end: null },
  ]);
  const result = await service.leaderboard('real-contest');
  expect(result.leaderboard.map((row) => [row.name, row.solved])).toEqual([
    ['Second', 1],
    ['First', 1],
    ['Third', 0],
  ]);
  expect(submissions.contestSolvedProblems).toHaveBeenCalledWith(
    [id],
    [
      { userId, ...windows },
      { userId: second, ...windows },
    ],
  );
  expect(attempts.query.mock.calls[0][0]).not.toContain('JOIN submissions');
});
it('lists published public database contests and exposes no passwords or participant IDs', async () => {
  const { service, contests } = setup();
  const result = await service.getContests();
  expect(contests.find).toHaveBeenCalledWith({
    where: { isPublished: true, isPrivate: false },
    order: { startTime: 'DESC' },
  });
  expect(result[0]).toMatchObject({
    id,
    slug: 'real-contest',
    title: 'Real Contest',
  });
  expect(result[0]).not.toHaveProperty('password');
  expect(result[0]).not.toHaveProperty('participants');
});
it('preserves private link details without exposing the password', async () => {
  const { service, contests } = setup();
  contests.findOne.mockResolvedValue({ ...contest, isPrivate: true });
  const result = await service.getContest('real-contest');
  expect(result.isPrivate).toBe(true);
  expect(result).not.toHaveProperty('password');
});
it.each([false, 'missing'])(
  'rejects registration for an unpublished/missing contest: %p',
  async (mode) => {
    const { service, contests } = setup();
    contests.findOne.mockResolvedValue(
      mode === false ? { ...contest, isPublished: false } : null,
    );
    await expect(service.register(id, userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(contests.save).not.toHaveBeenCalled();
  },
);
it('blocks closed registration and incorrect private passwords', async () => {
  const { service, contests } = setup();
  contests.findOne.mockResolvedValueOnce({
    ...contest,
    endTime: new Date(Date.now() - 1000),
  });
  await expect(service.register(id, userId)).rejects.toBeInstanceOf(
    BadRequestException,
  );
  contests.findOne.mockResolvedValueOnce({ ...contest, isPrivate: true });
  await expect(service.register(id, userId, 'wrong')).rejects.toBeInstanceOf(
    ForbiddenException,
  );
});
it('persists registration and ignores repeated registration', async () => {
  const { service, contests } = setup();
  contests.findOne.mockResolvedValueOnce({ ...contest, participants: [] });
  await service.register(id, userId);
  expect(contests.save).toHaveBeenCalledWith(
    expect.objectContaining({ participants: [userId] }),
  );
  contests.save.mockClear();
  await service.register(id, userId);
  expect(contests.save).not.toHaveBeenCalled();
});
it('returns only the authenticated student registration state', async () => {
  const { service } = setup();
  expect(await service.registration(id, userId)).toEqual({
    registered: true,
    attemptStatus: 'InProgress',
  });
  expect(await service.registration(id, 'other')).toEqual({
    registered: false,
  });
});
it('creates or resumes a guarded real attempt with canonical published problem IDs', async () => {
  const { service, builder, problems } = setup();
  const result = await service.startAttempt(id, userId);
  expect(result).toMatchObject({
    sessionId: 'real-session',
    problems: [{ id, title: 'Real problem', slug: 'real-problem' }],
  });
  expect(problems.getExecutionProblem).toHaveBeenCalledWith(id);
  expect(builder.orIgnore).toHaveBeenCalled();
  expect(result.contest).not.toHaveProperty('participants');
});
it('resolves Question Bank questions when execution lookup fails (e.g. MCQ or contest-only)', async () => {
  const { service, problems, questions } = setup();
  problems.getExecutionProblem.mockRejectedValue(new NotFoundException('Problem not found'));
  questions.findOne.mockResolvedValue({
    id,
    question: 'Sample MCQ Question?',
    title: 'Sample MCQ',
    slug: 'sample-mcq',
  });
  const result = await service.startAttempt(id, userId);
  expect(result).toMatchObject({
    sessionId: 'real-session',
    problems: [{ id, title: 'Sample MCQ', slug: 'sample-mcq' }],
  });
  expect(questions.findOne).toHaveBeenCalled();
});
it('resolves ProblemMetadata questions when execution and Question lookups fail', async () => {
  const { service, problems, metadata } = setup();
  problems.getExecutionProblem.mockRejectedValue(new NotFoundException('Problem not found'));
  metadata.findOne.mockResolvedValue({
    id,
    title: 'Metadata Problem',
    slug: 'metadata-problem',
  });
  const result = await service.startAttempt(id, userId);
  expect(result).toMatchObject({
    sessionId: 'real-session',
    problems: [{ id, title: 'Metadata Problem', slug: 'metadata-problem' }],
  });
  expect(metadata.findOne).toHaveBeenCalled();
});
it.each(['upcoming', 'ended', 'unregistered', 'unpublished'])(
  'blocks unavailable attempts: %s',
  async (state) => {
    const { service, contests, builder } = setup();
    contests.findOne.mockResolvedValue({
      ...contest,
      ...(state === 'upcoming'
        ? { startTime: new Date(Date.now() + 60000) }
        : state === 'ended'
          ? { endTime: new Date(Date.now() - 1000) }
          : state === 'unregistered'
            ? { participants: [] }
            : { isPublished: false }),
    });
    await expect(service.startAttempt(id, userId)).rejects.toThrow();
    expect(builder.execute).not.toHaveBeenCalled();
  },
);
it('does not resume a completed session or trust client session identity', async () => {
  const { service, attempts, builder } = setup();
  attempts.findOne.mockResolvedValueOnce({ status: 'Submitted' });
  await expect(service.startAttempt(id, userId)).rejects.toBeInstanceOf(
    BadRequestException,
  );
  await expect(
    service.submitAttempt(id, userId, 'wrong'),
  ).rejects.toBeInstanceOf(ForbiddenException);
  builder.execute.mockClear();
  await service.submitAttempt(id, userId, 'real-session');
  expect(builder.where).toHaveBeenLastCalledWith(
    'id = :id AND status = :status',
    { id, status: 'InProgress' },
  );
});
it('throws ServiceUnavailableException and prevents silent score wipeout when score query fails (AUD-010)', async () => {
  const { service, attempts, builder } = setup();
  attempts.query.mockRejectedValueOnce(new Error('Connection pool exhausted'));
  await expect(
    service.submitAttempt(id, userId, 'real-session'),
  ).rejects.toThrow('Connection pool exhausted');
  // Crucial: attempt update to 'Submitted' with 0 score must NEVER have executed
  expect(builder.update).not.toHaveBeenCalled();
});
it('records violations only for the authenticated active session and applies configured thresholds', async () => {
  const { service, attempts } = setup();
  attempts.query.mockResolvedValueOnce([{ warnings: 3, status: 'Terminated' }]);
  expect(
    await service.recordViolation(id, userId, 'real-session', 'tab_switch'),
  ).toEqual({ success: true, warnings: 3, forceSubmit: true });
  expect(attempts.query.mock.calls[0][1]).toEqual([
    id,
    userId,
    'real-session',
    'tab_switch',
    true,
    3,
  ]);
  await expect(
    service.recordViolation(id, userId, 'wrong', 'tab_switch'),
  ).rejects.toBeInstanceOf(ForbiddenException);
});
it('ranks actual accepted submissions, using parameters and excluding unpublished/private contests', async () => {
  const { service, contests, attempts } = setup();
  attempts.query.mockResolvedValueOnce([
    { name: 'Candidate', username: 'candidate', solved: '1' },
  ]);
  const result = await service.leaderboard('real-contest');
  expect(contests.findOne).toHaveBeenCalledWith({
    where: { slug: 'real-contest', isPublished: true, isPrivate: false },
  });
  expect(result.leaderboard).toEqual([
    {
      rank: 1,
      name: 'Candidate',
      username: 'candidate',
      solved: 1,
      totalProblems: 1,
    },
  ]);
  expect(attempts.query.mock.calls[0][1]).toEqual([
    [id],
    contest.startTime,
    contest.endTime,
    [userId],
    id,
  ]);
  contests.findOne.mockResolvedValueOnce(null);
  await expect(service.leaderboard('private')).rejects.toBeInstanceOf(
    NotFoundException,
  );
});

it('only permits registered authenticated students to read private contest rankings', async () => {
  const { service, contests, attempts } = setup();
  contests.findOne.mockResolvedValue({ ...contest, isPrivate: true });
  await expect(service.leaderboard('private', 'other')).rejects.toBeInstanceOf(
    NotFoundException,
  );
  expect(attempts.query).not.toHaveBeenCalled();
  expect((await service.leaderboard('private', userId)).leaderboard).toEqual(
    [],
  );
});

it('scores contest submission from the owning shard and does not query the primary snapshot', async () => {
  const submissions = {
    isSharded: true,
    contestSolvedProblems: jest
      .fn()
      .mockResolvedValue([{ userId, problemId: id, solvedAt: new Date() }]),
  };
  const { service, attempts, builder } = setup(submissions);
  const result = await service.submitAttempt(id, userId, 'real-session');
  expect(result).toEqual(
    expect.objectContaining({ score: 100, problemsSolved: 1 }),
  );
  expect(submissions.contestSolvedProblems).toHaveBeenCalledWith(
    [id],
    [expect.objectContaining({ userId, start: contest.startTime })],
  );
  expect(attempts.query).not.toHaveBeenCalled();
  expect(builder.set).toHaveBeenCalledWith(
    expect.objectContaining({ score: 100, problemsSolved: 1 }),
  );
});

it('leaves the contest attempt open when shard scoring fails', async () => {
  const submissions = {
    isSharded: true,
    contestSolvedProblems: jest
      .fn()
      .mockRejectedValue(new Error('shard unavailable')),
  };
  const { service, builder } = setup(submissions);
  await expect(
    service.submitAttempt(id, userId, 'real-session'),
  ).rejects.toThrow('shard unavailable');
  expect(builder.update).not.toHaveBeenCalled();
});

it('loads contest security settings without creating an attempt or exposing private data', async () => {
  const { service, attempts, builder, problems } = setup();
  const result = await service.getStartContext(id, userId);
  expect(result.contest.title).toBe('Real Contest');
  expect(result.antiCheatConfig).toEqual(contest.antiCheatConfig);
  expect(JSON.stringify(result)).not.toContain('SECRET-PASSWORD');
  expect(attempts.findOne).not.toHaveBeenCalled();
  expect(builder.insert).not.toHaveBeenCalled();
  expect(problems.getExecutionProblem).not.toHaveBeenCalled();
});
it('requires registration before exposing start security settings', async () => {
  const { service, contests } = setup();
  contests.findOne.mockResolvedValue({ ...contest, participants: [] });
  await expect(service.getStartContext(id, userId)).rejects.toBeInstanceOf(ForbiddenException);
});

it('consumes reattempt grant atomically inside a transaction with pessimistic locking (ISSUE-CON-001)', async () => {
  const { contests, attempts, problems } = setup();
  attempts.findOne.mockResolvedValueOnce({
    id,
    contest_id: id,
    user_id: userId,
    status: 'Submitted',
    attemptNumber: 1,
  });
  const mockGrant = {
    contest_id: id,
    user_id: userId,
    status: 'ACTIVE',
    usedAttempts: 0,
    allowedAttempts: 1,
  };
  const mockManager = {
    findOne: jest.fn().mockResolvedValue(mockGrant),
    save: jest.fn().mockImplementation((entityClass, obj) => Promise.resolve(obj || entityClass)),
    create: jest.fn().mockImplementation((entityClass, obj) => ({ id: 'new-attempt', ...obj })),
  };
  const reattemptGrantRepo = {
    manager: {
      transaction: jest.fn().mockImplementation(async (cb) => cb(mockManager)),
    },
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const service = new ContestsService(
    contests as never,
    attempts as never,
    problems as never,
    undefined,
    reattemptGrantRepo as never,
  );
  const result = await service.startAttempt(id, userId);
  expect(reattemptGrantRepo.manager.transaction).toHaveBeenCalled();
  expect(mockManager.findOne).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      lock: { mode: 'pessimistic_write' },
    }),
  );
  expect(mockGrant.usedAttempts).toBe(1);
  expect(mockGrant.status).toBe('USED');
});
