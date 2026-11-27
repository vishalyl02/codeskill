"use client";

import Image from "next/image";
import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, Info, Monitor, ShieldCheck } from "lucide-react";
import { authStorage } from "@/lib/auth-storage";
import { isLockdownClient } from "@/lib/lockdown-bridge";

const platforms = {
  macos: {
    label: "macOS",
    logo: "/lockdown-platforms/apple.svg",
    steps: ["Open the downloaded .dmg file.", "Drag CodeSkill LockDown into Applications. When the copy finishes, close the installer."],
  },
  windows: {
    label: "Windows",
    logo: "/lockdown-platforms/windows.svg",
    steps: ["Open the downloaded .exe file from Downloads.", "Follow the installer prompts until setup is complete."],
  },
  linux: {
    label: "Linux",
    logo: "/lockdown-platforms/linux.svg",
    steps: ["Open the .deb file with your package installer on Debian or Ubuntu.", "Complete the installation in the package installer."],
  },
} as const;

type Platform = keyof typeof platforms;

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const platformButton = `min-h-11 rounded-lg border px-3 py-2 text-[15px] font-medium transition-colors hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:font-semibold ${focusRing}`;

const inlineCode = "rounded-md bg-muted px-1.5 py-0.5 font-mono wrap-anywhere";
const warning = "font-medium text-amber-800 dark:text-amber-300";

