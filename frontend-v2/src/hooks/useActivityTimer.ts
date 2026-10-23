import { useState, useEffect, useRef, useCallback } from "react";

export type TimerMode = "countdown" | "stopwatch";
export type TimerStatus = "not_started" | "running" | "completed" | "expired";

export interface UseActivityTimerOptions {
  id?: string;
  durationSeconds?: number; // Configured total duration in seconds (default 30 if missing/invalid)
  startedAt?: string | number | Date | null; // Server authoritative start timestamp
  deadlineAt?: string | number | Date | null; // Server authoritative deadline timestamp
  initialTimeSpent?: number; // Pre-existing time spent in seconds
  mode?: TimerMode; // "countdown" for tests/exams, "stopwatch" for learning time tracking
  onTick?: (remainingSeconds: number, timeSpentSeconds: number, status: TimerStatus) => void;
  onExpire?: () => Promise<void> | void; // Triggered exactly once when remaining reaches 0
  onCheckpoint?: (timeSpentSeconds: number, remainingSeconds: number) => Promise<void> | void;
  checkpointIntervalSeconds?: number; // Default 15s for periodic persistence
  autoStart?: boolean; // Default true
  disabled?: boolean;
}

export interface UseActivityTimerReturn {
  status: TimerStatus;
  remainingSeconds: number;
  timeSpentSeconds: number;
  formattedRemaining: string;
  formattedTimeSpent: string;
  isExpired: boolean;
  isRunning: boolean;
  hasStarted: boolean;
  hasMetRequirement: boolean; // True if timeSpentSeconds >= durationSeconds (for study requirement)
  start: () => void;
  pause: () => void;
  resume: () => void;
  complete: () => void;
  expire: () => void;
  reset: (newDurationSeconds?: number, newInitialTimeSpent?: number) => void;
}

const DEFAULT_FALLBACK_DURATION = 30; // 30-second standardized global default

