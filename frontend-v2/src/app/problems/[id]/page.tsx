"use client";

import { useExecutionRuntimes } from "@/hooks/useExecutionRuntimes";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  Play, Pause, Send, Download, Settings, BookOpen, Terminal, Clock, Timer, ChevronLeft, ChevronRight, ChevronDown,
  Maximize2, Minimize2, CheckCircle2, XCircle, AlertTriangle, 
  List, MessageSquare, Lightbulb, Sparkles, StickyNote, Tag, BarChart3,
  Trophy, Flame, Copy, RotateCcw, History, Eye, EyeOff, Plus, Trash2,
  ThumbsUp, ThumbsDown, ArrowLeft, Hash, Zap, Target, Award, TrendingUp,
  Code2, FileText, User, Check, ArrowRight
} from "lucide-react";
import PracticePet from "@/components/pet/PracticePet";
import { ProgrammingLanguageIcon } from "@/components/ui/ProgrammingLanguageIcon";
import Link from "next/link";
import { useState, useEffect, useCallback, use, useRef } from "react";
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from "react-resizable-panels";
import Editor from "@monaco-editor/react";
import { submissionAPI, runAPI, problemsAPI, discussionsAPI } from "@/config/api";
import { useTheme } from "@/context/ThemeContext";
import { Spinner } from "@/components/ui/spinner";
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
  { id: "editorial", icon: BookOpen, label: "Editorial", shortcut: "⌘E" },
  { id: "submissions", icon: History, label: "Submissions", shortcut: "⌘S" },
  { id: "hints", icon: Lightbulb, label: "Hints", shortcut: "⌘H" },
  { id: "notes", icon: StickyNote, label: "Notes", shortcut: "⌘N" },
  { id: "discussion", icon: MessageSquare, label: "Discussion", shortcut: "⌘/" },
];

const EDITOR_THEMES = [
  { id: "auto", label: "Match app theme" },
  { id: "codeskill-hackerrank", label: "HackerRank Light" },
  { id: "light", label: "Light" },
  { id: "vs-dark", label: "Dark" },
  { id: "codeskill-monokai", label: "Monokai" },
  { id: "codeskill-solarized", label: "Solarized Dark" },
];
const EDITOR_FONTS = ["Roboto Mono", "JetBrains Mono", "Fira Code", "Menlo", "Monaco", "Consolas"];

