jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
  InjectDataSource: () => () => {},
}));

import { SubmissionStore } from './submission-store';

type MockRow = { id?: string; [key: string]: unknown };
function repository() {
  return {
    create: jest.fn((value: MockRow) => ({ ...value })),
    save: jest.fn((value: MockRow) =>
      Promise.resolve({ ...value, id: value.id || 'new-id' }),
    ),
    find: jest.fn<Promise<MockRow[]>, [unknown?]>().mockResolvedValue([]),
    findOne: jest
      .fn<Promise<MockRow | null>, [unknown]>()
      .mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    findAndCount: jest.fn(),
    query: jest
      .fn<Promise<MockRow[]>, [string, unknown[]]>()
      .mockResolvedValue([]),
  };
}
function setup(enabled = true) {
  const primary = repository(),
    users = repository(),
    a = repository(),
    b = repository();
  const sourceA = { getRepository: () => a },
    sourceB = { getRepository: () => b };
  const registry = {
    enabled,
    all: [sourceA, sourceB],
    forUser: jest.fn((id: string) => (id === 'student-b' ? sourceB : sourceA)),
  };
  return {
    store: new SubmissionStore(
      primary as never,
      users as never,
      registry as never,
    ),
    primary,
    users,
    a,
    b,
    registry,
  };
}

it('keeps non-sharded installations using their original repository', async () => {
  const { store, primary, a } = setup(false);
  await store.save({ userId: 'student-a' } as never);
  await store.find({ where: { userId: 'student-a' } });
  await store.findOne({ where: { id: 'id' } });
  await store.count();
  expect(primary.save).toHaveBeenCalled();
  expect(primary.find).toHaveBeenCalled();
  expect(primary.count).toHaveBeenCalled();
  expect(a.save).not.toHaveBeenCalled();
});

it('routes student writes and history to one shard and omits cross-database relations', async () => {
  const { store, primary, a, b } = setup();
  await store.save({
    userId: 'student-a',
    user: { id: 'student-a' },
    problem: { id: 'problem' },
  } as never);
  await store.find({
    where: { userId: 'student-a' },
    take: 20,
    order: { createdAt: 'DESC' },
  });
  expect(a.save.mock.calls[0][0]).not.toHaveProperty('user');
  expect(a.save.mock.calls[0][0]).not.toHaveProperty('problem');
  expect(a.find).toHaveBeenCalledTimes(1);
  expect(b.find).not.toHaveBeenCalled();
  expect(primary.save).not.toHaveBeenCalled();
});

it('merges global pagination in order, using ID to break timestamp ties', async () => {
  const { store, a, b } = setup();
  a.find.mockResolvedValue([
    { id: 'a', createdAt: new Date(30) },
    { id: 'c', createdAt: new Date(20) },
  ]);
  b.find.mockResolvedValue([
    { id: 'b', createdAt: new Date(30) },
    { id: 'd', createdAt: new Date(10) },
  ]);
  expect(
    (await store.find({ skip: 1, take: 2, order: { createdAt: 'DESC' } })).map(
      (row) => row.id,
    ),
  ).toEqual(['b', 'c']);
  expect(a.find).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
  await expect(store.find()).rejects.toThrow('bounded pagination');
  await expect(store.find({ skip: 2001, take: 10 })).rejects.toThrow('max offset 2000');
});

it('supports keyset cursor pagination across shards with constant take limit', async () => {
  const { store, a, b } = setup();
  a.find.mockResolvedValue([{ id: 'c', createdAt: new Date(20) }]);
  b.find.mockResolvedValue([{ id: 'd', createdAt: new Date(10) }]);

  const results = await store.find({
    take: 2,
    order: { createdAt: 'DESC' },
    cursor: { createdAt: new Date(30), id: 'b' },
  });
  expect(results.map((r) => r.id)).toEqual(['c', 'd']);
  // With cursor pagination, each shard only queries take (2) rows, not skip + take!
  expect(a.find).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
  expect(b.find).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
});

it('sums counts from all shards and hydrates users from the primary database', async () => {
  const { store, a, b, users } = setup();
  a.count.mockResolvedValue(2);
  b.count.mockResolvedValue(3);
  expect(await store.count()).toBe(5);
  a.findOne.mockResolvedValue({ id: 'id', userId: 'student-a' });
  users.find.mockResolvedValue([{ id: 'student-a', name: 'Student' }]);
  const result = await store.findOne({
    where: { id: 'id' },
    relations: { user: true },
  });
  expect(result?.user.name).toBe('Student');
  expect(a.findOne.mock.calls[0][0]).not.toHaveProperty('relations');
});

it('propagates a shard outage instead of returning partial data or writing to the primary', async () => {
  const { store, a, b, primary } = setup();
  a.save.mockRejectedValue(new Error('shard unavailable'));
  b.count.mockRejectedValue(new Error('shard unavailable'));
  await expect(store.save({ userId: 'student-a' } as never)).rejects.toThrow(
    'unavailable',
  );
  await expect(store.count()).rejects.toThrow('unavailable');
  expect(primary.save).not.toHaveBeenCalled();
});

