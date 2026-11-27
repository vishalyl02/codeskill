export function assessmentStartupError(error: unknown, phase: "settings" | "attestation" | "start"): string {
  const failure = error as {
    code?: string;
    message?: string;
    response?: { status?: number; data?: { message?: string | string[] } };
  } | null;
  const status = failure?.response?.status;
  if (
    failure?.code === "ERR_NETWORK" ||
    failure?.code === "ECONNABORTED" ||
    failure?.code === "ETIMEDOUT" ||
    (status !== undefined && status >= 500)
  ) {
    return phase === "attestation"
      ? "CodeSkill could not reach the assessment service to verify your LockDown session. Try again."
      : "CodeSkill could not reach the assessment service. Check your connection and try again.";
  }

  const serverMessage = failure?.response?.data?.message;
  if (Array.isArray(serverMessage) && serverMessage.length > 0) return serverMessage.join(" ");
  if (typeof serverMessage === "string" && serverMessage.trim()) return serverMessage;
  if (failure?.message && !status) return failure.message;

  if (phase === "attestation") return "CodeSkill could not verify this LockDown session. Try again.";

  return phase === "settings"
    ? "CodeSkill could not load the assessment settings. Try again."
    : "CodeSkill could not start this assessment. Check your attempt eligibility and try again.";
}

// Retrying reads cannot start a second attempt or spend a resume opportunity.
export async function retryAssessmentSettings<T>(load: () => Promise<T>, isCancelled: () => boolean): Promise<T> {
  const retryDelays = [250, 600];
  for (const delay of retryDelays) {
    try {
      return await load();
    } catch (error) {
      const failure = error as { code?: string; response?: { status?: number } } | null;
      const status = failure?.response?.status;
      const transient = ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"].includes(failure?.code ?? "")
        || status === 502 || status === 503 || status === 504;
      if (!transient || isCancelled()) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      if (isCancelled()) throw error;
    }
  }
  return load();
}

// A rejected rate-limit request never reached the attempt handler. Avoid
// replaying ambiguous network failures, which may have spent a resume.
export async function retryAssessmentStartRateLimit<T>(start: () => Promise<T>): Promise<T> {
  for (const delay of [500, 1200]) {
    try {
      return await start();
    } catch (error) {
      const failure = error as { response?: { status?: number; headers?: Record<string, string> } };
      if (failure?.response?.status !== 429) throw error;
      const retryAfter = Number(failure.response.headers?.["retry-after"]);
      if (Number.isFinite(retryAfter) && retryAfter > 5) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(delay, (retryAfter || 0) * 1000)));
    }
  }
  return start();
}
