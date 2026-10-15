// Actual sandbox execution checks. Only against a dedicated nonproduction host.
import { readFile, writeFile } from 'node:fs/promises';
if (process.env.PISTON_LIVE_TESTS !== 'dedicated-staging') throw new Error('Set PISTON_LIVE_TESTS=dedicated-staging after host isolation approval');
const [registryPath, reportPath = 'piston-smoke-report.json'] = process.argv.slice(2);
if (!registryPath) throw new Error('Pass verified provisioning output JSON');
const { versions, runtimes } = JSON.parse(await readFile(registryPath, 'utf8'));
const base = process.env.PISTON_TEST_BASE_URL || 'http://127.0.0.1:2001/api/v2';
const runTimeout = Number(process.env.PISTON_TEST_RUN_TIMEOUT_MS || 3000);
const compileTimeout = Number(process.env.PISTON_TEST_COMPILE_TIMEOUT_MS || 10000);
if (!Number.isInteger(runTimeout)||runTimeout<100||runTimeout>60000||!Number.isInteger(compileTimeout)||compileTimeout<100||compileTimeout>120000) throw new Error('Invalid smoke-test time limits');
const samples = {
  c: ['main.c', '#include <stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);}'],
  cpp: ['main.cpp', '#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}'],
  java: ['Main.java', 'import java.util.*; public class Main { public static void main(String[] args){Scanner s=new Scanner(System.in);System.out.println(s.nextInt()+s.nextInt());}}'],
  python: ['main.py', 'a,b=map(int,input().split());print(a+b)'],
  javascript: ['main.js', 'const [a,b]=require("fs").readFileSync(0,"utf8").trim().split(/\\s+/).map(Number);console.log(a+b)'],
  typescript: ['main.ts', 'const fs = require("fs");const [a,b]:number[]=fs.readFileSync(0,"utf8").trim().split(/\\s+/).map(Number);console.log(a+b)'],
};
const report = { at: new Date().toISOString(), checks: [], passed: 0, failed: 0 };
async function execute(language, name, source, stdin = '') {
  const runtime = runtimes.find(r => (r.language === language || r.aliases?.includes(language) || language === 'cpp' && r.language === 'c++') && r.version === versions[language]);
  if (!runtime) throw new Error(`Runtime unavailable: ${language}`);
  const start = performance.now();
  const response = await fetch(`${base}/execute`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(runTimeout+compileTimeout+10000), body: JSON.stringify({ language: runtime.language, version: runtime.version, files: [{ name, content: source }], stdin, run_timeout: runTimeout, compile_timeout: compileTimeout, run_memory_limit: 268435456, compile_memory_limit: 536870912 }) });
  if (!response.ok) throw new Error(`Execution HTTP ${response.status}`);
  return { data: await response.json(), latencyMs: performance.now() - start };
}
async function check(name, language, source, stdin, predicate) {
  try {
    const result = await execute(language, samples[language][0], source, stdin);
    const passed = predicate(result.data);
    report.checks.push({ name, language, passed, latencyMs: result.latencyMs, cpuMs: result.data.run?.cpu_time, memoryBytes: result.data.run?.memory });
    report[passed ? 'passed' : 'failed']++;
  } catch (error) { report.checks.push({ name, language, passed: false, error: error.message }); report.failed++; }
}
for (const [language, [, source]] of Object.entries(samples)) await check('sum', language, source, '10 20', r => r.run?.code === 0 && r.run.stdout.trim() === '30');
await check('multiline stdin', 'python', 'import sys;print(sys.stdin.read().strip())', 'one\ntwo', r => r.run?.stdout.trim() === 'one\ntwo');
await check('Unicode stdin', 'python', 'print(input())', 'नमस्ते🙂', r => r.run?.stdout.trim() === 'नमस्ते🙂');
await check('empty stdin', 'python', 'import sys;print(len(sys.stdin.read().strip()))', '', r => r.run?.stdout.trim() === '0');
await check('syntax failure', 'python', 'def :', '', r => r.run?.code !== 0);
await check('compile failure', 'c', 'int main( {', '', r => !!r.compile && (r.compile.code !== 0 || !!r.compile.signal));
await check('runtime failure', 'python', 'raise ValueError("test")', '', r => r.run?.code !== 0);
await check('nonzero exit', 'python', 'raise SystemExit(7)', '', r => r.run?.code === 7);
await check('infinite loop', 'python', 'while True: pass', '', r => r.run?.status === 'TO');
await check('output bound', 'python', 'while True: print("x"*10000)', '', r => ['OL','EL'].includes(r.run?.status));
await check('memory limit kill (classification evidence only)', 'python', 'x=bytearray(512*1024*1024)', '', r => r.run?.code !== 0 || !!r.run?.signal);
// Harmless isolation probes. Never retrieve actual secrets; report boolean outcomes only.
await check('metadata network denied', 'python', 'import socket\ns=socket.socket();s.settimeout(1)\ntry:\n s.connect(("169.254.169.254",80));print("NETWORK_ALLOWED")\nexcept OSError: print("DENIED")', '', r => r.run?.stdout.trim() === 'DENIED');
await check('Docker socket and AWS env absent', 'python', 'import os;print("DENIED" if not os.path.exists("/var/run/docker.sock") and not any(k.startswith("AWS_") for k in os.environ) else "EXPOSED")', '', r => r.run?.stdout.trim() === 'DENIED');
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ reportPath, passed: report.passed, failed: report.failed }));
if (report.failed) process.exitCode = 1;
