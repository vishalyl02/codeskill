"use client";

import { memo } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Loader2, Maximize2, Minimize2,
  PanelLeft, Send, ShieldAlert, ShieldCheck, WifiOff,
} from "lucide-react";
import type { SyncStatus } from "@/lib/offline-autosave-queue";

interface IntegrityBadgeProps {
  isLockdownActive: boolean;
  showPenalty: boolean;
  totalPenaltyMarks: number;
  violationCount: number;
}

// Countdown and autosave updates must not redraw the unchanged integrity badges.
const AssessmentIntegrityBadges = memo(function AssessmentIntegrityBadges({
  isLockdownActive, showPenalty, totalPenaltyMarks, violationCount,
}: IntegrityBadgeProps) {
  return (
    <>
      {isLockdownActive && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-semibold select-none shadow-xs"
          title="CodeSkill LockDown active: Attestation verified & OS kiosk engaged"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>LockDown Active</span>
        </div>
      )}
      {showPenalty && (
        <div
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md border text-xs font-mono font-bold transition-all shadow-xs ${
            totalPenaltyMarks > 0
              ? "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
              : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800"
          }`}
          title="Partial proctored exam: Negative marks applied for violations. Manual submission is required."
        >
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>
            Penalty: -{totalPenaltyMarks}
          </span>
          <span className="hidden lg:inline font-normal text-[10px] opacity-80">
            ({violationCount} {violationCount === 1 ? "violation" : "violations"})
          </span>
        </div>
      )}
    </>
  );
});

interface AssessmentTakeHeaderProps extends IntegrityBadgeProps {
  questionNumber: number;
  totalQuestionCount: number;
  assessmentCode: string;
  topic: string;
  subtopic?: string;
  timeRemaining: string;
  isTimeCritical: boolean;
  questionTimeRemaining?: string;
  isQuestionTimeCritical: boolean;
  syncStatus: SyncStatus;
  pendingSyncCount: number;
  isFullscreen: boolean;
  enforceFullscreen: boolean;
  tabSwitches: number;
  maxTabSwitches: number;
  submitDisabled: boolean;
  onToggleSidebar: () => void;
  onToggleFullscreen: () => void;
  onSubmit: () => void;
}

export const AssessmentTakeHeader = memo(function AssessmentTakeHeader({
  questionNumber, totalQuestionCount, assessmentCode, topic, subtopic,
  isLockdownActive, showPenalty, totalPenaltyMarks, violationCount,
  timeRemaining, isTimeCritical, questionTimeRemaining, isQuestionTimeCritical,
  syncStatus, pendingSyncCount, isFullscreen, enforceFullscreen, tabSwitches,
  maxTabSwitches, submitDisabled, onToggleSidebar, onToggleFullscreen, onSubmit,
}: AssessmentTakeHeaderProps) {
  return (
    <header className="h-16 shrink-0 border-b border-border bg-card/95 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-3">
        <button type="button" aria-label="Toggle question sidebar" aria-controls="assessment-question-sidebar" onClick={onToggleSidebar} className="rounded-lg border border-border p-2 hover:bg-muted"><PanelLeft className="size-4" /></button>
        {/* CU Official Logo */}
        <div className="w-9 h-9 rounded-xl overflow-hidden bg-muted/40 shrink-0 border border-border p-1 flex items-center justify-center">
          <img
            src="https://images.seeklogo.com/logo-png/43/1/chandigarh-university-cu-logo-png_seeklogo-432515.png"
            alt="Chandigarh University"
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/cu-logo.png";
            }}
          />
        </div>
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs font-mono shadow-xs">
          Q{questionNumber}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xs sm:text-sm font-bold text-foreground">
              Question {questionNumber} <span className="text-muted-foreground font-normal">of {totalQuestionCount}</span>
            </h1>
            <span className="hidden sm:inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-foreground border border-border">
              Chandigarh University
            </span>
            {assessmentCode && (
              <span className="hidden md:inline px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-muted text-foreground border border-border">
                {assessmentCode}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground font-medium truncate max-w-[140px] sm:max-w-none">
            {topic} {subtopic ? `• ${subtopic}` : ""}
          </p>
        </div>
      </div>

      {/* Center: Live Countdown Clock & Penalty Badge */}
      <div className="flex items-center gap-2 sm:gap-3">
        <AssessmentIntegrityBadges
          isLockdownActive={isLockdownActive}
          showPenalty={showPenalty}
          totalPenaltyMarks={totalPenaltyMarks}
          violationCount={violationCount}
        />

        <div
          className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-md border text-xs sm:text-sm font-mono font-bold transition-all ${
            isTimeCritical
              ? "bg-rose-50 text-rose-700 border-rose-300 animate-pulse shadow-xs"
              : "bg-slate-50 text-slate-800 border-slate-200"
          }`}
        >
          <Clock className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isTimeCritical ? "text-rose-600" : "text-primary"}`} />
          <span>{timeRemaining}</span>
        </div>

        {questionTimeRemaining !== undefined && (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-mono font-bold ${
              isQuestionTimeCritical
                ? "bg-rose-50 text-rose-700 border-rose-300 animate-pulse dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
                : "bg-slate-50 text-slate-800 border-slate-200"
            }`}
            aria-label={`Question time remaining: ${questionTimeRemaining}`}
          >
            <Clock className={`w-3.5 h-3.5 ${isQuestionTimeCritical ? "text-rose-600" : "text-primary"}`} />
            <span>Question {questionTimeRemaining}</span>
          </div>
        )}

        {/* Offline Autosave Live Sync Indicator */}
        <div className="flex items-center">
          {syncStatus === 'synced' && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 text-[11px] font-medium transition-all shadow-xs"
              title="All answers saved to server"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Saved</span>
            </div>
          )}
          {syncStatus === 'syncing' && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800 text-[11px] font-medium transition-all shadow-xs"
              title="Syncing answers with server"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600 dark:text-sky-400" />
              <span className="hidden sm:inline">Syncing...</span>
            </div>
          )}
          {syncStatus === 'offline-buffered' && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-700 text-[11px] font-medium animate-pulse shadow-xs"
              title="Wi-Fi disconnected. Answers are encrypted and stored locally, will sync automatically once connected."
            >
              <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Offline — {pendingSyncCount} {pendingSyncCount === 1 ? 'answer' : 'answers'} saved locally (Encrypted)</span>
            </div>
          )}
          {syncStatus === 'error' && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800 text-[11px] font-medium shadow-xs"
              title="Temporary sync error. Retrying automatically..."
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>Sync Error ({pendingSyncCount})</span>
            </div>
          )}
        </div>

        {/* Fullscreen Button */}
        <button
          onClick={onToggleFullscreen}
          className="hidden sm:flex items-center justify-center p-2 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
          disabled={isFullscreen && enforceFullscreen}
          title={isFullscreen && enforceFullscreen ? "Fullscreen required during the test" : isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Tab Switch Strike Counter */}
        {tabSwitches > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{tabSwitches}/{maxTabSwitches}</span>
          </div>
        )}

        {/* Permanent Top Submit Test Button */}
        <button
          aria-label="Submit Test"
          onClick={onSubmit}
          disabled={submitDisabled}
          className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-md bg-primary hover:bg-primary/90 active:bg-primary/80 text-white text-xs font-semibold uppercase tracking-wider transition-all shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Submit Test</span>
        </button>
      </div>
    </header>
  );
});
