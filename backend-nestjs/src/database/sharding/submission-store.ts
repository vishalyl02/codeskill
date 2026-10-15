import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  EntityManager,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  FindOptionsOrderValue,
  In,
  Repository,
} from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import { SubmissionShardRegistry } from './shard-registry';

export interface ContestSubmissionWindow {
  userId: string;
  start: Date | string;
  end: Date | string;
}
export interface ContestSolvedProblem {
  userId: string;
  problemId: string;
  solvedAt: string;
}

function direction(
  value: FindOptionsOrderValue | undefined,
  fallback: 'ASC' | 'DESC',
): 'ASC' | 'DESC' {
  const raw = typeof value === 'object' ? value.direction : value;
  if (raw === undefined) return fallback;
  return raw === 1 || (typeof raw === 'string' && raw.toUpperCase() === 'ASC')
    ? 'ASC'
    : 'DESC';
}

/** Explicitly routes every submission consumer, including the separate judge. */
@Injectable()
export class SubmissionStore {
  constructor(
    @InjectRepository(Submission)
    private readonly primary: Repository<Submission>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly registry: SubmissionShardRegistry,
  ) {}

  get isSharded(): boolean {
    return this.registry.enabled;
  }
  create(value: DeepPartial<Submission>): Submission {
    return this.primary.create(value);
  }
  async save(value: Submission): Promise<Submission> {
    if (!this.isSharded) return this.primary.save(value);
    const repo = this.registry.forUser(value.userId).getRepository(Submission);
    // Reference entities live only in the primary database. Do not cascade them.
    const record: DeepPartial<Submission> = { ...value };
    delete record.user;
    delete record.problem;
    const saved = await repo.save(repo.create(record));
    Object.assign(value, saved);
    return value;
  }

  /** Run work in a transaction on the database that owns this user's submissions. */
  async transaction<T>(
    userId: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (!this.isSharded) return this.primary.manager.transaction(work);
    return this.registry.forUser(userId).transaction(work);
  }

  private repositories(
    where?: FindOptionsWhere<Submission> | FindOptionsWhere<Submission>[],
  ): Repository<Submission>[] {
    if (!this.isSharded) return [this.primary];
    const clauses = Array.isArray(where) ? where : [where];
    if (
      clauses.length &&
      clauses.every((clause) => typeof clause?.userId === 'string')
    ) {
      return [
        ...new Set(
          clauses.map((clause) =>
            this.registry.forUser(clause!.userId as string),
          ),
        ),
      ].map((source) => source.getRepository(Submission));
    }
    return this.registry.all.map((source) => source.getRepository(Submission));
  }

  private async hydrateUsers(
    rows: Submission[],
    relations?: FindManyOptions<Submission>['relations'],
  ): Promise<void> {
    const requested = Array.isArray(relations)
      ? relations.includes('user')
      : relations?.user;
    if (!requested || !rows.length) return;
    const users = await this.users.find({
      where: { id: In([...new Set(rows.map((row) => row.userId))]) },
    });
    const indexed = new Map(users.map((user) => [user.id, user]));
    for (const row of rows) row.user = indexed.get(row.userId)!;
  }

