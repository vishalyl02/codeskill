"use client";

import React from "react";
import {
  Medal,
  Crown,
  Search,
  UserRound,
  Zap,
  Target,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StandingRow, ProblemSummary, MyResult } from "../_types";

interface ContestScoreboardTableProps {
  standings: StandingRow[];
  problems: ProblemSummary[];
  contestFormat: string;
  departments: string[];
  batches: string[];
  selectedDepartment: string;
  selectedBatch: string;
  searchQuery: string;
  onDepartmentChange: (dept: string) => void;
  onBatchChange: (batch: string) => void;
  onSearchChange: (search: string) => void;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  myResult: MyResult | null;
  onJumpToMyRank: () => void;
}

export function ContestScoreboardTable({
  standings,
  problems,
  contestFormat,
  departments,
  batches,
  selectedDepartment,
  selectedBatch,
  searchQuery,
  onDepartmentChange,
  onBatchChange,
  onSearchChange,
  pagination,
  onPageChange,
  myResult,
  onJumpToMyRank,
}: ContestScoreboardTableProps) {
  const isIcpc = contestFormat === "icpc";
  const isFiltered = Boolean(selectedDepartment || selectedBatch || searchQuery);

  return (
    <section aria-label="Contest leaderboard scoreboard" className="space-y-6">
      {/* Top 3 Podium Cards (rendered when on page 1 and no restrictive text search) */}
      {pagination.page === 1 && standings.length >= 3 && !searchQuery && (
        <div className="rounded-3xl border border-border/80 bg-card px-4 sm:px-8 pt-7 pb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Crown className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-base sm:text-lg">Arena Champions</h3>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-5 max-w-3xl mx-auto items-end">
            {[standings[1], standings[0], standings[2]].map((row, idx) => {
              if (!row) return <div key={`empty-${idx}`} className="min-h-24" />;
              const isFirst = row.rank === 1;
              const isSecond = row.rank === 2;
              const isThird = row.rank === 3;

              return (
                <div
                  key={row.userId}
                  className={`relative flex min-w-0 flex-col items-center rounded-t-2xl border border-b-0 px-2 sm:px-4 pt-5 pb-4 text-center transition-all ${
                    isFirst
                      ? "min-h-52 sm:min-h-60 border-amber-400/50 bg-gradient-to-t from-amber-400/20 via-amber-400/5 to-transparent shadow-md"
                      : isSecond
                        ? "min-h-44 sm:min-h-52 border-slate-400/40 bg-gradient-to-t from-slate-400/15 via-slate-400/5 to-transparent"
                        : "min-h-40 sm:min-h-48 border-orange-600/40 bg-gradient-to-t from-orange-600/15 via-orange-600/5 to-transparent"
                  }`}
                >
                  <span
                    className={`mb-3 grid h-11 w-11 sm:h-14 sm:w-14 place-items-center rounded-full border text-lg font-bold shadow-xs ${
                      isFirst
                        ? "border-amber-400/50 bg-amber-400/20 text-amber-500 dark:text-amber-400"
                        : isSecond
                          ? "border-slate-400/50 bg-slate-400/20 text-slate-600 dark:text-slate-300"
                          : "border-orange-600/50 bg-orange-600/20 text-orange-700 dark:text-orange-400"
                    }`}
                  >
                    {isFirst ? <Medal className="h-6 w-6" /> : `#${row.rank}`}
                  </span>

                  <p className="w-full truncate text-xs sm:text-sm font-semibold" title={row.name}>
                    {row.name}
                  </p>
                  {row.username && (
                    <p className="w-full truncate text-[10px] sm:text-xs text-muted-foreground">
                      @{row.username}
                    </p>
                  )}

                  <div className="mt-2.5 flex items-baseline gap-1.5 text-base sm:text-xl font-bold tabular-nums">
                    <span>{row.problemsSolved}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      / {problems.length} solved
                    </span>
                  </div>

                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {row.totalPenaltyMinutes}m penalty
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter and Control Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 bg-card border border-border/80 p-4 rounded-2xl shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          {/* Department Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground font-medium hidden sm:inline">Dept:</span>
            <select
              value={selectedDepartment}
              onChange={(e) => onDepartmentChange(e.target.value)}
              aria-label="Filter by department"
              className="h-9 rounded-xl border border-border bg-background px-3 text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Batch Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground font-medium hidden sm:inline">Batch:</span>
            <select
              value={selectedBatch}
              onChange={(e) => onBatchChange(e.target.value)}
              aria-label="Filter by batch"
              className="h-9 rounded-xl border border-border bg-background px-3 text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            >
              <option value="">All Batches</option>
              {batches.map((batch) => (
                <option key={batch} value={batch}>
                  {batch}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="relative min-w-44 flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search candidate..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-9 pl-8 text-xs rounded-xl"
            />
          </div>
        </div>

        {/* Right Toolbar: Format & Jump to My Rank */}
        <div className="flex items-center gap-2.5 shrink-0 self-end md:self-auto">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-muted/60 text-muted-foreground border border-border/70">
            <Zap className="w-3 h-3 text-primary" />
            {isIcpc ? "ICPC Mode (Solves + Penalty)" : "Points Mode"}
          </span>

          {myResult && myResult.rank && (
            <Button
              variant="outline"
              size="sm"
              onClick={onJumpToMyRank}
              className="h-9 text-xs gap-1.5 bg-primary/5 hover:bg-primary/10 border-primary/30 text-primary"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Jump to My Rank (#{myResult.rank})
            </Button>
          )}
        </div>
      </div>

      {/* 2D Arena Matrix Scoreboard Table */}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            {/* Table Header */}
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                <th className="py-3.5 px-3 sm:px-4 w-20 text-center">Rank</th>
                <th className="py-3.5 px-4 min-w-[180px]">Participant</th>
                <th className="py-3.5 px-3 text-center min-w-[70px]">
                  {isIcpc ? "Solved" : "Score"}
                </th>
                <th className="py-3.5 px-3 text-center min-w-[70px]">
                  {isIcpc ? "Penalty" : "Time"}
                </th>
                {problems.map((p) => (
                  <th
                    key={p.id}
                    className="py-3 px-3 text-center min-w-[85px] border-l border-border/60"
                  >
                    <div className="flex flex-col items-center">
                      <span className="font-bold text-foreground text-sm">{p.index}</span>
                      <span className="text-[10px] text-muted-foreground font-normal truncate max-w-[80px]" title={p.title}>
                        {p.title}
                      </span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        {p.totalSolved} solved
                      </span>
                      {p.firstSolver && (
                        <span
                          className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.2 rounded-full bg-amber-400/15 text-amber-600 dark:text-amber-400 font-semibold truncate max-w-[80px]"
                          title={`First solver: ${p.firstSolver.name} (${p.firstSolver.timeInMinutes}m)`}
                        >
                          ★ {p.firstSolver.timeInMinutes}m
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-border/70">
              {standings.length === 0 ? (
                <tr>
                  <td
                    colSpan={4 + problems.length}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No participants match your filter criteria.
                  </td>
                </tr>
              ) : (
                standings.map((row) => {
                  const isCurrent = row.isCurrentUser;

                  return (
                    <tr
                      key={row.userId}
                      id={`standing-user-${row.userId}`}
                      className={`transition-colors hover:bg-muted/30 ${
                        isCurrent
                          ? "bg-primary/[0.08] font-medium"
                          : row.rank <= 3
                            ? "bg-muted/10"
                            : ""
                      }`}
                    >
                      {/* Rank Cell with Dual Rank Badges when filtered */}
                      <td className="py-3 px-3 sm:px-4 text-center">
                        {isFiltered && row.departmentRank ? (
                          <div className="flex flex-col items-center">
                            <span className="font-bold text-primary text-xs">
                              #{row.departmentRank}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              (#{row.rank})
                            </span>
                          </div>
                        ) : (
                          <span
                            className={`inline-grid h-7 w-7 place-items-center rounded-lg text-xs font-bold tabular-nums ${
                              row.rank === 1
                                ? "bg-amber-400/20 text-amber-600 dark:text-amber-400"
                                : row.rank === 2
                                  ? "bg-slate-400/20 text-slate-600 dark:text-slate-300"
                                  : row.rank === 3
                                    ? "bg-orange-600/20 text-orange-700 dark:text-orange-400"
                                    : "text-muted-foreground"
                            }`}
                          >
                            {row.rank === 1 ? <Medal className="w-4 h-4" /> : `#${row.rank}`}
                          </span>
                        )}
                      </td>

                      {/* Participant Cell */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground font-semibold text-xs">
                            {row.name ? row.name.charAt(0).toUpperCase() : <UserRound className="w-3.5 h-3.5" />}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate font-semibold text-foreground" title={row.name}>
                                {row.name}
                              </p>
                              {isCurrent && (
                                <span className="px-1.5 py-0.2 rounded-sm text-[10px] bg-primary text-primary-foreground font-bold shrink-0">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                              {row.username && <span>@{row.username}</span>}
                              {row.department && (
                                <span className="opacity-80">• {row.department}</span>
                              )}
                              {row.batch && row.batch !== "N/A" && (
                                <span className="opacity-80">({row.batch})</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Score / Solved */}
                      <td className="py-3 px-3 text-center font-bold text-foreground tabular-nums">
                        {isIcpc ? row.problemsSolved : row.totalScore}
                      </td>

                      {/* Penalty / Time */}
                      <td className="py-3 px-3 text-center text-muted-foreground tabular-nums">
                        {row.totalPenaltyMinutes}m
                      </td>

                      {/* Problem Matrix Cells */}
                      {problems.map((p) => {
                        const cell = row.problemResults[p.id];
                        const isAccepted = cell?.status === "accepted";
                        const isFailed = cell?.status === "failed";
                        const isFirstSolve = cell?.isFirstSolve;

                        return (
                          <td
                            key={p.id}
                            className={`py-2 px-2 text-center border-l border-border/50 tabular-nums ${
                              isFirstSolve
                                ? "bg-amber-400/[0.12] dark:bg-amber-400/[0.08]"
                                : isAccepted
                                  ? "bg-emerald-500/[0.08] dark:bg-emerald-500/[0.05]"
                                  : isFailed
                                    ? "bg-destructive/[0.05]"
                                    : ""
                            }`}
                          >
                            {isAccepted ? (
                              <div className="flex flex-col items-center">
                                <span
                                  className={`font-bold ${
                                    isFirstSolve
                                      ? "text-amber-600 dark:text-amber-400"
                                      : "text-emerald-600 dark:text-emerald-400"
                                  }`}
                                >
                                  {isFirstSolve && "★ "}
                                  +{cell.attempts || 1}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {cell.timeInMinutes || 0}m
                                </span>
                              </div>
                            ) : isFailed ? (
                              <span className="font-semibold text-destructive">
                                -{cell.attempts || 1}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40 font-mono">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 bg-muted/20 text-xs text-muted-foreground">
            <div>
              Showing{" "}
              <strong className="text-foreground">
                {(pagination.page - 1) * pagination.limit + 1}
              </strong>{" "}
              to{" "}
              <strong className="text-foreground">
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </strong>{" "}
              of <strong className="text-foreground">{pagination.total}</strong> participants
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="h-8 px-2.5 text-xs gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </Button>

              <span className="px-2 font-medium text-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="h-8 px-2.5 text-xs gap-1"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
