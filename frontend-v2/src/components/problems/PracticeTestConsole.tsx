"use client";
import { useEffect, useRef } from "react";
import { Plus, Trash2, CheckCircle2, AlertCircle, FlaskConical } from "lucide-react";
import type { PracticeCasesController } from "@/hooks/usePracticeTestCases";
import { normalizeVerdict, type ExecutionFeedbackResult } from "@/lib/submission-feedback";
import styles from "./WorkspaceEnhancements.module.css";

type Props = {
  controller: PracticeCasesController;
  selectedIndex: number;
  onSelect: (index: number) => void;
  onEdit: () => void;
  busy: boolean;
  result: (Pick<ExecutionFeedbackResult, "status" | "results"> & { logs?: string[] }) | null;
};
const normalize = (text: string) => text.replace(/\r\n/g, "\n").split("\n").map(line => line.trimEnd()).join("\n").trim();

export function PracticeTestConsole({ controller: c, selectedIndex, onSelect, onEdit, busy, result }: Props) {
  const custom = c.mode === "custom";
  const cases = custom ? c.customCases : c.samples;
  const index = Math.min(Math.max(0, selectedIndex), Math.max(0, cases.length - 1));
  const test = cases[index];
  const outcome = result?.results[index];
  const outputRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (busy || outcome) outputRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [busy, outcome]);
  const output = outcome?.output ?? outcome?.stdout ?? "";
  const error = outcome?.error || outcome?.stderr || "";
  const executionError = outcome?.status ? !["accepted", "wrong_answer"].includes(outcome.status) : Boolean(error);
  const compared = Boolean(test?.expected.trim());
  const matches = outcome && test && (custom ? normalize(output) === normalize(test.expected) : outcome.passed);
  const add = () => { onEdit(); onSelect(c.customCases.length); c.addCase(); };
  return <div className={styles.testConsole}>
    <div className={styles.testToolbar}>
      <div className={styles.segment} aria-label="Test source">
        <button type="button" disabled={busy} aria-pressed={!custom} onClick={() => { onSelect(0); c.setMode("samples"); }}>Samples <span>{c.samples.length}</span></button>
        <button type="button" disabled={busy} aria-pressed={custom} onClick={() => { onSelect(0); c.setMode("custom"); }}>Custom <span>{c.customCases.length}</span></button>
      </div>
      <button type="button" disabled={busy || c.customCases.length >= 10} onClick={add} className={styles.add}><Plus size={14} /> Add test</button>
    </div>
    <div className={styles.caseTabs} aria-label="Select test case">{cases.map((_, i) => <button key={i} type="button" aria-pressed={index === i} onClick={() => onSelect(i)}><span className={styles.caseDot} />{custom ? "Your test case" : "Case"} {i + 1}</button>)}</div>
    {!test ? <div className={styles.empty}><FlaskConical size={26} /><strong>No public sample tests yet</strong><p>Use the Custom tab to run your own input.</p><button type="button" disabled={busy} onClick={add}><Plus size={14} /> Add custom test</button></div> : <>
      <div className={styles.testHeading}>{custom ? <button type="button" disabled={busy} onClick={() => { onEdit(); c.removeCase(index); onSelect(Math.max(0, index - 1)); }} aria-label={`${c.customCases.length === 1 ? "Clear" : "Delete"} custom test ${index + 1}`}><Trash2 size={14} /> {c.customCases.length === 1 ? "Clear" : "Remove"}</button> : <button type="button" disabled={busy || c.customCases.length >= 10} onClick={() => { onEdit(); onSelect(c.customCases.length); c.addCase({ input: test.input, expected: test.expected }); }}>Copy to custom ↗</button>}</div>
      <div className={styles.testFields}>
        <label><span>Input <small>stdin</small></span>{custom ? <textarea aria-label={`Custom test ${index + 1} input`} value={test.input} maxLength={64000} disabled={busy} spellCheck={false} onChange={event => { onEdit(); c.updateCase(index, "input", event.target.value); }} placeholder="Enter input exactly as the problem specifies…" /> : <pre>{test.input || "(empty input)"}</pre>}</label>
        <label><span>Expected output {custom && <small>optional</small>}</span>{custom ? <textarea aria-label={`Custom test ${index + 1} expected output`} value={test.expected} maxLength={64000} disabled={busy} spellCheck={false} onChange={event => { onEdit(); c.updateCase(index, "expected", event.target.value); }} placeholder="Leave blank to inspect output without comparison" /> : <pre>{test.expected || "(empty output)"}</pre>}</label>
      </div>
      <div ref={outputRef} className={styles.actualOutput}>
        <div><span>Your output <small>stdout · last run</small></span>{outcome && <span className={`${styles.outcome} ${executionError || (compared && !matches) ? styles.bad : styles.good}`}>{executionError ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}{executionError ? "Execution error" : compared ? matches ? "Matches expected" : "Output differs" : "Executed"}</span>}</div>
        <pre aria-live="polite">{busy ? "Running your code…" : outcome ? output || "(no output)" : "Run your code to see its output here."}</pre>
        {error && <pre className={styles.error}>{error}</pre>}
      </div>
    </>}
    {result && result.results.length === 0 && <div role="alert" className={styles.error}>{result.logs?.join("\n") || `Execution could not complete (${result.status}).`}</div>}

  </div>;
}

export function PracticeRunStatus({ controller, result, busy }: Pick<Props, "controller" | "result" | "busy">) {
  if (busy) return <span className={styles.runStatus} role="status">Running tests…</span>;
  if (!result) return null;
  if (controller.mode === "custom" && controller.customCases.every(test => !test.input.trim() && !test.expected.trim())) return null;
  const custom = controller.mode === "custom";
  const cases = custom ? controller.customCases : controller.samples;
  const complete = cases.length > 0 && result.results.length === cases.length;
  const executed = complete && result.results.every(test => !test.error && !test.stderr && (!test.status || ["accepted", "wrong_answer"].includes(test.status)));
  const passed = executed && result.results.every((test, i) => custom ? Boolean(cases[i].expected.trim()) && normalize(test.output ?? test.stdout ?? "") === normalize(cases[i].expected) : test.passed);
  const comparedFailure = custom && result.results.some((test, i) => cases[i]?.expected.trim() && normalize(test.output ?? test.stdout ?? "") !== normalize(cases[i].expected));
  const text = passed ? custom ? "Custom test cases passed" : "Test cases passed" : executed && !comparedFailure && custom && cases.some(test => !test.expected.trim()) ? "Custom tests executed" : custom ? "Custom tests need attention" : "Tests need attention";
  return <span role="status" className={`${styles.runStatus} ${passed ? styles.good : executed && !comparedFailure ? "" : styles.bad}`}>{text}</span>;
}

export function SubmissionRunStatus({ status, busy }: { status: string; busy: boolean }) {
  const accepted = normalizeVerdict(status) === "accepted";
  return <span role="status" className={`${styles.runStatus} ${busy ? "" : accepted ? styles.good : styles.bad}`}>{busy ? "Judging…" : accepted ? "Accepted" : normalizeVerdict(status).replaceAll("_", " ")}</span>;
}
