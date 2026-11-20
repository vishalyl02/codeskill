"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { CheckCircle2, Star, MessageSquare, AlertCircle, LogOut, Sparkles } from "lucide-react";
import api from "@/config/api";
import {
  releaseLockdownKiosk,
  exitLockdownApp,
  logoutAndExitLockdown,
  isLockdownClient,
} from "@/lib/lockdown-bridge";
import { LockdownSessionStore } from "@/lib/lockdown-session-store";

interface LockdownSubmissionFeedbackProps {
  assessmentId: string;
  submissionReceiptId?: string;
  submittedAt?: Date | number;
  kioskMode?: string;
}

const ISSUE_CHIPS = [
  "No issues",
  "Audio / Video",
  "Network lag",
  "Editor / UI",
  "System shortcuts",
  "Dock / Battery tools",
];

export default function LockdownSubmissionFeedback({
  assessmentId,
  submissionReceiptId = `REC-${Date.now().toString(36).toUpperCase()}`,
  submittedAt = new Date(),
  kioskMode = "standard",
}: LockdownSubmissionFeedbackProps) {
  const submittedTime = typeof submittedAt === "number" ? submittedAt : new Date(submittedAt).getTime();
  const elapsedSecs = Math.max(0, Math.floor((Date.now() - submittedTime) / 1000));
  const initialRemaining = Math.max(0, 10 - elapsedSecs);

  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [selectedIssues, setSelectedIssues] = useState<string[]>(["No issues"]);
  const [comments, setComments] = useState<string>("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState<boolean>(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(initialRemaining);
  const [hasExtendedTimer, setHasExtendedTimer] = useState<boolean>(false);

  const timerEndTimeRef = useRef<number>(Date.now() + initialRemaining * 1000);
  const submittedFeedbackRef = useRef<boolean>(false);

  // Extend timer by 15 seconds once when user interacts (focuses comment box or changes rating)
  const extendTimer = useCallback(() => {
    if (!hasExtendedTimer) {
      setHasExtendedTimer(true);
      timerEndTimeRef.current = Math.max(timerEndTimeRef.current, Date.now() + 15 * 1000);
      setRemainingSeconds(Math.ceil((timerEndTimeRef.current - Date.now()) / 1000));
    }
  }, [hasExtendedTimer]);

  const handleToggleIssue = (chip: string) => {
    extendTimer();
    if (chip === "No issues") {
      setSelectedIssues(["No issues"]);
      return;
    }
    setSelectedIssues((prev) => {
      const filtered = prev.filter((i) => i !== "No issues");
      if (filtered.includes(chip)) {
        const next = filtered.filter((i) => i !== chip);
        return next.length === 0 ? ["No issues"] : next;
      } else {
        return [...filtered, chip];
      }
    });
  };

  const submitFeedbackToServer = useCallback(async () => {
    if (submittedFeedbackRef.current) return;
    submittedFeedbackRef.current = true;
    try {
      await api.post(`/api/assessments/${assessmentId}/lockdown-feedback`, {
        rating,
        technicalIssues: selectedIssues,
        comments: comments.trim() || undefined,
        kioskMode,
      });
    } catch (err) {
      console.warn("[LockdownSubmissionFeedback] Feedback submission skipped or offline:", err);
    }
  }, [assessmentId, rating, selectedIssues, comments, kioskMode]);

  const finalizeAndExit = useCallback(async () => {
    setIsSubmittingFeedback(true);
    // 1. Submit feedback non-blockingly
    await submitFeedbackToServer();

    // 2. Clear persisted exam sessions and storage
    await LockdownSessionStore.clearState(assessmentId);

    // 3. Release OS kiosk lock (caffeinate, presentations, hooks, desktops)
    if (isLockdownClient()) {
      await releaseLockdownKiosk();
      await exitLockdownApp();
    } else {
      window.location.href = `/assessments/${assessmentId}/result`;
    }
  }, [assessmentId, submitFeedbackToServer]);

  // Precise delta countdown timer
  useEffect(() => {
    const interval = window.setInterval(() => {
      const remainingMs = timerEndTimeRef.current - Date.now();
      const secs = Math.max(0, Math.ceil(remainingMs / 1000));
      setRemainingSeconds(secs);

      if (secs <= 0) {
        window.clearInterval(interval);
        void finalizeAndExit();
      }
    }, 200);

    return () => window.clearInterval(interval);
  }, [finalizeAndExit]);

  const formattedDate = new Date(submittedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4 text-center">
      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-left">
        {/* Header confirmation badge */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">Assessment Submitted</h2>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <Sparkles className="w-3 h-3" /> Confirmed
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Receipt: <span className="font-mono text-slate-300 font-semibold">{submissionReceiptId}</span>
            </p>
            <p className="text-[11px] text-slate-500">Submitted at: {formattedDate}</p>
          </div>
        </div>

        {/* 1 - 5 Star Rating */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            How was your examination experience?
          </label>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(null)}
                onClick={() => {
                  extendTimer();
                  setRating(star);
                }}
                className="p-1 rounded-lg transition-transform hover:scale-110 cursor-pointer"
              >
                <Star
                  className={`w-7 h-7 ${
                    (hoverRating !== null ? star <= hoverRating : star <= rating)
                      ? "text-amber-400 fill-amber-400"
                      : "text-slate-600"
                  }`}
                />
              </button>
            ))}
            <span className="text-xs font-medium text-slate-400 pl-2">
              {rating === 5 ? "Smooth & Seamless" : rating === 4 ? "Good" : rating === 3 ? "Average" : rating === 2 ? "A few issues" : "Difficult"}
            </span>
          </div>
        </div>

        {/* Technical issue chips */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Did you encounter any technical issues?
          </label>
          <div className="flex flex-wrap gap-2">
            {ISSUE_CHIPS.map((chip) => {
              const active = selectedIssues.includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleToggleIssue(chip)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                    active
                      ? "bg-primary/20 border-primary text-primary-foreground"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Comments Box */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1 font-semibold uppercase tracking-wider text-slate-300">
              <MessageSquare className="w-3.5 h-3.5" /> Comments (Optional)
            </span>
            {hasExtendedTimer && (
              <span className="text-[11px] text-primary">Timer extended by 15s</span>
            )}
          </div>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            onFocus={extendTimer}
            rows={2}
            placeholder="Share feedback on editor latency, layout, or client stability..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Countdown & Exit Action */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Auto-closing in{" "}
            <span className="font-bold text-emerald-400 text-sm font-mono">{remainingSeconds}</span>s
          </div>

          <button
            type="button"
            onClick={() => void finalizeAndExit()}
            disabled={isSubmittingFeedback}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            {isSubmittingFeedback ? "Exiting..." : "Submit & Exit Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
