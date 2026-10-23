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
} from "lucide-react";
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
    if (!path) return;
    try {
      setEnrolling(true);
      await learningAPI.enroll(path.id);
      await loadPath();
    } catch (err) {
      console.error("Enrollment failed", err);
    } finally {
      setEnrolling(false);
    }
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
            className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All Learning Paths</span>
          </Link>
        </div>

        {/* Hero Card */}
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 mb-3">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 capitalize">
                  {path.difficulty}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>~{path.estimatedHours} Hours</span>
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{path.courses.length} Courses</span>
                </span>
              </div>

              <div className="flex items-center gap-4 mt-2">
                <div className="w-14 h-14 rounded-xl bg-muted/60 border border-border p-2.5 flex items-center justify-center shadow-sm">
                  <img
                    src={techIconSrc}
                    alt={path.title}
                    className="w-full h-full object-contain"
                  />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  {path.title}
                </h1>
              </div>

              <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
                {path.description}
              </p>

              <div className="flex flex-wrap gap-2 mt-4">
                {path.tags.map((t, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-md bg-muted text-xs text-muted-foreground font-medium border border-border"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>

            {/* Action Card */}
            <div className="bg-muted/40 border border-border p-6 rounded-xl w-full md:w-80 shadow-sm flex flex-col justify-between">
              {path.isEnrolled ? (
                <div>
                  <div className="flex justify-between text-xs font-bold mb-2">
                    <span className="text-muted-foreground">Roadmap Progress</span>
                    <span className="text-primary font-bold">
                      {path.progress?.percentage || 0}%
                    </span>
                  </div>
                  <div className="w-full bg-muted h-2.5 rounded-full overflow-hidden mb-6">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-500"
                      style={{ width: `${path.progress?.percentage || 0}%` }}
                    />
                  </div>

                  {isCompleted ? (
                    <Button
                      onClick={handleClaimCertificate}
                      disabled={claimingCert}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2"
                    >
                      <Trophy className="w-4 h-4 text-amber-300" />
                      <span>{claimingCert ? "Issuing..." : "Claim Certificate"}</span>
                    </Button>
                  ) : (
                    <Link
                      href={`/learning/${path.slug}/${path.courses[0]?.slug}`}
                      className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-sm transition-colors"
                    >
                      <span>Resume Learning</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-4">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Includes Verifiable Certificate</span>
                  </div>
                  <Button
                    onClick={handleEnroll}
                    disabled={enrolling}
                    className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm shadow-sm flex items-center justify-center gap-2"
                  >
                    <span>{enrolling ? "Enrolling..." : "Enroll in Learning Path"}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Connected Roadmap Timeline Section */}
        <div className="pt-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                <span>Learning Roadmap & Milestones</span>
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Follow this step-by-step path to master all concepts and achieve certification.
              </p>
            </div>
            <span className="text-xs text-muted-foreground font-medium px-3 py-1 bg-card rounded-md border border-border shadow-sm">
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
                    className={`absolute -left-6 sm:-left-10 top-5 w-6 sm:w-10 h-6 sm:h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                      isCourseDone
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
                  <div className="bg-card border border-border rounded-xl p-6 transition-all hover:border-foreground/20 hover:shadow-md shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-bold text-primary">
                            MILESTONE {cIdx + 1}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">
                            ~{course.estimatedMinutes} mins
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground capitalize">{course.difficulty}</span>
                        </div>
                        <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                          {course.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                          {course.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {isCourseDone && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Passed</span>
                          </span>
                        )}

                        <Link
                          href={`/learning/${path.slug}/${course.slug}`}
                          className="px-4 py-2 rounded-md bg-primary hover:bg-primary/90 text-xs font-semibold text-primary-foreground shadow-sm transition-colors"
                        >
                          Start Course
                        </Link>

                        <button
                          onClick={() => toggleCourseExpand(course.id)}
                          className="p-2 rounded-md border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
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
                      <div className="mt-5 space-y-3">
                        {course.modules.map((mod) => (
                          <div
                            key={mod.id}
                            className="bg-muted/30 border border-border rounded-lg p-4"
                          >
                            <div className="flex items-center justify-between text-xs font-bold text-foreground mb-2">
                              <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-primary" />
                                <span>{mod.title}</span>
                              </span>
                              <span className="text-muted-foreground font-normal">
                                {mod.lessons.length} lessons
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                              {mod.lessons.map((lesson) => (
                                <div
                                  key={lesson.id}
                                  className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-card border border-border text-xs text-foreground shadow-sm"
                                >
                                  {getLessonIcon(lesson.type)}
                                  <span className="truncate font-medium">{lesson.title}</span>
                                  <span className="text-[10px] text-muted-foreground uppercase ml-auto font-semibold">
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

              <div className="bg-card border border-amber-500/30 rounded-xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                      FINAL CREDENTIAL
                    </span>
                    <h3 className="text-lg font-bold text-foreground mt-1">
                      Verified Digital Certificate of Completion
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-xl">
                      Upon passing all mandatory course exercises and quizzes with a score of 70%+, your tamper-proof digital credential will be generated with a public verification URL.
                    </p>
                  </div>

                  {isCompleted ? (
                    <Button
                      onClick={handleClaimCertificate}
                      disabled={claimingCert}
                      className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold shadow-sm"
                    >
                      Claim Certificate
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground font-semibold px-4 py-2 rounded-md bg-muted border border-border">
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
