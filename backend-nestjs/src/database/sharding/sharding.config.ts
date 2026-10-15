import { createHash } from 'node:crypto';

export const SHARD_BUCKET_COUNT = 128;
export const SHARD_PROTOCOL = 'submissions-user-md5-v1';

export interface SubmissionShardConfig {
  id: string;
  url: string;
  ssl: boolean;
}

export interface SubmissionShardTopology {
  protocol: string;
  buckets: string[];
  endpoints: Array<{
    id: string;
    host: string;
    port: string;
    database: string;
  }>;
}

export interface SubmissionShardingConfig {
  shards: SubmissionShardConfig[];
  topology: SubmissionShardTopology;
  fingerprint: string;
  poolSize: number;
}

export function userBucket(userId: string): number {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      userId,
    )
  ) {
    throw new Error('Submission routing requires a UUID user ID');
  }
  return (
    createHash('md5').update(userId.toLowerCase()).digest().readUInt32BE(0) %
    SHARD_BUCKET_COUNT
  );
}

export function parseSubmissionShardingConfig(
  env: NodeJS.ProcessEnv = process.env,
): SubmissionShardingConfig | null {
  if (!env.SUBMISSION_SHARDS?.trim()) return null;
  let input: unknown;
  let configuredBuckets: unknown;
  try {
    input = JSON.parse(env.SUBMISSION_SHARDS);
    if (env.SUBMISSION_SHARD_MAP)
      configuredBuckets = JSON.parse(env.SUBMISSION_SHARD_MAP);
  } catch {
    throw new Error('Submission shard configuration must be valid JSON');
  }
  if (!Array.isArray(input) || input.length < 2 || input.length > 16) {
    throw new Error('Configure between 2 and 16 submission shards');
  }
  const shards: SubmissionShardConfig[] = input
    .map((entry: unknown) => {
      if (!entry || typeof entry !== 'object')
        throw new Error('Invalid submission shard entry');
      const value = entry as Record<string, unknown>;
      if (
        typeof value.id !== 'string' ||
        !/^[a-z][a-z0-9_-]{0,31}$/.test(value.id) ||
        typeof value.url !== 'string'
      ) {
        throw new Error(
          'Each submission shard needs a stable ID and PostgreSQL URL',
        );
      }
      let url: URL;
      try {
        url = new URL(value.url);
      } catch {
        throw new Error('Invalid submission shard PostgreSQL URL');
      }
      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !url.hostname ||
        url.pathname.length < 2
      ) {
        throw new Error('Invalid submission shard PostgreSQL URL');
      }
      if (value.ssl !== undefined && typeof value.ssl !== 'boolean')
        throw new Error('Shard ssl must be a boolean');
      // Local examples opt out explicitly. Remote connections verify TLS certificates.
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (!local && value.ssl === false)
        throw new Error('Remote submission shards require verified TLS');
      if (url.searchParams.has('sslmode') || url.searchParams.has('ssl')) {
        throw new Error('Configure shard TLS using ssl, not URL parameters');
      }
      return { id: value.id, url: value.url, ssl: value.ssl ?? !local };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const endpoints = shards.map((shard) => {
    const url = new URL(shard.url);
    return {
      id: shard.id,
      host: url.hostname.toLowerCase(),
      port: url.port || '5432',
      database: decodeURIComponent(url.pathname.slice(1)),
    };
  });
  if (
    new Set(shards.map((s) => s.id)).size !== shards.length ||
    new Set(
      endpoints.map(
        ({ host, port, database }) => `${host}:${port}/${database}`,
      ),
    ).size !== shards.length
  ) {
    throw new Error(
      'Submission shard IDs and database endpoints must be distinct',
    );
  }
  const buckets =
    configuredBuckets ??
    Array.from(
      { length: SHARD_BUCKET_COUNT },
      (_, bucket) => shards[bucket % shards.length].id,
    );
  if (
    !Array.isArray(buckets) ||
    buckets.length !== SHARD_BUCKET_COUNT ||
    buckets.some(
      (id: unknown) =>
        typeof id !== 'string' || !shards.some((s) => s.id === id),
    )
  ) {
    throw new Error(
      'SUBMISSION_SHARD_MAP must assign all 128 buckets to configured shard IDs',
    );
  }
  if (shards.some((s) => !buckets.includes(s.id)))
    throw new Error('Every submission shard must own at least one bucket');
  const poolSize = Number(env.SUBMISSION_SHARD_POOL_SIZE || 5);
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 20)
    throw new Error('Submission shard pool size must be between 1 and 20');
  const topology: SubmissionShardTopology = {
    protocol: SHARD_PROTOCOL,
    buckets: buckets as string[],
    endpoints,
  };
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(topology))
    .digest('hex');
  return { shards, topology, fingerprint, poolSize };
}

export function shardForUser(
  config: SubmissionShardingConfig,
  userId: string,
): string {
  return config.topology.buckets[userBucket(userId)];
}

export function assertShardsAreSeparate(
  config: SubmissionShardingConfig,
  primaryUrl: string,
): void {
  const primary = new URL(primaryUrl);
  if (
    config.topology.endpoints.some(
      (e) =>
        e.host === primary.hostname.toLowerCase() &&
        e.port === (primary.port || '5432') &&
        e.database === decodeURIComponent(primary.pathname.slice(1)),
    )
  ) {
    throw new Error('The primary database cannot also be a submission shard');
  }
}
