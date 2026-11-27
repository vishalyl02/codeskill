"use client";

import { useId, type ReactNode } from "react";
import { Check, ChevronRight, LoaderCircle, Play, Plus, X } from "lucide-react";

type Sample = { input?: string; output?: string; expected?: string; explanation?: string };

interface MacAssessmentTestPanelProps {
  showResults: boolean;
  onShowResults: (show: boolean) => void;
  samples: readonly Sample[];
  customInputs: readonly string[];
  selectedSample: number;
  selectedCustom: number;
  showingCustom: boolean;
  onSelectCase: (kind: "sample" | "custom", index: number) => void;
  onAddCase: (input?: string) => void;
  onChangeInput: (input: string) => void;
  onRemoveCase: () => void;
  canAddCase: boolean;
  isRunning: boolean;
  isSubmitting: boolean;
  runCooldown: number;
  submitCooldown: number;
  onRun: () => void;
  onSubmit: () => void;
  children: ReactNode;
}

const caseClass = "shrink-0 rounded-md border border-transparent px-2.5 py-1.5 text-xs font-medium text-muted-foreground aria-pressed:border-primary/30 aria-pressed:bg-primary/10 aria-pressed:text-foreground hover:bg-muted";
const fieldClass = "min-w-0 rounded-md border border-border bg-muted/25 px-3 py-2.5 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]";

export function MacAssessmentTestPanel({
  showResults, onShowResults, samples, customInputs, selectedSample, selectedCustom,
  showingCustom, onSelectCase, onAddCase, onChangeInput, onRemoveCase, canAddCase,
  isRunning, isSubmitting, runCooldown, submitCooldown, onRun, onSubmit, children,
}: MacAssessmentTestPanelProps) {
  const id = useId();
  const sample = samples[selectedSample];
  const busy = isRunning || isSubmitting;

  return (
    <section aria-label="Assessment test console" className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <button type="button" aria-label="Run Code" title={runCooldown ? `Run available in ${runCooldown}s` : "Run code"}
          disabled={busy || runCooldown > 0} onClick={onRun}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
          {isRunning ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Play aria-hidden="true" className="size-3.5" />}
          Run
        </button>
        <button type="button" aria-label="Submit Solution" title={submitCooldown ? `Submit available in ${submitCooldown}s` : "Submit this solution"}
          disabled={busy || submitCooldown > 0} onClick={onSubmit}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {isSubmitting ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Check aria-hidden="true" className="size-3.5" />}
          Submit
        </button>
      </div>

      <div role="tablist" aria-label="Test console view" className="flex shrink-0 gap-3 border-b border-border px-3">
        {["Test Cases", "Results"].map((label, index) => {
          const resultsTab = index === 1;
          const active = showResults === resultsTab;
          return (
            <button key={label} id={`${id}-tab-${index}`} type="button" role="tab"
              aria-selected={active} aria-controls={`${id}-panel-${index}`} tabIndex={active ? 0 : -1}
              onClick={() => onShowResults(resultsTab)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                event.stopPropagation();
                const target = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
                onShowResults(target === 1);
                document.getElementById(`${id}-tab-${target}`)?.focus();
              }}
              className="border-b-2 border-transparent px-1 py-2 text-xs font-semibold text-muted-foreground aria-selected:border-primary aria-selected:text-foreground hover:text-foreground">
              {label}
            </button>
          );
        })}
      </div>

      {showResults ? (
        <div key="results" role="tabpanel" id={`${id}-panel-1`} aria-labelledby={`${id}-tab-1`}
          className="assessment-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {children}
        </div>
      ) : (
        <div key="cases" role="tabpanel" id={`${id}-panel-0`} aria-labelledby={`${id}-tab-0`}
          className="assessment-scroll min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
          <div role="group" aria-label="Test cases" className="flex flex-wrap items-center gap-1.5">
            {samples.map((_, index) => (
              <button key={index} type="button" aria-pressed={!showingCustom && selectedSample === index}
                className={caseClass} onClick={() => onSelectCase("sample", index)}>
                Case {index + 1}
              </button>
            ))}
            {customInputs.map((_, index) => (
              <button key={index} type="button" aria-pressed={showingCustom && selectedCustom === index}
                className={caseClass} onClick={() => onSelectCase("custom", index)}>
                Custom {index + 1}
              </button>
            ))}
            <button type="button" aria-label="Add case" title="Add a custom case" disabled={!canAddCase}
              className="grid size-7 shrink-0 place-items-center rounded-md border border-dashed border-border text-primary hover:bg-primary/10 disabled:opacity-50"
              onClick={() => onAddCase()}>
              <Plus aria-hidden="true" className="size-4" />
            </button>
          </div>

          {showingCustom ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`${id}-input`} className="text-xs font-medium">Custom case {selectedCustom + 1} input</label>
                {(samples.length > 0 || customInputs.length > 1) && (
                  <button type="button" aria-label={`Remove custom case ${selectedCustom + 1}`} onClick={onRemoveCase}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <X aria-hidden="true" className="size-3" /> Remove
                  </button>
                )}
              </div>
              <textarea id={`${id}-input`} value={customInputs[selectedCustom] ?? ""}
                onChange={(event) => onChangeInput(event.target.value)}
                rows={4} spellCheck={false} placeholder="Enter standard input"
                className={`${fieldClass} w-full resize-y focus-visible:outline-2 focus-visible:outline-primary`} />
            </div>
          ) : sample && (
            <div className="space-y-3">
              <div className="flex items-center justify-end">
                <button type="button" disabled={!canAddCase} onClick={() => onAddCase(sample.input ?? "")}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50">
                  Use as custom <ChevronRight aria-hidden="true" className="size-3" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <p className="text-xs font-medium">Input</p>
                  <pre className={fieldClass}>{sample.input || "(empty)"}</pre>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <p className="text-xs font-medium">Expected output</p>
                  <pre className={fieldClass}>{sample.expected ?? sample.output ?? "(empty)"}</pre>
                </div>
              </div>
              {sample.explanation && <p className="text-xs leading-relaxed text-muted-foreground">{sample.explanation}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
