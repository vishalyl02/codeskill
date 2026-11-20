import api from "@/config/api";
import { pacingTelemetry } from "./pacing-telemetry";

export interface TelemetryEvent {
  eventType: string;
  severity?: "INFO" | "WARN" | "CRITICAL";
  metadata?: Record<string, any>;
  timestamp?: number;
}

class TelemetryBufferManager {
  private buffer: TelemetryEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private assessmentId: string | null = null;
  private sessionId: string | null = null;

  public init(assessmentId: string, sessionId?: string) {
    this.assessmentId = assessmentId;
    this.sessionId = sessionId || null;
    this.startFlushInterval();
  }

  public setSession(sessionId: string) {
    this.sessionId = sessionId;
  }

  public recordEvent(event: TelemetryEvent) {
    this.buffer.push({
      ...event,
      timestamp: event.timestamp || Date.now(),
    });

    // Immediate flush on critical violations or submission
    if (
      event.severity === "CRITICAL" ||
      event.eventType === "EXAM_SUBMISSION" ||
      event.eventType === "ABRUPT_SUBMISSION" ||
      event.eventType === "CLIENT_TERMINATED" ||
      event.eventType === "CONCURRENT_SESSION_DETECTED" ||
      event.eventType === "RUNTIME_TAMPER_DETECTED" ||
      event.eventType === "HID_MACRO_INJECTION_SUSPECTED" ||
      event.eventType === "WATERMARK_TAMPER_ATTEMPT" ||
      event.eventType === "INVALID_REQUEST_SIGNATURE"
    ) {
      void this.flush();
    }
  }

  public async flush(): Promise<void> {
    if (this.buffer.length === 0 && !this.assessmentId) return;
    const eventsToSend = [...this.buffer];
    this.buffer = [];

    const pacingSnapshot = pacingTelemetry.getSnapshot();

    if (eventsToSend.length === 0 && (!pacingSnapshot || (Array.isArray(pacingSnapshot) && pacingSnapshot.length === 0))) {
      return;
    }

    try {
      await api.post("/exam-security/telemetry-batch", {
        assessmentId: this.assessmentId,
        sessionId: this.sessionId,
        events: eventsToSend,
        pacingMetrics: pacingSnapshot,
      });
    } catch {
      // Re-queue up to 50 events on transient failure
      this.buffer = [...eventsToSend.slice(-50), ...this.buffer];
    }
  }

  private startFlushInterval() {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, 10000);
  }

  public destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    void this.flush();
  }
}

export const telemetryBuffer = new TelemetryBufferManager();
