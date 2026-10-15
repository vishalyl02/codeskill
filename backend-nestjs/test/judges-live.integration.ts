import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { Judge0Service } from '../src/execution/judge0/judge0.service';
import { PistonService } from '../src/execution/piston/piston.service';
import { ExecutionService, Status } from '../src/execution/execution.service';

async function main() {
  for (const value of [
    process.env.JUDGE0_BASE_URL || 'http://127.0.0.1:2358',
    process.env.PISTON_BASE_URL || 'http://127.0.0.1:2001/api/v2',
    process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  ])
    assert(
      ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname),
      'Live test restricted to dedicated local judges',
    );
  assert(
    !process.env.JUDGE0_BASE_URLS && !process.env.PISTON_BASE_URLS,
    'Use single local endpoints for live smoke testing',
  );
  const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    lazyConnect: true,
  });
  await redis.connect();
  const wrapper = { getClient: () => redis };
  const primary = new Judge0Service(wrapper as never),
    fallback = new PistonService(wrapper as never);
  const original = {
    provider: process.env.CODE_EXECUTION_PROVIDER,
    url: process.env.JUDGE0_BASE_URL,
  };
  const samples: Record<string, string> = {
    c: '#include <stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);}',
    cpp: '#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}',
    java: 'import java.util.*; public class Main { public static void main(String[] args){Scanner s=new Scanner(System.in);System.out.println(s.nextInt()+s.nextInt());}}',
    python: 'a,b=map(int,input().split());print(a+b)',
    javascript:
      'const [a,b]=require("fs").readFileSync(0,"utf8").trim().split(/\\s+/).map(Number);console.log(a+b)',
    typescript:
      'const fs=require("fs");const [a,b]:number[]=fs.readFileSync(0,"utf8").trim().split(/\\s+/).map(Number);console.log(a+b)',
  };
  const report: {
    at: string;
    checks: Array<{ name: string; passed: boolean; error?: string }>;
  } = { at: new Date().toISOString(), checks: [] };
  const check = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
      report.checks.push({ name, passed: true });
      console.log(`PASS: ${name}`);
    } catch (error) {
      report.checks.push({
        name,
        passed: false,
        error: error instanceof Error ? error.message : 'execution failed',
      });
      console.log(`FAIL: ${name}`);
    }
  };
  try {
    for (const provider of ['judge0', 'piston']) {
      process.env.CODE_EXECUTION_PROVIDER = provider;
      const execution = new ExecutionService(fallback, primary);
      for (const [language, code] of Object.entries(samples))
        await check(`${provider}: ${language} sum`, async () => {
          const [result] = await execution.executeCode(language, code, [
            { id: 1, input: '10 20', expected: '30' },
          ]);
          assert.equal(
            result.status,
            Status.ACCEPTED,
            result.error || result.output,
          );
          assert(result.passed);
          assert.equal(
            execution.executionMetrics().failovers,
            0,
            'Primary tests must really use Judge0',
          );
        });
    }
    process.env.CODE_EXECUTION_PROVIDER = 'judge0';
    const execution = new ExecutionService(fallback, primary);
    for (const [name, code, status] of [
      ['wrong answer', 'print(0)', Status.WRONG_ANSWER],
      [
        'compile error',
        '#include <iostream>\nint main( {',
        Status.COMPILATION_ERROR,
      ],
      ['runtime error', 'raise ValueError("test")', Status.RUNTIME_ERROR],
    ] as const)
      await check(`Judge0 verdict without fallback: ${name}`, async () => {
        const [result] = await execution.executeCode(
          name === 'compile error' ? 'cpp' : 'python',
          code,
          [{ id: 1, input: '', expected: '30' }],
        );
        assert.equal(result.status, status);
        assert.equal(execution.executionMetrics().failovers, 0);
      });
    process.env.JUDGE0_BASE_URL = 'http://127.0.0.1:59999';
    const unavailable = new Judge0Service(wrapper as never);
    try {
      await check(
        'real primary connection failure falls back to Piston',
        async () => {
          const failover = new ExecutionService(fallback, unavailable);
          const [result] = await failover.executeCode(
            'python',
            samples.python,
            [{ id: 1, input: '10 20', expected: '30' }],
          );
          assert(result.passed);
          assert.equal(failover.executionMetrics().failovers, 1);
        },
      );
    } finally {
      unavailable.onModuleDestroy();
    }
  } finally {
    primary.onModuleDestroy();
    fallback.onModuleDestroy();
    await redis.quit();
    if (original.provider === undefined)
      delete process.env.CODE_EXECUTION_PROVIDER;
    else process.env.CODE_EXECUTION_PROVIDER = original.provider;
    if (original.url === undefined) delete process.env.JUDGE0_BASE_URL;
    else process.env.JUDGE0_BASE_URL = original.url;
    await writeFile(
      resolve(__dirname, '../../.local-dev/judges-live-report.json'),
      JSON.stringify(report, null, 2),
    );
  }
  assert(
    report.checks.every((check) => check.passed),
    'Some live judge checks failed; see .local-dev/judges-live-report.json',
  );
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Live judge test failed',
  );
  process.exitCode = 1;
});
