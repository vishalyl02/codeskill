import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { RedisService } from '../../redis/redis.service';
import { positiveInteger } from '../providers/provider.config';

const CLOCK =
  "local t = redis.call('TIME'); local now = tonumber(t[1])*1000 + math.floor(tonumber(t[2])/1000)\n";
const CLEAN = `
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', now)
for _, id in ipairs(expired) do
  local fp = redis.call('HGET', KEYS[3], 'j:' .. id)
  if fp and redis.call('HGET', KEYS[3], 'f:' .. fp) == id then redis.call('HDEL', KEYS[3], 'f:' .. fp) end
  redis.call('HDEL', KEYS[3], 'j:' .. id, 'owner:' .. id)
end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
`;

export const RESERVE_EXECUTION =
  CLOCK +
  CLEAN +
  `
redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', now - tonumber(ARGV[1]))
local existing = redis.call('HGET', KEYS[3], 'f:' .. ARGV[6])
if existing then return {4, existing} end
if redis.call('ZCARD', KEYS[4]) >= tonumber(ARGV[2]) then return {2, ''} end
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[3]) then return {3, ''} end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[4]) then return {5, ''} end
local expiry = now + tonumber(ARGV[5])
redis.call('ZADD', KEYS[1], expiry, ARGV[7])
redis.call('ZADD', KEYS[2], expiry, ARGV[7])
redis.call('HSET', KEYS[3], 'f:' .. ARGV[6], ARGV[7], 'j:' .. ARGV[7], ARGV[6])
redis.call('ZADD', KEYS[4], now, ARGV[7])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[5])*2)
redis.call('PEXPIRE', KEYS[2], tonumber(ARGV[5])*2)
redis.call('PEXPIRE', KEYS[3], tonumber(ARGV[5])*2)
redis.call('PEXPIRE', KEYS[4], tonumber(ARGV[1])*2)
return {1, ARGV[7]}`;

export const RELEASE_EXECUTION = `
local owner = redis.call('HGET', KEYS[3], 'owner:' .. ARGV[1])
if owner and owner ~= ARGV[2] then return 0 end
local fp = redis.call('HGET', KEYS[3], 'j:' .. ARGV[1])
if fp and redis.call('HGET', KEYS[3], 'f:' .. fp) == ARGV[1] then redis.call('HDEL', KEYS[3], 'f:' .. fp) end
redis.call('HDEL', KEYS[3], 'j:' .. ARGV[1], 'owner:' .. ARGV[1])
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1`;

const CLAIM_EXECUTION =
  CLOCK +
  CLEAN +
  `
if not redis.call('ZSCORE', KEYS[2], ARGV[1]) then return 0 end
local owner = redis.call('HGET', KEYS[3], 'owner:' .. ARGV[1])
if owner and owner ~= ARGV[2] then return 2 end
redis.call('HSET', KEYS[3], 'owner:' .. ARGV[1], ARGV[2])
local expiry = now + tonumber(ARGV[3])
redis.call('ZADD', KEYS[1], expiry, ARGV[1]); redis.call('ZADD', KEYS[2], expiry, ARGV[1])
for i = 1, 3 do redis.call('PEXPIRE', KEYS[i], tonumber(ARGV[3])*2) end
return 1`;

