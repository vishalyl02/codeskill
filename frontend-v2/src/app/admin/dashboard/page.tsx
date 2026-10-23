"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  Code2,
  Activity,
  ShieldCheck,
  ClipboardList,
  Terminal,
  BarChart3,
  GraduationCap,
  Plus,
  UploadCloud,
  FileText,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Cpu,
} from "lucide-react";
import { adminDashboardAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import { AnalyticsDashboardView } from "@/components/analytics";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

interface RecentUser {
  _id: string;
  name: string;
  email: string;
  role?: string;
  createdAt: string;
}

interface RecentSubmission {
  _id: string;
  user?: {
    name?: string;
    email?: string;
  };
  problem?: {
    title?: string;
  };
  verdict?: string;
  createdAt: string;
}

interface RecentAssessment {
  _id: string;
  title: string;
  status: string;
  durationMinutes?: number;
  createdAt: string;
}

export default function AdminDashboardPage() {
  const pathname = usePathname();
  const isTeacher = pathname?.startsWith("/teacher") ?? false;
  const portalBase = isTeacher ? "/teacher" : "/admin";
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalProblems: 0,
    totalContests: 0,
    totalSubmissions: 0,
    totalAssessments: 0,
    totalQuestions: 0,
    activeToday: 0,
  });

  const [recentActivity, setRecentActivity] = useState<{
    users: RecentUser[];
    submissions: RecentSubmission[];
    assessments: RecentAssessment[];
  }>({
    users: [],
    submissions: [],
    assessments: [],
  });

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Explicit end states avoid capturing opacity: 0 when React replays effects.
        // Remove animation styles afterwards so CSS hover states work normally.
        const tl = gsap.timeline({
          defaults: { duration: 0.35, clearProps: "opacity,transform,translate,rotate,scale" },
        });
        tl.fromTo(".page-header", { opacity: 0, y: -15 }, { opacity: 1, y: 0 })
          .fromTo(".stat-card", { opacity: 0, y: 15 }, { opacity: 1, y: 0, stagger: 0.05 }, "-=0.15")
          .fromTo(".action-tile", { opacity: 0, y: 15 }, { opacity: 1, y: 0, stagger: 0.05 }, "-=0.2")
          .fromTo(".activity-section", { opacity: 0, y: 15 }, { opacity: 1, y: 0 }, "-=0.2");
      });
      return () => mm.revert();
    },
    { scope: containerRef }
  );

  const fetchStats = useCallback(async (isRefreshCall = false) => {
    if (isTeacher) {
      setLoading(false);
      setIsRefreshing(false);
      return;
    }
    if (isRefreshCall) setIsRefreshing(true);
    else setLoading(true);

    try {
      const res = await adminDashboardAPI.getStats();
      if (res.data.success || res.data.stats) {
        setStats((prev) => ({
          ...prev,
          ...(res.data.stats || {}),
        }));
        if (res.data.recentActivity) {
          setRecentActivity({
            users: res.data.recentActivity.users || [],
            submissions: res.data.recentActivity.submissions || [],
            assessments: res.data.recentActivity.assessments || [],
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [isTeacher]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const kpis = [
    {
      title: "Enrolled Candidates",
      value: stats.totalUsers || 0,
      sublabel: "Students & Portal Users",
      icon: GraduationCap,
      href: `${portalBase}/students`,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "hover:border-blue-500/40",
    },
    {
      title: "Assessments",
      value: stats.totalAssessments || 0,
      sublabel: "Examination Drives",
      icon: ClipboardList,
      href: `${portalBase}/assessments`,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      border: "hover:border-rose-500/40",
    },
    {
      title: "Question Bank",
      value: stats.totalQuestions || 0,
      sublabel: "Active Question Items",
      icon: Code2,
      href: `${portalBase}/questions`,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      border: "hover:border-purple-500/40",
    },
    {
      title: "Coding Problems",
      value: stats.totalProblems || 0,
      sublabel: "Practice Challenges",
      icon: Terminal,
      href: `${portalBase}/problems`,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "hover:border-amber-500/40",
    },
    {
      title: "Evaluations & Runs",
      value: stats.totalSubmissions || 0,
      sublabel: "Total Code Submissions",
      icon: BarChart3,
      href: `${portalBase}/candidates`,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "hover:border-emerald-500/40",
    },
    {
      title: "Active Today",
      value: stats.activeToday ?? 0,
      sublabel: "Live Platform Activity",
      icon: Activity,
      href: `${portalBase}/students`,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
      border: "hover:border-cyan-500/40",
    },
  ];

  const quickActions = [
    {
      title: "Create Assessment",
      description: "Set up proctored examination drives, timing windows, and question banks.",
      href: `${portalBase}/assessments/create`,
      icon: Plus,
      cta: "New Assessment",
      accent: "from-rose-500/20 via-rose-500/5 to-transparent",
      btnClass: "admin-action",
    },
    {
      title: "Question Bank",
      description: "Author algorithmic problems, MCQs, or bulk-import standard CSV datasets.",
      href: `${portalBase}/questions/create`,
      icon: Code2,
      cta: "Add Question",
      accent: "from-purple-500/20 via-purple-500/5 to-transparent",
      btnClass: "admin-action",
    },
    {
      title: "Bulk Import Students",
      description: "Onboard student rosters, automatically assign roll numbers and send credentials.",
      href: `${portalBase}/students/import`,
      icon: UploadCloud,
      cta: "Import Students",
      accent: "from-blue-500/20 via-blue-500/5 to-transparent",
      btnClass: "admin-action",
    },
    {
      title: "Candidate Performance",
      description: "Inspect student scoring tables, percentiles, and generate official university PDFs.",
      href: `${portalBase}/candidates`,
      icon: FileText,
      cta: "View Results",
      accent: "from-emerald-500/20 via-emerald-500/5 to-transparent",
      btnClass: "admin-action",
    },
  ];

  return (
    <div ref={containerRef} className="p-3.5 sm:p-6 md:p-8 font-sans relative min-h-full">
      {/* Background radial gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto space-y-6 sm:space-y-8">
        {/* Header Strip */}
        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 pb-3 border-b border-border/40">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold font-heading text-foreground tracking-tight">
              {isTeacher ? "Teacher" : "Admin"}{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground via-foreground/85 to-primary">
                Dashboard
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {isTeacher
                ? "Academic evaluation, test batches, and candidate performance monitoring."
                : "Real-time assessment telemetry, candidate management, and examination operations."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {!isTeacher && <button
              onClick={() => fetchStats(true)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-3 py-2 sm:px-3.5 text-xs font-semibold rounded-xl border border-border bg-card/60 hover:bg-card text-foreground transition-all shadow-xs hover:border-primary/40 disabled:opacity-50 cursor-pointer"
              title="Refresh telemetry data"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isRefreshing ? "animate-spin text-primary" : ""}`} />
              <span>{isRefreshing ? "Refreshing..." : "Sync Telemetry"}</span>
            </button>}
            <Link
              href={`${portalBase}/assessments/create`}
              className="inline-flex items-center gap-2 px-3.5 py-2 sm:px-4 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Assessment</span>
            </Link>
          </div>
        </div>

        {/* 6 Key Performance Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Link
                key={kpi.title}
                href={kpi.href}
                className={`stat-card bg-card/50 backdrop-blur-md p-3.5 sm:p-4 md:p-5 rounded-2xl border border-border/60 transition-[background-color,border-color,box-shadow,translate] group hover:-translate-y-0.5 shadow-xs ${kpi.border}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 ${kpi.bg} ${kpi.color} group-hover:scale-105 transition-transform`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate mb-1">
                    {kpi.title}
                  </p>
                  {loading ? (
                    <Spinner className="w-5 h-5 animate-spin text-muted-foreground" />
                  ) : (
                    <p className="text-2xl md:text-3xl font-bold text-foreground font-heading tracking-tight">
                      {isTeacher ? "—" : kpi.value.toLocaleString()}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/75 truncate mt-1">
                    {kpi.sublabel}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Recharts Analytics Dashboard Section */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Platform Evaluation &amp; Submission Analytics
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Interactive Recharts telemetry: acceptance rates, engagement curves, score distributions, and compiler distribution
              </p>
            </div>
            <Link
              href="/admin/analytics"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline self-start sm:self-auto"
            >
              <span>Full Analytics Portal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <AnalyticsDashboardView initialTimeframe="7d" showSimulateEmptyToggle={true} />
        </div>

        {/* Action Center - 4 Functional Tiles */}
        <div>
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              {isTeacher ? "Teaching Operations Hub" : "Administrative Operations Hub"}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <div
                  key={action.title}
                  className={`action-tile relative bg-card/40 backdrop-blur-md border border-border/60 rounded-2xl p-5 flex flex-col justify-between hover:border-primary/40 transition-[border-color,box-shadow] group overflow-hidden shadow-xs hover:shadow-md`}
                >
                  <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${action.accent} blur-2xl rounded-full pointer-events-none group-hover:opacity-100 transition-opacity`} />
                  
                  <div className="relative z-10 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-muted/60 border border-border/50 flex items-center justify-center text-foreground mb-3 group-hover:scale-105 transition-transform">
                      <ActionIcon className="w-5 h-5" />
                    </div>
                    <h3 className="text-base font-bold text-foreground mb-1 group-hover:text-primary transition-colors">
                      {action.title}
                    </h3>
                  </div>

                  <div className="relative z-10 pt-2 border-t border-border/40">
                    <Link
                      href={action.href}
                      className={`inline-flex items-center justify-center w-full gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${action.btnClass}`}
                    >
                      <span>{action.cta}</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity & System Health Split Section */}
        <div className="activity-section grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2 Cols): Recent Candidates Feed */}
          <div className="lg:col-span-2 bg-card/40 backdrop-blur-md rounded-2xl border border-border/60 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Recent Candidate Onboarding</h3>
                  <p className="text-[11px] text-muted-foreground">Latest registered student profiles &amp; accounts</p>
                </div>
              </div>

              <Link
                href={`${portalBase}/students`}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <span>View All</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {loading ? (
              <div className="py-12 flex justify-center items-center">
                <Spinner className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : recentActivity.users.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-xs">
                No recent candidates found in system records.
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentActivity.users.map((u) => (
                  <div
                    key={u._id}
                    className="flex items-center justify-between p-3 rounded-xl bg-card/60 border border-border/40 hover:border-border transition-colors text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold flex items-center justify-center shrink-0 text-xs">
                        {u.name?.charAt(0)?.toUpperCase() || "S"}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{u.name || "Unnamed Student"}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground uppercase">
                        {u.role || "student"}
                      </span>
                      <span className="text-[10px] text-muted-foreground hidden sm:inline">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "Recent"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column (1 Col): Verified Examination Infrastructure & Status */}
          <div className="bg-card/40 backdrop-blur-md rounded-2xl border border-border/60 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border/40">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Infrastructure Security</h3>
                  <p className="text-[11px] text-muted-foreground">Examination safeguards &amp; engine health</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Safe Exam Browser Integrity</p>
                    <p className="text-[11px] text-muted-foreground">Fullscreen lock &amp; tab-switch violation guard active.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Isolated Code Sandbox</p>
                    <p className="text-[11px] text-muted-foreground">Multi-language execution engine ready with time/memory caps.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Automated Proctoring Telemetry</p>
                    <p className="text-[11px] text-muted-foreground">Webcam snapshot &amp; device event streaming active.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Department of Skill Development &amp; Lab</span>
              <span className="font-semibold text-foreground">CU Verified</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
