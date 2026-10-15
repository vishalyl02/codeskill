import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import Redis from 'ioredis';
import { ExecutionAdmissionService } from '../src/execution/admission/execution-admission.service';
import { ProviderPool } from '../src/execution/providers/provider-pool';

async function main() {
  const url = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  assert(
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname),
    'This integration test is restricted to local Redis',
  );
  const redis = new Redis(url.toString(), { lazyConnect: true });
  await redis.connect();
  const namespace = 'execution_test_' + randomUUID().replace(/-/g, '');
  const wrapper = { getClient: () => redis };
  process.env.SUBMISSION_RATE_LIMIT_PER_MINUTE = '3';
  process.env.MAX_CONCURRENT_JOBS_PER_USER = '1';
  process.env.MAX_QUEUE_WAITING = '2';
  const admission = new ExecutionAdmissionService(wrapper as never, namespace);
  try {
    const attempts = await Promise.allSettled(
      Array.from({ length: 30 }, (_, index) =>
        admission.reserve('student', { code: String(index) }),
      ),
    );
    const accepted = attempts.filter(
      (value): value is PromiseFulfilledResult<string> =>
        value.status === 'fulfilled',
    );
    assert.equal(
      accepted.length,
      1,
      'Parallel HTTP requests must not bypass per-student concurrency',
    );
    await admission.release('student', accepted[0].value);
    const next = await admission.reserve('student', { code: 'same' });
    await assert.rejects(
      () => admission.reserve('student', { code: 'same' }),
      /identical/,
    );
    assert.equal(await admission.claim('student', next, 'worker-1'), 'claimed');
    assert.equal(await admission.claim('student', next, 'worker-2'), 'busy');
    await admission.release('student', next, 'wrong-worker');
    await assert.rejects(
      () => admission.reserve('student', { code: 'other' }),
      /queued or running/,
    );
    await admission.unclaim('student', next, 'worker-1');
    assert.equal(await admission.claim('student', next, 'worker-2'), 'claimed');
    await admission.renew('student', next, 'worker-2');
    await admission.release('student', next, 'worker-2');
    const third = await admission.reserve('student', { code: 'third' });
    await admission.release('student', third);
    await assert.rejects(
      () => admission.reserve('student', { code: 'fourth' }),
      /per minute/,
    );
    const a = await admission.reserve('student-a', { code: 'a' });
    const b = await admission.reserve('student-b', { code: 'b' });
    await assert.rejects(
      () => admission.reserve('student-c', { code: 'c' }),
      /queue is at capacity/,
    );
    await admission.release('student-a', a);
    await admission.release('student-b', b);
    const config = {
      name: namespace,
      urls: ['http://node-a', 'http://node-b'],
      concurrency: 20,
      globalConcurrency: 2,
      nodeConcurrency: 1,
      leaseMs: 100,
      failureThreshold: 1,
      cooldownMs: 20,
    };
    const poolA = new ProviderPool(config, wrapper as never),
      poolB = new ProviderPool(config, wrapper as never);
    let finishA!: () => void, finishB!: () => void;
    const first = poolA.execute(
      () =>
        new Promise<void>((resolve) => {
          finishA = resolve;
        }),
    );
    const second = poolB.execute(
      () =>
        new Promise<void>((resolve) => {
          finishB = resolve;
        }),
    );
    await delay(20);
    await assert.rejects(
      () => poolA.execute(() => Promise.resolve('overflow')),
      /temporarily unavailable/,
    );
    finishA();
    await first;
    finishB();
    await second;
    const singleConfig = {
      ...config,
      name: namespace + '_ttl',
      urls: ['http://node-a'],
      globalConcurrency: 1,
    };
    const oldPool = new ProviderPool(singleConfig, wrapper as never),
      newPool = new ProviderPool(singleConfig, wrapper as never);
    let finishOld!: () => void, finishNew!: () => void;
    const old = oldPool.execute(
      () =>
        new Promise<void>((resolve) => {
          finishOld = resolve;
        }),
    );
    await delay(150);
    const current = newPool.execute(
      () =>
        new Promise<void>((resolve) => {
          finishNew = resolve;
        }),
    );
    await delay(10);
    finishOld();
    await old;
    await assert.rejects(
      () => oldPool.execute(() => Promise.resolve('must stay full')),
      /temporarily unavailable/,
    );
    finishNew();
    await current;
    console.log(
      'PASS: real Redis atomic user limits, duplicate rejection, retry ownership, rate limits, queue capacity, cross-worker provider capacity, and safe late lease release.',
    );
  } finally {
    // Remove only this run's randomly namespaced test keys; never flush Redis.
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        `*${namespace}*`,
        'COUNT',
        100,
      );
      if (keys.length) await redis.del(...keys);
      cursor = next;
    } while (cursor !== '0');
    await redis.quit();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Judge resilience integration failed',
  );
  process.exitCode = 1;
});
