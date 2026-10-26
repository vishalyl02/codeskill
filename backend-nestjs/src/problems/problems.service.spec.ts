import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Problem } from '../database/entities/problem.entity';
import { ProblemMetadata } from '../database/entities/problem-metadata.entity';
import { Question } from '../database/entities/question.entity';
import { CacheService } from '../redis/cache.service';
import { ProblemsService } from './problems.service';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

const id = '00000000-0000-4000-8000-000000000001';
const chain = () => {
  const qb = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    getOne: jest.fn(),
  };
  qb.leftJoinAndSelect.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  return qb;
};

function setup() {
  const metadataQuery = chain();
  const legacyQuery = chain();
  const bankQuery = chain();
  const bank = {
    createQueryBuilder: jest.fn(() => bankQuery),
    findOne: jest.fn(),
  };
  const legacy = {
    query: jest.fn<Promise<unknown[]>, [string, unknown[]]>(),
    createQueryBuilder: jest.fn(() => legacyQuery),
    findOne: jest.fn(),
  };
  const metadata = {
    createQueryBuilder: jest.fn(() => metadataQuery),
    findOne: jest.fn(),
  };
  const cache = {
    get: jest.fn<Promise<unknown>, [string]>().mockResolvedValue(null),
    set: jest.fn<void, [string, unknown, number]>(),
  };
  const service = new ProblemsService(
    legacy as unknown as Repository<Problem>,
    metadata as unknown as Repository<ProblemMetadata>,
    bank as unknown as Repository<Question>,
    cache as unknown as CacheService,
  );
  return {
    service,
    metadata,
    legacy,
    cache,
    metadataQuery,
    legacyQuery,
    bank,
    bankQuery,
  };
}

function practice(visibility = 'Published') {
  return Object.assign(new ProblemMetadata(), {
    id,
    title: 'Two Sum',
    slug: 'two-sum',
    difficulty: 'easy',
    visibility,
    categories: ['Arrays', 'Graphs'],
    tags: ['Interview'],
    stats: {
      totalSubmissions: 5,
      acceptanceRate: 60,
      privateField: 'stats-secret',
    },
    author_id: 'author-secret',
    statement: {
      description: 'Find a pair',
      inputFormat: 'Numbers',
      outputFormat: 'Indices',
      constraints: 'n <= 100',
      samples: [{ input: '1 2', output: '3', explanation: 'Sample' }],
    },
    config: {
      timeLimit: 5000,
      memoryLimit: 512,
      supportedLanguages: ['python'],
      starterCode: { python: 'print(1)', referenceSolution: 'starter-secret' },
      referenceSolution: { python: 'reference-secret' },
      customCheckerCode: { python: 'checker-secret' },
      hasCustomChecker: true,
    },
    testCases: {
      cases: [
        { input: '1 2', output: '3', isHidden: false },
        { input: 'hidden-input', output: 'hidden-output', isHidden: true },
      ],
    },
  });
}

function legacyProblem(visibility = 'Public') {
  return Object.assign(new Problem(), {
    id,
    title: 'Legacy',
    slug: 'legacy',
    difficulty: 'Easy',
    visibility,
    description: 'Legacy statement',
    tags: ['Arrays'],
    supportedLanguages: ['cpp'],
    timeLimit: 3000,
    memoryLimit: 256,
    examples: [{ input: '1', output: '2' }],
    starterCode: { cpp: 'int main() {}', referenceSolution: 'legacy-secret' },
    testCases: [
      { input: '1', output: '2', isHidden: false },
      { input: 'secret-input', output: 'secret-output', isHidden: true },
    ],
  });
}

it('returns canonical IDs, topic categories, and safe stats from the catalog response', async () => {
  const { service, legacy, cache } = setup();
  legacy.query
    .mockResolvedValueOnce([
      {
        id,
        title: 'Two Sum',
        slug: 'two-sum',
        categories: ['Arrays', 'Graphs'],
        tags: ['Interview'],
        stats: { acceptanceRate: 60, secret: 'private' },
      },
    ])
    .mockResolvedValueOnce([{ total: '3' }]);
  const result = await service.getProblems({
    page: 2,
    limit: 1,
    category: 'Graphs',
  });
  expect(result).toMatchObject({
    count: 1,
    total: 3,
    page: 2,
    pages: 3,
    totalPages: 3,
    data: [
      {
        id,
        _id: id,
        categories: ['Arrays', 'Graphs'],
        stats: { acceptanceRate: 60 },
      },
    ],
  });
  expect(JSON.stringify(result)).not.toContain('private');
  expect(cache.set.mock.calls[0][0]).toMatch(/^problems:public-v3:/);
});

it('normalizes empty filter sentinels and clamps invalid pagination before the database query', async () => {
  const { service, legacy } = setup();
  legacy.query
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ total: '0' }]);
  expect(
    await service.getProblems({
      page: -2,
      limit: 10000,
      category: 'undefined',
      topic: 'null',
      difficulty: 'All',
    }),
  ).toMatchObject({ page: 1, total: 0, pages: 1 });
  expect(legacy.query.mock.calls[0][1]).toEqual([100, 0]);
});

