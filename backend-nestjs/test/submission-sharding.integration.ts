import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Submission } from '../src/database/entities/submission.entity';
import { User } from '../src/database/entities/user.entity';
import { Problem } from '../src/database/entities/problem.entity';
import { SubmissionShardRegistry } from '../src/database/sharding/shard-registry';
import { SubmissionStore } from '../src/database/sharding/submission-store';
import { migrateSubmissionShards } from '../src/database/sharding/migrate-submission-shards';
import {
  parseSubmissionShardingConfig,
  shardForUser,
} from '../src/database/sharding/sharding.config';
import { SubmissionsService } from '../src/submissions/submissions.service';
import { JudgeProcessor } from '../src/execution/judge.processor';
import { Status } from '../src/execution/execution.types';

async function main() {
  const original = parseSubmissionShardingConfig();
  assert(original, 'Configure two local shard servers first');
  assert(process.env.DATABASE_URL, 'Configure a local primary DATABASE_URL');
  const urls = [
    process.env.DATABASE_URL,
    ...original.shards.map((shard) => shard.url),
  ];
  for (const address of urls)
    assert(
      ['localhost', '127.0.0.1', '[::1]'].includes(new URL(address).hostname),
      'Integration tests are restricted to local servers',
    );
  const name = 'codeskill_shard_test_' + randomUUID().replace(/-/g, '');
  const admin: DataSource[] = [];
  let primary: DataSource | undefined;
  let registry: SubmissionShardRegistry | undefined;
  try {
    for (const url of urls) {
      const connection = new DataSource({
        type: 'postgres',
        url,
        ssl: false,
        synchronize: false,
        logging: false,
      });
      admin.push(connection);
      await connection.initialize();
      await connection.query(`CREATE DATABASE "${name}"`);
    }
    const scratch = urls.map((address) => {
      const url = new URL(address);
      url.pathname = '/' + name;
      return url.toString();
    });
    process.env.SUBMISSION_SHARDS = JSON.stringify(
      original.shards.map((shard, index) => ({
        ...shard,
        url: scratch[index + 1],
      })),
    );
    const config = parseSubmissionShardingConfig()!;
    // Schema synchronization is restricted to the freshly created disposable database.
    primary = new DataSource({
      type: 'postgres',
      url: scratch[0],
      ssl: false,
      entities: [Submission, User, Problem],
      synchronize: true,
      logging: false,
    });
    await primary.initialize();
    const users = primary.getRepository(User);
    const originals = primary.getRepository(Submission);
    const chosen: string[] = [];
    for (const shard of config.shards) {
      let id: string;
      do {
        id = randomUUID();
      } while (shardForUser(config, id) !== shard.id);
      chosen.push(id);
      await users.save(
        users.create({ id, name: shard.id, email: `${shard.id}@test.invalid` }),
      );
    }
    const problemId = randomUUID();
    const timestamp = new Date('2026-10-13T04:00:00.000Z');
    for (const [index, userId] of chosen.entries()) {
      await originals.save(
        originals.create({
          userId,
          problemId,
          problemSource: index ? 'question' : 'metadata',
          code: `print('quoted \\" Unicode 🐾')`,
          language: 'python',
          status: 'accepted',
          createdAt: timestamp,
          testResults: [{ testId: '1', passed: true }],
        }),
      );
    }
    const before = await originals.find({ order: { id: 'ASC' } });
    await assert.rejects(
      () => migrateSubmissionShards(primary!, config, false),
      /Stop and drain/,
    );
    await originals.update(before[0].id, { status: 'queued' });
    await assert.rejects(
      () => migrateSubmissionShards(primary!, config, true),
      /in-flight/,
    );
    await originals.update(before[0].id, { status: 'accepted' });
    const migrated = await migrateSubmissionShards(primary, config, true);
    assert.equal(migrated.copied, 2);
    assert.deepEqual(
      migrated.shards.map((shard) => shard.rows),
      [1, 1],
    );
    assert.equal(
      (await migrateSubmissionShards(primary, config, true)).alreadyActive,
      true,
    );
    await assert.rejects(
      () =>
        migrateSubmissionShards(
          primary!,
          { ...config, fingerprint: 'changed-topology' },
          true,
        ),
      /topology differs/,
    );
    registry = new SubmissionShardRegistry(primary);
    await registry.onModuleInit();
    const store = new SubmissionStore(originals, users, registry);
    for (const row of before) {
      const restored = await store.findOne({
        where: { id: row.id, userId: row.userId },
      });
      assert.equal(restored?.code, row.code);
      assert.equal(restored?.problemSource, row.problemSource);
      assert.deepEqual(restored?.testResults, row.testResults);
    }
    const queue = {
      add: (_type: string, payload: unknown) => {
        queued = payload;
        return Promise.resolve();
      },
    };
    let queued: unknown;
    const gateway = { emitToUser: () => undefined };
    const redis = { getClient: () => null };
    const problems = {
      getExecutionProblem: () =>
        Promise.resolve({
          id: problemId,
          source: 'metadata',
          testCases: [{ input: '2 3', output: '5', isHidden: true }],
          config: {
            timeLimit: 2000,
            memoryLimit: 128,
            supportedLanguages: ['python'],
          },
        }),
    };
    const admission = { reserve: () => Promise.resolve(randomUUID()), release: () => Promise.resolve(), claim: () => Promise.resolve('claimed'), renew: () => Promise.resolve(), unclaim: () => Promise.resolve(), heartbeatMs: 15000 };
    const service = new SubmissionsService(
      store,
      users,
      queue as never,
      gateway as never,
      redis as never,
      problems as never,
      undefined,
      admission as never,
    );
    const submitted = await service.createSubmission(chosen[0], {
      code: 'print(5)',
      language: 'python',
      problemId,
    });
    const judge = new JudgeProcessor(
      {
        executeCode: () =>
          Promise.resolve([
            { id: 1, passed: true, status: Status.ACCEPTED, executionTime: 1 },
          ]),
      } as never,
      store,
      problems as never,
      users,
      gateway as never,
      redis as never,
      admission as never,
    );
    await judge.process({
      name: 'evaluate-code',
      id: submitted.id,
      data: queued,
    } as never);
    assert.equal(
      (await service.getSubmissionResult(chosen[0], submitted.id)).status,
      'accepted',
    );
    assert.equal(
      (await service.getSubmissionsByUser(chosen[0], { limit: 1 })).total,
      2,
    );
    assert.equal(await store.count(), 3);
    const global = await store.find({
      take: 3,
      order: { createdAt: 'DESC' },
      relations: { user: true },
    });
    assert.equal(global.length, 3);
    assert(global.every((row) => row.user?.email && !row.user.password));
    assert.equal(
      await originals.count(),
      2,
      'Primary keeps the original snapshot, not new writes',
    );
    await assert.rejects(
      () =>
        originals.save(
          originals.create({
            userId: chosen[0],
            problemId,
            code: 'blocked',
            language: 'python',
          }),
        ),
      /Submission sharding is active/,
    );
    const [page, total] = await store.findAndCount({
      take: 1,
      skip: 1,
      order: { createdAt: 'DESC' },
    });
    assert.equal(page.length, 1);
    assert.equal(total, 3);
    const solved = await store.contestSolvedProblems(
      [problemId],
      chosen.map((userId) => ({
        userId,
        start: new Date('2020-01-01'),
        end: new Date('2040-01-01'),
      })),
    );
    assert.equal(solved.length, 2);
    const misplaced = registry.forUser(chosen[0]).getRepository(Submission);
    await assert.rejects(
      () =>
        misplaced.save(
          misplaced.create({
            userId: chosen[1],
            problemId,
            code: 'wrong shard',
            language: 'python',
          }),
        ),
      /codeskill_submission_shard_owner/,
    );
    console.log(
      'PASS: two real PostgreSQL shards; verified migration, retry, student submission, judge update, history, admin pagination, contest aggregates, ownership checks, and primary write guard.',
    );
  } finally {
    await registry?.onModuleDestroy();
    if (primary?.isInitialized) await primary.destroy();
    for (const connection of admin) {
      if (connection.isInitialized) {
        // Only databases created above, under a random test-only name, are removed.
        await connection.query(
          `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
        );
        await connection.destroy();
      }
    }
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.constructor === Error
      ? error.message
      : 'Local shard integration test failed.',
  );
  process.exitCode = 1;
});
