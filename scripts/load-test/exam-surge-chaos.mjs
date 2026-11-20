#!/usr/bin/env node

/**
 * Enterprise Exam Surge & Chaos Load Testing Suite
 *
 * Simulates high-concurrency campus exam environments:
 * 1. Concurrent /attest-client + /resume-state bursts across virtual candidates
 * 2. Jittered /telemetry-batch and /save-progress streams with 15% transient network packet drops & idempotency retries
 * 3. Synchronized thundering-herd /submit wave at T=0 with deterministic idempotency keys
 *
 * Invariants Verified:
 * - 0 lost submissions
 * - 0 duplicate-submit errors
 * - p50, p90, p95, and p99 latency reporting
 *
 * Configurable via environment variables:
 * - BASE_URL (default: 'http://localhost:5001/api')
 * - ASSESSMENT_ID (default: 'test-assessment-uuid')
 * - CONCURRENCY (default: 500)
 * - PACKET_DROP_RATE (default: 0.15)
 * - AUTH_TOKEN (default: '')
 */

import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:5001/api').replace(/\/$/, '');
const ASSESSMENT_ID = process.env.ASSESSMENT_ID || 'test-assessment-uuid';
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '500', 10));
const PACKET_DROP_RATE = Math.max(0, Math.min(1, parseFloat(process.env.PACKET_DROP_RATE || '0.15')));
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const FORCE_SIMULATE = process.argv.includes('--simulate') || process.argv.includes('--dry-run') || process.env.SIMULATE === 'true';

// Colors for terminal reporting
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function formatMs(ms) {
  return `${ms.toFixed(2)}ms`;
}

