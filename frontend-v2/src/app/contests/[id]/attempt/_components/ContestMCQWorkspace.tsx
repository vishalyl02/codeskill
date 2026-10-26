"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Check, CheckCircle2, XCircle, RotateCcw, Send, History, Clock, FileText, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import api, { problemsAPI, submissionAPI } from "@/config/api";

const submitAnswer = async (payload: any) => {
  if (typeof submissionAPI?.submit === "function") {
    return submissionAPI.submit(payload);
  }
  return api.post("/submissions", payload);
};

const getProblemDetails = async (slug: string) => {
  if (typeof problemsAPI?.getBySlug === "function") {
    return problemsAPI.getBySlug(slug);
  }
  return api.get(`/problems/${encodeURIComponent(slug)}`);
};

const getProblemSubmissions = async (problemId: string) => {
  if (typeof submissionAPI?.getSubmissions === "function") {
    return submissionAPI.getSubmissions(problemId);
  }
  return api.get(`/submissions/problem/${encodeURIComponent(problemId)}`);
};

export interface ContestMCQProblem {
  id: string;
  title: string;
  slug: string;
  questionType?: string;
  options?: string[];
  question?: string;
  problemStatement?: string;
  description?: string;
  difficulty?: string;
  codeSnippet?: string;
}

export function isContestMcq(problem?: { questionType?: string; options?: string[] } | null): boolean {
  if (!problem) return false;
  const type = (problem.questionType || "").toLowerCase();
  if (["mcq", "single_choice", "multiple_choice", "true_false"].includes(type)) return true;
  if (Array.isArray(problem.options) && problem.options.length > 0 && !["coding", "dsa", "algorithmic"].includes(type)) return true;
  return false;
}

