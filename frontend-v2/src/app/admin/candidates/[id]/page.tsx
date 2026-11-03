"use client";

import { useEffect, useState, Suspense } from "react";
import { adminUsersAPI } from "@/config/api";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle, Code2, Trophy, Clock, User, ShieldCheck, AlertCircle } from "lucide-react";
import Link from "next/link";
import { PDFDownloadButton } from "@/components/reports/pdf/PDFDownloadButton";
import { Spinner } from "@/components/ui/spinner";

function CandidateReportContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="p-8 font-sans max-w-5xl mx-auto h-[60vh] flex flex-col items-center justify-center gap-3">
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
  const recentSubmissions = Array.isArray(report.recentSubmissions) ? report.recentSubmissions : [];

  const safeUserId = String(user.id || user._id || params.id || "000000");
  const studentName = user.name || user.email?.split("@")[0] || "Candidate";
  const userSubmissionsCount = stats.totalSubmissions ?? recentSubmissions.length;
  const acceptedCount =
    stats.acceptedSubmissions ??
    stats.accepted ??
    recentSubmissions.filter((s: any) => s.status === "Accepted").length;
  const acceptanceRate =
    stats.acceptanceRate ??
    (userSubmissionsCount > 0 ? Math.round((acceptedCount / userSubmissionsCount) * 100) : 0);
  const totalSolved = user.solvedProblems?.length || user.stats?.totalSolved || acceptedCount;
  const userScore = user.stats?.score ?? user.stats?.xp ?? (acceptedCount * 20);
  const currentStreak = user.stats?.currentStreak ?? user.stats?.streak ?? 0;

  return (
    <div className="candidate-report p-8 font-sans max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Link 
            href="/admin/candidates" 
            className="print-hidden p-2 bg-card border border-border hover:bg-muted text-muted-foreground rounded-lg transition-colors"
            title="Back to Candidates"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="candidate-report-title text-2xl font-bold text-foreground flex items-center gap-2">
              Candidate Performance Report
              {user.isAdmin && (
                <span className="candidate-report-admin-badge inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 ml-2">
                  <ShieldCheck className="w-3 h-3" /> Admin
                </span>
              )}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Detailed evaluation record, analytics, and code submission log.</p>
          </div>
        </div>
        <PDFDownloadButton 
          data={{
            reportId: `CS-${new Date().getFullYear()}-${safeUserId.slice(-6).toUpperCase()}`,
            generatedAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
            assessmentName: 'Algorithmic Skills Assessment',
            student: {
              name: studentName,
              email: user.email || 'N/A',
              role: user.isAdmin ? 'Admin' : 'Candidate',
              joinedAt: user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB') : 'N/A',
              lastActiveAt: user.lastActive ? new Date(user.lastActive).toLocaleDateString('en-GB') : 'Today',
            },
            performance: {
              totalSolved: totalSolved,
              score: userScore,
              acceptanceRate: acceptanceRate,
              streak: currentStreak,
            },
            submissions: recentSubmissions.map((s: any) => ({
              _id: s._id || s.id,
              problemTitle: s.problem?.title || s.problemTitle || 'Coding Practice Problem',
              language: s.language || 'cpp',
              status: s.status || 'Submitted',
              submittedAt: s.createdAt ? new Date(s.createdAt).toLocaleString('en-GB') : 'Recent',
            })),
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Candidate Profile Card */}
        <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center text-center shadow-xs">
          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden mb-4 border-4 border-background shadow-lg">
            {user.avatar ? (
              <img src={user.avatar} alt={studentName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-muted-foreground" />
            )}
          </div>
          <h2 className="text-xl font-bold text-foreground">{studentName}</h2>
          <p className="text-sm text-muted-foreground font-mono mt-1">{user.email || 'N/A'}</p>
          <div className="mt-6 w-full pt-6 border-t border-border flex justify-between text-sm">
            <span className="text-muted-foreground">Joined</span>
            <span className="text-foreground font-medium">
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB') : 'N/A'}
            </span>
          </div>
          <div className="mt-3 w-full flex justify-between text-sm">
            <span className="text-muted-foreground">Last Active</span>
            <span className="text-foreground font-medium">
              {user.lastActive ? new Date(user.lastActive).toLocaleDateString('en-GB') : 'Today'}
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-between group hover:border-red-500/30 transition-colors shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Total Solved</h3>
              <div className="p-2 bg-red-500/10 rounded-lg text-red-500">
                <Code2 className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-bold text-foreground">{totalSolved}</div>
            <div className="text-xs text-muted-foreground mt-1">Unique problems completed</div>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-between group hover:border-amber-500/30 transition-colors shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Evaluation Score</h3>
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                <Trophy className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-bold text-foreground">{userScore}</div>
            <div className="text-xs text-muted-foreground mt-1">Accumulated skill score</div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-between group hover:border-primary/30 transition-colors shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Acceptance Rate</h3>
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-bold text-foreground">{acceptanceRate}%</div>
            <div className="text-xs text-muted-foreground mt-1">{acceptedCount} out of {userSubmissionsCount} accepted</div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-between group hover:border-green-500/30 transition-colors shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Current Streak</h3>
              <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-bold text-foreground">{currentStreak}</div>
            <div className="text-xs text-muted-foreground mt-1">Consecutive active days</div>
          </div>
        </div>
      </div>

      {/* Recent Submissions */}
      <h3 className="text-lg font-bold text-foreground mb-4">Recent Code Submissions</h3>
      <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-muted-foreground">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
              <tr>
                <th className="px-6 py-3">Problem</th>
                <th className="px-6 py-3">Language</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <p className="text-muted-foreground">No recent code submissions found for this candidate.</p>
                  </td>
                </tr>
              ) : (
                recentSubmissions.map((sub: any) => (
                  <tr key={sub._id || sub.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{sub.problem?.title || sub.problemTitle || 'Coding Practice Problem'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground uppercase">
                        {sub.language || 'cpp'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 font-medium">
                        {sub.status === "Accepted" ? (
                          <span className="text-green-500 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Accepted</span>
                        ) : sub.status === "Pending" ? (
                          <span className="text-primary flex items-center gap-1.5"><Clock className="w-4 h-4" /> Evaluating</span>
                        ) : (
                          <span className="text-red-500 flex items-center gap-1.5"><XCircle className="w-4 h-4" /> {sub.status || 'Attempted'}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-muted-foreground">
                      {sub.createdAt ? new Date(sub.createdAt).toLocaleString('en-GB') : 'Recent'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function CandidateReportPage() {
  return (
    <Suspense fallback={
      <div className="p-8 font-sans max-w-5xl mx-auto h-[60vh] flex flex-col items-center justify-center gap-3">
        <Spinner className="w-8 h-8 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground font-medium">Loading...</div>
      </div>
    }>
      <CandidateReportContent />
    </Suspense>
  );
}