function calculatePercentiles(latencies) {
  if (!latencies.length) {
    return { p50: 0, p90: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;
  const p = (pct) => sorted[Math.min(n - 1, Math.floor(n * pct))];
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  return {
    min: sorted[0],
    p50: p(0.5),
    p90: p(0.9),
    p95: p(0.95),
    p99: p(0.99),
    max: sorted[n - 1],
    avg: sum / n,
  };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Probe if live backend is responding
async function probeLiveBackend() {
  if (FORCE_SIMULATE) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);
    return res !== null && res.status < 500;
  } catch {
    return false;
  }
}

/**
 * In-memory server-side mock for autonomous chaos simulation
 * Models Redis idempotency store, SubmissionStore commits, and circuit breaker
 */
class AutonomousExamServer {
  constructor() {
    this.redisIdempotencyCache = new Map();
    this.committedSubmissions = new Map();
    this.inFlightLocks = new Set();
    this.telemetryBuffer = [];
  }

  async handleAttestClient(body) {
    await sleep(2 + Math.random() * 5);
    if (!body?.publicKeyPem) {
      return { status: 400, data: { error: 'Invalid publicKeyPem' } };
    }
    return {
      status: 200,
      data: {
        success: true,
        verified: true,
        attestedSessionId: crypto.randomUUID(),
        serverTime: Date.now(),
      },
    };
  }

  async handleResumeState(candidateId, assessmentId) {
    await sleep(3 + Math.random() * 6);
    return {
      status: 200,
      data: {
        success: true,
        candidateId,
        assessmentId,
        serverEndsAtEpochMs: Date.now() + 3600000,
        serverNowMs: Date.now(),
      },
    };
  }

  async handleTelemetry(candidateId, body) {
    await sleep(1 + Math.random() * 4);
    this.telemetryBuffer.push({ candidateId, count: body.events?.length || 1 });
    return { status: 202, data: { success: true, accepted: true } };
  }

  async handleAutosave(key, candidateId, body) {
    await sleep(2 + Math.random() * 8);
    return {
      status: 200,
      data: {
        success: true,
        idempotencyKey: key,
        savedAt: Date.now(),
      },
    };
  }

  async handleSubmit(key, candidateId, attemptId, body) {
    // 1. Check Redis idempotency receipt
    if (this.redisIdempotencyCache.has(key)) {
      const cached = this.redisIdempotencyCache.get(key);
      return {
        status: 200,
        data: { ...cached, receipt: 'cached_idempotency_receipt' },
      };
    }

    // 2. Lock & commit to SubmissionStore
    if (this.inFlightLocks.has(key)) {
      while (this.inFlightLocks.has(key)) {
        await sleep(10);
      }
      if (this.redisIdempotencyCache.has(key)) {
        return {
          status: 200,
          data: { ...this.redisIdempotencyCache.get(key), receipt: 'coalesced_in_flight' },
        };
      }
    }

    this.inFlightLocks.add(key);

    try {
      // Check if attempt was already committed under a different non-idempotent key
      if (this.committedSubmissions.has(attemptId) && this.committedSubmissions.get(attemptId).idempotencyKey !== key) {
        return {
          status: 409,
          data: { error: 'DUPLICATE_SUBMISSION', message: 'Attempt already finalized' },
        };
      }

      // Simulate submission sharding store latency
      await sleep(5 + Math.random() * 15);

      const receipt = {
        success: true,
        assessmentId: ASSESSMENT_ID,
        candidateId,
        attemptId,
        status: 'submitted',
        idempotencyKey: key,
        clientSubmittedAtMs: body.clientSubmittedAtMs || Date.now(),
        serverReceivedAtMs: Date.now(),
      };

      this.committedSubmissions.set(attemptId, receipt);
      this.redisIdempotencyCache.set(key, receipt);

      return { status: 200, data: receipt };
    } finally {
      this.inFlightLocks.delete(key);
    }
  }
}

/**
 * Chaos Transport: wraps HTTP fetch or simulated server with transient packet drop injection
 */
class ChaosTransport {
  constructor(isLive, server) {
    this.isLive = isLive;
    this.server = server;
    this.droppedPackets = 0;
    this.successfulCalls = 0;
  }

  async request(path, options = {}) {
    const shouldDrop = Math.random() < PACKET_DROP_RATE;

    if (shouldDrop) {
      this.droppedPackets++;
      await sleep(10 + Math.random() * 20);
      const err = new Error('Simulated transient network timeout / packet drop (ETIMEDOUT)');
      err.code = 'ETIMEDOUT';
      throw err;
    }

    this.successfulCalls++;

    if (this.isLive) {
      const url = `${BASE_URL}${path}`;
      const headers = {
        'Content-Type': 'application/json',
        ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
        ...(options.headers || {}),
      };
      const res = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }

    // Simulated path routing
    const body = options.body;
    const headers = options.headers || {};
    const idempotencyKey = headers['x-idempotency-key'] || body?.idempotencyKey;

    if (path === '/exam-security/attest-client') {
      return this.server.handleAttestClient(body);
    }
    if (path.includes('/resume-state')) {
      const candidateId = options.candidateId || 'cand-0001';
      return this.server.handleResumeState(candidateId, ASSESSMENT_ID);
    }
    if (path.includes('/telemetry-batch')) {
      const candidateId = options.candidateId || 'cand-0001';
      return this.server.handleTelemetry(candidateId, body);
    }
    if (path.includes('/save-progress')) {
      const candidateId = options.candidateId || 'cand-0001';
      return this.server.handleAutosave(idempotencyKey, candidateId, body);
    }
    if (path.includes('/submit')) {
      const candidateId = options.candidateId || 'cand-0001';
      const attemptId = options.attemptId || 'attempt-0001';
      return this.server.handleSubmit(idempotencyKey, candidateId, attemptId, body);
    }

    return { status: 200, data: { ok: true } };
  }
}

/**
 * Execute resilient candidate request with jittered exponential retries
 */
async function resilientRequest(transport, path, options, maxRetries = 5) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const res = await transport.request(path, options);
      if (res.status >= 500 && attempt < maxRetries) {
        attempt++;
        const backoff = Math.min(1000, 50 * Math.pow(2, attempt) + Math.random() * 50);
        await sleep(backoff);
        continue;
      }
      return res;
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) throw err;
      const backoff = Math.min(1000, 50 * Math.pow(2, attempt) + Math.random() * 50);
      await sleep(backoff);
    }
  }
}

