"use client";

import { useEffect, useState, Suspense } from "react";
import { adminUsersAPI } from "@/config/api";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle, Code2, Trophy, Clock, User, ShieldCheck, Printer } from "lucide-react";
import Link from "next/link";
import { PDFDownloadButton } from "@/components/reports/pdf/PDFDownloadButton";

function CandidateReportContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      fetchReport(params.id as string);
    }
  }, [params.id]);

  const fetchReport = async (id: string) => {
    try {
      const res = await adminUsersAPI.getReport(id);
      setReport(res.data.report);
      
      // Auto-trigger print if requested via query param
      if (searchParams.get("print") === "true") {
        setTimeout(() => window.print(), 500);
      }
    } catch (err: any) {
      console.error("Failed to fetch report", err);
      alert("Failed to load candidate report");
      router.push("/admin/candidates");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 font-sans max-w-5xl mx-auto h-[60vh] flex items-center justify-center">
        <div className="text-muted-foreground">Loading report...</div>
      </div>
    );
  }

  if (!report) return null;

  const { user, stats, recentSubmissions } = report;

  return (
    <div className="candidate-report p-8 font-sans max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link 
            href="/admin/candidates" 
            className="print-hidden p-2 bg-card border border-border hover:bg-muted text-muted-foreground rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="candidate-report-title text-2xl font-bold text-foreground flex items-center gap-2">
              Assessment Report
              {user.isAdmin && (
                <span className="candidate-report-admin-badge inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 ml-2">
                  <ShieldCheck className="w-3 h-3" /> Admin
                </span>
              )}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Detailed performance analytics and submission history.</p>
          </div>
        </div>
        <PDFDownloadButton 
          data={{
            reportId: `CS-${new Date().getFullYear()}-${user._id.slice(-6).toUpperCase()}`,
            generatedAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
            assessmentName: 'DSA Assessment - Round 1',
            student: {
              name: user.name,
              email: user.email,
              role: user.isAdmin ? 'Admin' : 'Candidate',
              joinedAt: new Date(user.createdAt).toLocaleDateString('en-GB'),
              lastActiveAt: user.lastActive ? new Date(user.lastActive).toLocaleDateString('en-GB') : 'Unknown'
            },
            performance: {
              totalSolved: user.solvedProblems?.length || 0,
              score: user.stats?.score || 0,
              acceptanceRate: stats.acceptanceRate || 0,
              streak: user.stats?.streak || 0
            },
            submissions: recentSubmissions.map((s: any) => ({
              _id: s._id,
              problemTitle: s.problem?.title || 'Unknown Problem',
              language: s.language,
              status: s.status,
              submittedAt: new Date(s.createdAt).toLocaleString('en-GB')
            }))
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Candidate Profile Card */}
        <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center text-center">
          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden mb-4 border-4 border-background shadow-lg">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-muted-foreground" />
            )}
          </div>
          <h2 className="text-xl font-bold text-foreground">{user.name}</h2>
          <p className="text-sm text-muted-foreground font-mono mt-1">{user.email}</p>
          <div className="mt-6 w-full pt-6 border-t border-border flex justify-between text-sm">
            <span className="text-muted-foreground">Joined</span>
            <span className="text-foreground font-medium">{new Date(user.createdAt).toLocaleDateString('en-GB')}</span>
          </div>
          <div className="mt-3 w-full flex justify-between text-sm">
            <span className="text-muted-foreground">Last Active</span>
            <span className="text-foreground font-medium">{user.lastActive ? new Date(user.lastActive).toLocaleDateString('en-GB') : 'Unknown'}</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-between group hover:border-red-500/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Total Solved</h3>
              <div className="p-2 bg-red-500/10 rounded-lg text-red-500">
                <Code2 className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-bold text-foreground">{user.solvedProblems?.length || 0}</div>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-between group hover:border-amber-500/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Leaderboard Score</h3>
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                <Trophy className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-bold text-foreground">{user.stats?.score || 0}</div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-between group hover:border-primary/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Acceptance Rate</h3>
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-bold text-foreground">{stats.acceptanceRate}%</div>
            <div className="text-xs text-muted-foreground mt-1">{stats.acceptedSubmissions} out of {stats.totalSubmissions} accepted</div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 flex flex-col justify-between group hover:border-green-500/30 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground">Current Streak</h3>
              <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-4xl font-bold text-foreground">{user.stats?.streak || 0}</div>
            <div className="text-xs text-muted-foreground mt-1">Days active in a row</div>
          </div>
        </div>
      </div>

      {/* Recent Submissions */}
      <h3 className="text-lg font-bold text-foreground mb-4">Recent Code Submissions</h3>
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
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
                    <p className="text-muted-foreground">No recent submissions found.</p>
                  </td>
                </tr>
              ) : (
                recentSubmissions.map((sub: any) => (
                  <tr key={sub._id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{sub.problem?.title || 'Unknown Problem'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground uppercase">
                        {sub.language}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 font-medium">
                        {sub.status === "Accepted" ? (
                          <span className="text-green-500 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Accepted</span>
                        ) : sub.status === "Pending" ? (
                          <span className="text-primary flex items-center gap-1.5"><Clock className="w-4 h-4" /> Evaluating</span>
                        ) : (
                          <span className="text-red-500 flex items-center gap-1.5"><XCircle className="w-4 h-4" /> {sub.status}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-muted-foreground">
                      {new Date(sub.createdAt).toLocaleString('en-GB')}
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
      <div className="p-8 font-sans max-w-5xl mx-auto h-[60vh] flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    }>
      <CandidateReportContent />
    </Suspense>
  );
}