export default function ContestMCQWorkspace({
  problem,
  contestId,
  sessionId,
  embedded = false,
}: {
  problem: ContestMCQProblem;
  contestId?: string;
  sessionId?: string;
  embedded?: boolean;
}) {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number>(-1);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ status: string; message: string } | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  const qType = useMemo(() => {
    const raw = (details?.questionType || problem.questionType || "single_choice").toLowerCase();
    return raw;
  }, [details?.questionType, problem.questionType]);

  const isMultiChoice = qType === "multiple_choice";

  const options: string[] = useMemo(() => {
    if (Array.isArray(details?.options) && details.options.length > 0) return details.options;
    if (Array.isArray(problem.options) && problem.options.length > 0) return problem.options;
    return [];
  }, [details?.options, problem.options]);

  const questionStatement: string = useMemo(() => {
    return (
      details?.statement?.description ||
      details?.description ||
      details?.question ||
      problem.problemStatement ||
      problem.description ||
      problem.question ||
      problem.title
    );
  }, [details, problem]);

  const codeSnippet = details?.codeSnippet || problem.codeSnippet;
  const difficulty = details?.difficulty || problem.difficulty || "Medium";

  // Load question details from API if options are missing or to ensure freshness
  useEffect(() => {
    let active = true;
    if (problem.slug) {
      setLoading(true);
      getProblemDetails(problem.slug)
        .then((res) => {
          if (active && res.data?.data) {
            setDetails(res.data.data);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [problem.slug]);

  // Restore draft selection from localStorage
  const draftKey = `codeskill_mcq_draft_${problem.id}`;
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.selectedAnswer === "number") {
          setSelectedAnswer(parsed.selectedAnswer);
        }
        if (Array.isArray(parsed?.selectedAnswers)) {
          setSelectedAnswers(parsed.selectedAnswers);
        }
      } else {
        setSelectedAnswer(-1);
        setSelectedAnswers([]);
      }
    } catch {
      setSelectedAnswer(-1);
      setSelectedAnswers([]);
    }
  }, [draftKey]);

  // Load prior submissions for this problem
  const loadSubmissions = useCallback(() => {
    if (!problem.id) return;
    setLoadingSubmissions(true);
    getProblemSubmissions(problem.id)
      .then((res) => {
        const list = res.data?.data || res.data || [];
        setSubmissions(Array.isArray(list) ? list : []);
      })
      .catch(() => setSubmissions([]))
      .finally(() => setLoadingSubmissions(false));
  }, [problem.id]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const isSolved = useMemo(() => {
    return submissions.some((s) => String(s.status).toLowerCase() === "accepted");
  }, [submissions]);

  // Handle option selection
  const handleSelectOption = (index: number) => {
    setSubmitResult(null);
    if (isMultiChoice) {
      setSelectedAnswers((prev) => {
        const next = prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index];
        try {
          localStorage.setItem(draftKey, JSON.stringify({ selectedAnswers: next, selectedAnswer: -1 }));
        } catch {}
        return next;
      });
    } else {
      setSelectedAnswer(index);
      try {
        localStorage.setItem(draftKey, JSON.stringify({ selectedAnswer: index, selectedAnswers: [] }));
      } catch {}
    }
  };

  const handleClearSelection = () => {
    setSelectedAnswer(-1);
    setSelectedAnswers([]);
    setSubmitResult(null);
    try {
      localStorage.removeItem(draftKey);
    } catch {}
  };

  // Submit Answer
  const handleSubmit = async () => {
    if (submitting) return;
    const hasAnswer = isMultiChoice ? selectedAnswers.length > 0 : selectedAnswer >= 0;
    if (!hasAnswer) return;

    setSubmitting(true);
    setSubmitResult(null);

    const payload = {
      problemId: problem.id,
      selectedAnswer: isMultiChoice ? undefined : selectedAnswer,
      selectedAnswers: isMultiChoice ? selectedAnswers : undefined,
      code: JSON.stringify(isMultiChoice ? { selectedAnswers } : { selectedAnswer }),
      language: "text",
    };

    try {
      const res = await submitAnswer(payload);
      const data = res.data;
      const status = (data?.status || data?.submission?.status || "").toLowerCase();
      if (status === "accepted") {
        setSubmitResult({
          status: "accepted",
          message: "Accepted! Your answer has been verified and recorded.",
        });
      } else {
        setSubmitResult({
          status: "wrong_answer",
          message: "Wrong Answer. You can change your choice and submit again before finishing the contest.",
        });
      }
      loadSubmissions();
    } catch (err: any) {
      setSubmitResult({
        status: "error",
        message: err?.response?.data?.message || err?.message || "Failed to submit answer. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard shortcut support (A, B, C, D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toUpperCase();
      const code = key.charCodeAt(0) - 65; // A -> 0, B -> 1, C -> 2, D -> 3
      if (code >= 0 && code < options.length) {
        handleSelectOption(code);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [options.length, isMultiChoice]);

  const hasSelection = isMultiChoice ? selectedAnswers.length > 0 : selectedAnswer >= 0;

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-y-auto">
      {/* Top Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-400">
            {isMultiChoice ? "Multiple Choice Question" : "Single Choice Question"}
          </span>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded border ${
              difficulty.toLowerCase() === "easy"
                ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                : difficulty.toLowerCase() === "hard"
                  ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
                  : "text-amber-400 bg-amber-500/10 border-amber-500/20"
            }`}
          >
            {difficulty}
          </span>
          {isSolved && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5" /> Solved (Accepted)
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-8 space-y-8">
        {/* Question Statement */}
        <div className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {problem.title}
          </h2>
          <div className="prose prose-invert max-w-none text-foreground/90 whitespace-pre-wrap leading-relaxed text-base">
            {questionStatement}
          </div>

          {/* Optional Code Snippet */}
          {codeSnippet && (
            <div className="rounded-xl border border-border bg-muted/40 p-4 font-mono text-sm overflow-x-auto text-foreground/95">
              <pre className="m-0">{codeSnippet}</pre>
            </div>
          )}
        </div>

        {/* Options Section */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {isMultiChoice ? "Select all correct options" : "Choose the correct option"}
            </h3>
            <span className="text-xs text-muted-foreground hidden sm:block">
              Keyboard: press <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border text-foreground font-mono">A</kbd> <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border text-foreground font-mono">B</kbd> <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border text-foreground font-mono">C</kbd> <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border text-foreground font-mono">D</kbd>
            </span>
          </div>

          {loading && options.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground gap-2">
              <Spinner /> Loading options...
            </div>
          ) : options.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground border border-dashed rounded-xl">
              No options available for this question.
            </div>
          ) : (
            <div className="grid gap-3">
              {options.map((optionText, optIndex) => {
                const isSelected = isMultiChoice
                  ? selectedAnswers.includes(optIndex)
                  : selectedAnswer === optIndex;
                const letter = String.fromCharCode(65 + optIndex);

                return (
                  <button
                    key={optIndex}
                    type="button"
                    onClick={() => handleSelectOption(optIndex)}
                    aria-pressed={isSelected}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3.5 group relative ${
                      isSelected
                        ? "border-emerald-400 bg-emerald-500/10 ring-2 ring-emerald-400/30 shadow-[0_0_12px_rgba(52,211,153,0.15)]"
                        : "border-border bg-card hover:bg-muted/40 hover:border-muted-foreground/30"
                    }`}
                  >
                    <div
                      className={`w-7 h-7 flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                        isMultiChoice ? "rounded-lg" : "rounded-full"
                      } ${
                        isSelected
                          ? "bg-emerald-500 text-slate-950 shadow-sm ring-2 ring-emerald-300/50"
                          : "bg-muted text-muted-foreground border border-border group-hover:border-primary/50 group-hover:text-foreground"
                      }`}
                    >
                      {isSelected && isMultiChoice ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : (
                        letter
                      )}
                    </div>

                    <div className="flex-1 text-sm sm:text-base font-medium text-foreground pt-0.5 leading-relaxed">
                      {optionText}
                    </div>

                    {isSelected && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 self-center" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Feedback Alert Banner */}
        {submitResult && (
          <div
            role="alert"
            className={`p-4 rounded-xl border flex items-center gap-3 ${
              submitResult.status === "accepted"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : submitResult.status === "wrong_answer"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-400"
            }`}
          >
            {submitResult.status === "accepted" ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : submitResult.status === "wrong_answer" ? (
              <XCircle className="w-5 h-5 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0" />
            )}
            <span className="text-sm font-medium">{submitResult.message}</span>
          </div>
        )}

        {/* Bottom Actions Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearSelection}
            disabled={!hasSelection || submitting}
            className="flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> Clear Selection
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={!hasSelection || submitting}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5"
          >
            {submitting ? (
              <>
                <Spinner /> Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Submit Answer
              </>
            )}
          </Button>
        </div>

        {/* Previous Submissions List */}
        {submissions.length > 0 && (
          <div className="pt-8 border-t border-border space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <History className="w-4 h-4" /> Submission History ({submissions.length})
            </h4>
            <div className="divide-y divide-border border border-border rounded-xl bg-card overflow-hidden">
              {submissions.map((sub, idx) => {
                const subStatus = String(sub.status || "").toLowerCase();
                const isAcc = subStatus === "accepted";
                return (
                  <div key={sub.id || sub._id || idx} className="p-3.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2.5">
                      {isAcc ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                      <span className={`font-semibold text-xs capitalize ${isAcc ? "text-emerald-400" : "text-rose-400"}`}>
                        {sub.status}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {sub.createdAt ? new Date(sub.createdAt).toLocaleTimeString() : "Just now"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
