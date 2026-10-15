import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Submission } from '../entities/submission.entity';
import { User } from '../entities/user.entity';
import { Problem } from '../entities/problem.entity';
import {
  readShardingState,
  validateShardingState,
  ShardIdentity,
} from './sharding-state';
import {
  parseSubmissionShardingConfig,
  shardForUser,
  SubmissionShardConfig,
} from './sharding.config';

export function shardDataSource(
  shard: SubmissionShardConfig,
  poolSize: number,
): DataSource {
  return new DataSource({
    type: 'postgres',
    url: shard.url,
    ssl: shard.ssl ? { rejectUnauthorized: true } : false,
    entities: [Submission, User, Problem],
    synchronize: false,
    logging: false,
    extra: {
      max: poolSize,
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000,
      application_name: 'codeskill-submission-shard',
    },
    invalidWhereValuesBehavior: { null: 'throw', undefined: 'throw' },
  });
}

@Injectable()
export class SubmissionShardRegistry implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubmissionShardRegistry.name);
  readonly config = parseSubmissionShardingConfig();
  private readonly sources = new Map<string, DataSource>();
  constructor(@InjectDataSource() private readonly primary: DataSource) {}

  get enabled(): boolean {
    return this.config !== null;
  }
  get all(): DataSource[] {
    if (this.config && this.sources.size !== this.config.shards.length)
      throw new Error('Submission shards are not initialized');
    return [...this.sources.values()];
  }
  forUser(userId: string): DataSource {
    if (!this.config) return this.primary;
    const source = this.sources.get(shardForUser(this.config, userId));
    if (!source) throw new Error('Submission shard is not initialized');
    return source;
  }

  async onModuleInit(): Promise<void> {
    validateShardingState(this.config, await readShardingState(this.primary));
    if (!this.config) return;
    try {
      for (const shard of this.config.shards) {
        const source = shardDataSource(shard, this.config.poolSize);
        this.sources.set(shard.id, source);
        await source.initialize();
        const [identity] = await source.query<ShardIdentity[]>(
          'SELECT shard_id, fingerprint FROM public.submission_shard_identity WHERE singleton = true',
        );
        if (
          identity?.shard_id !== shard.id ||
          identity?.fingerprint !== this.config.fingerprint
        )
          throw new Error('Submission shard identity mismatch');
      }
    } catch {
      await this.onModuleDestroy();
      // Driver messages can contain connection credentials. Never log them.
      throw new Error(
        'Cannot initialize submission shards: check connectivity and migration state',
      );
    }
    this.logger.log(
      `Submission sharding active across ${this.sources.size} databases (128 routing buckets)`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [...this.sources.values()]
        .filter((source) => source.isInitialized)
        .map((source) => source.destroy()),
    );
    this.sources.clear();
  }
}
