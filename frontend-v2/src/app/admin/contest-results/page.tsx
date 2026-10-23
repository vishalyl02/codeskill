"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { adminContestsAPI } from "@/config/api";
import {
  Trophy,
  Search,
  Download,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Users,
  ChevronDown,
  X,
  FileSpreadsheet,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";

interface ContestListItem {
  id: string;
  _id?: string;
  title: string;
  slug: string;
  startTime: string;
  endTime: string;
  isPublished: boolean;
  resultsPublished: boolean;
  participantCount?: number;
  antiCheatConfig?: {
    maxTabSwitchViolations?: number;
    warningLimit?: number;
    actionOnMaxViolations?: string;
    enableFullscreenCheck?: boolean;
    enableTabSwitchDetection?: boolean;
  };
}

interface AttemptResult {
  id: string;
  attemptNumber: number;
  user: {
    id: string;
    name: string;
    email: string;
    username: string;
  };
  score: number;
  problemsSolved: number;
  status: string;
  startedAt: string;
  submittedAt: string | null;
  durationSeconds: number | null;
  warnings: number;
  violations: Array<{
    type: string;
    timestamp: string;
    metadata?: any;
  }>;
  reattemptGrant?: {
    id: string;
    allowedAttempts: number;
    usedAttempts: number;
    expiresAt?: string;
    grantedBy: string;
    reason: string;
    createdAt: string;
  } | null;
}

export default function ContestResultsPage() {
  const searchParams = useSearchParams();
  const initialContestId = searchParams.get("contestId") || "";

  // Contests State
  const [contests, setContests] = useState<ContestListItem[]>([]);
  const [selectedContestId, setSelectedContestId] = useState<string>(initialContestId);
  const [loadingContests, setLoadingContests] = useState(true);

  // Results State
  const [resultsData, setResultsData] = useState<{
    contest: any;
    results: AttemptResult[];
    total: number;
    stats: {
      totalAttempts: number;
      completedCount: number;
      avgScore: number;
      maxScore: number;
    };
  } | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");

  // Bulk Selection & Modals
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isReattemptModalOpen, setIsReattemptModalOpen] = useState(false);
  const [reattemptReason, setReattemptReason] = useState("");
  const [allowedAttempts, setAllowedAttempts] = useState(1);
  const [reattemptExpiry, setReattemptExpiry] = useState("");
  const [grantingReattempt, setGrantingReattempt] = useState(false);

  // Security Audit Modal State
  const [selectedAttemptAudit, setSelectedAttemptAudit] = useState<AttemptResult | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Fetch Contests List
  useEffect(() => {
    fetchContests();
  }, []);

  const fetchContests = async () => {
    try {
      setLoadingContests(true);
      const res = await adminContestsAPI.getAll(1, 100);
      const list = res.data.contests || [];
      setContests(list);
      if (!selectedContestId && list.length > 0) {
        setSelectedContestId(list[0].id || list[0]._id);
      }
    } catch (err) {
      console.error("Failed to load contests", err);
      setError("Failed to load contests list. Please refresh the page.");
    } finally {
      setLoadingContests(false);
    }
  };

  // Fetch Results for Selected Contest
  useEffect(() => {
    if (!selectedContestId) return;
    fetchResults();
  }, [selectedContestId, statusFilter, minScore, maxScore]);

  const fetchResults = async () => {
    try {
      setLoadingResults(true);
      setError(null);
      const res = await adminContestsAPI.getResults(selectedContestId, {
        search,
        status: statusFilter === "ALL" ? "" : statusFilter,
        minScore,
        maxScore,
        limit: 200,
      });
      setResultsData(res.data);
      setSelectedStudentIds([]);
    } catch (err: any) {
      console.error("Failed to load contest results", err);
      setError(err?.response?.data?.message || "Failed to load contest results.");
      setResultsData(null);
    } finally {
      setLoadingResults(false);
    }
  };

  // Client-side search filtering if needed
  const filteredResults = useMemo(() => {
    if (!resultsData?.results) return [];
    if (!search.trim()) return resultsData.results;
    const term = search.toLowerCase().trim();
    return resultsData.results.filter(
      (r) =>
        r.user.name.toLowerCase().includes(term) ||
        r.user.email.toLowerCase().includes(term) ||
        r.user.username?.toLowerCase().includes(term),
    );
  }, [resultsData?.results, search]);

  const selectedContest = useMemo(() => {
    return contests.find((c) => (c.id || c._id) === selectedContestId) || resultsData?.contest;
  }, [contests, selectedContestId, resultsData?.contest]);

  // Handle Publish / Unpublish Toggle
  const handleTogglePublish = async () => {
    if (!selectedContestId || publishing) return;
    try {
      setPublishing(true);
      const res = await adminContestsAPI.togglePublishResults(
        selectedContestId,
        !resultsData?.contest?.resultsPublished,
      );
      if (resultsData) {
        setResultsData({
          ...resultsData,
          contest: {
            ...resultsData.contest,
            resultsPublished: res.data.resultsPublished,
          },
        });
      }
      setContests((prev) =>
        prev.map((c) =>
          (c.id || c._id) === selectedContestId
            ? { ...c, resultsPublished: res.data.resultsPublished }
            : c,
        ),
      );
    } catch (err: any) {
      alert(err?.response?.data?.message || "Failed to update publication status.");
    } finally {
      setPublishing(false);
    }
  };

  // Handle CSV Export
  const handleExportCsv = async () => {
    if (!selectedContestId) return;
    try {
      const res = await adminContestsAPI.exportResultsCsv(selectedContestId);
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `contest-${selectedContest?.slug || selectedContestId}-results.csv`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to export contest results CSV.");
    }
  };

  // Toggle Single Student Selection
  const toggleStudentSelection = (userId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  // Toggle Select All
  const toggleSelectAll = () => {
    if (selectedStudentIds.length === filteredResults.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filteredResults.map((r) => r.user.id));
    }
  };

  // Open Reattempt Modal for specific student or bulk
  const openReattemptModal = (studentId?: string) => {
    if (studentId) {
      setSelectedStudentIds([studentId]);
    }
    setReattemptReason("Administrator authorized reattempt");
    setAllowedAttempts(1);
    setReattemptExpiry("");
    setIsReattemptModalOpen(true);
  };

  // Submit Reattempt Grant
  const handleGrantReattempt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContestId || selectedStudentIds.length === 0 || grantingReattempt) return;
    try {
      setGrantingReattempt(true);
      await adminContestsAPI.grantReattempts(selectedContestId, {
        studentIds: selectedStudentIds,
        reason: reattemptReason.trim(),
        allowedAttempts,
        expiresAt: reattemptExpiry ? new Date(reattemptExpiry).toISOString() : undefined,
      });
      setIsReattemptModalOpen(false);
      setSelectedStudentIds([]);
      fetchResults();
    } catch (err: any) {
      alert(err?.response?.data?.message || "Failed to grant reattempt authorization.");
    } finally {
      setGrantingReattempt(false);
    }
  };

  // Revoke Reattempt
  const handleRevokeReattempt = async (targetId: string) => {
    if (!selectedContestId) return;
    if (!confirm("Are you sure you want to revoke this student's active reattempt authorization?"))
      return;
    try {
      await adminContestsAPI.revokeReattempt(selectedContestId, targetId);
      fetchResults();
    } catch (err: any) {
      alert(err?.response?.data?.message || "Failed to revoke reattempt.");
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return "—";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="p-4 sm:p-8 font-sans max-w-7xl mx-auto space-y-6">
      {/* Department & Portal Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            <span>Department of Skill Development</span>
            <span>•</span>
            <span>Chandigarh University</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground mt-1 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-amber-500" />
            Contest Results & Proctoring Hub
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor candidate performance, review security violation audit trails, and grant administrator-authorized reattempts.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {selectedContest && (
            <>
              <button
                type="button"
                onClick={handleTogglePublish}
                disabled={publishing}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-xs ${
                  resultsData?.contest?.resultsPublished
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
                    : "bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700"
                }`}
                title="Toggle whether students can view their score and ranking"
              >
                {publishing ? (
                  <Spinner className="w-4 h-4" />
                ) : resultsData?.contest?.resultsPublished ? (
                  <Eye className="w-4 h-4 text-emerald-500" />
                ) : (
                  <EyeOff className="w-4 h-4 text-zinc-400" />
                )}
                {resultsData?.contest?.resultsPublished ? "Results Published" : "Results Hidden (Draft)"}
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-xs"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </>
          )}

          <button
            type="button"
            onClick={fetchResults}
            disabled={loadingResults}
            className="p-2.5 bg-card border border-border text-foreground hover:bg-muted/50 rounded-xl transition-all"
            title="Refresh Results"
          >
            <RefreshCw className={`w-4 h-4 ${loadingResults ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Contest Selector Bar */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <label htmlFor="contest-selector" className="text-sm font-semibold text-foreground shrink-0">
            Select Contest:
          </label>
          <div className="relative flex-1 max-w-xl">
            <select
              id="contest-selector"
              value={selectedContestId}
              onChange={(e) => setSelectedContestId(e.target.value)}
              disabled={loadingContests}
              className="w-full appearance-none px-4 py-2.5 pr-10 bg-background border border-border rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            >
              {loadingContests ? (
                <option value="">Loading contests...</option>
              ) : contests.length === 0 ? (
                <option value="">No contests available</option>
              ) : (
                contests.map((c) => (
                  <option key={c.id || c._id} value={c.id || c._id}>
                    {c.title} ({c.participantCount || 0} participants) —{" "}
                    {c.resultsPublished ? "Published" : "Unpublished"}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {selectedContest && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted border border-border font-mono">
              Slug: {selectedContest.slug}
            </span>
            <Link
              href={`/contests/${selectedContest.slug}`}
              target="_blank"
              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              View Student Gate
            </Link>
          </div>
        )}
      </div>

      {/* Summary KPI Cards */}
      {resultsData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-2xl p-4 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Attempts</p>
            <p className="text-2xl font-bold text-foreground mt-1">{resultsData.stats.totalAttempts}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Across all students</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Completed</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {resultsData.stats.completedCount}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Submitted sessions</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Average Score</p>
            <p className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">
              {resultsData.stats.avgScore} pts
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Highest: {resultsData.stats.maxScore} pts</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 shadow-xs">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Security Policy</p>
            <div className="flex items-center gap-1.5 mt-1">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              <span className="text-sm font-bold text-foreground">
                Limit: {resultsData.contest?.antiCheatConfig?.maxTabSwitchViolations || 3} violations
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
              Action: {(resultsData.contest?.antiCheatConfig?.actionOnMaxViolations || "auto_submit").replace("_", " ")}
            </p>
          </div>
        </div>
      )}

      {/* Main Results Table Section */}
      <div className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden flex flex-col">
        {/* Filters Toolbar */}
        <div className="p-4 border-b border-border flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search candidate name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              >
                <option value="ALL">All Statuses</option>
                <option value="Completed">Completed / Submitted</option>
                <option value="InProgress">In Progress</option>
                <option value="Terminated">Terminated (Violation Limit)</option>
                <option value="Locked">Locked</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <input
                type="number"
                placeholder="Min Score"
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                className="w-20 px-2 py-2 bg-background border border-border rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="number"
                placeholder="Max Score"
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                className="w-20 px-2 py-2 bg-background border border-border rounded-xl text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          {/* Bulk Action Controls */}
          {selectedStudentIds.length > 0 && (
            <div className="flex items-center gap-3 animate-in fade-in duration-150">
              <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20">
                {selectedStudentIds.length} candidate(s) selected
              </span>
              <button
                type="button"
                onClick={() => openReattemptModal()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 text-white hover:bg-sky-500 transition-colors shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Grant Reattempt in Bulk
              </button>
            </div>
          )}
        </div>

        {/* Results Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={
                      filteredResults.length > 0 &&
                      selectedStudentIds.length === filteredResults.length
                    }
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  />
                </th>
                <th className="py-3 px-4">Candidate Name / Email</th>
                <th className="py-3 px-4 text-center">Attempt #</th>
                <th className="py-3 px-4 text-center">Score</th>
                <th className="py-3 px-4 text-center">Solved</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Security Violations</th>
                <th className="py-3 px-4">Reattempt Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingResults ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <Spinner className="w-5 h-5" />
                      Loading candidate results...
                    </div>
                  </td>
                </tr>
              ) : filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    No results found for the selected contest and filter criteria.
                  </td>
                </tr>
              ) : (
                filteredResults.map((attempt, index) => {
                  const isSelected = selectedStudentIds.includes(attempt.user.id);
                  const violationCount = attempt.warnings || (attempt.violations || []).length;
                  const isCriticalViolations =
                    violationCount >=
                    (resultsData?.contest?.antiCheatConfig?.maxTabSwitchViolations || 3);

                  return (
                    <tr
                      key={attempt.id}
                      className={`hover:bg-muted/30 transition-colors ${
                        isSelected ? "bg-sky-500/5" : ""
                      }`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleStudentSelection(attempt.user.id)}
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        />
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">{attempt.user.name}</div>
                        <div className="text-xs text-muted-foreground">{attempt.user.email}</div>
                        {attempt.user.username && (
                          <div className="text-[11px] text-muted-foreground/70 font-mono">
                            @{attempt.user.username}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center font-mono text-xs">
                        <span className="px-2 py-0.5 bg-muted rounded-md border border-border">
                          Attempt {attempt.attemptNumber || 1}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center font-bold text-foreground">
                        {attempt.score} pts
                      </td>

                      <td className="py-3 px-4 text-center font-medium text-foreground">
                        {attempt.problemsSolved} / {resultsData?.contest?.problemsCount || 0}
                      </td>

                      <td className="py-3 px-4">
                        {attempt.status === "Completed" || attempt.submittedAt ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </span>
                        ) : attempt.status === "Terminated" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            <XCircle className="w-3 h-3" /> Terminated
                          </span>
                        ) : attempt.status === "Locked" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <AlertTriangle className="w-3 h-3" /> Locked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                            <Clock className="w-3 h-3" /> In Progress
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        <div>{formatDuration(attempt.durationSeconds)}</div>
                        {attempt.submittedAt && (
                          <div className="text-[11px] text-muted-foreground/70">
                            {new Date(attempt.submittedAt).toLocaleTimeString()}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setSelectedAttemptAudit(attempt)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                            isCriticalViolations
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                              : violationCount > 0
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                                : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                          }`}
                          title="Click to view full security audit timeline"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>{violationCount} violation{violationCount !== 1 ? "s" : ""}</span>
                        </button>
                      </td>

                      <td className="py-3 px-4 text-xs">
                        {attempt.reattemptGrant ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>
                                Authorized ({attempt.reattemptGrant.usedAttempts}/
                                {attempt.reattemptGrant.allowedAttempts} used)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRevokeReattempt(attempt.reattemptGrant!.id)}
                              className="text-[11px] text-rose-500 hover:underline font-medium"
                            >
                              Revoke Authorization
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openReattemptModal(attempt.user.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-400 border border-border transition-colors shadow-2xs"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Allow Reattempt
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reattempt Authorization Modal */}
      {isReattemptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-sky-500" />
                <h3 className="text-lg font-bold text-foreground">Grant Contest Reattempt</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReattemptModalOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGrantReattempt} className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-xl border border-border text-xs text-muted-foreground space-y-1">
                <div className="font-semibold text-foreground">
                  Granting reattempt for {selectedStudentIds.length} candidate(s):
                </div>
                <div className="truncate">
                  Contest: <strong className="text-foreground">{selectedContest?.title}</strong>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Existing attempts are preserved in the permanent audit trail. The student will be allowed to start a new verified session.
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Additional Attempts Allowed
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={allowedAttempts}
                  onChange={(e) => setAllowedAttempts(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  required
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Expiry Window (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={reattemptExpiry}
                  onChange={(e) => setReattemptExpiry(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave blank if reattempt access should remain open until the contest period ends.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Administrative Reason / Justification <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={reattemptReason}
                  onChange={(e) => setReattemptReason(e.target.value)}
                  required
                  placeholder="e.g. University lab electricity outage during initial attempt, student submitted formal request"
                  className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsReattemptModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={grantingReattempt}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-sky-600 text-white hover:bg-sky-500 transition-colors shadow-xs disabled:opacity-50"
                >
                  {grantingReattempt ? <Spinner className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                  {grantingReattempt ? "Authorizing..." : "Authorize Reattempt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Security Event Audit Trail Modal */}
      {selectedAttemptAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                <div>
                  <h3 className="text-lg font-bold text-foreground">Security Audit Trail</h3>
                  <p className="text-xs text-muted-foreground">
                    Candidate: {selectedAttemptAudit.user.name} ({selectedAttemptAudit.user.email})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAttemptAudit(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="grid grid-cols-2 gap-3 text-xs bg-muted/40 p-3 rounded-xl border border-border">
                <div>
                  <span className="text-muted-foreground">Attempt Number:</span>{" "}
                  <strong className="text-foreground">#{selectedAttemptAudit.attemptNumber}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Current Status:</span>{" "}
                  <strong className="text-foreground">{selectedAttemptAudit.status}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Started:</span>{" "}
                  <strong className="text-foreground">
                    {new Date(selectedAttemptAudit.startedAt).toLocaleString()}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Warnings:</span>{" "}
                  <strong className="text-foreground">{selectedAttemptAudit.warnings}</strong>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Timestamped Security Events Timeline
                </h4>
                {selectedAttemptAudit.violations.length === 0 ? (
                  <div className="p-6 text-center text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
                    Clean session. No tab switches or security violations detected.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedAttemptAudit.violations.map((v, i) => (
                      <div
                        key={i}
                        className="p-3 bg-muted/30 border border-border rounded-xl text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-rose-600 dark:text-rose-400">
                            #{i + 1} {v.type}
                          </span>
                          <span className="text-muted-foreground font-mono">
                            {new Date(v.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          Timestamp: {new Date(v.timestamp).toISOString()}
                        </div>
                        {v.metadata && Object.keys(v.metadata).length > 0 && (
                          <pre className="text-[10px] bg-background p-2 rounded border border-border overflow-x-auto text-muted-foreground">
                            {JSON.stringify(v.metadata, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border shrink-0">
              <button
                type="button"
                onClick={() => setSelectedAttemptAudit(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Close Audit Trail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