it('uses a cached catalog result without requerying the database', async () => {
  const { service, legacy, cache } = setup();
  cache.get.mockResolvedValueOnce({
    data: [],
    total: 0,
    pages: 1,
    totalPages: 1,
  });
  expect(await service.getProblems()).toMatchObject({ total: 0 });
  expect(legacy.query).not.toHaveBeenCalled();
});

it('maps admin statement, starter code and visible tests without exposing execution secrets', async () => {
  const { service, metadataQuery, cache } = setup();
  metadataQuery.getOne.mockResolvedValueOnce(practice());
  const result = await service.getProblemBySlug('two-sum');
  expect(result.data).toMatchObject({
    id,
    _id: id,
    categories: ['Arrays', 'Graphs'],
    statement: { samples: [{ input: '1 2', output: '3' }] },
    config: {
      timeLimit: 5000,
      memoryLimit: 512,
      starterCode: { python: 'print(1)' },
    },
    testCases: { cases: [{ input: '1 2', output: '3' }] },
  });
  for (const secret of [
    'hidden-input',
    'hidden-output',
    'starter-secret',
    'reference-secret',
    'checker-secret',
    'stats-secret',
    'author-secret',
  ])
    expect(JSON.stringify(result)).not.toContain(secret);
  expect(cache.get).not.toHaveBeenCalled();
});

