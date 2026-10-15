import { positiveInteger, providerUrls } from '../providers/provider.config';
const defaultLanguages = {
  c: 50,
  cpp: 54,
  java: 62,
  python: 71,
  javascript: 63,
  typescript: 74,
};
export function judge0Config() {
  let languages: unknown;
  try {
    languages = JSON.parse(
      process.env.JUDGE0_LANGUAGE_IDS || JSON.stringify(defaultLanguages),
    );
  } catch {
    throw new Error('Invalid JUDGE0_LANGUAGE_IDS');
  }
  if (
    !languages ||
    typeof languages !== 'object' ||
    Array.isArray(languages) ||
    Object.values(languages).some(
      (id: unknown) => !Number.isSafeInteger(id) || Number(id) < 1,
    )
  )
    throw new Error('Judge0 language IDs must be positive integers');
  const submissionTimeout = positiveInteger(
    'JUDGE0_SUBMISSION_TIMEOUT_MS',
    30000,
    1000,
    180000,
  );
  return {
    urls: providerUrls('JUDGE0_BASE_URL', 'http://127.0.0.1:2358'),
    authToken: process.env.JUDGE0_AUTH_TOKEN,
    apiKey: process.env.JUDGE0_API_KEY,
    apiHost: process.env.JUDGE0_API_HOST,
    requestTimeout: positiveInteger(
      'JUDGE0_REQUEST_TIMEOUT_MS',
      5000,
      100,
      30000,
    ),
    submissionTimeout,
    pollInterval: positiveInteger('JUDGE0_POLL_INTERVAL_MS', 250, 25, 2000),
    runTimeout: positiveInteger('JUDGE0_MAX_RUN_TIMEOUT_MS', 10000, 100, 60000),
    timeMultiplier: positiveInteger('JUDGE_TIME_LIMIT_MULTIPLIER', 1, 1, 20),
    memoryMb: positiveInteger('JUDGE0_MAX_MEMORY_MB', 512, 32, 1024),
    concurrency: positiveInteger('JUDGE0_MAX_CONCURRENT_EXECUTIONS', 8, 1, 100),
    globalConcurrency: positiveInteger(
      'JUDGE0_GLOBAL_MAX_CONCURRENT',
      8,
      1,
      1000,
    ),
    nodeConcurrency: positiveInteger('JUDGE0_NODE_MAX_CONCURRENT', 8, 1, 1000),
    testCaseConcurrency: positiveInteger(
      'JUDGE_TEST_CASE_CONCURRENCY',
      2,
      1,
      16,
    ),
    failureThreshold: positiveInteger(
      'JUDGE0_CIRCUIT_FAILURE_THRESHOLD',
      3,
      1,
      100,
    ),
    cooldownMs: positiveInteger(
      'JUDGE0_CIRCUIT_COOLDOWN_MS',
      15000,
      100,
      300000,
    ),
    languages: languages as Record<string, number>,
    cacheTtl: positiveInteger(
      'JUDGE0_LANGUAGE_CACHE_TTL_MS',
      60000,
      1000,
      3600000,
    ),
    outputLimit: positiveInteger(
      'JUDGE_OUTPUT_LIMIT_BYTES',
      65536,
      1024,
      262144,
    ),
  };
}
