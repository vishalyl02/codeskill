"use client";

import { useState } from "react";
import { CircleCheck, CircleX, LoaderCircle, LockKeyhole, Minus } from "lucide-react";
import { normalizeVerdict, type ExecutionFeedbackResult } from "@/lib/submission-feedback";

type CaseResult = ExecutionFeedbackResult["results"][number];
type RunCase = { id: string; input: string; expected?: string };
export type MacSubmissionState = "saved" | "save_failed" | null;

const verdictLabels: Record<string, string> = {
  accepted: "Accepted",
  wrong_answer: "Wrong Answer",
  compile_error: "Compile Error",
  runtime_error: "Runtime Error",
  time_limit: "Time Limit Exceeded",
  memory_limit: "Memory Limit Exceeded",
  cancelled: "Execution Cancelled",
};

function OutputField({ label, value, compareWith }: { label: string; value?: string; compareWith?: string }) {
  const lines = compareWith === undefined || !value ? null : value.split("\n");
  const comparisonLines = compareWith?.split("\n");
  return (
    <div className="min-w-0 space-y-1.5">
      <h5 className="text-xs font-medium text-muted-foreground">{label}</h5>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/25 px-3 py-2.5 font-mono text-xs leading-relaxed">
        {lines ? lines.map((line, index) => (
          <span key={index} className={line !== comparisonLines?.[index] ? "bg-amber-500/20" : undefined}>
            {line}{index < lines.length - 1 ? "\n" : ""}
          </span>
        )) : value === undefined ? "Unavailable" : value || "(empty)"}
      </pre>
    </div>
  );
}

export function MacAssessmentExecutionResult({
  result, cases, mode, busy, submissionState, stale,
}: {
  result: ExecutionFeedbackResult | null;
  cases?: readonly RunCase[];
  mode: "run" | "submission";
  busy: boolean;
  submissionState: MacSubmissionState;
  stale: boolean;
}) {
  const [selection, setSelection] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);
  if (busy) {
    return (
      <p role="status" className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" />
        {mode === "submission" ? "Checking your submission…" : "Running your code…"}
      </p>
    );
  }
  if (!result) return <p className="py-2 text-sm text-muted-foreground">Run your code to see the results here.</p>;

  const verdict = normalizeVerdict(result.status);
  const isCompileError = verdict === "compile_error";
  const isAccepted = verdict === "accepted" || verdict === "success";
  const isSubmission = mode === "submission";
  const hasRuntime = !isCompileError && typeof result.runtime === "number" && Number.isFinite(result.runtime);
  const runResults = cases && result.results.length
    ? cases.map((runCase, index) => {
        const matching = result.results.find((test) => String(test.id ?? test.testId) === runCase.id)
          ?? (result.results.every((test) => test.id == null && test.testId == null) ? result.results[index] : undefined);
        return { test: matching, input: runCase.input, expected: runCase.expected };
      })
    : result.results.map((test) => ({ test, input: undefined, expected: undefined }));
  const firstFailure = runResults.findIndex(({ test }) => test && !test.passed);
  const activeIndex = selection ?? Math.max(0, firstFailure);
  const active = runResults[activeIndex];
  const test: CaseResult | undefined = active?.test;
  const privateCase = test && (test.isHidden || (isSubmission && test.isHidden !== false));
  const expected = active?.expected ?? test?.expected;
  const output = test?.output ?? test?.stdout;
  const canCompare = !privateCase && test && !test.passed
    && normalizeVerdict(test.status ?? verdict) === "wrong_answer" && output !== undefined && expected !== undefined;

  const diagnostics = isCompileError ? Array.from(new Set([
    ...(mode === "run" ? [result.compileOutput] : []),
    ...result.results.filter((item) => !item.isHidden && (!isSubmission || item.isHidden === false))
      .map((item) => item.error || item.stderr),
  ].filter((message): message is string => Boolean(message?.trim())))) : [];

  return (
    <section aria-label={isSubmission ? "Submission result" : "Run result"} className="space-y-3 p-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className={`text-lg font-semibold tracking-tight ${isAccepted ? "text-primary" : "text-rose-600 dark:text-rose-400"}`}>
          {isAccepted ? "Accepted" : verdictLabels[verdict] ?? "Execution unavailable"}
        </h3>
        {hasRuntime && <span className="text-xs tabular-nums text-muted-foreground">Runtime {Number(result.runtime!.toFixed(2))} ms</span>}
        {isSubmission && submissionState === "saved" && (
          <span role="status" className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <CircleCheck aria-hidden="true" className="size-3.5" /> Code submitted
          </span>
        )}
        {result.totalCount > 0 && !isCompileError && (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{result.passedCount}/{result.totalCount} passed</span>
        )}
      </div>
      {submissionState === "save_failed" && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">Couldn’t confirm the submission. Your draft is still in the editor.</p>}
      {result.message && <p role="status" className="text-xs text-muted-foreground">{result.message}</p>}
      {stale && <p className="text-xs text-muted-foreground">Showing results for the code last executed.</p>}

      {isCompileError ? (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-rose-500/20 bg-rose-500/8 px-4 py-3 font-mono text-xs leading-relaxed text-rose-700 dark:text-rose-300">
          {diagnostics.length ? diagnostics.join("\n\n") : "Compiler details are unavailable."}
        </pre>
      ) : runResults.length > 0 && (
        <>
          <div role="group" aria-label="Test case results" className="flex flex-wrap items-center gap-1.5">
            {runResults.map(({ test: caseResult }, index) => {
              const Icon = caseResult?.passed ? CircleCheck : caseResult ? CircleX : Minus;
              return (
                <button key={index} type="button" aria-pressed={activeIndex === index}
                  onClick={() => setSelection(index)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground aria-pressed:border-primary/30 aria-pressed:bg-primary/10 aria-pressed:text-foreground hover:bg-muted">
                  <Icon aria-label={caseResult?.passed ? "Passed" : caseResult ? "Failed" : "No result"}
                    className={`size-3.5 ${caseResult?.passed ? "text-primary" : caseResult ? "text-rose-600 dark:text-rose-400" : ""}`} />
                  {cases?.[index]?.id.startsWith("custom-") ? "Custom" : "Case"} {index + 1}
                </button>
              );
            })}
          </div>
          {privateCase ? (
            <p className="flex items-center gap-2 rounded-md border border-border bg-muted/25 p-3 text-xs text-muted-foreground">
              <LockKeyhole aria-hidden="true" className="size-3.5" /> Hidden test case. Input and output are private.
            </p>
          ) : active && (
            <section aria-label={`Case ${activeIndex + 1} details`} className="space-y-3">
              <OutputField label="Input" value={active.input ?? test?.input} />
              {canCompare && (
                <button type="button" aria-pressed={compare} onClick={() => setCompare((shown) => !shown)}
                  className="rounded-md border border-border px-2 py-1 text-xs font-medium text-primary hover:bg-muted">
                  Compare output
                </button>
              )}
              <div className={`grid gap-3 ${canCompare && compare ? "sm:grid-cols-2" : ""}`}>
                <OutputField label="Output" value={output} compareWith={canCompare && compare ? expected : undefined} />
                {expected !== undefined && (
                  <OutputField label="Expected output" value={expected} compareWith={canCompare && compare ? output : undefined} />
                )}
              </div>
              {(test?.error || test?.stderr) && <OutputField label="Execution message" value={test.error || test.stderr} />}
            </section>
          )}
        </>
      )}
    </section>
  );
}