it.each(['Draft', 'Private', 'Archived', 'pending'])(
  'blocks %s metadata even if a public legacy copy or cached detail exists',
  async (visibility) => {
    const { service, metadataQuery, legacy, cache } = setup();
    metadataQuery.getOne.mockResolvedValueOnce(practice(visibility));
    cache.get.mockResolvedValue({ data: practice('Published') });
    await expect(service.getProblemBySlug('two-sum')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(legacy.createQueryBuilder).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
  },
);

it('preserves legacy public detail with workspace samples and starter code', async () => {
  const { service, metadataQuery, legacyQuery } = setup();
  metadataQuery.getOne.mockResolvedValueOnce(null);
  legacyQuery.getOne.mockResolvedValueOnce(legacyProblem());
  const result = await service.getProblemBySlug('legacy');
  expect(result.data).toMatchObject({
    _id: id,
    categories: ['Arrays'],
    statement: { samples: [{ input: '1', output: '2' }] },
    config: { starterCode: { cpp: 'int main() {}' } },
    testCases: { cases: [{ input: '1', output: '2' }] },
  });
  expect(JSON.stringify(result)).not.toContain('legacy-secret');
  expect(JSON.stringify(result)).not.toContain('secret-input');
});

it('does not fall back to an unpublished legacy problem', async () => {
  const { service, metadataQuery, legacyQuery } = setup();
  metadataQuery.getOne.mockResolvedValueOnce(null);
  legacyQuery.getOne.mockResolvedValueOnce(legacyProblem('Private'));
  await expect(service.getProblemBySlug('legacy')).rejects.toBeInstanceOf(
    NotFoundException,
  );
});

it('resolves canonical metadata for execution with all server tests and configured limits', async () => {
  const { service, metadata } = setup();
  metadata.findOne.mockResolvedValueOnce(practice());
  expect(await service.getExecutionProblem(id)).toMatchObject({
    id,
    source: 'metadata',
    config: {
      timeLimit: 5000,
      memoryLimit: 512,
      supportedLanguages: ['python'],
    },
    testCases: [
      { input: '1 2', isHidden: false },
      { input: 'hidden-input', isHidden: true },
    ],
  });
});

it('resolves persisted legacy source without rebinding its identity to metadata', async () => {
  const { service, metadata, legacy } = setup();
  legacy.findOne.mockResolvedValueOnce(legacyProblem());
  expect(await service.getExecutionProblem(id, 'problem')).toMatchObject({
    id,
    source: 'problem',
    config: { timeLimit: 3000, supportedLanguages: ['cpp'] },
  });
  expect(metadata.findOne).not.toHaveBeenCalled();
});

it('rejects unpublished metadata and does not fall back to another source', async () => {
  const { service, metadata, legacy } = setup();
  metadata.findOne.mockResolvedValueOnce(practice('Draft'));
  await expect(service.getExecutionProblem(id)).rejects.toBeInstanceOf(
    NotFoundException,
  );
  expect(legacy.findOne).not.toHaveBeenCalled();
});

it('rejects missing metadata when the persisted source requires it', async () => {
  const { service, metadata, legacy } = setup();
  metadata.findOne.mockResolvedValueOnce(null);
  await expect(
    service.getExecutionProblem(id, 'metadata'),
  ).rejects.toBeInstanceOf(NotFoundException);
  expect(legacy.findOne).not.toHaveBeenCalled();
});

it('rejects invalid identities before any database query', async () => {
  const { service, metadata, legacy } = setup();
  await expect(
    service.getExecutionProblem('not-a-uuid'),
  ).rejects.toBeInstanceOf(NotFoundException);
  expect(metadata.findOne).not.toHaveBeenCalled();
  expect(legacy.findOne).not.toHaveBeenCalled();
});

it.each(['Private', 'Published'])(
  'blocks an old legacy slug when %s metadata has the same identity and a new slug',
  async (visibility) => {
    const { service, metadataQuery, legacyQuery } = setup();
    metadataQuery.getOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(practice(visibility));
    legacyQuery.getOne.mockResolvedValueOnce(legacyProblem());
    await expect(service.getProblemBySlug('legacy')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(metadataQuery.where).toHaveBeenLastCalledWith(
      'metadata.id = :id OR lower(btrim(metadata.slug)) = :slug',
      { id, slug: 'legacy' },
    );
  },
);

it.each([undefined, 'problem'] as const)(
  'blocks a stale legacy execution identity with source %s when metadata supersedes it',
  async (source) => {
    const { service, metadata, metadataQuery, legacy } = setup();
    metadata.findOne.mockResolvedValueOnce(null);
    metadataQuery.getOne.mockResolvedValueOnce(practice('Private'));
    legacy.findOne.mockResolvedValueOnce(legacyProblem());
    await expect(
      service.getExecutionProblem(id, source),
    ).rejects.toBeInstanceOf(NotFoundException);
  },
);

function codingQuestion(
  metadata: Record<string, unknown> = { visibility: 'Published' },
): Question {
  return Object.assign(new Question(), {
    id,
    question: 'Bank Title',
    title: 'Bank Title',
    slug: 'bank-title',
    questionType: 'DSA',
    status: 'approved',
    topic: 'Arrays',
    difficulty: 'easy',
    metadata,
    problemStatement: 'Find a pair',
    constraints: ['n <= 100'],
    supportedLanguages: ['python'],
    starterCode: [{ language: 'python', code: 'print(1)' }],
    referenceSolutions: [{ language: 'python', sourceCode: 'SECRET-SOLUTION' }],
    testCases: [
      { input: '2', expectedOutput: '4', isHidden: false },
      { input: 'SECRET-INPUT', output: 'SECRET-OUTPUT', isHidden: true },
    ],
  });
}
it('maps explicitly published bank coding details without answers, reference solutions or hidden tests', async () => {
  const { service, bankQuery } = setup();
  bankQuery.getOne.mockResolvedValueOnce(codingQuestion());
  const result = await service.getProblemBySlug('bank-title');
  expect(result.data).toMatchObject({
    id,
    categories: ['Arrays'],
    statement: { description: 'Find a pair' },
    config: { starterCode: { python: 'print(1)' } },
    testCases: { cases: [{ input: '2', output: '4' }] },
  });
  expect(JSON.stringify(result)).not.toContain('SECRET');
});
it.each([
  {},
  { visibility: 'Draft' },
  { visibility: 'Private' },
])('does not publish bank records with metadata %p', async (metadata) => {
  const { service, bankQuery, bank } = setup();
  bankQuery.getOne.mockResolvedValueOnce(codingQuestion(metadata));
  bank.findOne.mockResolvedValueOnce(codingQuestion(metadata));
  await expect(service.getProblemBySlug('bank-title')).rejects.toBeInstanceOf(
    NotFoundException,
  );
  await expect(
    service.getExecutionProblem(id, 'question'),
  ).rejects.toBeInstanceOf(NotFoundException);
});
it('allows contestOnly bank records to resolve by slug and for execution', async () => {
  const { service, bankQuery, bank } = setup();
  const contestQuestion = codingQuestion({
    visibility: 'Published',
    contestOnly: true,
  });
  bankQuery.getOne.mockResolvedValueOnce(contestQuestion);
  const detail = await service.getProblemBySlug('bank-title');
  expect(detail.data).toMatchObject({
    id,
    title: 'Bank Title',
  });

  bank.findOne.mockResolvedValueOnce(contestQuestion);
  const execution = await service.getExecutionProblem(id, 'question');
  expect(execution).toMatchObject({
    id,
    source: 'question',
  });
});
it.each(['MCQ', 'TRUE_FALSE', 'CODE_OUTPUT', 'MULTIPLE_CHOICE'])(
  'excludes noncoding %s despite public visibility',
  async (questionType) => {
    const { service, bank } = setup();
    bank.findOne.mockResolvedValueOnce({ ...codingQuestion(), questionType });
    await expect(service.getExecutionProblem(id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  },
);
it('resolves bank UUIDs and output/expectedOutput case formats without copying records', async () => {
  const { service, bank, legacy } = setup();
  const question = codingQuestion();
  question.slug = undefined;
  bank.findOne.mockResolvedValueOnce(question);
  expect(await service.getExecutionProblem(id, 'question')).toMatchObject({
    id,
    source: 'question',
    slug: `question-${id}`,
    testCases: [
      { output: '4', isHidden: false },
      { output: 'SECRET-OUTPUT', isHidden: true },
    ],
  });
  expect(legacy.findOne).not.toHaveBeenCalled();
});
