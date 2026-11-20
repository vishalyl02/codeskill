"use client";

import React, { useState, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Code2,
  Play,
  RotateCcw,
  Check,
  Lightbulb,
  Terminal,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { learningAPI } from "@/config/api";
import { useTheme } from "@/context/ThemeContext";

const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-64 flex items-center justify-center bg-muted/30 text-xs text-muted-foreground font-mono">
      Initializing Code Editor...
    </div>
  ),
});

export const MINIMAL_STARTER_CODES: Record<string, string> = {
  c: `#include <stdio.h>

// TODO: Implement your logic
int main() {
    return 0;
}
`,
  cpp: `#include <iostream>
using namespace std;

// TODO: Implement your logic
int main() {
    return 0;
}
`,
  python: `# TODO: Implement your logic
`,
  java: `public class Main {
    public static void main(String[] args) {
        // TODO: Implement your logic
    }
}
`,
  javascript: `// TODO: Implement your logic
`,
  sql: `-- TODO: Write your SQL query here
SELECT 1;
`,
};

export interface ExerciseData {
  id: string;
  title: string;
  type: string;
  starterCode?: Record<string, string>;
  hints?: string[];
  marks?: number;
  quizConfig?: any;
}

interface IndependentQuestionCompilerProps {
  exercise: ExerciseData;
  onPassed?: (exerciseId: string, result: any) => void;
  defaultOpen?: boolean;
}

