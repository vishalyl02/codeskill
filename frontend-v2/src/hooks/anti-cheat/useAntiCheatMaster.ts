"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useFullscreen } from "./useFullscreen";
import { useTabVisibility } from "./useTabVisibility";
import { useKeyboardBlocker } from "./useKeyboardBlocker";
import { useCopyPasteProtect } from "./useCopyPasteProtect";
import { useDevToolsDetect } from "./useDevToolsDetect";
import api from "@/config/api"; // Assuming axios instance is here
import { io } from "socket.io-client";
import { logger } from "@/lib/logger";

interface AntiCheatConfig {
  enableFullscreen: boolean;
  enableCopyProtect: boolean;
  enablePasteProtect: boolean;
  enableDevToolsDetect: boolean;
  enableTabSwitchDetect: boolean;
  warningLimit: number;
  autoSubmitOnViolation?: boolean;
}

export function useAntiCheatMaster(
  contestId: string,
  userId: string,
  sessionId: string,
  config: AntiCheatConfig,
  onAutoSubmit: () => void,
  enabled = true
) {
  const [warnings, setWarnings] = useState(0);
  const [lastViolation, setLastViolation] = useState<string | null>(null);
  const [isWarningDialogOpen, setIsWarningDialogOpen] = useState(false);
  const warningCount = useRef(0);

  // Initialize WebSocket
  useEffect(() => {
    if (!enabled || !userId || !sessionId) return;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:5001");
    const newSocket = io(wsUrl, {
      path: "/socket.io",
      auth: (callback) => {
        const token = localStorage.getItem("codeskill_token");
        callback({ token: token ? `Bearer ${token}` : undefined });
      },
      withCredentials: true,
    });

    newSocket.on("connect", () => {
      newSocket.emit("join_contest", { contestId, userId, sessionId });
    });

    newSocket.on("force_submit", () => {
      onAutoSubmit();
    });


    return () => {
      newSocket.disconnect();
    };
  }, [contestId, userId, sessionId, onAutoSubmit, enabled]);

  // Central Violation Handler
  const handleViolation = useCallback(
    async (type: string, metadata: Record<string, unknown> = {}) => {
      if (!enabled) return;
      const newWarnings = warningCount.current + 1;
      warningCount.current = newWarnings;
      setWarnings(newWarnings);
      const isLocked = config.autoSubmitOnViolation !== false && newWarnings >= config.warningLimit;
      if (isLocked) onAutoSubmit();
      else { setLastViolation(type); setIsWarningDialogOpen(true); }

      try {
        const res = await api.post(`/contests/${encodeURIComponent(contestId)}/violations`, {
          sessionId,
          type,
          metadata,
        });

        // Backend may override warnings if we choose to sync
        if (res.data?.success) {
          if (typeof res.data.warnings === "number") { warningCount.current = Math.max(warningCount.current, res.data.warnings); setWarnings(warningCount.current); }
          if (res.data.forceSubmit) {
            onAutoSubmit();
          }
        }
      } catch (err) {
        // Backend not ready or offline, but local state already caught the cheat.
        logger.warn(
          "Failed to report violation to backend, using local state",
          {
            contestId,
            sessionId,
            type,
            error: err instanceof Error ? err.message : String(err),
          },
          "useAntiCheatMaster"
        );
      }
    },
    [contestId, sessionId, config.warningLimit, config.autoSubmitOnViolation, onAutoSubmit, enabled]
  );

  // Initialize individual hooks
  const { isFullscreen, requestFullscreen, hasRequested } = useFullscreen({
    enabled: enabled && config.enableFullscreen,
    onViolation: () => handleViolation("Fullscreen_Exit"),
  });

  useTabVisibility({
    enabled: enabled && config.enableTabSwitchDetect,
    onViolation: handleViolation,
  });

  useKeyboardBlocker({
    enabled, // Only during an active contest
    onViolation: handleViolation,
  });

  useCopyPasteProtect({
    enableCopyProtect: enabled && config.enableCopyProtect,
    enablePasteProtect: enabled && config.enablePasteProtect,
    onViolation: handleViolation,
  });

  useDevToolsDetect({
    enabled: enabled && config.enableDevToolsDetect,
    onViolation: handleViolation,
  });

  return {
    warnings,
    warningLimit: config.warningLimit,
    lastViolation,
    isWarningDialogOpen,
    setIsWarningDialogOpen,
    isFullscreen,
    requestFullscreen,
    hasRequestedFullscreen: hasRequested,
  };
}
