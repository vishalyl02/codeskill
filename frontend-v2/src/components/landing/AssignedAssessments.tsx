"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { studentAssessmentsAPI } from "@/config/api";
import { assessmentWindow, assessmentCompleted, type AssignedAssessment } from "@/lib/assessment-cards";

export function AssignedAssessments() {
  const { user, loading: authLoading } = useAuth();
  const userKey = user?.id || user?._id || user?.uid || (user ? "signed-in" : "guest");
  const [retry, setRetry] = useState(0);
  const requestKey = `${userKey}:${retry}`;
  const [result, setResult] = useState<{ key: string; items: AssignedAssessment[]; failed?: boolean }>();

  useEffect(() => {
    if (authLoading || userKey === "guest") return;
    const controller = new AbortController();
    void studentAssessmentsAPI.getMyAssessments(controller.signal).then(({ data }) => {
      if (!Array.isArray(data.assessments)) throw new Error("Invalid assessments response");
      if (!controller.signal.aborted) setResult({ key: requestKey, items: data.assessments });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key: requestKey, items: [], failed: true });
    });
    return () => controller.abort();
  }, [authLoading, userKey, requestKey]);

  const current = result?.key === requestKey ? result : undefined;
  return <div id="your-assessments" className="space-y-5 border-t border-border pt-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs uppercase tracking-wider text-primary font-semibold">Your next challenge</p><h3 className="text-xl font-semibold mt-1">Your assessments</h3></div>
      <Link href="/assessments" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">View all assessments <ArrowRight className="w-4 h-4" /></Link>
    </div>
    {authLoading ? <p role="status" className="text-sm text-muted-foreground">Loading assessments…</p>
      : !user ? <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground"><Link href="/login" className="text-primary font-semibold">Sign in</Link> to see your assigned assessments.</p>
        : !current ? <p role="status" className="text-sm text-muted-foreground">Loading your assessments…</p>
          : current.failed ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-5"><p className="text-sm text-muted-foreground">Your assessments couldn’t be loaded. Please try again.</p><button type="button" onClick={() => setRetry(value => value + 1)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><RefreshCw className="h-4 w-4" />Try again</button></div>
            : current.items.length === 0 ? <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">No assessments assigned yet. Your next test will appear here.</p>
              : <div className="grid gap-4 md:grid-cols-3">{current.items.slice(0, 3).map(item => {
                const id = item.id || item._id;
                const status = assessmentCompleted(item) ? "Completed" : assessmentWindow(item);
                return <article key={id} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-muted-foreground">{item.code}</span><span className="rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground">{status}</span></div>
                  <h4 className="text-lg font-semibold">{item.title}</h4>
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.description || "A technical assessment assigned to your account."}</p>
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" /><span className="font-mono">{item.durationMinutes}</span> mins · <span className="font-mono">{item.questionCount}</span> questions</p>
                  <Link href={`/assessments/${id}`} className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-primary">{item.attemptStatus === "in_progress" ? "Review attempt" : status === "Completed" ? "View result" : "View assessment"}<ArrowRight className="h-4 w-4" /></Link>
                </article>;
              })}</div>}
  </div>;
}
