"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  LockKeyhole,
  LoaderCircle,
  ChevronRight,
} from "lucide-react";
import {
  ExecutionFeedbackResult,
  normalizeVerdict,
  PeerMetric,
} from "@/lib/submission-feedback";

const verdicts: Record<string, string> = {
  accepted: "Accepted",
  wrong_answer: "Wrong answer",
  compile_error: "Compilation error",
  runtime_error: "Runtime error",
  time_limit: "Time limit exceeded",
  memory_limit: "Memory limit exceeded",
  system_error: "Execution unavailable",
  error: "Execution unavailable",
  cancelled: "Submission cancelled",
};

function Metric({
  label,
  value,
  peer,
  description,
}: {
  label: string;
  value: string;
  peer?: PeerMetric | null;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {peer
          ? `${description} ${peer.percentile}% · ${peer.sampleSize} ${peer.sampleSize === 1 ? "student" : "students"}`
          : "Comparison unavailable"}
      </p>
    </div>
  );
}

export default function ExecutionFeedback({
  result,
  phase,
  mode,
  context,
  language,
}: {
  result: ExecutionFeedbackResult | null;
  phase?: string | null;
  mode: "run" | "submission";
  context: "practice" | "assessment";
  language: string;
}) {
  const [selection, setSelection] = useState(0);
  if (phase)
    return (
      <div
        role="status"
        aria-live="polite"
      className="space-y-5 rounded-xl border border-border bg-card p-5 font-sans text-foreground"
      >
        <div className="flex items-center gap-3">
          <LoaderCircle className="size-5 animate-spin text-primary" />
          <div>
            <p className="text-sm font-semibold">
              {phase === "queued" || phase === "pending"
                ? "Waiting for a judge"
                : mode === "submission"
                  ? "Judging your submission"
                  : "Running your code"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {mode === "submission"
                ? "Checking all test cases, including hidden cases."
                : "Checking sample tests or your custom input."}
            </p>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{language}</span>
          <ChevronRight className="size-3" />
          <span>Queued</span>
          <ChevronRight className="size-3" />
          <span>Executing</span>
          <ChevronRight className="size-3" />
          <span>Verdict</span>
        </div>
      </div>
    );
  if (!result)
    return (
      <p className="py-8 text-center font-sans text-xs text-muted-foreground">
        Run your code to check samples, or submit for the full verdict.
      </p>
    );

  const accepted = normalizeVerdict(result.status) === "accepted";
  const cases =
    mode === "submission" && context === "practice"
      ? result.results.filter((test) => !test.passed)
      : result.results;
  const selected = cases[selection] || cases[0];
  const privateCase = context === "assessment" && selected?.isHidden === true;
  const score = result.comparison?.score;
  const percentage =
    result.totalCount > 0
      ? Math.round((result.passedCount / result.totalCount) * 100)
      : 0;
  return (
    <section
      aria-label={mode === "submission" ? "Submission result" : "Run result"}
      className="space-y-4 rounded-xl border border-border bg-background p-4 font-sans text-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className={`flex items-center gap-2 ${accepted ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
        >
          {accepted ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <XCircle className="size-5" />
          )}
          <h3 className="text-lg font-semibold tracking-tight">
            {mode === "run" && accepted
              ? "Run successful"
              : verdicts[normalizeVerdict(result.status)] ||
                "Execution finished"}
          </h3>
        </div>
        <span className="rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
          {mode === "submission" ? "Full submission" : "Sample / custom run"}
        </span>
      </div>
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium">Test cases passed</span>
          <span className="font-semibold tabular-nums">
            {result.passedCount} / {result.totalCount}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Test cases passed"
          aria-valuemin={0}
          aria-valuemax={result.totalCount || 1}
          aria-valuenow={result.passedCount}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={`h-full rounded-full ${accepted ? "bg-emerald-500" : "bg-amber-500"}`}
            style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
          />
        </div>
        {score && (
          <p className="mt-2 text-xs text-muted-foreground">
            More test cases passed than {score.percentile}% of{" "}
            {score.sampleSize} other{" "}
            {score.sampleSize === 1 ? "candidate" : "candidates"}.
          </p>
        )}
      </div>
      {mode === "submission" && context === "assessment" && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
          Hidden inputs and outputs stay private. Candidate comparisons use the
          latest graded attempts for this question and test count.
        </p>
      )}
      {result.compileOutput && (context === "practice" || mode === "run") && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs">
          {result.compileOutput}
        </pre>
      )}
      {result.message && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {result.message}
        </p>
      )}
      {!!cases.length && (
        <div className="space-y-3">
          <div
            className="flex flex-wrap gap-1.5"
            aria-label="Test case results"
          >
            {cases.map((test, index) => (
              <button
                key={context === "assessment" ? index : test.id ?? test.testId ?? index}
                onClick={() => setSelection(index)}
                aria-pressed={selected === test}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${selected === test ? "border-primary/50 bg-primary/5" : "border-border bg-card"} ${test.passed ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
              >
                {test.passed ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  <XCircle className="size-3.5" />
                )}
                {context === "assessment" ? `Test Case ${index + 1}` : `Case ${test.id ?? test.testId ?? index + 1}`}
                {test.isHidden && (
                  <LockKeyhole aria-label="Hidden test" className="size-3" />
                )}
              </button>
            ))}
          </div>
          {selected &&
            (privateCase ? (
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
                Hidden test case ·{" "}
                {selected.passed
                  ? "Passed"
                  : verdicts[
                      normalizeVerdict(selected.status || "wrong_answer")
                    ] || "Failed"}
                . Details are private.
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-border bg-card p-3">
                {(
                  [
                    ["Input", selected.input],
                    ["Your output", selected.output ?? selected.stdout],
                    ["Expected output", selected.expected],
                    [
                      "Compiler / runtime message",
                      selected.error ?? selected.stderr,
                    ],
                  ] as const
                ).map(
                  ([label, value]) =>
                    value !== undefined && (
                      <div key={label}>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                          {label}
                        </p>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2.5 font-mono text-xs">
                          {value || "(empty)"}
                        </pre>
                      </div>
                    ),
                )}
              </div>
            ))}
        </div>
      )}
      {accepted && mode === "submission" && context === "practice" && (
        <p className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          All test cases passed. No failing cases to inspect.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Metric
          label="Runtime · total"
          value={
            Number.isFinite(result.runtime)
              ? `${Number(result.runtime!.toFixed(2))} ms`
              : "Unavailable"
          }
          peer={mode === "submission" ? result.comparison?.runtime : null}
          description="Faster than"
        />
        <Metric
          label="Memory · peak"
          value={
            Number.isFinite(result.memory)
              ? `${Number(result.memory!.toFixed(2))} MB`
              : "Unavailable"
          }
          peer={mode === "submission" ? result.comparison?.memory : null}
          description="Less memory than"
        />
      </div>
      {mode === "submission" && context === "practice" && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Comparisons use each other student’s best accepted result for this
          problem, language, and test count. Ties are not counted as beaten.
        </p>
      )}
    </section>
  );
}
