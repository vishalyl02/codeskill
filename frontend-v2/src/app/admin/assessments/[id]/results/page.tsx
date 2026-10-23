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
  Download,
  Search,
  RefreshCw,
  BarChart3,
  Calendar,
  Eye,
  X,
  Mic,
  Maximize2,
  FileText,
  Key,
  Code,
  RotateCcw,
  Layers
} from "lucide-react";
import { adminAssessmentsAPI } from "@/config/api";
import toast from "react-hot-toast";
import { formatIndianDateTime } from "@/lib/indian-time";
import { assessmentResultsCSV, resultText } from "@/lib/assessment-results-export";

export default function AssessmentResultsPage({
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
  const [modalTab, setModalTab] = useState<"proctoring" | "code" | "attempts">("proctoring");

  const [downloadingReports, setDownloadingReports] = useState<string[]>([]);

  const downloadReport = async (attempt: any) => {
    const attemptId = attempt.id || attempt._id;
    if (!attemptId) {
      toast.error("This attempt has no report ID.");
      return;
    }
    setDownloadingReports((current) => [...current, attemptId]);
    try {
      const response = await adminAssessmentsAPI.getAttemptReport(attemptId);
      if (!response.data.type?.includes("application/pdf")) {
        throw new Error("The server did not return a PDF report.");
      }
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      const candidateUid = attempt.studentUid || attempt.student?.uid || attemptId;
      link.download = `assessment-report-${candidateUid}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Let the browser start reading the PDF before releasing its object URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error("Could not download this report. Please try again.");
    } finally {
      setDownloadingReports((current) => current.filter((value) => value !== attemptId));
    }
  };

  const fetchResults = async () => {
    const request = ++resultsRequest.current;
    setIsLoading(true);
    try {
      const res = await adminAssessmentsAPI.getResults(id);
      if (request === resultsRequest.current) setData(res.data);
    } catch (err) {
      console.error("Failed to load results:", err);
      if (request === resultsRequest.current) setData(null);
    } finally {
      if (request === resultsRequest.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, [id]);

  const handleExportCSV = () => {
    if (isLoading || !data) return;
    const rows = viewMode === "candidates" ? filteredAttempts : filteredRawAttempts;
    if (!rows.length) { toast.error("No results match the selected view and search."); return; }
    const content = assessmentResultsCSV(data.assessment || {}, rows, viewMode);
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    const code = String(data.assessment?.code || id).replace(/[^a-zA-Z0-9_-]/g, "_");
    link.download = `assessment_results_${code}_${viewMode === "candidates" ? "summary" : "all_attempts"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const filteredAttempts = (data?.attempts || []).filter((a: any) => {
    const q = search.toLowerCase();
    return (
      (a.studentUid && a.studentUid.toLowerCase().includes(q)) ||
      (a.studentName && a.studentName.toLowerCase().includes(q)) ||
      (a.studentEmail && a.studentEmail.toLowerCase().includes(q))
    );
  });

  const filteredRawAttempts = (data?.rawAttempts || []).filter((a: any) => {
    const q = search.toLowerCase();
    return (
      (a.studentUid && a.studentUid.toLowerCase().includes(q)) ||
      (a.studentName && a.studentName.toLowerCase().includes(q)) ||
      (a.studentEmail && a.studentEmail.toLowerCase().includes(q))
    );
  });

  const getViolationIcon = (type: string) => {
    switch (type) {
      case "voice_detected":
        return <Mic className="w-3.5 h-3.5 text-amber-400" />;
      case "shortcut_attempt":
        return <Key className="w-3.5 h-3.5 text-rose-400" />;
      case "fullscreen_exit":
        return <Maximize2 className="w-3.5 h-3.5 text-primary" />;
      default:
        return <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />;
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/assessments"
            className="p-2 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-10 h-10 rounded-md overflow-hidden bg-white shrink-0 border border-slate-200 p-0.5 flex items-center justify-center">
            <img
              src="https://images.seeklogo.com/logo-png/43/1/chandigarh-university-cu-logo-png_seeklogo-432515.png"
              alt="Chandigarh University"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/cu-logo.png";
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {data?.assessment?.title || "Assessment Results"}
              </h1>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-50 text-primary border border-red-200">
                Chandigarh University
              </span>
              {data?.assessment?.code && (
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  {data.assessment.code}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Candidate performance scores, pass rates, and proctoring telemetry audit logs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/admin/assessments/${id}/analytics`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-md hover:bg-primary/90 transition-colors shadow-sm"
          >
            <BarChart3 className="w-3.5 h-3.5" /> Analytics Dashboard
          </Link>
          <button
            onClick={handleExportCSV}
            title="Export the selected results view and current search"
            disabled={!data?.attempts || data.attempts.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-md border border-slate-200 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-primary" /> Export Results (.CSV)
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {data?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 p-5 rounded-lg shadow-xs">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary" /> Candidates
            </span>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2 font-mono">
              {data.stats.totalCandidates}
            </div>
          </div>

          <div className="bg-white border border-emerald-200 p-5 rounded-lg shadow-xs">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Pass Rate
            </span>
            <div className="text-2xl sm:text-3xl font-bold text-emerald-700 mt-2 font-mono">
              {data.stats.passPercentage}%
            </div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">
              {data.stats.passedCount} of {data.stats.totalCandidates} passed
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-5 rounded-lg shadow-xs">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-primary" /> Avg Score
            </span>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2 font-mono">
              {data.stats.avgScore} <span className="text-xs text-muted-foreground">/ {data?.assessment?.totalMarks ?? 100}</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-5 rounded-lg shadow-xs">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary" /> Submissions
            </span>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2 font-mono">
              {data.stats.submittedCount}
            </div>
            <span className="text-[11px] text-muted-foreground mt-0.5 block">
              Completed attempts
            </span>
          </div>
        </div>
      )}

      {/* Candidate Attempts Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Table Filter Bar */}
        <div className="p-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by student UID or name..."
                className="w-full pl-9 pr-3 py-1.5 bg-muted/40 border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* View Mode Switcher */}
            <div className="inline-flex rounded-xl bg-muted/60 p-1 border border-border text-xs shrink-0">
              <button
                type="button"
                onClick={() => setViewMode("candidates")}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  viewMode === "candidates"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Candidate Summary ({filteredAttempts.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode("all_attempts")}
                className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                  viewMode === "all_attempts"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Attempts Log ({filteredRawAttempts.length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              onClick={fetchResults}
              className="p-1.5 border border-border hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg text-xs transition-colors"
              title="Refresh results"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-xs text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary" />
            Loading test results...
          </div>
        ) : (viewMode === "candidates" ? filteredAttempts.length === 0 : filteredRawAttempts.length === 0) ? (
          <div className="py-16 text-center text-xs text-muted-foreground">
            No student attempt records found.
          </div>
        ) : viewMode === "candidates" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-muted-foreground">
              <thead className="bg-muted/30 uppercase text-[10px] font-bold text-foreground border-b border-border">
                <tr>
                  <th className="p-3.5">Student</th>
                  <th className="p-3.5">UID</th>
                  <th className="p-3.5 text-center">Attempts</th>
                  <th className="p-3.5 text-center">Best Score & History</th>
                  <th className="p-3.5 text-center">Accuracy</th>
                  <th className="p-3.5 text-center">Result</th>
                  <th className="p-3.5 text-center">Time Spent</th>
                  <th className="p-3.5 text-center">Proctoring Telemetry</th>
                  <th className="p-3.5 text-center">Report</th>
                  <th className="p-3.5 text-right">Submitted At (IST)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredAttempts.map((att: any) => {
                  const totalV = att.violations?.length || 0;
                  const isSuspicious = totalV >= 3 || (att.tabSwitchCount || 0) >= 3;

                  return (
                    <tr key={att._id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3.5">
                        <div className="font-semibold text-foreground">{resultText(att.studentName)}</div>
                        <div className="text-[11px] text-muted-foreground">{resultText(att.studentEmail)}</div>
                      </td>
                      <td className="p-3.5 font-mono font-medium text-foreground">
                        {resultText(att.studentUid)}
                      </td>
                      <td className="p-3.5 text-center font-mono">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-muted border border-border">
                          {att.totalAttempts || att.allAttempts?.length || 1} {att.totalAttempts === 1 ? "attempt" : "attempts"}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <div>
                          <span className="font-bold text-emerald-400 text-sm">{att.score}</span>
                          <span className="text-[11px] text-muted-foreground"> / {att.maxScore}</span>
                        </div>
                        {att.allAttempts && att.allAttempts.length > 1 && (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap justify-center max-w-[220px] mx-auto">
                            {att.allAttempts.map((item: any, i: number) => (
                              <span
                                key={i}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                                  item.score === att.score
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : "bg-muted/80 text-muted-foreground border border-border"
                                }`}
                                title={`Attempt #${item.attemptNumber || i + 1}: ${item.score} pts (${item.percentage}%) - ${item.passed ? "Passed" : "Failed"}`}
                              >
                                #{item.attemptNumber || i + 1}: {item.score}pts
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 text-center font-medium text-foreground">
                        {att.accuracy || 0}%
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            att.passed
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {att.passed ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" /> PASSED
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3" /> FAILED
                            </>
                          )}
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-mono">
                        {Math.floor((att.timeSpentSeconds || 0) / 60)}m {(att.timeSpentSeconds || 0) % 60}s
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => {
                            setSelectedCandidate(att);
                            setModalTab("proctoring");
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                            isSuspicious
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                              : totalV > 0
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                              : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                          }`}
                          title="Click to view candidate audit and code report"
                        >
                          <Eye className="w-3 h-3" />
                          <span>
                            {totalV === 0 ? "Clean (0 Flags)" : `${totalV} Incident${totalV > 1 ? "s" : ""}`}
                          </span>
                        </button>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => downloadReport(att)}
                          disabled={downloadingReports.includes(att.id || att._id)}
                          aria-busy={downloadingReports.includes(att.id || att._id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary text-primary-foreground hover:bg-primary/90 text-[11px] font-semibold rounded-lg shadow-sm transition-colors"
                          title="Download PDF Report"
                        >
                          <Download className="w-3 h-3" /> {downloadingReports.includes(att.id || att._id) ? "Loading…" : "PDF"}
                        </button>
                      </td>
                      <td className="p-3.5 text-right font-mono text-[11px]">
                        {att.submittedAt ? formatIndianDateTime(att.submittedAt) : "In Progress"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* All Attempts Full Log Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-muted-foreground">
              <thead className="bg-muted/30 uppercase text-[10px] font-bold text-foreground border-b border-border">
                <tr>
                  <th className="p-3.5">Student</th>
                  <th className="p-3.5">UID</th>
                  <th className="p-3.5 text-center">Attempt #</th>
                  <th className="p-3.5 text-center">Score</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-center">Result</th>
                  <th className="p-3.5 text-center">Time Spent</th>
                  <th className="p-3.5 text-center">Proctoring Telemetry</th>
                  <th className="p-3.5 text-center">Report</th>
                  <th className="p-3.5 text-right">Timestamp (IST)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRawAttempts.map((att: any, idx: number) => {
                  const totalV = att.violations?.length || 0;
                  const isSuspicious = totalV >= 3 || (att.tabSwitchCount || 0) >= 3;

                  return (
                    <tr key={att._id || idx} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3.5">
                        <div className="font-semibold text-foreground">{resultText(att.studentName)}</div>
                        <div className="text-[11px] text-muted-foreground">{resultText(att.studentEmail)}</div>
                      </td>
                      <td className="p-3.5 font-mono font-medium text-foreground">
                        {resultText(att.studentUid)}
                      </td>
                      <td className="p-3.5 text-center font-mono">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                          Attempt #{att.attemptNumber || idx + 1}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="font-bold text-foreground text-sm">{att.score}</span>
                        <span className="text-[11px] text-muted-foreground"> / {att.maxScore}</span>
                        <span className="block text-[10px] text-muted-foreground">({att.percentage}%)</span>
                      </td>
                      <td className="p-3.5 text-center capitalize font-mono text-[11px]">
                        {att.status || "submitted"}
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            att.passed
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {att.passed ? "PASSED" : "FAILED"}
                        </span>
                      </td>
                      <td className="p-3.5 text-center font-mono">
                        {Math.floor((att.timeSpentSeconds || 0) / 60)}m {(att.timeSpentSeconds || 0) % 60}s
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => {
                            setSelectedCandidate(att);
                            setModalTab("proctoring");
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                            isSuspicious
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                              : totalV > 0
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                              : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                          }`}
                          title="Click to view this attempt's telemetry and code"
                        >
                          <Eye className="w-3 h-3" />
                          <span>
                            {totalV === 0 ? "Clean (0 Flags)" : `${totalV} Flags`}
                          </span>
                        </button>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => downloadReport(att)}
                          disabled={downloadingReports.includes(att.id || att._id)}
                          aria-busy={downloadingReports.includes(att.id || att._id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary text-primary-foreground hover:bg-primary/90 text-[11px] font-semibold rounded-lg shadow-sm transition-colors"
                          title="Download PDF Report"
                        >
                          <Download className="w-3 h-3" /> {downloadingReports.includes(att.id || att._id) ? "Loading…" : "PDF"}
                        </button>
                      </td>
                      <td className="p-3.5 text-right font-mono text-[11px]">
                        {att.submittedAt ? formatIndianDateTime(att.submittedAt) : "In Progress"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Candidate Detail & Proctoring Telemetry Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-2xl w-full space-y-5 animate-in fade-in zoom-in-95 shadow-2xl max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Candidate Report & Audit</h3>
                  <p className="text-xs text-muted-foreground">
                    Candidate: <strong>{selectedCandidate.studentName}</strong> ({selectedCandidate.studentUid})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCandidate(null)}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Candidate Summary Pills */}
            <div className={`grid ${selectedCandidate.proctoringPenalty && selectedCandidate.proctoringPenalty > 0 ? "grid-cols-5" : "grid-cols-4"} gap-2 text-center text-xs p-3 rounded-xl bg-muted/30 border border-border font-mono`}>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Final Score</span>
                <div className="font-bold text-foreground">{selectedCandidate.score} / {selectedCandidate.maxScore}</div>
              </div>
              {selectedCandidate.proctoringPenalty && selectedCandidate.proctoringPenalty > 0 ? (
                <div>
                  <span className="text-[10px] text-rose-500 uppercase font-bold">Penalty</span>
                  <div className="font-bold text-rose-500">-{selectedCandidate.proctoringPenalty}</div>
                </div>
              ) : null}
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Accuracy</span>
                <div className="font-bold text-foreground">{selectedCandidate.accuracy || 0}%</div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Attempts</span>
                <div className="font-bold text-primary font-mono">{selectedCandidate.totalAttempts || selectedCandidate.attemptNumber || 1}</div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Tab Switches</span>
                <div className="font-bold text-amber-400">{selectedCandidate.tabSwitchCount || 0}</div>
              </div>
            </div>

            {/* Modal Navigation Tabs */}
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
                <ShieldAlert className="w-3.5 h-3.5" /> Proctoring Telemetry ({selectedCandidate.violations?.length || 0})
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
                <Code className="w-3.5 h-3.5" /> Code & Answers ({(selectedCandidate.responses || []).filter((r: any) => r.code || (Array.isArray(r.selectedAnswers) && r.selectedAnswers.length > 0) || r.selectedAnswer !== -1).length})
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
                <RotateCcw className="w-3.5 h-3.5" /> Attempt History ({selectedCandidate.allAttempts?.length || 1})
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-[220px]">
              {modalTab === "proctoring" && (
                (!selectedCandidate.violations || selectedCandidate.violations.length === 0) ? (
                  <div className="text-center py-10 space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                    <div className="text-sm font-semibold text-foreground">Clean Exam Session</div>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                      No suspicious shortcuts, tab switches, audio disturbances, or fullscreen violations were detected during this attempt.
                    </p>
                  </div>
                ) : (
                  selectedCandidate.violations.map((v: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-muted/40 border border-border/80 text-xs flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 p-1 rounded-lg bg-background border border-border">
                          {getViolationIcon(v.type)}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground capitalize flex items-center gap-2">
                            <span>{v.type ? v.type.replace(/_/g, " ") : "Proctoring Alert"}</span>
                            {v.penaltyMarks !== undefined && Number(v.penaltyMarks) > 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                                -{v.penaltyMarks} marks
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {v.details || "Security incident recorded during exam session"}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        {v.timestamp ? formatIndianDateTime(v.timestamp, true) : "Logged"}
                      </span>
                    </div>
                  ))
                )
              )}

              {modalTab === "code" && (
                (!selectedCandidate.responses || selectedCandidate.responses.length === 0) ? (
                  <div className="text-center py-10 space-y-2">
                    <FileText className="w-8 h-8 text-muted-foreground mx-auto" />
                    <div className="text-sm font-semibold text-foreground">No Submissions Recorded</div>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                      No answers or code submissions were found for this attempt.
                    </p>
                  </div>
                ) : (
                  selectedCandidate.responses.map((resp: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-muted/30 border border-border text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-border/60 pb-2">
                        <span className="font-semibold text-foreground font-mono">
                          Question #{idx + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          {resp.language && (
                            <span className="px-2 py-0.5 rounded bg-muted font-mono text-[10px] text-muted-foreground border border-border">
                              {resp.language}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              resp.isCorrect
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {resp.isCorrect ? "Correct" : "Incorrect"} (+{resp.marksAwarded || 0} pts)
                          </span>
                        </div>
                      </div>

                      {resp.code ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>Candidate Code Solution:</span>
                            {resp.totalTestCases > 0 && (
                              <span className="font-mono text-emerald-400 font-bold">
                                {resp.testCasesPassed} / {resp.totalTestCases} Tests Passed
                              </span>
                            )}
                          </div>
                          <pre className="p-3 rounded-lg bg-zinc-950 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-48 border border-zinc-800">
                            <code>{resp.code}</code>
                          </pre>
                        </div>
                      ) : (
                        <div className="text-[11px] text-muted-foreground">
                          Option Selected:{" "}
                          <strong className="text-foreground">
                            {Array.isArray(resp.selectedAnswers) && resp.selectedAnswers.length > 0
                              ? `Options ${resp.selectedAnswers.map((idx: number) => String.fromCharCode(65 + idx)).join(", ")}`
                              : resp.selectedAnswer >= 0
                                ? `Option ${String.fromCharCode(65 + resp.selectedAnswer)}`
                                : "None"}
                          </strong>
                        </div>
                      )}
                    </div>
                  ))
                )
              )}

              {modalTab === "attempts" && (
                (!selectedCandidate.allAttempts || selectedCandidate.allAttempts.length === 0) ? (
                  <div className="text-center py-10 space-y-2">
                    <RotateCcw className="w-8 h-8 text-muted-foreground mx-auto" />
                    <div className="text-sm font-semibold text-foreground">Single Attempt</div>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                      Candidate completed 1 attempt. Score: {selectedCandidate.score} / {selectedCandidate.maxScore}.
                    </p>
                  </div>
                ) : (
                    <div className="space-y-2">
                    {selectedCandidate.allAttempts.map((attItem: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-primary/10 text-primary border border-primary/20">
                            Attempt #{attItem.attemptNumber || idx + 1}
                          </span>
                          <div>
                            <span className="font-bold text-foreground">
                              Score: {attItem.score} / {attItem.maxScore || selectedCandidate.maxScore} pts ({attItem.percentage}%)
                            </span>
                            <span className="text-[10px] text-muted-foreground block">
                              {attItem.submittedAt ? formatIndianDateTime(attItem.submittedAt) : attItem.status} • {Math.floor((attItem.timeSpentSeconds || 0) / 60)}m {attItem.timeSpentSeconds % 60}s spent
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 self-end sm:self-auto">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              attItem.passed
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {attItem.passed ? "Passed" : "Failed"}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCandidate({
                                ...selectedCandidate,
                                responses: attItem.responses?.length > 0 ? attItem.responses : selectedCandidate.responses,
                                violations: attItem.violations || selectedCandidate.violations,
                                tabSwitchCount: attItem.tabSwitchCount ?? selectedCandidate.tabSwitchCount,
                                timeSpentSeconds: attItem.timeSpentSeconds ?? selectedCandidate.timeSpentSeconds,
                                currentAttemptLabel: `Attempt #${attItem.attemptNumber || idx + 1}`,
                              });
                              setModalTab("code");
                            }}
                            className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold border border-primary/20 transition-colors"
                          >
                            Inspect Code
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            <div className="pt-3 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCandidate(null)}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-sm"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
