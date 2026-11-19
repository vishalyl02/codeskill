"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Camera, Mic, AlertCircle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import {
  checkAndRequestMediaPermissions,
  inspectMediaHardware,
  savePersistedExamSession,
  MediaPermissionStatus,
  isLockdownClient,
} from "@/lib/lockdown-bridge";

const VIRTUAL_DEVICE_KEYWORDS = [
  'obs',
  'virtual',
  'manycam',
  'camtwist',
  'snap camera',
  'mmhmm',
  'epoccam',
  'droidcam',
  'iriun',
  'blackhole',
  'vb-audio',
  'vb-cable',
  'soundflower',
  'loopback',
];

function isVirtualDeviceLabel(label: string): boolean {
  const lower = (label || '').toLowerCase();
  return VIRTUAL_DEVICE_KEYWORDS.some((kw) => lower.includes(kw));
}

async function verifyCameraLiveness(videoElement: HTMLVideoElement): Promise<boolean> {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 36;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return true;

  const samples: number[] = [];
  const sampleIntervalMs = 240; // 5 samples across 1200ms

  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, sampleIntervalMs));
    ctx.drawImage(videoElement, 0, 0, 64, 36);
    const frameData = ctx.getImageData(0, 0, 64, 36).data;
    let totalLuma = 0;
    for (let p = 0; p < frameData.length; p += 4) {
      const luma = 0.299 * frameData[p] + 0.587 * frameData[p + 1] + 0.114 * frameData[p + 2];
      totalLuma += luma;
    }
    const avgLuma = totalLuma / (frameData.length / 4);
    samples.push(avgLuma);
  }

  const isCompletelyBlank = samples.every((s) => s < 2 || s > 253);
  if (isCompletelyBlank) return false;

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / samples.length;
  return variance > 0.0001;
}

interface LockdownMediaPermissionGateProps {
  assessmentId: string;
  requireCamera?: boolean;
  requireMic?: boolean;
  onReady: () => void;
}

