"use client";

import React from "react";
import { Trophy, ShieldCheck, ShieldAlert, AlertTriangle, Clock, Award, Target, Flame } from "lucide-react";
import type { MyResult } from "../_types";

interface ContestPersonalCardProps {
  myResult: MyResult;
  contestFormat: string;
}

export function ContestPersonalCard({ myResult, contestFormat }: ContestPersonalCardProps) {
  const isDisqualified = myResult.status === "Disqualified" || myResult.status === "Terminated";
  const isIcpc = contestFormat === "icpc";

  return (
    <section
      aria-label="Your contest performance scorecard"
      className={`relative overflow-hidden rounded-3xl border p-6 sm:p-8 shadow-sm transition-all ${
        isDisqualified
          ? "border-destructive/40 bg-gradient-to-br from-destructive/[0.08] via-card to-destructive/[0.02]"
          : "border-primary/25 bg-gradient-to-br from-primary/[0.07] via-card to-muted/30"
      }`}
    >
      {/* Decorative backdrop glow */}
      <div
        className={`pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full blur-3xl opacity-60 ${
          isDisqualified ? "bg-destructive/20" : "bg-primary/20"
        }`}
      />

      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        {/* Left Column: Identity, Status, and Rank */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-background/80 border border-border/80 shadow-xs">
              <Award className="w-3.5 h-3.5 text-primary" />
              Personal Scorecard
            </span>

            {/* Proctoring Status Pill */}
            {isDisqualified ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-destructive/15 text-destructive border border-destructive/30">
                <ShieldAlert className="w-3.5 h-3.5" />
                Disqualified / Terminated
              </span>
            ) : myResult.proctoringVerified ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                Proctoring Verified (0 Flags)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                <AlertTriangle className="w-3.5 h-3.5" />
                Under Review ({myResult.warnings} warning{myResult.warnings === 1 ? "" : "s"})
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              {isDisqualified ? (
                <span className="text-destructive">Disqualified</span>
              ) : myResult.rank ? (
                <span className="flex items-center gap-2">
                  <span className="text-primary font-black">#{myResult.rank}</span>
                  <span className="text-base sm:text-lg font-normal text-muted-foreground">Overall Rank</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Unranked</span>
              )}
            </h2>

            {/* Department Dual Rank Pill if available */}
            {!isDisqualified && myResult.departmentRank && myResult.departmentRank !== myResult.rank && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                #{myResult.departmentRank} in Dept
              </span>
            )}
          </div>

          {isDisqualified && myResult.reason && (
            <p className="text-sm text-destructive font-medium max-w-xl">
              Violation Notice: {myResult.reason}
            </p>
          )}

          {!isDisqualified && myResult.percentile > 0 && (
            <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-500" />
              Finished in the <strong className="text-foreground font-semibold">Top {Math.max(1, 100 - myResult.percentile)}%</strong> ({myResult.percentile}th percentile) of participants.
            </p>
          )}
        </div>

        {/* Right Column: Key Stats KPI Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 shrink-0">
          <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur-xs p-3.5 sm:p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-medium mb-1">
              <Target className="w-3.5 h-3.5 text-primary" />
              Problems Solved
            </div>
            <p className="text-xl sm:text-2xl font-bold tabular-nums">
              {myResult.problemsSolved}
              <span className="text-xs sm:text-sm font-normal text-muted-foreground"> / {myResult.totalProblems}</span>
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-background/70 backdrop-blur-xs p-3.5 sm:p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-medium mb-1">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              Total Score
            </div>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-foreground">
              {myResult.totalScore}
              <span className="text-xs font-normal text-muted-foreground ml-1">pts</span>
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-2xl border border-border/80 bg-background/70 backdrop-blur-xs p-3.5 sm:p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-medium mb-1">
              <Clock className="w-3.5 h-3.5 text-sky-500" />
              {isIcpc ? "Total Penalty" : "Solve Time"}
            </div>
            <p className="text-xl sm:text-2xl font-bold tabular-nums text-foreground">
              {myResult.totalPenaltyMinutes}
              <span className="text-xs font-normal text-muted-foreground ml-1">min</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
