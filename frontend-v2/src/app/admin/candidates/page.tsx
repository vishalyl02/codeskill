"use client";

import { useEffect, useState } from "react";
import { adminUsersAPI, adminAssessmentsAPI } from "@/config/api";
import {
  Search,
  ShieldCheck,
  User,
  FileText,
  Eye,
  X,
  AlertCircle,
  Download,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  Award,
  Layers,
  Trophy,
  Code2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";
import { PDFDownloadButton } from "@/components/reports/pdf/PDFDownloadButton";
import toast from "react-hot-toast";

export default function CandidatesAdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { user: currentUser } = useAuth();

  // Preview modal states
  const [previewUser, setPreviewUser] = useState<any>(null);
  const [previewReportData, setPreviewReportData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadingAttemptId, setDownloadingAttemptId] = useState<string | null>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchUsers();
    }, 250);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await adminUsersAPI.getAll(search);
      const userList = res.data?.users || res.data?.data?.users || [];
      setUsers(userList);
    } catch (err) {
      console.error("Failed to fetch users", err);
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
      const candidateUid = previewReportData?.student?.uid || previewUser?.name || attemptId;
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

  const openPreview = async (candidate: any) => {
    const userId = candidate._id || candidate.id;
    setPreviewUser(candidate);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewReportData(null);

    try {
      const res = await adminUsersAPI.getReport(userId);
      const rep = res.data?.report || res.data?.data?.report || res.data;
      if (!rep || !rep.user) {
        throw new Error("Invalid candidate report received.");
      }

      const u = rep.user || candidate;
      const stats = rep.stats || {};
      const subs = Array.isArray(rep.recentSubmissions) ? rep.recentSubmissions : [];
      const attempts = Array.isArray(rep.assessmentAttempts) ? rep.assessmentAttempts : [];
      const studentProfile = u.studentProfile || {};
      const uid = u.uid || studentProfile.uid || null;

      const userSubmissionsCount = stats.totalSubmissions ?? subs.length;
      const acceptedCount =
        stats.acceptedSubmissions ??
        stats.accepted ??
        subs.filter((s: any) => s.status?.toLowerCase() === "accepted").length;
      const acceptanceRate =
        stats.acceptanceRate ??
        (userSubmissionsCount > 0 ? Math.round((acceptedCount / userSubmissionsCount) * 100) : 0);
      const totalSolved = stats.uniqueProblemsSolved ?? u.solvedProblems?.length ?? u.stats?.totalSolved ?? acceptedCount;
      const userScore = u.stats?.score ?? u.stats?.xp ?? (acceptedCount * 20);

      const completedAttempts = attempts.filter((a: any) =>
        ["submitted", "auto_submitted", "timed_out"].includes(a.status)
      );
      const totalAssessmentsCompleted = stats.totalAssessmentsCompleted ?? completedAttempts.length;
      const totalAssessmentsAttempted = stats.totalAssessmentsAttempted ?? attempts.length;
      const totalAssessmentsPassed = stats.totalAssessmentsPassed ?? completedAttempts.filter((a: any) => a.passed === true).length;
      const passRate = totalAssessmentsCompleted > 0 ? Math.round((totalAssessmentsPassed / totalAssessmentsCompleted) * 100) : 0;
      const averageScore = stats.averageScore ?? 0;
      const highestScore = stats.highestScore ?? 0;

      const latestCompleted = completedAttempts[0];
      const realAssessmentName =
        latestCompleted?.assessmentTitle || (attempts[0]?.assessmentTitle) || "Algorithmic Skills Assessment";

      setPreviewReportData({
        reportId: `CS-${new Date().getFullYear()}-${String(u._id || u.id || userId).slice(-6).toUpperCase()}`,
        generatedAt: new Date().toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
        assessmentName: realAssessmentName,
        student: {
          name: u.name || u.email?.split("@")[0] || "Candidate",
          email: u.email || "N/A",
          role: u.isAdmin ? "Admin" : "Candidate",
          joinedAt: u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB") : "N/A",
          lastActiveAt: u.lastActive ? new Date(u.lastActive).toLocaleDateString("en-GB") : "Today",
          uid,
          studentProfile,
        },
        performance: {
          totalSolved,
          score: latestCompleted ? latestCompleted.score : userScore,
          maxScore: latestCompleted ? latestCompleted.maxScore : 100,
          acceptanceRate: latestCompleted ? latestCompleted.percentage : acceptanceRate,
          streak: u.stats?.currentStreak ?? u.stats?.streak ?? 0,
        },
        stats: {
          totalAssessmentsAttempted,
          totalAssessmentsCompleted,
          totalAssessmentsPassed,
          passRate,
          averageScore,
          highestScore,
          totalViolations: stats.totalViolations ?? 0,
          uniqueProblemsSolved: totalSolved,
          totalSubmissions: userSubmissionsCount,
          acceptedSubmissions: acceptedCount,
          acceptanceRate,
        },
        assessmentAttempts: attempts,
        submissions: subs.map((s: any) => ({
          _id: s._id || s.id,
          problemTitle: s.problem?.title || s.problemTitle || "Coding Practice Problem",
          language: s.language || "cpp",
          status: s.status || "Submitted",
          submittedAt: s.createdAt ? new Date(s.createdAt).toLocaleString("en-GB") : "Recent",
        })),
      });
    } catch (err: any) {
      console.error("Failed to load report for preview", err);
      setPreviewError(err?.response?.data?.message || err.message || "Failed to load candidate report");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewUser(null);
    setPreviewReportData(null);
    setPreviewError(null);
  };

  return (
    <div className="p-8 font-sans max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Candidates &amp; Users</h1>
          <p className="text-muted-foreground text-sm mt-1">
            View candidates, inspect verified assessment reports, and evaluate problem performance.
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-border flex items-center justify-between gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search by name or email..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-foreground transition-all"
            />
          </div>
          <div className="text-sm text-muted-foreground font-medium">
            {users.length} {users.length === 1 ? "user" : "users"}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-muted-foreground">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="px-6 py-3">Candidate</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Joined</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Spinner className="w-6 h-6 animate-spin text-primary" />
                      <span className="text-sm">Loading candidates...</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                        <Search className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-foreground font-medium">No candidates found</p>
                      <p className="text-xs text-muted-foreground/70">Try adjusting your search criteria</p>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const candidateId = user._id || user.id;
                  const candidateName = user.name || user.email?.split("@")[0] || "Candidate";
                  return (
                    <tr key={candidateId} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                            {user.avatar ? (
                              <img src={user.avatar} alt={candidateName} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{candidateName}</div>
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">{user.email || "N/A"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {user.isAdmin ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-500">
                            <ShieldCheck className="w-3.5 h-3.5" /> Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                            Candidate
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-GB") : "N/A"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openPreview(user)}
                            className="px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded-md transition-colors flex items-center gap-1"
                            title="Preview Official Report"
                          >
                            <Eye className="w-3.5 h-3.5" /> Preview
                          </button>
                          <Link 
                            href={`/admin/candidates/${candidateId}`}
                            className="px-3 py-1.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground rounded-md transition-colors flex items-center gap-1"
                            title="View Full Report Page"
                          >
                            <FileText className="w-3.5 h-3.5" /> Report
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Candidate Report Preview In-Page Modal */}
      {previewUser && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm p-4 md:p-8 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-4 bg-card p-4 rounded-xl border border-border shadow-xs">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">
                  Candidate Report: {previewUser.name || previewUser.email}
                </h2>
                {previewReportData?.student?.uid && (
                  <span className="font-mono bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded border border-primary/20">
                    UID: {previewReportData.student.uid}
                  </span>
                )}
                {previewUser.isAdmin && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 px-2 py-0.5 rounded">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {previewReportData?.student?.studentProfile?.department
                  ? `${previewReportData.student.studentProfile.department} ${
                      previewReportData.student.studentProfile.university
                        ? `• ${previewReportData.student.studentProfile.university}`
                        : ""
                    }`
                  : "Official performance scorecard, assessment records, and code submission log."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {previewReportData && (
                <PDFDownloadButton data={previewReportData} />
              )}
              <button
                type="button"
                onClick={closePreview}
                className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Close preview"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex-1 bg-muted/20 rounded-xl overflow-hidden border border-border shadow-inner relative flex items-center justify-center">
            {previewLoading ? (
              <div className="flex flex-col items-center gap-3 p-8 text-center text-muted-foreground">
                <Spinner className="w-8 h-8 animate-spin text-primary" />
                <span className="text-sm font-medium">Generating candidate evaluation report...</span>
              </div>
            ) : previewError ? (
              <div className="flex flex-col items-center gap-3 p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-sm text-destructive max-w-md">{previewError}</p>
                <button
                  type="button"
                  onClick={() => openPreview(previewUser)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : previewReportData ? (
              <div className="w-full h-full p-4 overflow-y-auto flex flex-col items-center gap-4">
                {/* KPI Summary Tiles */}
                <div className="w-full max-w-5xl bg-card border border-border rounded-xl p-5 shadow-sm">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="text-xs text-muted-foreground font-medium">Exams Attempted</div>
                      <div className="text-2xl font-bold text-foreground mt-1">
                        {previewReportData.stats?.totalAssessmentsCompleted ?? 0}{" "}
                        <span className="text-xs text-muted-foreground font-normal">
                          / {previewReportData.stats?.totalAssessmentsAttempted ?? 0}
                        </span>
                      </div>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="text-xs text-muted-foreground font-medium">Exams Passed</div>
                      <div className="text-2xl font-bold text-green-500 mt-1">
                        {previewReportData.stats?.totalAssessmentsPassed ?? 0}
                      </div>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="text-xs text-muted-foreground font-medium">
                        {previewReportData.assessmentAttempts?.length > 0 ? "Average Score" : "Acceptance Rate"}
                      </div>
                      <div className="text-2xl font-bold text-amber-500 mt-1">
                        {previewReportData.performance.acceptanceRate}%
                      </div>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <div className="text-xs text-muted-foreground font-medium">Problems Solved</div>
                      <div className="text-2xl font-bold text-primary mt-1">
                        {previewReportData.performance.totalSolved}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 1: Assessment Attempts & Exam Scores */}
                <div className="w-full max-w-5xl bg-card border border-border rounded-xl overflow-hidden shadow-sm flex flex-col">
                  <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-primary" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Assessment History &amp; Exam Scores
                      </span>
                    </div>
                    <Link
                      href={`/admin/candidates/${previewUser._id || previewUser.id}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      View Full Details &rarr;
                    </Link>
                  </div>

                  <div className="divide-y divide-border overflow-x-auto">
                    {previewReportData.assessmentAttempts?.length === 0 ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        No assessment attempts recorded for this candidate.
                      </div>
                    ) : (
                      previewReportData.assessmentAttempts.map((att: any) => {
                        const isCompleted = ["submitted", "auto_submitted", "timed_out"].includes(att.status);
                        return (
                          <div
                            key={att.id}
                            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                          >
                            <div>
                              <div className="font-medium text-sm text-foreground flex items-center gap-2">
                                <span>{att.assessmentTitle}</span>
                                {att.assessmentCode && (
                                  <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                    {att.assessmentCode}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {att.submittedAt
                                  ? new Date(att.submittedAt).toLocaleDateString("en-GB")
                                  : "Recent"}{" "}
                                • Score:{" "}
                                <span className="font-semibold text-foreground">
                                  {att.score} / {att.maxScore}
                                </span>{" "}
                                ({att.percentage}%)
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {att.passed ? (
                                <span className="text-xs font-semibold text-green-500 bg-green-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                                </span>
                              ) : att.status === "in_progress" ? (
                                <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" /> In Progress
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-red-500 bg-red-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                  <XCircle className="w-3.5 h-3.5" /> Failed
                                </span>
                              )}

                              {isCompleted && (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadAttemptReport(att.id)}
                                  disabled={downloadingAttemptId === att.id}
                                  className="text-xs font-medium text-primary hover:bg-primary/10 px-2.5 py-1 rounded border border-primary/20 flex items-center gap-1 transition-colors"
                                  title="Download verified PDF scorecard"
                                >
                                  {downloadingAttemptId === att.id ? (
                                    <Spinner className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Download className="w-3.5 h-3.5" />
                                  )}
                                  <span>PDF</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Section 2: Recent Practice Submissions */}
                <div className="w-full max-w-5xl bg-card border border-border rounded-xl overflow-hidden shadow-sm flex flex-col mb-4">
                  <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Recent Practice Submissions
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {previewReportData.submissions.length === 0 ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">
                        No practice submissions recorded for this candidate.
                      </div>
                    ) : (
                      previewReportData.submissions.slice(0, 5).map((sub: any) => {
                        const isAccepted = sub.status?.toLowerCase() === "accepted";
                        return (
                          <div key={sub._id} className="p-3.5 flex items-center justify-between hover:bg-muted/20 text-xs">
                            <div>
                              <div className="font-medium text-sm text-foreground">{sub.problemTitle}</div>
                              <div className="text-muted-foreground mt-0.5">{sub.submittedAt}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono uppercase bg-muted px-2 py-0.5 rounded text-foreground">
                                {sub.language}
                              </span>
                              <span className={`font-semibold ${isAccepted ? "text-green-500" : "text-red-500"}`}>
                                {sub.status}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
