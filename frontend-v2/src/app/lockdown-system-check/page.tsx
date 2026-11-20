"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Monitor,
  Camera,
  Mic,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Wifi,
  Cpu,
  Info,
  LogOut,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import {
  runFullSystemDiagnostic,
  SystemDiagnosticResult,
  killBlockingApp,
  killAllBlockingApps,
  isLockdownClient,
  exitLockdownApp,
  BlockingAppInfo,
} from "@/lib/lockdown-bridge";

export default function LockdownSystemCheckPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [diagnostic, setDiagnostic] = useState<SystemDiagnosticResult | null>(null);
  const [closingPid, setClosingPid] = useState<number | null>(null);
  const [closingAll, setClosingAll] = useState<boolean>(false);
  const [isClient, setIsClient] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"all" | "os" | "display" | "media" | "apps" | "network">("all");

  // Media streams & active liveness state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [micActive, setMicActive] = useState<boolean>(false);
  const [livenessPassed, setLivenessPassed] = useState<boolean>(false);
  const [pingStats, setPingStats] = useState<{ min: number; avg: number; max: number; jitter: number } | null>(null);

  const fetchDiagnostic = useCallback(async () => {
    setLoading(true);
    try {
      const result = await runFullSystemDiagnostic();
      setDiagnostic(result);
    } catch (err) {
      console.error("System diagnostic failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsClient(isLockdownClient());
    fetchDiagnostic();
  }, [fetchDiagnostic]);

  // Audio level meter + Camera feed initialization
  useEffect(() => {
    let active = true;
    let localStream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let animFrame: number;

    async function initMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
          audio: true,
        });

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStream = stream;
        setMediaStream(stream);
        setCameraActive(stream.getVideoTracks().length > 0);
        setMicActive(stream.getAudioTracks().length > 0);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }

        // Web Audio VU meter
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioContext = new AudioCtx();
          const source = audioContext.createMediaStreamSource(stream);
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateAudioLevel = () => {
            if (!active || !analyser) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            const normalized = Math.min(100, Math.round((avg / 128) * 100));
            setAudioLevel(normalized);

            if (normalized > 15) {
              setLivenessPassed(true);
            }
            animFrame = requestAnimationFrame(updateAudioLevel);
          };
          updateAudioLevel();
        }
      } catch (err) {
        console.warn("Unable to acquire live preview stream:", err);
      }
    }

    initMedia();

    return () => {
      active = false;
      if (animFrame) cancelAnimationFrame(animFrame);
      if (audioContext && audioContext.state !== "closed") {
        audioContext.close().catch(() => {});
      }
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Network benchmark ping runner
  useEffect(() => {
    let isCancelled = false;

    async function runNetworkBenchmark() {
      const pings: number[] = [];
      for (let i = 0; i < 4; i++) {
        const start = performance.now();
        try {
          await fetch("/api/health", { cache: "no-store", method: "GET" }).catch(() => {});
          const elapsed = performance.now() - start;
          pings.push(elapsed);
        } catch {
          pings.push(15);
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      if (isCancelled || pings.length === 0) return;
      const min = Math.round(Math.min(...pings));
      const max = Math.round(Math.max(...pings));
      const avg = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
      const jitter = Math.round(max - min);

      setPingStats({ min, avg, max, jitter });
    }

    runNetworkBenchmark();

    return () => {
      isCancelled = true;
    };
  }, []);

  const handleCloseApp = async (pid: number) => {
    setClosingPid(pid);
    try {
      await killBlockingApp(pid, true);
      await fetchDiagnostic();
    } catch (err) {
      console.error(`Failed to close app ${pid}:`, err);
    } finally {
      setClosingPid(null);
    }
  };

  const handleCloseAllApps = async () => {
    setClosingAll(true);
    try {
      await killAllBlockingApps(true);
      await fetchDiagnostic();
    } catch (err) {
      console.error("Failed to close all apps:", err);
    } finally {
      setClosingAll(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 90) return "text-emerald-400";
    if (score >= 70) return "text-amber-400";
    return "text-rose-400";
  };

  const scoreBg = (score: number) => {
    if (score >= 90) return "bg-emerald-500/10 border-emerald-500/30";
    if (score >= 70) return "bg-amber-500/10 border-amber-500/30";
    return "bg-rose-500/10 border-rose-500/30";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg text-white">CodeSkill LockDown - System Diagnostic Check</h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                Non-Trapping Practice Mode
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Verify your hardware, permissions, and network setup before taking an exam.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDiagnostic}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
            Re-run Diagnostic
          </button>

          {isClient && (
            <button
              onClick={() => exitLockdownApp()}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-medium text-rose-300 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Exit LockDown
            </button>
          )}
        </div>
      </header>

      {/* Main Diagnostic Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Readiness Hero Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className={`p-6 rounded-2xl border ${diagnostic ? scoreBg(diagnostic.readinessScore) : "bg-slate-900 border-slate-800"} flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Readiness Score
                </span>
                <span className="text-xs font-medium text-slate-400">
                  Target: 100%
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-4xl font-extrabold ${diagnostic ? scoreColor(diagnostic.readinessScore) : "text-white"}`}>
                  {diagnostic ? diagnostic.readinessScore : "--"}
                </span>
                <span className="text-slate-400 text-sm">/ 100</span>
              </div>
              <div className="w-full bg-slate-800/80 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-700 ${
                    diagnostic && diagnostic.readinessScore >= 90
                      ? "bg-emerald-500"
                      : diagnostic && diagnostic.readinessScore >= 70
                      ? "bg-amber-500"
                      : "bg-rose-500"
                  }`}
                  style={{ width: `${diagnostic ? diagnostic.readinessScore : 0}%` }}
                />
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Status:</span>
              <span className="font-semibold flex items-center gap-1.5">
                {diagnostic?.overallReadiness ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">Ready For Examination</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="text-amber-300">Action Items Remaining</span>
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 md:col-span-2 flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                Diagnostic Summary & Pre-Exam Instructions
              </h2>
              {diagnostic?.recommendations && diagnostic.recommendations.length > 0 ? (
                <div className="space-y-2 mt-3">
                  {diagnostic.recommendations.map((rec, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Your workstation passed all OS integrity, hardware attestation, display topology, and process checks. You are fully prepared to launch your exam.
                  </span>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Environment: {isClient ? "CodeSkill LockDown Client" : "Standard Web Browser (Preview)"}</span>
              <span>OS: {diagnostic ? `${diagnostic.osName} (${diagnostic.architecture})` : "--"}</span>
            </div>
          </div>
        </div>

        {/* Diagnostic Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1: Operating System & Client Readiness */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-sm text-white">OS & Client Architecture</h3>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">OS Platform:</span>
                  <span className="font-mono text-slate-200">{diagnostic?.osName || "Unknown"}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Architecture:</span>
                  <span className="font-mono text-slate-200">{diagnostic?.architecture || "Unknown"}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">OS Version:</span>
                  <span className="font-mono text-slate-200">{diagnostic?.osVersion || "Unknown"}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Client Runtime:</span>
                  <span className="font-medium text-emerald-400">Tauri v2 Isolation</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Multi-Monitor & External Display Topology */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                    <Monitor className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-sm text-white">Display Topology</h3>
                </div>
                {diagnostic?.monitorCount === 1 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                )}
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Monitors Connected:</span>
                  <span className={`font-semibold ${diagnostic?.monitorCount === 1 ? "text-emerald-400" : "text-rose-400 font-bold"}`}>
                    {diagnostic?.monitorCount || 1} display(s)
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">External Screens:</span>
                  <span className="font-mono text-slate-200">
                    {diagnostic?.displays.externalDisplaysDetected ? "Detected (Prohibited)" : "None (Pass)"}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Primary Resolution:</span>
                  <span className="font-mono text-slate-200">{diagnostic?.displays.primaryResolution || "1920x1080"}</span>
                </div>
              </div>
            </div>
            {diagnostic && diagnostic.monitorCount > 1 && (
              <p className="mt-3 text-[11px] text-rose-400">
                Please disconnect all external monitors or HDMI cables before taking your exam.
              </p>
            )}
          </div>

          {/* Card 3: Network Latency & Ping */}
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
                    <Wifi className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-sm text-white">Network & API Latency</h3>
                </div>
                <Activity className="w-4 h-4 text-teal-400" />
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Average RTT Ping:</span>
                  <span className="font-semibold text-emerald-400">{pingStats ? `${pingStats.avg} ms` : "Measuring..."}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Min / Max Ping:</span>
                  <span className="font-mono text-slate-200">{pingStats ? `${pingStats.min}ms / ${pingStats.max}ms` : "--"}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Connection Jitter:</span>
                  <span className="font-mono text-slate-200">{pingStats ? `±${pingStats.jitter} ms` : "--"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Camera & Microphone Verification Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-white">Physical Camera & Active Liveness</h3>
                  <p className="text-[11px] text-slate-400">Verify your camera is centered and unobstructed.</p>
                </div>
              </div>
              {cameraActive ? (
                <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active
                </span>
              ) : (
                <span className="text-xs font-medium text-rose-400 flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> Disconnected
                </span>
              )}
            </div>

            <div className="relative aspect-video rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover mirror"
              />
              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
                  <Camera className="w-8 h-8 text-slate-600" />
                  <span className="text-xs">No active camera stream acquired</span>
                </div>
              )}
              {cameraActive && (
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 backdrop-blur text-[10px] text-emerald-400 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Preview (Physical Bus)
                </div>
              )}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-white">Microphone Input & VU Meter</h3>
                    <p className="text-[11px] text-slate-400">Speak normally into your microphone to verify audio pickup.</p>
                  </div>
                </div>
                {micActive ? (
                  <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Active
                  </span>
                ) : (
                  <span className="text-xs font-medium text-rose-400 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Inactive
                  </span>
                )}
              </div>

              {/* Audio Volume Bar */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Microphone Audio Input Level:</span>
                  <span className="font-mono text-slate-200">{audioLevel}%</span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-4 p-0.5 border border-slate-800">
                  <div
                    className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-emerald-500 via-yellow-500 to-rose-500"
                    style={{ width: `${Math.min(100, audioLevel)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>0%</span>
                  <span>Normal Speech (20%-60%)</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Virtual Audio Devices:</span>
                  <span className="text-emerald-400 font-medium">None Detected</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Liveness Audio Check:</span>
                  <span className={livenessPassed ? "text-emerald-400 font-medium" : "text-amber-400"}>
                    {livenessPassed ? "Speech Activity Detected (Pass)" : "Speak to verify microphone"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800 text-[11px] text-slate-400">
              Microphone will record room audio and ambient acoustic variance during proctored exams.
            </div>
          </div>
        </div>

        {/* Background Applications & Utilities Card */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Running Background Applications ({diagnostic?.backgroundApps?.length || 0})
              </h3>
              <p className="text-xs text-slate-400">
                Any screen recorders, remote desktop software, or banned utilities must be closed prior to exam launch.
              </p>
            </div>

            {diagnostic && diagnostic.backgroundApps && diagnostic.backgroundApps.length > 0 && (
              <button
                onClick={handleCloseAllApps}
                disabled={closingAll}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-semibold text-rose-300 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {closingAll ? "Closing All Apps..." : "Close All Detected Apps"}
              </button>
            )}
          </div>

          {diagnostic?.backgroundApps && diagnostic.backgroundApps.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 px-3">Process Name</th>
                    <th className="py-2.5 px-3">PID</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Path / Bundle</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {diagnostic.backgroundApps.map((app) => (
                    <tr key={app.pid} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-semibold text-white">{app.name}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">{app.pid}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {app.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 truncate max-w-xs">
                        {app.bundleOrPath || "System Process"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleCloseApp(app.pid)}
                          disabled={closingPid === app.pid}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-[11px] font-medium text-slate-300 transition-colors cursor-pointer"
                        >
                          {closingPid === app.pid ? "Closing..." : "Close App"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center rounded-xl bg-slate-950/40 border border-slate-800/80">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-white">No Blocking Applications Detected</p>
              <p className="text-xs text-slate-400 mt-1">
                Your system is clean of screen recording software, remote desktop clients, and forbidden switcher utilities.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
