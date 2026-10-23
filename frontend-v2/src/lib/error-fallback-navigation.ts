export type CriticalFailure = "server" | "network" | "timeout" | "unexpected";
export const CRITICAL_API_FAILURE_EVENT = "codeskill:critical-api-failure";

const FALLBACK_PATH = "/error-fallback";

export function classifyCriticalApiFailure({
  status,
  code,
  hasResponse,
  method,
  url,
}: {
  status?: number;
  code?: string;
  hasResponse: boolean;
  method?: string;
  url?: string;
}): CriticalFailure | null {
  // Runtime discovery is optional: its failure must leave the problem readable.
  if (url?.split("?")[0].replace(/\/$/, "").endsWith("execution/runtimes")) return null;
  const requestMethod = method?.toUpperCase() || "GET";
  if (requestMethod !== "GET" && requestMethod !== "HEAD") return null;
  if (status !== undefined && status >= 500) return "server";
  if (status === 408 || code === "ECONNABORTED" || code === "ETIMEDOUT") return "timeout";
  if (!hasResponse && (code === "ERR_NETWORK" || code === "ECONNREFUSED")) return "network";
  return null;
}

export function redirectToCriticalErrorFallback(failure: CriticalFailure): void {
  if (typeof window === "undefined" || window.location.pathname === FALLBACK_PATH) return;

  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const params = new URLSearchParams({ failure, returnTo });
  window.location.replace(`${FALLBACK_PATH}?${params.toString()}`);
}

export function announceCriticalApiFailure(failure: CriticalFailure, statusCode?: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CRITICAL_API_FAILURE_EVENT, {
    detail: { failure, statusCode },
  }));
}
