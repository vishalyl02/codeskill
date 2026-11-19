import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import ForensicWatermarkOverlay from "@/components/assessment/ForensicWatermarkOverlay";
import SafeExamBrowser from "@/components/assessment/SafeExamBrowser";

jest.mock("react-hot-toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

describe("ForensicWatermarkOverlay", () => {
  beforeEach(() => {
    // Mock canvas getContext
    HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
      save: jest.fn(),
      restore: jest.fn(),
      scale: jest.fn(),
      clearRect: jest.fn(),
      translate: jest.fn(),
      rotate: jest.fn(),
      fillText: jest.fn(),
    }) as any;
  });

  it("renders null and attaches zero observers when disabled or already submitted", () => {
    const { container: disabledContainer } = render(
      <ForensicWatermarkOverlay enabled={false} isSubmitted={false} />
    );
    expect(disabledContainer.firstChild).toBeNull();

    const { container: submittedContainer } = render(
      <ForensicWatermarkOverlay enabled={true} isSubmitted={true} />
    );
    expect(submittedContainer.firstChild).toBeNull();
  });

  it("renders canvas overlay with pointer-events-none and 0.035 opacity when enabled", () => {
    const { container } = render(
      <ForensicWatermarkOverlay
        enabled={true}
        isSubmitted={false}
        candidateId="cand-12345"
        candidateIdentifier="candidate@university.edu"
        assessmentId="exam-999"
        attestationSessionId="sess-alpha-beta-123"
      />
    );

    const overlay = container.querySelector("#codeskill-forensic-watermark") as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.opacity).toBe("0.035");
    expect(overlay.style.pointerEvents).toBe("none");

    const canvas = overlay?.querySelector("canvas");
    expect(canvas).not.toBeNull();
  });
});

describe("HID Macro Injection Cadence Detection (SafeExamBrowser)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: document.documentElement,
    });
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    jest.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("does NOT emit violation during normal human typing cadence", () => {
    const onViolation = jest.fn();
    const { getByRole } = render(
      <SafeExamBrowser onViolation={onViolation} monitorViolations={true} isEnabled={true}>
        <input role="textbox" aria-label="code-input" />
      </SafeExamBrowser>
    );

    const input = getByRole("textbox");
    let fakeNow = 1000;
    jest.spyOn(performance, "now").mockImplementation(() => fakeNow);

    // Simulate 70 human keystrokes with variable flight times between 80ms and 180ms
    for (let i = 0; i < 70; i++) {
      fireEvent.keyDown(input, { key: "a", code: "KeyA" });
      fakeNow += 50; // Dwell 50ms
      fireEvent.keyUp(input, { key: "a", code: "KeyA" });
      fakeNow += 100 + (i % 20); // Flight 100-119ms
    }

    expect(onViolation).not.toHaveBeenCalledWith(
      "HID_MACRO_INJECTION_SUSPECTED",
      expect.any(String),
      expect.any(Object)
    );
  });

  it("emits HID_MACRO_INJECTION_SUSPECTED when robotic typing cadence is detected (< 18ms flight, < 3.5ms stddev for >= 60 chars)", () => {
    const onViolation = jest.fn();
    const { getByRole } = render(
      <SafeExamBrowser onViolation={onViolation} monitorViolations={true} isEnabled={true}>
        <input role="textbox" aria-label="code-input" />
      </SafeExamBrowser>
    );

    const input = getByRole("textbox");
    let fakeNow = 10000;
    jest.spyOn(performance, "now").mockImplementation(() => fakeNow);

    // Simulate 65 consecutive robotic keystrokes with fixed 10ms flight time
    for (let i = 0; i < 65; i++) {
      fireEvent.keyDown(input, { key: "x", code: "KeyX" });
      fakeNow += 5; // Dwell 5ms
      fireEvent.keyUp(input, { key: "x", code: "KeyX" });
      fakeNow += 10; // Fixed 10ms flight (< 18ms, stddev ~ 0 < 3.5ms)
    }

    expect(onViolation).toHaveBeenCalledWith(
      "HID_MACRO_INJECTION_SUSPECTED",
      expect.stringContaining("Superhuman keystroke injection cadence detected"),
      expect.objectContaining({
        meanFlightMs: expect.any(Number),
        stdDevMs: expect.any(Number),
        charsPerMinute: expect.any(Number),
      })
    );
  });
});
