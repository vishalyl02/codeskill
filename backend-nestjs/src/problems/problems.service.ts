import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Problem } from '../database/entities/problem.entity';
import { ProblemMetadata } from '../database/entities/problem-metadata.entity';
import { Question } from '../database/entities/question.entity';
import { CacheService } from '../redis/cache.service';

export interface PublicProblemsQuery {
  page?: string | number;
  limit?: string | number;
  difficulty?: string;
  category?: string;
  topic?: string;
  search?: string;
}

export interface ExecutionProblem {
  id: string;
  source: 'problem' | 'metadata' | 'question';
  title: string;
  slug: string;
  testCases: Array<{
    input?: string;
    output?: string;
    isHidden?: boolean;
    explanation?: string;
  }>;
  config: {
    timeLimit: number;
    memoryLimit: number;
    supportedLanguages: string[];
    [key: string]: unknown;
  };
}

export interface CatalogRow {
  id: string;
  title: string;
  slug: string;
  difficulty: string;
  categories: string[];
  tags: string[];
  stats: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ]
    : [];
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const published = (visibility: unknown) =>
  ['public', 'published'].includes(text(visibility).toLowerCase());
const filter = (value: unknown) =>
  ['all', 'all topics', 'undefined', 'null'].includes(text(value).toLowerCase())
    ? ''
    : text(value);
const positiveInt = (value: unknown, fallback: number) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : fallback;

function publicStats(value: unknown) {
  const stats = object(value);
  const number = (key: string) =>
    typeof stats[key] === 'number' && Number.isFinite(stats[key])
      ? stats[key]
      : 0;
  return {
    totalSubmissions: number('totalSubmissions'),
    acceptedSubmissions: number('acceptedSubmissions'),
    acceptanceRate: number('acceptanceRate'),
  };
}

function codeMap(value: unknown) {
  return Object.fromEntries(
    Object.entries(object(value)).filter(
      ([key, code]) =>
        typeof code === 'string' && !/reference|solution|checker/i.test(key),
    ),
  );
}

function cases(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((item) => object(item))
    .map((item) => ({
      input: typeof item.input === 'string' ? item.input : '',
      output:
        typeof item.output === 'string'
          ? item.output
          : typeof item.expectedOutput === 'string'
            ? item.expectedOutput
            : '',
      explanation: typeof item.explanation === 'string' ? item.explanation : '',
      isHidden: Boolean(item.isHidden),
    }));
}

const codingTypes = ['dsa', 'coding', 'algorithmic'];
const bankSlugSql =
  "coalesce(nullif(btrim(q.slug), ''), 'question-' || q.id::text)";
const bankPublicSql = `lower(q."questionType") IN ('dsa', 'coding', 'algorithmic')
  AND lower(q.status) IN ('approved', 'active', 'published')
  AND lower(btrim(q.metadata->>'visibility')) IN ('published', 'public')
  AND coalesce(q.metadata->>'contestOnly', 'false') <> 'true'`;
