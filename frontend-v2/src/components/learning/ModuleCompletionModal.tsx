"use client";

import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Code2,
  FileQuestion,
  BookOpen,
  X,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CompletionCriteria {
  timeSpent: number;
  requiredTime: number;
  timeRemaining: number;
  timeMet: boolean;
  quizMet: boolean;
  codingMet: boolean;
}

export interface ModuleCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  reasons: string[];
  criteria?: CompletionCriteria;
  onNavigateTab?: (tab: "content" | "quiz" | "coding") => void;
}

export const ModuleCompletionModal: React.FC<ModuleCompletionModalProps> = ({
  isOpen,
  onClose,
  title = "Module Requirements Incomplete",
  reasons,
  criteria,
  onNavigateTab,
}) => {
  if (!isOpen) return null;

  const timeProgress = criteria
    ? Math.min(100, Math.round((criteria.timeSpent / (criteria.requiredTime || 1)) * 100))
    : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="module-completion-title"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="bg-card text-card-foreground border border-border/80 rounded-2xl p-6 sm:p-7 max-w-lg w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3
                id="module-completion-title"
                className="text-lg font-bold text-foreground tracking-tight"
              >
                {title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Complete the remaining items below before advancing to the next module
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Criteria Breakdown */}
        <div className="space-y-3">
          {/* 1. Time Spent */}
          {criteria && (
            <div
              className={`p-3.5 rounded-xl border transition-all ${
                criteria.timeMet
                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/5 border-amber-500/25 text-amber-600 dark:text-amber-400"
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold mb-2">
                <span className="flex items-center gap-1.5 text-foreground">
                  <Clock className="w-4 h-4 text-primary" />
                  Study Duration Requirement
                </span>
                <span className="font-mono">
                  {criteria.timeSpent}s / {criteria.requiredTime}s
                </span>
              </div>
              <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    criteria.timeMet ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${timeProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                {criteria.timeMet ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Requirement satisfied
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                    <Clock className="w-3.5 h-3.5" /> {criteria.timeRemaining}s remaining engagement needed
                  </span>
                )}
                {!criteria.timeMet && onNavigateTab && (
                  <button
                    onClick={() => {
                      onNavigateTab("content");
                      onClose();
                    }}
                    className="text-primary hover:underline font-semibold flex items-center gap-0.5"
                  >
                    Read content <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 2. Quiz Requirement */}
          {criteria && criteria.quizMet !== undefined && (
            <div
              className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                criteria.quizMet
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : "bg-rose-500/5 border-rose-500/25"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    criteria.quizMet
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-rose-500/10 text-rose-500"
                  }`}
                >
                  <FileQuestion className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    Module Concept Quiz
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {criteria.quizMet
                      ? "Passed quiz with required score"
                      : "Quiz questions not yet completed or score below threshold"}
                  </div>
                </div>
              </div>
              {!criteria.quizMet && onNavigateTab && (
                <button
                  onClick={() => {
                    onNavigateTab("quiz");
                    onClose();
                  }}
                  className="text-xs text-primary font-semibold hover:underline flex items-center gap-0.5 ml-2 shrink-0"
                >
                  Take Quiz <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* 3. Coding Requirement */}
          {criteria && criteria.codingMet !== undefined && (
            <div
              className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                criteria.codingMet
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : "bg-rose-500/5 border-rose-500/25"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    criteria.codingMet
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-rose-500/10 text-rose-500"
                  }`}
                >
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    Interactive Coding Exercise
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {criteria.codingMet
                      ? "All coding test cases executed and passed"
                      : "Exercise test cases pending verification"}
                  </div>
                </div>
              </div>
              {!criteria.codingMet && onNavigateTab && (
                <button
                  onClick={() => {
                    onNavigateTab("coding");
                    onClose();
                  }}
                  className="text-xs text-primary font-semibold hover:underline flex items-center gap-0.5 ml-2 shrink-0"
                >
                  Solve Code <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Textual Reasons List if supplied */}
        {reasons.length > 0 && (
          <div className="p-3 bg-muted/40 rounded-xl border border-border/60 space-y-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground text-[11px] block uppercase tracking-wider">
              Specific Feedback
            </span>
            <ul className="list-disc list-inside space-y-1">
              {reasons.map((r, i) => (
                <li key={i} className="leading-relaxed">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-2 flex flex-wrap items-center justify-end gap-2.5">
          {onNavigateTab && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onNavigateTab("content");
                onClose();
              }}
              className="text-xs h-9 gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Study Content
            </Button>
          )}
          <Button
            size="sm"
            onClick={onClose}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 px-4"
          >
            I Understand, Continue
          </Button>
        </div>
      </div>
    </div>
  );
};
