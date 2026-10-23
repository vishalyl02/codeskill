import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AnalyticsService } from './analytics.service';
import { TokenService } from '../auth/token.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { Repository } from 'typeorm';

interface LatencyStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  durationMs: number;
  rps: number;
}

function calculateStats(latencies: number[], totalDurationMs: number): LatencyStats {
  if (latencies.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0, durationMs: 0, rps: 0 };
  }
  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((acc, curr) => acc + curr, 0);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  return {
    count: latencies.length,
    min: Number(latencies[0].toFixed(2)),
    max: Number(latencies[latencies.length - 1].toFixed(2)),
    avg: Number((sum / latencies.length).toFixed(2)),
    p50: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
    durationMs: Number(totalDurationMs.toFixed(2)),
    rps: Number(((latencies.length / totalDurationMs) * 1000).toFixed(1)),
  };
}

async function runBenchmark() {
  console.log('===============================================================');
  console.log('⚡ CodeSkill Analytics Concurrency & Performance Benchmark');
  console.log('   Target: 1,000 Concurrent Requests Simulation');
  console.log('===============================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const analyticsService = app.get(AnalyticsService);
  const tokenService = app.get(TokenService);
  const userRepo: Repository<User> = app.get(getRepositoryToken(User));

  // Find or verify admin
  let admin = await userRepo.findOne({ where: { role: 'admin' } });
  if (!admin) {
    admin = await userRepo.findOne({});
  }

  console.log(`[Setup] Target Admin User: ${admin?.email || 'N/A'} (ID: ${admin?.id || 'N/A'})`);

  // Phase 1: Database Warm-Up / Cold Query Performance (Direct Service + DB)
  console.log('\n--- Phase 1: Cold Query Execution Latency (Uncached DB Queries) ---');
  const coldEndpoints = [
    { name: 'Overview', fn: () => analyticsService.getPlatformOverview() },
    { name: 'Activity (7d)', fn: () => analyticsService.getActivity({ period: '7d' }) },
    { name: 'Languages', fn: () => analyticsService.getLanguages() },
    { name: 'Leaderboard', fn: () => analyticsService.getLeaderboard({ limit: 10, page: 1 }) },
    { name: 'Assessments', fn: () => analyticsService.getAssessmentsOverview() },
    { name: 'Retention', fn: () => analyticsService.getRetention() },
  ];

  for (const ep of coldEndpoints) {
    const t0 = performance.now();
    await ep.fn();
    const t1 = performance.now();
    console.log(`  ✓ ${ep.name.padEnd(18)} : ${(t1 - t0).toFixed(2)} ms`);
  }

  // Phase 2: Concurrent Load Simulation (1,000 Concurrent Calls)
  console.log('\n--- Phase 2: High Concurrency Load Test (1,000 Concurrent Requests) ---');
  const CONCURRENT_REQUESTS = 1000;
  const queries = [
    () => analyticsService.getPlatformOverview(),
    () => analyticsService.getActivity({ period: '7d' }),
    () => analyticsService.getActivity({ period: '30d' }),
    () => analyticsService.getLanguages(),
    () => analyticsService.getAssessmentsOverview(),
    () => analyticsService.getRetention(),
    () => analyticsService.getLeaderboard({ limit: 20, page: 1 }),
  ];

  const latencies: number[] = [];
  const startLoad = performance.now();

  const promises: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    const queryFn = queries[i % queries.length];
    const task = (async () => {
      const qStart = performance.now();
      await queryFn();
      const qEnd = performance.now();
      latencies.push(qEnd - qStart);
    })();
    promises.push(task);
  }

  await Promise.all(promises);
  const totalLoadDuration = performance.now() - startLoad;
  const stats = calculateStats(latencies, totalLoadDuration);

  console.log(`  Total Requests Executed : ${stats.count}`);
  console.log(`  Total Execution Time    : ${stats.durationMs} ms`);
  console.log(`  Throughput              : ${stats.rps} requests/sec`);
  console.log(`  Min Latency             : ${stats.min} ms`);
  console.log(`  Average Latency         : ${stats.avg} ms`);
  console.log(`  Median (p50) Latency    : ${stats.p50} ms`);
  console.log(`  95th Percentile (p95)   : ${stats.p95} ms`);
  console.log(`  99th Percentile (p99)   : ${stats.p99} ms`);
  console.log(`  Max Latency             : ${stats.max} ms`);

  // Phase 3: HTTP API Controller & Auth Verification
  if (admin) {
    console.log('\n--- Phase 3: Authenticated HTTP Endpoint Benchmark ---');
    const token = tokenService.signAccessToken(admin);
    const httpLatencies: number[] = [];
    const httpStart = performance.now();
    const HTTP_CONCURRENCY = 100;

    const httpPromises: Promise<void>[] = [];
    for (let i = 0; i < HTTP_CONCURRENCY; i++) {
      const epPath = i % 2 === 0 ? 'admin/analytics/overview' : 'admin/analytics/activity?period=7d';
      const task = (async () => {
        const reqStart = performance.now();
        const res = await fetch(`http://127.0.0.1:5001/api/${epPath}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const reqEnd = performance.now();
        if (res.ok) {
          httpLatencies.push(reqEnd - reqStart);
        }
      })();
      httpPromises.push(task);
    }

    await Promise.all(httpPromises);
    const httpDuration = performance.now() - httpStart;
    const httpStats = calculateStats(httpLatencies, httpDuration);

    console.log(`  HTTP Concurrent Calls   : ${httpStats.count}`);
    console.log(`  Throughput              : ${httpStats.rps} requests/sec`);
    console.log(`  HTTP p50 Latency        : ${httpStats.p50} ms`);
    console.log(`  HTTP p95 Latency        : ${httpStats.p95} ms`);
    console.log(`  HTTP p99 Latency        : ${httpStats.p99} ms`);
  }

  await app.close();
  console.log('\n===============================================================');
  console.log('✅ Benchmark Completed Successfully');
  console.log('===============================================================\n');
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
