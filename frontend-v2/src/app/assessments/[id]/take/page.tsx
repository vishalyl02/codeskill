"use client";

import { useEffect, useState, useRef, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  RotateCcw,
  Send,
  ShieldAlert,
  Maximize2,
  Minimize2,
  Layers,
  PanelLeft,
  Award,
  Check,
  Camera,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  Info,
  X
} from "lucide-react";
import { studentAssessmentsAPI } from "@/config/api";
import DSAAssessmentEditor from "@/components/assessment/DSAAssessmentEditor";
import SafeExamBrowser from "@/components/assessment/SafeExamBrowser";
import { Spinner } from "@/components/ui/spinner";
import { useAssessmentMedia } from "@/hooks/useAssessmentMedia";
import { releaseAssessmentStream } from "@/lib/assessment-media-session";
import { AssessmentReadingZoom } from "@/components/assessment/AssessmentReadingZoom";
import { ResizableAssessmentPanels } from "@/components/assessment/ResizableAssessmentPanels";
import { FloatingAssessmentMonitor } from "@/components/assessment/FloatingAssessmentMonitor";
import { CodeSnippet } from "@/components/assessment/CodeSnippet";

interface TestCase {
  id?: string;
  input: string;
  output?: string;
  expected?: string;
  explanation?: string;
  isHidden?: boolean;
}

interface Question {
  _id: string;
  questionIndex: number;
  question: string;
  questionType: string;
  topic: string;
  subtopic?: string;
  difficulty: string;
  marks: number;
  negativeMarks: number;
  options: string[];
  codeSnippet?: string;
  starterCode?: string;
  language?: string;
  constraints?: string | string[];
  supportedLanguages?: string[];
  timeLimit?: number;
  memoryLimit?: number;
  testCases?: TestCase[];
}

interface ViolationEvent {
  type: string;
  timestamp: string;
  details: string;
}

const MAX_FACE_WARNINGS = 5;

