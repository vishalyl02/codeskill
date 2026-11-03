"use client";

import { useExecutionRuntimes } from "@/hooks/useExecutionRuntimes";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { ResizableAssessmentPanels } from "./ResizableAssessmentPanels";
import { useTheme } from "@/context/ThemeContext";
const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
import {
  Play,
  CheckCircle2,
  XCircle,
  Terminal,
  Code2,
  ChevronDown,
  RotateCcw,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Cpu,
  Layers,
  Sparkles,
  Send,
  HelpCircle,
} from "lucide-react";
import { runAPI, studentAssessmentsAPI } from "@/config/api";
import { awaitExecution } from "@/lib/await-execution";
import ExecutionFeedback from '@/components/Result/ExecutionFeedback';
import { hasSampleContent } from '@/components/problems/SampleTestCasesPanel';
import { Spinner } from "@/components/ui/spinner";
import { canonicalEditorLanguage, questionStarterCode } from "@/lib/editor-languages";
import { hideEntryPoint, moveInsertionOffset, restoreEntryPoint } from "@/lib/hidden-entry-point";

const LANGUAGES = [
  { value: "python", label: "Python 3", ext: "py" },
  { value: "cpp", label: "C++ (GCC)", ext: "cpp" },
  { value: "java", label: "Java (OpenJDK)", ext: "java" },
  { value: "javascript", label: "JavaScript (Node.js)", ext: "js" },
  { value: "c", label: "C (Clang)", ext: "c" },
  { value: "go", label: "Go", ext: "go" },
];

const DEFAULT_STARTER_CODE: Record<string, string> = {
  python: `import sys

def solve():
    """
    Read input from standard input (sys.stdin)
    and print the output to standard output (print)
    """
    input_data = sys.stdin.read().split()
    if not input_data:
        return

    # Write your solution logic here
    print(" ".join(input_data))

if __name__ == "__main__":
    solve()
`,
  cpp: `#include <iostream>
#include <vector>
#include <string>
#include <algorithm>

using namespace std;

int main() {
    // Fast I/O
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    // Read input from standard input (cin)
    string token;
    while (cin >> token) {
        // Write your solution logic here
        cout << token << " ";
    }
    cout << "\\n";

    return 0;
}
`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        
        // Read input from standard input (System.in)
        while (scanner.hasNext()) {
            String token = scanner.next();
            // Write your solution logic here
            System.out.print(token + " ");
        }
        System.out.println();
        scanner.close();
    }
}
`,
  javascript: `const fs = require('fs');

function main() {
    // Read input from standard input (stdin)
    const input = fs.readFileSync(0, 'utf-8').trim();
    if (!input) return;

    // Write your solution logic here
    console.log(input);
}

main();
`,
  c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main() {
    char buffer[1024];

    // Read input from standard input (stdin)
    while (scanf("%1023s", buffer) == 1) {
        // Write your solution logic here
        printf("%s ", buffer);
    }
    printf("\\n");

    return 0;
}
`,
  go: `package main

import (
    "bufio"
    "fmt"
    "os"
)

func main() {
    scanner := bufio.NewScanner(os.Stdin)
    // Read input from standard input
    for scanner.Scan() {
        // Write your solution logic here
        fmt.Println(scanner.Text())
    }
}
`,
};

interface TestCase {
  id?: string;
  input: string;
  output?: string;
  expected?: string;
  explanation?: string;
  isHidden?: boolean;
}

interface DSAAssessmentEditorProps {
  assessmentId: string;
  readingScale?: number;
  question: {
    _id: string;
    questionIndex: number;
    question: string;
    description?: string;
    topic: string;
    subtopic?: string;
    difficulty: string;
    marks: number;
    starterCode?: string | Array<{ language: string; code: string }> | Record<string, string>;
    codeSnippet?: string;
    language?: string;
    supportedLanguages?: string[];
    hideMainMethod?: boolean;
    sectionTitle?: string;
    constraints?: string | string[];
    timeLimit?: number;
    memoryLimit?: number;
    testCases?: TestCase[];
  };
  savedResponse?: {
    code?: string;
    language?: string;
    codeByLanguage?: Record<string, string>;
    testCasesPassed?: number;
    totalTestCases?: number;
    status?: string;
  };
  onDraftChange?: (code: string, language: string, codeByLanguage?: Record<string, string>) => void;
  onSave: (code: string, language: string, testCasesPassed: number, totalTestCases: number) => void | Promise<void>;
  onNext?: () => void;
  isLastQuestion?: boolean;
  blockCopyPaste?: boolean;
}

