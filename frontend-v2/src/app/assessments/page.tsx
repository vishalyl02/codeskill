"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Code2, ListChecks, CheckSquare2, ToggleLeft, Terminal, Layers, Clock, Award, ArrowRight, ShieldCheck, Search, RefreshCw, BarChart3, GraduationCap, LockKeyhole } from "lucide-react";
import { studentAssessmentsAPI } from "@/config/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getQuestionTypeLabel, type QuestionType } from "@/lib/question-types";
import { assessmentTypes, assessmentCompleted, assessmentWindow, canAttemptAssessment, type AssignedAssessment } from "@/lib/assessment-cards";

const icons = { DSA: Code2, MCQ: ListChecks, MULTIPLE_CHOICE: CheckSquare2, TRUE_FALSE: ToggleLeft, CODE_OUTPUT: Terminal };
const tabs = ["All Assessments", "DSA / Coding", "MCQs", "True / False", "Code Output"];
export default function StudentAssessmentsPage() {
  const router = useRouter(); const { user, loading: authLoading } = useAuth();
  const [result, setResult] = useState<{ key: string; assessments: AssignedAssessment[]; error?: string }>();
  const [actionError, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState(tabs[0]); const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("All availability"); const [difficulty, setDifficulty] = useState("All difficulties");
  const [now, setNow] = useState(Date.now);
  const showGuestPrompt = !authLoading && !user;
  const requestKey = `${user?.id || user?._id || 'guest'}:${retry}`;
  const loading = !!user && result?.key !== requestKey;
  const assessments = result?.key === requestKey ? result.assessments : [];
  const error = actionError || (result?.key === requestKey ? result.error : null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    const controller = new AbortController();
    studentAssessmentsAPI.getMyAssessments(controller.signal).then(({ data }) => {
      if (!Array.isArray(data.assessments)) throw new Error("Invalid assessments response");
      if (!controller.signal.aborted) setResult({ key: requestKey, assessments: data.assessments });
    }).catch(() => { if (!controller.signal.aborted) setResult({ key: requestKey, assessments: [], error: "Assessments could not be loaded. Please try again." }); });
    return () => controller.abort();
  }, [user, authLoading, requestKey]);
  const retake = (id: string) => { setError(null); router.push(`/assessments/${id}`); };
  const visible = assessments.filter(assessment => {
    const types = assessmentTypes(assessment); const completed = assessmentCompleted(assessment);
    const status = completed ? "Completed" : assessmentWindow(assessment, now);
    const tabTypes: Record<string, QuestionType[]> = { "DSA / Coding": ["DSA"], MCQs: ["MCQ", "MULTIPLE_CHOICE"], "True / False": ["TRUE_FALSE"], "Code Output": ["CODE_OUTPUT"] };
    return assessment.title.toLowerCase().includes(search.trim().toLowerCase())
      && (tab === tabs[0] || types.some(type => tabTypes[tab]?.includes(type)))
      && (availability === "All availability" || availability === status)
      && (difficulty === "All difficulties" || assessment.difficulties?.some(value => value.toLowerCase() === difficulty.toLowerCase()) || assessment.difficulty?.toLowerCase() === difficulty.toLowerCase());
  });
  return <main className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-12">
    <div aria-hidden={showGuestPrompt} inert={showGuestPrompt} className={`space-y-7 transition-[filter,opacity] duration-300 ${showGuestPrompt ? "pointer-events-none select-none blur-[3px] opacity-45" : ""}`}>
    <header className="flex flex-col sm:flex-row justify-between gap-5 sm:items-end"><div><p className="text-primary text-sm font-semibold flex gap-2 items-center mb-2"><GraduationCap className="w-4 h-4" /> CodeSkill assessment portal</p><h1 className="text-3xl font-bold tracking-tight">Assessments &amp; Technical Tests</h1><p className="text-muted-foreground mt-2 max-w-2xl">Build confidence with coding challenges and technical tests. Find your assigned assessments and track your results.</p></div><Button variant="outline" aria-label="Refresh assessments" disabled={loading || !user} onClick={() => setRetry(value => value + 1)}><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></Button></header>
    <div className="flex flex-wrap gap-2 border-b border-border pb-4">{tabs.map(value => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{value}</button>)}</div>
    <div className="flex flex-col md:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" /><input aria-label="Search assessments" placeholder="Search by assessment title..." value={search} onChange={event => setSearch(event.target.value)} className="w-full py-2 pl-10 pr-3 rounded-lg bg-background border border-border" /></div><select aria-label="Availability" value={availability} onChange={event => setAvailability(event.target.value)} className="p-2 rounded-lg border border-border bg-background">{["All availability", "Upcoming", "Live", "Completed"].map(value => <option key={value}>{value}</option>)}</select><select aria-label="Difficulty" value={difficulty} onChange={event => setDifficulty(event.target.value)} className="p-2 rounded-lg border border-border bg-background">{["All difficulties", "Easy", "Medium", "Hard"].map(value => <option key={value}>{value}</option>)}</select></div>
    {error && <div role="alert" className="p-5 border border-destructive/30 rounded-xl flex flex-wrap gap-3 items-center justify-between"><p className="text-destructive">{error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Try again</Button></div>}
    {authLoading || loading ? <div role="status" className="py-16 flex justify-center gap-3 text-muted-foreground"><Spinner />Loading assessments...</div> : !user ? <div className="min-h-64 rounded-2xl border border-dashed border-border bg-muted/30 flex items-center justify-center p-8 text-center"><p className="max-w-sm text-sm text-muted-foreground">Your assigned assessments, upcoming tests and results will appear here after you sign in.</p></div> : !error && visible.length === 0 ? <div className="text-center p-12 border border-border rounded-2xl text-muted-foreground">No assessments match your filters.</div> : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{visible.map(assessment => {
      const types = assessmentTypes(assessment); const Icon = types.length === 1 ? icons[types[0]] : Layers;
      const completed = assessmentCompleted(assessment); const status = completed ? "Completed" : assessmentWindow(assessment, now);
      const canAttempt = canAttemptAssessment(assessment, now); const id = assessment.id || assessment._id;
      const levels = assessment.difficulties?.length ? assessment.difficulties : assessment.difficulty ? [assessment.difficulty] : [];
      return <article key={id} className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3"><div className="bg-primary/10 text-primary p-3 rounded-xl"><Icon aria-label={types.length === 1 ? `${getQuestionTypeLabel(types[0])} assessment` : "Mixed assessment"} className="w-6 h-6" /></div><span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${status === "Live" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{status}</span></div>
        <div className="space-y-2"><div className="flex flex-wrap gap-1.5">{types.length ? types.map(type => <span key={type} className="text-xs bg-primary/5 text-primary border border-primary/15 px-2 py-0.5 rounded-md">{getQuestionTypeLabel(type)}</span>) : <span className="text-xs text-muted-foreground">{assessment.type || "Technical Assessment"}</span>}</div><h2 className="text-lg font-bold leading-snug break-words">{assessment.title}</h2><p className="text-sm text-muted-foreground line-clamp-2 min-h-10">{assessment.description || "A technical assessment assigned to your account."}</p></div>
        <dl className="grid grid-cols-3 gap-2 border-y border-border py-4 text-sm">{[{ label: "Duration", value: `${assessment.durationMinutes} mins`, icon: Clock }, { label: "Questions", value: assessment.questionCount, icon: Layers }, { label: "Total marks", value: `${assessment.totalMarks} pts`, icon: Award }].map(({ label, value, icon: MetaIcon }) => <div key={label}><dt className="text-xs text-muted-foreground flex gap-1 items-center mb-1"><MetaIcon className="w-3.5 h-3.5 shrink-0" />{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-3">{levels.length > 0 && <span className="capitalize">Difficulty: {levels.length === 1 ? levels[0] : "Mixed"}</span>}{assessment.proctoring && Object.values(assessment.proctoring).some(Boolean) && <span className="flex gap-1 items-center"><ShieldCheck className="w-3.5 h-3.5" /> Proctored</span>}{assessment.code && <span className="font-mono">{assessment.code}</span>}</div>
        <footer className="mt-auto pt-2 space-y-3">{completed && <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>Score: <strong>{assessment.attemptScore ?? 0} / {assessment.totalMarks} pts</strong></span><Link href={`/assessments/${id}/result`} className="font-semibold text-primary flex items-center gap-1 hover:underline"><BarChart3 className="w-4 h-4" />Scorecard</Link></div>}{canAttempt ? completed ? <Button className="w-full" onClick={() => retake(id)}>Re-attempt</Button> : <Link href={`/assessments/${id}`} className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-foreground text-background font-semibold text-sm hover:opacity-90">{assessment.attemptStatus === "in_progress" ? "Resume Assessment" : "Attempt Now"}<ArrowRight className="w-4 h-4" /></Link> : <Button variant="outline" className="w-full" disabled>{status === "Upcoming" ? "Opens at the scheduled start time" : "Assessment closed"}</Button>}</footer>
      </article>;
    })}</div>}
    </div>
    {showGuestPrompt && <div className="absolute inset-x-0 top-28 z-20 flex justify-center px-4 sm:top-32" role="region" aria-labelledby="student-sign-in-heading">
      <section className="w-full max-w-xl rounded-3xl border border-primary/20 bg-card/95 p-6 shadow-2xl shadow-primary/10 ring-1 ring-primary/10 backdrop-blur-md sm:p-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15"><LockKeyhole className="h-6 w-6" aria-hidden="true" /></div>
        <div className="text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">Student access</p>
          <h2 id="student-sign-in-heading" className="text-xl font-bold tracking-tight sm:text-2xl">Sign in to view your assessments</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">See tests assigned to your account, continue active assessments and review your results.</p>
          <Link href="/login?redirect=/assessments" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:w-auto sm:min-w-52">
            Student Sign In <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>}
  </main>;
}
