"use client";

import { isLockdownClient, getFlightRecorderContext, logFrontendEvent } from "./lockdown-bridge";

export type LockdownLogLevel = "debug" | "info" | "warn" | "error";

export interface LockdownLogEntry {
  timestampMs: number;
  level: LockdownLogLevel;
  category: string;
  event: string;
  bootId: string | null;
  assessmentId?: string;
  candidateId?: string;
  sessionId?: string;
  route: string;
  networkOnline: boolean;
  visibilityState: string;
  details: Record<string, unknown>;
}

const MAX_RING_BUFFER = 200;
const SENSITIVE_KEY_RE = /(authorization|signature|secret|token|password|pin|cookie|^code$|^answer$|^answers$|rawcode)/i;

function sanitizeDetails(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input === undefined ? {} : { value: String(input) };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      const len = typeof v === "string" ? v.length : JSON.stringify(v ?? "").length;
      out[k] = `[REDACTED:${len}B]`;
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = sanitizeDetails(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

class LockdownStructuredLogger {
  private buffer: LockdownLogEntry[] = [];
  private bootId: string | null = null;
  private correlation: {
    assessmentId?: string;
    candidateId?: string;
    sessionId?: string;
  } = {};
  private initialized = false;
  private bootIdPromise: Promise<void> | null = null;
  private flightContext: {
    bootId: string;
    platform: string;
    clientVersion: string;
  } | null = null;
  private lastUploadByKey = new Map<string, number>();

  public setCorrelationContext(ctx: {
    assessmentId?: string;
    candidateId?: string;
    sessionId?: string;
  }) {
    if (ctx.assessmentId) this.correlation.assessmentId = ctx.assessmentId;
    if (ctx.candidateId) this.correlation.candidateId = ctx.candidateId;
    if (ctx.sessionId) this.correlation.sessionId = ctx.sessionId;
  }

  public getBootId(): string | null {
    return this.bootId;
  }

  public initGlobalListeners() {
    if (this.initialized || typeof window === "undefined") return;
    this.initialized = true;

    if (isLockdownClient()) {
      void this.ensureBootId();

      window.addEventListener("error", (ev) => {
        this.error("WEBVIEW_RUNTIME", "window_onerror", {
          message: ev.message,
          filename: ev.filename,
          lineno: ev.lineno,
          colno: ev.colno,
        });
      });

      window.addEventListener("unhandledrejection", (ev) => {
        this.error("WEBVIEW_RUNTIME", "unhandled_rejection", {
          reason: ev.reason instanceof Error ? ev.reason.message : String(ev.reason),
        });
      });

      document.addEventListener("visibilitychange", () => {
        this.info("WEBVIEW_VISIBILITY", "visibility_change", {
          visibilityState: document.visibilityState,
        });
      });

      window.addEventListener("online", () => {
        this.info("NETWORK", "network_online", {});
      });

      window.addEventListener("offline", () => {
        this.warn("NETWORK", "network_offline", {});
      });
    }
  }

  private async ensureBootId(): Promise<void> {
    if (this.bootId && this.flightContext) return;
    if (!this.bootIdPromise) {
      this.bootIdPromise = getFlightRecorderContext()
        .then((ctx) => {
          if (ctx?.bootId) {
            this.bootId = ctx.bootId;
            this.flightContext = {
              bootId: ctx.bootId,
              platform: ctx.platform,
              clientVersion: ctx.clientVersion,
            };
          }
        })
        .catch(() => {})
        .finally(() => {
          this.bootIdPromise = null;
        });
    }
    await this.bootIdPromise;
  }

  private emit(
    level: LockdownLogLevel,
    category: string,
    event: string,
    details: Record<string, unknown> = {},
    forwardToNative = false,
  ) {
    const sanitized = sanitizeDetails(details);
    const entry: LockdownLogEntry = {
      timestampMs: Date.now(),
      level,
      category,
      event,
      bootId: this.bootId,
      assessmentId: this.correlation.assessmentId,
      candidateId: this.correlation.candidateId,
      sessionId: this.correlation.sessionId,
      route: typeof window !== "undefined" ? window.location.pathname : "",
      networkOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
      visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown",
      details: sanitized,
    };

    this.buffer.push(entry);
    if (this.buffer.length > MAX_RING_BUFFER) {
      this.buffer.shift();
    }

    if (typeof console !== "undefined") {
      const fn =
        level === "error"
          ? console.error
          : level === "warn"
            ? console.warn
            : level === "debug"
              ? console.debug
              : console.info;
      fn(`[LockDown][${category}][${event}]`, entry);
    }

    // Only bridge to Rust flight recorder when running inside LockDown desktop client
    if (
      typeof window !== "undefined" &&
      isLockdownClient() &&
      (forwardToNative || level === "warn" || level === "error")
    ) {
      void this.ensureBootId().then(() =>
        logFrontendEvent(level.toUpperCase(), category, event, {
          ...sanitized,
          bootId: this.bootId,
          assessmentId: this.correlation.assessmentId,
          candidateId: this.correlation.candidateId,
          sessionId: this.correlation.sessionId,
          route: entry.route,
          networkOnline: entry.networkOnline,
        }).catch(() => {}),
      );
    }
  }

  public debug(category: string, event: string, details: Record<string, unknown> = {}) {
    this.emit("debug", category, event, details, false);
  }

  public info(
    category: string,
    event: string,
    details: Record<string, unknown> = {},
    forwardToNative = true,
  ) {
    this.emit("info", category, event, details, forwardToNative);
  }

  public warn(category: string, event: string, details: Record<string, unknown> = {}) {
    this.emit("warn", category, event, details, true);
  }

  public error(category: string, event: string, details: Record<string, unknown> = {}) {
    this.emit("error", category, event, details, true);
  }

  public getBreadcrumbs(limit = 25): LockdownLogEntry[] {
    return this.buffer.slice(-Math.max(1, limit));
  }

  public clearBreadcrumbs() {
    this.buffer = [];
  }

  public async uploadDiagnosticsSnapshot(
    apiClient: { post: (url: string, data?: unknown) => Promise<unknown> },
    assessmentId: string | undefined,
    reason: string,
    summary: Record<string, unknown> = {},
    cooldownMs = 15000,
  ): Promise<boolean> {
    if (typeof window === "undefined" || !isLockdownClient()) return false;
    const dedupeKey = `${assessmentId || "global"}:${reason}`;
    const now = Date.now();
    const lastSent = this.lastUploadByKey.get(dedupeKey) || 0;
    if (now - lastSent < cooldownMs) {
      return false;
    }
    this.lastUploadByKey.set(dedupeKey, now);

    try {
      await this.ensureBootId();
      await apiClient.post("exam-security/client-diagnostics", {
        assessmentId: assessmentId || this.correlation.assessmentId,
        sessionId: this.correlation.sessionId,
        bootId: this.bootId,
        platform: this.flightContext?.platform,
        clientVersion: this.flightContext?.clientVersion,
        summary: {
          reason,
          ...sanitizeDetails(summary),
        },
        breadcrumbs: this.getBreadcrumbs(25),
      });
      return true;
    } catch {
      return false;
    }
  }
}

export const lockdownLogger = new LockdownStructuredLogger();