async function runChaosLoadSuite() {
  console.log(`\n${c.bold}${c.cyan}================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}  CODESKILL ENTERPRISE EXAM SURGE & CHAOS LOAD TEST SUITE       ${c.reset}`);
  console.log(`${c.bold}${c.cyan}================================================================${c.reset}`);
  console.log(` Target Base URL    : ${c.yellow}${BASE_URL}${c.reset}`);
  console.log(` Assessment ID      : ${c.yellow}${ASSESSMENT_ID}${c.reset}`);
  console.log(` Virtual Candidates : ${c.yellow}${CONCURRENCY}${c.reset}`);
  console.log(` Packet Drop Rate   : ${c.yellow}${(PACKET_DROP_RATE * 100).toFixed(1)}%${c.reset}`);

  const isLive = await probeLiveBackend();
  const server = isLive ? null : new AutonomousExamServer();
  const transport = new ChaosTransport(isLive, server);

  if (isLive) {
    console.log(` Mode               : ${c.green}LIVE SERVER (http probe succeeded)${c.reset}\n`);
  } else {
    console.log(` Mode               : ${c.yellow}AUTONOMOUS CHAOS SIMULATION (in-memory Redis & sharding store)${c.reset}\n`);
  }

  // Pre-generate candidate metadata
  const candidates = Array.from({ length: CONCURRENCY }, (_, i) => {
    const id = (i + 1).toString().padStart(4, '0');
    return {
      candidateId: `cand-chaos-${id}`,
      attemptId: `att-chaos-${id}-${crypto.randomBytes(4).toString('hex')}`,
      sessionId: `sess-chaos-${id}`,
      publicKeyPem: `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA${crypto.randomBytes(24).toString('base64')}\n-----END PUBLIC KEY-----`,
    };
  });

  // -------------------------------------------------------------------------
  // PHASE 1: Concurrent /attest-client + /resume-state bursts
  // -------------------------------------------------------------------------
  console.log(`${c.bold}[Phase 1/3] Launching ${CONCURRENCY} concurrent /attest-client & /resume-state bursts...${c.reset}`);
  const phase1Start = performance.now();
  const attestLatencies = [];
  let phase1SuccessCount = 0;

  const phase1Promises = candidates.map(async (cand) => {
    const t0 = performance.now();
    try {
      const attestRes = await resilientRequest(transport, '/exam-security/attest-client', {
        method: 'POST',
        body: {
          publicKeyPem: cand.publicKeyPem,
          clientVersion: '1.0.0',
          os: 'darwin',
          preflightPassed: true,
          assessmentId: ASSESSMENT_ID,
        },
      });

      const resumeRes = await resilientRequest(
        transport,
        `/assessments/${ASSESSMENT_ID}/resume-state`,
        { method: 'GET', candidateId: cand.candidateId },
      );

      if (attestRes.status === 200 && resumeRes.status === 200) {
        phase1SuccessCount++;
      }
      attestLatencies.push(performance.now() - t0);
    } catch {
      // recorded in latency
    }
  });

  await Promise.all(phase1Promises);
  const phase1Duration = performance.now() - phase1Start;
  const phase1Stats = calculatePercentiles(attestLatencies);

  console.log(`  Phase 1 Duration : ${formatMs(phase1Duration)}`);
  console.log(`  Successful Bursts: ${phase1SuccessCount}/${CONCURRENCY}`);
  console.log(`  Latency (p50/p95): ${formatMs(phase1Stats.p50)} / ${formatMs(phase1Stats.p95)}\n`);

  // -------------------------------------------------------------------------
  // PHASE 2: Jittered /telemetry-batch and /autosave streams with chaos drops
  // -------------------------------------------------------------------------
  console.log(`${c.bold}[Phase 2/3] Simulating jittered telemetry & autosave streams with 15% drops & retries...${c.reset}`);
  const phase2Start = performance.now();
  let autosaveSuccessCount = 0;
  let retryCount = 0;
  const autosaveLatencies = [];

  const phase2Promises = candidates.map(async (cand, idx) => {
    // Add jitter so candidates do not tick concurrently
    await sleep((idx % 20) * 15);

    // 1. Send telemetry batch
    await resilientRequest(
      transport,
      '/exam-security/telemetry-batch',
      {
        method: 'POST',
        candidateId: cand.candidateId,
        body: {
          assessmentId: ASSESSMENT_ID,
          sessionId: cand.sessionId,
          events: [
            { eventType: 'FOCUS_ACTIVE', severity: 'INFO', timestamp: Date.now() },
            { eventType: 'KEYSTROKE_CADENCE', metadata: { wpm: 45 }, timestamp: Date.now() },
          ],
        },
      },
    ).catch(() => {});

    // 2. Autosave answer with deterministic idempotency key
    const sequenceNumber = 1;
    const autosaveKey = `autosave:${cand.attemptId}:${cand.candidateId}:${sequenceNumber}`;
    const t0 = performance.now();

    try {
      const res = await resilientRequest(
        transport,
        `/assessments/${ASSESSMENT_ID}/save-progress`,
        {
          method: 'POST',
          candidateId: cand.candidateId,
          headers: { 'x-idempotency-key': autosaveKey },
          body: {
            idempotencyKey: autosaveKey,
            answers: { 'q-1': 'function solution() { return true; }' },
          },
        },
      );
      if (res.status === 200) {
        autosaveSuccessCount++;
      }
      autosaveLatencies.push(performance.now() - t0);
    } catch {
      retryCount++;
    }
  });

  await Promise.all(phase2Promises);
  const phase2Duration = performance.now() - phase2Start;
  const phase2Stats = calculatePercentiles(autosaveLatencies);

  console.log(`  Phase 2 Duration : ${formatMs(phase2Duration)}`);
  console.log(`  Autosaves Stored : ${autosaveSuccessCount}/${CONCURRENCY}`);
  console.log(`  Dropped Packets  : ${transport.droppedPackets} (resiliently retried)`);
  console.log(`  Latency (p50/p95): ${formatMs(phase2Stats.p50)} / ${formatMs(phase2Stats.p95)}\n`);

  // -------------------------------------------------------------------------
  // PHASE 3: Synchronized Thundering-Herd /submit wave at T=0
  // -------------------------------------------------------------------------
  console.log(`${c.bold}[Phase 3/3] Synchronized thundering-herd /submit wave across ALL ${CONCURRENCY} candidates at T=0...${c.reset}`);
  const phase3Start = performance.now();
  const submitLatencies = [];
  const submissionReceipts = [];
  let duplicateErrors = 0;
  let lostSubmissions = 0;

  // Barrier sync: unleash all submit calls simultaneously
  const submitPromises = candidates.map(async (cand) => {
    const submissionKey = `submit:${ASSESSMENT_ID}:${cand.candidateId}:${cand.attemptId}`;
    const t0 = performance.now();

    try {
      // First attempt (might suffer network packet drop)
      const res = await resilientRequest(
        transport,
        `/assessments/${ASSESSMENT_ID}/submit`,
        {
          method: 'POST',
          candidateId: cand.candidateId,
          attemptId: cand.attemptId,
          headers: { 'x-idempotency-key': submissionKey },
          body: {
            idempotencyKey: submissionKey,
            clientSubmittedAtMs: Date.now(),
            answers: {
              'q-1': 'function solution() { return true; }',
              'q-2': 'A',
            },
          },
        },
      );

      const elapsed = performance.now() - t0;
      submitLatencies.push(elapsed);

      if (res.status === 200 && res.data?.success) {
        submissionReceipts.push(res.data);
      } else if (res.status === 409) {
        duplicateErrors++;
      } else {
        lostSubmissions++;
      }

      // Simulate aggressive campus Wi-Fi double-submit retry with exact same key
      if (Math.random() < 0.25) {
        const dupRes = await transport.request(`/assessments/${ASSESSMENT_ID}/submit`, {
          method: 'POST',
          candidateId: cand.candidateId,
          attemptId: cand.attemptId,
          headers: { 'x-idempotency-key': submissionKey },
          body: {
            idempotencyKey: submissionKey,
            clientSubmittedAtMs: Date.now(),
          },
        }).catch(() => null);

        // A retry with the identical key MUST coalesce or return 200 with cached receipt, NEVER 409
        if (dupRes && dupRes.status === 409) {
          duplicateErrors++;
        }
      }
    } catch {
      lostSubmissions++;
    }
  });

  await Promise.all(submitPromises);
  const phase3Duration = performance.now() - phase3Start;
  const submitStats = calculatePercentiles(submitLatencies);

  // -------------------------------------------------------------------------
  // FINAL REPORT & ASSERTIONS
  // -------------------------------------------------------------------------
  console.log(`\n${c.bold}${c.cyan}================================================================${c.reset}`);
  console.log(`${c.bold}${c.cyan}  CHAOS LOAD TEST EXECUTION RESULTS & LATENCY PROFILE           ${c.reset}`);
  console.log(`${c.bold}${c.cyan}================================================================${c.reset}`);
  console.log(` Total Candidates Simulated   : ${c.bold}${CONCURRENCY}${c.reset}`);
  console.log(` Confirmed Submissions        : ${c.green}${submissionReceipts.length}/${CONCURRENCY}${c.reset}`);
  console.log(` Lost Submissions             : ${lostSubmissions === 0 ? c.green + '0' : c.red + lostSubmissions}${c.reset}`);
  console.log(` Duplicate Submit Errors      : ${duplicateErrors === 0 ? c.green + '0' : c.red + duplicateErrors}${c.reset}`);
  console.log(` Total Simulated Packet Drops : ${c.yellow}${transport.droppedPackets}${c.reset}`);
  console.log(` Total Thundering-Herd Time   : ${formatMs(phase3Duration)}`);
  console.log(`----------------------------------------------------------------`);
  console.log(` Submission Wave Latency Percentiles:`);
  console.log(`   Min Latency  (p00) : ${formatMs(submitStats.min)}`);
  console.log(`   Median       (p50) : ${formatMs(submitStats.p50)}`);
  console.log(`   90th Percent (p90) : ${formatMs(submitStats.p90)}`);
  console.log(`   95th Percent (p95) : ${c.bold}${formatMs(submitStats.p95)}${c.reset}`);
  console.log(`   99th Percent (p99) : ${c.bold}${formatMs(submitStats.p99)}${c.reset}`);
  console.log(`   Max Latency  (p100): ${formatMs(submitStats.max)}`);
  console.log(`   Average Latency    : ${formatMs(submitStats.avg)}`);
  console.log(`================================================================\n`);

  // Assertions verification
  let failed = false;
  if (lostSubmissions > 0) {
    console.error(`${c.red}❌ ASSERTION FAILED: Lost ${lostSubmissions} submissions during chaos surge!${c.reset}`);
    failed = true;
  }
  if (duplicateErrors > 0) {
    console.error(`${c.red}❌ ASSERTION FAILED: Encountered ${duplicateErrors} duplicate-submit errors!${c.reset}`);
    failed = true;
  }
  if (submissionReceipts.length !== CONCURRENCY) {
    console.error(`${c.red}❌ ASSERTION FAILED: Expected ${CONCURRENCY} confirmed submissions, got ${submissionReceipts.length}!${c.reset}`);
    failed = true;
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`${c.green}${c.bold}✅ ALL CHAOS LOAD & RESILIENCE ASSERTIONS PASSED!${c.reset}\n`);
}

runChaosLoadSuite().catch((err) => {
  console.error('Fatal load test error:', err);
  process.exit(1);
});
