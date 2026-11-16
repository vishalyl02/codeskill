"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Trophy,
  BookOpen,
  ShieldAlert,
  Target,
  Sparkles,
  RefreshCw,
  Clock,
  Layers,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { contestsAPI } from "@/config/api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ContestPersonalCard } from "./_components/ContestPersonalCard";
import { ContestProblemMatrix } from "./_components/ContestProblemMatrix";
import { ContestScoreboardTable } from "./_components/ContestScoreboardTable";
import { ContestDisqualifiedSection } from "./_components/ContestDisqualifiedSection";
import { ContestEditorialsTab } from "./_components/ContestEditorialsTab";
import { ReviewCodeModal } from "./_components/ReviewCodeModal";
import type {
  ContestResultsResponse,
  ProblemSummary,
  ProblemResultCell,
} from "./_types";

type ActiveTab = "scoreboard" | "breakdown" | "editorials" | "disqualified";

export default function ContestResultsPage() {
  return (
    <Suspense
      fallback={
        <div role="status" className="pt-28 text-center text-muted-foreground">
          <Spinner className="mx-auto mb-2" />
          Loading contest results...
        </div>
      }
    >
      <ContestResultsContent />
    </Suspense>
  );
}

function ContestResultsContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const id =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
        ? params.id[0]
        : "";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ContestResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination State
  const [page, setPage] = useState<number>(
    parseInt(searchParams?.get("page") || "1", 10) || 1,
  );
  const [department, setDepartment] = useState<string>(
    searchParams?.get("department") || "",
  );
  const [batch, setBatch] = useState<string>(searchParams?.get("batch") || "");
  const [search, setSearch] = useState<string>(
    searchParams?.get("search") || "",
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    (searchParams?.get("tab") as ActiveTab) || "scoreboard",
  );

  // Review Code Modal State
  const [reviewCodeModal, setReviewCodeModal] = useState<{
    isOpen: boolean;
    problemTitle: string;
    problemIndex: string;
    code: string;
    language: string;
  }>({
    isOpen: false,
    problemTitle: "",
    problemIndex: "",
    code: "",
    language: "",
  });

  const isStaff =
    user?.role === "admin" ||
    user?.role === "teacher" ||
    user?.role === "superadmin";

  const fetchResults = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await contestsAPI.getResults(id, {
        page,
        limit: 50,
        department: department || undefined,
        batch: batch || undefined,
        search: search || undefined,
      });
      setData(res.data);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        "Contest results could not be loaded. Please verify the contest ID or permissions.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id, page, department, batch, search]);

  useEffect(() => {
    void fetchResults();
  }, [fetchResults]);

  // Jump to My Rank handler
  const handleJumpToMyRank = () => {
    if (!data?.myResult) return;
    setActiveTab("scoreboard");

    // Clear filters that might hide the user
    if (department || batch || search) {
      setDepartment("");
      setBatch("");
      setSearch("");
    }

    if (data.myResult.page && data.myResult.page !== page) {
      setPage(data.myResult.page);
    }

    // Scroll to the user's row after render
    setTimeout(() => {
      const targetUserId = user?.id || user?._id;
      if (targetUserId) {
        const el = document.getElementById(`standing-user-${targetUserId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }, 150);
  };

  const handleOpenReviewCode = (
    problem: ProblemSummary,
    result?: ProblemResultCell,
  ) => {
    setReviewCodeModal({
      isOpen: true,
      problemTitle: problem.title,
      problemIndex: problem.index,
      code: result?.savedCode || "",
      language: result?.language || "plaintext",
    });
  };

  if (loading && !data) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-16 flex flex-col items-center justify-center gap-3">
        <Spinner className="h-8 w-8" />
        <p className="text-sm text-muted-foreground font-medium">
          Loading contest results and arena rankings...
        </p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-16 space-y-6">
        <Link
          href="/contests"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="w-4 h-4" /> All contests
        </Link>
        <div className="p-8 rounded-3xl border border-destructive/30 bg-destructive/[0.04] text-center space-y-4">
          <ShieldAlert className="w-10 h-10 text-destructive mx-auto" />
          <h2 className="text-xl font-bold">Unable to Load Contest Results</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {error || "An unexpected error occurred while fetching results."}
          </p>
          <Button variant="outline" onClick={() => void fetchResults()}>
            Retry
          </Button>
        </div>
      </main>
    );
  }

  const contest = data.contest;
  const isEnded = new Date().getTime() >= new Date(contest.endTime).getTime();
  const hasMyResult = Boolean(data.myResult);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-20 space-y-7">
      {/* Page Header */}
      <header className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-primary/[0.06] via-card to-muted/40 p-6 sm:p-9 shadow-xs">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div className="space-y-3">
            <Link
              href="/contests"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition mb-2"
            >
              <ArrowLeft className="w-4 h-4" /> All contests
            </Link>

            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-primary">
                <Sparkles className="w-3.5 h-3.5" /> THE ARENA RESULTS
              </span>
              <span className="text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground font-medium uppercase">
                {contest.contestFormat} Format
              </span>
              <span className="text-muted-foreground">•</span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                  contest.resultsPublished
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : isEnded
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                }`}
              >
                {contest.resultsPublished
                  ? "Official Verified Results"
                  : isEnded
                    ? "Contest Ended (Tabulating)"
                    : "Live In-Progress Standings"}
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              {contest.title}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {contest.description}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-start lg:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchResults()}
              disabled={loading}
              className="gap-1.5 text-xs h-9 rounded-xl"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {/* Personal Scorecard Banner (Visible if user participated) */}
      {data.myResult && (
        <ContestPersonalCard
          myResult={data.myResult}
          contestFormat={contest.contestFormat}
        />
      )}

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-border overflow-x-auto pb-0.5 scrollbar-none">
        <button
          onClick={() => setActiveTab("scoreboard")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "scoreboard"
              ? "border-primary text-primary bg-primary/5 rounded-t-xl"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Trophy className="w-4 h-4" />
          Scoreboard Matrix
          <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground">
            {data.pagination.total}
          </span>
        </button>

        {hasMyResult && (
          <button
            onClick={() => setActiveTab("breakdown")}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === "breakdown"
                ? "border-primary text-primary bg-primary/5 rounded-t-xl"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Target className="w-4 h-4" />
            My Problem Breakdown
            <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground">
              {data.myResult?.problemsSolved || 0}/{data.problems.length}
            </span>
          </button>
        )}

        <button
          onClick={() => setActiveTab("editorials")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "editorials"
              ? "border-primary text-primary bg-primary/5 rounded-t-xl"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Official Editorials
        </button>

        {/* Anti-Cheat Tab (Prominent for Faculty/Staff, accessible to all) */}
        <button
          onClick={() => setActiveTab("disqualified")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "disqualified"
              ? "border-destructive text-destructive bg-destructive/5 rounded-t-xl"
              : "border-transparent text-muted-foreground hover:text-destructive"
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Anti-Cheat Review
          {data.disqualified.length > 0 && (
            <span className="ml-1 text-[11px] px-1.5 py-0.2 rounded-full bg-destructive/15 text-destructive font-bold">
              {data.disqualified.length}
            </span>
          )}
        </button>
      </div>

      {/* Active Tab View */}
      {activeTab === "scoreboard" && (
        <ContestScoreboardTable
          standings={data.standings}
          problems={data.problems}
          contestFormat={contest.contestFormat}
          departments={data.departments}
          batches={data.batches}
          selectedDepartment={department}
          selectedBatch={batch}
          searchQuery={search}
          onDepartmentChange={(dept) => {
            setDepartment(dept);
            setPage(1);
          }}
          onBatchChange={(b) => {
            setBatch(b);
            setPage(1);
          }}
          onSearchChange={(s) => {
            setSearch(s);
            setPage(1);
          }}
          pagination={data.pagination}
          onPageChange={setPage}
          myResult={data.myResult}
          onJumpToMyRank={handleJumpToMyRank}
        />
      )}

      {activeTab === "breakdown" && (
        <ContestProblemMatrix
          problems={data.problems}
          myProblemResults={data.myResult?.problemResults}
          onReviewCode={handleOpenReviewCode}
        />
      )}

      {activeTab === "editorials" && (
        <ContestEditorialsTab
          contestId={contest.id}
          isContestEnded={isEnded}
          resultsPublished={contest.resultsPublished}
        />
      )}

      {activeTab === "disqualified" && (
        <ContestDisqualifiedSection
          disqualified={data.disqualified}
          isStaff={isStaff}
        />
      )}

      {/* Review Code Modal */}
      <ReviewCodeModal
        isOpen={reviewCodeModal.isOpen}
        onClose={() =>
          setReviewCodeModal((prev) => ({ ...prev, isOpen: false }))
        }
        problemTitle={reviewCodeModal.problemTitle}
        problemIndex={reviewCodeModal.problemIndex}
        code={reviewCodeModal.code}
        language={reviewCodeModal.language}
      />
    </main>
  );
}
