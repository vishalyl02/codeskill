"use client";

import { useEffect, useState, Suspense } from "react";
import { adminUsersAPI, adminAssessmentsAPI } from "@/config/api";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Code2,
  Trophy,
  Clock,
  User,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Download,
  GraduationCap,
  Building2,
  BookOpen,
  Award,
  Calendar,
  Layers,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";
import toast from "react-hot-toast";

function CandidateReportContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingAttemptId, setDownloadingAttemptId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"assessments" | "practice">("assessments");

  useEffect(() => {
    if (params.id) {
      fetchReport(params.id as string);
    }
  }, [params.id]);

  const fetchReport = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminUsersAPI.getReport(id);
      const reportData = res.data?.report || res.data?.data?.report || res.data;
      if (!reportData || !reportData.user) {
        throw new Error("Invalid candidate report data received from server.");
      }
      setReport(reportData);

      // Auto-trigger print if requested via query param
      if (searchParams.get("print") === "true") {
        setTimeout(() => window.print(), 500);
      }
    } catch (err: any) {
      console.error("Failed to fetch report", err);
      setError(err?.response?.data?.message || err.message || "Failed to load candidate report");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadAttemptReport = async (attemptId: string) => {
    if (!attemptId) return;
    setDownloadingAttemptId(attemptId);
    try {
      const response = await adminAssessmentsAPI.getAttemptReport(attemptId);
      const isPdf =
        response.data?.type?.includes("pdf") ||
        String(response.headers?.["content-type"] || "").includes("pdf") ||
        response.data instanceof Blob;
      if (!isPdf) {
        throw new Error("The server did not return a PDF report.");
      }
      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const candidateUid = user?.uid || user?.name || attemptId;
      link.download = `assessment-report-${candidateUid}-${attemptId.slice(-6)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Assessment report downloaded successfully.");
    } catch (err: any) {
      console.error("Failed to download attempt report", err);
      toast.error("Failed to download assessment report. Please try again.");
    } finally {
      setDownloadingAttemptId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 font-sans max-w-6xl mx-auto h-[60vh] flex flex-col items-center justify-center gap-3">
        <Spinner className="w-8 h-8 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground font-medium">Loading candidate performance report...</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-8 font-sans max-w-xl mx-auto h-[60vh] flex flex-col items-center justify-center text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Unable to Load Candidate Report</h2>
          <p className="text-sm text-muted-foreground mt-1">{error || "Candidate record not found or inaccessible."}</p>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={() => params.id && fetchReport(params.id as string)}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/admin/candidates"
            className="px-4 py-2 border border-border bg-card text-foreground text-sm font-medium rounded-lg hover:bg-muted transition-colors"
          >
            Back to Candidates
          </Link>
        </div>
      </div>
    );
  }

  const user = report.user || {};
  const stats = report.stats || {};
  const assessmentAttempts = Array.isArray(report.assessmentAttempts) ? report.assessmentAttempts : [];
  const recentSubmissions = Array.isArray(report.recentSubmissions) ? report.recentSubmissions : [];
  const studentProfile = user.studentProfile || {};
  const candidateUid = user.uid || studentProfile.uid || null;

  const studentName = user.name || user.email?.split("@")[0] || "Candidate";
  const userSubmissionsCount = stats.totalSubmissions ?? recentSubmissions.length;
  const acceptedCount =
    stats.acceptedSubmissions ??
    stats.accepted ??
    recentSubmissions.filter((s: any) => s.status?.toLowerCase() === "accepted").length;
  const acceptanceRate =
    stats.acceptanceRate ??
    (userSubmissionsCount > 0 ? Math.round((acceptedCount / userSubmissionsCount) * 100) : 0);
  const totalSolved = stats.uniqueProblemsSolved ?? user.solvedProblems?.length ?? acceptedCount;

  const totalAssessmentsAttempted = stats.totalAssessmentsAttempted ?? assessmentAttempts.length;
  const completedAttempts = assessmentAttempts.filter((a: any) =>
    ["submitted", "auto_submitted", "timed_out"].includes(a.status)
  );
  const totalAssessmentsCompleted = stats.totalAssessmentsCompleted ?? completedAttempts.length;
  const totalAssessmentsPassed = stats.totalAssessmentsPassed ?? completedAttempts.filter((a: any) => a.passed === true).length;
  const passRate = totalAssessmentsCompleted > 0 ? Math.round((totalAssessmentsPassed / totalAssessmentsCompleted) * 100) : 0;
  const averageScore = stats.averageScore ?? 0;
  const highestScore = stats.highestScore ?? 0;
  const totalViolations = stats.totalViolations ?? 0;

  // Latest completed attempt for header download action
  const latestCompletedAttempt = completedAttempts[0];

  return (
    <div className="candidate-report p-6 md:p-8 font-sans max-w-6xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/candidates"
            className="print-hidden p-2 bg-card border border-border hover:bg-muted text-muted-foreground rounded-lg transition-colors"
            title="Back to Candidates"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="candidate-report-title text-2xl font-bold text-foreground">
                Candidate Performance Report
              </h1>
              {user.isAdmin && (
                <span className="candidate-report-admin-badge inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500">
                  <ShieldCheck className="w-3 h-3" /> Admin
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              Verified evaluation records, assessment scorecards, academic metadata, and proctoring logs.
            </p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-3">
          {latestCompletedAttempt ? (
            <button
              type="button"
              onClick={() => handleDownloadAttemptReport(latestCompletedAttempt.id)}
              disabled={downloadingAttemptId === latestCompletedAttempt.id}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-xs"
              title="Download official report for the latest completed assessment"
            >
              {downloadingAttemptId === latestCompletedAttempt.id ? (
                <Spinner className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download Latest Report
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="px-4 py-2 bg-muted text-muted-foreground text-sm font-medium rounded-lg cursor-not-allowed flex items-center gap-2 opacity-70"
              title="No completed assessment attempts available to generate report"
            >
              <Download className="w-4 h-4" />
              No Report Available
            </button>
          )}
        </div>
      </div>

      {/* Candidate Academic Profile Card */}
      <div className="bg-card border border-border rounded-xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden border-2 border-border shadow-xs">
            {user.avatar ? (
              <img src={user.avatar} alt={studentName} className="w-full h-full object-cover" />
            ) : (
              studentName.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">{studentName}</h2>
              {candidateUid && (
                <span className="font-mono bg-primary/10 text-primary text-xs font-semibold px-2.5 py-0.5 rounded-full border border-primary/20">
                  UID: {candidateUid}
                </span>
              )}
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded capitalize">
                {user.role || "Student"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-mono mt-0.5">{user.email || "N/A"}</p>
            {studentProfile.university && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                <Building2 className="w-3.5 h-3.5" />
                <span>{studentProfile.university}</span>
              </div>
            )}
          </div>
        </div>

        {/* Academic Details Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto text-xs">
          <div className="p-2.5 bg-muted/40 rounded-lg border border-border/50">
            <span className="text-muted-foreground block text-[11px]">Department</span>
            <span className="font-semibold text-foreground truncate block mt-0.5">
              {studentProfile.department || "General"}
            </span>
          </div>
          <div className="p-2.5 bg-muted/40 rounded-lg border border-border/50">
            <span className="text-muted-foreground block text-[11px]">Sem / Section</span>
            <span className="font-semibold text-foreground truncate block mt-0.5">
              {studentProfile.semester ? `Sem ${studentProfile.semester}` : "-"}{" "}
              {studentProfile.section ? `• Sec ${studentProfile.section}` : ""}
            </span>
          </div>
          <div className="p-2.5 bg-muted/40 rounded-lg border border-border/50">
            <span className="text-muted-foreground block text-[11px]">Batch</span>
            <span className="font-semibold text-foreground truncate block mt-0.5">
              {studentProfile.batch || studentProfile.year || "N/A"}
            </span>
          </div>
          <div className="p-2.5 bg-muted/40 rounded-lg border border-border/50">
            <span className="text-muted-foreground block text-[11px]">Joined</span>
            <span className="font-semibold text-foreground truncate block mt-0.5">
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-GB") : "N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* Performance KPIs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Exams Attempted */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Exams Taken</span>
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-foreground">{totalAssessmentsCompleted}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {totalAssessmentsAttempted} total attempt{totalAssessmentsAttempted === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {/* Exams Passed */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Passed</span>
            <div className="p-1.5 bg-green-500/10 rounded-lg text-green-500">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-green-500">{totalAssessmentsPassed}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {passRate}% completion pass rate
            </div>
          </div>
        </div>

        {/* Average Score */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Average Score</span>
            <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-500">
              <Trophy className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-amber-500">{averageScore}%</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Peak: {highestScore}%
            </div>
          </div>
        </div>

        {/* Proctoring Integrity */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Proctoring</span>
            <div className={`p-1.5 rounded-lg ${totalViolations === 0 ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
              {totalViolations === 0 ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-bold ${totalViolations === 0 ? "text-green-500" : "text-red-500"}`}>
              {totalViolations === 0 ? "Clean" : `${totalViolations} Flags`}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {totalViolations === 0 ? "No proctoring infractions" : "Tab / fullscreen alerts"}
            </div>
          </div>
        </div>

        {/* Practice Problems Solved */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Practice Solved</span>
            <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-500">
              <Code2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-bold text-foreground">{totalSolved}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {acceptanceRate}% acceptance rate
            </div>
          </div>
        </div>
      </div>

      {/* Tabs / Switcher */}
      <div className="border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("assessments")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "assessments"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Award className="w-4 h-4" />
            Assessment History &amp; Scores
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-muted font-normal">
              {assessmentAttempts.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("practice")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "practice"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Code2 className="w-4 h-4" />
            Practice Problem Submissions
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-muted font-normal">
              {recentSubmissions.length}
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: Assessment Attempts Table */}
      {activeTab === "assessments" && (
        <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-foreground">Verified Assessment Scorecards</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Official marks, percentage scores, proctoring integrity, and PDF report downloads.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-muted-foreground">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border text-xs">
                <tr>
                  <th className="px-6 py-3.5">Assessment</th>
                  <th className="px-6 py-3.5">Score</th>
                  <th className="px-6 py-3.5">Percentage</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Proctoring</th>
                  <th className="px-6 py-3.5">Date &amp; Duration</th>
                  <th className="px-6 py-3.5 text-right">Official Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {assessmentAttempts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3 text-muted-foreground">
                          <Award className="w-6 h-6" />
                        </div>
                        <p className="text-foreground font-medium">No assessment attempts recorded</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          This candidate has not participated in or submitted any examinations yet.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  assessmentAttempts.map((attempt: any) => {
                    const isCompleted = ["submitted", "auto_submitted", "timed_out"].includes(attempt.status);
                    const timeMinutes = Math.round((attempt.timeSpentSeconds || 0) / 60);
                    const violationsCount =
                      (attempt.tabSwitchCount || 0) +
                      (attempt.fullscreenExitCount || 0) +
                      (attempt.violationsCount || 0);

                    return (
                      <tr key={attempt.id} className="hover:bg-muted/30 transition-colors">
                        {/* Title & Code */}
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{attempt.assessmentTitle}</div>
                          {attempt.assessmentCode && (
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">
                              {attempt.assessmentCode}
                            </div>
                          )}
                        </td>

                        {/* Score */}
                        <td className="px-6 py-4">
                          <div className="font-semibold text-foreground">
                            {attempt.score} <span className="text-muted-foreground font-normal text-xs">/ {attempt.maxScore}</span>
                          </div>
                        </td>

                        {/* Percentage */}
                        <td className="px-6 py-4 font-mono font-medium text-foreground">
                          {attempt.percentage}%
                        </td>

                        {/* Status Badge */}
                        <td className="px-6 py-4">
                          {attempt.passed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                            </span>
                          ) : attempt.status === "in_progress" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                              <Clock className="w-3.5 h-3.5" /> In Progress
                            </span>
                          ) : attempt.status === "timed_out" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                              <Clock className="w-3.5 h-3.5" /> Timed Out
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-500">
                              <XCircle className="w-3.5 h-3.5" /> Failed
                            </span>
                          )}
                        </td>

                        {/* Proctoring */}
                        <td className="px-6 py-4">
                          {violationsCount === 0 ? (
                            <span className="text-xs font-medium text-green-500 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Clean
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-amber-500 flex items-center gap-1" title={`${attempt.tabSwitchCount || 0} tab switches, ${attempt.fullscreenExitCount || 0} fullscreen exits`}>
                              <ShieldAlert className="w-3.5 h-3.5" /> {violationsCount} flags
                            </span>
                          )}
                        </td>

                        {/* Date & Duration */}
                        <td className="px-6 py-4 text-xs text-muted-foreground">
                          <div>
                            {attempt.submittedAt
                              ? new Date(attempt.submittedAt).toLocaleDateString("en-GB")
                              : attempt.createdAt
                              ? new Date(attempt.createdAt).toLocaleDateString("en-GB")
                              : "Recent"}
                          </div>
                          <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                            {timeMinutes > 0 ? `${timeMinutes} min duration` : "Under 1 min"}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right">
                          {isCompleted ? (
                            <button
                              type="button"
                              onClick={() => handleDownloadAttemptReport(attempt.id)}
                              disabled={downloadingAttemptId === attempt.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-md transition-colors"
                              title="Download official candidate scorecard PDF"
                            >
                              {downloadingAttemptId === attempt.id ? (
                                <>
                                  <Spinner className="w-3.5 h-3.5 animate-spin" />
                                  <span>Downloading...</span>
                                </>
                              ) : (
                                <>
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Report PDF</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground/60 italic">
                              Pending Submission
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Practice Submissions Table */}
      {activeTab === "practice" && (
        <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm text-foreground">Open Practice Problem Submissions</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Recent problem-solving activity on standalone algorithmic questions.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-muted-foreground">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border text-xs">
                <tr>
                  <th className="px-6 py-3.5">Problem</th>
                  <th className="px-6 py-3.5">Language</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentSubmissions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center">
                      <p className="text-muted-foreground">No recent practice submissions found for this candidate.</p>
                    </td>
                  </tr>
                ) : (
                  recentSubmissions.map((sub: any) => {
                    const isAccepted = sub.status?.toLowerCase() === "accepted";
                    return (
                      <tr key={sub._id || sub.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">
                            {sub.problem?.title || sub.problemTitle || "Coding Practice Problem"}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-muted text-foreground uppercase">
                            {sub.language || "cpp"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 font-medium">
                            {isAccepted ? (
                              <span className="text-green-500 flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4" /> Accepted
                              </span>
                            ) : sub.status === "Pending" ? (
                              <span className="text-primary flex items-center gap-1.5">
                                <Clock className="w-4 h-4" /> Evaluating
                              </span>
                            ) : (
                              <span className="text-red-500 flex items-center gap-1.5">
                                <XCircle className="w-4 h-4" /> {sub.status || "Attempted"}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-muted-foreground text-xs">
                          {sub.createdAt ? new Date(sub.createdAt).toLocaleString("en-GB") : "Recent"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CandidateReportPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 font-sans max-w-6xl mx-auto h-[60vh] flex flex-col items-center justify-center gap-3">
          <Spinner className="w-8 h-8 animate-spin text-primary" />
          <div className="text-sm text-muted-foreground font-medium">Loading...</div>
        </div>
      }
    >
      <CandidateReportContent />
    </Suspense>
  );
}
