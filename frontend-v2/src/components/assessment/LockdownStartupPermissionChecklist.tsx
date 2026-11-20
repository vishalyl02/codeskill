"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Camera,
  Mic,
  ShieldCheck,
  ShieldAlert,
  Monitor,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Copy,
  Check,
  ArrowRight,
  Settings,
  Terminal,
  LogOut,
  Info,
  Sparkles,
  KeyRound,
} from "lucide-react";
import {
  getStartupPermissionChecklist,
  requestOsPermission,
  openSystemPrivacySettings,
  completePermissionOnboarding,
  logoutAndExitLockdown,
  exitLockdownApp,
  isLockdownClient,
  detectClientPlatform,
  getDefaultStartupPermissionChecklist,
  StartupPermissionChecklistState,
  PermissionChecklistItem,
} from "@/lib/lockdown-bridge";

interface LockdownStartupPermissionChecklistProps {
  onComplete?: () => void;
  targetUrl?: string;
}

export default function LockdownStartupPermissionChecklist({
  onComplete,
  targetUrl,
}: LockdownStartupPermissionChecklistProps) {
  const [checklist, setChecklist] = useState<StartupPermissionChecklistState>(() => getDefaultStartupPermissionChecklist());
  const [loading, setLoading] = useState<boolean>(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [copiedPayloadId, setCopiedPayloadId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());

  const isMountedRef = useRef<boolean>(true);

  const fetchChecklist = useCallback(async (silent = false) => {
    if (!silent) {
      console.log("[Checklist] Checking permissions now...");
      setLoading(true);
    }
    try {
      const state = await getStartupPermissionChecklist();
      console.log("[Checklist] Received checklist state:", state);
      if (isMountedRef.current) {
        setChecklist(state);
        setLastSyncedAt(new Date());
      }
    } catch (err) {
      console.warn("Failed to retrieve startup permission checklist:", err);
      if (isMountedRef.current) {
        setChecklist((prev) => prev || getDefaultStartupPermissionChecklist());
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    setIsClient(isLockdownClient());
    void fetchChecklist(true);

    if (typeof document !== "undefined") {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        isMountedRef.current = false;
        document.body.style.overflow = prevOverflow;
      };
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchChecklist]);

  useEffect(() => {
    // Live background polling every 2000ms to detect external OS toggles in real-time
    const interval = setInterval(() => {
      void fetchChecklist(true);
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [fetchChecklist]);

  const handleRequestPermission = async (item: PermissionChecklistItem) => {
    setRequestingId(item.id);
    console.log("[Checklist] User clicked action for permission:", item.id, item.actionType);
    try {
      if (item.actionType === "open_settings" || item.settingsTarget) {
        await openSystemPrivacySettings(item.settingsTarget || item.id);
      }
      await requestOsPermission(item.id);
      await fetchChecklist(true);
    } catch (err) {
      console.warn(`Error requesting OS permission ${item.id}:`, err);
    } finally {
      if (isMountedRef.current) {
        setRequestingId(null);
      }
    }
  };

  const handleCopyPayload = (id: string, payload: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(payload);
      setCopiedPayloadId(id);
      setTimeout(() => {
        if (isMountedRef.current) setCopiedPayloadId(null);
      }, 2000);
    }
  };

  const handleSaveAndContinue = async () => {
    setSubmitting(true);
    try {
      const res = await completePermissionOnboarding();
      if (onComplete) {
        onComplete();
        return;
      }
      const destination = res?.targetUrl || targetUrl || checklist?.pendingExamUrl;
      if (destination && typeof window !== "undefined") {
        window.location.href = destination;
      } else if (typeof window !== "undefined") {
        if (isLockdownClient()) {
          window.location.href = "/lockdown-system-check";
        } else {
          window.location.href = "/";
        }
      }
    } catch (err) {
      console.error("Failed to complete permission onboarding:", err);
      setSubmitting(false);
    }
  };

  const handleExitApp = async () => {
    console.log("[Checklist] User clicked Exit App");
    try {
      await logoutAndExitLockdown();
    } catch (err) {
      console.warn("Failed to logout and exit CodeSkill LockDown via IPC:", err);
    }
    if (typeof window !== "undefined" && !isLockdownClient()) {
      try {
        window.close();
      } catch {}
      window.location.href = "/login";
    }
  };

  const getPlatformBadge = (platform?: string) => {
    switch (platform) {
      case "macos":
        return {
          label: "macOS Privacy & Security",
          icon: <Sparkles className="w-4 h-4 text-sky-400" />,
          color: "bg-sky-500/10 text-sky-300 border-sky-500/30",
        };
      case "windows":
        return {
          label: "Windows 10 / 11 Security",
          icon: <ShieldCheck className="w-4 h-4 text-blue-400" />,
          color: "bg-blue-500/10 text-blue-300 border-blue-500/30",
        };
      case "linux":
        return {
          label: "Linux Wayland / Portal",
          icon: <Terminal className="w-4 h-4 text-emerald-400" />,
          color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
        };
      default:
        return {
          label: "OS Permissions Suite",
          icon: <ShieldCheck className="w-4 h-4 text-purple-400" />,
          color: "bg-purple-500/10 text-purple-300 border-purple-500/30",
        };
    }
  };

  const getItemIcon = (id: string) => {
    switch (id) {
      case "camera":
        return <Camera className="w-5 h-5 text-indigo-400" />;
      case "microphone":
        return <Mic className="w-5 h-5 text-teal-400" />;
      case "accessibility":
        return <KeyRound className="w-5 h-5 text-amber-400" />;
      case "screen_capture":
      case "display_integrity":
        return <Monitor className="w-5 h-5 text-blue-400" />;
      case "kiosk_desktop":
      case "kiosk_compositor":
        return <Settings className="w-5 h-5 text-violet-400" />;
      case "portal_session":
        return <Terminal className="w-5 h-5 text-emerald-400" />;
      default:
        return <ShieldCheck className="w-5 h-5 text-slate-400" />;
    }
  };

  const currentOs = checklist?.platform || (typeof window !== "undefined" ? detectClientPlatform() : "macos");
  const fallbackChecklist = getDefaultStartupPermissionChecklist(currentOs);
  const effectiveChecklist = checklist || fallbackChecklist;
  const effectiveItems = effectiveChecklist.items;
  const allGranted = effectiveChecklist.allRequiredGranted;
  const platformMeta = getPlatformBadge(effectiveChecklist.platform);

  return (
    <div data-lockdown-checklist="true" className="fixed inset-0 w-screen h-screen max-h-screen overflow-hidden bg-slate-950 text-slate-100 flex items-center justify-center p-3 select-none z-50">
      <div className="max-w-2xl w-full bg-slate-900/95 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-xl relative overflow-hidden flex flex-col max-h-[96vh]">
        {/* Decorative background glow */}
        <div className="absolute -top-32 -right-32 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 relative z-10 border-b border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner shrink-0">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">
                  CodeSkill LockDown
                </h1>
                <button
                  type="button"
                  onClick={() => void openSystemPrivacySettings("camera")}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border cursor-pointer hover:bg-white/5 transition-colors ${platformMeta.color}`}
                  title="Open OS Privacy & Security Settings"
                >
                  {platformMeta.icon}
                  {platformMeta.label}
                </button>
                {loading && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700/60">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin text-primary" />
                    Checking...
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                First-Launch & Startup OS Permissions Checklist
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <button
              onClick={() => void fetchChecklist(false)}
              disabled={loading}
              className="p-1.5 px-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-xs font-medium border border-slate-700/60 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Refresh permissions status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
              <span className="hidden sm:inline">Check Now</span>
            </button>
            <button
              onClick={handleExitApp}
              className="p-1.5 px-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium border border-rose-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Exit CodeSkill LockDown"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>

        {/* Onboarding Notice Box */}
        <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800 mb-3 text-xs text-slate-300 leading-relaxed relative z-10 flex items-start gap-2.5 shrink-0">
          <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-slate-200 mb-0.5">
              Complete this one-time setup so exams launch immediately without repeated permission prompts.
            </p>
            <p className="text-[11px] text-slate-400">
              Kiosk mode is currently disengaged so you can freely switch to OS Settings, toggle permissions, and return.
              Once saved, future launches will verify permissions in &lt; 50ms and bypass this screen completely.
            </p>
          </div>
        </div>

        {/* Permissions Checklist List */}
        <div className="space-y-2 mb-3 relative z-10 overflow-y-auto max-h-[46vh] pr-1 flex-1">
          {effectiveItems.length > 0 ? (
            effectiveItems.map((item) => {
              const isGranted = item.status === "granted";
              const isNeedsAction = item.status === "needs_action";
              const isDenied = item.status === "denied";
              const isWorking = requestingId === item.id;

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border transition-all duration-200 ${
                    isGranted
                      ? "bg-slate-950/40 border-slate-800/80"
                      : isDenied
                      ? "bg-rose-950/10 border-rose-800/40 shadow-sm shadow-rose-950/20"
                      : "bg-amber-950/10 border-amber-800/40 shadow-sm shadow-amber-950/20"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                          isGranted
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            : isDenied
                            ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                            : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                        }`}
                      >
                        {getItemIcon(item.id)}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xs sm:text-sm font-semibold text-white">
                            {item.name}
                          </h2>
                          {item.required && (
                            <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                              Required
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          {item.description}
                        </p>

                        {/* Copyable Shell Helper (e.g. Linux video group) */}
                        {item.actionPayload && !isGranted && (
                          <div className="mt-2 flex items-center gap-2 bg-slate-900 px-2 py-1 rounded-md border border-slate-800 font-mono text-[11px] text-slate-300">
                            <span className="truncate">{item.actionPayload}</span>
                            <button
                              onClick={() => handleCopyPayload(item.id, item.actionPayload!)}
                              className="text-primary hover:text-primary/80 transition-colors p-1"
                              title="Copy command"
                            >
                              {copiedPayloadId === item.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status Badge & Action Button */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {isGranted ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Granted</span>
                        </div>
                      ) : isDenied ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>Denied</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          <span>Action Needed</span>
                        </div>
                      )}

                      {!isGranted && (
                        <button
                          onClick={() => handleRequestPermission(item)}
                          disabled={isWorking}
                          className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-primary/20 cursor-pointer disabled:opacity-50"
                        >
                          {isWorking ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {item.actionType === "open_settings"
                              ? "Open Settings"
                              : "Grant"}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-6 text-center text-slate-400 text-xs">
              No permissions required for the current operating system.
            </div>
          )}
        </div>

        {/* Bottom Action Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800 relative z-10 shrink-0">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                allGranted ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            {allGranted ? (
              <span className="text-emerald-400 font-medium">
                All required permissions verified ✅
              </span>
            ) : (
              <span>Grant all required permissions to continue</span>
            )}
          </div>

          <button
            onClick={handleSaveAndContinue}
            disabled={!allGranted || submitting}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              allGranted && !submitting
                ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
                : "bg-slate-800 text-slate-500 cursor-not-allowed opacity-60"
            }`}
          >
            {submitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving Preferences...</span>
              </>
            ) : (
              <>
                <span>Save & Continue (Don't Ask Again)</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
