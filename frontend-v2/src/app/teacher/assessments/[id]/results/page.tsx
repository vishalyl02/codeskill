"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Star,
  AlertTriangle,
  Download,
  Search,
  RefreshCw,
  Eye,
  X,
  FileText,
  Code,
  RotateCcw,
  Camera,
  Save,
  MessageSquare,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { adminAssessmentsAPI, facultyAPI } from "@/config/api";
import toast from "react-hot-toast";
import { formatIndianDateTime } from "@/lib/indian-time";
import { assessmentResultsCSV } from "@/lib/assessment-results-export";
import { Spinner } from "@/components/ui/spinner";

export default function FacultyAssessmentResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const resultsRequest = useRef(0);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"candidates" | "all_attempts">("candidates");
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [modalTab, setModalTab] = useState<"proctoring" | "grading" | "code" | "attempts">("proctoring");

  // Snapshots state
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState<string | null>(null);

  // Manual Review Form State
  const [manualAdjustment, setManualAdjustment] = useState<number>(0);
  const [instructorFeedback, setInstructorFeedback] = useState<string>("");
  const [clearRadarFlags, setClearRadarFlags] = useState<boolean>(false);
  const [isSavingReview, setIsSavingReview] = useState(false);

  // Filters
  const [resultFilter, setResultFilter] = useState<"all" | "passed" | "failed">("all");
  const [proctoringFilter, setProctoringFilter] = useState<"all" | "clean" | "flagged" | "suspicious">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "submitted" | "timed_out" | "in_progress">("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [downloadingReports, setDownloadingReports] = useState<string[]>([]);

  const fetchResults = async () => {
    const request = ++resultsRequest.current;
    setIsLoading(true);
    try {
      const res = await adminAssessmentsAPI.getResults(id);
      if (request === resultsRequest.current) setData(res.data);
    } catch (err: any) {
      console.error("Failed to load results:", err);
      toast.error(err.response?.data?.message || "Failed to load assessment results");
    } finally {
      if (request === resultsRequest.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, [id]);

  // When a candidate is selected, fetch their proctoring snapshots from facultyAPI
  const handleSelectCandidate = async (candidate: any, initialTab: "proctoring" | "grading" | "code" | "attempts" = "proctoring") => {
    setSelectedCandidate(candidate);
    setModalTab(initialTab);
    setManualAdjustment(candidate.manualScoreAdjustment || 0);
    setInstructorFeedback(candidate.instructorFeedback || "");
    setClearRadarFlags(Boolean(candidate.radarFlagsCleared));
    setSnapshots([]);

    const attemptId = candidate.id || candidate._id;
    if (attemptId) {
      setLoadingSnapshots(true);
      try {
        const res = await facultyAPI.getAttemptSnapshots(id, attemptId);
        if (res.data?.success) {
          setSnapshots(res.data.snapshots || []);
        }
      } catch (err) {
        console.error("Failed to load snapshots", err);
      } finally {
        setLoadingSnapshots(false);
      }
    }
  };

  const handleSaveReview = async () => {
    if (!selectedCandidate) return;
    const attemptId = selectedCandidate.id || selectedCandidate._id;
    if (!attemptId) return;

    setIsSavingReview(true);
    try {
      const res = await facultyAPI.reviewAttempt(id, attemptId, {
        manualScoreAdjustment: Number(manualAdjustment),
        instructorFeedback,
        clearRadarFlags,
      });

      if (res.data?.success) {
        toast.success("Attempt review and grading saved successfully!");
        setSelectedCandidate((prev: any) => ({
          ...prev,
          score: res.data.attempt.score,
          passed: res.data.attempt.passed,
          percentage: res.data.attempt.percentage,
          manualScoreAdjustment: res.data.attempt.manualScoreAdjustment,
          instructorFeedback: res.data.attempt.instructorFeedback,
          radarFlagsCleared: res.data.attempt.radarFlagsCleared,
        }));
        fetchResults();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save attempt review");
    } finally {
      setIsSavingReview(false);
    }
  };

  const downloadReport = async (attempt: any) => {
    const attemptId = attempt.id || attempt._id;
    if (!attemptId) {
      toast.error("This attempt has no report ID.");
      return;
    }
    setDownloadingReports((current) => [...current, attemptId]);
    try {
      const response = await adminAssessmentsAPI.getAttemptReport(attemptId);
      const isPdf =
        response.data?.type?.includes("pdf") ||
        String(response.headers?.["content-type"] || "").includes("pdf") ||
        response.data instanceof Blob;
      if (!isPdf) throw new Error("The server did not return a PDF report.");
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const candidateUid = attempt.studentUid || attempt.student?.uid || attemptId;
      link.download = `assessment-report-${candidateUid}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      toast.error("Could not download report. Please try again.");
    } finally {
      setDownloadingReports((current) => current.filter((value) => value !== attemptId));
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Spinner className="w-8 h-8 text-primary animate-spin" />
        <span className="text-xs text-muted-foreground font-medium">Loading candidate results…</span>
      </div>
    );
  }

  const assessment = data?.assessment || {};
  const stats = data?.stats || {};
  const rawList = viewMode === "candidates" ? data?.candidates || [] : data?.attempts || [];

  const filteredList = rawList.filter((item: any) => {
    const s = search.toLowerCase();
    const matchesSearch =
      !s ||
      item.studentName?.toLowerCase().includes(s) ||
      item.studentEmail?.toLowerCase().includes(s) ||
      item.studentUid?.toLowerCase().includes(s);

    const matchesResult =
      resultFilter === "all" ||
      (resultFilter === "passed" && item.passed) ||
      (resultFilter === "failed" && !item.passed);

    const totalV = (item.violations || []).length;
    const isSuspicious = totalV >= 3;
    const matchesProctoring =
      proctoringFilter === "all" ||
      (proctoringFilter === "clean" && totalV === 0) ||
      (proctoringFilter === "flagged" && totalV > 0) ||
      (proctoringFilter === "suspicious" && isSuspicious);

    const matchesStatus =
      statusFilter === "all" || item.status === statusFilter;

    return matchesSearch && matchesResult && matchesProctoring && matchesStatus;
  });

  const totalItems = filteredList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedList = filteredList.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto font-sans">
      {/* Top Breadcrumb & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <Link
            href="/teacher/assessments"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to My Assessments
          </Link>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2.5">
            {assessment.title || "Assessment Results"}
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold bg-muted text-muted-foreground border border-border">
              {assessment.code}
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Faculty Grading & Proctoring Review Portal
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchResults}
            className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Refresh results"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const csv = assessmentResultsCSV(assessment, rawList, viewMode);
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `results-${assessment.code || id}.csv`;
              link.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-semibold hover:bg-muted transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-2xl bg-card border border-border">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">Total Candidates</span>
          <div className="text-xl font-black text-foreground mt-1 font-mono">{stats.totalCandidates || 0}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-card border border-border">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">Passed</span>
          <div className="text-xl font-black text-emerald-500 mt-1 font-mono">{stats.passedCandidates || 0}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-card border border-border">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">Failed</span>
          <div className="text-xl font-black text-rose-500 mt-1 font-mono">{stats.failedCandidates || 0}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-card border border-border">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">Average Score</span>
          <div className="text-xl font-black text-foreground mt-1 font-mono">
            {stats.averageScore ? stats.averageScore.toFixed(1) : 0}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-card border border-border">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">Flagged Attempts</span>
          <div className="text-xl font-black text-amber-500 mt-1 font-mono">{stats.flaggedCount || 0}</div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search candidate name, email, or UID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
            <select
              value={resultFilter}
              onChange={(e: any) => {
                setResultFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-background border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary outline-none cursor-pointer"
            >
              <option value="all">All Results</option>
              <option value="passed">Passed Only</option>
              <option value="failed">Failed Only</option>
            </select>

            <select
              value={proctoringFilter}
              onChange={(e: any) => {
                setProctoringFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-background border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary outline-none cursor-pointer"
            >
              <option value="all">All Integrity</option>
              <option value="clean">Clean (0 Flags)</option>
              <option value="flagged">Flagged (&gt; 0)</option>
              <option value="suspicious">Suspicious (&ge; 3)</option>
            </select>

            <select
              value={viewMode}
              onChange={(e: any) => setViewMode(e.target.value)}
              className="bg-background border border-border rounded-xl px-2.5 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary outline-none cursor-pointer font-semibold"
            >
              <option value="candidates">Best Attempts (Candidates)</option>
              <option value="all_attempts">All Attempts Log</option>
            </select>
          </div>
        </div>
      </div>

      {/* Candidates & Attempts Table */}
      <div className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden flex flex-col">
        {paginatedList.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-xs">
            No submissions found matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-muted-foreground">
              <thead className="bg-muted/40 uppercase text-[10px] font-bold text-foreground border-b border-border">
                <tr>
                  <th className="px-5 py-3.5">Candidate</th>
                  <th className="px-5 py-3.5 text-center">Score</th>
                  <th className="px-5 py-3.5 text-center">Accuracy</th>
                  <th className="px-5 py-3.5 text-center">Result</th>
                  <th className="px-5 py-3.5 text-center">Duration</th>
                  <th className="px-5 py-3.5 text-center">Proctoring Telemetry</th>
                  <th className="px-5 py-3.5 text-center">Report</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedList.map((item: any) => {
                  const totalV = (item.violations || []).length;
                  const isSuspicious = totalV >= 3;

                  return (
                    <tr key={item.id || item._id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-foreground">{item.studentName}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{item.studentUid}</div>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="font-mono font-bold text-sm text-foreground">
                          {item.score} <span className="text-[11px] text-muted-foreground font-normal">/ {item.maxScore}</span>
                        </div>
                        {item.manualScoreAdjustment ? (
                          <div className="text-[10px] text-indigo-500 font-bold">
                            {item.manualScoreAdjustment > 0 ? `+${item.manualScoreAdjustment}` : item.manualScoreAdjustment} adjusted
                          </div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono font-medium text-foreground">
                        {item.accuracy || 0}%
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            item.passed
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {item.passed ? "PASSED" : "FAILED"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono">
                        {Math.floor((item.timeSpentSeconds || 0) / 60)}m {(item.timeSpentSeconds || 0) % 60}s
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleSelectCandidate(item, "proctoring")}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                            item.radarFlagsCleared
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : isSuspicious
                              ? "bg-rose-500/10 text-rose-500 border-rose-500/30 hover:bg-rose-500/20"
                              : totalV > 0
                              ? "bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20"
                              : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                          }`}
                        >
                          <Eye className="w-3 h-3" />
                          <span>
                            {item.radarFlagsCleared ? "Flags Cleared" : totalV === 0 ? "Clean (0 Flags)" : `${totalV} Incident${totalV > 1 ? "s" : ""}`}
                          </span>
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => downloadReport(item)}
                          disabled={downloadingReports.includes(item.id || item._id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-foreground text-[11px] font-semibold hover:bg-muted/80 border border-border transition-colors"
                        >
                          <Download className="w-3 h-3" /> PDF
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleSelectCandidate(item, "grading")}
                          className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors shadow-2xs"
                        >
                          Grade & Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalItems > 0 && (
          <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Showing <span className="font-bold text-foreground">{paginatedList.length}</span> of{" "}
              <span className="font-bold text-foreground font-mono">{totalItems}</span> submissions
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted text-foreground transition-colors disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono text-xs font-semibold text-foreground">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted text-foreground transition-colors disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Proctoring, Snapshots & Grading Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-3xl w-full space-y-5 animate-in fade-in zoom-in-95 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Candidate Review: {selectedCandidate.studentName}
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono">
                    UID: {selectedCandidate.studentUid} • Attempt ID: {selectedCandidate.id || selectedCandidate._id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCandidate(null)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Candidate Summary Strip */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs p-3 rounded-xl bg-muted/30 border border-border font-mono">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Current Score</span>
                <div className="font-bold text-foreground">{selectedCandidate.score} / {selectedCandidate.maxScore}</div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Accuracy</span>
                <div className="font-bold text-foreground">{selectedCandidate.accuracy || 0}%</div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Tab Switches</span>
                <div className="font-bold text-amber-500">{selectedCandidate.tabSwitchCount || 0}</div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Status</span>
                <div className={`font-bold ${selectedCandidate.passed ? "text-emerald-500" : "text-rose-500"}`}>
                  {selectedCandidate.passed ? "PASSED" : "FAILED"}
                </div>
              </div>
            </div>

            {/* Candidate Kiosk & Security Attestation Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-muted/20 border border-border text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span className="font-semibold text-foreground">Client Environment:</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                  {selectedCandidate.kioskMode === "macos_aac_enforced"
                    ? "macOS AAC Hardware Enclave"
                    : selectedCandidate.kioskMode === "windows_isolated_desktop"
                    ? "Windows Isolated Desktop (TPM)"
                    : selectedCandidate.kioskMode === "linux_wayland_cage"
                    ? "Linux Wayland Cage"
                    : selectedCandidate.attestationTier === "hardware_tpm_enclave"
                    ? "Hardware TPM / Secure Enclave"
                    : selectedCandidate.requireLockdown
                    ? "CodeSkill LockDown (Standard)"
                    : "Standard Web Session"}
                </span>
              </div>
              {selectedCandidate.clientBinaryHash && (
                <div className="text-[10px] font-mono text-muted-foreground">
                  Binary: {selectedCandidate.clientBinaryHash.slice(0, 12)}...
                </div>
              )}
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-border pb-2 text-xs">
              <button
                type="button"
                onClick={() => setModalTab("proctoring")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  modalTab === "proctoring"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Camera className="w-3.5 h-3.5" /> Proctoring & Snapshots ({snapshots.length})
              </button>
              <button
                type="button"
                onClick={() => setModalTab("grading")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  modalTab === "grading"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Sliders className="w-3.5 h-3.5" /> Manual Grading & Remarks
              </button>
              <button
                type="button"
                onClick={() => setModalTab("code")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  modalTab === "code"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Code className="w-3.5 h-3.5" /> Code & Answers
              </button>
              <button
                type="button"
                onClick={() => setModalTab("attempts")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  modalTab === "attempts"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Attempts ({selectedCandidate.allAttempts?.length || 1})
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[250px]">
              {/* Tab 1: Proctoring & Snapshots */}
              {modalTab === "proctoring" && (
                <div className="space-y-4">
                  {/* Presigned S3 Snapshots Gallery */}
                  <div>
                    <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-primary" /> Proctoring Webcam & Screen Captures
                    </h4>

                    {loadingSnapshots ? (
                      <div className="flex items-center justify-center p-8 bg-muted/20 border border-border rounded-xl">
                        <Spinner className="w-5 h-5 text-primary animate-spin" />
                      </div>
                    ) : snapshots.length === 0 ? (
                      <div className="p-6 bg-muted/20 border border-border rounded-xl text-center text-xs text-muted-foreground">
                        No image captures were uploaded for this attempt.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {snapshots.map((snap, idx) => (
                          <div
                            key={idx}
                            onClick={() => setPreviewSnapshot(snap.url)}
                            className="group relative rounded-xl overflow-hidden border border-border bg-black aspect-video cursor-pointer hover:border-primary transition-all"
                          >
                            <img
                              src={snap.url}
                              alt={`Capture ${idx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2 opacity-90">
                              <span className="text-[10px] text-white font-mono">
                                {snap.timestamp ? formatIndianDateTime(snap.timestamp, true) : `Capture #${idx + 1}`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Camera & Mic Disconnect Outages Alert Chip */}
                  {(() => {
                    const disconnects = (selectedCandidate.violations || []).filter(
                      (v: any) => v.type === 'CAMERA_OR_MIC_DISCONNECTED' || v.type === 'CAMERA_OR_MIC_RESTORED'
                    );
                    if (disconnects.length === 0) return null;
                    const cameraOutages = disconnects.filter((v: any) => v.metadata?.deviceKind === 'videoinput' || v.type === 'CAMERA_OR_MIC_DISCONNECTED');
                    const totalDurationMs = disconnects.reduce((acc: number, v: any) => acc + (v.metadata?.outageDurationMs || 0), 0);
                    const totalSecs = Math.round(totalDurationMs / 1000);
                    return (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-semibold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                          Hardware Outage Alert: Camera/Mic disconnected ({cameraOutages.length} incidents{totalSecs > 0 ? `, ~${totalSecs}s total outage` : ''})
                        </span>
                      </div>
                    );
                  })()}

                  {/* Post-Exam Candidate Feedback Section */}
                  {selectedCandidate.feedback && (
                    <div className="p-3.5 rounded-xl bg-card border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> Candidate Post-Exam Feedback
                        </h4>
                        <div className="flex items-center gap-1 text-xs font-bold text-amber-400">
                          {selectedCandidate.feedback.rating} / 5 Stars
                        </div>
                      </div>
                      {Array.isArray(selectedCandidate.feedback.technicalIssues) && selectedCandidate.feedback.technicalIssues.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {selectedCandidate.feedback.technicalIssues.map((tag: string, i: number) => (
                            <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {selectedCandidate.feedback.comments && (
                        <p className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded-lg border border-border/50">
                          &ldquo;{selectedCandidate.feedback.comments}&rdquo;
                        </p>
                      )}
                    </div>
                  )}

                  {/* Violations Feed */}
                  <div>
                    <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-500" /> Security Incidents Log
                    </h4>
                    {(!selectedCandidate.violations || selectedCandidate.violations.length === 0) ? (
                      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Clean session! No tab switches or fullscreen violations recorded.</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedCandidate.violations.map((v: any, idx: number) => (
                          <div
                            key={idx}
                            className="p-3 rounded-xl bg-muted/30 border border-border text-xs flex items-center justify-between"
                          >
                            <div>
                              <div className="font-semibold text-foreground capitalize">
                                {v.type ? v.type.replace(/_/g, " ") : "Proctoring Alert"}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {v.details || "Security incident during exam session"}
                              </div>
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {v.timestamp ? formatIndianDateTime(v.timestamp, true) : "Logged"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: Manual Grading & Remarks */}
              {modalTab === "grading" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-muted/20 border border-border space-y-4">
                    <div>
                      <label className="text-xs font-bold text-foreground block mb-1">
                        Score Adjustment (+ / - marks)
                      </label>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        Manually award bonus points or deduct marks after reviewing submissions.
                      </p>
                      <input
                        type="number"
                        value={manualAdjustment}
                        onChange={(e) => setManualAdjustment(Number(e.target.value))}
                        className="w-36 px-3 py-1.5 bg-background border border-border rounded-xl text-sm font-mono font-bold text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-foreground block mb-1">
                        Instructor Feedback & Remarks
                      </label>
                      <textarea
                        rows={3}
                        value={instructorFeedback}
                        onChange={(e) => setInstructorFeedback(e.target.value)}
                        placeholder="Provide candidate-specific remarks, rationale for score adjustment, or feedback..."
                        className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none placeholder:text-muted-foreground"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <input
                        type="checkbox"
                        id="clearRadar"
                        checked={clearRadarFlags}
                        onChange={(e) => setClearRadarFlags(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-primary/20 w-4 h-4 cursor-pointer"
                      />
                      <label htmlFor="clearRadar" className="text-xs font-medium text-foreground cursor-pointer select-none">
                        Forgive / Clear Proctoring Radar Flags (Candidate verified legitimate)
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveReview}
                      disabled={isSavingReview}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSavingReview ? "Saving…" : "Save Grade & Feedback"}
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 3: Code & Responses */}
              {modalTab === "code" && (
                (!selectedCandidate.responses || selectedCandidate.responses.length === 0) ? (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    No answers or code submissions found for this attempt.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedCandidate.responses.map((resp: any, idx: number) => (
                      <div key={idx} className="p-3 rounded-xl bg-muted/30 border border-border text-xs space-y-2">
                        <div className="flex items-center justify-between border-b border-border/60 pb-2">
                          <span className="font-semibold text-foreground font-mono">Question #{idx + 1}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              resp.isCorrect
                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                            }`}
                          >
                            {resp.isCorrect ? "Correct" : "Incorrect"} (+{resp.marksAwarded || 0} pts)
                          </span>
                        </div>
                        {resp.code ? (
                          <pre className="p-3 rounded-lg bg-zinc-950 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-48 border border-zinc-800">
                            <code>{resp.code}</code>
                          </pre>
                        ) : (
                          <div className="text-muted-foreground">
                            Option Selected:{" "}
                            <strong className="text-foreground">
                              {resp.selectedAnswer >= 0 ? `Option ${String.fromCharCode(65 + resp.selectedAnswer)}` : "None"}
                            </strong>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* Tab 4: Attempt History */}
              {modalTab === "attempts" && (
                <div className="space-y-2">
                  {(selectedCandidate.allAttempts || [selectedCandidate]).map((attItem: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-muted/40 border border-border text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-foreground">Attempt #{attItem.attemptNumber || idx + 1}</span>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Score: {attItem.score} pts • {attItem.passed ? "Passed" : "Failed"}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {attItem.submittedAt ? formatIndianDateTime(attItem.submittedAt) : "In Progress"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCandidate(null)}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-sm"
              >
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snapshot Fullscreen Preview Modal */}
      {previewSnapshot && (
        <div
          className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewSnapshot(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-border/80">
            <img src={previewSnapshot} alt="Proctoring Zoom" className="w-full h-auto object-contain max-h-[85vh]" />
          </div>
        </div>
      )}
    </div>
  );
}
