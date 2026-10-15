"use client";

import { useExecutionRuntimes } from "@/hooks/useExecutionRuntimes";

import { useState, useRef } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  Terminal,
  Code2,
  ChevronDown,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { azureRunAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";

const LANGUAGES = [
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "java", label: "Java" },
  { value: "python", label: "Python 3" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
];

const STARTER_CODE: Record<string, string> = {
  c: `#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}`,
  cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}`,
  java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}`,
  python: `# Write your solution here\n`,
  javascript: `// Write your solution here\nprocess.stdin.resume();\nprocess.stdin.setEncoding('utf8');\nlet input = '';\nprocess.stdin.on('data', d => input += d);\nprocess.stdin.on('end', () => {\n    // Parse and solve\n});`,
  typescript: `// Write your solution here\n`,
  go: `package main\n\nimport "fmt"\n\nfunc main() {\n    // Write your solution here\n}`,
  csharp: `using System;\n\nclass Solution {\n    static void Main(string[] args) {\n        // Write your solution here\n    }\n}`,
};

interface TestCase {
  id: string;
  input: string;
  expected: string;
  isSample?: boolean;
}

interface TestResult {
  id: string;
  passed: boolean;
  status: string;
  stdout: string;
  stderr: string;
  executionTimeMs?: number;
}

interface Props {
  questionId?: string;
  title?: string;
  description?: string;
  sampleTestCases?: TestCase[];
  onSubmit?: (code: string, language: string, results: TestResult[]) => void;
  defaultLanguage?: string;
  readOnly?: boolean;
}