export default function TakeAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();

  // Test Session State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<
    Record<
      string,
      {
        selectedAnswer: number;
        code?: string;
        language?: string;
        testCasesPassed?: number;
        totalTestCases?: number;
        status: string;
      }
    >
  >({});
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [startedAt, setStartedAt] = useState<Date>(new Date());
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(2700);
  const [isLoading, setIsLoading] = useState(true);
  const [loadedAssessmentId, setLoadedAssessmentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionRequestedRef = useRef(false);
  const [assessmentTitle, setAssessmentTitle] = useState("Proctored Assessment");
  const [assessmentCode, setAssessmentCode] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const mediaCleanupRef = useRef<{ assessmentId: string; timer: number } | null>(null);

  // Stop any handed-off preflight stream when this route is really left. Defer
  // one event turn so React Strict Mode's development-only remount can cancel it.
  useEffect(() => {
    if (mediaCleanupRef.current?.assessmentId === id) {
      window.clearTimeout(mediaCleanupRef.current.timer);
      mediaCleanupRef.current = null;
    }
    return () => {
      const timer = window.setTimeout(() => {
        releaseAssessmentStream(id);
        if (mediaCleanupRef.current?.timer === timer) mediaCleanupRef.current = null;
      }, 0);
      mediaCleanupRef.current = { assessmentId: id, timer };
    };
  }, [id]);

  // Proctoring & Integrity Telemetry
  const [tabSwitches, setTabSwitches] = useState(0);
  const [maxTabSwitches, setMaxTabSwitches] = useState(3);
  const [violations, setViolations] = useState<ViolationEvent[]>([]);
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [violationMessage, setViolationMessage] = useState("");
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [warningToast, setWarningToast] = useState<{ id: number; message: string; type: "warning" | "alert" } | null>(null);

  // Camera & Voice Proctoring State
  const [isPipMinimized, setIsPipMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);


  const responsesRef = useRef(responses);
  responsesRef.current = responses;

  const tabSwitchesRef = useRef(tabSwitches);
  tabSwitchesRef.current = tabSwitches;

  const violationsRef = useRef(violations);
  violationsRef.current = violations;

  // Add a proctoring violation and sync telemetry
  const recordViolation = useCallback(
    (type: string, details: string) => {
      const newV: ViolationEvent = {
        type,
        timestamp: new Date().toISOString(),
        details,
      };
      const updated = [...violationsRef.current, newV];
      setViolations(updated);
      violationsRef.current = updated;

      // Temporary visual toast
      setWarningToast({
        id: Date.now(),
        message: type === "multiple_faces_detected"
          ? `Warning ${updated.filter(event => event.type === "multiple_faces_detected").length}/${MAX_FACE_WARNINGS}: ${details} The test will end at warning ${MAX_FACE_WARNINGS}.`
          : details,
        type: type === "tab_switch" ? "alert" : "warning",
      });

      // Sync with server immediately
      const formattedResponses = questions.map((q) => {
        const r = responsesRef.current[q._id];
        return {
          questionId: q._id,
          selectedAnswer: r ? r.selectedAnswer : -1,
          code: r?.code || "",
          language: r?.language || "python",
          testCasesPassed: r?.testCasesPassed || 0,
          totalTestCases: r?.totalTestCases || 0,
          status: r ? r.status : "unvisited",
        };
      });

      studentAssessmentsAPI.saveProgress(id, {
        responses: formattedResponses,
        timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
        violations: updated,
      }).catch(() => {});
    },
    [id, questions, startedAt]
  );

  // Start the attempt only after the candidate enters fullscreen from the secure gate.
  const startAttemptRequestedRef = useRef(false);
  const beginAssessmentAfterFullscreen = useCallback(async () => {
    if (startAttemptRequestedRef.current) return;
    startAttemptRequestedRef.current = true;
    setIsLoading(true);
    try {
      const isExplicitRetake = new URLSearchParams(window.location.search).get("retake") === "1";
      // A Redo action must discard any stale in-progress attempt and start a
      // fresh timer. Ordinary assessment entry still resumes an in-progress test.
      const res = isExplicitRetake
        ? await studentAssessmentsAPI.retakeAttempt(id)
        : await studentAssessmentsAPI.startAttempt(id);
      const data = res.data;
      setQuestions(data.questions || []);
      setDurationMinutes(data.durationMinutes || 45);
      if (data.code) setAssessmentCode(data.code);
      if (data.title) setAssessmentTitle(data.title);

      const start = new Date(data.startedAt || new Date());
      setStartedAt(start);

      const totalSecs = (data.durationMinutes || 45) * 60;
      const elapsedSecs = Math.floor((Date.now() - start.getTime()) / 1000);
      setTimeLeftSeconds(Math.max(0, totalSecs - elapsedSecs));

      if (data.proctoring?.maxTabSwitches) {
        setMaxTabSwitches(data.proctoring.maxTabSwitches);
      }

      const initialResponses: Record<
        string,
        {
          selectedAnswer: number;
          code?: string;
          language?: string;
          testCasesPassed?: number;
          totalTestCases?: number;
          status: string;
        }
      > = {};
      (data.savedResponses || []).forEach((r: any) => {
        if (r.questionId) {
          initialResponses[r.questionId.toString()] = {
            selectedAnswer: r.selectedAnswer ?? -1,
            code: r.code || "",
            language: r.language || "python",
            testCasesPassed: r.testCasesPassed || 0,
            totalTestCases: r.totalTestCases || 0,
            status:
              r.status ||
              (r.selectedAnswer >= 0 || (r.code && r.code.trim().length > 0)
                ? "answered"
                : "unvisited"),
          };
        }
      });
      setResponses(initialResponses);
      setLoadedAssessmentId(id);
    } catch (err: any) {
      console.error("Failed to start assessment:", err);
      releaseAssessmentStream(id);
      const message = err?.response?.data?.message;
      setStartError(Array.isArray(message) ? message.join(" ") : message || "We could not start this assessment. Please check your attempt eligibility and try again.");
      startAttemptRequestedRef.current = false;
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  // Media starts only for a loaded, active session; stopping is permanent for this assessment.
  const {
    videoRef,
    attachVideo,
    cameraActive,
    micActive,
    audioLevel,
    cameraError,
    faceCount,
    faceDetectionStatus,
    stopCamera,
  } = useAssessmentMedia(
    id, loadedAssessmentId === id && questions.length > 0 && !isLoading && !isSubmitting && timeLeftSeconds > 0, recordViolation,
  );

  // 3. Submit Attempt Handler
  const submitExam = useCallback(
    async (isAuto = false) => {
      if (isSubmitting || submissionRequestedRef.current) return;
      submissionRequestedRef.current = true;
      stopCamera();
      // Also release any preflight stream that was handed off but not adopted
      // by the exam media hook (for example, after a quick route transition).
      releaseAssessmentStream(id);
      setIsSubmitting(true);

      const formattedResponses = questions.map((q) => {
        const r = responsesRef.current[q._id];
        return {
          questionId: q._id,
          selectedAnswer: r ? r.selectedAnswer : -1,
          code: r?.code || "",
          language: r?.language || "python",
          testCasesPassed: r?.testCasesPassed || 0,
          totalTestCases: r?.totalTestCases || 0,
          status: r ? r.status : "skipped",
          timeSpentSeconds: 0,
        };
      });

      try {
        await studentAssessmentsAPI.submitAttempt(id, {
          responses: formattedResponses,
          timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
          violations: violationsRef.current,
        });
        router.replace(`/assessments/${id}/result`);
      } catch (err) {
        console.error("Submission response:", err);
        router.replace(`/assessments/${id}/result`);
      }
    },
    [id, isSubmitting, questions, startedAt, router, stopCamera]
  );

  const faceWarningCount = violations.filter(event => event.type === "multiple_faces_detected").length;
  useEffect(() => {
    if (faceWarningCount >= MAX_FACE_WARNINGS && loadedAssessmentId === id && !isLoading) {
      void submitExam(true);
    }
  }, [faceWarningCount, loadedAssessmentId, id, isLoading, submitExam]);

  // 4. Countdown Clock
  useEffect(() => {
    if (isLoading || isSubmitting) return;
    if (timeLeftSeconds <= 0) {
      void submitExam(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          submitExam(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLoading, isSubmitting, submitExam, timeLeftSeconds]);

  // 5. Autosave Progress Interval (Every 15 Seconds)
  useEffect(() => {
    if (isLoading) return;

    const autosaveInterval = setInterval(async () => {
      const formattedResponses = questions.map((q) => {
        const r = responsesRef.current[q._id];
        return {
          questionId: q._id,
          selectedAnswer: r ? r.selectedAnswer : -1,
          code: r?.code || "",
          language: r?.language || "python",
          testCasesPassed: r?.testCasesPassed || 0,
          totalTestCases: r?.totalTestCases || 0,
          status: r ? r.status : "unvisited",
        };
      });

      try {
        await studentAssessmentsAPI.saveProgress(id, {
          responses: formattedResponses,
          timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
          violations: violationsRef.current,
        });
      } catch (e) {
        // Silent background save
      }
    }, 15000);

    return () => clearInterval(autosaveInterval);
  }, [id, isLoading, questions, startedAt]);

  // Anti-Cheat functionality is now handled entirely by the SafeExamBrowser component.
  // The hooks below have been simplified to just rely on SafeExamBrowser.

  // Keyboard shortcuts, fullscreen logic, and context menu are handled by SafeExamBrowser.

  // Toast Auto-Dismiss
  useEffect(() => {
    if (!warningToast) return;
    const t = setTimeout(() => {
      setWarningToast(null);
    }, 4000);
    return () => clearTimeout(t);
  }, [warningToast]);

  // Fullscreen trigger helper
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Question Interaction Handlers
  const currentQ = questions[currentIndex];
  const currentResponse = currentQ ? responses[currentQ._id] : null;
  const selectedAnswer = currentResponse ? currentResponse.selectedAnswer : -1;

  const handleSelectOption = (optionIndex: number) => {
    if (!currentQ) return;
    setResponses((prev) => ({
      ...prev,
      [currentQ._id]: {
        selectedAnswer: optionIndex,
        status: prev[currentQ._id]?.status === "marked_for_review" ? "marked_for_review" : "answered",
      },
    }));
  };

  const handleClearSelection = () => {
    if (!currentQ) return;
    setResponses((prev) => ({
      ...prev,
      [currentQ._id]: {
        selectedAnswer: -1,
        status: prev[currentQ._id]?.status === "marked_for_review" ? "marked_for_review" : "skipped",
      },
    }));
  };

  const handleMarkForReview = () => {
    if (!currentQ) return;
    const previous = responsesRef.current[currentQ._id];
    const removing = previous?.status === "marked_for_review";
    const hasAnswer = (previous?.selectedAnswer ?? -1) >= 0 || Boolean(previous?.code?.trim());
    const next = { ...responsesRef.current, [currentQ._id]: {
      ...previous, selectedAnswer: previous?.selectedAnswer ?? -1,
      status: removing ? (hasAnswer ? "answered" : "skipped") : "marked_for_review",
    } };
    responsesRef.current = next;
    setResponses(next);
    // Removing review keeps the candidate on this question.
    if (!removing && currentIndex < questions.length - 1) setCurrentIndex(index => index + 1);
  };

  // Keep editor drafts in the attempt state so sidebar navigation and timed
  // autosaves include the latest code, even before Submit Solution is clicked.
  const handleCodingDraft = (code: string, language: string) => {
    if (!currentQ) return;
    const previous = responsesRef.current[currentQ._id];
    const next = { ...responsesRef.current, [currentQ._id]: {
      ...previous, selectedAnswer: -1, code, language,
      testCasesPassed: 0, totalTestCases: 0,
      status: previous?.status === "marked_for_review" ? "marked_for_review" : "draft",
    } };
    responsesRef.current = next;
    setResponses(next);
  };

  const handleSaveCodingQuestion = async (
    code: string,
    language: string,
    testCasesPassed: number,
    totalTestCases: number
  ) => {
    if (!currentQ) return;
    const nextResponses = {
      ...responsesRef.current,
      [currentQ._id]: {
        selectedAnswer: -1,
        code,
        language,
        testCasesPassed,
        totalTestCases,
        status: "answered",
      },
    };
    setResponses(nextResponses);
    responsesRef.current = nextResponses;

    // Send formatted progress to server immediately
    const formatted = questions.map((q) => {
      const r = nextResponses[q._id];
      return {
        questionId: q._id,
        selectedAnswer: r ? r.selectedAnswer : -1,
        code: r?.code || "",
        language: r?.language || "python",
        testCasesPassed: r?.testCasesPassed || 0,
        totalTestCases: r?.totalTestCases || 0,
        status: r ? r.status : "unvisited",
        timeSpentSeconds: 0,
      };
    });

    await studentAssessmentsAPI.saveProgress(id, {
      responses: formatted,
      timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      violations: violationsRef.current,
    });
  };

  const handleSaveAndNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowSubmitModal(true);
    }
  };

  // Keyboard Navigation (A, B, C, D to select options, Arrow keys for prev/next)
  useEffect(() => {
    const handleKeyNav = (e: KeyboardEvent) => {
      // Don't trigger if modal is open or typing
      if (showSubmitModal || showViolationModal) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, button, [contenteditable='true'], .monaco-editor")) return;
      if (["coding", "algorithmic", "dsa"].includes(currentQ?.questionType?.toLowerCase())) return;

      const key = e.key.toUpperCase();
      if (key === "A" && currentQ?.options?.length > 0) handleSelectOption(0);
      else if (key === "B" && currentQ?.options?.length > 1) handleSelectOption(1);
      else if (key === "C" && currentQ?.options?.length > 2) handleSelectOption(2);
      else if (key === "D" && currentQ?.options?.length > 3) handleSelectOption(3);
      else if (e.key === "ArrowRight" && currentIndex < questions.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else if (e.key === "ArrowLeft" && currentIndex > 0) {
        setCurrentIndex((i) => i - 1);
      }
    };

    window.addEventListener("keydown", handleKeyNav);
    return () => window.removeEventListener("keydown", handleKeyNav);
  }, [currentQ, currentIndex, questions.length, showSubmitModal, showViolationModal]);

  // Metrics for Question Palette
  const answeredCount = Object.values(responses).filter(
    (r) =>
      r.status === "answered" &&
      (r.selectedAnswer >= 0 || (r.code && r.code.trim().length > 0))
  ).length;
  const reviewCount = Object.values(responses).filter(
    (r) => r.status === "marked_for_review"
  ).length;
  const unattemptedCount = Math.max(0, questions.length - answeredCount);

  // Format Clock Time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (startError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
        <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-amber-500" />
          <h1 className="text-xl font-bold text-foreground">Assessment could not be started</h1>
          <p role="alert" className="mt-3 text-sm text-muted-foreground">{startError}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setStartError(null)}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => router.push(`/assessments/${id}/result`)}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground"
            >
              View previous result
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (isLoading || !currentQ) {
    return (
      <SafeExamBrowser isEnabled={!isSubmitting} onFullscreenEntered={beginAssessmentAfterFullscreen}>
        <div className="flex-1 min-h-screen bg-background flex items-center justify-center font-sans">
          <div className="text-center space-y-3">
            <Spinner className="w-9 h-9 animate-spin text-primary mx-auto" />
            <h2 className="text-sm font-semibold text-foreground">Preparing Secure Assessment Environment</h2>
            <p className="text-xs text-muted-foreground">The test will start after you enter fullscreen.</p>
          </div>
        </div>
      </SafeExamBrowser>
    );
  }

  const isLastQuestion = currentIndex === questions.length - 1;
  const isTimeCritical = timeLeftSeconds < 300; // < 5 mins

  return (
    <SafeExamBrowser
      isEnabled={!isSubmitting}
      onFullscreenEntered={beginAssessmentAfterFullscreen}
      maxWarnings={maxTabSwitches}
      onTerminate={() => submitExam(true)}
      onViolation={recordViolation}
    >
      <div className="h-dvh overflow-hidden bg-background text-foreground font-sans flex flex-col select-none relative [touch-action:pan-x_pan-y_pinch-zoom]">
      {/* Top Test Header Bar */}
      <header className="h-16 shrink-0 border-b border-border bg-card/95 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Toggle question sidebar" aria-controls="assessment-question-sidebar" onClick={() => {
            if (window.matchMedia("(min-width: 1024px)").matches) setSidebarCollapsed(value => !value);
            else setMobileSidebarOpen(value => !value);
          }} className="rounded-lg border border-border p-2 hover:bg-muted"><PanelLeft className="size-4" /></button>
          {/* CU Official Logo */}
          <div className="w-9 h-9 rounded-xl overflow-hidden bg-muted/40 shrink-0 border border-border p-1 flex items-center justify-center">
            <img
              src="https://images.seeklogo.com/logo-png/43/1/chandigarh-university-cu-logo-png_seeklogo-432515.png"
              alt="Chandigarh University"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/cu-logo.png";
              }}
            />
          </div>
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-bold text-xs font-mono shadow-xs">
            Q{currentIndex + 1}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-foreground">
                Question {currentIndex + 1} <span className="text-muted-foreground font-normal">of {questions.length}</span>
              </h1>
              <span className="hidden sm:inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-foreground border border-border">
                Chandigarh University
              </span>
              {assessmentCode && (
                <span className="hidden md:inline px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-muted text-foreground border border-border">
                  {assessmentCode}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground font-medium truncate max-w-[140px] sm:max-w-none">
              {currentQ.topic} {currentQ.subtopic ? `• ${currentQ.subtopic}` : ""}
            </p>
          </div>
        </div>

        {/* Center: Live Countdown Clock */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-md border text-xs sm:text-sm font-mono font-bold transition-all ${
              isTimeCritical
                ? "bg-rose-50 text-rose-700 border-rose-300 animate-pulse shadow-xs"
                : "bg-slate-50 text-slate-800 border-slate-200"
            }`}
          >
            <Clock className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isTimeCritical ? "text-rose-600" : "text-primary"}`} />
            <span>{formatTime(timeLeftSeconds)}</span>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="hidden sm:flex items-center justify-center p-2 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Tab Switch Strike Counter */}
          {tabSwitches > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{tabSwitches}/{maxTabSwitches}</span>
            </div>
          )}

          {/* Permanent Top Submit Test Button */}
          <button
            aria-label="Submit Test"
            onClick={() => setShowSubmitModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 rounded-md bg-primary hover:bg-primary/90 active:bg-primary/80 text-white text-xs font-semibold uppercase tracking-wider transition-all shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Submit Test</span>
          </button>
        </div>
      </header>

      {/* Warning Toast Floating Notification */}
      {warningToast && (
        <div className="fixed top-20 right-6 z-50 animate-in slide-in-from-top-3 fade-in duration-200">
          <div className="bg-card border border-rose-500/40 text-foreground px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs max-w-sm">
            <div className="w-7 h-7 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-rose-400">Proctoring Notice</div>
              <div className="text-[11px] text-muted-foreground">{warningToast.message}</div>
            </div>
            <button
              onClick={() => setWarningToast(null)}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Exam workspace: question navigation stays separate from scrollable panes. */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {mobileSidebarOpen && <button aria-label="Close question sidebar overlay" onClick={() => setMobileSidebarOpen(false)} className="absolute inset-0 z-30 bg-black/50 lg:hidden" />}
        <aside id="assessment-question-sidebar" aria-label="Assessment question sidebar" className={`shrink-0 w-72 min-h-0 flex-col border-r border-border bg-card ${sidebarCollapsed ? "lg:hidden" : "lg:flex"} ${mobileSidebarOpen ? "absolute inset-y-0 left-0 z-40 flex shadow-2xl" : "hidden"}`}>
          <div className="shrink-0 border-b border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><h2 className="text-sm font-semibold text-foreground break-words">{assessmentTitle}</h2><p className="mt-1 text-xs text-muted-foreground">{answeredCount} of {questions.length} answered · {reviewCount} for review</p></div>
              <button aria-label="Close question sidebar" onClick={() => { setSidebarCollapsed(true); setMobileSidebarOpen(false); }} className="p-1 rounded hover:bg-muted"><X className="size-4" /></button>
            </div>
            <div role="progressbar" aria-label="Assessment progress" aria-valuenow={answeredCount} aria-valuemin={0} aria-valuemax={questions.length} className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{width: `${questions.length ? answeredCount / questions.length * 100 : 0}%`}} /></div>
            <div className="flex gap-3 text-[10px] text-muted-foreground"><span>● Answered</span><span className="text-amber-500">● Review</span><span>○ Not answered</span></div>
          </div>
          <nav aria-label="Assessment questions" className="assessment-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-1">
            {questions.map((q, index) => {
              const response = responses[q._id];
              const answered = response?.status === "answered" && (response.selectedAnswer >= 0 || Boolean(response.code?.trim()));
              const review = response?.status === "marked_for_review";
              const current = index === currentIndex;
              const coding = ["coding", "algorithmic", "dsa"].includes(q.questionType?.toLowerCase()) || (!q.options?.length && Boolean(q.starterCode || q.codeSnippet));
              return <button key={q._id} type="button" aria-current={current ? "step" : undefined}
                aria-label={`Question ${index + 1}${current ? ", current" : ""}${answered ? ", answered" : ""}${review ? ", marked for review" : ""}`}
                onClick={() => {setCurrentIndex(index); setMobileSidebarOpen(false);}}
                className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${current ? "border-primary bg-primary/10 ring-1 ring-inset ring-primary/30" : "border-transparent hover:bg-muted/60"}`}>
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${answered ? "border-emerald-500 bg-emerald-500 text-slate-950" : review ? "border-amber-500/50 bg-amber-500/15 text-amber-500" : "border-border bg-muted text-muted-foreground"}`}>{answered ? <Check className="size-4" /> : index + 1}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-foreground" title={q.question}>{index + 1}. {q.question}</span><span className="mt-1 block text-[10px] text-muted-foreground">{coding ? "Coding" : "MCQ"} · {review ? "Review" : answered ? "Answered" : response?.code?.trim() ? "Draft" : "Not answered"}</span></span>
                {review && <Bookmark className="size-3 shrink-0 text-amber-500" />}
              </button>;
            })}
          </nav>
        </aside>
        {(() => {
          const isCodingQuestion = ["coding", "algorithmic", "dsa"].includes(currentQ.questionType?.toLowerCase()) || (!currentQ.options?.length && Boolean(currentQ.starterCode || currentQ.codeSnippet));
          return <AssessmentReadingZoom>{readingScale => <main className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden p-3 gap-3">
            {isCodingQuestion ? <>
              <DSAAssessmentEditor readingScale={readingScale} key={currentQ._id} question={currentQ} savedResponse={responses[currentQ._id]} onDraftChange={handleCodingDraft} onSave={handleSaveCodingQuestion} />
              <div className="shrink-0 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2">
                <button onClick={handleMarkForReview} className="inline-flex items-center gap-2 text-xs font-semibold text-amber-500"><Bookmark className="size-4" />{currentResponse?.status === "marked_for_review" ? "Unreview" : "Review later"}</button>
                <div className="flex gap-3"><button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0} className="text-xs font-medium disabled:opacity-30">Previous</button><button onClick={handleSaveAndNext} className="rounded-lg border border-border bg-muted px-4 py-2 text-xs font-semibold">{isLastQuestion ? "Review & finish" : "Next question"}</button></div>
              </div>
            </> : <>
              <ResizableAssessmentPanels key={currentQ._id} className="rounded-2xl border border-border bg-card">
                <section aria-label="Question statement" tabIndex={0} className="assessment-scroll flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain p-5 space-y-6">
                  <div style={{ zoom: readingScale }} className="space-y-6">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statement</div>
                  {/* Question Metadata Ribbon */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase bg-primary/10 text-primary border border-primary/20">
                        {currentQ.questionType === "multiple_choice" ? "Multiple Choice" : "Single Choice"}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground border border-border capitalize">
                        {currentQ.difficulty}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1 text-emerald-400 font-mono font-bold">
                        <span>+{currentQ.marks || 1} mark</span>
                      </div>
                      {currentQ.negativeMarks > 0 && (
                        <div className="flex items-center gap-1 text-rose-400 font-mono font-bold">
                          <span>-{currentQ.negativeMarks} negative</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Question Text */}
                  <div className="space-y-4">
                    <h2 className="text-base sm:text-lg font-semibold text-foreground leading-relaxed whitespace-pre-wrap">
                      {currentQ.question}
                    </h2>

                    {/* Code Snippet Box (If present in question) */}
                    {currentQ.codeSnippet && (
                      <CodeSnippet code={currentQ.codeSnippet} language={currentQ.language || "text"} />
                    )}
                  </div>

                  </div>
                </section>
                <section aria-label="Answer options" tabIndex={0} className="assessment-scroll flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain p-5 space-y-5">
                  <div style={{ zoom: readingScale }} className="space-y-5">
                  <h2 className="text-sm font-semibold">Choose your answer</h2>
                  {/* Options Selection (4 Cards) */}
                  <div className="space-y-3 pt-2">
                    {(currentQ.options ?? []).map((optionText, optIndex) => {
                      const isSelected = selectedAnswer === optIndex;
                      const letter = String.fromCharCode(65 + optIndex); // A, B, C, D

                      return (
                        <button
                          key={optIndex}
                          type="button"
                          onClick={() => handleSelectOption(optIndex)}
                          aria-pressed={isSelected}
                          className={`w-full text-left p-4 sm:p-4 rounded-2xl border transition-all flex items-start gap-3.5 group relative ${
                            isSelected
                              ? "border-emerald-400 bg-emerald-500/15 ring-2 ring-emerald-400/35 shadow-[0_0_0_2px_rgba(52,211,153,0.22)]"
                              : "border-border bg-card hover:bg-muted/40 hover:border-muted-foreground/30"
                          }`}
                        >
                          {/* Option Radio Letter Pill */}
                          <div
                            className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                              isSelected
                                ? "bg-emerald-500 text-slate-950 shadow-sm ring-2 ring-emerald-300/50"
                                : "bg-muted text-muted-foreground border border-border group-hover:border-primary/50 group-hover:text-foreground"
                            }`}
                          >
                            {letter}
                          </div>

                          <div className="flex-1 text-[15px] sm:text-base font-medium text-foreground pt-0.5 leading-7">
                            {optionText}
                          </div>

                          {/* Checkmark when chosen */}
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 self-center" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Keyboard shortcut hint */}
                  <div className="text-[11px] text-muted-foreground text-right hidden sm:block">
                    Tip: Press <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border text-foreground font-mono">A</kbd> <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border text-foreground font-mono">B</kbd> <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border text-foreground font-mono">C</kbd> <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border text-foreground font-mono">D</kbd> to select
                  </div>
                  </div>
                </section>
              </ResizableAssessmentPanels>
                {/* Bottom Action Ribbon */}
                <div className="shrink-0 z-20 flex flex-wrap items-center justify-between gap-3 bg-card/95 backdrop-blur-xl border border-border p-3 sm:p-4 rounded-2xl shadow-lg">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      disabled={selectedAnswer < 0}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Clear current answer choice"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Clear
                    </button>

                    <button
                      type="button"
                      onClick={handleMarkForReview}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-xs font-semibold text-amber-400 transition-colors"
                      title={currentResponse?.status === "marked_for_review" ? "Remove review flag" : "Mark for later review"}
                    >
                      <Bookmark className="w-3.5 h-3.5" /> {currentResponse?.status === "marked_for_review" ? "Unreview" : "Review"}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                      disabled={currentIndex === 0}
                      className="inline-flex items-center gap-1 px-3 sm:px-4 py-2 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" /> Previous
                    </button>

                    {isLastQuestion ? (
                      <button
                        type="button"
                        onClick={() => setShowSubmitModal(true)}
                        className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Review answers
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSaveAndNext}
                        className="inline-flex items-center gap-1 px-4 sm:px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-sm shadow-primary/20"
                      >
                        Save & Next <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
            </>}
          </main>}</AssessmentReadingZoom>;
        })()}
      </div>

      <FloatingAssessmentMonitor minimized={isPipMinimized}>
          {/* Live Proctoring Camera & Mic PIP Card */}
          <div className="bg-card border border-border rounded-xl p-3 shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Proctoring Monitor
                </span>
              </div>
              <button
                onClick={() => setIsPipMinimized(!isPipMinimized)}
                className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border"
              >
                {isPipMinimized ? "Show Feed" : "Collapse"}
              </button>
            </div>

            <div role="status" className={`rounded-lg border px-2 py-1.5 text-xs ${faceWarningCount > 0 ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300" : "border-border bg-muted/30 text-muted-foreground"}`}>
              <div className="flex items-center justify-between gap-2 font-semibold">
                <span>Multiple-face warnings</span>
                <span className="font-mono">{faceWarningCount} / {MAX_FACE_WARNINGS}</span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed">Warning 5 ends and submits your test.</p>
            </div>

            {!isPipMinimized && (
              <div className="space-y-2.5">
                <div className="relative aspect-video bg-black/60 rounded-xl overflow-hidden border border-border/80 flex items-center justify-center">
                  <video
                    ref={attachVideo}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover mirror"
                    style={{ transform: "scaleX(-1)" }}
                  />

                  {(!cameraActive || cameraError) && (
                    <div className="absolute inset-0 bg-card/90 flex flex-col items-center justify-center p-3 text-center space-y-2">
                      <Camera className="w-6 h-6 text-muted-foreground" />
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        {cameraError || "Waiting for camera authorization..."}
                      </p>
                    </div>
                  )}

                  {/* Status Overlay Badges */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-mono font-bold text-white border border-white/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> REC
                  </div>
                </div>

                {/* Mic & Audio Sensitivity Indicator */}
                <div className="flex items-center justify-between gap-2 p-2 bg-muted/30 border border-border rounded-xl text-[11px]">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    {micActive ? (
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <MicOff className="w-3.5 h-3.5 text-rose-400" />
                    )}
                    <span>Mic Level</span>
                  </div>

                  {/* Voice level meter */}
                  <div className="flex-1 max-w-[120px] h-2 bg-muted rounded-full overflow-hidden border border-border">
                    <div
                      className={`h-full transition-all duration-100 ${
                        audioLevel > 40 ? "bg-rose-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${audioLevel}%` }}
                    />
                  </div>

                  <span className="text-[10px] font-mono text-muted-foreground">
                    {audioLevel > 40 ? "Loud" : "Quiet"}
                  </span>
                </div>

                <div
                  className={`flex items-center justify-between gap-2 p-2 border rounded-xl text-[11px] ${
                    faceCount > 1
                      ? "bg-rose-500/10 border-rose-500/40 text-rose-400"
                      : "bg-muted/30 border-border text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        faceDetectionStatus === "active"
                          ? faceCount > 1
                            ? "bg-rose-400 animate-pulse"
                            : "bg-emerald-400"
                          : faceDetectionStatus === "initializing"
                            ? "bg-amber-400 animate-pulse"
                            : "bg-zinc-400"
                      }`}
                    />
                    <span>Face Check</span>
                  </div>
                  <span className="font-mono text-[10px] font-semibold">
                    {faceDetectionStatus === "active"
                      ? faceCount > 1
                        ? `${faceCount} faces — warning`
                        : faceCount === 1
                          ? "1 face detected"
                          : "Scanning"
                      : faceDetectionStatus === "initializing"
                        ? "Starting"
                        : "Unavailable"}
                  </span>
                </div>
              </div>
            )}
          </div>
      </FloatingAssessmentMonitor>

      {/* Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full space-y-5 animate-in fade-in zoom-in-95 shadow-2xl">
            <div className="flex items-center gap-3 text-primary">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Submit Assessment?</h3>
                <p className="text-xs text-muted-foreground">Once submitted, your answers will be finalized for evaluation.</p>
              </div>
            </div>

            <div className="p-4 bg-muted/40 border border-border rounded-2xl grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Answered</span>
                <div className="text-xl font-bold text-emerald-400">{answeredCount}</div>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Review</span>
                <div className="text-xl font-bold text-amber-400">{reviewCount}</div>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Unattempted</span>
                <div className="text-xl font-bold text-muted-foreground">{unattemptedCount}</div>
              </div>
            </div>

            {violations.length > 0 && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-400 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Notice: {violations.length} proctoring event(s) logged and submitted with attempt.</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-foreground transition-colors"
              >
                Return to Exam
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => submitExam(false)}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-md shadow-primary/20 disabled:opacity-50"
              >
                {isSubmitting ? <Spinner className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Yes, Submit Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proctoring Violation Warning Modal is removed in favor of SafeExamBrowser overlay */}
    </div>
    </SafeExamBrowser>
  );
}
