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
  Lock,
  Unlock,
  CheckCircle2,
} from "lucide-react";

export interface CodeSnapshot {
  timestamp?: string;
  createdAt?: string;
  code: string;
  charDelta?: number;
  pasteEvent?: boolean;
  problemId?: string;
  language?: string;
  status?: string;
}

interface IntegrityReviewCardProps {
  candidateName: string;
  candidateId?: string;
  assessmentId?: string;
  gradeHeld?: boolean;
  gradeHoldReason?: string;
  violations?: Array<{
    type: string;
    details?: string;
    timestamp?: string;
    severity?: "LOW" | "MEDIUM" | "HIGH";
  }>;
  codeSnapshots?: CodeSnapshot[];
  onDecisionChange?: (newHold: boolean, reason?: string) => void;
}

export default function IntegrityReviewCard({
  candidateName,
  candidateId,
  assessmentId,
  gradeHeld = false,
  gradeHoldReason = "",
  violations = [],
  codeSnapshots = [],
  onDecisionChange,
}: IntegrityReviewCardProps) {
  // Code Evolution Replay Scrubber State
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isHolding, setIsHolding] = useState<boolean>(gradeHeld);
  const [holdReason, setHoldReason] = useState<string>(gradeHoldReason);
  const [updatingHold, setUpdatingHold] = useState<boolean>(false);

  useEffect(() => {
    setIsHolding(gradeHeld);
    setHoldReason(gradeHoldReason);
  }, [gradeHeld, gradeHoldReason]);

  // If no snapshots passed, synthesize evolution points for replay demo
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
      }, 1000 / playbackSpeed);
    }
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, snapshots.length]);

  const activeSnapshot = snapshots[currentStep] || snapshots[0];

  const handleToggleGradeHold = async (decision: "HOLD_GRADE" | "CLEAR_HOLD") => {
    if (!assessmentId || !candidateId) {
      const nextHold = decision === "HOLD_GRADE";
      setIsHolding(nextHold);
      onDecisionChange?.(nextHold, holdReason);
      return;
    }

    setUpdatingHold(true);
    try {
      const res = await fetch(
        `/api/exam-security/assessments/${assessmentId}/candidates/${candidateId}/integrity-decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            reason: decision === "HOLD_GRADE" ? holdReason || "Under instructor integrity review" : "",
          }),
        },
      );
      if (res.ok) {
        const nextHold = decision === "HOLD_GRADE";
        setIsHolding(nextHold);
        onDecisionChange?.(nextHold, holdReason);
      }
    } catch (err) {
      console.error("Failed to update grade hold:", err);
    } finally {
      setUpdatingHold(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      {/* Header and Grade Hold Decision Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white">
              Integrity Review & Code Evolution: {candidateName}
            </h2>
            {isHolding ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Grade Held
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Grade Released
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Plain-English security breakdown, keystroke velocity, and code evolution replay.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isHolding ? (
            <button
              onClick={() => handleToggleGradeHold("CLEAR_HOLD")}
              disabled={updatingHold}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Unlock className="w-3.5 h-3.5" />
              {updatingHold ? "Updating..." : "Release Grade"}
            </button>
          ) : (
            <button
              onClick={() => handleToggleGradeHold("HOLD_GRADE")}
              disabled={updatingHold}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Lock className="w-3.5 h-3.5" />
              {updatingHold ? "Updating..." : "Hold Grade"}
            </button>
          )}
        </div>
      </div>

      {/* Grid: Violations & Replay */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Violations / Plain English Summary */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-400" />
              Integrity Summary
            </h3>
            {violations.length === 0 ? (
              <div className="p-4 text-center rounded-lg bg-emerald-950/20 border border-emerald-900/40">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                <p className="text-xs font-medium text-emerald-300">Clean Session Recorded</p>
                <p className="text-[11px] text-emerald-400/80">
                  Zero critical environmental or hardware violations detected during examination.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {violations.map((v, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-rose-300 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                        {v.type.replace(/_/g, " ")}
                      </span>
                      {v.timestamp && (
                        <span className="text-[10px] font-mono text-slate-500">{v.timestamp}</span>
                      )}
                    </div>
                    {v.details && <p className="text-[11px] text-slate-400">{v.details}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Code Evolution Replay Scrubber */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-white">Code Evolution Replay</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                  Step {currentStep + 1} of {snapshots.length}
                </span>
                {activeSnapshot.pasteEvent && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Burst Paste
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPlaybackSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  {playbackSpeed}x Speed
                </button>
              </div>
            </div>

            {/* Code Content View */}
            <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-3 font-mono text-xs text-slate-200 h-64 overflow-y-auto whitespace-pre leading-relaxed">
              {activeSnapshot.code || "// No code captured at this step."}
            </div>

            {/* Scrubber Controls */}
            <div className="space-y-2 pt-1">
              <input
                type="range"
                min={0}
                max={snapshots.length - 1}
                value={currentStep}
                onChange={(e) => {
                  setCurrentStep(Number(e.target.value));
                  setIsPlaying(false);
                }}
                className="w-full accent-indigo-500 cursor-pointer"
              />

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1 font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5" />
                  {activeSnapshot.timestamp || activeSnapshot.createdAt || "00:00:00"}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setCurrentStep(0);
                      setIsPlaying(false);
                    }}
                    className="p-1 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
                    title="Restart"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setCurrentStep((p) => Math.max(0, p - 1));
                      setIsPlaying(false);
                    }}
                    className="p-1 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
                    title="Step backward"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => {
                      setCurrentStep((p) => Math.min(snapshots.length - 1, p + 1));
                      setIsPlaying(false);
                    }}
                    className="p-1 rounded hover:bg-slate-800 text-slate-300 cursor-pointer"
                    title="Step forward"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>
                </div>

                <span className="font-mono text-[11px]">
                  Delta: +{activeSnapshot.charDelta || 0} chars
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
