"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Users,
  Target,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Lock,
  FileQuestion,
  History,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  Eye,
} from "lucide-react";
import { analyticsAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import { logger } from "@/lib/logger";
import { ScoreDistributionChart } from "@/components/analytics";

interface OverviewData {
  assessment?: {
    id?: string;
    title?: string;
    code?: string;
    status?: string;
    type?: string;
    durationMinutes?: number;
    totalMarks?: number;
    passingMarks?: number;
  };
  participation?: {
    total?: number;
    completed?: number;
    totalCandidates?: number;
    completedCandidates?: number;
  };
  metrics?: {
    avgScore?: number;
    attemptAvgScore?: number;
    maxScore?: number;
    minScore?: number;
    medianScore?: number;
    stdDevScore?: number;
    avgTimeSpent?: number;
    totalPassed?: number;
    passRate?: number;
    attemptPassRate?: number;
  };
  scoreDistribution?: Array<{
    bracket: string;
    count: number;
    percentage: number;
    passStatus: "fail" | "pass" | "distinction";
  }>;
  codingVerdicts?: {
    ac: number;
    partial: number;
    failed: number;
    total: number;
  };
  integritySummary?: {
    cleanCandidates: number;
    minorRiskCandidates: number;
    highRiskCandidates: number;
    integrityRate: number;
  };
  proctoring?: {
    totalViolations?: number;
    totalTabSwitches?: number;
    totalFullscreenExits?: number;
    securityEventsCount?: number;
    recentEvents?: Array<{
      id: string;
      eventType: string;
      severity: string;
      candidateName?: string;
      candidateEmail?: string;
      createdAt: string;
      metadata?: Record<string, unknown>;
    }>;
  };
  auditLogs?: Array<{
    id: string;
    action: string;
    actorEmail?: string;
    timestamp: string;
    event?: string;
    riskWeight?: number;
  }>;
}

interface QuestionStat {
  questionId: string;
  title: string;
  type: string;
  difficulty?: string;
  totalAttempts: number;
  attemptedCount?: number;
  skippedCount?: number;
  correctCount: number;
  partialCreditCount?: number;
  successRate: number;
  difficultyP?: number;
  discriminationIndex?: number | null;
  avgTimeSpent: number;
  avgMarksAwarded: number;
}

interface FetchError {
  status?: number;
  message: string;
  isUnauthorized?: boolean;
  isNotFound?: boolean;
}

/**
 * Isolated product analytics telemetry helper.
 * Tracks navigation and dashboard events safely without blocking UI rendering
 * and without leaking sensitive tokens or candidate PII.
 */
function trackProductTelemetry(
  eventName: string,
  payload: Record<string, unknown> = {}
) {
  try {
    logger.info(`[ProductTelemetry] ${eventName}`, payload, "AssessmentAnalytics");

    if (typeof window !== "undefined" && typeof navigator?.sendBeacon === "function") {
      const sanitizedPayload = {
        eventName,
        ...payload,
        route: window.location.pathname,
        timestamp: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(sanitizedPayload)], {
        type: "application/json",
      });
      navigator.sendBeacon("/api/telemetry/client-events", blob);
    }
  } catch {
    // Product analytics must never throw or disrupt dashboard rendering
  }
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default function AnalyticsDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams?.id;

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [questions, setQuestions] = useState<QuestionStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<FetchError | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = useCallback(
    async (isManualRefresh = false) => {
      if (!id) return;

      if (isManualRefresh) {
        setIsRefreshing(true);
        trackProductTelemetry("analytics_manual_refresh", { assessmentId: id });
      } else {
        setIsLoading(true);
        setError(null);
      }

      try {
        const [overviewRes, questionsRes] = await Promise.all([
          analyticsAPI.getOverview(id),
          analyticsAPI.getQuestionAnalytics(id),
        ]);

        // Unpack overview safely across wrapped ({success:true, ...}) and direct envelopes
        const rawOverview: OverviewData =
          overviewRes?.data?.data && typeof overviewRes.data.data === "object"
            ? overviewRes.data.data
            : overviewRes?.data ?? {};

        // Unpack questions safely: check .data array first to prevent "questions.map is not a function"
        let parsedQuestions: QuestionStat[] = [];
        if (Array.isArray(questionsRes?.data?.data)) {
          parsedQuestions = questionsRes.data.data;
        } else if (Array.isArray(questionsRes?.data)) {
          parsedQuestions = questionsRes.data;
        }

        setOverview(rawOverview);
        setQuestions(parsedQuestions);
        setLastUpdated(new Date());
        setError(null);

        trackProductTelemetry("analytics_view_success", {
          assessmentId: id,
          totalParticipants: rawOverview.participation?.total ?? 0,
          questionsCount: parsedQuestions.length,
        });
      } catch (err: any) {
        const status = err?.response?.status;
        const message =
          err?.response?.data?.message ||
          err?.response?.data?.error?.message ||
          err?.message ||
          "Could not load analytics for this assessment.";

        const fetchErr: FetchError = {
          status,
          message,
          isUnauthorized: status === 401 || status === 403,
          isNotFound: status === 404,
        };

        setError(fetchErr);
        trackProductTelemetry("analytics_load_error", {
          assessmentId: id,
          status,
          errorMessage: message,
        });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [id]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-Time Polling: Poll every 20s when active
  useEffect(() => {
    if (!autoRefresh || !id) return;
    const interval = setInterval(() => {
      fetchData(true);
    }, 20_000);
    return () => clearInterval(interval);
  }, [autoRefresh, id, fetchData]);

  // Loading State
  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading assessment analytics"
        className="flex min-h-[min(650px,75vh)] flex-col items-center justify-center p-6 text-center"
      >
        <div className="relative flex items-center justify-center mb-4">
          <Spinner className="w-10 h-10 text-primary animate-spin" />
        </div>
        <p className="text-sm font-medium text-foreground">Loading Analytics Dashboard…</p>
        <p className="text-xs text-muted-foreground mt-1">
          Aggregating candidate submissions, scoring metrics, and proctoring telemetry…
        </p>
      </div>
    );
  }

  // Unauthorized Error State (401 / 403)
  if (error?.isUnauthorized) {
    return (
      <div className="max-w-2xl mx-auto p-6 my-12" role="alert">
        <div className="bg-card border border-destructive/20 rounded-2xl p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            Administrator Access Required
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            You do not have permission to view assessment analytics. Please ensure you are logged
            in with an active administrator account.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/admin/login"
              className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
            >
              Sign In as Admin
            </Link>
            <Link
              href="/admin/assessments"
              className="px-5 py-2.5 bg-secondary text-secondary-foreground font-semibold text-sm rounded-xl hover:bg-secondary/80 transition-colors border border-border"
            >
              Return to Assessments
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Not Found Error State (404)
  if (error?.isNotFound) {
    return (
      <div className="max-w-2xl mx-auto p-6 my-12" role="alert">
        <div className="bg-card border border-border rounded-2xl p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
            <FileQuestion className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            Assessment Not Found
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            No assessment matching ID <span className="font-mono text-xs text-foreground bg-muted px-1.5 py-0.5 rounded">{id}</span> could be located. It may have been archived or deleted.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/admin/assessments"
              className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 transition-colors"
            >
              Back to Assessments
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Generic Error State with Retry
  if (error && !overview) {
    return (
      <div className="max-w-2xl mx-auto p-6 my-12" role="alert">
        <div className="bg-card border border-border rounded-2xl p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            Unable to Load Analytics
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            {error.message}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fetchData(false)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Try Again
            </button>
            <Link
              href="/admin/assessments"
              className="px-5 py-2.5 bg-secondary text-secondary-foreground font-semibold text-sm rounded-xl hover:bg-secondary/80 transition-colors border border-border"
            >
              Go to Assessments
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const assessment = overview?.assessment;
  const participation = overview?.participation;
  const metrics = overview?.metrics;
  const proctoring = overview?.proctoring;
  const auditLogs = overview?.auditLogs ?? [];
  const scoreDistributionData = overview?.scoreDistribution || [];
  const codingVerdicts = overview?.codingVerdicts;
  const integritySummary = overview?.integritySummary;

  const totalParticipants = participation?.total ?? 0;
  const completedCandidates = participation?.completed ?? 0;
  const avgScore = metrics?.avgScore != null ? Number(metrics.avgScore).toFixed(1) : "0.0";
  const medianScore = metrics?.medianScore != null ? Number(metrics.medianScore).toFixed(1) : avgScore;
  const stdDevScore = metrics?.stdDevScore != null ? Number(metrics.stdDevScore).toFixed(1) : "0.0";
  const maxScore = metrics?.maxScore ?? 0;
  const minScore = metrics?.minScore ?? 0;
  const totalPassed = metrics?.totalPassed ?? 0;
  const passRate =
    metrics?.passRate != null
      ? `${Number(metrics.passRate).toFixed(1)}%`
      : completedCandidates > 0
        ? `${((totalPassed / completedCandidates) * 100).toFixed(1)}%`
        : "0.0%";
  const avgTimeSpentSeconds = metrics?.avgTimeSpent ?? 0;
  const totalViolations = proctoring?.totalViolations ?? 0;
  const tabSwitches = proctoring?.totalTabSwitches ?? 0;
  const fullscreenExits = proctoring?.totalFullscreenExits ?? 0;
  const securityEvents = proctoring?.recentEvents ?? [];

  const hasSubmissions = totalParticipants > 0 || completedCandidates > 0;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Breadcrumb Navigation & Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-border pb-6">
        <div className="flex items-start gap-4">
          <Link
            href={`/admin/assessments/${id}/results`}
            className="p-2.5 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shadow-xs"
            title="Back to Assessment Results"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Link href="/admin/assessments" className="hover:underline">
                Assessments
              </Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <Link href={`/admin/assessments/${id}/results`} className="hover:underline">
                {assessment?.code || "Exam"}
              </Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-foreground font-medium">Analytics</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {assessment?.title || "Assessment Analytics"}
              </h1>
              {assessment?.code && (
                <span className="bg-primary/10 text-primary border border-primary/20 text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold">
                  {assessment.code}
                </span>
              )}
              {assessment?.status && (
                <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs px-2.5 py-0.5 rounded-full capitalize font-medium">
                  {assessment.status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls & Real-Time Status */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border px-3 py-1.5 rounded-xl shadow-2xs">
            <span
              className={`w-2 h-2 rounded-full ${
                autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
              }`}
            />
            <span className="font-medium text-foreground">
              {autoRefresh ? "Live Analytics" : "Polling Paused"}
            </span>
            {lastUpdated && (
              <span className="border-l border-border pl-2 text-[11px] text-muted-foreground">
                Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="text-xs px-2.5 py-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
              title={autoRefresh ? "Pause real-time updates" : "Resume real-time updates"}
            >
              {autoRefresh ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border bg-card text-foreground hover:bg-muted text-sm font-medium transition-colors disabled:opacity-60"
              title="Refresh analytics data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>{isRefreshing ? "Refreshing…" : "Refresh"}</span>
            </button>
            <Link
              href={`/admin/assessments/${id}/results`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground text-sm font-semibold rounded-xl hover:bg-secondary/80 border border-border transition-colors shadow-xs"
            >
              <Users className="w-4 h-4" />
              <span>View Candidates & Results</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Empty State Banner (Assessment with 0 submissions) */}
      {!hasSubmissions && (
        <div className="bg-muted/40 border border-border rounded-2xl p-6 text-center space-y-2">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-foreground text-base">
            No Candidate Submissions Yet
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Candidates have not submitted attempts for this assessment yet. Authoritative metrics,
            score distribution, and proctoring telemetry will populate automatically upon submission.
          </p>
        </div>
      )}

      {/* KPI Cards: Authoritative Assessment Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Participation */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Total Candidates
            </span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold tracking-tight text-foreground">
            {totalParticipants}
          </div>
          <div className="text-xs text-muted-foreground mt-2 flex items-center justify-between border-t border-border/50 pt-2">
            <span>Completed Submissions</span>
            <span className="font-semibold text-foreground">{completedCandidates}</span>
          </div>
        </div>

        {/* Average Score */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Average Score
            </span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-500">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold tracking-tight text-foreground">
            {avgScore}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              / {assessment?.totalMarks || 100}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-2 flex items-center justify-between border-t border-border/50 pt-2 font-mono">
            <span>Median: <strong className="text-foreground">{medianScore}</strong></span>
            <span>σ: <strong className="text-foreground">±{stdDevScore}</strong></span>
          </div>
        </div>

        {/* Pass Rate */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Pass Rate
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold tracking-tight text-foreground">
            {passRate}
          </div>
          <div className="text-xs text-muted-foreground mt-2 flex items-center justify-between border-t border-border/50 pt-2">
            <span>Passed Candidates</span>
            <span className="font-semibold text-foreground">
              {totalPassed} of {completedCandidates || totalParticipants}
            </span>
          </div>
        </div>

        {/* Avg Time Spent */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between text-muted-foreground mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Avg Time Spent
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold tracking-tight text-foreground">
            {formatDuration(avgTimeSpentSeconds)}
          </div>
          <div className="text-xs text-muted-foreground mt-2 flex items-center justify-between border-t border-border/50 pt-2">
            <span>Allotted Duration</span>
            <span className="font-semibold text-foreground">
              {assessment?.durationMinutes || 60} mins
            </span>
          </div>
        </div>
      </div>

      {/* Real Assessment Score Distribution Histogram */}
      <ScoreDistributionChart
        data={scoreDistributionData}
        passingScorePercent={assessment?.passingMarks && assessment?.totalMarks ? Math.round((assessment.passingMarks / assessment.totalMarks) * 100) : 40}
      />

      {/* Coding Question Test Case Verdict Breakdown */}
      {codingVerdicts && codingVerdicts.total > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Algorithmic Code Execution Telemetry
              </h3>
              <p className="text-xs text-muted-foreground">
                Distribution of test case pass rates across candidate algorithmic submissions.
              </p>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {codingVerdicts.total} Total Code Evaluations
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">
                Full AC (100% Passed)
              </span>
              <div className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1">
                {codingVerdicts.ac}
              </div>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                {Math.round((codingVerdicts.ac / codingVerdicts.total) * 100)}% of coding attempts
              </span>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5">
              <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider">
                Partial Credit
              </span>
              <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400 mt-1">
                {codingVerdicts.partial}
              </div>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                {Math.round((codingVerdicts.partial / codingVerdicts.total) * 100)}% partial test passes
              </span>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5">
              <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold uppercase tracking-wider">
                Failed / Syntax Error
              </span>
              <div className="text-2xl font-bold font-mono text-rose-700 dark:text-rose-400 mt-1">
                {codingVerdicts.failed}
              </div>
              <span className="text-[11px] text-muted-foreground block mt-0.5">
                {Math.round((codingVerdicts.failed / codingVerdicts.total) * 100)}% failed or zero marks
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Proctoring & Security Telemetry Section */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-destructive/10 text-destructive">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Proctoring Telemetry</h2>
              <p className="text-xs text-muted-foreground">
                Authoritative security violations, full-screen exits, and window blur audit logs.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {integritySummary && (
              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-lg font-mono font-bold">
                Cohort Integrity: {integritySummary.integrityRate}% Clean
              </span>
            )}
            <span className="px-3 py-1 bg-secondary rounded-lg font-mono">
              Total Violations: <strong className="text-foreground">{totalViolations}</strong>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-muted/30 border border-border/70 rounded-xl p-4">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Tab / Window Switches
            </span>
            <div className="text-2xl font-bold text-foreground mt-1">{tabSwitches}</div>
          </div>
          <div className="bg-muted/30 border border-border/70 rounded-xl p-4">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Fullscreen Exits
            </span>
            <div className="text-2xl font-bold text-foreground mt-1">{fullscreenExits}</div>
          </div>
          <div className="bg-muted/30 border border-border/70 rounded-xl p-4">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Security Flagged Events
            </span>
            <div className="text-2xl font-bold text-foreground mt-1">
              {proctoring?.securityEventsCount ?? securityEvents.length}
            </div>
          </div>
        </div>

        {/* Recent Proctoring Incidents */}
        {securityEvents.length > 0 ? (
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/40 px-4 py-2.5 border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Security Incidents
            </div>
            <div className="divide-y divide-border">
              {securityEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-muted/20 text-xs transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        evt.severity === "HIGH"
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                          : evt.severity === "MEDIUM"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {evt.severity || "INFO"}
                    </span>
                    <span className="font-semibold text-foreground">
                      {evt.candidateName || "Candidate"}
                    </span>
                    {evt.candidateEmail && (
                      <span className="text-muted-foreground font-mono text-[11px]">
                        ({evt.candidateEmail})
                      </span>
                    )}
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      {evt.eventType?.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-[11px] whitespace-nowrap">
                    {evt.createdAt ? new Date(evt.createdAt).toLocaleString() : "Recent"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/20 rounded-xl p-3 border border-border/50">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>No critical proctoring violations recorded for this assessment.</span>
          </div>
        )}
      </div>

      {/* Question Performance Analytics Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Question Performance Analytics
              </h2>
              <p className="text-xs text-muted-foreground">
                Item-level pass rates, average completion duration, and candidate accuracy.
              </p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {questions.length} Question{questions.length === 1 ? "" : "s"} Defined
          </span>
        </div>

        {questions.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-foreground">
              No Question Analytics Available
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Questions and item difficulty metrics will appear here once candidate responses are
              graded.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Question
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Success Rate
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Correct / Total
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Avg Time
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Avg Score
                  </th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Psychometrics (D / P)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {questions.map((q) => {
                  const rate = Number(q.successRate ?? 0);
                  const isHigh = rate >= 70;
                  const isMedium = rate >= 40 && rate < 70;
                  const barColor = isHigh
                    ? "bg-emerald-500"
                    : isMedium
                      ? "bg-amber-500"
                      : "bg-rose-500";

                  return (
                    <tr key={q.questionId} className="hover:bg-muted/15 transition-colors">
                      <td className="px-6 py-4 max-w-[280px]">
                        <div className="font-medium text-foreground truncate" title={q.title}>
                          {q.title || `Question ${q.questionId}`}
                        </div>
                        {q.difficulty && (
                          <span className="text-[10px] text-muted-foreground uppercase font-mono mt-0.5 block">
                            Difficulty: {q.difficulty}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="bg-secondary text-secondary-foreground text-[11px] px-2.5 py-1 rounded-md font-mono">
                          {q.type?.replace(/_/g, " ") || "standard"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-24 bg-secondary rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                              style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-foreground">
                            {rate.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-foreground font-mono text-xs">
                        <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {q.correctCount ?? 0}
                        </strong>{" "}
                        / {q.totalAttempts ?? 0}
                        {q.partialCreditCount != null && q.partialCreditCount > 0 && (
                          <span className="text-[10px] text-amber-500 ml-1 block">
                            +{q.partialCreditCount} partial
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-muted-foreground text-xs font-mono">
                        {formatDuration(q.avgTimeSpent ?? 0)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-foreground font-mono text-xs">
                        {q.avgMarksAwarded != null
                          ? Number(q.avgMarksAwarded).toFixed(1)
                          : "0.0"}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-xs font-mono">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              q.discriminationIndex == null
                                ? "bg-muted text-muted-foreground"
                                : q.discriminationIndex >= 0.35
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : q.discriminationIndex >= 0.15
                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                            }`}
                            title={
                              q.discriminationIndex == null
                                ? "Candidate cohort too small (<4) for psychometric discrimination"
                                : q.discriminationIndex < 0
                                  ? "Negative discrimination: weaker students scored higher than top students. Check question ambiguity or key."
                                  : "Item Discrimination Index (D): differentiation between upper and lower quartiles"
                            }
                          >
                            D: {q.discriminationIndex != null ? (q.discriminationIndex >= 0 ? `+${q.discriminationIndex}` : `${q.discriminationIndex}`) : "N/A"}
                          </span>
                          <span className="text-[10px] text-muted-foreground" title="Item Difficulty (P-value): ratio of correct answers">
                            Diff P: {q.difficultyP != null ? `${q.difficultyP}` : "—"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Administrative Audit Log Trail */}
      {auditLogs.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xs">
          <div className="flex items-center gap-2.5 mb-4">
            <History className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-base font-bold text-foreground">Administrative Audit Trail</h2>
          </div>
          <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs hover:bg-muted/20"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono bg-secondary px-2 py-0.5 rounded text-[10px]">
                    {log.action}
                  </span>
                  <span className="text-foreground">{log.event || log.action}</span>
                  {log.actorEmail && (
                    <span className="text-muted-foreground">by {log.actorEmail}</span>
                  )}
                </div>
                <div className="text-muted-foreground font-mono text-[11px]">
                  {log.timestamp ? new Date(log.timestamp).toLocaleString() : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
