"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Check,
  CheckCircle2,
  XCircle,
  Lightbulb,
  RotateCcw,
  Sparkles,
  HelpCircle,
  Award,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { learningAPI } from "@/config/api";

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface QuizConfig {
  questions: QuizQuestion[];
}

interface IndependentQuizRunnerProps {
  exerciseId: string;
  title: string;
  quizConfig: QuizConfig;
  marks?: number;
  userId?: string;
  onPassed?: (exerciseId: string, result: any) => void;
}

export function IndependentQuizRunner({
  exerciseId,
  title,
  quizConfig,
  marks = 20,
  userId,
  onPassed,
}: IndependentQuizRunnerProps) {
  const questions = quizConfig?.questions || [];

  const draftStorageKey = useMemo(() => {
    return `codeskill_mcq_draft_${userId || "guest"}_${exerciseId}`;
  }, [userId, exerciseId]);

  const resultsStorageKey = useMemo(() => {
    return `codeskill_mcq_results_${userId || "guest"}_${exerciseId}`;
  }, [userId, exerciseId]);

  // 1. Restore previously selected answers from localStorage
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(draftStorageKey);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved MCQ draft", e);
      }
    }
    return {};
  });

  // 2. Restore previous evaluation results if available
  const [quizResults, setQuizResults] = useState<any | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(resultsStorageKey);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved MCQ results", e);
      }
    }
    return null;
  });

  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-save draft on every option selection
  const handleSelectOption = useCallback(
    (questionId: string, optionIdx: number) => {
      setSelectedAnswers((prev) => {
        const updated = { ...prev, [questionId]: optionIdx };
        if (typeof window !== "undefined") {
          localStorage.setItem(draftStorageKey, JSON.stringify(updated));
        }
        return updated;
      });
      setIsDirty(true);
      setErrorMessage(null);
    },
    [draftStorageKey]
  );

  // Reset quiz attempt
  const handleResetQuiz = useCallback(() => {
    setSelectedAnswers({});
    setQuizResults(null);
    setIsDirty(false);
    setErrorMessage(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(draftStorageKey);
      localStorage.removeItem(resultsStorageKey);
    }
  }, [draftStorageKey, resultsStorageKey]);

  // Submit and evaluate quiz asynchronously without reloading the page
  const handleCheckAnswers = async () => {
    if (isSubmitting) return; // Prevent duplicate requests
    if (Object.keys(selectedAnswers).length === 0) {
      setErrorMessage("Please select an answer for at least one question before checking.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await learningAPI.submitExercise(exerciseId, {
        answers: selectedAnswers,
      });

      const submissionData = res.data?.data || res.data;
      const feedback = submissionData?.feedback || submissionData;

      setQuizResults(feedback);
      setIsDirty(false);

      if (typeof window !== "undefined") {
        localStorage.setItem(resultsStorageKey, JSON.stringify(feedback));
      }

      if (feedback?.passed || submissionData?.passed) {
        if (onPassed) {
          onPassed(exerciseId, submissionData);
        }
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        "Quiz evaluation failed. Please make sure you have chosen your options and try again.";
      setErrorMessage(Array.isArray(msg) ? msg.join(", ") : msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const answeredCount = Object.keys(selectedAnswers).length;

  return (
    <div className="space-y-6">
      {/* Quiz Progress & Question Quick-Jump Header */}
      <div className="bg-muted/40 border border-border rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground">
            {questions.length} Practice MCQs
          </span>
          <span className="text-[11px] text-muted-foreground">
            · {answeredCount} of {questions.length} answered
          </span>
          {isDirty && quizResults && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20">
              Retake Draft (Unsubmitted)
            </span>
          )}
        </div>

        {/* Question Quick Jump Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {questions.map((q, qIdx) => {
            const isAnswered = selectedAnswers[q.id] !== undefined;
            const qResult = !isDirty
              ? quizResults?.results?.find((r: any) => r.questionId === q.id)
              : null;

            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  const el = document.getElementById(`quiz-q-${q.id}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className={`w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                  qResult
                    ? qResult.isCorrect
                      ? "bg-emerald-500 text-white shadow-xs"
                      : "bg-destructive text-destructive-foreground shadow-xs"
                    : isAnswered
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-card border border-border text-muted-foreground hover:border-foreground/30"
                }`}
                title={`Jump to Question ${qIdx + 1}`}
              >
                {qIdx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Questions List */}
      {questions.map((q, qIdx) => {
        const isSelected = selectedAnswers[q.id] !== undefined;
        const qResult = !isDirty
          ? quizResults?.results?.find((r: any) => r.questionId === q.id)
          : null;

        return (
          <div
            key={q.id}
            id={`quiz-q-${q.id}`}
            className="p-5 rounded-xl border border-border bg-card/60 space-y-3.5 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                Question {qIdx + 1} of {questions.length}
              </span>
              {isSelected && (
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  ✓ Option Saved
                </span>
              )}
            </div>

            <p className="text-base font-bold text-foreground leading-snug">{q.question}</p>

            <div className="space-y-2.5">
              {q.options.map((opt, optIdx) => {
                const isThisSelected = selectedAnswers[q.id] === optIdx;

                let containerStyle =
                  "border-slate-200 dark:border-border bg-white dark:bg-card text-slate-900 dark:text-foreground hover:bg-slate-50 dark:hover:bg-muted/60 hover:border-primary/50 shadow-xs";
                let letterBadgeStyle =
                  "bg-slate-100 dark:bg-muted text-slate-800 dark:text-foreground border border-slate-300 dark:border-border";

                if (qResult) {
                  if (optIdx === qResult.correctAnswer) {
                    containerStyle =
                      "border-emerald-500 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100 font-bold ring-2 ring-emerald-500/40 shadow-sm";
                    letterBadgeStyle = "bg-emerald-600 text-white font-bold";
                  } else if (isThisSelected && !qResult.isCorrect) {
                    containerStyle =
                      "border-rose-500 bg-rose-500/15 text-rose-950 dark:text-rose-100 font-bold ring-2 ring-rose-500/40 shadow-sm";
                    letterBadgeStyle = "bg-rose-600 text-white font-bold";
                  }
                } else if (isThisSelected) {
                  containerStyle =
                    "border-primary bg-primary/10 text-slate-950 dark:text-foreground font-bold ring-2 ring-primary/40 shadow-sm";
                  letterBadgeStyle = "bg-primary text-primary-foreground font-bold";
                }

                return (
                  <button
                    key={optIdx}
                    type="button"
                    onClick={() => handleSelectOption(q.id, optIdx)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl text-sm font-semibold border-2 transition-all duration-150 cursor-pointer flex items-center justify-between ${containerStyle}`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 transition-colors ${letterBadgeStyle}`}
                      >
                        {qResult && optIdx === qResult.correctAnswer
                          ? "✓"
                          : qResult && isThisSelected && !qResult.isCorrect
                          ? "✗"
                          : String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className="leading-snug">{opt}</span>
                    </div>
                    {isThisSelected && !qResult && (
                      <span className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Question Explanation Callout */}
            {qResult && qResult.explanation && (
              <div
                className={`mt-3 p-4 rounded-xl border text-xs leading-relaxed ${
                  qResult.isCorrect
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <span>
                    {qResult.isCorrect ? "Concept Verified" : "Explanation & In-Depth Review"}
                  </span>
                </div>
                <p className="mt-1 text-foreground text-xs leading-relaxed font-medium">
                  {qResult.explanation}
                </p>
              </div>
            )}
          </div>
        );
      })}

      {/* Quiz Outcome Banner */}
      {quizResults && !isDirty && (
        <div
          className={`p-4 rounded-xl border text-xs ${
            quizResults.passed
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          <div className="font-bold mb-1">
            {quizResults.passed
              ? "✓ Quiz Passed Successfully!"
              : "✗ Passing Score Not Reached. Review incorrect answers above and retake."}
          </div>
          <div>
            Score: {quizResults.score}% (Pass Requirement: {quizResults.passThreshold}%) ·{" "}
            {quizResults.correctCount} of {quizResults.totalQuestions} correct
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={handleCheckAnswers}
            disabled={isSubmitting || answeredCount === 0}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 px-5 shadow-xs cursor-pointer transition-all disabled:opacity-50"
          >
            {isSubmitting ? "Evaluating..." : isDirty && quizResults ? "Re-Check Answers" : "Check Answers"}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetQuiz}
            className="h-9 text-xs gap-1 border-border text-muted-foreground hover:text-foreground cursor-pointer"
            title="Clear all selected answers and reset"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Selections</span>
          </Button>
        </div>

        <span className="text-[11px] text-muted-foreground">
          Selections auto-saved locally · Unlimited practice retakes permitted
        </span>
      </div>
    </div>
  );
}