export default function ProblemWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const problemId = unwrappedParams.id;
  const { theme: appTheme } = useTheme();
  
  const [problem, setProblem] = useState<any>(null);
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
  const [language, setLanguage] = useState<string>("javascript");
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showEditorSettings, setShowEditorSettings] = useState(false);
  const [code, setCode] = useState<string>("");
  const [editorThemeName, setEditorThemeName] = useState("auto");
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [editorFontFamily, setEditorFontFamily] = useState("Roboto Mono");
  const [editorPreferencesReady, setEditorPreferencesReady] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const monacoRef = useRef<any>(null);

  const [vimMode, setVimMode] = useState(false);
  const [editorInst, setEditorInst] = useState<any>(null);
  const [vimInst, setVimInst] = useState<any>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("codeskill_editor_preferences_v2");
    if (saved) {
      try {
        const preferences = JSON.parse(saved);
        if (EDITOR_THEMES.some(({ id }) => id === preferences.theme)) setEditorThemeName(preferences.theme);
        if ([12, 13, 14, 16, 18, 20].includes(preferences.fontSize)) setEditorFontSize(preferences.fontSize);
        if (EDITOR_FONTS.includes(preferences.fontFamily)) setEditorFontFamily(preferences.fontFamily);
      } catch {
        localStorage.removeItem("codeskill_editor_preferences_v2");
      }
    }
    setEditorPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (!editorPreferencesReady) return;
    localStorage.setItem("codeskill_editor_preferences_v2", JSON.stringify({
      theme: editorThemeName,
      fontSize: editorFontSize,
      fontFamily: editorFontFamily,
    }));
  }, [editorPreferencesReady, editorThemeName, editorFontSize, editorFontFamily]);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  // Execution State
  const [activeBottomTab, setActiveBottomTab] = useState("testcases");
  const [activeTestCase, setActiveTestCase] = useState(0);
  const [activeResultCase, setActiveResultCase] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);

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
      const starterCode = problem.config?.starterCode?.[language];
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

  const handleEditorMount = (editor: any, monaco: any) => {
    setEditorInst(editor);
    monacoRef.current = monaco;
    monaco.editor.defineTheme("codeskill-hackerrank", {
      base: "vs", inherit: true,
      rules: [
        { token: "keyword", foreground: "7B2CBF" },
        { token: "string", foreground: "117A65" },
        { token: "number", foreground: "B45309" },
        { token: "comment", foreground: "728096", fontStyle: "italic" },
      ],
      colors: {
        "editor.background": "#FFFFFF", "editor.foreground": "#1F2937",
        "editorLineNumber.foreground": "#94A3B8", "editorLineNumber.activeForeground": "#2563EB",
        "editor.lineHighlightBackground": "#F5F7FA", "editor.selectionBackground": "#C9DDFB",
        "editorGutter.background": "#FFFFFF", "editorCursor.foreground": "#16A34A",
      },
    });
    monaco.editor.defineTheme("codeskill-monokai", {
      base: "vs-dark", inherit: true,
      rules: [
        { token: "keyword", foreground: "F92672" }, { token: "string", foreground: "E6DB74" },
        { token: "number", foreground: "AE81FF" }, { token: "comment", foreground: "75715E", fontStyle: "italic" },
      ],
      colors: { "editor.background": "#272822", "editor.lineHighlightBackground": "#30312B", "editorCursor.foreground": "#F8F8F0" },
    });
    monaco.editor.defineTheme("codeskill-solarized", {
      base: "vs-dark", inherit: true,
      rules: [
        { token: "keyword", foreground: "859900" }, { token: "string", foreground: "2AA198" },
        { token: "number", foreground: "D33682" }, { token: "comment", foreground: "657B83", fontStyle: "italic" },
      ],
      colors: { "editor.background": "#002B36", "editor.foreground": "#93A1A1", "editor.lineHighlightBackground": "#073642", "editorCursor.foreground": "#B58900" },
    });
    monaco.editor.setTheme(editorThemeName === "auto" ? (appTheme === "dark" ? "vs-dark" : "codeskill-hackerrank") : editorThemeName);
  };

  const downloadCode = () => {
    const extension = LANGUAGES.find((item) => item.id === language)?.ext || "solution.txt";
    const filename = `${(problem?.slug || "solution").replace(/[^a-z0-9-_]/gi, "-")}-${extension}`;
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const formattedElapsed = `${String(Math.floor(elapsedSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  const getTestCases = () => {
    if (!problem || !problem.testCases || !problem.testCases.cases || problem.testCases.cases.length === 0) {
      return [];
    }
    return problem.testCases.cases.map((tc: any, i: number) => ({ id: i + 1, input: tc.input, expected: tc.output }));
  };

  const executeCode = async () => {
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
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        const jobResponse = await runAPI.getJob(data.jobId);
        data = jobResponse.data;
        if (!["waiting", "active", "delayed", "prioritized", "queued"].includes(data.status)) {
          break;
        }
      }
      if (["waiting", "active", "delayed", "prioritized", "queued"].includes(data.status)) {
        throw new Error("Execution is taking longer than expected. Please try again.");
      }
    }

    let resultState: RunResult;
    if (!data.success) {
      resultState = {
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
    setIsRunning(true);
    setRunResult(null);
    try {
      const { resultState } = await executeCode();
      setRunResult(resultState);
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
          logs: [err.response?.data?.message || err.message || "Failed to connect to the backend."],
          passedCount: 0,
          totalCount: 0,
        });
      }
      setActiveBottomTab("console");
    } finally {
      setIsRunning(false);
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
      const { data, resultState } = await executeCode();
      setRunResult(resultState);
      setActiveResultCase(0);
      setActiveBottomTab("console");

      if (data.success && typeof window !== "undefined" && localStorage.getItem("codeskill_token")) {
        try {
          await submissionAPI.submit({
            problemId: problem._id,
            language,
            code,
            status: data.status,
            runtime: data.runtime || 0,
            memory: 0,
            testCasesPassed: data.passedCount,
            totalTestCases: data.totalCount,
            category: problem.categories?.[0] || "General",
            difficulty: problem.difficulty
          });
        } catch (err) {
          console.error("Failed to save submission to database", err);
        }
      } else if (!localStorage.getItem("codeskill_token")) {
        setShowLoginModal(true);
      }
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
          logs: [err.response?.data?.message || err.message || "Failed to connect to the backend."],
          passedCount: 0,
          totalCount: 0,
        });
      }
      setActiveBottomTab("console");
    } finally {
      setIsSubmitting(false);
    }
  }, [code, language, problem]);

  const handleSaveNote = () => {
    if (!problem) return;
    setNoteSaving(true);
    localStorage.setItem(`codeskill_note_${problem.slug}`, noteContent);
    setTimeout(() => setNoteSaving(false), 500);
  };

  const handleResetCode = () => {
    if (!problem) return;
    const starterCode = problem.config?.starterCode?.[language];
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

  const editorTheme = editorThemeName === "auto"
    ? (appTheme === "dark" ? "vs-dark" : "codeskill-hackerrank")
    : editorThemeName;
  const testCases = getTestCases();
  const difficultyClass = DIFFICULTY_COLORS[problem.difficulty] || DIFFICULTY_COLORS.Easy;
  const acceptanceRate = problem.stats?.totalSubmissions > 0
    ? ((problem.stats.acceptedSubmissions / problem.stats.totalSubmissions) * 100).toFixed(1)
    : "N/A";

  return (
    <div ref={containerRef} className="codeskill-problem-workspace flex flex-col h-dvh bg-background overflow-hidden font-sans text-foreground relative">
      

        {/* ─── TOP NAVBAR ─────────────────────────────────────────────────── */}
        <header className="workspace-topbar h-13 border-b border-[#1F2937] bg-[#0A0A0A] flex items-center justify-between px-4 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link 
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
            </Link>
            
            <div className="w-px h-5 bg-[#374151] shrink-0" />
            
            <div className="flex items-center gap-2 min-w-0">
              <div className="workspace-language-chip flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary border border-border text-[11px] font-bold text-foreground/80 shrink-0">
                <ProgrammingLanguageIcon language={language} className="w-3.5 h-3.5" />
                <span>{LANGUAGES.find(l => l.id === language)?.name || "Language"}</span>
              </div>
              
              <h1 className="text-[15px] sm:text-[16px] font-bold text-white truncate max-w-[280px] md:max-w-[420px] whitespace-nowrap">
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
            <div className="workspace-timer flex items-center gap-1 mr-2 rounded-md border border-[#3F3F46] bg-[#18181B] px-2 py-1 text-[13px] font-mono tabular-nums text-rose-300">
              <Timer className="h-3.5 w-3.5 text-[#A3A3A3]" aria-hidden="true" />
              <span aria-label={`Elapsed time ${formattedElapsed}`}>{formattedElapsed}</span>
              <button
                type="button"
                onClick={() => setTimerRunning((running) => !running)}
                className="ml-1 rounded p-1 text-[#F4F4F5] transition-colors hover:bg-[#303238]"
                aria-label={timerRunning ? "Pause timer" : "Start timer"}
                title={timerRunning ? "Pause timer" : "Start timer"}
              >
                {timerRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => { setTimerRunning(false); setElapsedSeconds(0); }}
                className="rounded p-1 text-[#A3A3A3] transition-colors hover:bg-[#303238] hover:text-white"
                aria-label="Reset timer"
                title="Reset timer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
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
            <button
              type="button"
              onClick={() => setShowEditorSettings((open) => !open)}
              className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#3F3F46] bg-[#18181B] text-[#D1D5DB] transition-colors hover:bg-[#27272A] hover:text-white"
              aria-label="Editor settings"
              aria-expanded={showEditorSettings}
              title="Editor settings"
            >
              <Settings className="h-4 w-4" />
            </button>
            <AnimatePresence>
              {showEditorSettings && (
                <>
                  <button className="fixed inset-0 z-40 cursor-default" aria-label="Close editor settings" onClick={() => setShowEditorSettings(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                    className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-[#3F3F46] bg-[#18181B] p-4 text-[#F4F4F5] shadow-2xl"
                    role="dialog" aria-label="Editor settings"
                  >
                    <div className="mb-3 text-sm font-semibold">Editor settings</div>
                    <label className="mb-3 block text-xs text-[#A1A1AA]">
                      Color theme
                      <select value={editorThemeName} onChange={(event) => setEditorThemeName(event.target.value)} className="mt-1.5 block h-9 w-full rounded-md border border-[#3F3F46] bg-[#242428] px-2.5 text-sm text-white outline-none focus:border-emerald-500">
                        {EDITOR_THEMES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-xs text-[#A1A1AA]">
                        Font size
                        <select value={editorFontSize} onChange={(event) => setEditorFontSize(Number(event.target.value))} className="mt-1.5 block h-9 w-full rounded-md border border-[#3F3F46] bg-[#242428] px-2.5 text-sm text-white outline-none focus:border-emerald-500">
                          {[12, 13, 14, 16, 18, 20].map((size) => <option key={size} value={size}>{size}px</option>)}
                        </select>
                      </label>
                      <label className="block text-xs text-[#A1A1AA]">
                        Font family
                        <select value={editorFontFamily} onChange={(event) => setEditorFontFamily(event.target.value)} className="mt-1.5 block h-9 w-full rounded-md border border-[#3F3F46] bg-[#242428] px-2 text-sm text-white outline-none focus:border-emerald-500">
                          {EDITOR_FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
                        </select>
                      </label>
                    </div>
                    <p className="mt-3 text-[11px] leading-relaxed text-[#92929B]">These preferences are saved in this browser.</p>
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
        <div className="workspace-activity-rail w-12 border-r border-[#1F2937] bg-[#0A0A0A] flex flex-col items-center py-3 gap-1 z-10 shrink-0">
          
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
          <SidebarIcon icon={Settings} label="Settings" active={showEditorSettings} onClick={() => setShowEditorSettings((open) => !open)} />
        </div>

        {/* ─── PANELS ──────────────────────────────────────────────────────── */}
        <div className="workspace-panels flex-1 min-h-0 overflow-hidden p-1.5 relative z-0">
          <PanelGroup orientation="horizontal" className="gap-1.5">
            
            {/* ═══════════════════════════════════════════════════════════════
                CENTER PANEL — Problem Description / Editorial / Hints / etc.
               ═══════════════════════════════════════════════════════════════ */}
            <Panel defaultSize={40} minSize={20} className="workspace-pane bg-card border border-border rounded-xl overflow-hidden flex flex-col shadow-sm">
              
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
                        {problem.statement?.samples?.length > 0 && (
                          <div className="mt-6 space-y-3">
                            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Examples</h3>
                            {problem.statement.samples.map((sample: any, i: number) => (
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

                  </motion.div>
                </AnimatePresence>
              </div>

            </Panel>

            <PanelResizeHandle className="workspace-resize-handle w-1.5 rounded-full bg-accent hover:bg-indigo-500/50 transition-colors cursor-col-resize" />

            {/* ═══════════════════════════════════════════════════════════════
                RIGHT PANEL — Editor + Console
               ═══════════════════════════════════════════════════════════════ */}
            <Panel defaultSize={60} minSize={30} className="flex flex-col gap-1.5">
              <PanelGroup orientation="vertical" className="gap-1.5">
                
                {/* ─── Editor ──────────────────────────────────────────── */}
                <Panel defaultSize={65} className="workspace-pane workspace-editor-pane bg-card border border-border rounded-xl overflow-hidden flex flex-col shadow-sm">
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
                      <button onClick={downloadCode} title="Download code" aria-label="Download code" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all">
                        <Download className="w-3.5 h-3.5" />
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
                      value={code}
                      onChange={(val) => setCode(val || "")}
                      onMount={handleEditorMount}
                      options={{
                        minimap: { enabled: false },
                        fontSize: editorFontSize,
                        fontFamily: `${editorFontFamily}, monospace`,
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

                <PanelResizeHandle className="workspace-resize-handle h-1.5 rounded-full bg-accent hover:bg-primary/50 transition-colors cursor-row-resize" />

                {/* ─── Console / Testcases ─────────────────────────────── */}
                <Panel defaultSize={35} className="workspace-pane workspace-output-pane bg-card border border-border rounded-xl overflow-hidden flex flex-col shadow-sm">
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
      <footer className="coding-action-bar workspace-action-bar h-[60px] border-t border-[#D8DDE4] bg-white flex items-center justify-between px-6 shrink-0 shadow-[0_-4px_12px_rgba(15,23,42,0.04)] pb-[env(safe-area-inset-bottom)]">

          <div className="flex items-center gap-2">
            <Link href="/problems">
              <Button variant="ghost" className="h-[38px] px-4 text-[13px] font-medium gap-2 text-[#475569] hover:text-[#111827] hover:bg-[#F1F5F9] rounded-[5px] btn-interactive">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleRun} disabled={isRunning || isSubmitting} className="h-[38px] px-4 text-[13px] font-medium gap-2 bg-white hover:bg-[#F8FAFC] text-[#334155] border border-[#CBD5E1] rounded-[5px] btn-interactive disabled:opacity-45 disabled:cursor-not-allowed">
              {isRunning ? <Spinner className="w-4 h-4 text-[#F5B800] animate-spin" /> : <Play className="w-4 h-4 text-[#F5B800]" />}
              <span>Run</span>
            </Button>
            <Button onClick={handleSubmit} disabled={isRunning || isSubmitting} className="bg-[#0E8A43] hover:bg-[#087638] text-white h-[38px] px-5 text-[13px] font-semibold gap-2 shadow-none border-0 rounded-[5px] btn-interactive disabled:opacity-45 disabled:cursor-not-allowed">
              {isSubmitting ? <Spinner className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Submit</span>
            </Button>
            <Link href="/problems">
              <Button variant="outline" className="h-[38px] px-4 text-[13px] font-medium gap-2 bg-white hover:bg-[#F8FAFC] text-[#334155] border border-[#CBD5E1] rounded-[5px] btn-interactive">
                <span className="hidden sm:inline">Next</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
      </footer>


      <PracticePet
        key={problem.slug}
        problemSlug={problem.slug}
        problemTitle={problem.title}
        code={code}
        language={language}
        workspace
      />

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