@Injectable()
export class ExecutionAdmissionService {
  private readonly namespace: string;
  readonly leaseMs = positiveInteger(
    'EXECUTION_JOB_LEASE_MS',
    900000,
    60000,
    86400000,
  );
  readonly heartbeatMs = positiveInteger(
    'EXECUTION_HEARTBEAT_MS',
    15000,
    1000,
    60000,
  );
  private readonly rate = positiveInteger(
    'SUBMISSION_RATE_LIMIT_PER_MINUTE',
    15,
    1,
    120,
  );
  private readonly concurrent = positiveInteger(
    'MAX_CONCURRENT_JOBS_PER_USER',
    1,
    1,
    10,
  );
  private readonly outstanding = positiveInteger(
    'MAX_QUEUE_WAITING',
    500,
    1,
    100000,
  );
  constructor(
    private readonly redis: RedisService,
    @Optional() @Inject('EXECUTION_ADMISSION_NAMESPACE') namespace?: string,
  ) {
    this.namespace = namespace || 'execution';
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(this.namespace))
      throw new Error('Invalid execution admission namespace');
    if (this.leaseMs < this.heartbeatMs * 4)
      throw new Error('Execution leases must span at least four heartbeats');
  }
  private keys(userId: string) {
    if (!userId)
      throw new ServiceUnavailableException(
        'Authenticated execution identity is required',
      );
    const user = createHash('sha256').update(userId).digest('hex');
    const prefix = `${this.namespace}:{admission}:user:${user}`;
    return [
      `${this.namespace}:{admission}:outstanding`,
      `${prefix}:active`,
      `${prefix}:fingerprints`,
      `${prefix}:rate`,
    ];
  }
  async assertReady(): Promise<void> {
    try {
      await this.redis.getClient().ping();
    } catch {
      throw new ServiceUnavailableException(
        'Execution admission control is temporarily unavailable',
      );
    }
  }
  async reserve(
    userId: string,
    payload: unknown,
    id = randomUUID(),
  ): Promise<string> {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    let result: unknown;
    try {
      result = await this.redis
        .getClient()
        .eval(
          RESERVE_EXECUTION,
          4,
          ...this.keys(userId),
          60000,
          this.rate,
          this.concurrent,
          this.outstanding,
          this.leaseMs,
          fingerprint,
          id,
        );
    } catch {
      throw new ServiceUnavailableException(
        'Execution admission control is temporarily unavailable',
      );
    }
    if (!Array.isArray(result))
      throw new ServiceUnavailableException('Execution reservation failed');
    const code = Number(result[0]);
    if (code === 1) return id;
    if (code === 4)
      throw new ConflictException(
        'An identical execution is already queued or running',
      );
    if (code === 5)
      throw new ServiceUnavailableException(
        'The execution queue is at capacity; retry shortly',
      );
    if (code === 2 || code === 3)
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            code === 2
              ? `Limit of ${this.rate} code executions per minute reached`
              : `Only ${this.concurrent} queued or running execution(s) per student are allowed`,
          retryAfterSeconds: 60,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    throw new ServiceUnavailableException('Execution reservation failed');
  }
  async claim(
    userId: string,
    id: string,
    owner: string,
  ): Promise<'claimed' | 'expired' | 'busy'> {
    try {
      const result = Number(
        await this.redis
          .getClient()
          .eval(
            CLAIM_EXECUTION,
            3,
            ...this.keys(userId).slice(0, 3),
            id,
            owner,
            this.leaseMs,
          ),
      );
      return result === 1 ? 'claimed' : result === 2 ? 'busy' : 'expired';
    } catch {
      throw new ServiceUnavailableException(
        'Execution admission control is temporarily unavailable',
      );
    }
  }
  async renew(userId: string, id: string, owner: string): Promise<void> {
    if ((await this.claim(userId, id, owner)) !== 'claimed')
      throw new ServiceUnavailableException('Execution reservation expired');
  }
  async unclaim(userId: string, id: string, owner: string): Promise<void> {
    try {
      await this.redis
        .getClient()
        .eval(
          "if redis.call('HGET', KEYS[1], 'owner:' .. ARGV[1]) == ARGV[2] then redis.call('HDEL', KEYS[1], 'owner:' .. ARGV[1]) end; return 1",
          1,
          this.keys(userId)[2],
          id,
          owner,
        );
    } catch {
      /* Expiring reservation. */
    }
  }
  async release(userId: string, id: string, owner = ''): Promise<void> {
    try {
      await this.redis
        .getClient()
        .eval(
          RELEASE_EXECUTION,
          3,
          ...this.keys(userId).slice(0, 3),
          id,
          owner,
        );
    } catch {
      /* Expiring reservation. */
    }
  }
}
