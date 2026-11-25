import { lockdownLogger } from "./lockdown-logger";
import * as bridge from "./lockdown-bridge";

jest.mock("./lockdown-bridge", () => {
  const actual = jest.requireActual("./lockdown-bridge");
  return {
    ...actual,
    isLockdownClient: jest.fn(),
    getFlightRecorderContext: jest.fn(),
    logFrontendEvent: jest.fn(() => Promise.resolve()),
  };
});

describe("lockdownLogger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lockdownLogger.clearBreadcrumbs();
  });

  it("degrades gracefully to console-only when not inside LockDown client", () => {
    (bridge.isLockdownClient as jest.Mock).mockReturnValue(false);
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});

    lockdownLogger.info("BOOT", "page_loaded", { route: "/assessments" });

    expect(infoSpy).toHaveBeenCalled();
    expect(bridge.logFrontendEvent).not.toHaveBeenCalled();
    expect(lockdownLogger.getBreadcrumbs()).toHaveLength(1);
    infoSpy.mockRestore();
  });

  it("redacts sensitive fields and preserves byte lengths", () => {
    (bridge.isLockdownClient as jest.Mock).mockReturnValue(false);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    lockdownLogger.warn("SECURITY", "header_check", {
      authorization: "Bearer secret-jwt-token",
      xLockdownSignature: "abcd1234",
      quitPin: "1234",
      code: "print('secret')",
      durationMs: 12,
    });

    const crumbs = lockdownLogger.getBreadcrumbs();
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0].details.authorization).toMatch(/^\[REDACTED:\d+B\]$/);
    expect(crumbs[0].details.xLockdownSignature).toMatch(/^\[REDACTED:\d+B\]$/);
    expect(crumbs[0].details.quitPin).toMatch(/^\[REDACTED:\d+B\]$/);
    expect(crumbs[0].details.code).toMatch(/^\[REDACTED:\d+B\]$/);
    expect(crumbs[0].details.durationMs).toBe(12);
    warnSpy.mockRestore();
  });

  it("attaches correlation context and forwards to Rust when inside LockDown client", async () => {
    (bridge.isLockdownClient as jest.Mock).mockReturnValue(true);
    (bridge.getFlightRecorderContext as jest.Mock).mockResolvedValue({
      bootId: "boot-uuid-123",
      platform: "macos",
      osVersion: "unix",
      arch: "aarch64",
      logDir: "/tmp/logs",
      clientVersion: "1.0.0",
    });
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    lockdownLogger.setCorrelationContext({
      assessmentId: "exam-42",
      candidateId: "user-7",
      sessionId: "sess-99",
    });
    lockdownLogger.error("ATTESTATION", "attest_failed", { statusCode: 403 });

    await new Promise((r) => setTimeout(r, 10));

    expect(bridge.logFrontendEvent).toHaveBeenCalledWith(
      "ERROR",
      "ATTESTATION",
      "attest_failed",
      expect.objectContaining({
        bootId: "boot-uuid-123",
        assessmentId: "exam-42",
        candidateId: "user-7",
        sessionId: "sess-99",
        statusCode: 403,
      }),
    );
    errSpy.mockRestore();
  });
});
