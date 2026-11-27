"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wifi,
  WifiOff,
  Battery,
  BatteryCharging,
  BatteryWarning,
  Volume2,
  Volume1,
  VolumeX,
  Calculator,
  FileText,
  RotateCcw,
  Power,
  Pin,
  PinOff,
  Lock,
  Clock,
  RefreshCw,
  X,
  Check,
  Loader2,
  BookOpen,
  ShieldCheck,
  AlertTriangle,
  GripVertical,
  Minimize2,
  Maximize2,
  Zap,
  Terminal,
  Settings,
} from "lucide-react";
import api from "@/config/api";
import dynamic from "next/dynamic";

const ScientificCalculatorModal = dynamic(
  () => import("./ScientificCalculatorModal"),
  { ssr: false }
);

const PdfReferenceViewerModal = dynamic(
  () => import("./PdfReferenceViewerModal"),
  { ssr: false }
);
import {
  getBatteryStatus,
  getSystemVolume,
  setSystemVolume,
  getKeyboardLayout,
  getSyncedTimestampMs,
  scanWifiNetworks,
  connectWifiNetwork,
  verifyQuitPassword,
  releaseLockdownKiosk,
  getLockdownDiagnosticLogs,
  logoutAndExitLockdown,
  BatteryInfo,
  WifiNetworkInfo,
  DiagnosticLogEntry,
} from "@/lib/lockdown-bridge";
import { offlineAutosaveQueue, SyncStatus } from "@/lib/offline-autosave-queue";
import { toast } from "react-hot-toast";

interface LockdownUtilityDockProps {
  assessmentId?: string;
  sessionId?: string;
  allowCalculators?: boolean;
  allowScratchpad?: boolean;
  allowReferenceDoc?: boolean;
  referencePdfUrl?: string;
  isSubmitted?: boolean;
  onSafeReload?: () => Promise<void> | void;
  onProctorTerminated?: (reason: string) => void;
  onTimerSync?: (serverEndsAtEpochMs: number, serverNowMs?: number) => void;
  bottomInset?: number;
  showSyncStatus?: boolean;
}

