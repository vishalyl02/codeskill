import { BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { RedisService } from '../../redis/redis.service';
import {
  JudgeCapacityError,
  PistonUnavailableError,
} from '../piston/piston.types';

export interface ProviderPoolConfig {
  name: string;
  urls: string[];
  concurrency: number;
  globalConcurrency: number;
  nodeConcurrency: number;
  leaseMs: number;
  failureThreshold: number;
  cooldownMs: number;
}

export const ACQUIRE_PROVIDER_LEASE = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[1]) then return 0 end
local chosen = 0
local lowest = tonumber(ARGV[2])
for i = 2, #KEYS do
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now)
  local count = redis.call('ZCARD', KEYS[i])
  if count < lowest then chosen = i; lowest = count end
end
if chosen == 0 then return 0 end
local expiry = now + tonumber(ARGV[3])
redis.call('ZADD', KEYS[1], expiry, ARGV[4])
redis.call('ZADD', KEYS[chosen], expiry, ARGV[4])
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[3]) * 2)
redis.call('PEXPIRE', KEYS[chosen], tonumber(ARGV[3]) * 2)
return chosen - 1`;

interface NodeState {
  url: string;
  failures: number;
  openedAt: number;
  probing: boolean;
  active: number;
}

/** Leases are unique tokens: an expired request cannot release another request's slot. */
export class ProviderPool {
  private readonly nodes: NodeState[];
  private active = 0;
  private sequence = 0;
  private closing = false;
  private readonly totals = { requests: 0, failures: 0, rejected: 0 };
  constructor(
    readonly config: ProviderPoolConfig,
    private readonly redis?: RedisService,
  ) {
    this.nodes = config.urls.map((url) => ({
      url,
      failures: 0,
      openedAt: 0,
      probing: false,
      active: 0,
    }));
  }
  close() {
    this.closing = true;
  }
  private eligible(): NodeState[] {
    return this.nodes.filter(
      (node) =>
        !node.probing &&
        (!node.openedAt ||
          Date.now() - node.openedAt >= this.config.cooldownMs),
    );
  }
  private failure(node: NodeState) {
    node.failures++;
    if (node.probing || node.failures >= this.config.failureThreshold)
      node.openedAt = Date.now();
    node.probing = false;
  }
  private success(node: NodeState) {
    node.failures = 0;
    node.openedAt = 0;
    node.probing = false;
  }
  private nodeKey(node: NodeState): string {
    return `judge:{${this.config.name}}:node:${createHash('sha256').update(node.url).digest('hex').slice(0, 24)}`;
  }
  metrics() {
    return {
      ...this.totals,
      active: this.active,
      circuitOpen: this.nodes.every((node) => !!node.openedAt),
      nodes: this.nodes.map((node, index) => ({
        index,
        active: node.active,
        failures: node.failures,
        circuitState: node.probing
          ? 'half-open'
          : node.openedAt
            ? 'open'
            : 'closed',
      })),
    };
  }
  async inspect<T>(request: (url: string) => Promise<T>): Promise<T> {
    if (this.closing) throw new PistonUnavailableError();
    for (const node of this.eligible()) {
      if (node.openedAt) node.probing = true;
      try {
        const result = await request(node.url);
        // Metadata availability does not prove the execution sandbox recovered.
        node.probing = false;
        return result;
      } catch {
        this.failure(node);
      }
    }
    throw new PistonUnavailableError();
  }
  async execute<T>(request: (url: string) => Promise<T>): Promise<T> {
    const candidates = this.eligible();
    if (this.closing || !candidates.length) {
      this.totals.rejected++;
      throw new PistonUnavailableError();
    }
    if (this.active >= this.config.concurrency) {
      this.totals.rejected++;
      throw new JudgeCapacityError();
    }
    // Rotate equal-load candidates so separate executions can use every replica.
    const offset = this.sequence++ % candidates.length;
    const ordered = [
      ...candidates.slice(offset),
      ...candidates.slice(0, offset),
    ];
    const client = this.redis?.getClient();
    if (!client) throw new PistonUnavailableError();
    this.active++;
    const lease = randomUUID();
    const globalKey = `judge:{${this.config.name}}:active`;
    let selected: number;
    try {
      selected = Number(
        await client.eval(
          ACQUIRE_PROVIDER_LEASE,
          ordered.length + 1,
          globalKey,
          ...ordered.map((node) => this.nodeKey(node)),
          this.config.globalConcurrency,
          this.config.nodeConcurrency,
          this.config.leaseMs,
          lease,
        ),
      );
    } catch {
      this.active--;
      throw new PistonUnavailableError();
    }
    if (
      !Number.isInteger(selected) ||
      selected < 1 ||
      selected > ordered.length
    ) {
      this.totals.rejected++;
      this.active--;
      throw selected === 0
        ? new JudgeCapacityError()
        : new PistonUnavailableError();
    }
    const node = ordered[selected - 1];
    const nodeKey = this.nodeKey(node);
    if (node.probing) {
      this.active--;
      try {
        await client.eval(
          "redis.call('ZREM', KEYS[1], ARGV[1]); redis.call('ZREM', KEYS[2], ARGV[1]); return 1",
          2,
          globalKey,
          nodeKey,
          lease,
        );
      } catch {
        /* Expiring lease. */
      }
      throw new PistonUnavailableError();
    }
    if (node.openedAt) node.probing = true;
    node.active++;
    this.totals.requests++;
    try {
      const result = await request(node.url);
      this.success(node);
      return result;
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        this.failure(node);
        this.totals.failures++;
      }
      throw error instanceof BadRequestException
        ? error
        : new PistonUnavailableError();
    } finally {
      this.active--;
      node.active--;
      node.probing = false;
      try {
        await client.eval(
          "redis.call('ZREM', KEYS[1], ARGV[1]); redis.call('ZREM', KEYS[2], ARGV[1]); return 1",
          2,
          globalKey,
          nodeKey,
          lease,
        );
      } catch {
        /* The bounded lease expires if a worker or Redis fails. */
      }
    }
  }
}
