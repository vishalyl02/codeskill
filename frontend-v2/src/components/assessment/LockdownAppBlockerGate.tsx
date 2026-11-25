"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { AlertOctagon, XCircle, ShieldAlert, CheckCircle2, RefreshCw, Zap } from "lucide-react";
import {
  listBlockingApps,
  killBlockingApp,
  killAllBlockingApps,
  BlockingAppInfo,
  isLockdownClient,
} from "@/lib/lockdown-bridge";
import { lockdownLogger } from "@/lib/lockdown-logger";
import api from "@/config/api";

interface LockdownAppBlockerGateProps {
  assessmentId?: string;
  onReady: () => void;
  requireCloseOtherApps?: boolean;
}

export default function LockdownAppBlockerGate({
  assessmentId,
  onReady,
  requireCloseOtherApps = true,
}: LockdownAppBlockerGateProps) {
  const [blockingApps, setBlockingApps] = useState<BlockingAppInfo[]>([]);
  const [isPolling, setIsPolling] = useState<boolean>(true);
  const [isClosingAll, setIsClosingAll] = useState<boolean>(false);
  const [closingPid, setClosingPid] = useState<number | null>(null);
  const hasInitializedRef = useRef<boolean>(false);
  const lastLoggedAppsKeyRef = useRef<string>("");

  const fetchApps = useCallback(async () => {
    if (!isLockdownClient() || !requireCloseOtherApps) {
      setBlockingApps([]);
      setIsPolling(false);
      onReady();
      return;
    }

    try {
      const apps = await listBlockingApps();
      setBlockingApps(apps);
      if (apps.length === 0) {
        if (lastLoggedAppsKeyRef.current !== "") {
          lastLoggedAppsKeyRef.current = "";
          lockdownLogger.info("PREFLIGHT", "blocking_apps_cleared", {});
        }
        onReady();
      } else {
        const key = apps.map((a) => `${a.name}:${a.category}`).sort().join(",");
        if (key !== lastLoggedAppsKeyRef.current) {
          lastLoggedAppsKeyRef.current = key;
          const appSummaries = apps.map((a) => ({ name: a.name, category: a.category, pid: a.pid }));
          lockdownLogger.warn("PREFLIGHT", "blocking_apps_detected", {
            count: apps.length,
            apps: appSummaries,
          });
          void lockdownLogger.uploadDiagnosticsSnapshot(api, assessmentId, "blocking_apps_detected", {
            count: apps.length,
            apps: appSummaries,
          });
        }
      }
      hasInitializedRef.current = true;
    } catch (err) {
      console.warn("Failed to check blocking applications:", err);
    } finally {
      setIsPolling(false);
    }
  }, [requireCloseOtherApps, onReady]);

  useEffect(() => {
    void fetchApps();
    const interval = window.setInterval(() => {
      void fetchApps();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [fetchApps]);

  const handleKillSingle = async (pid: number, force: boolean) => {
    setClosingPid(pid);
    try {
      await killBlockingApp(pid, force);
      await fetchApps();
    } finally {
      setClosingPid(null);
    }
  };

  const handleKillAll = async () => {
    setIsClosingAll(true);
    try {
      const remaining = await killAllBlockingApps(true);
      setBlockingApps(remaining);
      if (remaining.length === 0) {
        onReady();
      }
    } finally {
      setIsClosingAll(false);
    }
  };

  if (blockingApps.length === 0) {
    return null;
  }

  const forbiddenCount = blockingApps.filter((a) => a.category === "forbidden").length;
  const nonEssentialCount = blockingApps.filter((a) => a.category === "non_essential").length;

  return (
    <div className="fixed inset-0 z-[195] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4 text-center">
      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-left space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <AlertOctagon className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-white">Active Background Applications Detected</h2>
            <p className="text-sm text-slate-400">
              Exam security requires closing unauthorized utilities, AI assistants, and background applications before entering fullscreen kiosk lock.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {forbiddenCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" />
              {forbiddenCount} Forbidden Tool{forbiddenCount > 1 ? "s" : ""}
            </span>
          )}
          {nonEssentialCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold">
              {nonEssentialCount} Running User App{nonEssentialCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/80">
          {blockingApps.map((app) => {
            const isForbidden = app.category === "forbidden";
            const isClosing = closingPid === app.pid || isClosingAll;

            return (
              <div
                key={app.pid}
                className="flex items-center justify-between p-3.5 hover:bg-slate-900/50 transition-colors"
              >
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-100 truncate">{app.name}</span>
                    <span className="text-xs font-mono text-slate-500">PID: {app.pid}</span>
                  </div>
                  {isForbidden ? (
                    <span className="inline-block mt-0.5 text-[11px] font-semibold text-rose-400">
                      Forbidden Tool (Screen recorder, remote desktop, VM, or switcher)
                    </span>
                  ) : (
                    <span className="inline-block mt-0.5 text-[11px] text-slate-400 truncate max-w-sm">
                      {app.bundleOrPath || "Background GUI Application"}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleKillSingle(app.pid, false)}
                    disabled={isClosing}
                    className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-all cursor-pointer disabled:opacity-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleKillSingle(app.pid, true)}
                    disabled={isClosing}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Zap className="w-3 h-3" />
                    Force Kill
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => void fetchApps()}
            disabled={isPolling || isClosingAll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isPolling ? "animate-spin" : ""}`} />
            Refresh List
          </button>

          <button
            type="button"
            onClick={() => void handleKillAll()}
            disabled={isClosingAll}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-500 transition-all shadow-lg shadow-rose-600/20 cursor-pointer disabled:opacity-50"
          >
            {isClosingAll ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Closing Apps...
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                Close All Apps & Enter Exam
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