export default function AssessmentCodeEditor({
  questionId,
  title = "Coding Question",
  description,
  sampleTestCases = [],
  onSubmit,
  defaultLanguage = "python",
  readOnly = false,
}: Props) {
  const executionRuntimes = useExecutionRuntimes();
  const [language, setLanguage] = useState(defaultLanguage);
  const [code, setCode] = useState(STARTER_CODE[defaultLanguage] || "");
  const [stdin, setStdin] = useState(sampleTestCases[0]?.input || "");
  const [activeTab, setActiveTab] = useState<"input" | "output" | "testcases">("testcases");
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [showLangDropdown, setShowLangDropdown] = useState(false);

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    setCode(STARTER_CODE[lang] || "");
    setShowLangDropdown(false);
  };

  const handleRun = async () => {
    if (isRunning || isSubmitting || readOnly) return;
    setIsRunning(true);
    setActiveTab("output");
    setRunResult(null);
    try {
      const res = await azureRunAPI.run({
        code,
        language,
        stdin,
        timeoutMs: 10000,
      });
      setRunResult(res.data);
    } catch (err: any) {
      setRunResult({
        success: false,
        result: { stderr: err.response?.data?.message || err.message, stdout: "", status: "system_error" },
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (isRunning || isSubmitting || readOnly) return;
    if (!sampleTestCases.length && !onSubmit) return;
    setIsSubmitting(true);
    setActiveTab("testcases");
    try {
      const res = await azureRunAPI.run({
        code,
        language,
        testCases: sampleTestCases.map((tc) => ({
          id: tc.id,
          input: tc.input,
          expected: tc.expected,
        })),
        timeoutMs: 15000,
      });
      const results: TestResult[] = res.data?.results || [];
      setTestResults(results);
      if (onSubmit) {
        onSubmit(code, language, results);
      }
    } catch (err: any) {
      setTestResults([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const outputResult = runResult?.result || runResult?.results?.[0];
  const passedCount = testResults.filter((r) => r.passed).length;

  return (
    <div className="flex flex-col h-full bg-zinc-950 rounded-xl border border-border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Code2 className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-zinc-100">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Language Picker */}
          <div className="relative">
            <button
              onClick={() => setShowLangDropdown((p) => !p)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-xs font-semibold text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              {LANGUAGES.find((l) => l.value === language)?.label || language}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showLangDropdown && (
              <div className="absolute right-0 top-full mt-1 w-36 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 py-1">
                {LANGUAGES.filter(option => !executionRuntimes.length || executionRuntimes.some(runtime => runtime.language === option.value && runtime.enabled)).map((lang) => (
                  <button
                    key={lang.value}
                    onClick={() => handleLanguageChange(lang.value)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-medium transition-colors ${
                      language === lang.value
                        ? "text-amber-400 bg-amber-500/10"
                        : "text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reset */}
          <button
            onClick={() => setCode(STARTER_CODE[language] || "")}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Reset to starter code"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Code Area */}
      <div className="flex-1 relative min-h-0">
        <textarea
          value={code}
          onChange={(e) => !readOnly && setCode(e.target.value)}
          readOnly={readOnly}
          spellCheck={false}
          className="w-full h-full min-h-[280px] p-4 bg-zinc-950 text-zinc-100 text-sm font-mono resize-none focus:outline-none leading-relaxed"
          style={{ tabSize: 2 }}
          placeholder="Write your solution here..."
        />
      </div>

      {/* Bottom Panel */}
      <div className="border-t border-zinc-800 bg-zinc-900">
        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-2">
          {(["testcases", "input", "output"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors capitalize ${
                activeTab === tab
                  ? "bg-zinc-800 text-zinc-100 border border-zinc-700 border-b-zinc-800"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab === "testcases" ? "Test Cases" : tab === "input" ? "Custom Input" : "Output"}
              {tab === "testcases" && testResults.length > 0 && (
                <span
                  className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    passedCount === testResults.length
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-rose-500/20 text-rose-400"
                  }`}
                >
                  {passedCount}/{testResults.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="px-4 py-3 min-h-[120px]">
          {activeTab === "input" && (
            <textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              rows={4}
              placeholder="Custom input (stdin)..."
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500 resize-none"
            />
          )}

          {activeTab === "output" && (
            <div className="font-mono text-xs space-y-2">
              {isRunning ? (
                <div className="flex items-center gap-2 text-zinc-400">
                  <Spinner className="w-3.5 h-3.5 animate-spin" />
                  Running via Azure...
                </div>
              ) : outputResult ? (
                <>
                  <div className={`flex items-center gap-2 font-semibold ${
                    outputResult.status === "accepted" || outputResult.status === "accepted"
                      ? "text-emerald-400" : "text-rose-400"
                  }`}>
                    {outputResult.status === "accepted" ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    {outputResult.status?.replace(/_/g, " ").toUpperCase()}
                    {outputResult.executionTimeMs && (
                      <span className="text-zinc-500 font-normal">· {outputResult.executionTimeMs}ms</span>
                    )}
                  </div>
                  {outputResult.stdout && (
                    <pre className="text-zinc-300 bg-zinc-950 p-2 rounded border border-zinc-800 whitespace-pre-wrap overflow-x-auto">
                      {outputResult.stdout}
                    </pre>
                  )}
                  {outputResult.stderr && (
                    <pre className="text-rose-400 bg-rose-500/5 p-2 rounded border border-rose-500/20 whitespace-pre-wrap overflow-x-auto text-[11px]">
                      {outputResult.stderr}
                    </pre>
                  )}
                </>
              ) : (
                <p className="text-zinc-600">Run your code to see output here.</p>
              )}
            </div>
          )}

          {activeTab === "testcases" && (
            <div className="space-y-2">
              {isSubmitting ? (
                <div className="flex items-center gap-2 text-zinc-400 text-xs">
                  <Spinner className="w-3.5 h-3.5 animate-spin" />
                  Running all test cases via Azure...
                </div>
              ) : testResults.length > 0 ? (
                testResults.map((result, idx) => (
                  <div
                    key={result.id || idx}
                    className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs ${
                      result.passed
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-rose-500/20 bg-rose-500/5"
                    }`}
                  >
                    {result.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-zinc-300">Case {idx + 1}</span>
                      <span className={`ml-2 ${result.passed ? "text-emerald-400" : "text-rose-400"}`}>
                        {result.status?.replace(/_/g, " ")}
                      </span>
                      {result.stdout && (
                        <p className="text-zinc-500 mt-0.5 truncate">Output: {result.stdout}</p>
                      )}
                    </div>
                    {result.executionTimeMs && (
                      <span className="text-zinc-600 shrink-0">{result.executionTimeMs}ms</span>
                    )}
                  </div>
                ))
              ) : sampleTestCases.length > 0 ? (
                sampleTestCases.slice(0, 3).map((tc, idx) => (
                  <div key={tc.id || idx} className="p-2.5 rounded-lg border border-zinc-800 text-xs">
                    <p className="text-zinc-400 font-semibold mb-1">Case {idx + 1}</p>
                    <p className="text-zinc-500">Input: <span className="text-zinc-300 font-mono">{tc.input || "(empty)"}</span></p>
                    <p className="text-zinc-500">Expected: <span className="text-zinc-300 font-mono">{tc.expected || "(any)"}</span></p>
                  </div>
                ))
              ) : (
                <p className="text-zinc-600 text-xs">Submit to run against test cases.</p>
              )}
            </div>
          )}
        </div>

        {/* Run / Submit buttons */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
            <Terminal className="w-3 h-3" />
            Powered by Microsoft Azure
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRun}
              disabled={isRunning || isSubmitting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-zinc-700 hover:bg-zinc-600 text-zinc-100 transition-colors disabled:opacity-50"
            >
              {isRunning ? <Spinner className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Run
            </button>
            {onSubmit && (
              <button
                onClick={handleSubmit}
                disabled={isRunning || isSubmitting}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50"
              >
                {isSubmitting ? <Spinner className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Submit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
