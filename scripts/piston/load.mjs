// Controlled authenticated staging queue benchmark; never disables rate limits.
import { readFile, writeFile } from 'node:fs/promises';
const [fixturePath, totalText = '10', concurrencyText = '10', reportPath = 'piston-load-report.json'] = process.argv.slice(2);
const total = Number(totalText), concurrency = Number(concurrencyText);
if (process.env.PISTON_LIVE_TESTS !== 'dedicated-staging' || !fixturePath || ![10,50,100,500].includes(total) || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) throw new Error('Usage: staging opt-in, fixture JSON, total (10/50/100/500), client concurrency (1..100), report path');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const base = process.env.CODESKILL_STAGING_API;
if (!base || new URL(base).hostname === 'codeskill.novaserve.cloud') throw new Error('An explicit nonproduction API URL is required');
// Use one dedicated staging candidate token per submission; tokens are never logged.
if (!Array.isArray(fixture.tokens) || fixture.tokens.length < total || !fixture.problemId || !fixture.code || !fixture.language) throw new Error('Fixture requires problemId, known-correct code, language, and one token per staging candidate');
const report = { startedAt: new Date().toISOString(), total, clientConcurrency: concurrency, results: [] };
const start = performance.now();
async function request(path, token, body) {
  const response = await fetch(`${base.replace(/\/$/,'')}${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000), body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
let next = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, total) }, async () => {
  while (next < total) {
    const index = next++, token = fixture.tokens[index];
    const acceptedStart = performance.now();
    try {
      const submitted = await request('/submissions', token, { problemId: fixture.problemId, code: fixture.code, language: fixture.language });
      const id = submitted.submissionId;
      if (!id) throw new Error('Missing submission ID');
      const deadline = Date.now() + 600000;
      let result;
      while (Date.now() < deadline) {
        result = await request(`/submissions/${id}/result`, token);
        if (result.completedAt) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      if (!result?.completedAt) throw new Error('Submission polling deadline exceeded');
      report.results.push({ index, status: result.status, passed: result.status === 'accepted', endToEndMs: performance.now() - acceptedStart,
        queueWaitMs: result.startedAt && result.queuedAt ? new Date(result.startedAt) - new Date(result.queuedAt) : undefined,
        cpuMs: result.runtime, memoryMiB: result.memory });
    } catch (error) { report.results.push({ index, passed: false, error: error.message }); }
  }
}));
report.elapsedMs = performance.now() - start;
report.successes = report.results.filter(r => r.passed).length;
report.errors = total - report.successes;
report.throughputPerSecond = total / (report.elapsedMs / 1000);
const sorted = report.results.filter(r => Number.isFinite(r.queueWaitMs)).map(r => r.queueWaitMs).sort((a,b) => a-b);
report.queueWaitP95Ms = sorted.length ? sorted[Math.min(sorted.length-1, Math.floor(sorted.length*.95))] : null;
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ reportPath, total, successes: report.successes, errors: report.errors, throughputPerSecond: report.throughputPerSecond }));
if (report.errors) process.exitCode = 1;