  async find(options: FindManyOptions<Submission> = {}): Promise<Submission[]> {
    if (!this.isSharded) return this.primary.find(options);
    const repos = this.repositories(options.where);
    const { relations, skip = 0, take, order, ...rest } = options;
    if (
      relations &&
      (Array.isArray(relations)
        ? relations.some((name) => name !== 'user')
        : Object.keys(relations).some((name) => name !== 'user'))
    )
      throw new Error('Unsupported cross-database submission relation');
    if (repos.length === 1) {
      const rows = await repos[0].find({
        ...rest,
        skip,
        take,
        order: order ? { ...order, id: order.id || 'ASC' } : undefined,
      });
      await this.hydrateUsers(rows, relations);
      return rows;
    }
    // Global admin pages merge a bounded prefix from each shard, then paginate.
    if (
      !take ||
      take < 1 ||
      skip + take > 10000 ||
      Object.keys(order || {}).some((key) => !['createdAt', 'id'].includes(key))
    ) {
      throw new Error(
        'Cross-shard submission reads require bounded pagination ordered by createdAt',
      );
    }
    const createdAtDirection = direction(order?.createdAt, 'DESC');
    const idDirection = direction(order?.id, 'ASC');
    const results = await Promise.all(
      repos.map((repo) =>
        repo.find({
          ...rest,
          take: skip + take,
          order: {
            createdAt: createdAtDirection,
            id: idDirection,
          },
        }),
      ),
    );
    const descending = createdAtDirection === 'DESC';
    const idDescending = idDirection === 'DESC';
    const rows = results
      .flat()
      .sort((a, b) => {
        const time =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return (
          (descending ? -time : time) ||
          (idDescending ? -a.id.localeCompare(b.id) : a.id.localeCompare(b.id))
        );
      })
      .slice(skip, skip + take);
    await this.hydrateUsers(rows, relations);
    return rows;
  }

  async findOne(
    options: FindOneOptions<Submission>,
  ): Promise<Submission | null> {
    if (!this.isSharded) return this.primary.findOne(options);
    const { relations, ...rest } = options;
    const results = await Promise.all(
      this.repositories(options.where).map((repo) => repo.findOne(rest)),
    );
    const rows = results.filter((row): row is Submission => row !== null);
    if (rows.length > 1)
      throw new Error('Ambiguous submission identifier across shards');
    await this.hydrateUsers(rows, relations);
    return rows[0] ?? null;
  }

  async count(options: FindManyOptions<Submission> = {}): Promise<number> {
    if (!this.isSharded) return this.primary.count(options);
    const totals = await Promise.all(
      this.repositories(options.where).map((repo) =>
        repo.count({ ...options, relations: undefined }),
      ),
    );
    return totals.reduce((sum, total) => sum + total, 0);
  }

  async findAndCount(
    options: FindManyOptions<Submission>,
  ): Promise<[Submission[], number]> {
    if (!this.isSharded) return this.primary.findAndCount(options);
    return Promise.all([this.find(options), this.count(options)]);
  }

  async contestSolvedProblems(
    problemIds: string[],
    windows: ContestSubmissionWindow[],
  ): Promise<ContestSolvedProblem[]> {
    if (!this.isSharded)
      throw new Error('Sharded contest aggregation requires active shards');
    const groups = new Map<Repository<Submission>, ContestSubmissionWindow[]>();
    for (const window of windows) {
      const repo = this.registry
        .forUser(window.userId)
        .getRepository(Submission);
      groups.set(repo, [...(groups.get(repo) || []), window]);
    }
    const results = await Promise.all(
      [...groups].map(([repo, scopedWindows]) =>
        repo.query<ContestSolvedProblem[]>(
          `SELECT s."userId" AS "userId", s."problemId" AS "problemId", min(s."createdAt") AS "solvedAt"
       FROM public.submissions s
       JOIN jsonb_to_recordset($2::jsonb) AS w("userId" uuid, start timestamp, "end" timestamp)
         ON s."userId" = w."userId"
       WHERE s."problemId" = ANY($1::uuid[]) AND lower(s.status) = 'accepted'
         AND s."createdAt" >= w.start AND s."createdAt" <= w."end"
       GROUP BY s."userId", s."problemId"`,
          [
            problemIds,
            JSON.stringify(
              scopedWindows.map((window) => ({
                ...window,
                start: this.databaseTimestamp(window.start),
                end: this.databaseTimestamp(window.end),
              })),
            ),
          ],
        ),
      ),
    );
    return results.flat();
  }

  private databaseTimestamp(value: Date | string): string {
    if (typeof value === 'string') return value;
    // Match pg's Date parameters for the platform's timestamp-without-time-zone columns.
    const pad = (part: number, length = 2) =>
      String(part).padStart(length, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${pad(value.getMilliseconds(), 3)}`;
  }
}