function bankPublished(question: Question) {
  const metadata = object(question.metadata);
  return (
    codingTypes.includes(text(question.questionType).toLowerCase()) &&
    ['approved', 'active', 'published'].includes(
      text(question.status).toLowerCase(),
    ) &&
    published(metadata.visibility) &&
    metadata.contestOnly !== true
  );
}
function bankSlug(question: Question) {
  return text(question.slug) || `question-${question.id}`;
}
function bankTopics(question: Question) {
  const categories = strings(object(question.metadata).categories);
  return categories.length ? categories : strings([question.topic]);
}
// Explicit publication is required. Approval alone never grants guest access.
const catalogSql = `WITH catalog AS (
  SELECT m.id, m.title, btrim(m.slug) AS slug, m.difficulty,
    CASE WHEN jsonb_typeof(m.categories) = 'array' THEN m.categories ELSE '[]'::jsonb END AS categories,
    CASE WHEN jsonb_typeof(m.tags) = 'array' THEN m.tags ELSE '[]'::jsonb END AS tags,
    m.stats, m."createdAt", m."updatedAt"
  FROM problem_metadata m
  WHERE lower(btrim(m.visibility)) IN ('published', 'public') AND btrim(m.slug) <> ''
  UNION ALL
  SELECT q.id, coalesce(nullif(btrim(q.title), ''), q.question) AS title,
    ${bankSlugSql} AS slug, q.difficulty,
    CASE WHEN jsonb_typeof(q.metadata->'categories') = 'array' THEN q.metadata->'categories' ELSE to_jsonb(ARRAY[q.topic]) END AS categories,
    coalesce(to_jsonb(q.tags), '[]'::jsonb) AS tags, '{}'::jsonb AS stats, q."createdAt", q."updatedAt"
  FROM questions q
  WHERE ${bankPublicSql}
    AND NOT EXISTS (SELECT 1 FROM problem_metadata m WHERE m.id = q.id OR lower(btrim(m.slug)) = lower(${bankSlugSql}))
  UNION ALL
  SELECT p.id, p.title, btrim(p.slug) AS slug, p.difficulty,
    coalesce(to_jsonb(p.tags), '[]'::jsonb) AS categories,
    coalesce(to_jsonb(p.tags), '[]'::jsonb) AS tags,
    p.stats, p."createdAt", p."updatedAt"
  FROM problems p
  WHERE (lower(btrim(p.visibility)) IN ('published', 'public') OR p.visibility IS NULL)
    AND btrim(p.slug) <> ''
    AND NOT EXISTS (SELECT 1 FROM problem_metadata m WHERE m.id = p.id OR lower(btrim(m.slug)) = lower(btrim(p.slug)))
    AND NOT EXISTS (SELECT 1 FROM questions q WHERE lower(q."questionType") IN ('dsa', 'coding', 'algorithmic')
      AND (q.id = p.id OR lower(${bankSlugSql}) = lower(btrim(p.slug))))
)`;

@Injectable()
export class ProblemsService {
  constructor(
    @InjectRepository(Problem)
    private readonly problemRepository: Repository<Problem>,
    @InjectRepository(ProblemMetadata)
    private readonly metadataRepository: Repository<ProblemMetadata>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    private readonly cacheService: CacheService,
  ) {}

