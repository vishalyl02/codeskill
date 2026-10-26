"use client";
import { useMemo, useState } from "react";
import { publicProblemRunCases } from "@/lib/problem-run-cases";

export type TestMode = "samples" | "custom";
export type CustomCase = { input: string; expected: string };
type Draft = { mode: TestMode; cases: CustomCase[] };
const EMPTY: Draft = { mode: "samples", cases: [{ input: "", expected: "" }] };
export function usePracticeTestCases(problem: Parameters<typeof publicProblemRunCases>[0], problemId: string) {
  const samples = useMemo(() => publicProblemRunCases(problem), [problem]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draft = drafts[problemId] ?? EMPTY;
  const edit = (update: (current: Draft) => Draft) => setDrafts(previous => ({ ...previous, [problemId]: update(previous[problemId] ?? EMPTY) }));
  const runCases = useMemo(() => draft.mode === "samples" ? samples : draft.cases.map((test, index) => ({ ...test, id: index + 1 })), [draft.mode, draft.cases, samples]);
  return {
    samples, mode: draft.mode, customCases: draft.cases, runCases,
    setMode: (mode: TestMode) => edit(current => ({ ...current, mode, cases: mode === "custom" && current.cases.length === 0 ? [{ input: "", expected: "" }] : current.cases })),
    addCase: (sample?: CustomCase) => edit(current => {
      if (current.cases.length >= 10) return current;
      const unusedFirstCase = current.mode === "samples" && current.cases.length === 1 && !current.cases[0].input && !current.cases[0].expected;
      return { mode: "custom", cases: unusedFirstCase ? [sample ?? current.cases[0]] : [...current.cases, sample ?? { input: "", expected: "" }] };
    }),
    updateCase: (index: number, field: keyof CustomCase, value: string) => edit(current => ({ ...current, cases: current.cases.map((test, i) => i === index ? { ...test, [field]: value } : test) })),
    removeCase: (index: number) => edit(current => ({ ...current, cases: current.cases.length === 1 ? [{ input: "", expected: "" }] : current.cases.filter((_, i) => i !== index) })),
  };
}
export type PracticeCasesController = ReturnType<typeof usePracticeTestCases>;