function formatSeconds(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function useActivityTimer(options: UseActivityTimerOptions = {}): UseActivityTimerReturn {
  const {
    id,
    durationSeconds: rawDuration,
    startedAt,
    deadlineAt,
    initialTimeSpent = 0,
    mode = "countdown",
    onTick,
    onExpire,
    onCheckpoint,
    checkpointIntervalSeconds = 15,
    autoStart = true,
    disabled = false,
  } = options;

  // Standardize duration: if missing, undefined, null, or <= 0, use intended 30-second default
  const configuredDuration = typeof rawDuration === "number" && rawDuration > 0
    ? rawDuration
    : DEFAULT_FALLBACK_DURATION;

  // Derive start and deadline timestamps in epoch milliseconds
  const startMsRef = useRef<number>(Date.now());
  const deadlineMsRef = useRef<number>(Date.now() + configuredDuration * 1000);

  // Initialize timestamps
  useEffect(() => {
    if (startedAt) {
      const parsedStart = new Date(startedAt).getTime();
      if (!isNaN(parsedStart)) startMsRef.current = parsedStart;
    } else {
      startMsRef.current = Date.now() - (initialTimeSpent * 1000);
    }

    if (deadlineAt) {
      const parsedDeadline = new Date(deadlineAt).getTime();
      if (!isNaN(parsedDeadline)) deadlineMsRef.current = parsedDeadline;
    } else {
      deadlineMsRef.current = startMsRef.current + configuredDuration * 1000;
    }
  }, [id, startedAt, deadlineAt, configuredDuration, initialTimeSpent]);

  // Timer states
  const [status, setStatus] = useState<TimerStatus>(() => {
    if (disabled) return "not_started";
    if (autoStart) return "running";
    return "not_started";
  });

  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    if (deadlineAt) {
      const parsed = new Date(deadlineAt).getTime();
      if (!isNaN(parsed)) return Math.max(0, Math.ceil((parsed - Date.now()) / 1000));
    }
    return Math.max(0, configuredDuration - initialTimeSpent);
  });

  const [timeSpentSeconds, setTimeSpentSeconds] = useState<number>(initialTimeSpent);

  // Guards against multiple expiry and stale interval references
  const hasExpiredRef = useRef<boolean>(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  const onCheckpointRef = useRef(onCheckpoint);
  onCheckpointRef.current = onCheckpoint;

  const lastCheckpointRef = useRef<number>(0);

  // Synchronize when initialTimeSpent or duration updates
  useEffect(() => {
    if (initialTimeSpent > 0 && status !== "expired" && status !== "completed") {
      setTimeSpentSeconds(initialTimeSpent);
      if (mode === "countdown" && !deadlineAt) {
        setRemainingSeconds(Math.max(0, configuredDuration - initialTimeSpent));
      }
    }
  }, [initialTimeSpent, configuredDuration, mode, deadlineAt, status]);

  // Main high-precision tick loop using authoritative timestamps
  useEffect(() => {
    if (disabled || status !== "running") return;

    const tick = () => {
      const now = Date.now();

      // Non-drifting elapsed calculation
      const authoritativeElapsed = Math.max(0, Math.floor((now - startMsRef.current) / 1000));
      setTimeSpentSeconds(authoritativeElapsed);

      // Non-drifting countdown calculation
      const authoritativeRemaining = Math.max(0, Math.ceil((deadlineMsRef.current - now) / 1000));
      setRemainingSeconds(authoritativeRemaining);

      onTickRef.current?.(authoritativeRemaining, authoritativeElapsed, status);

      // Periodic persistence checkpoint (e.g., every 15 seconds)
      if (
        checkpointIntervalSeconds > 0 &&
        authoritativeElapsed > 0 &&
        authoritativeElapsed - lastCheckpointRef.current >= checkpointIntervalSeconds
      ) {
        lastCheckpointRef.current = authoritativeElapsed;
        void onCheckpointRef.current?.(authoritativeElapsed, authoritativeRemaining);
      }

      // Authoritative Expiry Check (for countdown mode)
      if (mode === "countdown" && authoritativeRemaining <= 0) {
        if (!hasExpiredRef.current) {
          hasExpiredRef.current = true;
          setStatus("expired");
          setRemainingSeconds(0);
          // Trigger expiry callback exactly once
          void onExpireRef.current?.();
        }
      }
    };

    tick(); // immediate initial run
    const interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [disabled, status, mode, checkpointIntervalSeconds]);

  // Control actions
  const start = useCallback(() => {
    hasExpiredRef.current = false;
    startMsRef.current = Date.now() - (timeSpentSeconds * 1000);
    deadlineMsRef.current = Date.now() + (remainingSeconds * 1000);
    setStatus("running");
  }, [timeSpentSeconds, remainingSeconds]);

  const pause = useCallback(() => {
    setStatus("not_started");
  }, []);

  const resume = useCallback(() => {
    if (status === "expired" || status === "completed") return;
    startMsRef.current = Date.now() - (timeSpentSeconds * 1000);
    deadlineMsRef.current = Date.now() + (remainingSeconds * 1000);
    setStatus("running");
  }, [status, timeSpentSeconds, remainingSeconds]);

  const complete = useCallback(() => {
    setStatus("completed");
  }, []);

  const expire = useCallback(() => {
    if (hasExpiredRef.current) return;
    hasExpiredRef.current = true;
    setStatus("expired");
    setRemainingSeconds(0);
    void onExpireRef.current?.();
  }, []);

  const reset = useCallback((newDurationSeconds?: number, newInitialTimeSpent = 0) => {
    hasExpiredRef.current = false;
    const dur = typeof newDurationSeconds === "number" && newDurationSeconds > 0
      ? newDurationSeconds
      : configuredDuration;
    startMsRef.current = Date.now() - (newInitialTimeSpent * 1000);
    deadlineMsRef.current = startMsRef.current + (dur * 1000);
    setTimeSpentSeconds(newInitialTimeSpent);
    setRemainingSeconds(Math.max(0, dur - newInitialTimeSpent));
    setStatus(autoStart ? "running" : "not_started");
  }, [configuredDuration, autoStart]);

  return {
    status,
    remainingSeconds,
    timeSpentSeconds,
    formattedRemaining: formatSeconds(remainingSeconds),
    formattedTimeSpent: formatSeconds(timeSpentSeconds),
    isExpired: status === "expired" || remainingSeconds <= 0,
    isRunning: status === "running",
    hasStarted: status === "running" || status === "completed" || status === "expired",
    hasMetRequirement: timeSpentSeconds >= configuredDuration,
    start,
    pause,
    resume,
    complete,
    expire,
    reset,
  };
}
