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
    [{ userId: 'student-a', start: new Date(0), end: new Date(100) }],
  );
  expect(a.query).toHaveBeenCalledTimes(1);
  expect(b.query).not.toHaveBeenCalled();
  expect(a.query.mock.calls[0][0]).toContain('min(s."createdAt")');
  expect(a.query.mock.calls[0][0]).not.toContain('s.code');
});
