"use client";

import React from "react";
import { CheckCircle2, XCircle, Clock, Code, AlertCircle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProblemSummary, ProblemResultCell } from "../_types";

interface ContestProblemMatrixProps {
  problems: ProblemSummary[];
  myProblemResults?: Record<string, ProblemResultCell>;
  onReviewCode: (problem: ProblemSummary, result?: ProblemResultCell) => void;
}

export function ContestProblemMatrix({
  problems,
  myProblemResults = {},
  onReviewCode,
}: ContestProblemMatrixProps) {
  return (
    <section aria-label="Problem solve breakdown" className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight">Problem-by-Problem Breakdown</h3>
          <p className="text-xs text-muted-foreground">
            Review your submission verdict, solve time, attempt counts, and code for each problem.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {problems.map((problem) => {
          const result = myProblemResults[problem.id];
          const isAccepted = result?.status === "accepted";
          const isFailed = result?.status === "failed";
          const isAttempted = result?.status === "attempted";
          const hasCode = Boolean(result?.savedCode);

          return (
            <div
              key={problem.id}
              className={`flex flex-col justify-between rounded-2xl border p-4.5 transition-all shadow-xs ${
                isAccepted
                  ? "border-emerald-500/35 bg-gradient-to-br from-emerald-500/[0.06] to-card"
                  : isFailed
                    ? "border-destructive/30 bg-gradient-to-br from-destructive/[0.04] to-card"
                    : isAttempted
                      ? "border-amber-500/30 bg-gradient-to-br from-amber-500/[0.04] to-card"
                      : "border-border/80 bg-card"
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                      isAccepted
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : isFailed
                          ? "bg-destructive/20 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {problem.index}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" title={problem.title}>
                      {problem.title}
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      {problem.maxPoints} pts • {problem.difficulty || "Medium"}
                    </span>
                  </div>
                </div>

                {/* Verdict Badge */}
                {isAccepted ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    Accepted
                  </span>
                ) : isFailed ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-destructive/15 text-destructive shrink-0">
                    <XCircle className="w-3 h-3" />
                    Failed
                  </span>
                ) : isAttempted ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                    <AlertCircle className="w-3 h-3" />
                    Drafted
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground shrink-0">
                    <HelpCircle className="w-3 h-3" />
                    Unattempted
                  </span>
                )}
              </div>

              {/* Card Metrics & Footer */}
              <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  {isAccepted ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      {result.timeInMinutes || 0}m ({result.attempts || 1} att)
                    </span>
                  ) : isFailed ? (
                    <span className="text-destructive font-medium">
                      {result.attempts || 1} failed attempt{result.attempts === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span>0 submissions</span>
                  )}
                </div>

                {hasCode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onReviewCode(problem, result)}
                    className="h-7 px-2.5 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                  >
                    <Code className="w-3.5 h-3.5" />
                    Review Code
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
