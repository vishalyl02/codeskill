"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import LockdownLaunchGate from "@/components/assessment/LockdownLaunchGate";
import { Spinner } from "@/components/ui/spinner";
import { adminAssessmentsAPI } from "@/config/api";
import { requiresAssessmentLockdown } from "@/lib/assessment-cards";

type PreviewAssessment = Parameters<typeof requiresAssessmentLockdown>[0] & {
  title: string;
  description?: string;
  code?: string;
  durationMinutes: number;
  totalMarks: number;
  instructions?: string[] | string;
};

type PreviewState =
  | { id: string; assessment: PreviewAssessment }
  | { id: string; error: string; canRetry: boolean };

export default function AdminAssessmentPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<PreviewState>();
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadPreview() {
      try {
        const response = await adminAssessmentsAPI.getById(id);
        const assessment = response.data?.assessment as PreviewAssessment | undefined;
        if (!assessment?.title) throw new Error("Assessment details are missing.");
        if (active) setResult({ id, assessment });
      } catch (error: unknown) {
        if (!active) return;
        const status = (error as { response?: { status?: number } })?.response?.status;
        const message = status === 404
          ? "This assessment could not be found."
          : status === 403
            ? "Your admin account does not have access to this assessment."
            : status === 401
              ? "Your admin session has expired."
              : "The assessment preview could not be loaded.";
        setResult({ id, error: message, canRetry: status !== 404 && status !== 403 });
      }
    }
    void loadPreview();
    return () => { active = false; };
  }, [id, retry]);

  const current = result?.id === id ? result : undefined;
  const assessment = current && "assessment" in current ? current.assessment : undefined;
  const needsLockdown = assessment ? requiresAssessmentLockdown(assessment) : false;
  const instructions = (
    Array.isArray(assessment?.instructions)
      ? assessment.instructions
      : assessment?.instructions?.split("\n") ?? []
  ).map((instruction) => instruction.trim()).filter(Boolean);

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/admin/assessments" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to Assessments
        </Link>
        <p className="text-sm text-muted-foreground">
          {needsLockdown ? "Admin preview · Launch opens the LockDown system check." : "Read-only admin preview"}
        </p>
      </div>

      {!current ? (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm">
          <Spinner aria-hidden="true" className="size-4 text-primary" />
          Loading assessment preview…
        </div>
      ) : "error" in current ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <p role="alert" className="text-sm">{current.error}</p>
          {current.canRetry && (
            <button
              type="button"
              onClick={() => { setResult(undefined); setRetry((value) => value + 1); }}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Try again
            </button>
          )}
        </div>
      ) : needsLockdown ? (
        <LockdownLaunchGate examId={id} examTitle={current.assessment.title} preview />
      ) : (
        <section className="space-y-5 rounded-2xl border border-border bg-card p-5 text-card-foreground sm:p-7">
          <div className="space-y-2">
            <h1 className="break-words text-2xl font-semibold tracking-tight">{current.assessment.title}</h1>
            {current.assessment.description && <p className="whitespace-pre-line break-words text-sm leading-relaxed">{current.assessment.description}</p>}
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              ["Assessment code", current.assessment.code],
              ["Duration", `${current.assessment.durationMinutes} minutes`],
              ["Total marks", current.assessment.totalMarks],
            ].map(([label, value]) => value == null ? null : (
              <div key={label} className="rounded-lg border border-border bg-background p-3">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {instructions.length > 0 && (
            <div className="space-y-2 border-t border-border pt-4">
              <h2 className="font-semibold">Assessment instructions</h2>
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
                {instructions.map((instruction, index) => <li key={index}>{instruction}</li>)}
              </ol>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