export default function LockdownUtilityDock({
  assessmentId,
  sessionId,
  allowCalculators = true,
  allowScratchpad = true,
  allowReferenceDoc,
  referencePdfUrl,
  isSubmitted = false,
  onSafeReload,
  onProctorTerminated,
  onTimerSync,
  bottomInset,
  showSyncStatus = true,
}: LockdownUtilityDockProps) {
  const isRefDocAllowed = allowReferenceDoc !== undefined ? allowReferenceDoc : Boolean(referencePdfUrl);
  // Dock DOM reference
  const dockRef = useRef<HTMLDivElement>(null);

  // Position & drag state (default anchor: bottom-left)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    moved: boolean;
  } | null>(null);
  const suppressDragClickRef = useRef(false);

  // Dock collapse & pin state
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // System telemetry state
  const [battery, setBattery] = useState<BatteryInfo>({
    percentage: 100,
    is_charging: true,
    has_battery: false,
  });
  const [volume, setVolume] = useState<number>(50);
  const [volumeError, setVolumeError] = useState<string | null>(null);
  const [keyboardLayout, setKeyboardLayout] = useState<string>("EN-US");
  const [syncedTimeStr, setSyncedTimeStr] = useState<string>("");

  // Autosave queue live status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("synced");
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isReloading, setIsReloading] = useState<boolean>(false);

  // WCAG Text Zoom Controls
  const ZOOM_LEVELS = [85, 100, 115, 130, 150];
  const [zoomIndex, setZoomIndex] = useState<number>(1);
  const currentZoom = ZOOM_LEVELS[zoomIndex];

  const handleZoomIn = () => {
    if (zoomIndex < ZOOM_LEVELS.length - 1) {
      const nextIndex = zoomIndex + 1;
      setZoomIndex(nextIndex);
      if (typeof document !== "undefined") {
        (document.documentElement.style as any).zoom = `${ZOOM_LEVELS[nextIndex]}%`;
      }
    }
  };

  const handleZoomOut = () => {
    if (zoomIndex > 0) {
      const nextIndex = zoomIndex - 1;
      setZoomIndex(nextIndex);
      if (typeof document !== "undefined") {
        (document.documentElement.style as any).zoom = `${ZOOM_LEVELS[nextIndex]}%`;
      }
    }
  };

  const handleZoomReset = () => {
    const resetIndex = ZOOM_LEVELS.indexOf(100);
    setZoomIndex(resetIndex);
    if (typeof document !== "undefined") {
      (document.documentElement.style as any).zoom = "100%";
    }
  };

  // Diagnostic Logs state in Proctor Quit modal
  const [showDiagnosticLog, setShowDiagnosticLog] = useState<boolean>(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);

  // Proctor Force-Quit & Termination Countdown
  const [proctorTerminatedReason, setProctorTerminatedReason] = useState<string | null>(null);
  const [terminationCountdown, setTerminationCountdown] = useState<number>(3);
  const [submissionExitCountdown, setSubmissionExitCountdown] = useState<number | null>(null);

  // Active Tool Modal
  const [activeModal, setActiveModal] = useState<
    "calculator" | "scratchpad" | "pdf" | "wifi" | "quit" | null
  >(null);

  // Wi-Fi switcher state
  const [wifiNetworks, setWifiNetworks] = useState<WifiNetworkInfo[]>([]);
  const [isScanningWifi, setIsScanningWifi] = useState<boolean>(false);
  const [wifiScanError, setWifiScanError] = useState<string | null>(null);
  const [selectedSsid, setSelectedSsid] = useState<string>("");
  const [wifiPassword, setWifiPassword] = useState<string>("");
  const [isConnectingWifi, setIsConnectingWifi] = useState<boolean>(false);

  // Proctor quit state
  const [quitPassword, setQuitPassword] = useState<string>("");
  const [isVerifyingQuit, setIsVerifyingQuit] = useState<boolean>(false);
  const [quitError, setQuitError] = useState<string | null>(null);

  // Scratchpad content
  const [scratchpadText, setScratchpadText] = useState<string>("");

  // Scientific Calculator state
  const [calcDisplay, setCalcDisplay] = useState<string>("0");
  const [calcHistory, setCalcHistory] = useState<string>("");

  // Volume slider popover
  const [showVolumeSlider, setShowVolumeSlider] = useState<boolean>(false);
  const volumeDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // ---------------------------------------------------------------------------
  // 1. Viewport Initialization & Drag-to-Move
  // ---------------------------------------------------------------------------

  // Anchor to bottom-left on mount (x: 16px, y: window.innerHeight - dockH - 16px)
  useEffect(() => {
    if (typeof window === "undefined" || bottomInset !== undefined) return;
    const dockH = dockRef.current?.offsetHeight || 48;
    const initialY = Math.max(16, window.innerHeight - dockH - 16);
    setPosition({ x: 16, y: initialY });
  }, [bottomInset]);

  // Re-clamp position within viewport on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        if (!prev) return null;
        const dockW = dockRef.current?.offsetWidth || 300;
        const dockH = dockRef.current?.offsetHeight || 48;
        const minX = 12;
        const maxX = Math.max(minX, window.innerWidth - dockW - 12);
        const minY = 12;
        const maxY = Math.max(minY, window.innerHeight - dockH - 12);
        return {
          x: Math.max(minX, Math.min(prev.x, maxX)),
          y: Math.max(minY, Math.min(prev.y, maxY)),
        };
      });
    };
    const dock = dockRef.current;
    const observer = bottomInset !== undefined && dock && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(handleResize)
      : null;
    if (dock) observer?.observe(dock);
    window.addEventListener("resize", handleResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [bottomInset]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragStateRef.current || !(event.target instanceof Element)) return;
    if (event.target.closest("[data-dock-popover]")) return;

    suppressDragClickRef.current = false;
    // Capture on the original target so a tap can still activate a tool button.
    try {
      event.target.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer events within the bar still work if WebKit declines capture.
    }
    const bounds = dockRef.current?.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialX: position?.x ?? bounds?.left ?? 16,
      initialY: position?.y ?? bounds?.top ?? window.innerHeight - 64,
      moved: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      setIsDragging(true);
    }

    const dockW = dockRef.current?.offsetWidth || 300;
    const dockH = dockRef.current?.offsetHeight || 48;
    setPosition({
      x: Math.max(12, Math.min(drag.initialX + dx, window.innerWidth - dockW - 12)),
      y: Math.max(12, Math.min(drag.initialY + dy, window.innerHeight - dockH - 12)),
    });
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    suppressDragClickRef.current = drag.moved && event.type === "pointerup";
    dragStateRef.current = null;
    if (drag.moved) setIsDragging(false);
  };

  const handleDockClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressDragClickRef.current || event.detail === 0) return;
    suppressDragClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  // Reset to default bottom-left anchor
  const handleResetPosition = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const dockH = dockRef.current?.offsetHeight || 48;
    setPosition(bottomInset === undefined ? { x: 16, y: Math.max(16, window.innerHeight - dockH - 16) } : null);
    toast.success("Dock anchored to bottom-left", { duration: 1500 });
  };

  // Compute smart popover direction based on dock quadrant
  const isUpperHalf = position ? position.y < window.innerHeight / 2 : false;
  const isLeftHalf = position ? position.x < window.innerWidth / 2 : true;
  const popoverPositionClass = `${isUpperHalf ? "top-full mt-2" : "bottom-full mb-2"} ${
    isLeftHalf ? "left-0" : "right-0"
  }`;

  // ---------------------------------------------------------------------------
  // 2. Inactivity Auto-Collapse & Hover Management
  // ---------------------------------------------------------------------------

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    // Pause auto-collapse if dock is pinned, modal is open, volume slider is active, or dragging
    if (!isPinned && activeModal === null && !showVolumeSlider && !isDragging) {
      inactivityTimerRef.current = setTimeout(() => {
        setIsExpanded(false);
        setShowVolumeSlider(false);
      }, 4000);
    }
  }, [isPinned, activeModal, showVolumeSlider, isDragging]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    resetInactivityTimer();
  };

  const handleMouseMove = () => {
    resetInactivityTimer();
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (!isPinned && activeModal === null && !showVolumeSlider && !isDragging) {
      setIsExpanded(false);
      setShowVolumeSlider(false);
    }
  };

  // Re-evaluate inactivity timer whenever state changes
  useEffect(() => {
    resetInactivityTimer();
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [resetInactivityTimer]);

  // ---------------------------------------------------------------------------
  // 3. System Telemetry & Background Synchronization
  // ---------------------------------------------------------------------------

  // Subscribe to offline autosave status when this dock displays it.
  useEffect(() => {
    if (!showSyncStatus) return;
    const unsub = offlineAutosaveQueue.onStatusChange((status, count) => {
      setSyncStatus(status);
      setPendingSyncCount(count);
    });
    return () => unsub();
  }, [showSyncStatus]);

  // Poll system telemetry periodically (every 5 seconds)
  useEffect(() => {
    let active = true;

    const updateTelemetry = async () => {
      try {
        const [bat, vol, layout, timeMs] = await Promise.all([
          getBatteryStatus().catch(() => ({
            percentage: 100,
            is_charging: true,
            has_battery: false,
          })),
          getSystemVolume().catch(() => 50),
          getKeyboardLayout().catch(() => "EN-US"),
          getSyncedTimestampMs().catch(() => Date.now()),
        ]);

        if (active) {
          setBattery(bat);
          setVolume(vol);
          setKeyboardLayout(layout || "EN");

          const date = new Date(timeMs);
          setSyncedTimeStr(
            date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          );
        }
      } catch {
        // ignore telemetry polling error
      }
    };

    void updateTelemetry();
    const interval = setInterval(updateTelemetry, 5000);

    // Fast clock ticker (every second)
    const clockInterval = setInterval(async () => {
      try {
        const timeMs = await getSyncedTimestampMs();
        if (active) {
          const date = new Date(timeMs);
          setSyncedTimeStr(
            date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          );
        }
      } catch {
        if (active) {
          setSyncedTimeStr(
            new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          );
        }
      }
    }, 1000);

    return () => {
      active = false;
      clearInterval(interval);
      clearInterval(clockInterval);
    };
  }, []);

  // Heartbeat polling to check session vitality and proctor remote force-quit (jittered 24s-36s)
  const onTimerSyncRef = useRef(onTimerSync);
  onTimerSyncRef.current = onTimerSync;
  const onProctorTerminatedRef = useRef(onProctorTerminated);
  onProctorTerminatedRef.current = onProctorTerminated;

  useEffect(() => {
    if (!sessionId || isSubmitted) return;
    let timer: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const sendHeartbeat = async () => {
      try {
        const res = await api.post(`/exam-security/session/${sessionId}/heartbeat`);
        if (res.data?.serverEndsAtEpochMs && onTimerSyncRef.current) {
          onTimerSyncRef.current(res.data.serverEndsAtEpochMs, res.data.serverNowMs);
        }
        if (res.data?.forceQuitReason || res.data?.status === "TERMINATED") {
          const reason = res.data?.forceQuitReason || "Proctor remotely terminated this exam session.";
          setProctorTerminatedReason(reason);
          if (onProctorTerminatedRef.current) {
            onProctorTerminatedRef.current(reason);
          }
        }
      } catch (err: any) {
        if (err?.response?.data?.message?.includes("ended") || err?.response?.status === 403) {
          // Proctor may have ended the session
        }
      }
    };

    const scheduleNextHeartbeat = () => {
      // Add ±20% jitter (24s–36s) to heartbeats to prevent thundering-herd spikes
      const jitteredIntervalMs = 24000 + Math.random() * 12000;
      timer = setTimeout(async () => {
        if (isCancelled) return;
        await sendHeartbeat();
        if (!isCancelled && !isSubmitted) {
          scheduleNextHeartbeat();
        }
      }, jitteredIntervalMs);
    };

    scheduleNextHeartbeat();
    return () => {
      isCancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, isSubmitted]);

  // Proctor Termination Countdown (3 seconds -> logoutAndExitLockdown)
  useEffect(() => {
    if (!proctorTerminatedReason) return;
    setTerminationCountdown(3);
    const interval = setInterval(() => {
      setTerminationCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          void logoutAndExitLockdown();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [proctorTerminatedReason]);

  // Post-submission 3-second auto-exit countdown
  useEffect(() => {
    if (!isSubmitted) return;
    setSubmissionExitCountdown(3);
    const interval = setInterval(() => {
      setSubmissionExitCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          void logoutAndExitLockdown();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isSubmitted]);

  // Restore scratchpad from sessionStorage
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const key = assessmentId ? `codeskill_scratchpad_${assessmentId}` : "codeskill_scratchpad_standalone";
        const stored = sessionStorage.getItem(key);
        if (stored) setScratchpadText(stored);
      }
    } catch {
      // ignore
    }
  }, [assessmentId]);

  const handleScratchpadChange = (text: string) => {
    setScratchpadText(text);
    try {
      if (typeof window !== "undefined") {
        const key = assessmentId ? `codeskill_scratchpad_${assessmentId}` : "codeskill_scratchpad_standalone";
        sessionStorage.setItem(key, text);
      }
    } catch {
      // ignore
    }
  };

  // ---------------------------------------------------------------------------
  // 4. Actions: Volume, Wi-Fi, Reload & Proctor Quit
  // ---------------------------------------------------------------------------

  // Handle master volume change with debounced IPC dispatch
  const handleVolumeChange = (newVal: number) => {
    const clamped = Math.max(0, Math.min(100, newVal));
    setVolume(clamped);
    setVolumeError(null);

    if (volumeDebounceRef.current) {
      clearTimeout(volumeDebounceRef.current);
    }

    volumeDebounceRef.current = setTimeout(async () => {
      try {
        await setSystemVolume(clamped);
      } catch (err: any) {
        setVolumeError(err?.message || "Failed to set volume");
      }
    }, 150);
  };

  // Safe Reload handler: flush autosave queue first, then reload
  const handleSafeReload = async () => {
    setIsReloading(true);
    const toastId = toast.loading("Syncing responses before reloading exam...");
    try {
      await offlineAutosaveQueue.forceSyncNow(api);
      if (onSafeReload) {
        await onSafeReload();
      }
      toast.success("All responses saved. Reloading...", { id: toastId });
      setTimeout(() => {
        window.location.reload();
      }, 300);
    } catch (err: any) {
      console.warn("Autosave sync prior to reload encountered error:", err);
      toast.error("Could not sync all answers. Reloading from local vault...", { id: toastId });
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } finally {
      setIsReloading(false);
    }
  };

  // Wi-Fi Scanning
  const handleScanWifi = async () => {
    setIsScanningWifi(true);
    setWifiScanError(null);
    try {
      const networks = await scanWifiNetworks();
      setWifiNetworks(networks);
    } catch (err: any) {
      setWifiScanError(err?.message || "Failed to scan nearby Wi-Fi networks");
    } finally {
      setIsScanningWifi(false);
    }
  };

  // Wi-Fi Connection
  const handleConnectWifi = async () => {
    const targetSsid = selectedSsid.trim();
    if (!targetSsid) {
      toast.error("Please enter or select a Wi-Fi SSID");
      return;
    }
    setIsConnectingWifi(true);
    const toastId = toast.loading(`Connecting to ${targetSsid}...`);
    try {
      await connectWifiNetwork(targetSsid, wifiPassword || undefined);
      toast.success(`Connected to ${targetSsid}`, { id: toastId });
      setSelectedSsid("");
      setWifiPassword("");
      setActiveModal(null);
      // Trigger background sync now that connection is established
      void offlineAutosaveQueue.forceSyncNow(api);
    } catch (err: any) {
      toast.error(err?.message || `Failed to connect to ${targetSsid}`, { id: toastId });
    } finally {
      setIsConnectingWifi(false);
    }
  };

  // Proctor / App Quit Verification
  const handleVerifyQuit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifyingQuit(true);
    setQuitError(null);
    try {
      if (assessmentId) {
        const res = await verifyQuitPassword(api, assessmentId, quitPassword);
        if (res.authorized) {
          toast.success("Proctor authorization verified. Releasing LockDown kiosk...");
          await releaseLockdownKiosk();
          setActiveModal(null);
          window.location.href = `/assessments/${assessmentId}/result`;
        } else {
          setQuitError("Incorrect proctor quit password");
        }
      } else {
        toast.success("Exiting CodeSkill LockDown...");
        await logoutAndExitLockdown();
      }
    } catch (err: any) {
      setQuitError(err?.message || "Invalid proctor quit password");
    } finally {
      setIsVerifyingQuit(false);
    }
  };

  // Scientific Calculator Evaluation
  const handleCalcButton = (val: string) => {
    if (val === "C") {
      setCalcDisplay("0");
      setCalcHistory("");
    } else if (val === "CE") {
      setCalcDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
    } else if (val === "=") {
      try {
        const sanitized = calcDisplay
          .replace(/×/g, "*")
          .replace(/÷/g, "/")
          .replace(/π/g, "Math.PI")
          .replace(/e/g, "Math.E")
          .replace(/sin\(/g, "Math.sin(")
          .replace(/cos\(/g, "Math.cos(")
          .replace(/tan\(/g, "Math.tan(")
          .replace(/sqrt\(/g, "Math.sqrt(")
          .replace(/log\(/g, "Math.log10(")
          .replace(/ln\(/g, "Math.log(");
        // Safe evaluation with math tokens only
        if (/[^0-9+\-*/().MathPIEsincoztanlgrq\s]/.test(sanitized)) {
          throw new Error("Invalid input");
        }
        const fn = new Function(`return (${sanitized});`);
        const result = fn();
        setCalcHistory(calcDisplay + " =");
        setCalcDisplay(String(Number(result.toFixed(8))));
      } catch {
        setCalcDisplay("Error");
      }
    } else {
      setCalcDisplay((prev) => (prev === "0" || prev === "Error" ? val : prev + val));
    }
  };

  // ---------------------------------------------------------------------------
  // 5. Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* =========================================================================
          Floating Utility Dock (Bottom-Left Default, Drag-to-Move & Expandable)
      ========================================================================= */}
      <aside
        ref={dockRef}
        aria-label="CodeSkill LockDown Security Utility Dock"
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        data-lockdown-utility-dock="true"
        style={
          position
            ? { left: `${position.x}px`, top: `${position.y}px` }
            : { left: "16px", bottom: bottomInset ?? 16 }
        }
        className="fixed z-50 select-none font-sans touch-none"
      >
        <motion.div
          layout={bottomInset === undefined}
          initial={bottomInset === undefined ? { opacity: 0, scale: 0.95 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15 }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={handlePointerEnd}
          onLostPointerCapture={handlePointerEnd}
          onClickCapture={handleDockClickCapture}
          className={`relative flex cursor-grab items-center active:cursor-grabbing bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md border border-slate-700/70 shadow-2xl rounded-full text-xs text-slate-200 transition-shadow ${
            isDragging ? "ring-2 ring-sky-500/50 shadow-sky-950/50" : ""
          } ${isExpanded ? "px-2.5 py-1.5 gap-2" : "px-2 py-1 gap-1.5"}`}
        >
          {/* Dedicated Grip / Drag Handle */}
          <div
            role="button"
            aria-label="Drag utility dock"
            onDoubleClick={handleResetPosition}
            className="flex items-center justify-center p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 cursor-grab active:cursor-grabbing transition-colors"
            title="Drag to reposition • Double-click to snap to bottom-left"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>

          {/* Shield LockDown Active Badge */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-[11px]"
            title="CodeSkill LockDown Native Kiosk Active"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">LockDown</span>
          </div>

          {/* Wi-Fi Status Button */}
          <button
            type="button"
            onClick={() => {
              setActiveModal("wifi");
              void handleScanWifi();
            }}
            className="flex items-center gap-1 p-1 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Wi-Fi Connection & In-Dock Reconnect"
          >
            <Wifi className="w-3.5 h-3.5 text-sky-400" />
          </button>

          {/* Offline Autosave Live Indicator (Only shown during active assessment) */}
          {showSyncStatus && Boolean(assessmentId) && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]"
              title={
                syncStatus === "synced"
                  ? "All answers securely synced to server"
                  : syncStatus === "syncing"
                  ? "Syncing answers to server..."
                  : "Answers are stored on this device while CodeSkill retries syncing."
              }
            >
              {syncStatus === "synced" && (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="hidden md:inline">Saved</span>
                </span>
              )}
              {syncStatus === "syncing" && (
                <span className="flex items-center gap-1 text-sky-400 font-medium">
                  <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                  <span className="hidden md:inline">Syncing</span>
                </span>
              )}
              {syncStatus === "offline-buffered" && (
                <span className="flex items-center gap-1 text-amber-400 font-medium animate-pulse">
                  <WifiOff className="w-3 h-3 text-amber-400" />
                  <span>Pending sync ({pendingSyncCount})</span>
                </span>
              )}
              {syncStatus === "error" && (
                <span className="flex items-center gap-1 text-rose-400 font-medium">
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  <span>Error ({pendingSyncCount})</span>
                </span>
              )}
            </div>
          )}

          {/* Battery Status or AC Power */}
          {battery.has_battery ? (
            <div
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${
                battery.percentage <= 15
                  ? `text-rose-400 ${bottomInset === undefined ? "animate-pulse" : ""}`
                  : battery.percentage <= 30
                  ? "text-amber-400"
                  : "text-slate-300"
              }`}
              title={`Battery: ${battery.percentage}% ${
                battery.is_charging ? "(Charging)" : ""
              }`}
            >
              {battery.is_charging ? (
                <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
              ) : battery.percentage <= 15 ? (
                <BatteryWarning className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Battery className="w-3.5 h-3.5" />
              )}
              <span>{battery.percentage}%</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-slate-300"
              title="Connected to AC Power (Desktop / No Battery)"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">AC Power</span>
            </div>
          )}

          {/* Server-Synced Clock */}
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 text-slate-300 font-mono text-[11px]"
            title="Authoritative Server-Synced Time"
          >
            <Clock className="w-3 h-3 text-slate-400" />
            <span>{syncedTimeStr || "--:--"}</span>
          </div>

          {/* ===================================================================
              Collapsed State: Expand Toggle Button
          =================================================================== */}
          {!isExpanded && (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Expand utility dock controls"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* ===================================================================
              Expanded Tools & Control Group
          =================================================================== */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5 pl-2 border-l border-slate-700/60 overflow-visible"
              >
                {/* Keyboard Layout Badge */}
                <div
                  className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono uppercase"
                  title={`Active Keyboard Layout: ${keyboardLayout}`}
                >
                  {(keyboardLayout || "EN").slice(0, 5)}
                </div>

                {/* Master Volume Control */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowVolumeSlider((v) => !v)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title={`Master Volume: ${volume}%`}
                  >
                    {volume === 0 ? (
                      <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                    ) : volume < 50 ? (
                      <Volume1 className="w-3.5 h-3.5 text-sky-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                    )}
                  </button>

                  {/* Volume Slider Popover (Direction-aware) */}
                  {showVolumeSlider && (
                    <div
                      data-dock-popover
                      className={`absolute ${popoverPositionClass} bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl flex flex-col gap-1.5 w-48 z-50`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-300">
                        <span>Volume</span>
                        <span className="font-mono text-sky-400">{volume}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={volume}
                          onChange={(e) => handleVolumeChange(Number(e.target.value))}
                          className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400"
                        />
                      </div>
                      {volumeError && (
                        <p className="text-[10px] text-rose-400">{volumeError}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* In-App Tool Switcher: Calculator */}
                {allowCalculators && (
                  <button
                    type="button"
                    onClick={() => setActiveModal("calculator")}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="In-App Scientific Calculator"
                  >
                    <Calculator className="w-3.5 h-3.5 text-amber-400" />
                  </button>
                )}

                {/* In-App Tool Switcher: Scratchpad */}
                {allowScratchpad !== false && (
                  <button
                    type="button"
                    onClick={() => setActiveModal("scratchpad")}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="In-App Rough Scratchpad"
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  </button>
                )}

                {/* In-App Tool Switcher: Reference PDF */}
                {isRefDocAllowed && referencePdfUrl && (
                  <button
                    type="button"
                    onClick={() => setActiveModal("pdf")}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Approved Reference Material"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                  </button>
                )}

                {/* Safe Reload Button */}
                <button
                  type="button"
                  onClick={handleSafeReload}
                  disabled={isReloading}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                  title="Safe Reload: Flushes offline queue first, then reloads webview"
                >
                  <RotateCcw
                    className={`w-3.5 h-3.5 text-teal-400 ${
                      isReloading ? "animate-spin" : ""
                    }`}
                  />
                </button>

                {/* WCAG Text Zoom Controls (A- / 100% / A+) */}
                <div className="flex items-center gap-0.5 px-1 py-0.5 rounded-lg bg-slate-800/80 border border-slate-700/60" title="WCAG Text Size Zoom">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    disabled={zoomIndex === 0}
                    className="px-1 py-0.5 rounded text-[11px] font-bold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-30 cursor-pointer"
                    title="Zoom out (A-)"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomReset}
                    className="px-1 py-0.5 rounded text-[10px] font-mono text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                    title="Reset text zoom to 100%"
                  >
                    {currentZoom}%
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                    className="px-1 py-0.5 rounded text-[11px] font-bold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-30 cursor-pointer"
                    title="Zoom in (A+)"
                  >
                    A+
                  </button>
                </div>

                {/* Pin / Auto-Hide Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !isPinned;
                    setIsPinned(next);
                    if (!next) resetInactivityTimer();
                  }}
                  className={`p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer ${
                    isPinned
                      ? "text-sky-400 bg-slate-800/80"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title={
                    isPinned
                      ? "Pinned open: Click to enable auto-collapse"
                      : "Auto-collapsing: Click to pin dock open"
                  }
                >
                  {isPinned ? (
                    <PinOff className="w-3.5 h-3.5" />
                  ) : (
                    <Pin className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* Re-verify OS Permissions (available when exam submitted / not in active locked exam) */}
                {(isSubmitted || !assessmentId) && (
                  <a
                    href="/lockdown-startup-permissions"
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
                    title="Re-verify OS Permissions"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </a>
                )}

                {/* Explicit Collapse Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsExpanded(false);
                    setShowVolumeSlider(false);
                  }}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Collapse utility dock"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>

                {/* Proctor / App Quit Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (isSubmitted && assessmentId) {
                      void releaseLockdownKiosk();
                      window.location.href = `/assessments/${assessmentId}/result`;
                    } else {
                      setActiveModal("quit");
                    }
                  }}
                  className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 hover:text-rose-300 border border-rose-500/30 transition-colors cursor-pointer ml-1"
                  title={assessmentId ? "Proctor Quit: Exit LockDown Kiosk" : "Exit CodeSkill LockDown"}
                >
                  <Power className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </aside>

      {/* =========================================================================
          Modal 1: In-App Scientific Calculator (Dynamically Loaded)
      ========================================================================= */}
      <ScientificCalculatorModal
        isOpen={activeModal === "calculator"}
        onClose={() => setActiveModal(null)}
      />

      {/* =========================================================================
          Modal 2: In-App Rough Scratchpad (z-[70])
      ========================================================================= */}
      <AnimatePresence>
        {activeModal === "scratchpad" && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl w-full max-w-xl text-slate-100 flex flex-col h-[520px]"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h3 className="font-semibold text-sm">Exam Rough Scratchpad</h3>
                    <p className="text-[11px] text-slate-400">
                      Private rough workspace. Auto-saved locally during this assessment session.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <textarea
                value={scratchpadText}
                onChange={(e) => handleScratchpadChange(e.target.value)}
                placeholder="Use this scratchpad for notes, code snippets, calculations, or logic planning..."
                className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 leading-relaxed resize-none focus:outline-hidden focus:border-indigo-500"
              />

              <div className="flex items-center justify-between pt-3 mt-1 text-xs text-slate-400">
                <span>{scratchpadText.length} characters</span>
                <button
                  type="button"
                  onClick={() => handleScratchpadChange("")}
                  className="text-rose-400 hover:text-rose-300 text-[11px]"
                >
                  Clear Scratchpad
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================================
          Modal 3: Approved Reference Material PDF Viewer (Dynamically Loaded)
      ========================================================================= */}
      <PdfReferenceViewerModal
        isOpen={activeModal === "pdf"}
        onClose={() => setActiveModal(null)}
        referencePdfUrl={referencePdfUrl}
      />

      {/* =========================================================================
          Modal 4: Wi-Fi Scanner & In-Dock Reconnection Popover (z-[70])
      ========================================================================= */}
      <AnimatePresence>
        {activeModal === "wifi" && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl w-full max-w-md text-slate-100"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                <div className="flex items-center gap-2">
                  <Wifi className="w-5 h-5 text-sky-400" />
                  <div>
                    <h3 className="font-semibold text-sm">Wi-Fi Connection</h3>
                    <p className="text-[11px] text-slate-400">
                      Switch to mobile hotspot or backup network without leaving exam kiosk.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    setSelectedSsid("");
                    setWifiPassword("");
                    setWifiScanError(null);
                  }}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scan Trigger & Status */}
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="text-slate-400">Nearby Networks</span>
                <button
                  type="button"
                  onClick={handleScanWifi}
                  disabled={isScanningWifi}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isScanningWifi ? "animate-spin" : ""}`}
                  />
                  <span>Refresh Scan</span>
                </button>
              </div>

              {wifiScanError && (
                <div className="mb-3 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center justify-between">
                  <span>{wifiScanError}</span>
                  <button
                    type="button"
                    onClick={handleScanWifi}
                    className="underline hover:text-rose-200 ml-2"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Network List */}
              <div className="max-h-48 overflow-y-auto space-y-1.5 mb-4 pr-1">
                {wifiNetworks.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 bg-slate-950/50 rounded-xl border border-slate-800/60">
                    {isScanningWifi ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                        Scanning for Wi-Fi networks...
                      </span>
                    ) : (
                      "No broadcasting networks visible. You can enter your SSID or mobile hotspot below."
                    )}
                  </div>
                ) : (
                  wifiNetworks.map((net) => (
                    <div
                      key={net.ssid}
                      onClick={() => setSelectedSsid(net.ssid)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                        selectedSsid === net.ssid
                          ? "bg-sky-500/15 border-sky-500/40 text-white"
                          : net.is_connected
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                          : "bg-slate-950/40 border-slate-800 hover:bg-slate-800 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Wifi className="w-4 h-4 text-sky-400" />
                        <div>
                          <div className="font-medium">{net.ssid}</div>
                          {net.is_connected && (
                            <span className="text-[10px] text-emerald-400 font-semibold">
                              Connected
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-slate-400">
                        {net.is_secured && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                        <span className="font-mono text-[11px]">{net.signal_strength}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Manual SSID / Hotspot Reconnection Form */}
              <div className="pt-3 border-t border-slate-800 space-y-2.5">
                <div className="text-xs text-slate-300 font-medium">
                  Connect to Network or Mobile Hotspot:
                </div>
                <input
                  type="text"
                  value={selectedSsid}
                  onChange={(e) => setSelectedSsid(e.target.value)}
                  placeholder="Network SSID or Mobile Hotspot Name..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500"
                />
                <input
                  type="password"
                  value={wifiPassword}
                  onChange={(e) => setWifiPassword(e.target.value)}
                  placeholder="Wi-Fi Password (leave empty if open)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSsid("");
                      setWifiPassword("");
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleConnectWifi}
                    disabled={isConnectingWifi || !selectedSsid.trim()}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {isConnectingWifi ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : null}
                    <span>Connect</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================================
          Modal 5: Proctor Quit Password Gate (z-[70])
      ========================================================================= */}
      <AnimatePresence>
        {activeModal === "quit" && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl w-full max-w-sm text-slate-100"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    {assessmentId ? "Proctor Quit Request" : "Exit CodeSkill LockDown"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {assessmentId
                      ? "Early exit requires proctor authorization."
                      : "Close the secure examination browser."}
                  </p>
                </div>
              </div>

              <form onSubmit={handleVerifyQuit} className="space-y-4">
                {assessmentId ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Proctor Quit Password
                    </label>
                    <input
                      type="password"
                      value={quitPassword}
                      onChange={(e) => {
                        setQuitPassword(e.target.value);
                        setQuitError(null);
                      }}
                      placeholder="Enter password to release kiosk..."
                      autoFocus
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-rose-500"
                    />
                    {quitError && (
                      <p className="mt-1.5 text-xs text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{quitError}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Are you sure you want to exit CodeSkill LockDown? All system kiosk restrictions will be safely restored to normal.
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal(null);
                      setQuitPassword("");
                      setQuitError(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifyingQuit}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {isVerifyingQuit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>{assessmentId ? "Authorize Quit" : "Exit LockDown"}</span>
                  </button>
                </div>

                {/* Collapsible Live Diagnostic Log */}
                <div className="pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={async () => {
                      const next = !showDiagnosticLog;
                      setShowDiagnosticLog(next);
                      if (next && diagnosticLogs.length === 0) {
                        setIsLoadingLogs(true);
                        const logs = await getLockdownDiagnosticLogs();
                        setDiagnosticLogs(logs);
                        setIsLoadingLogs(false);
                      }
                    }}
                    className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 transition-colors py-1 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <Terminal className="w-3.5 h-3.5 text-sky-400" />
                      Live Diagnostic Log (Ring Buffer)
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {showDiagnosticLog ? "Hide" : "View (100)"}
                    </span>
                  </button>

                  {showDiagnosticLog && (
                    <div className="mt-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between pb-1 border-b border-slate-900 text-[10px] text-slate-400">
                        <span className="font-mono text-slate-500">EVENT_LOG_RING_BUFFER</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              setIsLoadingLogs(true);
                              const logs = await getLockdownDiagnosticLogs();
                              setDiagnosticLogs(logs);
                              setIsLoadingLogs(false);
                            }}
                            className="text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
                          >
                            Refresh
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const text = diagnosticLogs
                                .map(
                                  (l) =>
                                    `[${l.timestamp}] [${l.level}] [${l.category}] ${l.message}`
                                )
                                .join("\n");
                              navigator.clipboard.writeText(text);
                              toast.success("Diagnostic logs copied to clipboard");
                            }}
                            className="text-slate-400 hover:text-white cursor-pointer"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      <div className="h-40 overflow-y-auto space-y-1 font-mono text-[10px] text-slate-300 scrollbar-thin">
                        {isLoadingLogs ? (
                          <div className="flex items-center justify-center h-20 text-slate-500">
                            <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Loading logs...
                          </div>
                        ) : diagnosticLogs.length === 0 ? (
                          <div className="text-slate-500 text-center py-4">No diagnostic events recorded yet.</div>
                        ) : (
                          diagnosticLogs.map((log, idx) => (
                            <div key={idx} className="leading-tight break-all">
                              <span className="text-slate-500">{log.timestamp.slice(11, 19)}</span>{" "}
                              <span
                                className={
                                  log.level === "ERROR"
                                    ? "text-rose-400 font-bold"
                                    : log.level === "WARN"
                                    ? "text-amber-400"
                                    : "text-sky-400"
                                }
                              >
                                [{log.level}]
                              </span>{" "}
                              <span className="text-indigo-400">[{log.category}]</span>{" "}
                              <span>{log.message}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================================
          Modal 6: Remote Proctor Termination Dialog (z-[100])
      ========================================================================= */}
      <AnimatePresence>
        {proctorTerminatedReason && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-900 border-2 border-rose-500/50 rounded-2xl p-6 shadow-2xl w-full max-w-md text-center space-y-4"
            >
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mx-auto">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Examination Session Terminated</h2>
                <p className="text-xs text-rose-400 mt-1 font-medium">{proctorTerminatedReason}</p>
                <p className="text-xs text-slate-400 mt-2">
                  The proctor has remotely closed your examination attempt. CodeSkill LockDown is logging out and exiting in{" "}
                  <span className="font-mono font-bold text-white">{terminationCountdown}s</span>...
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => void logoutAndExitLockdown()}
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Exit Immediately
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================================
          Modal 7: Post-Submission 3-Second Auto-Exit Overlay (z-[100])
      ========================================================================= */}
      <AnimatePresence>
        {submissionExitCountdown !== null && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 shadow-2xl w-full max-w-sm text-center space-y-4"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                <Check className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Assessment Submitted</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Answers recorded securely. CodeSkill LockDown is logging out and exiting in{" "}
                  <span className="font-mono font-bold text-emerald-400">{submissionExitCountdown}s</span>...
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
