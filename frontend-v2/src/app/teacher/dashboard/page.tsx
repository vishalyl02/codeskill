"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Code2,
  GraduationCap,
  Users,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  Clock,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import { facultyAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/context/AuthContext";
import { formatIndianDateTime } from "@/lib/indian-time";

export default function TeacherDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await facultyAPI.getDashboard();
      if (res.data?.success) {
        setData(res.data);
      }
    } catch (err) {
      console.error("Failed to load faculty dashboard stats", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const stats = data?.stats || {
    myAssessmentsCount: 0,
    activeAssessmentsCount: 0,
    myQuestionsCount: 0,
    assignedBatchesCount: 0,
    assignedStudentsCount: 0,
  };

  const statCards = [
    {
      label: "My Assessments",
      value: stats.myAssessmentsCount,
      icon: ClipboardList,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
      href: "/teacher/assessments",
    },
    {
      label: "Active Exams",
      value: stats.activeAssessmentsCount,
      icon: Clock,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
      href: "/teacher/assessments",
    },
    {
      label: "Questions Authored",
      value: stats.myQuestionsCount,
      icon: Code2,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/20",
      href: "/teacher/questions",
    },
    {
      label: "Assigned Batches",
      value: stats.assignedBatchesCount,
      icon: BookOpen,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
      borderColor: "border-amber-500/20",
      href: "/teacher/students",
    },
    {
      label: "Enrolled Students",
      value: stats.assignedStudentsCount,
      icon: Users,
      color: "text-indigo-500",
      bgColor: "bg-indigo-500/10",
      borderColor: "border-indigo-500/20",
      href: "/teacher/students",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5" /> Faculty Portal
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-foreground mt-2 tracking-tight">
            Welcome, {user?.name || "Professor"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor your authored exams, assigned cohorts, and candidate submissions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => fetchDashboard(true)}
            disabled={refreshing}
            className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh dashboard"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/teacher/questions/create"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-foreground text-xs font-semibold hover:bg-muted transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Question
          </Link>
          <Link
            href="/teacher/assessments/create"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" /> Create Assessment
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <Link
              key={idx}
              href={card.href}
              className={`p-4 rounded-2xl bg-card border ${card.borderColor} shadow-xs hover:shadow-md transition-all group`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  {card.label}
                </span>
                <div
                  className={`w-8 h-8 rounded-xl ${card.bgColor} ${card.color} flex items-center justify-center transition-transform group-hover:scale-110`}
                >
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-foreground mt-3 font-mono">
                {card.value}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Main Content: Recent Assessments & Recent Attempts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Authored Assessments */}
        <div className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">My Assessments</h2>
            </div>
            <Link
              href="/teacher/assessments"
              className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="divide-y divide-border flex-1 overflow-x-auto">
            {(!data?.recentAssessments || data.recentAssessments.length === 0) ? (
              <div className="p-8 text-center text-muted-foreground text-xs">
                You haven&apos;t created any assessments yet.
              </div>
            ) : (
              data.recentAssessments.map((asmt: any) => (
                <div
                  key={asmt.id}
                  className="p-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <Link
                      href={`/teacher/assessments/${asmt.id}/results`}
                      className="text-sm font-semibold text-foreground hover:text-primary transition-colors block"
                    >
                      {asmt.title}
                    </Link>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                      <span className="font-mono">{asmt.code}</span>
                      <span>•</span>
                      <span>
                        {asmt.createdAt ? formatIndianDateTime(asmt.createdAt, false) : "Recently"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        asmt.status === "published" || asmt.status === "ongoing"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {asmt.status}
                    </span>
                    <Link
                      href={`/teacher/assessments/${asmt.id}/results`}
                      className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors"
                    >
                      Results
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Candidate Attempts */}
        <div className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground">Recent Submissions</h2>
            </div>
            <span className="text-xs text-muted-foreground">Latest Exam Attempts</span>
          </div>

          <div className="divide-y divide-border flex-1 overflow-x-auto">
            {(!data?.recentAttempts || data.recentAttempts.length === 0) ? (
              <div className="p-8 text-center text-muted-foreground text-xs">
                No candidate attempts logged yet.
              </div>
            ) : (
              data.recentAttempts.map((att: any) => (
                <div
                  key={att.id}
                  className="p-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                >
                  <div>
                    <div className="font-semibold text-sm text-foreground">
                      {att.studentName || "Candidate"}{" "}
                      <span className="text-xs text-muted-foreground font-mono">
                        ({att.studentUid})
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {att.assessmentTitle} •{" "}
                      {att.submittedAt
                        ? formatIndianDateTime(att.submittedAt, true)
                        : "In Progress"}
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2.5">
                    <div>
                      <div className="font-mono font-bold text-sm text-foreground">
                        {att.score} / {att.maxScore}
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${
                          att.passed
                            ? "text-emerald-500"
                            : "text-rose-500"
                        }`}
                      >
                        {att.passed ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> Passed
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" /> Failed
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
