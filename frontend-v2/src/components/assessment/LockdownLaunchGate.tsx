"use client";

import React, { useEffect, useState } from "react";
import { ShieldAlert, Download, ExternalLink, RefreshCw, Monitor, CheckCircle2, Info, ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { authStorage } from "@/lib/auth-storage";
import { isLockdownClient } from "@/lib/lockdown-bridge";

interface LockdownLaunchGateProps {
  examId: string;
  examTitle?: string;
  /** Whether the assessment requires camera access for proctoring. Defaults to true (safe). */
  requireCamera?: boolean;
  /** Whether the assessment requires microphone access for proctoring. Defaults to false. */
  requireMicrophone?: boolean;
  onClientDetected?: () => void;
}

export default function LockdownLaunchGate({
  examId,
  examTitle,
  requireCamera = true,
  requireMicrophone = false,
  onClientDetected,
}: LockdownLaunchGateProps) {
  const [token, setToken] = useState<string>("");
  const [isClient, setIsClient] = useState<boolean>(false);
  const [showInstructions, setShowInstructions] = useState<boolean>(false);
  const [osTab, setOsTab] = useState<"macos" | "windows" | "linux">("macos");
  const [lockdownVersion, setLockdownVersion] = useState<string>("1.0.0");
  const [downloadingPlatform, setDownloadingPlatform] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [linuxFormat, setLinuxFormat] = useState<"deb" | "appimage">("deb");

  useEffect(() => {
    setToken(authStorage.getAccessToken() || "");
    const client = isLockdownClient();
    setIsClient(client);
    if (client && onClientDetected) {
      onClientDetected();
    }

    // Fetch manifest or download metadata to get the latest published version
    fetch("/api/lockdown/download?format=json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.version) {
          setLockdownVersion(data.version);
        }
      })
      .catch(() => {
        // Default to 1.0.0 if offline
      });
  }, [onClientDetected]);

  const getPortalOrigin = () => {
    if (typeof window !== "undefined" && window.location && window.location.origin) {
      return window.location.origin;
    }
    return (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  };

  const portalOrigin = getPortalOrigin();
  const originParam = portalOrigin ? `&origin=${encodeURIComponent(portalOrigin)}` : "";

  // Pass proctoring media requirements so the LockDown app only requests the
  // permissions that this specific assessment actually needs.
  const mediaParams = `&useCamera=${requireCamera ? '1' : '0'}&useMic=${requireMicrophone ? '1' : '0'}`;

  const deepLinkUrl = `codeskill-exam://start?examId=${encodeURIComponent(
    examId
  )}&token=${encodeURIComponent(token)}${originParam}${mediaParams}`;

  const diagnosticsDeepLink = `codeskill-lockdown://system-check${
    portalOrigin ? `?origin=${encodeURIComponent(portalOrigin)}` : ""
  }`;

  const handleLaunchClick = () => {
    if (typeof window !== "undefined") {
      window.location.assign(deepLinkUrl);
    }
  };

  const handleDiagnosticsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      window.location.assign(diagnosticsDeepLink);
    }
  };

  const handleCheckAgain = () => {
    const client = isLockdownClient();
    setIsClient(client);
    if (client && onClientDetected) {
      onClientDetected();
    }
  };

  const handleDownload = (platform: "windows" | "macos" | "linux", format?: string) => {
    setDownloadingPlatform(platform);
    setDownloadStatus(`Initiating v${lockdownVersion} download for ${platform}...`);
    setDownloadError(null);

    try {
      const activeFormat = format || (platform === "linux" ? linuxFormat : undefined);
      const queryParams = new URLSearchParams({
        platform,
        version: lockdownVersion,
        ...(activeFormat ? { format: activeFormat } : {}),
      });

      const downloadUrl = `/api/lockdown/download?${queryParams.toString()}`;

      // Trigger background download via invisible iframe to prevent top-level navigation / external 404 pages
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = downloadUrl;
      document.body.appendChild(iframe);

      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
        setDownloadingPlatform(null);
        setDownloadStatus(`Download started for ${platform.toUpperCase()}! Check your browser's downloads.`);
      }, 2500);
    } catch {
      setDownloadingPlatform(null);
      setDownloadError(`Unable to start download for ${platform}. Please check your connection and try again.`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">CodeSkill LockDown Required</h1>
            <p className="text-sm text-slate-400">
              {examTitle ? `Assessment: ${examTitle}` : "Secured Assessment Environment"}
            </p>
          </div>
        </div>

        <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 mb-6 text-sm text-slate-300 leading-relaxed">
          This assessment requires <strong>CodeSkill LockDown Browser</strong> to ensure exam integrity.
          Standard web browsers are restricted from accessing exam content.
        </div>

        {/* Primary Launch Action */}
        <div className="space-y-4 mb-8">
          <button
            onClick={handleLaunchClick}
            className="w-full py-3.5 px-6 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2.5 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 cursor-pointer"
          >
            <ExternalLink className="w-5 h-5" />
            Launch in CodeSkill LockDown
          </button>

          <button
            onClick={handleCheckAgain}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Check LockDown Status Again
          </button>

          <a
            href={diagnosticsDeepLink}
            onClick={handleDiagnosticsClick}
            className="w-full py-2.5 px-4 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Monitor className="w-4 h-4" />
            Launch Diagnostics in CodeSkill LockDown
          </a>
        </div>

        {/* Linux Wayland Guidance */}
        <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3.5 mb-6 text-xs text-slate-400 flex items-start gap-2.5 leading-relaxed">
          <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-300">Linux Students: </span>
            If you are running Wayland (default on Ubuntu 22.04+ / Fedora), please choose <code className="bg-slate-800 text-sky-300 px-1.5 py-0.5 rounded text-[11px] font-mono">Ubuntu on Xorg</code> or <code className="bg-slate-800 text-sky-300 px-1.5 py-0.5 rounded text-[11px] font-mono">GNOME on X11</code> from the gear icon at your login screen to ensure keyboard hooks and kiosk security function properly.
          </div>
        </div>

        {/* Installer Download Options */}
        <div className="border-t border-slate-800 pt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Download className="w-4 h-4 text-sky-400" />
              Install CodeSkill LockDown
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              v{lockdownVersion} (Latest Release)
            </span>
          </div>

          <p className="text-xs text-slate-400 mb-4">
            If you do not have LockDown installed on this machine, download the verified release for your operating system:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => handleDownload("windows")}
              disabled={downloadingPlatform === "windows"}
              className="flex flex-col items-center justify-center p-3 rounded-lg bg-slate-950/80 border border-slate-800 hover:border-sky-500/40 hover:bg-slate-800/50 transition-all text-center group cursor-pointer disabled:opacity-60"
            >
              <Monitor className="w-5 h-5 text-sky-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-slate-200">
                {downloadingPlatform === "windows" ? "Starting..." : "Windows"}
              </span>
              <span className="text-[10px] text-slate-400">.exe Installer (NSIS)</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownload("macos")}
              disabled={downloadingPlatform === "macos"}
              className="flex flex-col items-center justify-center p-3 rounded-lg bg-slate-950/80 border border-slate-800 hover:border-indigo-500/40 hover:bg-slate-800/50 transition-all text-center group cursor-pointer disabled:opacity-60"
            >
              <Monitor className="w-5 h-5 text-indigo-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-slate-200">
                {downloadingPlatform === "macos" ? "Starting..." : "macOS"}
              </span>
              <span className="text-[10px] text-slate-400">.dmg (Apple Silicon & Intel)</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownload("linux")}
              disabled={downloadingPlatform === "linux"}
              className="flex flex-col items-center justify-center p-3 rounded-lg bg-slate-950/80 border border-slate-800 hover:border-emerald-500/40 hover:bg-slate-800/50 transition-all text-center group cursor-pointer disabled:opacity-60"
            >
              <Monitor className="w-5 h-5 text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium text-slate-200">
                {downloadingPlatform === "linux" ? "Starting..." : "Linux"}
              </span>
              <span className="text-[10px] text-slate-400">
                .{linuxFormat} (Ubuntu / Fedora)
              </span>
            </button>
          </div>

          {/* Linux package format toggle */}
          <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <span>Linux package:</span>
            <button
              type="button"
              onClick={() => setLinuxFormat("deb")}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                linuxFormat === "deb"
                  ? "bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              .deb (Debian/Ubuntu)
            </button>
            <span className="text-slate-600">|</span>
            <button
              type="button"
              onClick={() => setLinuxFormat("appimage")}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                linuxFormat === "appimage"
                  ? "bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              .AppImage (Portable)
            </button>
          </div>

          {/* In-app download feedback banner */}
          {downloadStatus && (
            <div className="mt-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="flex-1">{downloadStatus}</span>
            </div>
          )}

          {downloadError && (
            <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center justify-between gap-2 animate-fadeIn">
              <span>{downloadError}</span>
              <button
                type="button"
                onClick={() => setDownloadError(null)}
                className="text-[10px] underline hover:text-rose-200 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* First-Time Launch & Unverified Developer Instructions */}
          <div className="mt-4 pt-3 border-t border-slate-800/60">
            <button
              type="button"
              onClick={() => setShowInstructions(!showInstructions)}
              className="w-full flex items-center justify-between text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors py-1 cursor-pointer"
            >
              <span className="inline-flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-primary" />
                First-time setup: How to open without security certificate warnings
              </span>
              {showInstructions ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {showInstructions && (
              <div className="mt-3 p-3 rounded-lg bg-slate-950/90 border border-slate-800 text-left text-xs space-y-3">
                <div className="flex gap-2 border-b border-slate-800 pb-2">
                  <button
                    type="button"
                    onClick={() => setOsTab("macos")}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                      osTab === "macos"
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    macOS
                  </button>
                  <button
                    type="button"
                    onClick={() => setOsTab("windows")}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                      osTab === "windows"
                        ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Windows
                  </button>
                  <button
                    type="button"
                    onClick={() => setOsTab("linux")}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                      osTab === "linux"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Linux
                  </button>
                </div>

                {osTab === "macos" && (
                  <div className="space-y-2 text-slate-300">
                    <p className="text-[11px] text-slate-300">
                      If macOS Gatekeeper shows <span className="text-amber-300 font-medium">&quot;CodeSkill LockDown is damaged and can&apos;t be opened&quot;</span>:
                    </p>
                    <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-400">
                      <li>
                        Drag <code className="text-slate-200 bg-slate-900 px-1 py-0.5 rounded">CodeSkill LockDown.app</code> to your <code className="text-slate-200 bg-slate-900 px-1 py-0.5 rounded">/Applications</code> folder.
                      </li>
                      <li>
                        Open <strong>Terminal</strong> and run:
                        <div className="mt-1 p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-emerald-400 select-all">
                          xattr -cr /Applications/&quot;CodeSkill LockDown.app&quot;
                        </div>
                      </li>
                      <li>
                        Or in Finder: <strong>Right-click</strong> the app &rarr; hold <strong>Option</strong> &rarr; click <strong>Open</strong> &rarr; confirm <strong>Open</strong>.
                      </li>
                    </ol>
                  </div>
                )}

                {osTab === "windows" && (
                  <div className="space-y-2 text-slate-300">
                    <p className="text-[11px] text-slate-300">
                      If Microsoft Defender SmartScreen displays <span className="text-amber-300 font-medium">&quot;Windows protected your PC&quot;</span>:
                    </p>
                    <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-400">
                      <li>
                        Click the small underlined <strong className="text-slate-200">More info</strong> link on the SmartScreen dialog.
                      </li>
                      <li>
                        Click the <strong className="text-slate-200">Run anyway</strong> button that appears.
                      </li>
                      <li>
                        Or open PowerShell in your Downloads folder and run:
                        <div className="mt-1 p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-sky-400 select-all">
                          Unblock-File -Path .\CodeSkill-LockDown-Setup.exe<br />
                          .\CodeSkill-LockDown-Setup.exe
                        </div>
                      </li>
                    </ol>
                  </div>
                )}

                {osTab === "linux" && (
                  <div className="space-y-2 text-slate-300">
                    <p className="text-[11px] text-slate-300">
                      Install and grant permissions on Ubuntu / Debian:
                    </p>
                    <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-400">
                      <li>
                        Install the Debian package via terminal:
                        <div className="mt-1 p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-emerald-400 select-all">
                          sudo dpkg -i codeskill-lockdown.deb || sudo apt-get install -f -y
                        </div>
                      </li>
                      <li>
                        For AppImage:
                        <div className="mt-1 p-2 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-emerald-400 select-all">
                          chmod +x codeskill-lockdown.AppImage &amp;&amp; ./codeskill-lockdown.AppImage
                        </div>
                      </li>
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
