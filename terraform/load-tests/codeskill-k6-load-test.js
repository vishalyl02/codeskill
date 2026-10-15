import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// =================================================================================================
// CodeSkill Examination Platform - Concurrent Student Load Testing Suite
// Supports 100, 500, 1,000, and 2,000 concurrent virtual students
// =================================================================================================

// Custom Metrics
const submissionLatency = new Trend('codeskill_submission_latency_ms');
const submissionErrors  = new Rate('codeskill_submission_error_rate');
const loginLatency      = new Trend('codeskill_login_latency_ms');
const apiErrors         = new Rate('codeskill_api_error_rate');
const completedSubmissions = new Counter('codeskill_completed_submissions');

// Configurable target from environment variable or default
const BASE_URL = __ENV.TARGET_URL || 'https://codeskill.novaserve.cloud';
const TARGET_VUS = parseInt(__ENV.CONCURRENT_STUDENTS || '100');

// Scenario generation based on selected concurrency
export const options = {
  stages: [
    { duration: '1m', target: Math.floor(TARGET_VUS * 0.25) }, // Ramp-up 25%
    { duration: '2m', target: Math.floor(TARGET_VUS * 0.50) }, // Ramp-up 50%
    { duration: '3m', target: TARGET_VUS },                    // Full Concurrency Peak
    { duration: '5m', target: TARGET_VUS },                    // Sustained Examination Load
    { duration: '2m', target: Math.floor(TARGET_VUS * 0.25) }, // Scale down
    { duration: '1m', target: 0 },                             // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(50)<500', 'p(95)<2000', 'p(99)<4000'], // p50 < 500ms, p95 < 2s, p99 < 4s
    http_req_failed: ['rate<0.02'],                                 // HTTP error rate under 2%
    codeskill_submission_error_rate: ['rate<0.05'],                // Code execution failures under 5%
  },
};

// Sample student code submissions for multi-language testing
const SUBMISSION_PAYLOADS = [
  {
    language: 'python',
    code: `import sys\ndef solve():\n    lines = sys.stdin.read().split()\n    if not lines: return\n    n = int(lines[0])\n    nums = [int(x) for x in lines[1:n+1]]\n    print(sum(nums))\nsolve()\n`,
    stdin: "5\n1 2 3 4 5\n",
    expectedOutput: "15\n"
  },
  {
    language: 'javascript',
    code: `const fs = require('fs');\nconst input = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);\nif (input.length > 0 && input[0] !== '') {\n  const nums = input.slice(1).map(Number);\n  console.log(nums.reduce((a, b) => a + b, 0));\n}\n`,
    stdin: "3\n10 20 30\n",
    expectedOutput: "60\n"
  },
  {
    language: 'cpp',
    code: `#include <iostream>\n#include <vector>\n#include <numeric>\nusing namespace std;\nint main() {\n    int n; if (!(cin >> n)) return 0;\n    long long sum = 0;\n    for(int i=0; i<n; i++) { long long v; cin >> v; sum += v; }\n    cout << sum << endl;\n    return 0;\n}\n`,
    stdin: "4\n5 10 15 20\n",
    expectedOutput: "50\n"
  }
];

export default function () {
  const studentId = __VU;
  const username = `student_${studentId}@codeskill.test`;
  const password = 'StudentTestPassword123!';

  // Step 1: Check System Health
  const healthRes = http.get(`${BASE_URL}/api/health`);
  const isHealthy = check(healthRes, {
    'Health API status is 200': (r) => r.status === 200,
  });
  apiErrors.add(!isHealthy);

  // Step 2: Student Login Simulation
  const loginStart = Date.now();
  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: username, password: password }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  loginLatency.add(Date.now() - loginStart);

  let authToken = '';
  if (loginRes.status === 200 || loginRes.status === 201) {
    try {
      const body = JSON.parse(loginRes.body);
      authToken = body.token || body.access_token || '';
    } catch (e) {}
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
  };

  // Step 3: Fetch Available Contests & Questions
  const contestsRes = http.get(`${BASE_URL}/api/contests`, { headers: authHeaders });
  check(contestsRes, {
    'Contests endpoint responds': (r) => r.status < 500,
  });

  // Step 4: Simulate Reading Problem (3-7s pause)
  sleep(Math.random() * 4 + 3);

  // Step 5: Execute Code Submission
  const sample = SUBMISSION_PAYLOADS[Math.floor(Math.random() * SUBMISSION_PAYLOADS.length)];
  const submissionStart = Date.now();
  
  const submitRes = http.post(
    `${BASE_URL}/api/execution/run`,
    JSON.stringify({
      language: sample.language,
      code: sample.code,
      stdin: sample.stdin,
      expectedOutput: sample.expectedOutput,
    }),
    { headers: authHeaders, timeout: '30s' }
  );

  const submissionDuration = Date.now() - submissionStart;
  submissionLatency.add(submissionDuration);

  const submitOk = check(submitRes, {
    'Submission accepted or evaluated': (r) => r.status === 200 || r.status === 201 || r.status === 202,
  });

  if (!submitOk) {
    submissionErrors.add(1);
  } else {
    submissionErrors.add(0);
    completedSubmissions.add(1);
  }

  // Step 6: Think time between problem actions (2-5 seconds)
  sleep(Math.random() * 3 + 2);
}
