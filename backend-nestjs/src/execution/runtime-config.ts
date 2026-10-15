import { execFileSync } from 'node:child_process';
import { parse } from 'dotenv';

// A dedicated judge parameter keeps database, JWT and OAuth settings outside
// this deployment. EC2 uses its instance role; no static keys are passed.
const allowed = new Set([
  'CODE_EXECUTION_PROVIDER', 'JUDGE0_BASE_URL', 'PISTON_BASE_URL',
  'JUDGE0_AUTH_TOKEN', 'PISTON_API_KEY', 'PISTON_RUNTIME_VERSIONS',
  'WORKER_CONCURRENCY', 'JUDGE0_MAX_CONCURRENT_EXECUTIONS',
  'JUDGE0_GLOBAL_MAX_CONCURRENT', 'JUDGE0_NODE_MAX_CONCURRENT',
  'JUDGE_TEST_CASE_CONCURRENCY', 'JUDGE0_MAX_MEMORY_MB',
  'JUDGE0_MAX_RUN_TIMEOUT_MS', 'PISTON_MAX_CONCURRENT_EXECUTIONS',
  'PISTON_GLOBAL_MAX_CONCURRENT', 'PISTON_NODE_MAX_CONCURRENT',
  'PISTON_TEST_CASE_CONCURRENCY', 'PISTON_DEFAULT_MEMORY_LIMIT_BYTES',
  'PISTON_COMPILE_MEMORY_LIMIT_BYTES', 'PISTON_DEFAULT_RUN_TIMEOUT_MS',
  'PISTON_DEFAULT_COMPILE_TIMEOUT_MS', 'PISTON_REQUEST_TIMEOUT_MS',
]);

if (process.env.NODE_ENV === 'production' && process.env.JUDGE_CONFIG_PARAMETER) {
  const parameter = process.env.JUDGE_CONFIG_PARAMETER;
  if (!/^\/[A-Za-z0-9_/.-]+$/.test(parameter))
    throw new Error('Invalid judge configuration parameter path');
  const childEnv = { ...process.env };
  for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'])
    delete childEnv[key];
  let settings: Record<string, string>;
  try {
    settings = parse(execFileSync('aws', [
      'ssm', 'get-parameter', '--name', parameter, '--with-decryption',
      '--region', process.env.AWS_REGION || 'ap-south-1',
      '--query', 'Parameter.Value', '--output', 'text',
    ], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }));
  } catch {
    throw new Error('Judge configuration unavailable; refusing to start');
  }
  if (Object.keys(settings).some((key) => !allowed.has(key)) ||
      settings.CODE_EXECUTION_PROVIDER !== 'judge0' ||
      !settings.JUDGE0_BASE_URL || !settings.PISTON_BASE_URL ||
      !settings.JUDGE0_AUTH_TOKEN || !settings.PISTON_API_KEY)
    throw new Error('Invalid dedicated judge configuration');
  Object.assign(process.env, settings);
  delete process.env.JUDGE0_BASE_URLS;
  delete process.env.PISTON_BASE_URLS;
}
