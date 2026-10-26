import { act, renderHook } from "@testing-library/react";
import { useActivityTimer } from "@/hooks/useActivityTimer";

describe("Global Activity Timer Standardization", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("sets the default timer duration to 30 seconds wherever timer configuration is missing or invalid", () => {
    const { result } = renderHook(() =>
      useActivityTimer({
        mode: "countdown",
      }),
    );

    // Missing duration receives 30-second global default
    expect(result.current.remainingSeconds).toBe(30);
    expect(result.current.formattedRemaining).toBe("00:30");
  });

  it("preserves explicitly configured durations for assessments, contests, or exercises", () => {
    const { result } = renderHook(() =>
      useActivityTimer({
        durationSeconds: 2700, // 45 minutes
        mode: "countdown",
      }),
    );

    expect(result.current.remainingSeconds).toBe(2700);
    expect(result.current.formattedRemaining).toBe("45:00");
  });

  it("updates countdown accurately every second", () => {
    const { result } = renderHook(() =>
      useActivityTimer({
        durationSeconds: 30,
        mode: "countdown",
      }),
    );

    expect(result.current.remainingSeconds).toBe(30);

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.remainingSeconds).toBe(25);
    expect(result.current.formattedRemaining).toBe("00:25");
  });

  it("triggers onExpire exactly once at zero without duplicate calls or negative numbers", () => {
    const onExpire = jest.fn();
    const { result } = renderHook(() =>
      useActivityTimer({
        durationSeconds: 3,
        mode: "countdown",
        onExpire,
      }),
    );

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.isExpired).toBe(true);
    expect(result.current.status).toBe("expired");
    expect(onExpire).toHaveBeenCalledTimes(1);

    // Advancing past zero should never produce negative countdown or re-trigger onExpire
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(result.current.remainingSeconds).toBe(0);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("recalculates remaining time from authoritative timestamps to eliminate tab suspension drift", () => {
    const now = Date.now();
    jest.setSystemTime(now);

    const deadline = now + 30_000;
    const { result } = renderHook(() =>
      useActivityTimer({
        deadlineAt: deadline,
        durationSeconds: 30,
        mode: "countdown",
      }),
    );

    expect(result.current.remainingSeconds).toBe(30);

    // Simulate tab being suspended / backgrounded for 18 seconds
    jest.setSystemTime(now + 18_000);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Authoritative calculation guarantees remaining is 11-12s, not 29s
    expect(result.current.remainingSeconds).toBeLessThanOrEqual(12);
    expect(result.current.remainingSeconds).toBeGreaterThanOrEqual(11);
  });

  it("tracks stopwatch study duration accurately and detects when requirement is met", () => {
    const onCheckpoint = jest.fn();
    const { result } = renderHook(() =>
      useActivityTimer({
        durationSeconds: 30,
        initialTimeSpent: 10,
        mode: "stopwatch",
        checkpointIntervalSeconds: 15,
        onCheckpoint,
      }),
    );

    expect(result.current.timeSpentSeconds).toBe(10);
    expect(result.current.hasMetRequirement).toBe(false);

    act(() => {
      jest.advanceTimersByTime(20_000); // Now 30s
    });

    expect(result.current.timeSpentSeconds).toBe(30);
    expect(result.current.hasMetRequirement).toBe(true);
    expect(onCheckpoint).toHaveBeenCalled();
  });
});
