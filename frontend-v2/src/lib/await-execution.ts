interface Response {
  data: any;
}
/** Poll only the authenticated backend. Keep source and editor state in the caller. */
export async function awaitExecution<T extends Response>(
  start: () => Promise<T>,
  poll: (jobId: string) => Promise<Response>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const response = await start();
  if (!response.data?.jobId) return response;
  const jobId = String(response.data.jobId);
  const deadline = Date.now() + (options.timeoutMs ?? 180000);
  while (Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(resolve, options.intervalMs ?? 800),
    );
    const update = await poll(jobId);
    if (update.data?.jobId && !Array.isArray(update.data.results)) continue;
    const data = update.data;
    if (!data || !Array.isArray(data.results))
      throw new Error("Unable to retrieve execution results");
    const results = data.results.map((r: any) => ({
      ...r,
      stdout: r.stdout ?? r.output ?? "",
      stderr: r.stderr ?? r.error ?? "",
      executionTimeMs: r.executionTimeMs ?? r.executionTime,
    }));
    return {
      ...response,
      data: {
        ...data,
        results,
        result: results[0] ?? {
          status: data.status,
          stdout: "",
          stderr: data.message || "Code execution is temporarily unavailable.",
        },
      },
    };
  }
  throw new Error(
    "Execution is still queued. Please retry later; your code has been preserved.",
  );
}
