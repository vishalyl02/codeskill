"use client";

import {
  Code2,
  GitCommit,
  Trophy,
  CheckCircle2,
  Clock,
  ChevronRight,
  Target,
  BookOpen,
  ArrowRight,
  BarChart3,
  ClipboardList,
  AlertCircle,
  Play,
  FileText,
  Award,
  Sparkles,
  Compass,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { studentAssessmentsAPI, learningAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";

interface Assessment {
  _id: string;
  title: string;
  description?: string;
  status: "draft" | "published" | "ongoing" | "completed" | "archived";
  duration?: number;
  durationMinutes?: number;
  totalQuestions?: number;
  questionCount?: number;
  totalMarks?: number;
  scheduledStart?: string;
  scheduledEnd?: string;
  attemptStatus?: string;
  attemptScore?: number | null;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(true);
  const [assessmentsError, setAssessmentsError] = useState(false);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<{ badges?: any[]; xp?: number } | null>(null);
  const [enrolledPaths, setEnrolledPaths] = useState<any[]>([]);
  const [learningLoading, setLearningLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    if (!loading && !user) {
      router.push("/login?redirect=/dashboard");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const fetchAssessments = async () => {
      try {
        setAssessmentsLoading(true);
        const res = await studentAssessmentsAPI.getMyAssessments();
        const data = res.data;
        // Handle both { data: [...] } and direct array responses
        const list = Array.isArray(data) ? data : data?.data ?? data?.assessments ?? [];
        setAssessments(list);
      } catch (err) {
        console.error("Failed to fetch assessments", err);
        setAssessmentsError(true);
      } finally {
        setAssessmentsLoading(false);
      }
    };

    const fetchLearningCredentials = async () => {
      try {
        setLearningLoading(true);
        const [certsRes, achRes, progRes] = await Promise.allSettled([
          learningAPI.getMyCertificates(),
          learningAPI.getMyAchievements(),
          learningAPI.getMyProgress(),
        ]);

        if (certsRes.status === "fulfilled") {
          const d = certsRes.value?.data;
          const list = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
          setCertificates(list);
        }
        if (achRes.status === "fulfilled") {
          const d = achRes.value?.data;
          setAchievements(d?.data || d || null);
        }
        if (progRes.status === "fulfilled") {
          const d = progRes.value?.data;
          const progressData = d?.data || d;
          setEnrolledPaths(progressData?.activePaths || []);
        }
      } catch (err) {
        console.warn("Learning credentials notice:", err);
      } finally {
        setLearningLoading(false);
      }
    };

    fetchAssessments();
    fetchLearningCredentials();
  }, [user]);

  if (!mounted || loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background min-h-screen">
        <div className="w-8 h-8 border-4 border-foreground/30 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  // Pick the first active assessment as the "next" one
  const nextAssessment = assessments.find((a) => a.status === "published" || a.status === "ongoing") ?? null;

  // Available = all active
  const activeAssessments = assessments.filter((a) => a.status === "published" || a.status === "ongoing");

  return (
    <div className="flex-1 bg-background text-foreground font-sans min-h-screen">
      <div className="max-w-7xl mx-auto w-full px-6 py-8 mt-16 md:mt-24">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-1 text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back, {user?.name || "Student"}. Here&apos;s your assessment overview.
            </p>
          </div>
          <Link
            href="/assessments"
            className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-foreground hover:opacity-90 text-background text-xs font-medium transition-opacity shadow-sm"
          >
            View Assessments <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Main Content Column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Hero / Up Next Card */}
            <div className="bg-card rounded-xl border border-border shadow-xs p-6 overflow-hidden relative">
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-muted text-foreground text-[11px] font-medium px-2 py-0.5 rounded border border-border">
                      Up Next
                    </span>
                  </div>

                  {assessmentsLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Spinner className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading your assessments…</span>
                    </div>
                  ) : assessmentsError ? (
                    <div>
                      <h2 className="text-lg font-semibold mb-1">No assessments found</h2>
                      <p className="text-muted-foreground text-xs">
                        Could not load assessments. Please try again later.
                      </p>
                    </div>
                  ) : nextAssessment ? (
                    <div>
                      <h2 className="text-lg sm:text-xl font-semibold mb-1 truncate">{nextAssessment.title}</h2>
                      <p className="text-muted-foreground text-xs sm:text-sm max-w-md line-clamp-2">
                        {nextAssessment.description ||
                          "Complete this assessment to evaluate algorithmic performance."}
                      </p>
                      {(nextAssessment.duration || nextAssessment.totalQuestions) && (
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          {nextAssessment.totalQuestions && (
                            <span className="flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5" />
                              {nextAssessment.totalQuestions} questions
                            </span>
                          )}
                          {nextAssessment.duration && (
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              {nextAssessment.duration} min
                            </span>
                          )}
                          {nextAssessment.totalMarks && (
                            <span className="flex items-center gap-1.5">
                              <Trophy className="w-3.5 h-3.5" />
                              {nextAssessment.totalMarks} marks
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-lg font-semibold mb-1">No Active Assessments</h2>
                      <p className="text-muted-foreground text-xs sm:text-sm max-w-md">
                        No assessments are currently available. Check back later or contact your instructor.
                      </p>
                    </div>
                  )}
                </div>

                {!assessmentsLoading && nextAssessment && (
                  <Link
                    href={`/assessments/${nextAssessment._id}`}
                    className="inline-flex items-center gap-2 justify-center h-9 px-5 rounded-md bg-foreground text-background text-xs font-medium transition-opacity hover:opacity-90 whitespace-nowrap shadow-xs shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Start Assessment
                  </Link>
                )}

                {!assessmentsLoading && !nextAssessment && !assessmentsError && (
                  <Link
                    href="/assessments"
                    className="inline-flex items-center gap-2 justify-center h-9 px-5 rounded-md bg-muted text-foreground text-xs font-medium transition-colors hover:bg-muted/70 whitespace-nowrap shadow-xs shrink-0 border border-border"
                  >
                    Browse All
                  </Link>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  label: "Available Tests",
                  value: assessmentsLoading ? "—" : String(activeAssessments.length),
                  icon: ClipboardList,
                  color: "text-foreground",
                  bg: "bg-muted",
                },
                {
                  label: "Certificates",
                  value: learningLoading ? "—" : String(certificates.length),
                  icon: Award,
                  color: "text-amber-500",
                  bg: "bg-amber-500/10",
                },
                {
                  label: "Badges Earned",
                  value: learningLoading ? "—" : String(achievements?.badges?.length ?? 0),
                  icon: Sparkles,
                  color: "text-indigo-400",
                  bg: "bg-indigo-500/10",
                },
                {
                  label: "Total XP",
                  value: learningLoading ? "—" : String(achievements?.xp ?? 0),
                  icon: Trophy,
                  color: "text-emerald-500",
                  bg: "bg-emerald-500/10",
                },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="bg-card rounded-xl border border-border shadow-xs p-4 flex flex-col hover:border-foreground/20 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center ${stat.bg} ${stat.color}`}>
                      <stat.icon className="w-4 h-4" />
                    </div>
                    <span className="text-muted-foreground text-xs font-medium">{stat.label}</span>
                  </div>
                  <span className="text-xl sm:text-2xl font-semibold text-foreground mt-auto">{stat.value}</span>
                </div>
              ))}
            </div>

            {/* In-Progress Learning Paths & Certifications */}
            <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">
                    Learning Paths & Course Progress
                  </h2>
                </div>
                <Link
                  href="/learning"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center transition-colors"
                >
                  Explore Paths <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                </Link>
              </div>

              {learningLoading ? (
                <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
                  <Spinner className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Loading course progress…</span>
                </div>
              ) : enrolledPaths.length === 0 ? (
                <div className="p-8 flex flex-col items-center text-center gap-2 text-muted-foreground">
                  <BookOpen className="w-8 h-8 opacity-30 text-muted-foreground mb-1" />
                  <p className="text-xs sm:text-sm font-medium text-foreground">No Learning Paths Enrolled Yet</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Enroll in C Programming or DSA Mastery to earn university-accredited, verifiable credentials.
                  </p>
                  <Link
                    href="/learning"
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs transition-colors"
                  >
                    <span>Browse All Paths</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {enrolledPaths.map((path: any) => (
                    <div
                      key={path.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                            {path.difficulty || "Beginner"}
                          </span>
                          {path.isCertified ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              Certified
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              {path.completedCourses} of {path.totalCourses} courses passed
                            </span>
                          )}
                        </div>

                        <h3 className="font-semibold text-foreground text-sm truncate">
                          {path.title}
                        </h3>

                        {/* Progress Bar */}
                        <div className="mt-2.5 flex items-center gap-3">
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden border border-border">
                            <div
                              className="bg-primary h-full rounded-full transition-all duration-500"
                              style={{ width: `${path.percentage || 0}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-foreground shrink-0 font-mono">
                            {path.percentage || 0}%
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <Link
                          href={path.resumeUrl || `/learning/${path.slug}`}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-xs transition-colors"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{path.percentage > 0 ? "Resume Learning" : "Start Learning"}</span>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Active Assessments List */}
            <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
                <h2 className="text-sm font-semibold text-foreground">Available Assessments</h2>
                <Link
                  href="/assessments"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center transition-colors"
                >
                  View all <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                </Link>
              </div>

              {assessmentsLoading ? (
                <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
                  <Spinner className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Loading…</span>
                </div>
              ) : assessmentsError ? (
                <div className="p-8 flex flex-col items-center gap-2 text-muted-foreground">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  <p className="text-xs">Failed to load assessments.</p>
                </div>
              ) : activeAssessments.length === 0 ? (
                <div className="p-8 flex flex-col items-center gap-2 text-muted-foreground">
                  <ClipboardList className="w-6 h-6 opacity-30" />
                  <p className="text-xs">No active assessments at the moment.</p>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {activeAssessments.slice(0, 5).map((assessment) => (
                    <div
                      key={assessment._id}
                      className="p-3.5 flex items-center justify-between hover:bg-muted/40 transition-colors gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-muted text-foreground">
                          <ClipboardList className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-xs sm:text-sm truncate">
                            {assessment.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                            {assessment.totalQuestions && (
                              <span>{assessment.totalQuestions} questions</span>
                            )}
                            {assessment.totalQuestions && assessment.duration && (
                              <span className="opacity-40">•</span>
                            )}
                            {assessment.duration && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {assessment.duration} min
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Link
                        href={`/assessments/${assessment._id}`}
                        className="shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        <Play className="w-3 h-3" />
                        Start
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Official Certificates & Badges Section */}
            <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" />
                  <h2 className="text-sm font-semibold text-foreground">Earned Certificates & Badges</h2>
                </div>
                <Link
                  href="/learning/me/certificates"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center transition-colors"
                >
                  View all <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                </Link>
              </div>

              {learningLoading ? (
                <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
                  <Spinner className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Loading credentials…</span>
                </div>
              ) : certificates.length > 0 ? (
                <div className="p-4 space-y-3">
                  <div className="flex flex-col divide-y divide-border">
                    {certificates.map((cert: any) => (
                      <div
                        key={cert.id || cert.credentialId}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                            <p className="font-semibold text-foreground text-xs sm:text-sm truncate">
                              {cert.pathTitle || "Official Curriculum Certificate"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground font-mono">
                            <span>ID: {cert.credentialId}</span>
                            <span className="opacity-40">•</span>
                            <span className="text-emerald-400 font-sans font-medium">NAAC A+ Verified</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            href={`/verify/${cert.credentialId}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View & Download
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>

                  {achievements?.badges && achievements.badges.length > 0 && (
                    <div className="pt-3 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Earned Badges ({achievements.badges.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {achievements.badges.map((b: any, idx: number) => (
                          <span
                            key={b.id || idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted border border-border text-[11px] font-medium text-foreground"
                          >
                            <span>🏅</span>
                            <span>{b.badge?.name || b.name || "Scholar Badge"}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-foreground">
                      No Certificates Earned Yet
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                      Complete learning path milestones and practical assessments to earn verifiable credentials signed by Chandigarh University leadership.
                    </p>
                  </div>
                  <Link
                    href="/learning"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    Explore Learning Paths &rarr;
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Column */}
          <div className="space-y-6">

              {/* Quick Links */}
            <div className="bg-card rounded-xl border border-border shadow-xs p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground">Quick Links</h2>
                <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                {[
                  { href: "/learning", label: "Learning Paths", icon: Compass },
                  { href: "/learning/me/certificates", label: "My Certificates", icon: Award },
                  { href: "/learning/me/achievements", label: "Badges & XP", icon: Sparkles },
                  { href: "/assessments", label: "My Assessments", icon: ClipboardList },
                  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
                  { href: "/profile", label: "My Profile", icon: BarChart3 },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-muted transition-colors group"
                  >
                    <item.icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span className="text-xs font-medium text-foreground">{item.label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
                  </Link>
                ))}
              </div>
            </div>

            {/* All Assessments Summary */}
            <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/20">
                <h2 className="text-sm font-semibold text-foreground">All Assessments</h2>
              </div>
              {assessmentsLoading ? (
                <div className="p-6 flex justify-center">
                  <Spinner className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : assessments.length === 0 ? (
                <div className="p-5 text-center text-xs text-muted-foreground">
                  No assessments assigned.
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {assessments.slice(0, 6).map((assessment) => (
                    <Link
                      key={assessment._id}
                      href={`/assessments/${assessment._id}`}
                      className="px-3.5 py-2.5 hover:bg-muted/40 transition-colors flex items-center justify-between group gap-2"
                    >
                      <span className="text-xs text-foreground font-medium truncate">
                        {assessment.title}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          assessment.status === "published" || assessment.status === "ongoing"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {assessment.status === "ongoing" || assessment.status === "published" ? "Active" : assessment.status}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
