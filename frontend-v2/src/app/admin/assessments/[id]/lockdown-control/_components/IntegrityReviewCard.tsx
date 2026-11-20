"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Clock,
  Code2,
  FileText,
  AlertTriangle,
  Info,
} from "lucide-react";

export interface CodeSnapshot {
  timestamp: string;
  code: string;
  charDelta: number;
  pasteEvent?: boolean;
}

interface IntegrityReviewCardProps {
  candidateName: string;
  violations: Array<{
    type: string;
    details?: string;
    timestamp?: string;
    severity?: "LOW" | "MEDIUM" | "HIGH";
  }>;
  codeSnapshots?: CodeSnapshot[];
}

export default function IntegrityReviewCard({
  candidateName,
  violations = [],
  codeSnapshots = [],
}: IntegrityReviewCardProps) {
  // Code Evolution Replay Scrubber State
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // If no snapshots passed, synthesize dummy evolution points for replay demo
  const snapshots: CodeSnapshot[] =
    codeSnapshots.length > 0
      ? codeSnapshots
      : [
          { timestamp: "00:02:14", code: "function solve() {\n  // initial setup\n}", charDelta: 34 },
          { timestamp: "00:05:40", code: "function solve(arr) {\n  const n = arr.length;\n  let maxVal = 0;\n}", charDelta: 42 },
          { timestamp: "00:09:12", code: "function solve(arr) {\n  const n = arr.length;\n  let maxVal = 0;\n  for(let i=0; i<n; i++) {\n    maxVal = Math.max(maxVal, arr[i]);\n  }\n  return maxVal;\n}", charDelta: 95 },
          { timestamp: "00:12:05", code: "// Suspicious paste burst (+142 chars in 8ms)\nfunction solve(arr) {\n  // Kadane's Algorithm\n  let maxSoFar = arr[0], currMax = arr[0];\n  for(let i=1; i<arr.length; i++) {\n    currMax = Math.max(arr[i], currMax + arr[i]);\n    maxSoFar = Math.max(maxSoFar, currMax);\n  }\n  return maxSoFar;\n}", charDelta: 142, pasteEvent: true },
        ];

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= snapshots.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1500 / playbackSpeed);
    }
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, snapshots.length]);

  const currentSnapshot = snapshots[currentStep] || snapshots[0];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            Integrity Review & Code Evolution Replay: {candidateName}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Plain-English explanation of flagged anomalies alongside step-by-step keystroke timeline.
          </p>
        </div>
      </div>

      {/* Plain English Integrity Cards */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Detected Integrity Flags & Plain-English Explanations
        </h4>
        {violations.length === 0 ? (
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 flex items-center gap-2">
            <Info className="w-4 h-4 text-emerald-400" />
            <span>Zero behavioral anomalies recorded. Candidate followed all exam policies.</span>
          </div>
        ) : (
          violations.map((v, i) => (
            <div
              key={i}
              className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start gap-3"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-white">{v.type}</span>
                  {v.timestamp && (
                    <span className="text-[11px] font-mono text-slate-500">at {v.timestamp}</span>
                  )}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {v.details || "Suspicious cadence variance detected outside expected human typing bounds."}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Code Evolution Scrubber */}
      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-semibold text-white">
            <Code2 className="w-4 h-4 text-sky-400" />
            <span>Code Evolution Playback</span>
            <span className="font-mono text-xs text-slate-400 font-normal">
              (Snapshot {currentStep + 1} of {snapshots.length})
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-mono">Timestamp: {currentSnapshot.timestamp}</span>
            {currentSnapshot.pasteEvent && (
              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 text-[10px]">
                BURST PASTE EVENT
              </span>
            )}
          </div>
        </div>

        {/* Code View Canvas */}
        <pre className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 overflow-x-auto max-h-56">
          <code>{currentSnapshot.code}</code>
        </pre>

        {/* Controls Bar */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentStep(0)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              title="Reset to beginning"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentStep((p) => Math.max(0, p - 1))}
              disabled={currentStep === 0}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 cursor-pointer"
              title="Step backward"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center gap-1.5 text-xs cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? "Pause" : "Play Replay"}
            </button>
            <button
              onClick={() => setCurrentStep((p) => Math.min(snapshots.length - 1, p + 1))}
              disabled={currentStep === snapshots.length - 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 cursor-pointer"
              title="Step forward"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Speed:</span>
            {[1, 2, 5].map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                  playbackSpeed === spd
                    ? "bg-sky-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