  async getProblems(query: PublicProblemsQuery = {}) {
    const page = Math.min(1_000_000, positiveInt(query.page, 1));
    const limit = Math.min(100, positiveInt(query.limit, 20));
    const difficulty = filter(query.difficulty).toLowerCase();
    const category = filter(query.category) || filter(query.topic);
    const search = text(query.search);
    const cacheKey = `problems:public-v3:${JSON.stringify([page, limit, difficulty, category, search])}`;
    const cached = await this.cacheService.get<{
      count: number;
      total: number;
      page: number;
      pages: number;
      totalPages: number;
      data: CatalogRow[];
    }>(cacheKey);
    if (cached) return cached;

    const parameters: unknown[] = [];
    const conditions: string[] = [];
    if (difficulty) {
      parameters.push(difficulty);
      conditions.push(`lower(difficulty) = $${parameters.length}`);
    }
    if (category) {
      parameters.push(category);
      conditions.push(
        `EXISTS (SELECT 1 FROM jsonb_array_elements_text(categories) AS topic(value) WHERE lower(topic.value) = lower($${parameters.length}))`,
      );
    }
    if (search) {
      parameters.push(`%${search}%`);
      const parameter = `$${parameters.length}`;
      conditions.push(
        `(title ILIKE ${parameter} OR slug ILIKE ${parameter} OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(categories || tags) AS topic(value) WHERE topic.value ILIKE ${parameter}))`,
      );
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows, counts]: [CatalogRow[], Array<{ total: string }>] =
      await Promise.all([
        this.problemRepository.query<CatalogRow[]>(
          `${catalogSql} SELECT * FROM catalog ${where} ORDER BY "createdAt" DESC, id DESC LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
          [...parameters, limit, (page - 1) * limit],
        ),
        this.problemRepository.query<Array<{ total: string }>>(
          `${catalogSql} SELECT count(*) AS total FROM catalog ${where}`,
          parameters,
        ),
      ]);
    const total = Number(counts[0]?.total || 0);
    const result = {
      count: rows.length,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      totalPages: Math.max(1, Math.ceil(total / limit)),
      data: rows.map((row) => ({
        ...row,
        _id: row.id,
        categories: strings(row.categories),
        tags: strings(row.tags),
        stats: publicStats(row.stats),
      })),
    };
    await this.cacheService.set(cacheKey, result, 300);
    return result;
  }

  private summary(record: Problem | ProblemMetadata) {
    return {
      id: record.id,
      _id: record.id,
      title: record.title,
      slug: text(record.slug),
      difficulty: record.difficulty,
      categories:
        record instanceof ProblemMetadata
          ? strings(record.categories)
          : strings(record.tags),
      tags: strings(record.tags),
      stats: publicStats(record.stats),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async metadataBySlug(slug: string) {
    return this.metadataRepository
      .createQueryBuilder('metadata')
      .leftJoinAndSelect('metadata.statement', 'statement')
      .leftJoinAndSelect('metadata.config', 'config')
      .leftJoinAndSelect('metadata.testCases', 'testCases')
      .where('lower(btrim(metadata.slug)) = :slug', {
        slug: text(slug).toLowerCase(),
      })
      .getOne();
  }

  private async hasMetadataCounterpart(problem: Problem | Question) {
    return Boolean(
      await this.metadataRepository
        .createQueryBuilder('metadata')
        .where('metadata.id = :id OR lower(btrim(metadata.slug)) = :slug', {
          id: problem.id,
          slug: text(problem.slug).toLowerCase(),
        })
        .getOne(),
    );
  }

  private async hasBankCounterpart(problem: Problem) {
    return Boolean(
      await this.questionRepository
        .createQueryBuilder('q')
        .where(
          `lower(q."questionType") IN (:...types) AND (q.id = :id OR lower(${bankSlugSql}) = :slug)`,
          {
            types: codingTypes,
            id: problem.id,
            slug: text(problem.slug).toLowerCase(),
          },
        )
        .getOne(),
    );
  }

  private bankConfig(question: Question) {
    const starters = Array.isArray(question.starterCode)
      ? question.starterCode
      : [];
    return {
      timeLimit: question.timeLimit ?? 1000,
      memoryLimit: question.memoryLimit ?? 256,
      supportedLanguages: strings(question.supportedLanguages),
      starterCode: codeMap(
        Object.fromEntries(starters.map((item) => [item.language, item.code])),
      ),
      functionSignature: question.functionSignature,
    };
  }

  async getProblemBySlug(slug: string) {
    // Read current publication status before returning any body or test data.
    const metadata = await this.metadataBySlug(slug);
    if (metadata) {
      if (!published(metadata.visibility))
        throw new NotFoundException('Problem not found');
      const statement = metadata.statement;
      const config = metadata.config;
      const samples = cases(statement?.samples).map(
        ({ input, output, explanation }) => ({ input, output, explanation }),
      );
      return {
        data: {
          ...this.summary(metadata),
          statement: {
            description: statement?.description || '',
            inputFormat: statement?.inputFormat || '',
            outputFormat: statement?.outputFormat || '',
            constraints: statement?.constraints || '',
            samples,
          },
          config: {
            timeLimit: config?.timeLimit ?? 2000,
            memoryLimit: config?.memoryLimit ?? 256,
            cpuLimit: config?.cpuLimit ?? 1,
            supportedLanguages: strings(config?.supportedLanguages),
            starterCode: codeMap(config?.starterCode),
            executionMode: config?.executionMode || 'standard',
            functionSignature: config?.functionSignature as unknown,
            exactOutput: config?.exactOutput ?? false,
            hasCustomChecker: config?.hasCustomChecker ?? false,
          },
          testCases: {
            cases: cases(metadata.testCases?.cases).filter(
              (test) => !test.isHidden,
            ),
          },
        },
      };
    }
    const question = await this.questionRepository
      .createQueryBuilder('q')
      .where(
        `lower(q."questionType") IN (:...types) AND lower(${bankSlugSql}) = :slug`,
        { types: codingTypes, slug: text(slug).toLowerCase() },
      )
      .getOne();
    if (question) {
      if (
        !bankPublished(question) ||
        (await this.hasMetadataCounterpart(question))
      )
        throw new NotFoundException('Problem not found');
      const samples = cases(question.examples).map(
        ({ input, output, explanation }) => ({ input, output, explanation }),
      );
      return {
        data: {
          id: question.id,
          _id: question.id,
          title: text(question.title) || question.question,
          slug: bankSlug(question),
          difficulty: question.difficulty,
          categories: bankTopics(question),
          tags: strings(question.tags),
          stats: publicStats({}),
          createdAt: question.createdAt,
          updatedAt: question.updatedAt,
          statement: {
            description:
              question.problemStatement ||
              question.description ||
              question.question,
            inputFormat: question.inputFormat || '',
            outputFormat: question.outputFormat || '',
            constraints: strings(question.constraints).join('\n'),
            samples,
            hints: strings(question.hints),
          },
          hints: strings(question.hints),
          config: this.bankConfig(question),
          testCases: {
            cases: cases(question.testCases).filter((test) => !test.isHidden),
          },
        },
      };
    }
    const problem = await this.problemRepository
      .createQueryBuilder('problem')
      .where('lower(btrim(problem.slug)) = :slug', {
        slug: text(slug).toLowerCase(),
      })
      .getOne();
    if (
      !problem ||
      (problem.visibility !== null && !published(problem.visibility)) ||
      (await this.hasMetadataCounterpart(problem)) ||
      (await this.hasBankCounterpart(problem))
    )
      throw new NotFoundException('Problem not found');
    const samples = cases(problem.examples).map(
      ({ input, output, explanation }) => ({ input, output, explanation }),
    );
    return {
      data: {
        ...this.summary(problem),
        description: problem.description,
        inputFormat: problem.inputFormat,
        outputFormat: problem.outputFormat,
        constraints: problem.constraints,
        hints: strings(problem.hints),
        editorial: problem.editorial,
        statement: {
          description: problem.description,
          inputFormat: problem.inputFormat,
          outputFormat: problem.outputFormat,
          constraints: problem.constraints,
          samples,
          examples: samples,
          hints: strings(problem.hints),
        },
        config: {
          timeLimit: problem.timeLimit,
          memoryLimit: problem.memoryLimit,
          supportedLanguages: strings(problem.supportedLanguages),
          starterCode: codeMap(problem.starterCode),
          difficulty: problem.difficulty,
        },
        testCases: {
          cases: cases(problem.testCases).filter((test) => !test.isHidden),
        },
      },
    };
  }

  async getExecutionProblem(
    id: string,
    source?: 'problem' | 'metadata' | 'question',
  ): Promise<ExecutionProblem> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new NotFoundException('Problem not found');
    if (!source || source === 'metadata') {
      const metadata = await this.metadataRepository.findOne({
        where: { id },
        relations: { config: true, testCases: true },
      });
      if (metadata) {
        if (!published(metadata.visibility))
          throw new NotFoundException('Problem not found');
        const config = metadata.config;
        return {
          id: metadata.id,
          source: 'metadata',
          title: metadata.title,
          slug: metadata.slug,
          testCases: cases(metadata.testCases?.cases),
          config: {
            timeLimit: config?.timeLimit ?? 2000,
            memoryLimit: config?.memoryLimit ?? 256,
            cpuLimit: config?.cpuLimit ?? 1,
            supportedLanguages: strings(config?.supportedLanguages),
            executionMode: config?.executionMode || 'standard',
            functionSignature: config?.functionSignature as unknown,
            exactOutput: config?.exactOutput ?? false,
            hasCustomChecker: config?.hasCustomChecker ?? false,
            customCheckerCode: config?.customCheckerCode,
          },
        };
      }
      if (source === 'metadata')
        throw new NotFoundException('Problem not found');
    }
    if (!source || source === 'question') {
      const question = await this.questionRepository.findOne({ where: { id } });
      if (question) {
        if (
          !bankPublished(question) ||
          (await this.hasMetadataCounterpart(question))
        )
          throw new NotFoundException('Problem not found');
        return {
          id: question.id,
          source: 'question',
          title: text(question.title) || question.question,
          slug: bankSlug(question),
          testCases: cases(question.testCases),
          config: this.bankConfig(question),
        };
      }
      if (source === 'question')
        throw new NotFoundException('Problem not found');
    }
    if (source && source !== 'problem')
      throw new NotFoundException('Problem not found');
    const problem = await this.problemRepository.findOne({ where: { id } });
    if (
      !problem ||
      (problem.visibility !== null && !published(problem.visibility)) ||
      (await this.hasMetadataCounterpart(problem)) ||
      (await this.hasBankCounterpart(problem))
    )
      throw new NotFoundException('Problem not found');
    return {
      id: problem.id,
      source: 'problem',
      title: problem.title,
      slug: problem.slug,
      testCases: cases(problem.testCases),
      config: {
        timeLimit: problem.timeLimit,
        memoryLimit: problem.memoryLimit,
        supportedLanguages: strings(problem.supportedLanguages),
      },
    };
  }
}