const setupNotes: Record<Platform, {
  title: React.ReactNode;
  steps: { instruction: React.ReactNode; command?: string }[];
}> = {
  macos: {
    title: <>If macOS Gatekeeper shows <span className={warning}>&quot;CodeSkill LockDown is damaged and can&apos;t be opened&quot;</span>:</>,
    steps: [
      { instruction: <>Drag <code className={inlineCode}>CodeSkill LockDown.app</code> to your <code className={inlineCode}>/Applications</code> folder.</> },
      {
        instruction: <>Open <strong>Terminal</strong> and run:</>,
        command: 'xattr -cr /Applications/"CodeSkill LockDown.app"',
      },
      { instruction: <>Or in Finder: <strong>Right-click</strong> the app → hold <strong>Option</strong> → click <strong>Open</strong> → confirm <strong>Open</strong>.</> },
    ],
  },
  windows: {
    title: <>If Microsoft Defender SmartScreen displays <span className={warning}>&quot;Windows protected your PC&quot;</span>:</>,
    steps: [
      { instruction: <>Click the small underlined <strong>More info</strong> link on the SmartScreen dialog.</> },
      { instruction: <>Click the <strong>Run anyway</strong> button that appears.</> },
      {
        instruction: "Or open PowerShell in your Downloads folder and run:",
        command: String.raw`Unblock-File -Path .\CodeSkill-LockDown-Setup.exe
.\CodeSkill-LockDown-Setup.exe`,
      },
    ],
  },
  linux: {
    title: "Install and grant permissions on Ubuntu / Debian:",
    steps: [
      {
        instruction: "Install the Debian package via terminal:",
        command: "sudo dpkg -i codeskill-lockdown.deb || sudo apt-get install -f -y",
      },
      {
        instruction: "For AppImage:",
        command: "chmod +x codeskill-lockdown.AppImage && ./codeskill-lockdown.AppImage",
      },
    ],
  },
};

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
  const [platform, setPlatform] = useState<Platform>("macos");
  const [lockdownVersion, setLockdownVersion] = useState<string>("1.0.0");
  const [downloadingPlatform, setDownloadingPlatform] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [linuxFormat, setLinuxFormat] = useState<"deb" | "appimage">("deb");
  const [copyFeedback, setCopyFeedback] = useState<{ command: string; success: boolean } | null>(null);
  const onClientDetectedRef = useRef(onClientDetected);
  onClientDetectedRef.current = onClientDetected;

  useEffect(() => {
    let cancelled = false;
    const client = isLockdownClient();
    if (client && onClientDetectedRef.current) {
      onClientDetectedRef.current();
    }

    // Fetch manifest or download metadata once on mount to get the latest published version
    fetch("/api/lockdown/download?redirect=false&format=json", {
      headers: { Accept: "application/json" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.version) {
          setLockdownVersion(data.version);
        }
      })
      .catch(() => {
        // Default to 1.0.0 if offline
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  const diagnosticsDeepLink = `codeskill-lockdown://system-check${
    portalOrigin ? `?origin=${encodeURIComponent(portalOrigin)}` : ""
  }`;

  const handleLaunchClick = () => {
    if (typeof window !== "undefined") {
      const token = authStorage.getAccessToken() || "";
      const deepLinkUrl = `codeskill-exam://start?examId=${encodeURIComponent(examId)}&token=${encodeURIComponent(token)}${originParam}${mediaParams}`;
      window.location.assign(deepLinkUrl);
    }
  };

  const handleDiagnosticsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      window.location.assign(diagnosticsDeepLink);
    }
  };

  const handleDownload = (platform: Platform) => {
    setDownloadingPlatform(platform);
    setDownloadStatus(`Requesting the ${platforms[platform].label} download…`);
    setDownloadError(null);

    try {
      const activeFormat = platform === "linux" ? linuxFormat : undefined;
      const queryParams = new URLSearchParams({
        platform,
        version: lockdownVersion,
        ...(activeFormat ? { format: activeFormat } : {}),
      });

      const downloadUrl = `/api/lockdown/download?${queryParams.toString()}`;

      // Trigger background download via anchor element
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", "");
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        setDownloadingPlatform(null);
        setDownloadStatus(`Check your browser’s downloads for the ${platforms[platform].label} installer.`);
      }, 2000);
    } catch {
      setDownloadingPlatform(null);
      setDownloadStatus(null);
      setDownloadError("The download couldn’t start. Check your connection and try again.");
    }
  };

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopyFeedback({ command, success: true });
    } catch {
      setCopyFeedback({ command, success: false });
    }
  }

  const selectedPlatform = platforms[platform];
  const setupNote = setupNotes[platform];
  const launchClassName = `flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 ${focusRing}`;
  const launchLabel = (
    <>
      <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
      Launch in CodeSkill LockDown
    </>
  );
  const installSteps = platform === "linux" && linuxFormat === "appimage"
    ? ["Find the downloaded .AppImage file in Downloads.", "In the file’s properties, allow it to run as a program."]
    : selectedPlatform.steps;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-3 pb-12 pt-24 text-foreground sm:px-6 sm:pt-28 lg:px-[45px]">
      <div className="overflow-hidden rounded-3xl border border-foreground/15 bg-card text-black shadow-xl shadow-black/5 dark:text-white dark:shadow-black/20">
        <header className="flex items-start gap-4 border-b border-border bg-gradient-to-br from-primary/10 via-transparent to-transparent px-5 py-4 sm:px-8 sm:py-5">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-[34px]">CodeSkill LockDown required</h1>
            <p className="mt-1 break-words text-[15px]">
              {examTitle ? <>Assessment: {examTitle}</> : "Secure assessment"}
            </p>
          </div>
        </header>

        <div className="grid items-start gap-4 p-3 sm:gap-6 sm:px-6 sm:pb-6 sm:pt-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section aria-labelledby="lockdown-launch" className="min-w-0 space-y-4 rounded-2xl border border-border bg-background/40 p-4 sm:p-5">
            <div className="space-y-2">
              <h2 id="lockdown-launch" className="text-lg font-semibold">Already installed?</h2>
              <p className="text-[15px] leading-relaxed">
                Open the assessment in LockDown and confirm the browser prompt if it appears.
              </p>
            </div>

            <button type="button" onClick={handleLaunchClick} className={launchClassName}>
              {launchLabel}
            </button>

            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm leading-relaxed">Trouble opening LockDown? Check whether your device is ready.</p>
              <a
                href={diagnosticsDeepLink}
                onClick={handleDiagnosticsClick}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg border border-foreground/30 bg-background px-3.5 py-2 text-sm font-semibold transition-colors hover:border-primary hover:bg-primary/5 ${focusRing}`}
              >
                <Monitor aria-hidden="true" className="size-4 shrink-0 text-primary" />
                Run system check
              </a>
            </div>
          </section>

          <section aria-labelledby="lockdown-setup" className="min-w-0 overflow-hidden rounded-2xl border border-foreground/15 bg-background/40">
            <div className="flex items-start justify-between gap-3 border-b border-border bg-muted/35 px-4 py-4 sm:px-6">
              <h2 id="lockdown-setup" className="flex min-w-0 items-start gap-2 text-lg font-semibold">
                <Info aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                <span>First-time setup: How to open without security certificate warnings</span>
              </h2>
              <span className="shrink-0 rounded-full border border-border bg-muted px-2.5 py-1 text-sm font-medium">
                v{lockdownVersion}
              </span>
            </div>

            <div className="space-y-5 p-4 sm:p-6">
              <div className="space-y-3">
                <div role="group" aria-label="Operating system" className="flex flex-wrap gap-2 [&>button]:flex-1">
                  {(Object.keys(platforms) as Platform[]).map((option) => (
                    <button key={option} type="button" aria-pressed={platform === option} onClick={() => { setPlatform(option); setCopyFeedback(null); }} className={`inline-flex items-center justify-center gap-2 ${platformButton}`}>
                      <Image
                        src={platforms[option].logo}
                        alt=""
                        aria-hidden="true"
                        width={16}
                        height={16}
                        className={`size-4 shrink-0 ${option === "windows" ? "" : "dark:invert"}`}
                      />
                      {platforms[option].label}
                    </button>
                  ))}
                </div>

                {platform === "linux" && (
                  <div role="group" aria-label="Linux installer format" className="flex flex-wrap gap-2">
                    <button type="button" aria-pressed={linuxFormat === "deb"} onClick={() => setLinuxFormat("deb")} className={platformButton}>
                      .deb (Debian/Ubuntu)
                    </button>
                    <button type="button" aria-pressed={linuxFormat === "appimage"} onClick={() => setLinuxFormat("appimage")} className={platformButton}>
                      .AppImage (Portable)
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleDownload(platform)}
                  disabled={downloadingPlatform !== null}
                  className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-[15px] font-semibold transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-wait ${focusRing}`}
                >
                  <Download aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  Download for {selectedPlatform.label}
                </button>

                {downloadStatus && <p role="status" className="text-[15px]">{downloadStatus}</p>}
                {downloadError && <p role="alert" className="text-[15px] font-semibold text-destructive">{downloadError}</p>}
              </div>

              <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                <h3 className="text-[15px] font-semibold">Install and open on {selectedPlatform.label}</h3>
                <ol className="divide-y divide-border text-[15px] leading-relaxed">
                  {[...installSteps, "Return to this page and select Launch in CodeSkill LockDown."].map((step, index) => (
                    <li key={step} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                      <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-sm font-semibold">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>

                {platform === "linux" && (
                  <p className="text-[15px] leading-relaxed">
                    If you use Wayland, sign out and choose an X11 session such as Ubuntu on Xorg from the login screen before launching LockDown. If your device has no X11 option, contact your assessment coordinator.
                  </p>
                )}
              </div>

              <aside aria-labelledby="lockdown-setup-note" className="min-w-0 space-y-3 rounded-xl border border-border bg-background p-4">
                <h3 id="lockdown-setup-note" className="text-[15px] font-normal leading-relaxed">{setupNote.title}</h3>
                <ol aria-labelledby="lockdown-setup-note" className="list-decimal space-y-3 pl-6 text-[15px] leading-relaxed marker:font-semibold">
                  {setupNote.steps.map(({ instruction, command }, index) => (
                    <li key={index} className="min-w-0 pl-1">
                      <p>{instruction}</p>
                      {command && (
                        <>
                          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg border border-slate-700 bg-[#1e1f21] p-2.5">
                            <pre className={`whitespace-pre-wrap px-1 py-1.5 font-mono text-sm leading-relaxed wrap-anywhere ${platform === "windows" ? "text-sky-300" : "text-[#00d6a0]"}`}>
                              <code>{command}</code>
                            </pre>
                            <button
                              type="button"
                              onClick={() => void copyCommand(command)}
                              aria-label={`Copy command for step ${index + 1}`}
                              title="Copy command"
                              className={`grid size-9 shrink-0 place-items-center rounded-md border border-slate-600 text-white transition-colors hover:bg-white/10 ${focusRing}`}
                            >
                              {copyFeedback?.command === command && copyFeedback.success
                                ? <Check aria-hidden="true" className="size-4 text-emerald-300" />
                                : <Copy aria-hidden="true" className="size-4" />}
                            </button>
                          </div>
                          {copyFeedback?.command === command && (
                            <p role="status" className="mt-1 text-sm">
                              {copyFeedback.success ? "Copied to clipboard." : "Select the command text to copy it manually."}
                            </p>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ol>
              </aside>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
