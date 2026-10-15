import {
  parseSubmissionShardingConfig,
  shardForUser,
  userBucket,
  assertShardsAreSeparate,
} from './sharding.config';
import { validateShardingState } from './sharding-state';

const shards = [
  {
    id: 'a',
    url: 'postgres://postgres:test@127.0.0.1:5433/submissions',
    ssl: false,
  },
  {
    id: 'b',
    url: 'postgres://postgres:test@127.0.0.1:5434/submissions',
    ssl: false,
  },
];
const environment = () => ({ SUBMISSION_SHARDS: JSON.stringify(shards) });

it('uses stable UUID routing and a fixed map independent of configuration order', () => {
  const config = parseSubmissionShardingConfig(environment())!;
  const reversed = parseSubmissionShardingConfig({
    SUBMISSION_SHARDS: JSON.stringify([...shards].reverse()),
  })!;
  expect(config.fingerprint).toBe(reversed.fingerprint);
  const user = '38a6c905-b5c2-484e-9acd-27025233ff85';
  expect(userBucket(user)).toBe(userBucket(user.toUpperCase()));
  expect(shardForUser(config, user)).toBe(shardForUser(reversed, user));
  expect(config.topology.buckets).toHaveLength(128);
  expect(() => userBucket('legacy-id')).toThrow('UUID');
});

it('allows credential rotation without changing shard placement', () => {
  const rotated = shards.map((s) => ({
    ...s,
    url: s.url.replace('test@', 'rotated@'),
  }));
  expect(
    parseSubmissionShardingConfig({
      SUBMISSION_SHARDS: JSON.stringify(rotated),
    })!.fingerprint,
  ).toBe(parseSubmissionShardingConfig(environment())!.fingerprint);
});

it('rejects duplicate IDs, endpoints, invalid maps, insecure remote URLs, and the primary as a shard', () => {
  for (const values of [
    [shards[0], shards[0]],
    [shards[0], { ...shards[1], id: 'a' }],
    [
      { ...shards[0], url: 'postgres://p:p@remote.example/db', ssl: false },
      shards[1],
    ],
  ]) {
    expect(() =>
      parseSubmissionShardingConfig({
        SUBMISSION_SHARDS: JSON.stringify(values),
      }),
    ).toThrow();
  }
  expect(() =>
    parseSubmissionShardingConfig({
      ...environment(),
      SUBMISSION_SHARD_MAP: JSON.stringify(['a']),
    }),
  ).toThrow('128');
  expect(() =>
    assertShardsAreSeparate(
      parseSubmissionShardingConfig(environment())!,
      shards[0].url,
    ),
  ).toThrow('primary');
  expect(parseSubmissionShardingConfig({})).toBeNull();
});

it('refuses accidental disablement, incomplete migration, or changed topology after activation', () => {
  const config = parseSubmissionShardingConfig(environment())!;
  const active = { state: 'active', fingerprint: config.fingerprint };
  expect(() => validateShardingState(null, active)).toThrow(
    'all API and judge',
  );
  expect(() => validateShardingState(config, null)).toThrow('migration');
  expect(() =>
    validateShardingState(config, { ...active, fingerprint: 'different' }),
  ).toThrow('topology');
  expect(() => validateShardingState(config, active)).not.toThrow();
  expect(() => validateShardingState(null, null)).not.toThrow();
});
