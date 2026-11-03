export interface PeerMetric {
  percentile: number;
  sampleSize: number;
}
export interface ExecutionFeedbackResult {
  status: string;
  passedCount: number;
  totalCount: number;
  runtime?: number;
  memory?: number;
  message?: string;
  compileOutput?: string;
  comparison?: {
    runtime?: PeerMetric | null;
    memory?: PeerMetric | null;
    score?: PeerMetric | null;
  } | null;
  distribution?: {
    buckets: Array<{ min: number; max: number | null; count: number }>;
    sampleSize: number;
  } | null;
  results: Array<{
    id?: number | string;
    testId?: string;
    passed: boolean;
    status?: string;
    isHidden?: boolean;
    input?: string;
    output?: string;
    expected?: string;
    error?: string;
    stdout?: string;
    stderr?: string;
    executionTime?: number;
    memoryUsed?: number;
  }>;
}

export const pendingSubmissionStatuses = [
  "queued",
  "pending",
  "running",
  "testing",
];
export function normalizeVerdict(status: string) {
  return (
    (
      {
        compilation_error: "compile_error",
        time_limit_exceeded: "time_limit",
        memory_limit_exceeded: "memory_limit",
        internal_error: "system_error",
      } as Record<string, string>
    )[status] || status
  );
}

/** Submit once, then read the server verdict; never grade using the sample run. */
export async function awaitSubmission(
  start: () => Promise<{ data: any }>,
  poll: (id: string) => Promise<{ data: any }>,
  onStatus?: (status: string) => void,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<ExecutionFeedbackResult> {
  const response = await start();
  const id = response.data?.submissionId;
  if (!id) throw new Error("The server did not return a submission ID.");
  onStatus?.(response.data.status || "queued");
  const deadline = Date.now() + (options.timeoutMs ?? 180000);
  let currentInterval = options.intervalMs ?? 800;
  while (Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(resolve, currentInterval),
    );
    if (!options.intervalMs) {
      currentInterval = Math.min(2500, Math.round(currentInterval * 1.25));
    }
    const { data } = await poll(id);
    if (pendingSubmissionStatuses.includes(data.status)) {
      onStatus?.(data.status);
      continue;
    }
    if (!data.status || !Array.isArray(data.testResults))
      throw new Error("Unable to retrieve the submission verdict.");
    return {
      status: normalizeVerdict(data.status),
      results: data.testResults,
      passedCount: data.testCasesPassed ?? 0,
      totalCount: data.totalTestCases ?? 0,
      runtime: data.runtime,
      memory: data.memory,
      compileOutput: data.compileOutput,
      comparison: data.comparison,
      distribution: data.distribution,
    };
  }
  throw new Error(
    "Your submission is still processing. Check Submissions for its final verdict; your code is saved.",
  );
}