export default function DSAAssessmentEditor({
  assessmentId,
  question,
  readingScale = 1,
  savedResponse,
  onSave,
  onDraftChange,
  onNext,
  isLastQuestion = false,
  blockCopyPaste = true,
}: DSAAssessmentEditorProps) {
  const { resolvedTheme } = useTheme();
  const executionRuntimes = useExecutionRuntimes();

  const supportedLanguagesList =
    question.supportedLanguages && question.supportedLanguages.length > 0
      ? question.supportedLanguages
      : Array.isArray(question.starterCode) && question.starterCode.length > 0
        ? question.starterCode.map((s) => s.language)
        : typeof question.starterCode === "object" && question.starterCode !== null
          ? Object.keys(question.starterCode)
          : [];

  const isLanguageAllowed = (lang: string) => {
    const canonical = canonicalEditorLanguage(lang);
    const matchesSupported =
      !supportedLanguagesList.length ||
      supportedLanguagesList.some(
        (value) => canonicalEditorLanguage(value) === canonical,
      );
    const matchesRuntime =
      !executionRuntimes.length ||
      executionRuntimes.some(
        (runtime) =>
          canonicalEditorLanguage(runtime.language) === canonical &&
          runtime.enabled,
      );
    return matchesSupported && matchesRuntime;
  };

  const initialLang = (() => {
    // 1. The candidate's explicitly saved local preference for this specific question
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`codeskill_lang_q_${question._id}`);
      if (saved && isLanguageAllowed(saved)) return canonicalEditorLanguage(saved);
    }
    // 2. Saved response code if the candidate actually wrote/saved code for this question
    if (savedResponse?.code && savedResponse?.language && isLanguageAllowed(savedResponse.language)) {
      return canonicalEditorLanguage(savedResponse.language);
    }
    // 3. Question author's configured default language
    const canonicalQuestionLang = question.language ? canonicalEditorLanguage(question.language) : undefined;
    if (canonicalQuestionLang && isLanguageAllowed(canonicalQuestionLang)) {
      return canonicalQuestionLang;
    }
    // 4. First language from starterCode that has code and is allowed
    if (Array.isArray(question.starterCode)) {
      const entry = question.starterCode.find((s) => s.code?.trim() && isLanguageAllowed(s.language));
      if (entry) return canonicalEditorLanguage(entry.language);
    } else if (typeof question.starterCode === "object" && question.starterCode !== null) {
      const entry = Object.entries(question.starterCode).find(
        ([lang, code]) => typeof code === "string" && code.trim() && isLanguageAllowed(lang),
      );
      if (entry) return canonicalEditorLanguage(entry[0]);
    }
    // 5. First language from supportedLanguages
    if (supportedLanguagesList.length > 0) {
      const firstSupported = supportedLanguagesList.find((l) => isLanguageAllowed(l));
      if (firstSupported) return canonicalEditorLanguage(firstSupported);
    }
    // 6. Python if allowed
    if (isLanguageAllowed("python")) {
      return "python";
    }
    // 7. First allowed in general
    const firstAllowed = LANGUAGES.find((l) => isLanguageAllowed(l.value))?.value;
    return firstAllowed || "python";
  })();
  const [language, setLanguage] = useState(initialLang);

  const getQuestionStarterCode = (lang: string): string | undefined => {
    const starter = questionStarterCode(question.starterCode, lang, question.language);
    if (starter !== undefined && starter.trim().length > 0) return starter;
    if (
      question.codeSnippet &&
      (!question.language || canonicalEditorLanguage(question.language) === canonicalEditorLanguage(lang))
    ) {
      return question.codeSnippet;
    }
    return undefined;
  };

  // Initialize code from saved response, or question starterCode, or language template
  const getInitialCode = (lang: string) => {
    const languageDraft = Object.entries(savedResponse?.codeByLanguage || {}).find(
      ([savedLanguage]) => canonicalEditorLanguage(savedLanguage) === canonicalEditorLanguage(lang),
    )?.[1];
    if (languageDraft !== undefined && languageDraft.trim().length > 0) return languageDraft;
    if (savedResponse?.code !== undefined && savedResponse.code.trim().length > 0) {
      if (!savedResponse.language || canonicalEditorLanguage(savedResponse.language) === canonicalEditorLanguage(lang)) {
        return savedResponse.code;
      }
    }
    const starterCode = getQuestionStarterCode(lang);
    if (starterCode !== undefined && starterCode.trim().length > 0) return starterCode;
    return DEFAULT_STARTER_CODE[lang] || DEFAULT_STARTER_CODE.python;
  };

  const [code, setCode] = useState(() => getInitialCode(initialLang));
  const [codeByLang, setCodeByLang] = useState<Record<string, string>>(() => {
    const initMap = Object.fromEntries(
      Object.entries(savedResponse?.codeByLanguage || {}).map(([savedLanguage, value]) => [canonicalEditorLanguage(savedLanguage), value]),
    );
    initMap[canonicalEditorLanguage(initialLang)] = getInitialCode(initialLang);
    return initMap;
  });
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [selectedTestCaseIndex, setSelectedTestCaseIndex] = useState(0);
  const [customInput, setCustomInput] = useState(() => question.testCases?.find(tc => !tc.isHidden)?.input || "");
  const [bottomTab, setBottomTab] = useState<"testcases" | "custom_input" | "output">("testcases");

  // Runner execution state
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const [resultMode, setResultMode] = useState<'run' | 'submission'>('run');
  const [copied, setCopied] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);
  const activeExecutionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (savedResponse?.language && !isLanguageAllowed(savedResponse.language)) {
      onDraftChange?.(code, initialLang, codeByLang);
    }
  }, []);

  const editorRef = useRef<any>(null);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  // Clean up Monaco models when question switches or component unmounts to prevent memory accumulation
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        try {
          const model = editorRef.current.getModel();
          if (model && !model.isDisposed()) {
            model.dispose();
          }
        } catch {
          // Ignore disposal errors on unmount
        }
      }
    };
  }, [question._id]);



  // Normalize test cases from question
  const sampleCases: TestCase[] = (question.testCases || []).filter(
    (tc) => !tc.isHidden && hasSampleContent(tc),
  );

  const shouldHideEntryPoint = Boolean(question.hideMainMethod);

  // The parent keys this workspace by question ID. Drafts are restored from
  // attempt state on each mount; saving does not reset the active editor model.
  const updateCode = (value: string) => {
    const hiddenEntryPoint = shouldHideEntryPoint ? hideEntryPoint(code, language) : undefined;
    const nextCode = hiddenEntryPoint
      ? restoreEntryPoint(
          value,
          hiddenEntryPoint.hiddenCode,
          moveInsertionOffset(hiddenEntryPoint.visibleCode, value, hiddenEntryPoint.insertionOffset),
        )
      : value;
    setCode(nextCode);
    const next = { ...codeByLang, [canonicalEditorLanguage(language)]: nextCode };
    setCodeByLang(next);
    setRunResult(null);
    onDraftChange?.(nextCode, language, next);
  };

  // Language switch handler - caches previous language code and retrieves/generates new language boilerplate
  const handleLanguageChange = (newLang: string) => {
    if (newLang === language) {
      setShowLangDropdown(false);
      return;
    }

    // Save current code to cache for active language
    const activeLanguage = canonicalEditorLanguage(language);
    const targetLanguage = canonicalEditorLanguage(newLang);
    const updatedCache = { ...codeByLang, [activeLanguage]: code };

    // Determine target code for new language
    let targetCode = updatedCache[targetLanguage];
    if (!targetCode || targetCode.trim().length === 0) {
      const starterCode = getQuestionStarterCode(newLang);
      if (starterCode !== undefined && starterCode.trim().length > 0) {
        targetCode = starterCode;
      } else {
        targetCode = DEFAULT_STARTER_CODE[newLang] || DEFAULT_STARTER_CODE.python;
      }
      updatedCache[targetLanguage] = targetCode;
    }

    setCodeByLang(updatedCache);
    setCode(targetCode);
    setLanguage(newLang);
    try {
      localStorage.setItem(`codeskill_lang_q_${question._id}`, newLang);
    } catch {
      // Preference persistence must never block the language switch.
    }
    onDraftChange?.(targetCode, newLang, updatedCache);
    setShowLangDropdown(false);
    setRunResult(null);

    const langObj = LANGUAGES.find((l) => l.value === newLang);
    setSaveSuccessNotice(`Switched to ${langObj?.label || newLang}. Ready to compile.`);
    setTimeout(() => setSaveSuccessNotice(null), 2500);
  };

  // Reset starter code
  const handleResetCode = (forceDefault: boolean = false) => {
    const starterCode = getQuestionStarterCode(language);
    const template =
      !forceDefault && starterCode !== undefined && starterCode.trim().length > 0
        ? starterCode
        : (DEFAULT_STARTER_CODE[language] || DEFAULT_STARTER_CODE.python);
    const targetLang = canonicalEditorLanguage(language);
    const updatedCache = { ...codeByLang, [targetLang]: template };

    setCode(template);
    setCodeByLang(updatedCache);
    onDraftChange?.(template, language, updatedCache);
    setRunResult(null);
    const langLabel = LANGUAGES.find((l) => l.value === language)?.label || language;
    setSaveSuccessNotice(
      starterCode && !forceDefault
        ? `Starter code for ${langLabel} restored.`
        : `Boilerplate template for ${langLabel} restored.`
    );
    setTimeout(() => setSaveSuccessNotice(null), 3000);
  };

  // Copy code
  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const editorCode = shouldHideEntryPoint ? (hideEntryPoint(code, language)?.visibleCode ?? code) : code;
  const lineCount = Math.max(1, editorCode.split("\n").length);

  // Run Test (Single or Sample cases)
  const handleRunTest = async () => {
    if (isRunning || isSubmitting) return;
    const executionId = crypto.randomUUID();
    activeExecutionIdRef.current = executionId;
    setIsRunning(true);
    setResultMode('run');
    setBottomTab("output");
    setRunResult(null); // Clear previous result immediately

    try {
      if (bottomTab === "custom_input") {
        // Run with custom stdin against the judge; a clean run is reported
        // as accepted because no expected output is configured.
        const res = await awaitExecution(
          () => runAPI.run({
            code,
            language,
            executionId,
            testCases: [{ id: "run", input: customInput || "", expected: "" }],
            config: {
              customInput: true,
              timeLimit: (question.timeLimit || 2000) * 2,
              memoryLimit: question.memoryLimit || 256,
            },
          }),
          (jobId) => runAPI.getJob(jobId),
        );
        if (activeExecutionIdRef.current === executionId) {
          setRunResult(res.data);
        }
      } else if (sampleCases.length > 0) {
        // Run against all sample test cases through the judge
        const payloadTestCases = sampleCases.map((tc, idx) => ({
          id: tc.id || String(idx + 1),
          input: tc.input || "",
          expected: tc.expected || tc.output || "",
        }));

        const res = await awaitExecution(
          () => runAPI.run({
            code,
            language,
            executionId,
            testCases: payloadTestCases,
            config: {
              timeLimit: question.timeLimit || 12000,
              memoryLimit: question.memoryLimit || 256,
            },
          }),
          (jobId) => runAPI.getJob(jobId),
        );
        if (activeExecutionIdRef.current === executionId) {
          setRunResult(res.data);
        }
      } else {
        // Run without testcases
        const res = await awaitExecution(
          () => runAPI.run({
            code,
            language,
            executionId,
            testCases: [{ id: "run", input: customInput || "", expected: "" }],
            config: {
              customInput: true,
              timeLimit: question.timeLimit || 8000,
              memoryLimit: question.memoryLimit || 256,
            },
          }),
          (jobId) => runAPI.getJob(jobId),
        );
        if (activeExecutionIdRef.current === executionId) {
          setRunResult(res.data);
        }
      }
    } catch (err: any) {
      if (activeExecutionIdRef.current === executionId) {
        setRunResult({
          status: 'system_error', passedCount: 0, totalCount: 0, results: [],
          message: err.response?.data?.message || err.message || 'Failed to execute code',
        });
      }
    } finally {
      if (activeExecutionIdRef.current === executionId) {
        setIsRunning(false);
      }
    }
  };

  // Verification and progress saving have separate failure states. Code remains
  // in attempt state even if the runner or progress endpoint is unavailable.
  const handleSubmitSolution = async () => {
    if (isRunning || isSubmitting) return;
    setIsSubmitting(true);
    setRunResult(null);
    setResultMode('submission');
    setBottomTab("output");
    let passed = 0;
    let total = 0;
    let verified = false;
    try {
      const res = await studentAssessmentsAPI.evaluateCode(assessmentId, { questionId: question._id, code, language });
      const data = res.data;
      setRunResult(data);
      passed = data.passedCount ?? data.results?.filter((result: any) => result.passed).length ?? 0;
      total = data.totalCount ?? data.results?.length ?? 0;
      verified = true;
    } catch (err: any) {
      setRunResult({ status: 'system_error', results: [], passedCount: 0, totalCount: 0,
        message: err.response?.data?.message || err.message || 'Execution unavailable' });
    }
    try {
      await onSave(code, language, passed, total);
      setSaveSuccessNotice(verified
        ? `Solution saved. Passed ${passed} of ${total} test cases. Final grading runs on the server.`
        : "Code saved. Execution could not be verified; try running it again.");
    } catch {
      setSaveSuccessNotice("Code kept in this session. Server save failed; please try Submit Solution again.");
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSaveSuccessNotice(null), 5000);
    }
  };

  const resultsList = runResult?.results || (runResult?.result ? [runResult.result] : []);
  const allPassed =
    resultsList.length > 0 && resultsList.every((r: any) => r.passed || r.status === "accepted" || r.status === "success");

  return (
    <ResizableAssessmentPanels initialSize={42} className="gap-0">
      {/* ─────────────────────────────────────────────────────────── */}
      {/* LEFT PANE: Problem Statement, Constraints, Sample Cases     */}
      {/* ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Problem Header Ribbon */}
        <div className="p-4 sm:p-5 border-b border-border bg-muted/20 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5" /> Algorithmic Coding
            </span>
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase border ${
                question.difficulty === "hard"
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                  : question.difficulty === "medium"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              }`}
            >
              {question.difficulty || "medium"}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">+{question.marks || 5} marks</span>
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3 text-primary" /> {question.timeLimit ? `${question.timeLimit / 1000}s` : "2.0s"}
            </span>
          </div>
        </div>

        {/* Problem Description Body */}
        <div style={{ zoom: readingScale }} className="assessment-scroll flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto overscroll-contain space-y-6 text-sm">
          {/* Title */}
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight leading-snug">
              {question.question.split("\n")[0]}
            </h2>
            {question.question.includes("\n") && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-foreground/85">{question.question.split("\n").slice(1).join("\n").trim()}</p>}
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              {question.sectionTitle && (
                <span className="rounded-md bg-secondary text-secondary-foreground px-2 py-0.5 text-[11px] font-semibold border border-border">
                  {question.sectionTitle}
                </span>
              )}
              <span>{question.topic}</span>
              {question.subtopic && <span>• {question.subtopic}</span>}
            </div>
          </div>

          {question.description?.trim() && (
            <section aria-label="Problem description" className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Problem description</h3>
              <div className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90">{question.description}</div>
            </section>
          )}

          {/* Constraints Card */}
          <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Cpu className="w-3.5 h-3.5 text-primary" /> Constraints & Limits
            </div>
            <div className="text-xs text-foreground font-mono space-y-1">
              <div>• Time Limit: {question.timeLimit ? `${question.timeLimit / 1000}s` : "2.0 seconds"}</div>
              <div>• Memory Limit: {question.memoryLimit ? `${question.memoryLimit}MB` : "256 MB"}</div>
              {question.constraints && (
                <div className="text-muted-foreground whitespace-pre-line pt-1">
                  {Array.isArray(question.constraints) ? question.constraints.join("\n") : question.constraints}
                </div>
              )}
            </div>
          </div>

          {/* Example Test Cases (LeetCode Style) */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-primary" /> Examples & Test Cases
            </h3>

            {sampleCases.length > 0 ? (
              sampleCases.map((tc, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-muted/30 p-4 space-y-2.5 font-mono text-xs"
                >
                  <div className="font-sans font-bold text-foreground text-xs flex items-center justify-between">
                    <span>Example {idx + 1}</span>
                    <button
                      onClick={() => {
                        setSelectedTestCaseIndex(idx);
                        setCustomInput(tc.input);
                        setBottomTab("testcases");
                      }}
                      className="text-[11px] text-primary hover:underline font-mono"
                    >
                      Load in Console
                    </button>
                  </div>

                  <div>
                    <span className="text-muted-foreground font-semibold">Input:</span>
                    <pre className="mt-1 p-2.5 rounded-lg bg-background border border-border text-foreground font-mono overflow-x-auto whitespace-pre-wrap">
                      {tc.input}
                    </pre>
                  </div>

                  <div>
                    <span className="text-muted-foreground font-semibold">Expected Output:</span>
                    <pre className="mt-1 p-2.5 rounded-lg bg-background border border-border text-emerald-600 dark:text-emerald-400 font-bold font-mono overflow-x-auto whitespace-pre-wrap">
                      {tc.expected || tc.output}
                    </pre>
                  </div>

                  {tc.explanation && (
                    <div className="text-[11px] text-muted-foreground font-sans pt-1 border-t border-border">
                      <strong className="text-foreground">Explanation:</strong> {tc.explanation}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Read input from standard input (stdin) and write solution to standard output (stdout).
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* RIGHT PANE: Code Editor & Interactive Test Runner Console   */}
      {/* ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {/* Editor Toolbar */}
        <div className="flex items-center justify-between shrink-0 flex-wrap gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
          <div className="flex items-center gap-3">
            {/* Language Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLangDropdown((p) => !p)}
                className="flex items-center gap-2 px-3 py-1.5 bg-background hover:bg-muted border border-border rounded-lg text-xs font-semibold text-foreground transition-colors"
              >
                <Code2 className="w-3.5 h-3.5 text-primary" />
                <span>{LANGUAGES.find((l) => l.value === language)?.label || language}</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>

              {showLangDropdown && (
                <div className="absolute left-0 top-full mt-1 w-44 bg-popover border border-border rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                  {LANGUAGES.filter((option) => isLanguageAllowed(option.value)).map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      disabled={isRunning || isSubmitting}
                      onClick={() => handleLanguageChange(l.value)}
                      className={`w-full text-left px-3.5 py-2 text-xs font-medium flex items-center justify-between transition-colors ${
                        language === l.value
                          ? "text-primary bg-primary/10 font-bold"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <span>{l.label}</span>
                      {language === l.value && <Check className="w-3.5 h-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span className="text-[11px] text-muted-foreground hidden sm:inline font-mono">
              {lineCount} lines • {editorCode.length} chars
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isRunning || isSubmitting}
              onClick={() => handleResetCode(false)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background hover:bg-muted text-foreground border border-border text-[11px] font-semibold transition-colors"
              title="Reset and restore starter code for this question"
            >
              <RotateCcw className="w-3 h-3 text-muted-foreground" />
              <span>Reset Boilerplate</span>
            </button>

            {!blockCopyPaste && (
              <button
                type="button"
                onClick={handleCopyCode}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                title="Copy code"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-[120px] min-w-0 overflow-hidden" aria-label="Code editor workspace">
          <Editor
            height="100%"
            path={`${question._id}/solution.${LANGUAGES.find(item => item.value === language)?.ext || language}`}
            language={language}
            value={editorCode}
            onChange={value => { if (value !== undefined && value !== code) updateCode(value); }}
            onMount={handleEditorDidMount}
            theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
            options={{
              automaticLayout: true,
              minimap: { enabled: false },
              fontSize: Math.round(13 * readingScale),
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              bracketPairColorization: { enabled: false },
              guides: { bracketPairs: false, indentation: true },
              folding: false,
              contextmenu: false,
              padding: { top: 12, bottom: 12 },
              tabSize: 4,
              readOnly: isRunning || isSubmitting,
              ariaLabel: "Assessment code editor",
            }}
            loading={<div className="p-4 h-full text-sm text-muted-foreground">Loading code editor…</div>}
          />
        </div>

        {/* Save Notice Banner */}
        {saveSuccessNotice && (
          <div className="px-4 py-2 bg-emerald-500/10 border-t border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{saveSuccessNotice}</span>
            </div>
            <button
              onClick={() => setSaveSuccessNotice(null)}
              className="text-emerald-600/80 dark:text-emerald-400/80 hover:text-emerald-700 dark:hover:text-emerald-300"
            >
              ✕
            </button>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────── */}
        {/* BOTTOM PANEL: Test Cases, Custom Input, Output Console      */}
        {/* ─────────────────────────────────────────────────────────── */}
        <div className="shrink-0 max-h-[45%] min-h-0 border-t border-border bg-card flex flex-col">
          {/* Console Tabs */}
          <div className="flex items-center justify-between px-4 pt-2 border-b border-border bg-muted/20">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setBottomTab("testcases")}
                className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
                  bottomTab === "testcases"
                    ? "bg-card text-foreground border-t-2 border-primary shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Test Cases</span>
                {sampleCases.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground border border-border">
                    {sampleCases.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setBottomTab("custom_input")}
                className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
                  bottomTab === "custom_input"
                    ? "bg-card text-foreground border-t-2 border-primary shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Custom Input</span>
              </button>

              <button
                type="button"
                onClick={() => setBottomTab("output")}
                className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-1.5 ${
                  bottomTab === "output"
                    ? "bg-card text-foreground border-t-2 border-primary shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Output Console</span>
                {resultsList.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      allPassed
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    {runResult.passedCount ?? resultsList.filter((r: any) => r.passed).length}/{runResult.totalCount ?? resultsList.length}
                  </span>
                )}
              </button>
            </div>

            {/* Micro execution status */}
            {isRunning && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-mono animate-pulse">
                <Spinner className="w-3 h-3 animate-spin" /> Compiling & Running...
              </span>
            )}
          </div>

          {/* Tab Content Box */}
          <div className="assessment-scroll flex-1 min-h-0 p-3 max-h-44 overflow-y-auto overscroll-contain">
            {/* TAB 1: Sample Test Cases */}
            {bottomTab === "testcases" && (
              <div className="space-y-3">
                {sampleCases.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {sampleCases.map((tc, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedTestCaseIndex(idx);
                            setCustomInput(tc.input);
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                            selectedTestCaseIndex === idx
                              ? "bg-primary text-primary-foreground shadow-xs"
                              : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground border border-border"
                          }`}
                        >
                          Case {idx + 1}
                        </button>
                      ))}
                    </div>

                    {sampleCases[selectedTestCaseIndex] && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <div className="text-[11px] font-bold uppercase text-muted-foreground mb-1">Input</div>
                          <pre className="p-2.5 rounded-lg bg-background border border-border font-mono text-xs text-foreground whitespace-pre-wrap overflow-x-auto">
                            {sampleCases[selectedTestCaseIndex].input}
                          </pre>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold uppercase text-muted-foreground mb-1">Expected Output</div>
                          <pre className="p-2.5 rounded-lg bg-background border border-border font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold whitespace-pre-wrap overflow-x-auto">
                            {sampleCases[selectedTestCaseIndex].expected || sampleCases[selectedTestCaseIndex].output}
                          </pre>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">No predefined test cases for this question. Use Custom Input to test.</p>
                )}
              </div>
            )}

            {/* TAB 2: Custom Input */}
            {bottomTab === "custom_input" && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase text-muted-foreground">Standard Input (stdin)</div>
                <textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  rows={4}
                  placeholder="Enter custom input lines here..."
                  className="w-full bg-background border border-border rounded-lg p-3 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                />
              </div>
            )}

            {/* TAB 3: Execution Output Console */}
            {bottomTab === "output" && (
              <div className="space-y-3 font-mono text-xs">
                <ExecutionFeedback context="assessment" mode={resultMode} language={language}
                  phase={isRunning || isSubmitting ? 'running' : null}
                  result={runResult ? {
                    ...runResult,
                    status: runResult.status || (allPassed ? 'accepted' : resultsList[0]?.status || 'wrong_answer'),
                    results: resultsList,
                    passedCount: runResult.passedCount ?? resultsList.filter((r: any) => r.passed).length,
                    totalCount: runResult.totalCount ?? resultsList.length,
                  } : null} />
              </div>
            )}
          </div>

          {/* Action Button Bar */}
          <div className="shrink-0 px-4 py-3 bg-card border-t border-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                {savedResponse?.status === "answered" ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Solution Saved
                  </span>
                ) : (
                  "Not submitted yet"
                )}
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Run Code / Run Test */}
              <button
                type="button"
                onClick={handleRunTest}
                disabled={isRunning || isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-background hover:bg-muted text-foreground text-xs font-bold border border-border shadow-xs transition-all disabled:opacity-50"
              >
                {isRunning ? (
                  <Spinner className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 fill-amber-600 dark:fill-amber-400" />
                )}
                <span>Run Code</span>
              </button>

              {/* Submit Solution / Save Answer */}
              <button
                type="button"
                onClick={handleSubmitSolution}
                disabled={isRunning || isSubmitting}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Spinner className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Submit Solution</span>
              </button>

              {/* Next Question (Optional shortcut) */}
              {onNext && !isLastQuestion && (
                <button
                  type="button"
                  onClick={onNext}
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold border border-border transition-colors"
                >
                  <span>Next</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ResizableAssessmentPanels>
  );
}
