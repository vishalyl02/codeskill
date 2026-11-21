"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  BookOpen,
  Award,
  Zap,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  FileText,
  HelpCircle,
  Code2,
  Check,
  Trophy,
  LogIn,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { learningAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

interface PathDetails {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: string;
  estimatedHours: number;
  tags: string[];
  iconUrl?: string;
  isEnrolled: boolean;
  progress: {
    percentage: number;
    completedCourses: number;
    totalCourses: number;
    status: string;
    isCertified: boolean;
  } | null;
  courses: Array<{
    id: string;
    title: string;
    slug: string;
    description: string;
    difficulty: string;
    estimatedMinutes: number;
    isMandatory: boolean;
    order: number;
    isCompleted: boolean;
    progressPercent: number;
    modules: Array<{
      id: string;
      title: string;
      description: string;
      lessonsCount: number;
      lessons: Array<{
        id: string;
        title: string;
        slug: string;
        type: string;
      }>;
    }>;
  }>;
}

export default function LearningPathDetailPage({
  params,
}: {
  params: Promise<{ pathSlug: string }>;
}) {
  const { pathSlug } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const [path, setPath] = useState<PathDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [claimingCert, setClaimingCert] = useState(false);
  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadPath();
  }, [pathSlug]);

  const loadPath = async () => {
    try {
      setLoading(true);
      const res = await learningAPI.getPathBySlug(pathSlug);
      const pathData = res.data?.data || res.data;
      setPath(pathData);

      const initialExpanded: Record<string, boolean> = {};
      (pathData?.courses || []).forEach((c: any) => {
        initialExpanded[c.id] = true;
      });
      setExpandedCourses(initialExpanded);
    } catch (err) {
      console.error("Failed to load path details", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCourseExpand = (id: string) => {
    setExpandedCourses((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleEnroll = async () => {
    if (!user) {
      router.push(`/login?redirect=/learning/${pathSlug}`);
      return;
    }
    if (!path) return;
    try {
      setEnrolling(true);
      await learningAPI.enroll(path.id);
      await loadPath();
      // Seamlessly transition the student into the first course!
      if (path.courses?.[0]?.slug) {
        router.push(`/learning/${path.slug}/${path.courses[0].slug}`);
      }
    } catch (err) {
      console.error("Enrollment failed", err);
    } finally {
      setEnrolling(false);
    }
  };

  const handleStartCourse = async (courseSlug: string) => {
    if (!user) {
      router.push(`/login?redirect=/learning/${pathSlug}/${courseSlug}`);
      return;
    }
    if (path && !path.isEnrolled) {
      try {
        await learningAPI.enroll(path.id);
      } catch (err) {
        // Proceed even if already enrolled
      }
    }
    router.push(`/learning/${pathSlug}/${courseSlug}`);
  };

  const handleClaimCertificate = async () => {
    if (!path) return;
    try {
      setClaimingCert(true);
      await learningAPI.issueCertificate(path.id);
      router.push("/learning/me/certificates");
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to claim certificate");
    } finally {
      setClaimingCert(false);
    }
  };

  const getLessonIcon = (type: string) => {
    switch (type) {
      case "quiz":
        return <HelpCircle className="w-3.5 h-3.5 text-amber-500" />;
      case "coding":
      case "debugging":
        return <Code2 className="w-3.5 h-3.5 text-emerald-500" />;
      case "reading":
      default:
        return <FileText className="w-3.5 h-3.5 text-primary" />;
    }
  };

  const getTechIcon = (pathItem: PathDetails) => {
    if (pathItem.iconUrl && pathItem.iconUrl.startsWith("/")) {
      return pathItem.iconUrl;
    }
    const slug = pathItem.slug.toLowerCase();
    if (slug.includes("ai") || slug.includes("prompt")) return "/images/tech/ai-brain.svg";
    if (slug.includes("python")) return "/images/tech/python.svg";
    if (slug.includes("javascript")) return "/images/tech/javascript.svg";
    return "/images/badges/algo-master.svg";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!path) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
        <h2 className="text-xl font-bold">Path not found</h2>
        <Link
          href="/learning"
          className="mt-4 text-primary hover:underline inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to catalog</span>
        </Link>
      </div>
    );
  }

  const isCompleted = path.progress?.percentage === 100;
  const techIconSrc = getTechIcon(path);

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-20 px-6 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-8">
        {/* Navigation Breadcrumb */}
        <div>
          <Link
            href="/learning"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All Learning Paths</span>
          </Link>
        </div>

        {/* Hero Card */}
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-10 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="px-3.5 py-1 rounded-full text-xs sm:text-sm font-bold bg-primary/10 text-primary border border-primary/20 capitalize">
                  {path.difficulty}
                </span>
                <span className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground font-medium">
                  <Clock className="w-4 h-4 text-primary" />
                  <span>~{path.estimatedHours} Hours</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground font-medium">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <span>{path.courses.length} Courses</span>
                </span>
              </div>

              <div className="flex items-center gap-4 mt-2">
                <div className="w-16 h-16 rounded-2xl bg-muted/60 border border-border p-3 flex items-center justify-center shadow-xs shrink-0">
                  <img
                    src={techIconSrc}
                    alt={path.title}
                    className="w-full h-full object-contain"
                  />
                </div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-foreground leading-tight">
                  {path.title}
                </h1>
              </div>

              <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed font-normal">
                {path.description}
              </p>

              <div className="flex flex-wrap gap-2.5 mt-5">
                {path.tags.map((t, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 rounded-lg bg-muted text-xs sm:text-sm text-muted-foreground font-semibold border border-border"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>

            {/* Action Card */}
            <div className="bg-muted/40 border border-border p-6 rounded-2xl w-full md:w-84 shadow-sm flex flex-col justify-between">
              {path.isEnrolled ? (
                <div>
                  <div className="flex items-center justify-between text-sm font-bold mb-3">
                    <span className="text-foreground">Roadmap Progress</span>
                    <span className="text-primary font-black font-mono text-lg">
                      {path.progress?.percentage || 0}%
                    </span>
                  </div>
                  <div className="w-full bg-muted h-3 rounded-full overflow-hidden mb-6 border border-border">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-700 ease-out shadow-xs shadow-primary/30"
                      style={{ width: `${path.progress?.percentage || 0}%` }}
                    />
                  </div>

                  {isCompleted ? (
                    <Button
                      onClick={handleClaimCertificate}
                      disabled={claimingCert}
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-base shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Trophy className="w-5 h-5 text-amber-300" />
                      <span>{claimingCert ? "Issuing..." : "Claim Certificate"}</span>
                    </Button>
                  ) : (
                    <Link
                      href={`/learning/${path.slug}/${path.courses[0]?.slug}`}
                      className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm sm:text-base shadow-sm transition-colors cursor-pointer"
                    >
                      <span>Resume Learning</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              ) : user ? (
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400 mb-4">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Includes Verifiable Certificate</span>
                  </div>
                  <Button
                    onClick={handleEnroll}
                    disabled={enrolling}
                    className="w-full py-3 px-5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm sm:text-base shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{enrolling ? "Enrolling..." : "Enroll in Learning Path"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400 mb-4">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Includes Verifiable Certificate</span>
                  </div>
                  <Link
                    href={`/login?redirect=/learning/${path.slug}`}
                    className="w-full py-3 px-5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm sm:text-base shadow-sm flex items-center justify-center gap-2 transition-all hover:shadow-md"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Log in to Enroll</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Connected Roadmap Timeline Section */}
        <div className="pt-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground flex items-center gap-2.5">
                <Zap className="w-6 h-6 text-primary" />
                <span>Learning Roadmap & Milestones</span>
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground mt-1.5 font-normal">
                Follow this step-by-step path to master all concepts and achieve certification.
              </p>
            </div>
            <span className="text-xs sm:text-sm text-foreground font-semibold px-3.5 py-1.5 bg-card rounded-lg border border-border shadow-xs">
              {path.courses.length} Milestones
            </span>
          </div>

          {/* Vertical Timeline Path */}
          <div className="relative pl-6 sm:pl-10 space-y-8 before:absolute before:left-3 sm:before:left-5 before:top-4 before:bottom-4 before:w-0.5 before:bg-border">
            {path.courses.map((course, cIdx) => {
              const isExpanded = expandedCourses[course.id];
              const isCourseDone = course.isCompleted;

              return (
                <div key={course.id} className="relative group">
                  {/* Node Indicator on Timeline */}
                  <div
                    className={`absolute -left-6 sm:-left-10 top-5 w-6 sm:w-10 h-6 sm:h-10 rounded-full flex items-center justify-center border-2 transition-all ${isCourseDone
                      ? "bg-emerald-600 border-emerald-500 text-white shadow-sm"
                      : "bg-background border-primary text-primary shadow-sm"
                      }`}
                  >
                    {isCourseDone ? (
                      <Check className="w-3.5 sm:w-5 h-3.5 sm:h-5 stroke-[3]" />
                    ) : (
                      <span className="text-xs sm:text-sm font-bold">{cIdx + 1}</span>
                    )}
                  </div>

                  {/* Milestone Course Card */}
                  <div className="bg-card border border-border rounded-xl p-6 sm:p-8 transition-all hover:border-foreground/20 hover:shadow-md shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border">
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-xs sm:text-sm font-black text-primary tracking-wide">
                            MILESTONE {cIdx + 1}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-xs sm:text-sm text-muted-foreground font-medium">
                            ~{course.estimatedMinutes} mins
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-xs sm:text-sm text-muted-foreground capitalize font-medium">{course.difficulty}</span>
                          <span className="text-muted-foreground">·</span>
                          <span
                            className={`text-xs font-bold uppercase px-2.5 py-0.5 rounded border ${course.isMandatory !== false
                              ? "bg-primary/10 text-primary border-primary/20"
                              : "bg-muted text-muted-foreground border-border"
                              }`}
                          >
                            {course.isMandatory !== false ? "Required" : "Optional"}
                          </span>
                        </div>
                        <h3 className="text-xl sm:text-2xl font-extrabold text-foreground group-hover:text-primary transition-colors">
                          <Link href={`/learning/${path.slug}/${course.slug}`} className="hover:underline">
                            {course.title}
                          </Link>
                        </h3>
                        <p className="text-sm sm:text-base text-muted-foreground mt-2 leading-relaxed">
                          {course.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {isCourseDone && (
                          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Passed</span>
                          </span>
                        )}

                        {!user ? (
                          <Link
                            href={`/login?redirect=/learning/${path.slug}/${course.slug}`}
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-sm font-bold text-primary-foreground shadow-sm transition-colors"
                          >
                            <LogIn className="w-4 h-4" />
                            <span>Log In to Start</span>
                          </Link>
                        ) : (
                          <button
                            onClick={() => handleStartCourse(course.slug)}
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-sm font-bold text-primary-foreground shadow-sm transition-colors cursor-pointer"
                          >
                            <span>Start Course</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => toggleCourseExpand(course.id)}
                          className="p-2.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          aria-label="Toggle modules"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Accordion Modules & Lessons */}
                    {isExpanded && (
                      <div className="mt-6 space-y-4">
                        {course.modules.map((mod) => (
                          <div
                            key={mod.id}
                            className="bg-muted/30 border border-border rounded-xl p-5"
                          >
                            <div className="flex items-center justify-between text-sm sm:text-base font-bold text-foreground mb-3">
                              <span className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                                <span>{mod.title}</span>
                              </span>
                              <span className="text-xs sm:text-sm text-muted-foreground font-medium">
                                {mod.lessons.length} lessons
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
                              {mod.lessons.map((lesson) => (
                                <div
                                  key={lesson.id}
                                  className="flex items-center gap-3 px-4 py-3 rounded-lg bg-card border border-border text-xs sm:text-sm text-foreground shadow-xs hover:border-foreground/20 transition-colors"
                                >
                                  {getLessonIcon(lesson.type)}
                                  <span className="truncate font-semibold text-foreground">{lesson.title}</span>
                                  <span className="text-[11px] text-muted-foreground uppercase ml-auto font-bold tracking-wider">
                                    {lesson.type}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Final Certificate Milestone Node */}
            <div className="relative group">
              <div className="absolute -left-6 sm:-left-10 top-5 w-6 sm:w-10 h-6 sm:h-10 rounded-full flex items-center justify-center border-2 bg-background border-amber-500 text-amber-500 shadow-sm">
                <Trophy className="w-3.5 sm:w-5 h-3.5 sm:h-5" />
              </div>

              <div className="bg-card border border-amber-500/30 rounded-xl p-6 sm:p-8 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                      FINAL CREDENTIAL
                    </span>
                    <h3 className="text-xl sm:text-2xl font-extrabold text-foreground mt-1">
                      Verified Digital Certificate of Completion
                    </h3>
                    <p className="text-sm sm:text-base text-muted-foreground mt-1.5 max-w-xl leading-relaxed">
                      Upon passing all mandatory course exercises and quizzes with a score of 70%+, your tamper-proof digital credential will be generated with a public verification URL.
                    </p>
                  </div>

                  {isCompleted ? (
                    <Button
                      onClick={handleClaimCertificate}
                      disabled={claimingCert}
                      className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-bold shadow-sm cursor-pointer"
                    >
                      Claim Certificate
                    </Button>
                  ) : (
                    <span className="text-xs sm:text-sm text-muted-foreground font-semibold px-4 py-2.5 rounded-lg bg-muted border border-border">
                      Locked until 100%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
