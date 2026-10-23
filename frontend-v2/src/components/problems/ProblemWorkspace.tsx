"use client";

import { editorStarterCode } from "@/lib/editor-languages";

import { useExecutionRuntimes } from "@/hooks/useExecutionRuntimes";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  Play, Send, Settings, BookOpen, Terminal, Clock, ChevronLeft, ChevronRight, ChevronDown, 
  Maximize2, Minimize2, CheckCircle2, XCircle, AlertTriangle, 
  List, MessageSquare, Lightbulb, Sparkles, StickyNote, Tag, BarChart3,
  Trophy, Flame, Copy, RotateCcw, History, Eye, EyeOff, Plus, Trash2,
  ThumbsUp, ThumbsDown, ArrowLeft, Hash, Zap, Target, Award, TrendingUp,
  Code2, FileText, Brain, User, SendHorizontal, Bot, Check, ArrowRight, Layers
} from "lucide-react";
import { ProgrammingLanguageIcon } from "@/components/ui/ProgrammingLanguageIcon";
import SampleTestCasesPanel, { hasSampleContent } from "@/components/problems/SampleTestCasesPanel";
import { publicProblemRunCases } from "@/lib/problem-run-cases";
import Link from "next/link";
import { useState, useEffect, useCallback, useMemo, use, useRef } from "react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import Editor from "@monaco-editor/react";
import { submissionAPI, runAPI, problemsAPI, discussionsAPI } from "@/config/api";
import { useTheme } from "@/context/ThemeContext";
import { Spinner } from "@/components/ui/spinner";
import { hideEntryPoint, updateSourceFromVisibleEditor } from "@/lib/hidden-entry-point";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

const LANGUAGES = [
  { id: "c", name: "C", ext: "main.c", defaultCode: "#include <stdio.h>\n\nint main() {\n    // Read input\n    // Write your solution here\n    return 0;\n}" },
  { id: "cpp", name: "C++", ext: "main.cpp", defaultCode: "#include <iostream>\nusing namespace std;\n\nint main() {\n    // Read input\n    // Write your solution here\n    return 0;\n}" },
  { id: "java", name: "Java", ext: "Main.java", defaultCode: "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Read input and write your solution here\n    }\n}" },
  { id: "javascript", name: "JavaScript", ext: "solution.js", defaultCode: "// Read from stdin, write to stdout\nconst readline = require('readline');\nconst rl = readline.createInterface({ input: process.stdin });\n\nconst lines = [];\nrl.on('line', (line) => lines.push(line));\nrl.on('close', () => {\n  // Process input and solve\n  console.log('Hello World');\n});\n" },
  { id: "python", name: "Python 3", ext: "solution.py", defaultCode: "# Read from stdin, write to stdout\nimport sys\ninput_data = sys.stdin.read().split()\n# Process input and solve\nprint('Hello World')\n" }
];

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: "text-[#10B981] bg-[rgba(16,185,129,0.10)] border-[rgba(16,185,129,0.25)]",
  Medium: "text-[#F59E0B] bg-[rgba(245,158,11,0.10)] border-[rgba(245,158,11,0.25)]",
  Hard: "text-[#EF4444] bg-[rgba(239,68,68,0.10)] border-[rgba(239,68,68,0.25)]",
};

interface TestResult {
  id: number;
  passed: boolean;
  status: string;
  output: string;
  expected: string;
  error?: string;
  executionTime?: number;
}

type SubmissionStatus = "accepted" | "wrong_answer" | "compile_error" | "runtime_error" | "time_limit" | "memory_limit" | "system_error" | "error";

interface RunResult {
  executionId?: string;
  status: SubmissionStatus;
  results: TestResult[];
  runtime: number;
  logs: string[];
  passedCount: number;
  totalCount: number;
}

// ─── SIDEBAR TAB DEFINITIONS ─────────────────────────────────────────────────
const SIDEBAR_TABS = [
  { id: "description", icon: FileText, label: "Description", shortcut: "⌘D" },
  { id: "samples", icon: Layers, label: "Samples", shortcut: "⌘T" },
  { id: "editorial", icon: BookOpen, label: "Editorial", shortcut: "⌘E" },
  { id: "submissions", icon: History, label: "Submissions", shortcut: "⌘S" },
  { id: "hints", icon: Lightbulb, label: "Hints", shortcut: "⌘H" },
  { id: "notes", icon: StickyNote, label: "Notes", shortcut: "⌘N" },
  { id: "discussion", icon: MessageSquare, label: "Discussion", shortcut: "⌘/" },
  { id: "ai_tutor", icon: Brain, label: "AI Tutor", shortcut: "⌘I" },
];

