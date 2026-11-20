import { pacingTelemetry } from "./pacing-telemetry";
import { telemetryBuffer, TelemetryEvent } from "./telemetry-buffer";
import api from "@/config/api";

jest.mock("@/config/api", () => ({
  __esModule: true,
  default: {
    post: jest.fn().mockResolvedValue({ data: { success: true, count: 1 } }),
  },
}));

describe("Pacing Telemetry & Telemetry Buffer Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pacingTelemetry.clear();
  });

  describe("PacingTelemetryManager", () => {
    it("accumulates dwell time across question switches", () => {
      pacingTelemetry.setActiveQuestion("q-1");
      pacingTelemetry.recordKeystroke("q-1");
      pacingTelemetry.recordKeystroke("q-1");

      pacingTelemetry.setActiveQuestion("q-2");
      pacingTelemetry.recordPaste(20, "q-2");

      const snapshot = pacingTelemetry.getSnapshot() as any[];
      expect(Array.isArray(snapshot)).toBe(true);
      expect(snapshot.length).toBeGreaterThanOrEqual(2);

      const q1 = snapshot.find((m) => m.questionId === "q-1");
      const q2 = snapshot.find((m) => m.questionId === "q-2");

      expect(q1).toBeDefined();
      expect(q1?.keystrokes).toBe(2);

      expect(q2).toBeDefined();
      expect(q2?.pastedChars).toBe(20);
      expect(q2?.injectedChars).toBe(0);
    });

    it("flags large pastes as injected characters", () => {
      pacingTelemetry.setActiveQuestion("q-1");
      pacingTelemetry.recordPaste(120, "q-1");

      const snapshot = pacingTelemetry.getSnapshot("q-1") as any;
      expect(snapshot.pastedChars).toBe(120);
      expect(snapshot.injectedChars).toBe(120);
    });

    it("resets state upon clear()", () => {
      pacingTelemetry.setActiveQuestion("q-1");
      pacingTelemetry.recordKeystroke("q-1");
      pacingTelemetry.clear();

      const snapshot = pacingTelemetry.getSnapshot() as any[];
      expect(snapshot.length).toBe(0);
    });
  });

  describe("TelemetryBufferManager", () => {
    it("buffers non-critical events without immediate flush", () => {
      telemetryBuffer.init("assessment-123", "session-456");
      const event: TelemetryEvent = {
        eventType: "BLUR",
        severity: "INFO",
        metadata: { blurCount: 1 },
      };

      telemetryBuffer.recordEvent(event);
      // api.post should NOT be immediately called for non-critical event
      expect(api.post).not.toHaveBeenCalled();

      telemetryBuffer.destroy();
    });

    it("immediately flushes critical security violations and submissions", async () => {
      telemetryBuffer.init("assessment-123", "session-456");
      const criticalEvent: TelemetryEvent = {
        eventType: "SECONDARY_DISPLAY_CONNECTED",
        severity: "CRITICAL",
        metadata: { monitors: 2 },
      };

      telemetryBuffer.recordEvent(criticalEvent);

      expect(api.post).toHaveBeenCalledWith(
        "/exam-security/telemetry-batch",
        expect.objectContaining({
          assessmentId: "assessment-123",
          sessionId: "session-456",
          events: expect.arrayContaining([
            expect.objectContaining({
              eventType: "SECONDARY_DISPLAY_CONNECTED",
              severity: "CRITICAL",
            }),
          ]),
        })
      );

      telemetryBuffer.destroy();
    });

    it("flushes immediately on EXAM_SUBMISSION event", async () => {
      telemetryBuffer.init("assessment-789");
      const submissionEvent: TelemetryEvent = {
        eventType: "EXAM_SUBMISSION",
        metadata: { answersCount: 5 },
      };

      telemetryBuffer.recordEvent(submissionEvent);

      expect(api.post).toHaveBeenCalledWith(
        "/exam-security/telemetry-batch",
        expect.objectContaining({
          assessmentId: "assessment-789",
          events: expect.arrayContaining([
            expect.objectContaining({ eventType: "EXAM_SUBMISSION" }),
          ]),
        })
      );

      telemetryBuffer.destroy();
    });
  });
});