export function IndependentQuestionCompiler({
  exercise,
  onPassed,
  defaultOpen = true,
}: IndependentQuestionCompilerProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Determine initial language
  const availableLangs = useMemo(() => {
    if (exercise.starterCode && Object.keys(exercise.starterCode).length > 0) {
      return Object.keys(exercise.starterCode);
    }
    return ["c", "cpp", "python", "java", "javascript", "sql"];
  }, [exercise.starterCode]);

  const initialLang = useMemo(() => {
    if (exercise.starterCode?.c) return "c";
    if (exercise.starterCode?.sql) return "sql";
    if (exercise.starterCode?.python) return "python";
    if (exercise.starterCode?.java) return "java";
    if (exercise.starterCode?.javascript) return "javascript";
    return availableLangs[0] || "c";
  }, [exercise.starterCode, availableLangs]);

  const [language, setLanguage] = useState<string>(initialLang);

  // Preserve student-written code across language switches
  const [codeByLang, setCodeByLang] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (exercise.starterCode) {
      Object.entries(exercise.starterCode).forEach(([k, v]) => {
        map[k] = v;
      });
    }
    return map;
  });

  const [code, setCode] = useState<string>(() => {
    return (
      codeByLang[initialLang] ||
      exercise.starterCode?.[initialLang] ||
      MINIMAL_STARTER_CODES[initialLang] ||
      "// Write your code here\n"
    );
  });

  // Independent execution & terminal state
  const [terminalLogs, setTerminalLogs] = useState<
    Array<{ type: "stdout" | "stderr" | "system" | "return"; text: string; time: string }>
  >([]);
  const [terminalTab, setTerminalTab] = useState<"output" | "table" | "tests" | "stdin">("output");
  const [customStdin, setCustomStdin] = useState("");
  const [sqlResult, setSqlResult] = useState<{
    columns: string[];
    rows: any[];
    rowCount: number;
    durationMs?: number;
  } | null>(null);
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [submissionFeedback, setSubmissionFeedback] = useState<any | null>(null);

  const [isExecuting, setIsExecuting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPassed, setIsPassed] = useState(false);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [showHint, setShowHint] = useState(false);

  // In-flight execution ref to safely invalidate stale requests and prevent duplicates
  const activeExecutionIdRef = useRef<string | null>(null);
  const isExecutingRef = useRef(false);

  // Switch language while preserving user's typed code in the previous language
  const handleLanguageChange = useCallback(
    (newLang: string) => {
      setCodeByLang((prev) => ({
        ...prev,
        [language]: code,
      }));
      setLanguage(newLang);
      const nextCode =
        codeByLang[newLang] ||
        exercise.starterCode?.[newLang] ||
        MINIMAL_STARTER_CODES[newLang] ||
        "// Write your code here\n";
      setCode(nextCode);
    },
    [code, language, codeByLang, exercise.starterCode]
  );

  // Reset to initial minimal template
  const handleReset = useCallback(() => {
    const defaultCode =
      exercise.starterCode?.[language] ||
      MINIMAL_STARTER_CODES[language] ||
      "// Write your code here\n";
    setCode(defaultCode);
    setCodeByLang((prev) => ({ ...prev, [language]: defaultCode }));
    setTerminalLogs([]);
    setSqlResult(null);
    setTestResults(null);
    setSubmissionFeedback(null);
  }, [exercise.starterCode, language]);

  // 1. RUN CODE (Live Playground): Never awards XP or marks completion
  const handleRunCode = async () => {
    if (isExecutingRef.current) return; // Prevent double-trigger
    isExecutingRef.current = true;
    setIsExecuting(true);
    setTerminalTab("output");

    const executionId = crypto.randomUUID();
    activeExecutionIdRef.current = executionId;
    const runTag = executionId.slice(0, 8);
    const timestamp = new Date().toLocaleTimeString();
    const startTime = performance.now();

    const newLogs: Array<{
      type: "stdout" | "stderr" | "system" | "return";
      text: string;
      time: string;
    }> = [
      {
        type: "system",
        text: `> [Run ID: ${runTag}] Compiling & Executing ${language.toUpperCase()} in sandbox...`,
        time: timestamp,
      },
    ];
    setTerminalLogs(newLogs);

    try {
      if (language === "javascript") {
        // Safe in-browser execution with isolated console capture
        const capturedLogs: string[] = [];
        const sandboxConsole = {
          log: (...args: any[]) =>
            capturedLogs.push(
              args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")
            ),
          info: (...args: any[]) =>
            capturedLogs.push(
              "[INFO] " +
                args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")
            ),
          warn: (...args: any[]) =>
            capturedLogs.push(
              "[WARN] " +
                args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")
            ),
          error: (...args: any[]) =>
            capturedLogs.push(
              "[ERROR] " +
                args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ")
            ),
        };

        const executor = new Function("console", code);
        const returned = executor(sandboxConsole);
        const elapsed = Math.round(performance.now() - startTime);

        if (activeExecutionIdRef.current !== executionId) return;

        if (capturedLogs.length > 0) {
          capturedLogs.forEach((msg) => {
            newLogs.push({ type: "stdout", text: msg, time: new Date().toLocaleTimeString() });
          });
        } else if (returned === undefined) {
          newLogs.push({
            type: "stdout",
            text: "(Program executed with no console output. Use console.log() to print values)",
            time: new Date().toLocaleTimeString(),
          });
        }

        if (returned !== undefined) {
          newLogs.push({
            type: "return",
            text: `[Return Value]: ${
              typeof returned === "object" ? JSON.stringify(returned, null, 2) : String(returned)
            }`,
            time: new Date().toLocaleTimeString(),
          });
        }

        newLogs.push({
          type: "system",
          text: `✓ Execution finished successfully in ${elapsed}ms (Exit Code: 0)`,
          time: new Date().toLocaleTimeString(),
        });
        setTerminalLogs([...newLogs]);
      } else {
        // Asynchronous backend playground runner (C, C++, Java, Python, SQL)
        const res = await learningAPI.runPlayground({
          code,
          language,
          stdin: customStdin.trim() ? customStdin : undefined,
        });

        if (activeExecutionIdRef.current !== executionId) return;
        const resultData = (res.data as any)?.data || res.data;
        const elapsed = resultData?.durationMs ?? Math.round(performance.now() - startTime);

        if (resultData?.isSql || language === "sql") {
          if (resultData?.columns && Array.isArray(resultData?.rows)) {
            setSqlResult({
              columns: resultData.columns,
              rows: resultData.rows,
              rowCount: resultData.rowCount ?? resultData.rows.length,
              durationMs: elapsed,
            });
            setTerminalTab("table");
          }
        }

        if (resultData?.output) {
          const lines = String(resultData.output).split("\n");
          lines.forEach((l: string) => {
            if (l.trim().length > 0) {
              newLogs.push({ type: "stdout", text: l, time: new Date().toLocaleTimeString() });
            }
          });
        }

        if (resultData?.error) {
          const lines = String(resultData.error).split("\n");
          lines.forEach((l: string) => {
            if (l.trim().length > 0) {
              newLogs.push({ type: "stderr", text: l, time: new Date().toLocaleTimeString() });
            }
          });
        }

        if (!resultData?.output && !resultData?.error) {
          newLogs.push({
            type: "stdout",
            text: "(Program executed successfully with no console output)",
            time: new Date().toLocaleTimeString(),
          });
        }

        newLogs.push({
          type: "system",
          text: `✓ Execution completed in ${elapsed}ms (Status: ${resultData?.status || "SUCCESS"})`,
          time: new Date().toLocaleTimeString(),
        });
        setTerminalLogs([...newLogs]);
      }
    } catch (err: any) {
      if (activeExecutionIdRef.current !== executionId) return;
      const elapsed = Math.round(performance.now() - startTime);
      newLogs.push({
        type: "stderr",
        text: `Execution notice: ${
          err?.response?.data?.message || err?.message || "Execution completed"
        }`,
        time: new Date().toLocaleTimeString(),
      });
      newLogs.push({
        type: "system",
        text: `✗ Execution failed in ${elapsed}ms`,
        time: new Date().toLocaleTimeString(),
      });
      setTerminalLogs([...newLogs]);
    } finally {
      if (activeExecutionIdRef.current === executionId) {
        setIsExecuting(false);
        isExecutingRef.current = false;
      }
    }
  };

  // 2. SUBMIT SOLUTION: Evaluates test cases, awards XP, and updates progress on backend
  const handleSubmitCode = async () => {
    if (isSubmitting) return; // Prevent double submit
    setIsSubmitting(true);
    setTerminalTab("tests");

    try {
      const res = await learningAPI.submitExercise(exercise.id, {
        code,
        language,
      });
      const data = res.data?.data || res.data;
      const feedback = data?.feedback || data;
      setSubmissionFeedback(feedback);

      if (feedback?.results && Array.isArray(feedback.results)) {
        setTestResults(feedback.results);
      }

      if (data?.passed || feedback?.passed) {
        setIsPassed(true);
        if (onPassed) {
          onPassed(exercise.id, data);
        }
      }
    } catch (err: any) {
      const errMsg =
        err.response?.data?.message ||
        "Code evaluation failed. Please verify syntax and constraints.";
      setSubmissionFeedback({
        passed: false,
        error: errMsg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden transition-all duration-200">
      {/* Question Header Accordion */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/40 transition-colors border-b border-border select-none"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
              isPassed
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                : "bg-primary/10 text-primary border border-primary/20"
            }`}
          >
            {isPassed ? <Check className="w-4 h-4" /> : <Code2 className="w-4 h-4" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">{exercise.title}</h3>
              {isPassed && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                  Passed
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Independent Sandbox Compiler · Real-time execution
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            +{exercise.marks || 25} XP
          </span>
          <button
            type="button"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground"
            aria-label="Toggle editor"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Hint & Problem Clue Accordion */}
          {exercise.hints && exercise.hints.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-200">
              <div
                onClick={() => setShowHint(!showHint)}
                className="flex items-center justify-between cursor-pointer font-bold select-none"
              >
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <span>Problem Clue & Guidance</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {showHint ? "Hide Clue" : "Show Clue"}
                </span>
              </div>
              {showHint && (
                <p className="mt-2 text-foreground font-medium leading-relaxed pl-6">
                  {exercise.hints[0]}
                </p>
              )}
            </div>
          )}

          {/* Compiler Control Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center gap-2">
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="h-9 bg-muted/60 text-foreground text-xs font-semibold rounded-lg px-3 border border-border shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
              >
                <option value="c">C (GCC 13 / C11)</option>
                <option value="cpp">C++ 20</option>
                <option value="python">Python 3</option>
                <option value="java">Java 21</option>
                <option value="javascript">JavaScript (ES2022)</option>
                <option value="sql">SQL (PostgreSQL)</option>
              </select>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="h-9 text-xs gap-1 border-border text-muted-foreground hover:text-foreground cursor-pointer"
                title="Reset code template and clear terminal output"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset Template</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={handleRunCode}
                disabled={isExecuting || isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4 shadow-xs gap-1.5 cursor-pointer transition-all disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isExecuting ? "Executing..." : "▶ Run Code"}</span>
              </Button>

              <Button
                type="button"
                onClick={handleSubmitCode}
                disabled={isSubmitting || isExecuting}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 px-4 shadow-xs gap-1.5 cursor-pointer transition-all disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSubmitting ? "Evaluating..." : "Submit Solution"}</span>
              </Button>
            </div>
          </div>

          {/* Lazy Monaco Editor Container */}
          <div className="border border-border rounded-xl overflow-hidden h-72 shadow-inner">
            <Editor
              height="100%"
              language={
                language === "cpp"
                  ? "cpp"
                  : language === "c"
                  ? "c"
                  : language === "sql"
                  ? "sql"
                  : language
              }
              theme={isDark ? "vs-dark" : "light"}
              value={code}
              onChange={(val) => setCode(val || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>

          {/* Isolated Terminal Console */}
          <div className="bg-[#0b0f19] border border-border/80 rounded-xl overflow-hidden shadow-lg font-mono text-xs">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b26] border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                </div>
                <span className="text-slate-400 font-semibold text-[11px] ml-1">
                  Terminal Console
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                  {isExecuting ? "Executing..." : isSubmitting ? "Evaluating..." : "Ready"}
                </span>
              </div>

              <div className="flex items-center bg-slate-900/90 rounded-lg p-0.5 border border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setTerminalTab("output")}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                    terminalTab === "output"
                      ? "bg-slate-700 text-white shadow-xs"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Output
                </button>
                {sqlResult && (
                  <button
                    type="button"
                    onClick={() => setTerminalTab("table")}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      terminalTab === "table"
                        ? "bg-slate-700 text-white shadow-xs"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>Table</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-primary/20 text-primary font-bold">
                      {sqlResult.rowCount}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTerminalTab("tests")}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                    terminalTab === "tests"
                      ? "bg-slate-700 text-white shadow-xs"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Test Results
                </button>
                <button
                  type="button"
                  onClick={() => setTerminalTab("stdin")}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    terminalTab === "stdin"
                      ? "bg-slate-700 text-white shadow-xs"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span>Custom Input</span>
                  {customStdin.trim().length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                </button>
              </div>
            </div>

            {/* TAB 1: Console Output */}
            {terminalTab === "output" && (
              <div className="p-4 max-h-56 min-h-[7rem] overflow-y-auto space-y-1.5 font-mono text-xs">
                {terminalLogs.length === 0 ? (
                  <div className="text-slate-500 italic py-4 text-center">
                    Ready — No execution yet
                  </div>
                ) : (
                  terminalLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`leading-relaxed break-all ${
                        log.type === "stdout"
                          ? "text-slate-200"
                          : log.type === "stderr"
                          ? "text-red-400"
                          : log.type === "return"
                          ? "text-amber-300 font-semibold"
                          : "text-slate-400"
                      }`}
                    >
                      {log.text}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 2: SQL Result Table */}
            {terminalTab === "table" && sqlResult && (
              <div className="p-3 max-h-56 overflow-auto">
                <div className="text-[11px] text-slate-400 mb-2 flex items-center justify-between">
                  <span>{sqlResult.rowCount} rows retrieved</span>
                  {sqlResult.durationMs && <span>{sqlResult.durationMs}ms</span>}
                </div>
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-800/80 text-slate-300">
                      {sqlResult.columns.map((col, cIdx) => (
                        <th key={cIdx} className="px-3 py-1.5 font-semibold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {sqlResult.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-800/40">
                        {sqlResult.columns.map((col, cIdx) => (
                          <td key={cIdx} className="px-3 py-1.5 whitespace-nowrap">
                            {row[col] !== null && row[col] !== undefined ? String(row[col]) : "NULL"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 3: Test Results */}
            {terminalTab === "tests" && (
              <div className="p-4 max-h-56 overflow-y-auto space-y-3 font-mono text-xs">
                {submissionFeedback && (
                  <div
                    className={`p-3 rounded-lg border flex items-center gap-2.5 ${
                      submissionFeedback.passed
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-red-500/10 border-red-500/30 text-red-400"
                    }`}
                  >
                    {submissionFeedback.passed ? (
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 flex-shrink-0" />
                    )}
                    <div>
                      <div className="font-bold">
                        {submissionFeedback.passed
                          ? "✓ Verified & Accepted"
                          : "✗ Evaluation Needs Review"}
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5">
                        {submissionFeedback.passed
                          ? "All test cases passed. Completion recorded."
                          : submissionFeedback.error || "Some test cases did not match expected output."}
                      </div>
                    </div>
                  </div>
                )}

                {testResults && testResults.length > 0 ? (
                  testResults.map((tc, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 space-y-1 text-[11px]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-300">Test Case #{tc.id || idx + 1}</span>
                        <span
                          className={`font-semibold ${
                            tc.passed ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {tc.passed ? "Passed" : "Failed"}
                        </span>
                      </div>
                      {tc.output && (
                        <div className="text-slate-400">
                          <span className="text-slate-500">Output: </span>
                          <span className="text-slate-300">{tc.output}</span>
                        </div>
                      )}
                      {tc.expected && (
                        <div className="text-slate-400">
                          <span className="text-slate-500">Expected: </span>
                          <span className="text-emerald-400">{tc.expected}</span>
                        </div>
                      )}
                    </div>
                  ))
                ) : !submissionFeedback ? (
                  <div className="text-slate-500 italic py-4 text-center">
                    Submit your solution to run automated test cases.
                  </div>
                ) : null}
              </div>
            )}

            {/* TAB 4: Custom Input (stdin) */}
            {terminalTab === "stdin" && (
              <div className="p-3">
                <textarea
                  value={customStdin}
                  onChange={(e) => setCustomStdin(e.target.value)}
                  placeholder="Enter custom standard input (stdin) for your program..."
                  rows={4}
                  className="w-full bg-[#161b26] border border-border/60 rounded-lg p-2.5 text-slate-200 placeholder-slate-500 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