export default function ProblemWorkspace({ params, embedded = false }: { params: Promise<{ id: string }>; embedded?: boolean }) {
  const unwrappedParams = use(params);
  const problemId = unwrappedParams.id;
  const { theme } = useTheme();
  
  const [problem, setProblem] = useState<any>(null);
  const testCases = useMemo(() => publicProblemRunCases(problem), [problem]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(".coding-action-bar", {
      opacity: 0,
      y: 20,
      duration: 0.4,
      ease: "power2.out"
    });
  }, { scope: containerRef });
  
  // Tab State
  const [activeSidebarTab, setActiveSidebarTab] = useState("description");
  
  // Editor State
  const executionRuntimes = useExecutionRuntimes();
  const [language, setLanguage] = useState<string>(() => {
    if (typeof window !== "undefined" && unwrappedParams?.id) {
      const saved = localStorage.getItem(`codeskill_lang_p_${unwrappedParams.id}`);
      if (saved) return saved;
    }
    return "javascript";
  });
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [code, setCode] = useState<string>("");
  const editorCode = hideEntryPoint(code, language)?.visibleCode ?? code;

  const [vimMode, setVimMode] = useState(false);
  const [editorInst, setEditorInst] = useState<any>(null);
  const [vimInst, setVimInst] = useState<any>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Execution State
  const [activeBottomTab, setActiveBottomTab] = useState("testcases");
  const [activeTestCase, setActiveTestCase] = useState(0);
  const [activeResultCase, setActiveResultCase] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const activeExecutionIdRef = useRef<string | null>(null);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);

  // Notes State
  const [noteContent, setNoteContent] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  // Hints State
  const [revealedHints, setRevealedHints] = useState<Set<number>>(new Set());

  // Submissions History
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // Discussions State
  const [threads, setThreads] = useState<any[]>([]);
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [discussionFilter, setDiscussionFilter] = useState("all");
  const [activeThread, setActiveThread] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [showCreateThread, setShowCreateThread] = useState(false);
  const [newThread, setNewThread] = useState({ title: "", body: "", tag: "general" });
  const [threadSubmitting, setThreadSubmitting] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  // Ask Me Anything State
  const [askQuery, setAskQuery] = useState("");
  const [askLoading, setAskLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    problemsAPI.getBySlug(problemId)
      .then(res => setProblem(res.data.data))
      .catch(() => setProblem(null))
      .finally(() => setLoading(false));
  }, [problemId]);

  // Draft Restoration
  useEffect(() => {
    if (!problem) return;
    const storageKey = `codeskill_draft_${problem.slug}_${language}`;
    const savedDraft = localStorage.getItem(storageKey);
    if (savedDraft) {
      setCode(savedDraft);
    } else {
      // Use starter code from problem config if available, else language default
      const starterCode = editorStarterCode(problem.config?.starterCode, language);
      const defaultCode = starterCode || LANGUAGES.find(l => l.id === language)?.defaultCode || "";
      setCode(defaultCode);
    }
  }, [problem, language]);

  // Load notes from localStorage
  useEffect(() => {
    if (!problem) return;
    const savedNote = localStorage.getItem(`codeskill_note_${problem.slug}`);
    if (savedNote) setNoteContent(savedNote);
  }, [problem]);

  // Preserve the latest draft when switching between contest problems before the debounce fires.
  useEffect(() => {
    if (!embedded || !problem) return;
    return () => {
      try { localStorage.setItem(`codeskill_draft_${problem.slug}_${language}`, code); } catch { /* Storage may be unavailable. */ }
    };
  }, [embedded, problem, language, code]);

  // Autosave
  useEffect(() => {
    if (!problem || !code) return;
    const timeout = setTimeout(() => {
      const storageKey = `codeskill_draft_${problem.slug}_${language}`;
      localStorage.setItem(storageKey, code);
      setLastSaved(new Date());
    }, 1500);
    return () => clearTimeout(timeout);
  }, [code, language, problem]);

  // Vim Mode Setup
  useEffect(() => {
    if (typeof window !== "undefined" && vimMode && editorInst) {
      import('monaco-vim').then(({ initVimMode }) => {
        const statusNode = document.getElementById('vim-status');
        if (statusNode) {
          const vim = initVimMode(editorInst, statusNode);
          setVimInst(vim);
        }
      });
    } else if (!vimMode && vimInst) {
      vimInst.dispose();
      setVimInst(null);
    }
  }, [vimMode, editorInst]);

  // Fetch submissions when that tab is activated
  useEffect(() => {
    if (activeSidebarTab === "submissions" && problem?._id) {
      setSubmissionsLoading(true);
      submissionAPI.getSubmissions(problem._id)
        .then(res => setSubmissions(res.data?.data || []))
        .catch(() => setSubmissions([]))
        .finally(() => setSubmissionsLoading(false));
    }
  }, [activeSidebarTab, problem]);

  // Fetch discussions when that tab is activated
  useEffect(() => {
    if (activeSidebarTab === "discussion" && problem?._id) {
      setDiscussionLoading(true);
      discussionsAPI.getThreads(problem._id, { tag: discussionFilter })
        .then(res => setThreads(res.data?.data || []))
        .catch(() => setThreads([]))
        .finally(() => setDiscussionLoading(false));
    }
  }, [activeSidebarTab, problem, discussionFilter]);

  const loadThread = async (thread: any) => {
    setActiveThread(thread);
    try {
      const res = await discussionsAPI.getReplies(thread._id);
      setReplies(res.data || []);
    } catch (e) {}
  };

  const handleCreateThread = async () => {
    if (!problem) return;
    setThreadSubmitting(true);
    try {
      const res = await discussionsAPI.createThread({
        problemId: problem._id,
        title: newThread.title,
        body: newThread.body,
        tags: [newThread.tag]
      });
      setThreads([res.data, ...threads]);
      setShowCreateThread(false);
      setNewThread({ title: "", body: "", tag: "general" });
    } catch (e) {
      alert("Failed to create thread");
    } finally {
      setThreadSubmitting(false);
    }
  };

  const handleSubmitReply = async () => {
    if (!activeThread) return;
    setReplySubmitting(true);
    try {
      const res = await discussionsAPI.createReply(activeThread._id, { body: replyContent });
      setReplies([...replies, res.data]);
      setReplyContent("");
      setActiveThread({ ...activeThread, replyCount: activeThread.replyCount + 1 });
    } catch (e) {
      alert("Failed to post reply");
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleVoteThread = async (threadId: string, direction: 'up' | 'down') => {
    try {
      const res = await discussionsAPI.voteThread(threadId, direction);
      if (activeThread && activeThread._id === threadId) {
        setActiveThread({ ...activeThread, upvotes: res.data.upvotes, downvotes: res.data.downvotes });
      } else {
        setThreads(threads.map(t => t._id === threadId ? { ...t, upvotes: res.data.upvotes, downvotes: res.data.downvotes } : t));
      }
    } catch (e) {}
  };

  const handleVoteReply = async (replyId: string, direction: 'up' | 'down') => {
    try {
      const res = await discussionsAPI.voteReply(replyId, direction);
      setReplies(replies.map(r => r._id === replyId ? { ...r, upvotes: res.data.upvotes, downvotes: res.data.downvotes } : r));
    } catch (e) {}
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          handleSubmit();
        } else {
          handleRun();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [code, language, problem]);

  const handleEditorMount = (editor: any) => {
    setEditorInst(editor);
  };

  const getTestCases = () => testCases;

  const executeCode = async (executionId: string) => {
    const apiTestCases = getTestCases().map((tc: any) => ({
      id: tc.id,
      input: tc.input,
      expected: tc.expected,
    }));
    if (apiTestCases.length === 0) {
      throw new Error("This problem has no visible sample tests configured.");
    }

    const response = await runAPI.run({
      code,
      language,
      executionId,
      testCases: apiTestCases,
      config: {
        timeLimit: problem?.config?.timeLimit,
        memoryLimit: problem?.config?.memoryLimit,
        executionMode: problem?.config?.executionMode,
        functionSignature: problem?.config?.functionSignature,
      },
    });
    let data = response.data;
    if (data.status === "queued" && data.jobId) {
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        if (activeExecutionIdRef.current !== executionId) {
          return null;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        if (activeExecutionIdRef.current !== executionId) {
          return null;
        }
        const jobResponse = await runAPI.getJob(data.jobId);
        data = jobResponse.data;
        if (!["waiting", "active", "delayed", "prioritized", "queued"].includes(data.status)) {
          break;
        }
      }
      if (activeExecutionIdRef.current !== executionId) {
        return null;
      }
      if (["waiting", "active", "delayed", "prioritized", "queued"].includes(data.status)) {
        throw new Error("Execution is taking longer than expected. Please try again.");
      }
    }

    if (activeExecutionIdRef.current !== executionId) {
      return null;
    }

    let resultState: RunResult;
    if (!data.success) {
      resultState = {
        executionId,
        status: (data.status as SubmissionStatus) || "error",
        results: data.results || [],
        runtime: data.runtime || 0,
        logs: data.message ? [data.message] : [],
        passedCount: data.passedCount || 0,
        totalCount: data.totalCount || 0,
      };
    } else {
      const allLogs: string[] = [];
      for (const r of data.results || []) {
        if (r.logs && r.logs.length > 0) {
          allLogs.push(...r.logs);
        }
      }
      resultState = {
        executionId,
        status: data.status as SubmissionStatus,
        results: data.results || [],
        runtime: data.runtime || 0,
        logs: allLogs,
        passedCount: data.passedCount || 0,
        totalCount: data.totalCount || 0,
      };
    }
    
    return { data, resultState };
  };

  const handleRun = useCallback(async () => {
    if (typeof window !== "undefined" && !localStorage.getItem("codeskill_token")) {
      setShowLoginModal(true);
      return;
    }
    const executionId = crypto.randomUUID();
    activeExecutionIdRef.current = executionId;
    setActiveExecutionId(executionId);
    setIsRunning(true);
    setRunResult(null); // Explicitly clear previous result to prevent stale output
    try {
      const result = await executeCode(executionId);
      if (!result || activeExecutionIdRef.current !== executionId) {
        // Newer execution took precedence; ignore stale result
        return;
      }
      setRunResult(result.resultState);
      setActiveResultCase(0);
      setActiveBottomTab("console");
    } catch (err: any) {
      if (activeExecutionIdRef.current !== executionId) return;
      if (err.response?.status === 401 || err.response?.status === 403) {
        setRunResult({
          executionId,
          status: "error",
          results: [],
          runtime: 0,
          logs: ["Authentication required.\nYour session is no longer authorized to execute code.\nPlease sign in again."],
          passedCount: 0,
          totalCount: 0,
        });
        setShowLoginModal(true);
      } else {
        setRunResult({
          executionId,
          status: "error",
          results: [],
          runtime: 0,
          logs: [err.response?.data?.message || err.message || "Failed to connect to the backend."],
          passedCount: 0,
          totalCount: 0,
        });
      }
      setActiveBottomTab("console");
    } finally {
      if (activeExecutionIdRef.current === executionId) {
        setIsRunning(false);
      }
    }
  }, [code, language, problem]);

  const handleSubmit = useCallback(async () => {
    if (typeof window !== "undefined" && !localStorage.getItem("codeskill_token")) {
      setShowLoginModal(true);
      return;
    }
    setIsSubmitting(true);
    setRunResult(null);
    try {
      const submitRes = await submissionAPI.submit({
        problemId: problem._id || problem.id,
        language,
        code,
        category: problem.categories?.[0] || "General",
        difficulty: problem.difficulty,
      });

      const submissionId =
        submitRes.data?.submissionId ||
        submitRes.data?.submission?._id ||
        submitRes.data?.submission?.id;

      if (submissionId) {
        const finalRes = await submissionAPI.awaitResult(submissionId, {
          timeoutMs: 45000,
          intervalMs: 1000,
        });
        const finalData = finalRes.data;
        const results = Array.isArray(finalData.testResults)
          ? finalData.testResults.map((r: any, idx: number) => ({
              id: r.id ?? idx + 1,
              passed: r.passed ?? r.status === "accepted",
              status: r.status,
              output: r.output ?? r.stdout ?? "",
              expected: r.expected ?? "",
              error: r.error ?? r.stderr ?? "",
              executionTime: r.executionTime ?? r.runtime,
              memory: r.memory,
            }))
          : [];

        setRunResult({
          status: (finalData.status || "completed") as SubmissionStatus,
          results,
          runtime: finalData.runtime || 0,
          logs: finalData.compileOutput ? [finalData.compileOutput] : [],
          passedCount: finalData.testCasesPassed || 0,
          totalCount: finalData.totalTestCases || 0,
        });
      } else {
        const executionId = crypto.randomUUID();
        activeExecutionIdRef.current = executionId;
        const res = await executeCode(executionId);
        if (res && activeExecutionIdRef.current === executionId) {
          setRunResult(res.resultState);
        }
      }
      setActiveResultCase(0);
      setActiveBottomTab("console");
    } catch (err: any) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setRunResult({
          status: "error",
          results: [],
          runtime: 0,
          logs: ["Authentication required.\nYour session is no longer authorized to execute code.\nPlease sign in again."],
          passedCount: 0,
          totalCount: 0,
        });
        setShowLoginModal(true);
      } else {
        setRunResult({
          status: "error",
          results: [],
          runtime: 0,
          logs: [err.response?.data?.message || err.message || "Failed to retrieve submission verdict."],
          passedCount: 0,
          totalCount: 0,
        });
      }
      setActiveBottomTab("console");
    } finally {
      setIsSubmitting(false);
    }
  }, [code, language, problem, executeCode]);

  const handleSaveNote = () => {
    if (!problem) return;
    setNoteSaving(true);
    localStorage.setItem(`codeskill_note_${problem.slug}`, noteContent);
    setTimeout(() => setNoteSaving(false), 500);
  };

  const handleResetCode = () => {
    if (!problem) return;
    const starterCode = editorStarterCode(problem.config?.starterCode, language);
    const defaultCode = starterCode || LANGUAGES.find(l => l.id === language)?.defaultCode || "";
    setCode(defaultCode);
    localStorage.removeItem(`codeskill_draft_${problem.slug}_${language}`);
  };

  const handleCopyCode = async () => {
    try {
      if (typeof document !== "undefined" && document.hasFocus() && navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
        return;
      }
    } catch (e) {
      // Fall back if document is unfocused or clipboard API is blocked
    }
    try {
      const textArea = document.createElement("textarea");
      textArea.value = code;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    } catch (err) {
      console.warn("Copy failed", err);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading problem...</p>
        </div>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background text-foreground gap-4">
        <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-2">
          <XCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold">Problem Not Found</h1>
        <p className="text-muted-foreground text-sm">The problem you're looking for doesn't exist or has been removed.</p>
        <Link href="/problems"><Button variant="outline" className="mt-2"><ArrowLeft className="w-4 h-4 mr-2" />Back to Problems</Button></Link>
      </div>
    );
  }

  const editorTheme = theme === "dark" ? "vs-dark" : "light";
  // Left-panel examples fall back to the public (non-hidden) test cases.
  const displaySamples = problem.statement?.samples?.length
    ? problem.statement.samples.filter(hasSampleContent)
    : (problem.testCases?.cases || [])
        .filter((tc: any) => tc.isHidden !== true && hasSampleContent(tc))
        .map((tc: any) => ({ input: tc.input, output: tc.output, explanation: tc.explanation }));
  const difficultyClass = DIFFICULTY_COLORS[problem.difficulty] || DIFFICULTY_COLORS.Easy;
  const acceptanceRate = problem.stats?.totalSubmissions > 0
    ? ((problem.stats.acceptedSubmissions / problem.stats.totalSubmissions) * 100).toFixed(1)
    : "N/A";

  return (
    <div ref={containerRef} className={`flex flex-col ${embedded ? "h-full" : "h-dvh"} bg-background overflow-hidden font-sans text-foreground relative`}>
      

        {/* ─── TOP NAVBAR ─────────────────────────────────────────────────── */}
        <header className="h-13 border-b border-[#1F2937] bg-[#0A0A0A] flex items-center justify-between px-4 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {!embedded && <Link 
              href="/problems" 
              title="Back to Problems" 
              className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-[#D1D5DB] transition-colors hover:bg-[#1F2937] hover:text-[#FFFFFF] shrink-0"
              onMouseEnter={(e) => gsap.to(e.currentTarget, { scale: 1.02, duration: 0.15 })}
              onMouseLeave={(e) => gsap.to(e.currentTarget, { scale: 1, duration: 0.15 })}
              onMouseDown={(e) => gsap.to(e.currentTarget, { scale: 0.98, duration: 0.15 })}
              onMouseUp={(e) => gsap.to(e.currentTarget, { scale: 1.02, duration: 0.15 })}
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Back</span>
            </Link>}
            
            <div className="w-px h-5 bg-[#374151] shrink-0" />
            
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary border border-border text-[11px] font-bold text-foreground/80 shrink-0">
                <ProgrammingLanguageIcon language={language} className="w-3.5 h-3.5" />
                <span>{LANGUAGES.find(l => l.id === language)?.name || "Language"}</span>
              </div>
              
              <h1 className="text-[15px] sm:text-[16px] font-bold text-foreground truncate max-w-[280px] md:max-w-[420px] whitespace-nowrap">
                {problem.title}
              </h1>
              
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wide shrink-0 ${difficultyClass}`}>
                {problem.difficulty}
              </span>
            </div>
            
            {/* Progress Indicator */}
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-md bg-secondary border border-border text-[11px] text-muted-foreground shrink-0 ml-1">
              <span className="font-medium text-foreground/80">Lesson Progress</span>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#10B981]" title="Completed" />
                <span className="w-2 h-2 rounded-full bg-primary" title="Current Lesson" />
                <span className="w-2 h-2 rounded-full bg-white/20" title="Upcoming" />
              </div>
            </div>

            {lastSaved && (
              <motion.span 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="hidden xl:flex text-[11px] text-muted-foreground ml-1 items-center gap-1.5 shrink-0"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" /> Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </motion.span>
            )}
          </div>
          
          <div className="relative flex items-center shrink-0 ml-auto z-50">
            <button
              type="button"
              onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
              className="inline-flex h-9 min-w-[120px] items-center justify-between gap-2 rounded-[8px] border border-[#3F3F46] bg-[#18181B] px-3 text-sm font-medium text-[#F3F4F6] hover:bg-[#27272A] focus:outline-none focus:ring-1 focus:ring-[#F5B800] transition-colors"
              aria-expanded={showLanguageDropdown}
              aria-haspopup="listbox"
              aria-label="Select programming language"
            >
              <span>{LANGUAGES.find(l => l.id === language)?.name || "Language"}</span>
              <ChevronDown className={`h-4 w-4 text-[#9CA3AF] transition-transform duration-200 ${showLanguageDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showLanguageDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowLanguageDropdown(false)} 
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute top-full right-0 mt-1.5 w-[140px] rounded-[10px] border border-[#3F3F46] bg-[#18181B] py-1.5 shadow-xl origin-top-right z-50"
                    role="listbox"
                  >
                  {LANGUAGES.filter(lang => !executionRuntimes.length || executionRuntimes.some(runtime => runtime.language === lang.id && runtime.enabled)).map(lang => (
                    <button
                      key={lang.id}
                      role="option"
                      aria-selected={language === lang.id}
                      onClick={() => {
                        setLanguage(lang.id);
                        try {
                          if (unwrappedParams?.id) localStorage.setItem(`codeskill_lang_p_${unwrappedParams.id}`, lang.id);
                        } catch {
                          // Preference persistence must never block the language switch.
                        }
                        setShowLanguageDropdown(false);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm text-[#E5E7EB] hover:bg-[#27272A] transition-colors text-left"
                    >
                      <span className={language === lang.id ? "text-[#F5B800] font-semibold" : "font-medium"}>{lang.name}</span>
                      {language === lang.id && <Check className="h-3.5 w-3.5 text-[#F5B800]" />}
                    </button>
                  ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
            
          </div>
        </header>

      {/* ─── MAIN ROW ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        {/* ═══════════════════════════════════════════════════════════════════════
            1. SLIM LEFT SIDEBAR (Activity Bar) — Modern Developer icon rail
           ═══════════════════════════════════════════════════════════════════════ */}
        <div className="w-12 border-r border-[#1F2937] bg-[#0A0A0A] flex flex-col items-center py-3 gap-1 z-10 shrink-0">
          
          {SIDEBAR_TABS.map(tab => (
            <SidebarIcon
              key={tab.id}
              icon={tab.icon}
              label={tab.label}
              shortcut={tab.shortcut}
              active={activeSidebarTab === tab.id}
              onClick={() => setActiveSidebarTab(tab.id)}
            />
          ))}
          
          <div className="flex-1" />
          <SidebarIcon icon={Settings} label="Settings" onClick={() => {}} />
        </div>

        {/* ─── PANELS ──────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-hidden p-1.5 relative z-0">
          <PanelGroup orientation="horizontal" className="gap-1.5">
            
            {/* ═══════════════════════════════════════════════════════════════
                CENTER PANEL — Problem Description / Editorial / Hints / etc.
               ═══════════════════════════════════════════════════════════════ */}
            <Panel defaultSize={40} minSize={20} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col shadow-sm">
              
              {/* Panel Header */}
              <div className="px-3.5 py-2 border-b border-border bg-muted/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  {(() => {
                    const tab = SIDEBAR_TABS.find(t => t.id === activeSidebarTab);
                    const TabIcon = tab?.icon || FileText;
                    return <TabIcon className="w-3.5 h-3.5 text-primary" />;
                  })()}
                  <span className="text-xs font-bold text-foreground capitalize">
                    {activeSidebarTab.replace('_', ' ')}
                  </span>
                </div>
              </div>
              
              {/* Panel Body (Scrolls Independently) */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeSidebarTab}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.15 }}
                    className="h-full"
                  >
                    {/* ──────────── DESCRIPTION TAB ──────────── */}
                    {activeSidebarTab === "description" && (
                      <div className="p-5">
                        {/* Problem Metadata Bar */}
                        <div className="flex flex-wrap gap-2 mb-5">
                          <MetaBadge icon={Target} label={problem.difficulty} className={difficultyClass} />
                          <MetaBadge icon={BarChart3} label={`${acceptanceRate}% acceptance`} className="bg-secondary border-border text-foreground/80 text-[11px]" />
                          <MetaBadge icon={Zap} label={`${problem.stats?.totalSubmissions || 0} submissions`} className="bg-secondary border-border text-foreground/80 text-[11px]" />
                          {problem.config?.timeLimit && <MetaBadge icon={Clock} label={`${problem.config.timeLimit}ms`} className="bg-secondary border-border text-foreground/80 text-[11px]" />}
                          {problem.config?.memoryLimit && <MetaBadge icon={Code2} label={`${problem.config.memoryLimit}MB`} className="bg-secondary border-border text-foreground/80 text-[11px]" />}
                        </div>
                        
                        {/* Tags */}
                        {(problem.tags?.length > 0 || problem.categories?.length > 0) && (
                          <div className="flex flex-wrap gap-1.5 mb-5">
                            {(problem.categories || []).map((cat: string) => (
                              <span key={cat} className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/30">
                                {cat}
                              </span>
                            ))}
                            {(problem.tags || []).map((tag: string) => (
                              <span key={tag} className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-secondary text-foreground/80 border border-border">
                                <Hash className="w-2.5 h-2.5 inline mr-0.5 text-muted-foreground" />{tag}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        {/* Description Content */}
                        <div className="prose dark:prose-invert prose-sm max-w-none text-foreground/80 text-[15px] leading-[1.6]
                          prose-headings:text-foreground prose-headings:font-bold prose-headings:text-[18px]
                          prose-p:text-foreground/80 prose-p:leading-[1.6] prose-p:text-[15px]
                          prose-strong:text-foreground
                          prose-code:text-foreground/80 prose-code:bg-muted prose-code:border prose-code:border-border prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.9em] prose-code:font-mono
                          prose-pre:bg-secondary prose-pre:border prose-pre:border-border prose-pre:rounded-xl
                          prose-ul:text-foreground/80 prose-ol:text-foreground/80
                        ">
                          <div dangerouslySetInnerHTML={{ __html: problem.statement?.description || problem.description || "" }} />
                        </div>
                        
                        {/* Constraints */}
                        {(problem.statement?.constraints || problem.constraints) && (
                          <div className="mt-6 p-4 bg-secondary border border-amber-500/20 rounded-xl">
                            <h3 className="text-xs font-bold text-[#F59E0B] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5" /> Constraints
                            </h3>
                            <div className="text-xs text-foreground/80 leading-relaxed prose dark:prose-invert prose-sm max-w-none"
                              dangerouslySetInnerHTML={{
                                __html: Array.isArray(problem.statement?.constraints)
                                  ? problem.statement.constraints.join("<br />")
                                  : Array.isArray(problem.constraints)
                                  ? problem.constraints.join("<br />")
                                  : problem.statement?.constraints || problem.constraints || "",
                              }}
                            />
                          </div>
                        )}

                        {/* Sample Test Cases in Description */}
                        {displaySamples.length > 0 && (
                          <div className="mt-6 space-y-3">
                            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Examples</h3>
                            {displaySamples.map((sample: any, i: number) => (
                              <div key={i} className="border border-border bg-secondary rounded-xl overflow-hidden">
                                <div className="bg-muted/50 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Example {i + 1}
                                </div>
                                <div className="p-3.5 space-y-2.5 font-mono text-xs text-foreground/80">
                                  {sample.input && (
                                    <div>
                                      <span className="text-muted-foreground text-[10px] font-sans font-semibold uppercase">Input: </span>
                                      <pre className="bg-card border border-border/50 rounded-lg p-2.5 mt-1 text-foreground whitespace-pre-wrap">{sample.input}</pre>
                                    </div>
                                  )}
                                  {sample.output && (
                                    <div>
                                      <span className="text-muted-foreground text-[10px] font-sans font-semibold uppercase">Output: </span>
                                      <pre className="bg-card border border-border/50 rounded-lg p-2.5 mt-1 text-foreground whitespace-pre-wrap">{sample.output}</pre>
                                    </div>
                                  )}
                                  {sample.explanation && (
                                    <div className="text-foreground/80 font-sans text-xs mt-2 leading-relaxed">
                                      <span className="font-semibold text-foreground">Explanation: </span>
                                      {sample.explanation}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* ──────────── SAMPLES TAB ──────────── */}
                    {activeSidebarTab === "samples" && (
                      <div className="p-5">
                        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">
                          Sample Test Cases
                        </h3>
                        <SampleTestCasesPanel
                          samples={displaySamples}
                          onLoad={(sample) => {
                            const match = testCases.findIndex(
                              (tc: any) => (tc.input || "") === (sample.input || ""),
                            );
                            setActiveTestCase(match >= 0 ? match : 0);
                            setActiveBottomTab("testcases");
                          }}
                        />
                      </div>
                    )}

                    {/* ──────────── EDITORIAL TAB ──────────── */}
                    {activeSidebarTab === "editorial" && (
                      <div className="p-5">
                        {problem.editorial ? (
                          <div className="prose dark:prose-invert prose-sm max-w-none text-foreground/80 text-[15px] leading-[1.6]
                            prose-headings:text-foreground
                            prose-code:text-foreground/80 prose-code:bg-muted prose-code:border prose-code:border-border prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.9em]
                            prose-pre:bg-secondary prose-pre:border prose-pre:border-border prose-pre:rounded-xl
                          ">
                            <div dangerouslySetInnerHTML={{ __html: problem.editorial }} />
                          </div>
                        ) : (
                          <EmptyState
                            icon={BookOpen}
                            title="No Editorial Available"
                            description="The editorial for this problem hasn't been published yet. Try solving it on your own first!"
                          />
                        )}
                      </div>
                    )}
                    {/* ──────────── SUBMISSIONS TAB ──────────── */}
                    {activeSidebarTab === "submissions" && (
                      <div className="p-4">
                        {submissionsLoading ? (
                          <div className="flex items-center justify-center py-12">
                            <Spinner className="w-5 h-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : submissions.length > 0 ? (
                          <div className="space-y-2">
                            {submissions.map((sub: any, i: number) => (
                              <div key={i} className="p-3 rounded-xl border border-border bg-secondary hover:bg-accent transition-colors cursor-pointer group">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className={`text-xs font-bold ${
                                    sub.status === "accepted" ? "text-emerald-400" :
                                    sub.status === "wrong_answer" ? "text-rose-400" : "text-amber-400"
                                  }`}>
                                    {sub.status === "accepted" ? "✓ Accepted" :
                                     sub.status === "wrong_answer" ? "✗ Wrong Answer" : "⚠ Error"}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {new Date(sub.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-foreground/80">
                                  <span className="flex items-center gap-1"><Code2 className="w-3 h-3 text-primary" />{sub.language}</span>
                                  {sub.runtime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{sub.runtime}ms</span>}
                                  <span className="flex items-center gap-1"><Target className="w-3 h-3" />{sub.testCasesPassed}/{sub.totalTestCases}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            icon={History}
                            title="No Submissions Yet"
                            description="Submit your solution to see your submission history here."
                          />
                        )}
                      </div>
                    )}

                    {/* ──────────── HINTS TAB ──────────── */}
                    {activeSidebarTab === "hints" && (
                      <div className="p-5">
                        {problem.hints?.length > 0 ? (
                          <div className="space-y-3">
                            {problem.hints.map((hint: string, i: number) => (
                              <div key={i} className="border border-border bg-secondary rounded-xl overflow-hidden">
                                <button
                                  onClick={() => {
                                    const newSet = new Set(revealedHints);
                                    if (newSet.has(i)) newSet.delete(i);
                                    else newSet.add(i);
                                    setRevealedHints(newSet);
                                  }}
                                  className="w-full flex items-center justify-between p-3.5 text-left hover:bg-accent/50 transition-colors"
                                >
                                  <span className="text-xs font-semibold text-foreground flex items-center gap-2">
                                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                                    Hint {i + 1}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {revealedHints.has(i) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </span>
                                </button>
                                <AnimatePresence>
                                  {revealedHints.has(i) && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="px-3.5 pb-3.5 text-xs text-foreground/80 leading-relaxed border-t border-border pt-2.5"
                                        dangerouslySetInnerHTML={{ __html: hint }}
                                      />
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            icon={Lightbulb}
                            title="No Hints Available"
                            description="This problem doesn't have any hints. Try breaking it down into smaller sub-problems!"
                          />
                        )}
                      </div>
                    )}

                    {/* ──────────── NOTES TAB ──────────── */}
                    {activeSidebarTab === "notes" && (
                      <div className="p-4 flex flex-col h-full">
                        <textarea
                          value={noteContent}
                          onChange={(e) => setNoteContent(e.target.value)}
                          placeholder="Write your notes here... Markdown is supported."
                          className="flex-1 min-h-[200px] w-full bg-secondary border border-border rounded-xl p-4 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/60 transition-all font-mono"
                        />
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-[10px] text-muted-foreground">{noteContent.length} characters</span>
                          <Button size="sm" onClick={handleSaveNote} disabled={noteSaving} className="h-7 px-3 text-xs bg-primary hover:bg-primary/90 text-white">
                            {noteSaving ? <Spinner className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                            {noteSaving ? "Saving..." : "Save Note"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* ──────────── DISCUSSION TAB ──────────── */}
                    {activeSidebarTab === "discussion" && (
                      <div className="flex flex-col h-full bg-card relative">
                        {discussionLoading ? (
                          <div className="flex items-center justify-center py-12">
                            <Spinner className="w-5 h-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : activeThread ? (
                          /* Thread Detail View */
                          <div className="flex flex-col h-full absolute inset-0 bg-card overflow-y-auto z-10">
                            <div className="p-4 border-b border-border sticky top-0 bg-muted/50/95 backdrop-blur-sm flex items-center gap-2">
                              <button onClick={() => setActiveThread(null)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-all">
                                <ArrowLeft className="w-4 h-4" />
                              </button>
                              <div className="flex-1 truncate font-semibold text-sm text-foreground">{activeThread.title}</div>
                            </div>
                            
                            <div className="p-5">
                              {/* Main Post */}
                              <div className="flex gap-4">
                                <div className="flex flex-col items-center gap-1">
                                  <button onClick={() => handleVoteThread(activeThread._id, 'up')} className={`p-1.5 rounded-lg ${activeThread.upvotedBy?.includes('me') ? 'text-primary bg-primary/15' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}>
                                    <ThumbsUp className="w-4 h-4" />
                                  </button>
                                  <span className="text-xs font-bold font-mono text-foreground">{activeThread.upvotes - activeThread.downvotes}</span>
                                  <button onClick={() => handleVoteThread(activeThread._id, 'down')} className={`p-1.5 rounded-lg ${activeThread.downvotedBy?.includes('me') ? 'text-rose-400 bg-rose-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'}`}>
                                    <ThumbsDown className="w-4 h-4" />
                                  </button>
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">
                                      {activeThread.author?.name?.[0] || 'U'}
                                    </div>
                                    <span className="text-xs font-semibold text-foreground">{activeThread.author?.name || 'User'}</span>
                                    <span className="text-[10px] text-muted-foreground">{new Date(activeThread.createdAt).toLocaleDateString()}</span>
                                    {activeThread.tags?.map((t: string) => (
                                      <span key={t} className="ml-auto text-[9px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-foreground/80 border border-border uppercase tracking-wider">{t}</span>
                                    ))}
                                  </div>
                                  <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{activeThread.body}</div>
                                </div>
                              </div>
                              
                              <div className="w-full h-px bg-muted my-6" />
                              
                              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Replies ({replies.length})</h3>
                              
                              {/* Replies */}
                              <div className="space-y-4">
                                {replies.map((reply: any) => (
                                  <div key={reply._id} className="flex gap-3 p-3 bg-secondary border border-border rounded-xl">
                                    <div className="w-6 h-6 rounded-full bg-card border border-border flex shrink-0 items-center justify-center text-[10px] font-bold text-foreground/80 mt-1">
                                      {reply.author?.name?.[0] || 'U'}
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-xs font-semibold text-foreground">{reply.author?.name || 'User'}</span>
                                        <span className="text-[10px] text-muted-foreground">{new Date(reply.createdAt).toLocaleDateString()}</span>
                                      </div>
                                      <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap mb-2">{reply.body}</div>
                                      <div className="flex items-center gap-3">
                                        <button onClick={() => handleVoteReply(reply._id, 'up')} className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground hover:text-primary transition-colors">
                                          <ThumbsUp className="w-3.5 h-3.5" /> {reply.upvotes}
                                        </button>
                                        <button onClick={() => handleVoteReply(reply._id, 'down')} className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground hover:text-rose-400 transition-colors">
                                          <ThumbsDown className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              
                              {/* Reply Input */}
                              <div className="mt-8 flex gap-3">
                                <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex shrink-0 items-center justify-center text-[10px] font-bold">You</div>
                                <div className="flex-1 flex flex-col gap-2">
                                  <textarea 
                                    value={replyContent}
                                    onChange={(e) => setReplyContent(e.target.value)}
                                    placeholder="Write a reply..."
                                    className="w-full bg-secondary border border-border rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/60 min-h-[80px]"
                                  />
                                  <div className="flex justify-end">
                                    <Button size="sm" disabled={!replyContent.trim() || replySubmitting} onClick={handleSubmitReply} className="h-7 text-xs px-3 bg-primary hover:bg-primary/90 text-white">
                                      {replySubmitting ? <Spinner className="w-3 h-3 animate-spin mr-1.5" /> : <Send className="w-3 h-3 mr-1.5" />} Post Reply
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : showCreateThread ? (
                          /* Create Thread View */
                          <div className="p-5 flex flex-col h-full bg-card">
                            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-border">
                              <button onClick={() => setShowCreateThread(false)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-all">
                                <ArrowLeft className="w-4 h-4" />
                              </button>
                              <div className="font-semibold text-sm text-foreground">New Discussion</div>
                            </div>
                            
                            <div className="space-y-4 flex-1">
                              <div>
                                <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">Title</label>
                                <input 
                                  value={newThread.title}
                                  onChange={(e) => setNewThread({...newThread, title: e.target.value})}
                                  placeholder="What's on your mind?"
                                  className="w-full bg-secondary border border-border rounded-lg h-9 px-3 text-sm text-foreground outline-none focus:border-primary/60"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">Category</label>
                                <select 
                                  value={newThread.tag}
                                  onChange={(e) => setNewThread({...newThread, tag: e.target.value})}
                                  className="w-full bg-secondary border border-border rounded-lg h-9 px-3 text-sm text-foreground outline-none focus:border-primary/60 appearance-none"
                                >
                                  <option value="general">General</option>
                                  <option value="approach">Approach</option>
                                  <option value="help">Need Help</option>
                                  <option value="solution">Solution</option>
                                </select>
                              </div>
                              <div className="flex-1 flex flex-col">
                                <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1 block">Body</label>
                                <textarea 
                                  value={newThread.body}
                                  onChange={(e) => setNewThread({...newThread, body: e.target.value})}
                                  placeholder="Describe your question, approach, or solution in detail..."
                                  className="w-full flex-1 bg-secondary border border-border rounded-lg p-3 text-sm text-foreground resize-none outline-none focus:border-primary/60 min-h-[200px]"
                                />
                              </div>
                            </div>
                            
                            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
                              <Button variant="outline" size="sm" onClick={() => setShowCreateThread(false)} className="h-8 text-xs bg-secondary border-border text-foreground hover:bg-accent">Cancel</Button>
                              <Button size="sm" onClick={handleCreateThread} disabled={!newThread.title.trim() || !newThread.body.trim() || threadSubmitting} className="h-8 text-xs bg-primary hover:bg-primary/90 text-white">
                                {threadSubmitting ? <Spinner className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null} Post Discussion
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* Thread List View */
                          <>
                            <div className="p-3 border-b border-border flex justify-between items-center sticky top-0 bg-muted/50/95 backdrop-blur-sm z-10">
                              <select 
                                value={discussionFilter}
                                onChange={(e) => setDiscussionFilter(e.target.value)}
                                className="bg-secondary border border-border text-xs font-semibold text-foreground outline-none cursor-pointer px-2.5 py-1 rounded-md"
                              >
                                <option value="all">All Topics</option>
                                <option value="approach">Approaches</option>
                                <option value="help">Need Help</option>
                                <option value="solution">Solutions</option>
                              </select>
                              
                              <Button size="sm" onClick={() => setShowCreateThread(true)} className="h-7 text-xs px-3 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30">
                                <Plus className="w-3 h-3 mr-1" /> New Post
                              </Button>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                              {threads.length > 0 ? threads.map((thread: any) => (
                                <div key={thread._id} onClick={() => loadThread(thread)} className="p-3 rounded-xl border border-border bg-secondary hover:bg-accent transition-colors cursor-pointer group flex gap-3 items-start">
                                  <div className="flex flex-col items-center gap-1 min-w-[40px]">
                                    <div className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-xs font-bold text-foreground/80 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                      {thread.author?.name?.[0] || 'U'}
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-semibold text-foreground truncate mb-1 group-hover:text-primary transition-colors">{thread.title}</h4>
                                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                      <span className="truncate max-w-[100px] text-foreground/80">{thread.author?.name || 'User'}</span>
                                      <span className="w-1 h-1 rounded-full bg-white/[0.12]" />
                                      <span>{new Date(thread.createdAt).toLocaleDateString()}</span>
                                      <span className="w-1 h-1 rounded-full bg-white/[0.12]" />
                                      <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> {thread.upvotes - thread.downvotes}</span>
                                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {thread.replyCount}</span>
                                      
                                      {thread.tags?.map((t: string) => (
                                        <span key={t} className="ml-auto px-1.5 py-0.5 rounded bg-card border border-white/[0.07] uppercase tracking-wider text-[9px] font-semibold text-foreground/80">{t}</span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )) : (
                                <EmptyState
                                  icon={MessageSquare}
                                  title="No Discussions Found"
                                  description="Be the first to ask a question, share an approach, or post a solution!"
                                />
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* ──────────── AI TUTOR TAB ──────────── */}
                    {activeSidebarTab === "ai_tutor" && (
                      <div className="p-5">
                        <div className="rounded-xl border border-primary/30 bg-secondary p-5 shadow-sm">
                          <div className="flex items-center gap-2.5 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-md shadow-primary/20 text-white">
                              <Brain className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-foreground">AI Learning Tutor</h3>
                              <p className="text-[10px] text-muted-foreground">Personalized guided assistance</p>
                            </div>
                          </div>
                          <p className="text-xs text-foreground/80 leading-relaxed mb-4">
                            Get guidance on algorithms and edge cases without spoilers. Ask questions directly or pick a starter prompt below:
                          </p>
                          <div className="space-y-2">
                            {["Explain this problem in simpler terms", "What data structure should I consider?", "Give me a hint about the time complexity", "Help me debug my approach"].map((prompt, i) => (
                              <button key={i} onClick={() => setAskQuery(prompt)} className="w-full text-left px-3 py-2 rounded-lg border border-border bg-card text-xs text-foreground/80 hover:bg-accent hover:border-[#111111]/40 transition-all group">
                                <span className="text-primary mr-1.5 group-hover:text-primary">→</span> {prompt}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Sticky Ask Me Anything Assistant Bar */}
              <div className="p-3 border-t border-border bg-card/95 backdrop-blur-sm shrink-0">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!askQuery.trim()) return;
                    setActiveSidebarTab("ai_tutor");
                  }}
                  className="flex items-center gap-2 bg-secondary border border-white/[0.15] rounded-xl px-3 py-1.5 focus-within:border-[#111111]/70 focus-within:ring-1 focus-within:ring-[#111111]/40 transition-all"
                >
                  <Bot className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    value={askQuery}
                    onChange={(e) => setAskQuery(e.target.value)}
                    placeholder="Ask me anything about this lesson..."
                    className="bg-transparent text-xs text-foreground/90 placeholder:text-muted-foreground outline-none flex-1 min-w-0"
                  />
                  <button
                    type="submit"
                    disabled={!askQuery.trim()}
                    className="p-1.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary text-white transition-all shrink-0"
                    title="Ask AI Tutor"
                  >
                    <SendHorizontal className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </Panel>

            <PanelResizeHandle className="w-1.5 rounded-full bg-accent hover:bg-indigo-500/50 transition-colors cursor-col-resize" />

            {/* ═══════════════════════════════════════════════════════════════
                RIGHT PANEL — Editor + Console
               ═══════════════════════════════════════════════════════════════ */}
            <Panel defaultSize={60} minSize={30} className="flex flex-col gap-1.5">
              <PanelGroup orientation="vertical" className="gap-1.5">
                
                {/* ─── Editor ──────────────────────────────────────────── */}
                <Panel defaultSize={65} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col shadow-sm">
                  <div className="px-3.5 py-1.5 border-b border-border bg-muted flex justify-between items-center h-9 shrink-0">
                    <div className="flex items-center gap-2">
                      <List className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground bg-background px-2.5 py-0.5 rounded border border-border font-mono">
                        {LANGUAGES.find(l => l.id === language)?.ext}
                      </span>
                      {lastSaved && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground ml-1 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" /> Saved
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-muted-foreground hidden md:inline">
                        {LANGUAGES.find(l => l.id === language)?.name}
                      </span>
                      <div className="w-px h-3.5 bg-muted hidden md:inline" />
                      <button onClick={handleCopyCode} title="Copy code" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={handleResetCode} title="Reset to default" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-px h-3.5 bg-muted" />
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
                        <input type="checkbox" checked={vimMode} onChange={(e) => setVimMode(e.target.checked)} className="rounded border-white/[0.12] bg-background w-3 h-3 accent-primary" />
                        Vim
                      </label>
                    </div>
                  </div>
                  
                  {/* Vim Status Bar */}
                  <div id="vim-status" className={`text-[10px] px-3 bg-background text-foreground border-b border-border flex items-center font-mono transition-all ${vimMode ? 'h-5 opacity-100' : 'h-0 opacity-0 overflow-hidden border-none'}`}></div>

                  <div className="flex-1 min-h-0 relative bg-card">
                    <Editor
                      height="100%"
                      language={language}
                      theme={editorTheme}
                      value={editorCode}
                      onChange={(val) => setCode(updateSourceFromVisibleEditor(code, val || "", language))}
                      onMount={handleEditorMount}
                      options={{
                        minimap: { enabled: true, maxColumn: 80, scale: 1 },
                        fontSize: 13,
                        fontFamily: "JetBrains Mono, Fira Code, Menlo, Consolas, monospace",
                        fontLigatures: true,
                        folding: true,
                        bracketPairColorization: { enabled: true },
                        autoClosingBrackets: "always",
                        autoIndent: "full",
                        formatOnPaste: true,
                        formatOnType: true,
                        stickyScroll: { enabled: true },
                        padding: { top: 12, bottom: 12 },
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        cursorBlinking: "smooth",
                        cursorSmoothCaretAnimation: "on",
                        multiCursorModifier: "alt",
                        renderLineHighlight: "all",
                        renderWhitespace: "selection",
                        guides: { bracketPairs: true, indentation: true },
                      }}
                    />
                  </div>
                </Panel>

                <PanelResizeHandle className="h-1.5 rounded-full bg-accent hover:bg-primary/50 transition-colors cursor-row-resize" />

                {/* ─── Console / Testcases ─────────────────────────────── */}
                <Panel defaultSize={35} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col shadow-sm">
                  <div className="flex items-center border-b border-border bg-muted/50 px-2 py-1 gap-1 shrink-0">
                    <TabButton active={activeBottomTab === "testcases"} onClick={() => setActiveBottomTab("testcases")} icon={Terminal}>Output</TabButton>
                    <TabButton active={activeBottomTab === "console"} onClick={() => setActiveBottomTab("console")}>
                      Terminal
                      {runResult && (
                        <span className={`ml-1.5 w-2 h-2 rounded-full inline-block ${
                          runResult.status === "accepted" ? "bg-[#10B981]" :
                          runResult.status === "wrong_answer" ? "bg-[#EF4444]" :
                          runResult.status === "compile_error" ? "bg-[#F97316]" :
                          runResult.status === "time_limit" ? "bg-[#F59E0B]" : "bg-[#F59E0B]"
                        }`} />
                      )}
                    </TabButton>
                  </div>
                  <div className="flex-1 min-h-0 p-3.5 overflow-auto bg-background/60">
                    {activeBottomTab === "testcases" ? (
                      <>
                        <div className="flex gap-1.5 mb-3">
                          {testCases.map((tc: any, index: number) => (
                            <button
                              key={tc.id}
                              onClick={() => setActiveTestCase(index)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
                                activeTestCase === index 
                                  ? "bg-secondary text-foreground border border-white/[0.12] shadow-xs" 
                                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-transparent"
                              }`}
                            >
                              Case {tc.id}
                            </button>
                          ))}
                        </div>
                        
                        <div className="space-y-3 font-mono text-xs">
                          <div>
                            <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-sans font-semibold">Input</div>
                            <div className="bg-card border border-border rounded-lg p-2.5 text-foreground/80 whitespace-pre-wrap">{testCases[activeTestCase]?.input}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-sans font-semibold">Expected Output</div>
                            <div className="bg-card border border-border rounded-lg p-2.5 text-foreground/80 whitespace-pre-wrap">{testCases[activeTestCase]?.expected}</div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="font-mono text-xs">
                        {!runResult && !isRunning && !isSubmitting && (
                          <div className="text-muted-foreground text-xs flex flex-col h-full items-center justify-center py-8 gap-2">
                            <Terminal className="w-6 h-6 text-muted-foreground/40" />
                            <span>Click <kbd className="font-sans text-[10px] bg-secondary text-foreground/80 px-1.5 py-0.5 rounded border border-border">Run</kbd> or <kbd className="font-sans text-[10px] bg-secondary text-foreground/80 px-1.5 py-0.5 rounded border border-border">Submit</kbd> to execute your code.</span>
                          </div>
                        )}
                        
                        {(isRunning || isSubmitting) && (
                           <div className="text-foreground/80 text-xs flex h-full items-center justify-center py-8 gap-2">
                             <Spinner className="w-4 h-4 animate-spin text-primary" /> 
                             <span>{isSubmitting ? "Submitting solution..." : "Running code tests..."}</span>
                           </div>
                        )}

                        {runResult && !isRunning && !isSubmitting && (
                          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                            {/* Status Header */}
                            <div className={`flex items-center gap-2 font-semibold mb-3 text-sm font-sans ${
                              runResult.status === "accepted" ? "text-emerald-400" :
                              runResult.status === "wrong_answer" ? "text-rose-400" :
                              runResult.status === "compile_error" ? "text-orange-400" :
                              runResult.status === "time_limit" ? "text-yellow-400" :
                              runResult.status === "runtime_error" ? "text-amber-400" : "text-rose-400"
                            }`}>
                              {runResult.status === "accepted" ? (
                                <><CheckCircle2 className="w-5 h-5" /> Accepted</>
                              ) : runResult.status === "wrong_answer" ? (
                                <><XCircle className="w-5 h-5" /> Wrong Answer</>
                              ) : runResult.status === "compile_error" ? (
                                <><AlertTriangle className="w-5 h-5" /> Compilation Error</>
                              ) : runResult.status === "time_limit" ? (
                                <><Clock className="w-5 h-5" /> Time Limit Exceeded</>
                              ) : runResult.status === "runtime_error" ? (
                                <><AlertTriangle className="w-5 h-5" /> Runtime Error</>
                              ) : runResult.status === "system_error" ? (
                                <><AlertTriangle className="w-5 h-5" /> System Error</>
                              ) : (
                                <><AlertTriangle className="w-5 h-5" /> Error</>
                              )}
                              <span className="text-foreground/80 ml-auto text-[10px] font-sans font-medium bg-secondary px-2.5 py-0.5 rounded-full border border-border">
                                {runResult.passedCount}/{runResult.totalCount} passed
                              </span>
                            </div>

                            {/* Test Case Tabs */}
                            {runResult.results.length > 0 && (
                              <>
                                <div className="flex gap-1.5 mb-3">
                                  {runResult.results.map((r, i) => (
                                    <button
                                      key={r.id}
                                      onClick={() => setActiveResultCase(i)}
                                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                                        activeResultCase === i
                                          ? "bg-secondary text-foreground border border-white/[0.12] shadow-xs"
                                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-transparent"
                                      }`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${r.passed ? "bg-emerald-500" : "bg-rose-500"}`} />
                                      Case {r.id}
                                    </button>
                                  ))}
                                </div>

                                {runResult.results[activeResultCase] && (
                                  <div className="space-y-2.5">
                                    <div>
                                      <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-sans font-semibold">Your Output</div>
                                      <div className={`border rounded-lg p-2.5 whitespace-pre-wrap ${runResult.results[activeResultCase].passed ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-rose-500/10 border-rose-500/25 text-rose-400"}`}>
                                        {runResult.results[activeResultCase].output || "No output"}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-sans font-semibold">Expected</div>
                                      <div className="bg-card border border-border rounded-lg p-2.5 text-foreground/80 whitespace-pre-wrap">
                                        {runResult.results[activeResultCase].expected}
                                      </div>
                                    </div>
                                    {runResult.results[activeResultCase].error && (
                                      <div>
                                        <div className="text-[10px] text-rose-400 mb-1 uppercase tracking-wider font-sans font-semibold">Error</div>
                                        <div className="bg-rose-500/10 border border-rose-500/25 rounded-lg p-2.5 text-rose-400 whitespace-pre-wrap">
                                          {runResult.results[activeResultCase].error}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}

                            {/* Logs */}
                            {runResult.logs.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-white/[0.07]">
                                <div className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider font-sans font-semibold">Stdout</div>
                                <div className="bg-card border border-border rounded-lg p-2.5 space-y-0.5 font-mono text-[11px] text-foreground/80 max-h-32 overflow-auto">
                                  {runResult.logs.map((log, i) => (
                                    <div key={i}>{log}</div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Runtime Stats */}
                            <div className="mt-4 pt-3 border-t border-white/[0.07] flex gap-4 text-muted-foreground font-sans text-[11px]">
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Runtime: <span className="text-foreground font-semibold">{runResult.runtime} ms</span></span>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>
                </Panel>

              </PanelGroup>
            </Panel>

          </PanelGroup>
        </div>


      </div> {/* End MAIN ROW */}

      {/* ─── BOTTOM NAVIGATION BAR (STICKY ACTION BAR) ───────────────────── */}
      <footer className="coding-action-bar h-[64px] border-t border-[#1F2937] bg-[#0A0A0A] flex items-center justify-between px-6 shrink-0 shadow-[0_-4px_24px_rgba(0,0,0,0.04)] pb-[env(safe-area-inset-bottom)]">

          <div className="flex items-center gap-2">
            <Link href="/problems">
              <Button variant="ghost" className="h-[42px] px-4 text-[14px] font-semibold gap-2 text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-[#1F2937] rounded-[8px] btn-interactive">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleRun} disabled={isRunning || isSubmitting} className="h-[42px] px-5 text-[14px] font-bold gap-2 bg-[#1F2937] hover:bg-[#374151] text-[#E5E7EB] border border-[#374151] rounded-[8px] btn-interactive disabled:opacity-45 disabled:cursor-not-allowed">
              {isRunning ? <Spinner className="w-4 h-4 text-[#F5B800] animate-spin" /> : <Play className="w-4 h-4 text-[#F5B800]" />}
              <span>Run</span>
            </Button>
            <Button onClick={handleSubmit} disabled={isRunning || isSubmitting} className="bg-[#F5B800] hover:bg-[#D99F00] text-[#111111] h-[42px] px-6 text-[14px] font-bold gap-2 shadow-sm border-0 rounded-[8px] btn-interactive disabled:opacity-45 disabled:cursor-not-allowed">
              {isSubmitting ? <Spinner className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Submit</span>
            </Button>
            <Link href="/problems">
              <Button variant="outline" className="h-[42px] px-5 text-[14px] font-semibold gap-2 bg-transparent hover:bg-[#1F2937] text-[#D1D5DB] border border-[#4B5563] rounded-[8px] btn-interactive">
                <span className="hidden sm:inline">Next</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
      </footer>


      {/* Login Prompt Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowLoginModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e: any) => e.stopPropagation()}
              className="bg-card border border-white/[0.12] rounded-2xl p-8 max-w-sm w-full shadow-2xl relative overflow-hidden"
            >
              <div className="relative z-10 text-center">
                <div className="w-16 h-16 bg-primary/15 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-primary/30">
                  <User className="w-8 h-8 text-primary" />
                </div>
                
                <h3 className="text-xl font-bold text-foreground mb-2">Login Required</h3>
                <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
                  You need to be logged in to save your code submissions and track your progress.
                </p>
                
                <div className="flex flex-col gap-3">
                  <Link href="/login" className="w-full block">
                    <Button className="w-full bg-primary hover:bg-primary/90 text-white transition-all border-0 font-semibold">
                      Log In to Account
                    </Button>
                  </Link>
                  <Link href="/register" className="w-full block">
                    <Button variant="outline" className="w-full bg-secondary border-border text-foreground hover:bg-accent transition-all">
                      Create an Account
                    </Button>
                  </Link>
                </div>
              </div>
              
              <button 
                onClick={() => setShowLoginModal(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── REUSABLE COMPONENTS ──────────────────────────────────────────────────────

function SidebarIcon({ icon: Icon, label, shortcut, active = false, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
      aria-label={label}
      className={`p-2 rounded-lg transition-all relative group ${
        active 
          ? 'bg-primary/15 text-primary' 
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      }`}
    >
      <Icon className="w-[18px] h-[18px]" />
      {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-primary rounded-r-full" />}
    </button>
  );
}

function TabButton({ active, onClick, icon: Icon, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
        active 
          ? "bg-secondary text-foreground shadow-xs border border-white/[0.12]" 
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-transparent"
      }`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </button>
  );
}

function MetaBadge({ icon: Icon, label, className = "" }: any) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
      className || "text-foreground/80 bg-secondary border-border"
    }`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

function EmptyState({ icon: Icon, title, description }: any) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-xl bg-secondary border border-border flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-[240px] leading-relaxed">{description}</p>
    </div>
  );
}
