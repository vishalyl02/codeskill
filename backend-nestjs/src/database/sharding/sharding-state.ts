import type { DataSource } from 'typeorm';
import type { SubmissionShardingConfig } from './sharding.config';

export interface ShardIdentity {
  shard_id: string;
  fingerprint: string;
}

export interface ShardingState {
  fingerprint: string;
  state: string;
}

export async function readShardingState(
  primary: Pick<DataSource, 'query'>,
): Promise<ShardingState | null> {
  const [table] = (await primary.query(
    "SELECT to_regclass('public.submission_sharding_state') IS NOT NULL AS present",
  )) as Array<{ present: boolean }>;
  if (!table?.present) return null;
  const rows = (await primary.query(
    'SELECT fingerprint, state FROM public.submission_sharding_state WHERE singleton = true',
  )) as ShardingState[];
  return rows[0] ?? null;
}

export function validateShardingState(
  config: SubmissionShardingConfig | null,
  state: ShardingState | null,
): void {
  if (!config && state)
    throw new Error(
      'Submission sharding is active; all API and judge processes must configure SUBMISSION_SHARDS',
    );
  if (
    config &&
    (!state ||
      state.state !== 'active' ||
      state.fingerprint !== config.fingerprint)
  ) {
    throw new Error(
      'Submission shard topology does not match the completed migration; run db:shards:migrate during maintenance',
    );
  }
}
