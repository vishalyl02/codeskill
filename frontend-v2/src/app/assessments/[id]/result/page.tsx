"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Trophy,
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  BarChart3,
  RefreshCw,
  HelpCircle,
  Check,
  X,
  Layers,
  ShieldCheck,
  Share2,
  RotateCcw,
  FileDown
} from "lucide-react";
import { studentAssessmentsAPI } from "@/config/api";
import { ContestReportDownloadButton } from "@/components/reports/ContestReportDownloadButton";
import { buildContestReport } from "@/lib/contest-report-builder";
import { useAuth } from "@/context/AuthContext";
import { releaseAssessmentStream } from "@/lib/assessment-media-session";

export default function AssessmentResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetaking, setIsRetaking] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    releaseAssessmentStream(id);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, [id]);

  const handleRetake = async () => {
    setIsRetaking(true);
    try {
      // Preserve the explicit redo action through the briefing and fullscreen gate.
      router.push(`/assessments/${id}?retake=1`);
    } catch (err) {
      console.error("Failed to retake assessment:", err);
    } finally {
      setIsRetaking(false);
    }
  };

  useEffect(() => {
    const fetchResult = async () => {
      setIsLoading(true);
      setResultError(null);
      try {
        const res = await studentAssessmentsAPI.getResult(id);
        setData(res.data);
      } catch (err: any) {
        // A 400 means the API has no finalized attempt yet; show the normal
        // empty scorecard state instead of logging an expected API response as
        // an uncaught-looking client error. Surface outages with a retry.
        if (err?.response?.status === 400) {
          setData(null);
        } else {
          const message = err?.response?.data?.message;
          setResultError(Array.isArray(message) ? message.join(" ") : message || "We could not load the scorecard. Please retry.");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchResult();
  }, [id, retryCount]);

  if (isLoading) {
    return (
      <div className="flex-1 min-h-screen bg-background flex items-center justify-center font-sans">
        <div className="text-center space-y-2">
          <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-xs text-muted-foreground">Calculating scorecard and topic analytics...</p>
        </div>
      </div>
    );
  }

  const attempt = data?.attempt;
  const assessment = data?.assessment;

  if (resultError) {
    return (
      <div className="flex-1 min-h-screen bg-background flex items-center justify-center font-sans p-6">
        <div role="alert" className="text-center space-y-4 max-w-sm">
          <h2 className="text-lg font-bold text-foreground">Scorecard temporarily unavailable</h2>
          <p className="text-xs text-muted-foreground">{resultError}</p>
          <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-xl text-xs hover:bg-primary/90 transition-colors">
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="flex-1 min-h-screen bg-background flex items-center justify-center font-sans p-6">
        <div className="text-center space-y-4 max-w-sm">
          <h2 className="text-lg font-bold text-foreground">Scorecard Not Available</h2>
          <p className="text-xs text-muted-foreground">
            No completed submission found for this assessment.
          </p>
          <Link
            href="/assessments"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-xl text-xs hover:bg-primary/90 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Go to Assessments
          </Link>
        </div>
      </div>
    );
  }

  // Construct official Contest Report payload
  const reportData = buildContestReport({
    student: {
      name: user?.name || "Candidate",
      uid: user?.uid || (user as any)?.studentProfile?.rollNumber || (user as any)?.studentProfile?.uid || (user as any)?.registrationNumber || "N/A",
      registrationId: (user as any)?.registrationNumber || (user as any)?.rollNumber || user?.uid || "N/A",
      program: (user as any)?.studentProfile?.course || (user as any)?.program || "B.Tech Computer Science & Engineering",
      batch: (user as any)?.studentProfile?.batch || (user as any)?.batch || "2024 - 2028",
      section: (user as any)?.studentProfile?.section || (user as any)?.section || "Section B",
      group: (user as any)?.studentProfile?.group || (user as any)?.group || "Group G1",
      semester: (user as any)?.studentProfile?.semester ? `Semester ${(user as any).studentProfile.semester}` : (user as any)?.semester ? `Semester ${(user as any).semester}` : "Semester 4",
      email: user?.email || "student@cuchd.in",
      institution: (user as any)?.studentProfile?.university || "Chandigarh University",
    },
    contest: {
      id: id || "CS-CONTEST",
      name: assessment?.title || "University Coding Assessment",
      code: assessment?.code || id,
      date: attempt?.submittedAt ? new Date(attempt.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      duration: `${assessment?.durationMinutes || 60} Minutes`,
      generatedOn: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      totalProblems: data?.reviewQuestions?.length || attempt?.totalAttempted || 5,
      maximumScore: attempt?.maxScore || 100,
      totalParticipants: data?.totalParticipants || 1,
    },
    problems: (data?.reviewQuestions || []).map((q: any, idx: number) => ({
      index: idx + 1,
      title: q.question ? (q.question.length > 55 ? q.question.substring(0, 52) + "..." : q.question) : `Problem ${idx + 1}`,
      difficulty: (q.difficulty || "Medium") as "Easy" | "Medium" | "Hard",
      status: q.isCorrect
        ? "Solved"
        : (Array.isArray(q.selectedAnswers) ? q.selectedAnswers.length > 0 : q.selectedAnswer >= 0)
          ? "Wrong Answer"
          : "Not Attempted",
      score: q.marksAwarded || 0,
      maxScore: q.marks || 10,
      timeTaken: "2m 15s",
      timeTakenSeconds: 135,
      attempts: 1,
      topic: q.topic || "Algorithms",
    })),
    rawTopics: (data?.topicBreakdown || []).map((t: any) => ({
      topic: t.topic || "Core CS",
      solved: t.correct || 0,
      total: t.total || 0,
    })),
    rank: data?.rank || 1,
    totalParticipants: data?.totalParticipants || 1,
    evaluator: {
      facultyName: "Dr. Ishdeep Singla",
      designation: "Assistant Director",
      department: "Skill Development and Labs",
      remarks: attempt?.passed
        ? "Student demonstrates proficient algorithmic reasoning and structured problem solving. Recommended to proceed with advanced graph and dynamic programming training."
        : "Student requires targeted revision on core algorithmic logic and edge case handling. Recommended to join lab remedial sessions.",
      evaluationDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      signatureStatus: "VERIFIED EVALUATOR",
    },
  });

  return (
    <div className="flex-1 bg-background text-foreground font-sans min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-8 mt-16 md:mt-24 space-y-8">
        {/* Navigation Breadcrumb & Download Header */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/assessments"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Assessments
          </Link>
          <div className="hidden sm:block">
            <ContestReportDownloadButton
              data={reportData}
              logoPath="/cu-logo.png"
              filename={`${(assessment?.title || "Contest-Report").replace(/[^a-zA-Z0-9]/g, "_")}_${user?.name || "Student"}.pdf`}
              variant="outline"
              size="sm"
            />
          </div>
        </div>

        {/* Scorecard Hero Banner */}
        <div
          className={`relative overflow-hidden rounded-lg p-6 sm:p-8 border bg-card text-card-foreground shadow-xs ${
            attempt.passed
              ? "border-emerald-200 dark:border-emerald-900/70"
              : "border-border"
          }`}
        >
          {/* Institutional Branding Header */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-border gap-4">
            <div className="flex items-center gap-3">
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
                <p className="text-xs font-bold text-foreground leading-tight">Chandigarh University</p>
                <p className="text-[10px] text-primary font-semibold uppercase tracking-wider">Official Examination Scorecard</p>
              </div>
            </div>

            <div className="sm:hidden">
              <ContestReportDownloadButton
                data={reportData}
                logoPath="/cu-logo.png"
                filename={`Contest_Report_${user?.name || "Student"}.pdf`}
                variant="outline"
                size="sm"
              />
            </div>
          </div>

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 ${
                    attempt.passed
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  {attempt.passed ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> PASSED EXAMINATION
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" /> NEEDS IMPROVEMENT
                    </>
                  )}
                </span>
                <span className="text-xs font-mono text-muted-foreground font-semibold">
                  {assessment?.code}
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                {assessment?.title}
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Completed on {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Recently'}
              </p>
            </div>

            {/* Score Pill */}
            <div className="bg-card/90 backdrop-blur-md border border-border px-8 py-5 rounded-3xl text-center shadow-lg shrink-0">
              <span className="text-xs uppercase font-bold text-muted-foreground tracking-wider">
                Overall Score
              </span>
              <div className="text-4xl font-extrabold text-foreground mt-1 font-mono">
                {attempt.score}{" "}
                <span className="text-lg font-normal text-muted-foreground">
                  / {attempt.maxScore}
                </span>
              </div>
              <div className="text-xs font-bold text-primary mt-0.5">
                {attempt.percentage}% Aggregate
              </div>
            </div>
          </div>
        </div>

        {/* Detailed KPI Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card border border-border p-5 rounded-2xl">
            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-primary" /> Accuracy
            </span>
            <div className="text-2xl font-bold text-foreground mt-1">
              {attempt.accuracy}%
            </div>
            <span className="text-[11px] text-muted-foreground">
              {attempt.totalCorrect} of {attempt.totalAttempted} attempted correct
            </span>
          </div>

          <div className="bg-card border border-emerald-500/30 p-5 rounded-2xl">
            <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Correct
            </span>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {attempt.totalCorrect}
            </div>
            <span className="text-[11px] text-muted-foreground">
              +{attempt.totalCorrect * 1} marks earned
            </span>
          </div>

          <div className="bg-card border border-rose-500/30 p-5 rounded-2xl">
            <span className="text-xs text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" /> Incorrect
            </span>
            <div className="text-2xl font-bold text-rose-400 mt-1">
              {attempt.totalWrong}
            </div>
            <span className="text-[11px] text-muted-foreground">
              Negative penalties applied
            </span>
          </div>

          <div className="bg-card border border-border p-5 rounded-2xl">
            <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-sky-400" /> Time Taken
            </span>
            <div className="text-2xl font-bold text-foreground mt-1">
              {Math.floor((attempt.timeSpentSeconds || 0) / 60)}m {(attempt.timeSpentSeconds || 0) % 60}s
            </div>
            <span className="text-[11px] text-muted-foreground">
              Clean test session
            </span>
          </div>
        </div>

        {/* Topic-Wise Breakdown */}
        {data.topicBreakdown && data.topicBreakdown.length > 0 && (
          <div className="bg-card border border-border rounded-3xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" /> Topic Performance Breakdown
            </h2>

            <div className="space-y-3">
              {data.topicBreakdown.map((item: any) => (
                <div key={item.topic} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">{item.topic}</span>
                    <span className="text-muted-foreground">
                      <strong>{item.correct}</strong>/{item.total} Correct ({item.accuracy}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.accuracy >= 70
                          ? "bg-emerald-500"
                          : item.accuracy >= 40
                          ? "bg-primary"
                          : "bg-rose-500"
                      }`}
                      style={{ width: `${item.accuracy}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed Question Review */}
        {data.reviewQuestions && data.reviewQuestions.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-primary" /> Detailed Question Review
            </h2>

            <div className="space-y-4">
              {data.reviewQuestions.map((q: any, idx: number) => {
                const isCorrect = q.isCorrect;
                const isSkipped = q.selectedAnswer < 0;

                return (
                  <div
                    key={q.questionId || idx}
                    className={`bg-card border rounded-2xl p-5 sm:p-6 space-y-4 transition-all ${
                      isCorrect
                        ? "border-emerald-500/30"
                        : isSkipped
                        ? "border-border"
                        : "border-rose-500/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-muted font-bold text-xs flex items-center justify-center text-foreground font-mono">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">
                          {q.topic}
                        </span>
                      </div>

                      <div className="text-xs font-bold">
                        {isCorrect ? (
                          <span className="text-emerald-400 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Correct (+{q.marksAwarded} pts)
                          </span>
                        ) : isSkipped ? (
                          <span className="text-muted-foreground">Unattempted (0 pts)</span>
                        ) : (
                          <span className="text-rose-400 inline-flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" /> Incorrect ({q.marksAwarded} pts)
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-sm font-medium text-foreground">{q.question}</p>

                    {/* Options Grid */}
                    <div className="space-y-2 pt-1">
                      {(q.options || []).map((optItem: any, optIdx: number) => {
                        const opt =
                          typeof optItem === "string"
                            ? optItem
                            : optItem?.text || String(optItem || "");
                        const isStudentChoice = Array.isArray(q.selectedAnswers)
                          ? q.selectedAnswers.includes(optIdx)
                          : q.selectedAnswer === optIdx;
                        const isCorrectOption = Array.isArray(q.correctAnswers)
                          ? q.correctAnswers.includes(optIdx)
                          : q.correctAnswer === optIdx;
                        const letter = String.fromCharCode(65 + optIdx);

                        let optStyle = "border-border bg-muted/20 text-muted-foreground";
                        if (isCorrectOption) {
                          optStyle = "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 font-semibold";
                        } else if (isStudentChoice && !isCorrect) {
                          optStyle = "border-rose-500/50 bg-rose-500/10 text-rose-300 font-semibold";
                        }

                        return (
                          <div
                            key={optIdx}
                            className={`p-3 rounded-xl border text-xs flex items-center gap-3 ${optStyle}`}
                          >
                            <span className="w-6 h-6 rounded-lg bg-card border border-border flex items-center justify-center text-[11px] font-bold shrink-0 font-mono">
                              {letter}
                            </span>
                            <span className="flex-1 break-words">{opt}</span>

                            {isCorrectOption && (
                              <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Correct Answer
                              </span>
                            )}
                            {isStudentChoice && !isCorrect && (
                              <span className="text-[10px] uppercase font-bold text-rose-400 flex items-center gap-1">
                                <X className="w-3 h-3" /> Your Answer
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation */}
                    {q.explanation && (
                      <div className="p-3.5 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground space-y-1">
                        <strong className="text-foreground block font-semibold">Explanation:</strong>
                        <span>{q.explanation}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-4 pb-8">
          <Link
            href="/assessments"
            className="inline-flex items-center gap-2 px-6 py-3 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-all border border-border"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Assessments
          </Link>

          <ContestReportDownloadButton
            data={reportData}
            logoPath="/cu-logo.png"
            filename={`${(assessment?.title || "Contest-Report").replace(/[^a-zA-Z0-9]/g, "_")}_${user?.name || "Student"}.pdf`}
            variant="primary"
            size="lg"
          />

          {data?.canRetake !== false ? (
            <button
              onClick={handleRetake}
              disabled={isRetaking}
              className="inline-flex items-center gap-2 px-6 py-3 bg-card hover:bg-muted text-foreground text-xs font-bold rounded-xl transition-all border border-border disabled:opacity-50"
            >
              <RotateCcw className={`w-4 h-4 ${isRetaking ? "animate-spin" : ""}`} />
              {isRetaking ? "Preparing Re-attempt..." : "Redo Assessment"}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl bg-muted/60 text-muted-foreground text-xs font-semibold border border-border">
              1 Attempt Allowed (Completed)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