export default function LockdownMediaPermissionGate({
  assessmentId,
  requireCamera = true,
  requireMic = true,
  onReady,
}: LockdownMediaPermissionGateProps) {
  const [osStatus, setOsStatus] = useState<MediaPermissionStatus | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(true);
  const [cameraVerified, setCameraVerified] = useState<boolean>(!requireCamera);
  const [micVerified, setMicVerified] = useState<boolean>(!requireMic);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const stopActiveStream = useCallback(() => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        void audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const verifyMediaStreams = useCallback(async () => {
    setIsVerifying(true);
    setStreamError(null);
    stopActiveStream();

    try {
      // 0. Native hardware bus & driver audit (if running in LockDown)
      if (isLockdownClient()) {
        try {
          const audit = await inspectMediaHardware();
          if (!audit.passed && audit.virtualDevicesDetected.length > 0) {
            setStreamError(
              `Virtual camera or audio driver detected (${audit.virtualDevicesDetected.join(', ')}). Virtual devices are strictly prohibited during the exam. Please disconnect virtual drivers and use a physical camera/mic.`,
            );
            setIsVerifying(false);
            return;
          }
        } catch (auditErr) {
          console.warn('[LockdownMediaPermissionGate] Media hardware audit check warning:', auditErr);
        }
      }

      // 1. Check OS-level permissions via Rust bridge
      const status = await checkAndRequestMediaPermissions(requireCamera, requireMic);
      setOsStatus(status);

      if (requireCamera && status.camera === "denied") {
        setStreamError("Camera permission was denied in your operating system settings. Please grant Camera access in System Settings.");
        setIsVerifying(false);
        return;
      }

      if (requireMic && status.microphone === "denied") {
        setStreamError("Microphone permission was denied in your operating system settings. Please grant Microphone access in System Settings.");
        setIsVerifying(false);
        return;
      }

      // 2. Request browser media stream
      const constraints: MediaStreamConstraints = {
        video: requireCamera ? { width: { ideal: 640, max: 1280 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 15 } } : false,
        audio: requireMic,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      activeStreamRef.current = stream;

      // 3. Verify video track
      if (requireCamera) {
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack || videoTrack.readyState !== "live") {
          throw new Error("Camera track could not be initialized in live state.");
        }
        if (isVirtualDeviceLabel(videoTrack.label || '')) {
          throw new Error(`Virtual camera detected: "${videoTrack.label}". Virtual cameras and pre-recorded loops are strictly prohibited. Please switch to a physical hardware webcam.`);
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          // Active liveness verification (5 frames sampled over 1.2s)
          const isLive = await verifyCameraLiveness(videoRef.current);
          if (!isLive) {
            throw new Error("Camera feed is static or frozen. A live physical camera feed with active frame variance is required.");
          }
        }
        setCameraVerified(true);
      }

      // 4. Verify audio track & measure audio level
      if (requireMic) {
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack || audioTrack.readyState !== "live") {
          throw new Error("Microphone track could not be initialized in live state.");
        }
        if (isVirtualDeviceLabel(audioTrack.label || '')) {
          throw new Error(`Virtual microphone detected: "${audioTrack.label}". Virtual audio routing is strictly prohibited. Please switch to a physical hardware microphone.`);
        }

        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const audioCtx = new AudioContextClass();
            audioContextRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const checkLevel = () => {
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length;
              setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
              animFrameRef.current = requestAnimationFrame(checkLevel);
            };
            checkLevel();
          }
        } catch {
          // Audio level meter fallback
        }
        setMicVerified(true);
      }

      // 5. Persist media verification in Rust journal
      if (isLockdownClient()) {
        await savePersistedExamSession({
          assessmentId,
          mediaPermissionsVerified: true,
        });
      }
    } catch (err: any) {
      console.error("[LockdownMediaPermissionGate] Hardware verification failed:", err);
      const msg = err?.message || "Failed to access camera or microphone hardware.";
      setStreamError(msg);
      setCameraVerified(false);
      setMicVerified(false);
    } finally {
      setIsVerifying(false);
    }
  }, [requireCamera, requireMic, assessmentId, stopActiveStream]);

  useEffect(() => {
    void verifyMediaStreams();
    return () => {
      stopActiveStream();
    };
  }, [verifyMediaStreams, stopActiveStream]);

  const allVerified = (!requireCamera || cameraVerified) && (!requireMic || micVerified) && !streamError;

  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4 text-center">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-left space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Pre-Exam Hardware & Media Verification</h2>
            <p className="text-sm text-slate-400">
              Exam security requires active camera and microphone streams before entering the assessment.
            </p>
          </div>
        </div>

        {streamError ? (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-rose-300">Device Access Denied or Missing</p>
              <p className="text-slate-300">{streamError}</p>
              <p className="text-xs text-slate-400 pt-1">
                macOS: System Settings &gt; Privacy & Security &gt; Camera / Microphone.<br />
                Windows: Settings &gt; Privacy &gt; Camera / Microphone (Allow desktop apps).
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {requireCamera && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <Camera className="w-4 h-4 text-primary" />
                  <span>Camera Stream</span>
                </div>
                {cameraVerified ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" /> Ready
                  </span>
                ) : (
                  <span className="text-xs font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    Checking...
                  </span>
                )}
              </div>
              <div className="relative aspect-video rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
                {!cameraVerified && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                    <Camera className="w-8 h-8 text-slate-600 animate-pulse" />
                  </div>
                )}
              </div>
            </div>
          )}

          {requireMic && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <Mic className="w-4 h-4 text-primary" />
                    <span>Microphone Stream</span>
                  </div>
                  {micVerified ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" /> Ready
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                      Checking...
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Speak into your microphone to verify live audio input levels.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-xs text-slate-400 font-mono">
                  <span>Input Level</span>
                  <span>{audioLevel}%</span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-75"
                    style={{ width: `${Math.max(5, audioLevel)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => void verifyMediaStreams()}
            disabled={isVerifying}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isVerifying ? "animate-spin" : ""}`} />
            Retry Permission Check
          </button>

          <button
            type="button"
            onClick={() => {
              if (allVerified) {
                stopActiveStream();
                onReady();
              }
            }}
            disabled={!allVerified || isVerifying}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Media Setup & Enter
          </button>
        </div>
      </div>
    </div>
  );
}