it('routes contest aggregates only to shards with eligible attempts, excluding source code from the query', async () => {
  const { store, a, b } = setup();
  await store.contestSolvedProblems(
    ['problem'],
    [{ userId: 'student-a', attemptId: 'attempt-a', start: new Date(0), end: new Date(100) }],
  );
  expect(a.query).toHaveBeenCalledTimes(1);
  expect(b.query).not.toHaveBeenCalled();
  expect(a.query.mock.calls[0][0]).toContain('min(s."createdAt")');
  expect(a.query.mock.calls[0][0]).toContain('s."contestAttemptId" = w."attemptId"');
  expect(a.query.mock.calls[0][0]).not.toContain('s.code');
});

it('combines anonymous candidate comparison counts across shards', async () => {
  const { store, a, b, primary } = setup();
  a.query.mockResolvedValue([{ runtimeCount: '2', runtimeBetter: '1', memoryCount: '2', memoryBetter: '2' }]);
  b.query.mockResolvedValue([{ runtimeCount: '1', runtimeBetter: '1', memoryCount: '0', memoryBetter: '0' }]);
  const result = await store.performanceComparison({ problemId: 'p', problemSource: 'metadata', userId: 'student-a', totalTestCases: 5, runtime: 8, memory: 16 } as never, ['python', 'py', 'python3']);
  expect(result).toEqual({ runtime: { percentile: 66.7, sampleSize: 3 }, memory: { percentile: 100, sampleSize: 2 } });
  expect(primary.query).not.toHaveBeenCalled();
  expect(a.query.mock.calls[0][1]).toEqual(['p', 'metadata', ['python', 'py', 'python3'], 'student-a', 5, 8, 16]);
  expect(a.query.mock.calls[0][0]).toContain('GROUP BY "userId"');
  expect(a.query.mock.calls[0][0]).toContain('"userId" <> $4');
});
it('does not fabricate comparisons without peer measurements', async () => {
  const { store } = setup(false);
  expect(await store.performanceComparison({} as never, ['python'])).toEqual({ runtime: null, memory: null });
});

it('sums problem statistics across every shard and excludes non-judged statuses', async () => {
  const { store, a, b, primary } = setup();
  a.query.mockResolvedValue([{ totalSubmissions: '3', acceptedSubmissions: '1', solvers: '2', acceptedSolvers: '1' }]);
  b.query.mockResolvedValue([{ totalSubmissions: '2', acceptedSubmissions: '2', solvers: '1', acceptedSolvers: '1' }]);
  expect(await store.problemStats('problem-1')).toEqual({
    totalSubmissions: 5,
    acceptedSubmissions: 3,
    solvers: 3,
    acceptedSolvers: 2,
  });
  expect(primary.query).not.toHaveBeenCalled();
  expect(a.query.mock.calls[0][1]).toEqual(['problem-1']);
  expect(a.query.mock.calls[0][0]).toContain('count(DISTINCT "userId")');
  expect(a.query.mock.calls[0][0]).toContain(`'cancelled'`);
});

it('queries only the primary repository when sharding is disabled', async () => {
  const { store, primary, a } = setup(false);
  primary.query.mockResolvedValue([{ totalSubmissions: '1', acceptedSubmissions: '0', solvers: '1', acceptedSolvers: '0' }]);
  expect(await store.problemStats('problem-1')).toEqual({
    totalSubmissions: 1,
    acceptedSubmissions: 0,
    solvers: 1,
    acceptedSolvers: 0,
  });
  expect(a.query).not.toHaveBeenCalled();
});

it('combines runtime distribution buckets across shards', async () => {
  const { store, a, b } = setup();
  a.query.mockResolvedValue([{ bucket: '2', count: '3' }, { bucket: '5', count: '1' }]);
  b.query.mockResolvedValue([{ bucket: '2', count: '2' }]);
  const result = await store.runtimeDistribution(
    { problemId: 'p', problemSource: 'metadata', userId: 'student-a', totalTestCases: 5 } as never,
    ['python', 'py', 'python3'],
  );
  expect(result.sampleSize).toBe(6);
  expect(result.buckets).toHaveLength(9);
  expect(result.buckets[1]).toEqual({ min: 10, max: 20, count: 5 });
  expect(result.buckets[4]).toEqual({ min: 80, max: 160, count: 1 });
  expect(result.buckets[8]).toEqual({ min: 1280, max: null, count: 0 });
  expect(a.query.mock.calls[0][1]).toEqual(['p', 'metadata', ['python', 'py', 'python3'], 'student-a', 5]);
  expect(a.query.mock.calls[0][0]).toContain('width_bucket');
});
