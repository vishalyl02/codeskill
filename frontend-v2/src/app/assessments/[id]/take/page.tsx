"use client";

import { useEffect, useEffectEvent, useState, useRef, use, useCallback, Fragment, useMemo, useContext, useSyncExternalStore, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { enterDocumentFullscreen, fullscreenEvents, isDocumentFullscreen } from "@/lib/fullscreen";
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
  Lock,
  Layers,
  Award,
  Check,
  Camera,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  Info,
  X,
  Play,
} from "lucide-react";
import Link from "next/link";
import api, { studentAssessmentsAPI } from "@/config/api";
import { authStorage } from "@/lib/auth-storage";
import AuthContext from "@/context/AuthContext";
import DSAAssessmentEditor, { type CodingExecutionControls } from "@/components/assessment/DSAAssessmentEditor";
import SafeExamBrowser from "@/components/assessment/SafeExamBrowser";
import LockdownLaunchGate from "@/components/assessment/LockdownLaunchGate";
import LockdownUtilityDock from "@/components/assessment/LockdownUtilityDock";
import LockdownRouteGuard from "@/components/assessment/LockdownRouteGuard";
import LockdownMediaPermissionGate from "@/components/assessment/LockdownMediaPermissionGate";
import LockdownAppBlockerGate from "@/components/assessment/LockdownAppBlockerGate";
import LockdownSubmissionFeedback from "@/components/assessment/LockdownSubmissionFeedback";
import { resolveAssessmentMediaRequirements } from "@/lib/assessment-media-policy";
import { LockdownSessionStore } from "@/lib/lockdown-session-store";
import { lockdownLogger } from "@/lib/lockdown-logger";
import {
  isLockdownClient,
  detectClientPlatform,
  initializeLockdownAttestation,
  consumeLockdownLaunchToken,
  engageOsKiosk,
  releaseLockdownKiosk,
  listenToLockdownViolation,
  listenToDeepLinkLaunch,
  logoutAndExitLockdown,
  listNonEssentialApps,
  closeNonEssentialApps,
  RunningUserApp,
} from "@/lib/lockdown-bridge";
import { offlineAutosaveQueue, SyncStatus } from "@/lib/offline-autosave-queue";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "react-hot-toast";
import { useAssessmentMedia } from "@/hooks/useAssessmentMedia";
import { MicrophoneLevelIndicator } from "@/components/assessment/MicrophoneLevelIndicator";
import { releaseAssessmentStream } from "@/lib/assessment-media-session";
import { assessmentStartupError, retryAssessmentSettings, retryAssessmentStartRateLimit } from "@/lib/assessment-startup";
import { AssessmentTakeHeader } from "@/components/assessment/AssessmentTakeHeader";
import { checkpointMacAssessmentDraft, clearMacAssessmentDrafts, readMacAssessmentDraft } from "@/lib/mac-assessment-draft";
import { AssessmentReadingZoom } from "@/components/assessment/AssessmentReadingZoom";
import { ResizableAssessmentPanels } from "@/components/assessment/ResizableAssessmentPanels";
import { FloatingAssessmentMonitor } from "@/components/assessment/FloatingAssessmentMonitor";
import { CodeSnippet } from "@/components/assessment/CodeSnippet";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import {
  checkAssessmentFace,
  getAssessmentFaceReference,
  prepareAssessmentFaceVerification,
  clearAssessmentFaceReference,
  type AssessmentFaceCheck,
} from "@/lib/assessment-face-verification";

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
  description?: string;
  questionType: string;
  topic: string;
  subtopic?: string;
  difficulty: string;
  marks: number;
  negativeMarks: number;
  options: string[];
  codeSnippet?: string;
  starterCode?: string | Array<{ language: string; code: string }> | Record<string, string>;
  language?: string;
  inputFormat?: string;
  outputFormat?: string;
  constraints?: string | string[];
  supportedLanguages?: string[];
  hideMainMethod?: boolean;
  sectionId?: string;
  sectionTitle?: string;
  sectionOrder?: number;
  timeLimit?: number;
  memoryLimit?: number;
  testCases?: TestCase[];
}

function mergeAttemptQuestions(
  existing: Question[],
  incoming: Question[],
  totalQuestionCount: number,
): Question[] {
  const merged = existing.slice(0, totalQuestionCount);
  merged.length = totalQuestionCount;
  incoming.forEach((question, fallbackIndex) => {
    const index = Math.max(0, Number(question.questionIndex || fallbackIndex + 1) - 1);
    if (index < totalQuestionCount) merged[index] = question;
  });
  return merged;
}

interface AssessmentProctoring {
  mode?: 'fully_proctored' | 'partial_proctored' | 'non_proctored';
  cameraSelectionPolicy?: 'system_default' | 'student_select';
  violationPenaltyMarks?: number;
  useCamera?: boolean;
  useMicrophone?: boolean;
  requireCamera?: boolean;
  requireMicrophone?: boolean;
  enableWebcam?: boolean;
  enableMicrophone?: boolean;
  enforceFullscreen?: boolean;
  detectTabSwitch?: boolean;
  blockCopyPaste?: boolean;
  maxTabSwitches?: number;
  autoSubmitOnViolation?: boolean;
}

interface ViolationEvent {
  type: string;
  timestamp: string;
  details: string;
}

const MAX_FACE_WARNINGS = 5;

const subscribeToHydration = () => () => {};
const MacLockdownEditor = memo(DSAAssessmentEditor);

function subscribeToConnection(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function LockdownSaveStatus({ syncStatus }: { syncStatus: SyncStatus }) {
  const online = useSyncExternalStore(subscribeToConnection, () => navigator.onLine, () => true);
  const [showSaving, setShowSaving] = useState(false);

  useEffect(() => {
    if (syncStatus !== "syncing") {
      setShowSaving(false);
      return;
    }
    const timeout = window.setTimeout(() => setShowSaving(true), 500);
    return () => window.clearTimeout(timeout);
  }, [syncStatus]);

  const offline = !online || syncStatus === "offline-buffered";
  const pending = syncStatus === "error";
  return (
    <span className="ml-auto min-w-[9ch] px-1.5 text-right text-xs tabular-nums text-muted-foreground"
      title={pending || offline ? "Some changes may be waiting to sync." : "Changes are automatically saved while online."}
    >
      {offline ? "Offline" : pending ? "Sync pending" : syncStatus === "syncing" && showSaving ? "Saving…" : "Saved"}
    </span>
  );
}

export default function TakeAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  // LockDown's native bridge and persisted attempt state are only available in the webview.
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  if (!hydrated) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center gap-3 bg-background text-sm text-foreground">
        <Spinner aria-hidden="true" className="h-5 w-5 animate-spin text-primary" />
        Loading assessment settings…
      </div>
    );
  }
  return <AssessmentAttempt key={id} id={id} />;
}

function AssessmentAttempt({ id }: { id: string }) {
  const compactLockdown = isLockdownClient() && detectClientPlatform() === "macos";
  const CodingEditor = compactLockdown ? MacLockdownEditor : DSAAssessmentEditor;
  const router = useRouter();
  const authContext = useContext(AuthContext);
  const user = authContext?.user;

  const fallbackUser = useMemo(() => {
    if (user) return user;
    try {
      const token = authStorage.getAccessToken();
      if (token) {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          return {
            _id: payload.sub || payload.id || payload.userId,
            id: payload.sub || payload.id || payload.userId,
            email: payload.email,
            rollNumber: payload.rollNumber,
            name: payload.name,
          };
        }
      }
    } catch {
      // ignore
    }
    return null;
  }, [user]);

  const resolvedCandidateId = user?._id || user?.id || fallbackUser?._id || fallbackUser?.id || 'ANON-CANDIDATE';
  const resolvedCandidateIdentifier = user?.email || user?.rollNumber || user?.uid || user?.name || fallbackUser?.email || fallbackUser?.rollNumber || fallbackUser?.name || '';

  // Test Session State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalQuestionCount, setTotalQuestionCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<
    Record<
      string,
      {
        selectedAnswer: number;
        selectedAnswers?: number[];
        code?: string;
        language?: string;
        codeByLanguage?: Record<string, string>;
        testCasesPassed?: number;
        totalTestCases?: number;
        status: string;
      }
    >
  >({});
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [startedAt, setStartedAt] = useState<Date>(new Date());
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(2700);
  const [questionTimeLimitSeconds, setQuestionTimeLimitSeconds] = useState(0);
  const [questionDeadlineAtEpochMs, setQuestionDeadlineAtEpochMs] = useState<number | null>(null);
  const [questionTimeLeftSeconds, setQuestionTimeLeftSeconds] = useState(0);
  const [attemptDeadlineAt, setAttemptDeadlineAt] = useState<number | null>(null);
  const [serverEndsAtEpochMs, setServerEndsAtEpochMs] = useState<number | null>(null);
  const serverClockOffsetMsRef = useRef<number>(0);
  const candidateIdRef = useRef<string>("candidate");
  const attemptIdRef = useRef<string>("attempt");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsRetry, setSettingsRetry] = useState(0);
  const [proctoring, setProctoring] = useState<AssessmentProctoring | null>(null);
  const [totalPenaltyMarks, setTotalPenaltyMarks] = useState(0);
  const [loadedAssessmentId, setLoadedAssessmentId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLockdownActive, setIsLockdownActive] = useState(false);
  const submissionRequestedRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!submitError) return;
    const timer = window.setTimeout(() => {
      setSubmitError(null);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [submitError]);

  useEffect(() => {
    setSubmitError(null);
  }, [currentIndex]);
  const [isAutoSubmitting, setIsAutoSubmitting] = useState(false);
  const [assessmentTitle, setAssessmentTitle] = useState("Proctored Assessment");
  const [assessmentCode, setAssessmentCode] = useState("");
  const [securityPolicy, setSecurityPolicy] = useState<any>(null);
  const [requireLockdown, setRequireLockdown] = useState(false);
  const [allowCalculators, setAllowCalculators] = useState<boolean>(true);
  const [allowScratchpad, setAllowScratchpad] = useState<boolean>(true);
  const [allowReferenceDoc, setAllowReferenceDoc] = useState<boolean>(false);
  const [referencePdfUrl, setReferencePdfUrl] = useState<string | undefined>(undefined);
  const [requireCloseOtherApps, setRequireCloseOtherApps] = useState<boolean>(true);
  const [allowSpellCheck, setAllowSpellCheck] = useState<boolean>(false);
  const [allowFindOnPage, setAllowFindOnPage] = useState<boolean>(true);
  const [allowedUrlPatterns, setAllowedUrlPatterns] = useState<string[]>([]);
  const [enableScreenCaptureSnapshots, setEnableScreenCaptureSnapshots] = useState<boolean>(false);
  const [enableForensicWatermark, setEnableForensicWatermark] = useState<boolean>(false);
  const [attestedSessionId, setAttestedSessionId] = useState<string | undefined>(undefined);

  const mediaRequirements = useMemo(
    () => resolveAssessmentMediaRequirements(null, proctoring, securityPolicy),
    [proctoring, securityPolicy]
  );

  // Pre-Exam Close-Apps Gate state
  const [runningAppsList, setRunningAppsList] = useState<RunningUserApp[]>([]);
  const [isCloseAppsGateOpen, setIsCloseAppsGateOpen] = useState<boolean>(false);
  const [isClosingApps, setIsClosingApps] = useState<boolean>(false);
  const [isMediaGatePassed, setIsMediaGatePassed] = useState<boolean>(() => {
    if (!isLockdownClient()) return true;
    const local = LockdownSessionStore.getLocalState(id);
    return Boolean(local?.mediaPermissionsVerified);
  });

  useEffect(() => {
    if (!isLoadingSettings && !mediaRequirements.needsMediaGate && !isMediaGatePassed) {
      setIsMediaGatePassed(true);
    }
  }, [isLoadingSettings, mediaRequirements.needsMediaGate, isMediaGatePassed]);
  const [isAppsGatePassed, setIsAppsGatePassed] = useState<boolean>(!isLockdownClient());
  const [codingControls, setCodingControls] = useState<CodingExecutionControls | null>(null);
  const [lockdownExitCountdown, setLockdownExitCountdown] = useState<number | null>(null);
  const [isExamSubmitted, setIsExamSubmitted] = useState<boolean>(() => {
    if (typeof window === "undefined" || !isLockdownClient()) return false;
    if (new URLSearchParams(window.location.search).get("retake") === "1") return false;
    const local = LockdownSessionStore.getLocalState(id);
    return Boolean(local?.isSubmitted);
  });
  const [submissionReceiptId, setSubmissionReceiptId] = useState<string | null>(() => {
    if (typeof window === "undefined" || !isLockdownClient()) return null;
    if (new URLSearchParams(window.location.search).get("retake") === "1") return null;
    return LockdownSessionStore.getLocalState(id)?.submissionReceiptId || null;
  });
  const [submittedAtMs, setSubmittedAtMs] = useState<number | null>(() => {
    if (typeof window === "undefined" || !isLockdownClient()) return null;
    if (new URLSearchParams(window.location.search).get("retake") === "1") return null;
    return LockdownSessionStore.getLocalState(id)?.submittedAtMs || null;
  });
  const [startError, setStartError] = useState<string | null>(null);
  const [hasPreviousResult, setHasPreviousResult] = useState(false);
  const [accommodations, setAccommodations] = useState<any>(null);
  const [lockSectionsSequentially, setLockSectionsSequentially] = useState(false);
  const [lockQuestionsSequentially, setLockQuestionsSequentially] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [permittedQuestionIndex, setPermittedQuestionIndex] = useState(0);
  const [navigationVersion, setNavigationVersion] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [completedSectionIds, setCompletedSectionIds] = useState<string[]>([]);
  const [showSectionSubmitModal, setShowSectionSubmitModal] = useState(false);
  const mediaCleanupRef = useRef<{ assessmentId: string; timer: number } | null>(null);
  const examPageRef = useRef<HTMLDivElement | null>(null);

  // Live offline autosave queue status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const questionTimerExpiryHandledRef = useRef(false);

  useEffect(() => {
    const unsubscribe = offlineAutosaveQueue.onStatusChange((status, count) => {
      setSyncStatus(status);
      setPendingSyncCount(count);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (id) {
      try {
        const prefetched = LockdownSessionStore.getQuestionBundle(id);
        if (prefetched && prefetched.length > 0) {
          setQuestions(prefetched as any);
        }
      } catch {}
      void (async () => {
        try {
          const persisted = await LockdownSessionStore.loadState(id);
          if (persisted?.candidateId) {
            candidateIdRef.current = persisted.candidateId;
          }
          if (persisted?.serverEndsAtEpochMs) {
            setServerEndsAtEpochMs(persisted.serverEndsAtEpochMs);
            setAttemptDeadlineAt(persisted.serverEndsAtEpochMs);
          }
          const isExplicitRetakeLaunch =
            typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).get("retake") === "1";
          if (persisted?.isSubmitted && !isExplicitRetakeLaunch) {
            setIsExamSubmitted(true);
            setSubmissionReceiptId(persisted.submissionReceiptId || `REC-${id.slice(0, 8)}`);
            setSubmittedAtMs(persisted.submittedAtMs || Date.now());
          }
        } catch (err) {
          console.warn("[TakePage] Failed to hydrate persisted exam state:", err);
        }
      })();
    }
  }, [id]);

  useEffect(() => {
    if (loadedAssessmentId === id) void offlineAutosaveQueue.hydrate(id);
  }, [id, loadedAssessmentId]);

  useEffect(() => {
    if (!isLockdownClient()) return;

    let unlisten: (() => void) | undefined;
    void listenToLockdownViolation(async (violation) => {
      lockdownLogger.warn("SECURITY", "environment_violation", {
        assessmentId: id,
        violationType: violation.violation_type,
        message: violation.message,
      });
      try {
        await api.post("exam-security/violations", {
          assessmentId: id,
          eventType: violation.violation_type,
          message: violation.message,
          metadata: { timestamp: violation.timestamp },
        });

        if (violation.violation_type === "RUNTIME_TAMPER_DETECTED") {
          await api.post("exam-security/telemetry-batch", {
            assessmentId: id,
            events: [
              {
                eventType: "RUNTIME_TAMPER_DETECTED",
                severity: "CRITICAL",
                message: violation.message,
                metadata: { message: violation.message, timestamp: violation.timestamp },
                timestamp: violation.timestamp,
              },
            ],
          }).catch(() => {});
        }
      } catch (err) {
        console.warn("Failed to forward environment violation:", err);
      }
    }).then((cleanup) => {
      unlisten = cleanup;
    });

    let unlistenDeepLink: (() => void) | undefined;
    void listenToDeepLinkLaunch((payload) => {
      if (payload.token) {
        authStorage.setAccessToken(payload.token);
      }
      if (payload.examId && payload.examId !== id) {
        router.push(`/assessments/${payload.examId}/take`);
      }
    }).then((cleanup) => {
      unlistenDeepLink = cleanup;
    });

    return () => {
      if (unlisten) unlisten();
      if (unlistenDeepLink) unlistenDeepLink();
    };
  }, [id, router]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingSettings(true);
    setSettingsError(null);

    const loadAssessment = async () => {
      if (isLockdownClient()) {
        try {
          const launchRes = await consumeLockdownLaunchToken(api, id);
          if (launchRes.success) {
            setIsLockdownActive(true);
            if (launchRes.attestation?.sessionId) {
              setAttestedSessionId(launchRes.attestation.sessionId);
            }
          } else {
            // Note: If initial attestation fails due to background applications or media permissions,
            // do not abort loading assessment overview. Allow LockdownAppBlockerGate and LockdownMediaPermissionGate
            // to mount and guide the student. Full attestation will be validated upon gate completion.
            console.warn(
              "[Lockdown] Initial attestation deferred to pre-exam gates:",
              launchRes.attestation?.error,
            );
            lockdownLogger.warn("ATTESTATION", "initial_attestation_deferred", {
              assessmentId: id,
              error: launchRes.attestation?.error || "unknown",
            });
            void lockdownLogger.uploadDiagnosticsSnapshot(api, id, "initial_attestation_deferred", {
              error: launchRes.attestation?.error || "unknown",
            });
          }
        } catch (err: any) {
          console.warn("[Lockdown] Launch token ingestion warning:", err);
        }
      }

      if (cancelled) return;

      try {
        const res = compactLockdown
          ? await retryAssessmentSettings(() => studentAssessmentsAPI.getOverview(id), () => cancelled)
          : await studentAssessmentsAPI.getOverview(id);
        const asmt = res.data?.assessment;
        if (compactLockdown && !asmt) throw new Error("CodeSkill could not load the assessment details.");
        if (!cancelled) {
          if (typeof asmt?.questionCount === "number") {
            setTotalQuestionCount(asmt.questionCount);
          }
          setProctoring(asmt?.proctoring || {});
          setSecurityPolicy(asmt?.securityPolicy || {});
          if (asmt?.requireLockdown !== undefined) {
            setRequireLockdown(Boolean(asmt.requireLockdown));
          }
          if (asmt?.allowCalculators !== undefined) {
            setAllowCalculators(Boolean(asmt.allowCalculators));
          }
          if (asmt?.allowScratchpad !== undefined) {
            setAllowScratchpad(Boolean(asmt.allowScratchpad));
          } else if (asmt?.securityPolicy?.allowScratchpad !== undefined) {
            setAllowScratchpad(Boolean(asmt.securityPolicy.allowScratchpad));
          }
          if (asmt?.allowReferenceDoc !== undefined) {
            setAllowReferenceDoc(Boolean(asmt.allowReferenceDoc));
          } else if (asmt?.securityPolicy?.allowReferenceDoc !== undefined) {
            setAllowReferenceDoc(Boolean(asmt.securityPolicy.allowReferenceDoc));
          }
          if (asmt?.referencePdfUrl) {
            setReferencePdfUrl(asmt.referencePdfUrl);
          }
          if (asmt?.title) setAssessmentTitle(asmt.title);
          if (asmt?.code) setAssessmentCode(asmt.code);
          if (asmt?.lockSectionsSequentially !== undefined) {
            setLockSectionsSequentially(Boolean(asmt.lockSectionsSequentially));
          }
          if (asmt?.lockQuestionsSequentially !== undefined) {
            setLockQuestionsSequentially(Boolean(asmt.lockQuestionsSequentially));
          }
          const closeAppsRequired =
            asmt?.requireCloseOtherApps ??
            asmt?.securityPolicy?.requireCloseOtherApps ??
            true;
          setRequireCloseOtherApps(Boolean(closeAppsRequired));
          if (asmt?.allowSpellCheck !== undefined) {
            setAllowSpellCheck(Boolean(asmt.allowSpellCheck));
          } else if (asmt?.securityPolicy?.allowSpellCheck !== undefined) {
            setAllowSpellCheck(Boolean(asmt.securityPolicy.allowSpellCheck));
          }
          if (asmt?.allowFindOnPage !== undefined) {
            setAllowFindOnPage(Boolean(asmt.allowFindOnPage));
          } else if (asmt?.securityPolicy?.allowFindOnPage !== undefined) {
            setAllowFindOnPage(Boolean(asmt.securityPolicy.allowFindOnPage));
          }
          if (Array.isArray(asmt?.allowedUrlPatterns)) {
            setAllowedUrlPatterns(asmt.allowedUrlPatterns);
          } else if (Array.isArray(asmt?.securityPolicy?.allowedUrlPatterns)) {
            setAllowedUrlPatterns(asmt.securityPolicy.allowedUrlPatterns);
          }
          if (asmt?.enableScreenCaptureSnapshots !== undefined) {
            setEnableScreenCaptureSnapshots(Boolean(asmt.enableScreenCaptureSnapshots));
          }
          if (asmt?.enableForensicWatermark !== undefined) {
            setEnableForensicWatermark(Boolean(asmt.enableForensicWatermark));
          } else if (asmt?.securityPolicy?.enableForensicWatermark !== undefined) {
            setEnableForensicWatermark(Boolean(asmt.securityPolicy.enableForensicWatermark));
          }

          if (compactLockdown) {
            setHasPreviousResult(Boolean(res.data?.attempt?.submittedAt || res.data?.completedAttemptsCount > 0));
          }
          const overviewCanRetake = Boolean(res.data?.canRetake);
          const hasActiveInProgressAttempt = res.data?.attempt?.status === "in_progress";
          const isExplicitRetakeLaunch =
            typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).get("retake") === "1";
          const canStartOrResumeAttempt =
            isExplicitRetakeLaunch || overviewCanRetake || hasActiveInProgressAttempt;

          if (isLockdownClient() && canStartOrResumeAttempt) {
            // Clear any stale isSubmitted state from a prior attempt so multi-attempt / unlimited retakes start cleanly
            setIsExamSubmitted(false);
            setSubmissionReceiptId(null);
            setSubmittedAtMs(null);
            void LockdownSessionStore.saveState(id, { isSubmitted: false });
          }

          if (compactLockdown && getAssessmentFaceReference(id)) {
            // Fetch and initialize cached models while the pre-exam checks are running.
            void prepareAssessmentFaceVerification().catch(() => {});
          }

          // Check authoritative server resume state
          if (typeof studentAssessmentsAPI.getResumeState === "function") {
            try {
              const resumeRes = await studentAssessmentsAPI.getResumeState(id);
              const resumeData = resumeRes.data?.data || resumeRes.data;
              if (resumeData?.alreadySubmitted && !canStartOrResumeAttempt) {
                if (!cancelled) {
                  setIsExamSubmitted(true);
                  const recId = submissionReceiptId || `REC-${id.slice(0, 8).toUpperCase()}`;
                  const subTime = submittedAtMs || Date.now();
                  setSubmissionReceiptId(recId);
                  setSubmittedAtMs(subTime);
                  void LockdownSessionStore.saveState(id, {
                    isSubmitted: true,
                    submissionReceiptId: recId,
                    submittedAtMs: subTime,
                  });
                  setIsLoading(false);
                  setIsLoadingSettings(false);
                }
                return;
              }
              if (!resumeData?.alreadySubmitted && resumeData?.hasAttempt && typeof resumeData.remainingSeconds === "number") {
                if (resumeData.serverEndsAtEpochMs) {
                  setServerEndsAtEpochMs(resumeData.serverEndsAtEpochMs);
                  setAttemptDeadlineAt(resumeData.serverEndsAtEpochMs);
                }
                if (typeof resumeData.currentQuestionIndex === "number") {
                  setPermittedQuestionIndex(resumeData.currentQuestionIndex);
                  setCurrentIndex(resumeData.currentQuestionIndex);
                }
                if (Array.isArray(resumeData.completedSectionIds)) {
                  setCompletedSectionIds(resumeData.completedSectionIds.map(String));
                }
                if (typeof resumeData.activeSectionId === "string" || resumeData.activeSectionId === null) {
                  setActiveSectionId(resumeData.activeSectionId);
                }
                if (typeof resumeData.questionTimeLimitSeconds === "number") {
                  setQuestionTimeLimitSeconds(resumeData.lockQuestionsSequentially
                    ? Math.max(0, resumeData.questionTimeLimitSeconds)
                    : 0);
                }
                if (typeof resumeData.currentQuestionStartedAtEpochMs === "number") {
                  setQuestionDeadlineAtEpochMs(
                    resumeData.currentQuestionStartedAtEpochMs
                      + Math.max(0, resumeData.questionTimeLimitSeconds || 0) * 1000,
                  );
                }
                if (typeof resumeData.navigationVersion === "number") {
                  setNavigationVersion(resumeData.navigationVersion);
                }
                if (typeof resumeData.serverNowMs === "number") {
                  serverClockOffsetMsRef.current = resumeData.serverNowMs - Date.now();
                }
                if (resumeData.attemptId) {
                  attemptIdRef.current = resumeData.attemptId;
                }
                setTimeLeftSeconds(resumeData.remainingSeconds);
                if (resumeData.accommodations) {
                  setAccommodations(resumeData.accommodations);
                }
                if (resumeData.responses && typeof resumeData.responses === "object") {
                  responsesRef.current = { ...responsesRef.current, ...resumeData.responses };
                  setResponses((prev) => ({ ...prev, ...resumeData.responses }));
                }
              }
            } catch (err) {
              console.warn("[TakePage] Resume state reconciliation skipped:", err);
            }
          }

          // In LockDown client with close-apps policy enabled, scan for running applications
          if (isLockdownClient() && closeAppsRequired) {
            try {
              const apps = await listNonEssentialApps();
              if (apps.length > 0) {
                setRunningAppsList(apps);
                setIsCloseAppsGateOpen(true);
              }
            } catch (err) {
              console.warn("Failed to check running apps:", err);
            }
          }
        }
      } catch (error) {
        console.warn("Failed to load assessment proctoring settings:", error);
        if (!cancelled) {
          if (compactLockdown) setSettingsError(assessmentStartupError(error, "settings"));
          else setProctoring({});
        }
      } finally {
        if (!cancelled) setIsLoadingSettings(false);
      }
    };

    void loadAssessment();

    return () => {
      cancelled = true;
    };
  }, [compactLockdown, id, settingsRetry]);

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

  useModalAccessibility(Boolean(showSubmitModal || showSectionSubmitModal), () => {
    setShowSubmitModal(false);
    setShowSectionSubmitModal(false);
  });
  const [warningToast, setWarningToast] = useState<{ id: number; message: string; type: "warning" | "alert" } | null>(null);
  const [faceWarningCount, setFaceWarningCount] = useState(0);
  const [faceMonitorStatus, setFaceMonitorStatus] = useState("Waiting for camera");

  // Camera & Voice Proctoring State
  const [isPipMinimized, setIsPipMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setIsFullscreen(isDocumentFullscreen());
    sync();
    for (const event of fullscreenEvents) document.addEventListener(event, sync);
    return () => { for (const event of fullscreenEvents) document.removeEventListener(event, sync); };
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);


  const draftDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const pendingMacCodingSave = useRef<(() => void) | null>(null);

  const responsesRef = useRef(responses);
  if (!draftDebounceRef.current) {
    responsesRef.current = responses;
  }

  const flushDraftToState = useCallback(() => {
    if (draftDebounceRef.current) {
      clearTimeout(draftDebounceRef.current);
      draftDebounceRef.current = null;
      setResponses(responsesRef.current);
      pendingMacCodingSave.current?.();
      pendingMacCodingSave.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    };
  }, []);

  const tabSwitchesRef = useRef(tabSwitches);
  tabSwitchesRef.current = tabSwitches;

  const violationsRef = useRef(violations);
  violationsRef.current = violations;
  const faceWarningsRef = useRef(0);
  const faceMonitorBusyRef = useRef(false);
  const faceCandidateRef = useRef<{ issue: string; count: number } | null>(null);
  const activeFaceIssueRef = useRef<string | null>(null);
  const lookingAwaySinceRef = useRef<number | null>(null);
  const submitStartedRef = useRef(false);

  // Add a proctoring violation and sync telemetry
  const recordViolation = useCallback(
    (type: string, details: string) => {
      if (type === "tab_switch" && proctoring?.detectTabSwitch !== false) {
        setTabSwitches((count) => count + 1);
      }
      const newV: ViolationEvent = {
        type,
        timestamp: new Date().toISOString(),
        details,
      };
      const updated = [...violationsRef.current, newV];
      setViolations(updated);
      violationsRef.current = updated;

      const isPartialProctored =
        proctoring?.mode === "partial_proctored" ||
        (proctoring?.autoSubmitOnViolation === false &&
          (proctoring?.violationPenaltyMarks ?? 0) > 0);
      const penaltyPerViolation = proctoring?.violationPenaltyMarks ?? 2;

      if (isPartialProctored) {
        const newTotalPenalty = updated.length * penaltyPerViolation;
        setTotalPenaltyMarks(newTotalPenalty);
        setWarningToast({
          id: Date.now(),
          message: `🚨 Negative marks applied: -${penaltyPerViolation} marks deducted for ${details}. (Total Penalty: -${newTotalPenalty} marks)`,
          type: "alert",
        });
        toast.error(
          `Violation detected: -${penaltyPerViolation} marks deducted! Total Penalty: -${newTotalPenalty} marks`,
          { duration: 5000 }
        );
      } else {
        // Temporary visual toast for fully proctored mode
        setWarningToast({
          id: Date.now(),
          message:
            type === "multiple_faces_detected"
              ? `Warning ${
                  updated.filter((event) => event.type === "multiple_faces_detected")
                    .length
                }/${MAX_FACE_WARNINGS}: ${details} The test will end at warning ${MAX_FACE_WARNINGS}.`
              : details,
          type: type === "tab_switch" ? "alert" : "warning",
        });
      }

      // Sync with server immediately
      const progressQuestions = lockQuestionsSequentially
        ? questions.filter((_, index) => index === permittedQuestionIndex)
        : lockSectionsSequentially
          ? questions.filter((question) => question && question.sectionId === activeSectionId)
          : questions.filter(Boolean);
      const formattedResponses = progressQuestions.map((q) => {
        const r = responsesRef.current[q._id];
        return {
          questionId: q._id,
          selectedAnswer: r ? r.selectedAnswer : -1,
          selectedAnswers: r?.selectedAnswers ?? (r && r.selectedAnswer >= 0 ? [r.selectedAnswer] : []),
          code: r?.code || "",
          language: r?.language || q.language || q.supportedLanguages?.[0] || "python",
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
    [id, questions, startedAt, proctoring?.detectTabSwitch, lockSectionsSequentially, lockQuestionsSequentially, activeSectionId, permittedQuestionIndex]
  );

  // Start the attempt only after the candidate enters fullscreen from the secure gate.
  const startAttemptRequestedRef = useRef(false);
  const beginAssessmentAfterFullscreen = useCallback(async () => {
    if (isLoadingSettings || settingsError || isExamSubmitted) return;
    if (isLockdownClient() && ((mediaRequirements.needsMediaGate && !isMediaGatePassed) || !isAppsGatePassed)) {
      console.info("[LockDown Start] Waiting on pre-exam gates:", {
        needsMediaGate: mediaRequirements.needsMediaGate,
        isMediaGatePassed,
        isAppsGatePassed,
      });
      lockdownLogger.info("ASSESSMENT_START", "waiting_on_pre_exam_gates", {
        assessmentId: id,
        needsMediaGate: mediaRequirements.needsMediaGate,
        isMediaGatePassed,
        isAppsGatePassed,
      });
      void lockdownLogger.uploadDiagnosticsSnapshot(api, id, "waiting_on_pre_exam_gates", {
        needsMediaGate: mediaRequirements.needsMediaGate,
        isMediaGatePassed,
        isAppsGatePassed,
      });
      return;
    }
    if (startAttemptRequestedRef.current) return;
    startAttemptRequestedRef.current = true;
    setIsLoading(true);
    try {
      if (mediaRequirements.requireCamera && !getAssessmentFaceReference(id)) {
        console.warn("[LockDown Start] Missing face reference in LockDown session; redirecting to briefing page /assessments/" + id);
        if (isLockdownClient()) {
          router.replace(`/assessments/${id}`);
          return;
        }
        throw new Error("Take your identity selfie on the assessment briefing page before entering the test.");
      }

      // Ensure native CodeSkill LockDown attestation session is initialized and valid before starting attempt
      if (isLockdownClient() && (!isLockdownActive || !attestedSessionId)) {
        console.info("[LockDown Start] Initializing native LockDown attestation for assessment:", id);
        try {
          const attestRes = await initializeLockdownAttestation(api, id, true);
          if (!attestRes.success) {
            console.error("[LockDown Start] Attestation failed:", attestRes.error);
            throw new Error(attestRes.error || "CodeSkill LockDown attestation verification failed.");
          }
          console.info("[LockDown Start] Attestation succeeded:", attestRes.sessionId);
          if (attestRes.sessionId) {
            setAttestedSessionId(attestRes.sessionId);
          }
          setIsLockdownActive(true);
        } catch (attestErr: any) {
          console.error("[LockDown Start] Attestation exception:", attestErr);
          throw new Error(attestErr?.message || "Failed to establish secure CodeSkill LockDown session.");
        }
      }

      const isExplicitRetake = new URLSearchParams(window.location.search).get("retake") === "1";
      // A Redo action must discard any stale in-progress attempt and start a
      // fresh timer. Ordinary assessment entry still resumes an in-progress test.
      let res;
      if (isExplicitRetake) {
        try {
          res = await studentAssessmentsAPI.retakeAttempt(id);
        } catch (retakeErr: any) {
          const msg = retakeErr?.response?.data?.message || "";
          if (msg.includes("already in progress") || retakeErr?.response?.status === 400) {
            res = await studentAssessmentsAPI.startAttempt(id);
          } else {
            throw retakeErr;
          }
        }
      } else {
        try {
          res = compactLockdown
            ? await retryAssessmentStartRateLimit(() => studentAssessmentsAPI.startAttempt(id))
            : await studentAssessmentsAPI.startAttempt(id);
        } catch (startErr: any) {
          const msg = startErr?.response?.data?.message || "";
          if (
            msg.includes("not started yet") ||
            msg.includes("duplicate key") ||
            msg.includes("concurrent") ||
            (!compactLockdown && startErr?.response?.status === 429)
          ) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            res = await studentAssessmentsAPI.startAttempt(id);
          } else {
            throw startErr;
          }
        }
      }
      const data = res.data?.data && res.data.data.questions ? res.data.data : res.data;
      if (data?.proctoring) setProctoring(data.proctoring);
      const questionsList = data?.questions || res.data?.questions || [];
      if (!Array.isArray(questionsList) || questionsList.length === 0) {
        throw new Error("CodeSkill did not receive any questions for this attempt. Return to the assessment details or contact your instructor.");
      }
      const totalQuestions = (
        typeof data.totalQuestionCount === "number"
          ? data.totalQuestionCount
          : typeof data.questionCount === "number"
            ? data.questionCount
            : questionsList.length
      );
      const initialQuestionIndex = typeof data.currentQuestionIndex === "number"
        ? data.currentQuestionIndex
        : 0;
      let questionsForAttempt: Question[] = questionsList;
      if (
        (data.lockQuestionsSequentially || data.lockSectionsSequentially) &&
        questionsList.length > 0
      ) {
        questionsForAttempt = new Array<Question>(Math.max(totalQuestions, initialQuestionIndex + 1));
        questionsList.forEach((question: Question, questionPosition: number) => {
          const index = Math.max(0, Number(question.questionIndex || questionPosition + 1) - 1);
          questionsForAttempt[index] = question;
        });
      }
      setQuestions(questionsForAttempt);
      setTotalQuestionCount(totalQuestions);
      LockdownSessionStore.saveQuestionBundle(id, questionsList);
      if (data.attemptId || data._id) {
        attemptIdRef.current = data.attemptId || data._id;
      }
      if (data.studentId || data.candidateId || data.studentUid) {
        candidateIdRef.current = data.studentId || data.candidateId || data.studentUid;
      }
      if (data.accommodations) {
        setAccommodations(data.accommodations);
      }
      if (data.lockSectionsSequentially !== undefined) {
        setLockSectionsSequentially(Boolean(data.lockSectionsSequentially));
      }
      if (data.lockQuestionsSequentially !== undefined) {
        setLockQuestionsSequentially(Boolean(data.lockQuestionsSequentially));
      }
      if (Array.isArray(data.completedSectionIds)) {
        setCompletedSectionIds(data.completedSectionIds.map(String));
      }
      setActiveSectionId(data.activeSectionId ?? null);
      if (typeof data.currentQuestionIndex === "number") {
        setPermittedQuestionIndex(initialQuestionIndex);
        setCurrentIndex(initialQuestionIndex);
      }
      if (typeof data.navigationVersion === "number") {
        setNavigationVersion(data.navigationVersion);
      }
      const questionLimit = data.lockQuestionsSequentially
        ? Math.max(0, Number(data.questionTimeLimitSeconds) || 0)
        : 0;
      setQuestionTimeLimitSeconds(questionLimit);
      const currentQuestionStartedAtEpochMs = Number(data.currentQuestionStartedAtEpochMs)
        || new Date(data.currentQuestionStartedAt || data.startedAt || Date.now()).getTime();
      setQuestionDeadlineAtEpochMs(
        questionLimit > 0 ? currentQuestionStartedAtEpochMs + questionLimit * 1000 : null,
      );
      setQuestionTimeLeftSeconds(questionLimit > 0
        ? Math.max(0, Math.ceil((currentQuestionStartedAtEpochMs + questionLimit * 1000 - Date.now()) / 1000))
        : 0);
      questionTimerExpiryHandledRef.current = false;
      if (Array.isArray(data.completedQuestionIds) && data.completedQuestionIds.length > 0) {
        await offlineAutosaveQueue.discardQuestions(id, data.completedQuestionIds.map(String));
      }
      if (data.allowCalculators !== undefined) {
        setAllowCalculators(Boolean(data.allowCalculators));
      }
      if (data.allowScratchpad !== undefined) {
        setAllowScratchpad(Boolean(data.allowScratchpad));
      } else if (data.securityPolicy?.allowScratchpad !== undefined) {
        setAllowScratchpad(Boolean(data.securityPolicy.allowScratchpad));
      }
      if (data.allowReferenceDoc !== undefined) {
        setAllowReferenceDoc(Boolean(data.allowReferenceDoc));
      } else if (data.securityPolicy?.allowReferenceDoc !== undefined) {
        setAllowReferenceDoc(Boolean(data.securityPolicy.allowReferenceDoc));
      }
      if (data.referencePdfUrl) {
        setReferencePdfUrl(data.referencePdfUrl);
      }
      if (data.requireCloseOtherApps !== undefined) {
        setRequireCloseOtherApps(Boolean(data.requireCloseOtherApps));
      }
      if (data.allowSpellCheck !== undefined) {
        setAllowSpellCheck(Boolean(data.allowSpellCheck));
      } else if (data.securityPolicy?.allowSpellCheck !== undefined) {
        setAllowSpellCheck(Boolean(data.securityPolicy.allowSpellCheck));
      }
      if (data.allowFindOnPage !== undefined) {
        setAllowFindOnPage(Boolean(data.allowFindOnPage));
      } else if (data.securityPolicy?.allowFindOnPage !== undefined) {
        setAllowFindOnPage(Boolean(data.securityPolicy.allowFindOnPage));
      }
      if (Array.isArray(data.allowedUrlPatterns)) {
        setAllowedUrlPatterns(data.allowedUrlPatterns);
      } else if (Array.isArray(data.securityPolicy?.allowedUrlPatterns)) {
        setAllowedUrlPatterns(data.securityPolicy.allowedUrlPatterns);
      }
      if (data.enableScreenCaptureSnapshots !== undefined) {
        setEnableScreenCaptureSnapshots(Boolean(data.enableScreenCaptureSnapshots));
      }
      if (data.enableForensicWatermark !== undefined) {
        setEnableForensicWatermark(Boolean(data.enableForensicWatermark));
      } else if (data.securityPolicy?.enableForensicWatermark !== undefined) {
        setEnableForensicWatermark(Boolean(data.securityPolicy.enableForensicWatermark));
      }
      const resolvedDurationMinutes = data.durationMinutes !== undefined && data.durationMinutes > 0
        ? data.durationMinutes
        : 0.5; // 30-second standardized default when duration is missing
      setDurationMinutes(resolvedDurationMinutes);
      if (data.code) setAssessmentCode(data.code);
      if (data.title) setAssessmentTitle(data.title);

      const start = new Date(data.startedAt || new Date());
      setStartedAt(start);

      const fallbackMs = resolvedDurationMinutes * 60_000;
      const deadline = data.serverEndsAtEpochMs || (data.attemptExpiresAt
        ? new Date(data.attemptExpiresAt).getTime()
        : start.getTime() + fallbackMs);
      if (typeof data.serverNowMs === "number") {
        serverClockOffsetMsRef.current = data.serverNowMs - Date.now();
      }
      setAttemptDeadlineAt(deadline);
      setServerEndsAtEpochMs(deadline);
      const remainingMs = Math.max(0, deadline - (Date.now() + serverClockOffsetMsRef.current));
      setTimeLeftSeconds(Math.ceil(remainingMs / 1000));

      if (data.proctoring?.maxTabSwitches) {
        setMaxTabSwitches(data.proctoring.maxTabSwitches);
      }

      const initialResponses: Record<
        string,
        {
          selectedAnswer: number;
          selectedAnswers?: number[];
          code?: string;
          language?: string;
          codeByLanguage?: Record<string, string>;
          testCasesPassed?: number;
          totalTestCases?: number;
          status: string;
        }
      > = {};
      (data.savedResponses || []).forEach((r: any) => {
        if (r.questionId) {
          const hasMulti = Array.isArray(r.selectedAnswers) && r.selectedAnswers.length > 0;
          initialResponses[r.questionId.toString()] = {
            selectedAnswer: r.selectedAnswer ?? -1,
            selectedAnswers: Array.isArray(r.selectedAnswers)
              ? r.selectedAnswers
              : r.selectedAnswer >= 0
                ? [r.selectedAnswer]
                : [],
            code: r.code || "",
            language: r.language || undefined,
            codeByLanguage: r.code && r.language ? { [r.language]: r.code } : (r.codeByLanguage || {}),
            testCasesPassed: r.testCasesPassed || 0,
            totalTestCases: r.totalTestCases || 0,
            status:
              r.status ||
              (hasMulti || r.selectedAnswer >= 0 || (r.code && r.code.trim().length > 0)
                ? "answered"
                : "unvisited"),
          };
        }
      });
      if (compactLockdown && (data.attemptId || data._id)) {
        const completed = new Set<string>(data.completedQuestionIds || []);
        for (const question of questionsList as Question[]) {
          if (completed.has(question._id)) continue;
          const draft = readMacAssessmentDraft(attemptIdRef.current, question._id);
          if (!draft) continue;
          const saved = initialResponses[question._id];
          initialResponses[question._id] = {
            ...saved,
            ...draft,
            selectedAnswer: -1,
            status: saved?.status === "answered" || saved?.status === "marked_for_review" ? saved.status : "draft",
          };
        }
      }
      responsesRef.current = initialResponses;
      setResponses(initialResponses);
      setLoadedAssessmentId(id);

      if (isLockdownClient()) {
        try {
          await engageOsKiosk();
        } catch (kioskErr) {
          console.warn("Failed to engage OS kiosk:", kioskErr);
        }
      }
    } catch (err: any) {
      // Keep the verified camera handoff available for a retry in this webview.
      releaseAssessmentStream(id);
      const message = err?.response?.data?.message;
      const resolvedMessage = compactLockdown
        ? assessmentStartupError(err, "start")
        : Array.isArray(message)
          ? message.join(" ")
          : message || "We could not start this assessment. Please check your attempt eligibility and try again.";
      lockdownLogger.warn("ASSESSMENT_START", "start_attempt_failed", {
        assessmentId: id,
        statusCode: err?.response?.status ?? null,
        message: resolvedMessage,
      });
      void lockdownLogger.uploadDiagnosticsSnapshot(api, id, "start_attempt_failed", {
        statusCode: err?.response?.status ?? null,
        message: resolvedMessage,
      });
      setStartError(resolvedMessage);
      startAttemptRequestedRef.current = false;
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    } finally {
      setIsLoading(false);
    }
  }, [compactLockdown, id, isLoadingSettings, settingsError, isExamSubmitted, router, isLockdownActive, attestedSessionId,
    mediaRequirements.requireCamera, mediaRequirements.needsMediaGate, isMediaGatePassed, isAppsGatePassed]);

  // Trigger attempt start once LockDown pre-exam gates pass
  useEffect(() => {
    if (
      isLockdownClient() &&
      isMediaGatePassed &&
      isAppsGatePassed &&
      !startAttemptRequestedRef.current &&
      !startError &&
      !settingsError &&
      !isExamSubmitted &&
      !isLoadingSettings
    ) {
      void beginAssessmentAfterFullscreen();
    }
  }, [isMediaGatePassed, isAppsGatePassed, isExamSubmitted, isLoadingSettings, settingsError, startError, beginAssessmentAfterFullscreen]);

  // Media starts only for a loaded, active session; stopping is permanent for this assessment.
  const hasTimeRemaining = timeLeftSeconds > 0;
  const {
    videoRef,
    getAnalysisVideo,
    attachVideo,
    cameraActive,
    micActive,
    mediaStream,
    audioLevel,
    cameraError,
    faceCount,
    faceDetectionStatus,
    stopCamera,
    reconnectMedia,
    subscribeAudioLevel,
  } = useAssessmentMedia(
    id,
    mediaRequirements.needsMediaGate && loadedAssessmentId === id && questions.length > 0 && !isLoading && timeLeftSeconds > 0,
    recordViolation,
    { ...mediaRequirements, cameraSelectionPolicy: proctoring?.cameraSelectionPolicy },
  );

  // 3. Submit Attempt Handler
  const submitExam = useCallback(
    async (isAuto = false) => {
      flushDraftToState();
      if (isSubmitting || submissionRequestedRef.current || submitStartedRef.current) return;
      submissionRequestedRef.current = true;
      submitStartedRef.current = true;
      setSubmitError(null);
      setIsSubmitting(true);

      const formattedResponses = questions.flatMap((q) => {
        if (!q) return [];
        const r = responsesRef.current[q._id];
        return [{
          questionId: q._id,
          selectedAnswer: r ? r.selectedAnswer : -1,
          selectedAnswers: r?.selectedAnswers ?? (r && r.selectedAnswer >= 0 ? [r.selectedAnswer] : []),
          code: r?.code || "",
          language: r?.language || q.language || q.supportedLanguages?.[0] || "python",
          testCasesPassed: r?.testCasesPassed || 0,
          totalTestCases: r?.totalTestCases || 0,
          status: r ? r.status : "skipped",
          timeSpentSeconds: 0,
        }];
      });

      try {
        // 1. Flush any pending buffered offline autosaves first if there are any
        if (offlineAutosaveQueue.getPendingCount() > 0) {
          try {
            const flushed = await offlineAutosaveQueue.flush();
            if (!flushed) {
              toast.error("Wi-Fi is disconnected. Reconnecting to sync pending answers before submission...");
            }
          } catch {
            // Proceed to attempt submission
          }
        }

        const candidateId = candidateIdRef.current || "candidate";
        const attemptId = attemptIdRef.current || id;
        const submissionIdempotencyKey = `submit:${id}:${candidateId}:${attemptId}`;
        const clientSubmittedAtMs = Date.now();

        const payload = {
          responses: formattedResponses,
          timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
          violations: violationsRef.current,
          idempotencyKey: submissionIdempotencyKey,
          clientSubmittedAtMs,
          currentQuestionIndex: lockQuestionsSequentially ? permittedQuestionIndex : currentIndex,
        };
        let lastError: any;
        // Code evaluation can briefly fail while the judge service is busy.
        // Retry transient service/network failures before leaving the attempt.
        for (let retry = 0; retry < 3; retry++) {
          try {
            await studentAssessmentsAPI.submitAttempt(id, payload);
            lastError = null;
            break;
          } catch (error: any) {
            lastError = error;
            const status = error?.response?.status;
            // 409 Conflict indicates the submission is actively evaluating. Treat as transient with backoff retry!
            const transient = !status || status === 409 || status === 429 || status >= 500;
            if (!transient || retry === 2) break;
            const delay = status === 409 ? 1500 * (retry + 1) : 750 * (retry + 1);
            await new Promise((resolve) => window.setTimeout(resolve, delay));
          }
        }
        if (lastError) throw lastError;

        // Final exam submission confirmed: zero-fill and purge encrypted offline vault
        if (compactLockdown) clearMacAssessmentDrafts(attemptId);
        await offlineAutosaveQueue.purgeAll(id);
      } catch (err: any) {
        submissionRequestedRef.current = false;
        submitStartedRef.current = false;
        const responseMessage = err?.response?.data?.message;
        const message = Array.isArray(responseMessage) ? responseMessage.join(" ") : responseMessage;
        setSubmitError(message || "We could not confirm your submission. Your saved answers are still here; please retry submission.");
        setIsSubmitting(false);
        return;
      }
      stopCamera();
      // Release a preflight stream that was handed off but not adopted by the
      // exam media hook (for example, after a quick route transition).
      releaseAssessmentStream(id);
      clearAssessmentFaceReference(id);
      try {
        localStorage.removeItem(`codeskill_sections_done_${id}`);
      } catch {}

      // Acknowledge receipt and transition to 10-second post-submission feedback
      const receiptId = `CSL-SUB-${id.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const nowMs = Date.now();
      setIsExamSubmitted(true);
      setSubmissionReceiptId(receiptId);
      setSubmittedAtMs(nowMs);
      if (isLockdownClient()) {
        await LockdownSessionStore.saveState(id, {
          isSubmitted: true,
          submittedAtMs: nowMs,
          submissionReceiptId: receiptId,
        });
      } else {
        if (typeof router.push === "function") {
          router.push(`/assessments/${id}/result`);
        } else if (typeof router.replace === "function") {
          router.replace(`/assessments/${id}/result`);
        }
      }
    },
    [
      id,
      isSubmitting,
      questions,
      startedAt,
      stopCamera,
      router,
      currentIndex,
      compactLockdown,
      flushDraftToState,
      lockQuestionsSequentially,
      permittedQuestionIndex,
    ]
  );

  useEffect(() => {
    if (lockdownExitCountdown === null) return;
    if (lockdownExitCountdown <= 0) {
      void logoutAndExitLockdown();
      return;
    }
    const timer = window.setTimeout(() => {
      setLockdownExitCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [lockdownExitCountdown]);

  const reportFaceIssue = useEffectEvent((issue: string, details: string) => {
    const isAutoSubmitMode =
      proctoring?.autoSubmitOnViolation !== false &&
      proctoring?.mode !== "partial_proctored";
    if (compactLockdown) {
      setFaceMonitorStatus(isAutoSubmitMode ? details : `${details} (Negative marks deducted)`);
    }
    if (activeFaceIssueRef.current === issue) return;
    activeFaceIssueRef.current = issue;
    faceWarningsRef.current += 1;
    setFaceWarningCount(faceWarningsRef.current);
    recordViolation(issue, details);
    const warningNumber = faceWarningsRef.current;

    if (isAutoSubmitMode) {
      const warningText =
        warningNumber === 4
          ? `Face warning 4/5: ${details} One more warning will automatically submit your assessment.`
          : `Face warning ${warningNumber}/5: ${details}`;
      setWarningToast({
        id: Date.now(),
        message: warningText,
        type: warningNumber >= 4 ? "alert" : "warning",
      });
      if (!compactLockdown) setFaceMonitorStatus(details);
      if (warningNumber >= 5) {
        setIsAutoSubmitting(true);
        setWarningToast({
          id: Date.now(),
          message:
            "Five face-verification warnings reached. Your assessment is being submitted now.",
          type: "alert",
        });
        void submitExam(true);
      }
    } else if (!compactLockdown) {
      setFaceMonitorStatus(`${details} (Negative marks deducted)`);
    }
  });

  const legacyFaceTime = compactLockdown ? null : timeLeftSeconds;
  const legacyRecordViolation = compactLockdown ? null : recordViolation;
  const legacySubmitExam = compactLockdown ? null : submitExam;
  const legacyAutoSubmit = compactLockdown ? null : proctoring?.autoSubmitOnViolation;
  useEffect(() => {
    if (!cameraActive || loadedAssessmentId !== id || isSubmitting || !hasTimeRemaining) return;
    const reference = getAssessmentFaceReference(id);
    if (!reference) {
      setFaceMonitorStatus("Identity selfie missing");
      return;
    }

    let cancelled = false;
    let consecutiveMatches = 0;
    let consecutiveUnavailable = 0;
    let canvas: HTMLCanvasElement | null = null;

    const inspectFrame = async () => {
      if (cancelled || faceMonitorBusyRef.current || isSubmitting) return;
      const video = (compactLockdown ? getAnalysisVideo?.() : null) ?? videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
      faceMonitorBusyRef.current = true;
      try {
        if (!canvas || !compactLockdown) canvas = document.createElement("canvas");
        const height = Math.max(180, Math.round((320 * video.videoHeight) / video.videoWidth));
        if (canvas.width !== 320) canvas.width = 320;
        if (canvas.height !== height) canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const check: AssessmentFaceCheck = compactLockdown
          ? await checkAssessmentFace(canvas, reference, true)
          : await checkAssessmentFace(canvas, reference);
        if (cancelled) return;
        consecutiveUnavailable = 0;

        let issue: { type: string; details: string } | null = null;
        if (check.status === "no-face") issue = { type: "face_not_detected", details: "No face detected. Keep your face visible in the camera." };
        else if (check.status === "multiple-faces") issue = { type: "multiple_faces", details: "More than one face detected in the camera view." };
        else if (check.status === "mismatch") issue = { type: "face_mismatch", details: "The face in the camera does not match your identity selfie." };
        else if ("yaw" in check && check.yaw !== undefined && Math.abs(check.yaw) > 0.45) {
          lookingAwaySinceRef.current ??= Date.now();
          if (Date.now() - lookingAwaySinceRef.current >= 7000) {
            issue = { type: "looking_away", details: "Please face the screen. Looking away for too long is recorded as a warning." };
          }
        } else {
          lookingAwaySinceRef.current = null;
        }

        if (!issue) {
          faceCandidateRef.current = null;
          consecutiveMatches += 1;
          if (!compactLockdown || !activeFaceIssueRef.current || consecutiveMatches >= 2) {
            activeFaceIssueRef.current = null;
            setFaceMonitorStatus("Face matched · monitoring");
          }
          return;
        }

        consecutiveMatches = 0;
        const previous = faceCandidateRef.current;
        const candidate = previous?.issue === issue.type
          ? { issue: issue.type, count: previous.count + 1 }
          : { issue: issue.type, count: 1 };
        faceCandidateRef.current = candidate;
        if (!compactLockdown) setFaceMonitorStatus(issue.details);
        // Confirm a change before replacing the last known result on macOS or recording a warning.
        if (candidate.count >= 2) reportFaceIssue(issue.type, issue.details);
      } catch {
        consecutiveMatches = 0;
        if (compactLockdown) faceCandidateRef.current = null;
        consecutiveUnavailable += 1;
        if (!cancelled && (!compactLockdown || consecutiveUnavailable >= 2)) setFaceMonitorStatus("Face check unavailable · retrying");
      } finally {
        faceMonitorBusyRef.current = false;
      }
    };

    let firstCheck: number | undefined;
    if (compactLockdown) {
      setFaceMonitorStatus((status) => status === "Waiting for camera" ? "Checking identity…" : status);
      firstCheck = window.setTimeout(() => void inspectFrame(), 300);
    } else {
      setFaceMonitorStatus("Loading face verification models…");
      void inspectFrame();
    }
    const interval = window.setInterval(() => void inspectFrame(), 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
      if (!compactLockdown) faceMonitorBusyRef.current = false;
    };
  }, [
    cameraActive, compactLockdown, getAnalysisVideo, hasTimeRemaining, id, isSubmitting, loadedAssessmentId, videoRef,
    legacyAutoSubmit, legacyFaceTime, legacyRecordViolation, legacySubmitExam,
  ]);

  useEffect(() => {
    if (!lockQuestionsSequentially || questionTimeLimitSeconds <= 0 || questionDeadlineAtEpochMs === null) {
      return;
    }

    const updateRemaining = () => {
      setQuestionTimeLeftSeconds(Math.max(
        0,
        Math.ceil((questionDeadlineAtEpochMs - (Date.now() + serverClockOffsetMsRef.current)) / 1000),
      ));
    };
    const initialTick = window.setTimeout(updateRemaining, 0);
    const timer = window.setInterval(updateRemaining, 1000);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(timer);
    };
  }, [lockQuestionsSequentially, questionDeadlineAtEpochMs, questionTimeLimitSeconds]);

  // Snapshot the visible assessment page periodically for proctored exams.
  // Gated to proctored modes and downscaled to avoid main-thread freezes on low-spec CPUs.
  useEffect(() => {
    const isProctoringActive = proctoring?.mode !== "non_proctored";
    if (!isProctoringActive || loadedAssessmentId !== id || isLoading || isSubmitting) return;
    let cancelled = false;
    let timer: number | undefined;
    let isCapturing = false;

    const capture = async () => {
      if (cancelled || isCapturing) return;
      isCapturing = true;
      const examPage = examPageRef.current;
      try {
        if (!examPage) throw new Error("Assessment screen is not available");
        const { default: html2canvas } = await import("html2canvas");
        const canvas = await html2canvas(examPage, {
          backgroundColor: "#f8fafc",
          logging: false,
          useCORS: true,
          scale: 0.45, // Downscaled to 0.45 for rapid ~35ms capture without main-thread jank
          width: window.innerWidth,
          height: window.innerHeight,
          x: window.scrollX,
          y: window.scrollY,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          ignoreElements: (el) => el.classList?.contains("print-hidden") || el.tagName === "FOOTER",
          onclone: (clonedDoc) => {
            const styleElements = clonedDoc.querySelectorAll("style");
            styleElements.forEach((s) => {
              if (s.textContent?.includes("oklch")) {
                s.textContent = s.textContent.replace(/color-mix\(in oklch[^)]+\)/g, "rgba(0,0,0,0.1)").replace(/oklch\([^)]+\)/g, "#000000");
              }
            });
          },
        });
        if (cancelled) return;
        const image = canvas.toDataURL("image/jpeg", 0.45);
        // Explicitly release canvas pixel buffer immediately to free memory
        canvas.width = 0;
        canvas.height = 0;

        const timestamp = new Date().toISOString();
        let saved = false;
        let lastError: unknown;
        // Retry the same captured frame on transient network/storage failures.
        for (let attempt = 0; attempt < 3 && !cancelled; attempt += 1) {
          try {
            const response = await studentAssessmentsAPI.recordProctorCapture(id, {
              type: "screen",
              image,
              filename: `assessment-${id}-${Date.now()}.jpg`,
              timestamp,
            });
            const result = response.data;
            if (result?.success !== true || result?.savedToS3 !== true || !result?.url || !result?.objectKey) {
              throw new Error("The server did not confirm that this snapshot was saved to S3");
            }
            saved = true;
            break;
          } catch (error) {
            lastError = error;
            if (attempt < 2 && !cancelled) {
              await new Promise((resolve) => window.setTimeout(resolve, 1000 * (attempt + 1)));
            }
          }
        }
        if (!saved && !cancelled) console.warn("Assessment snapshot upload failed after retries:", lastError);
      } catch (error) {
        console.warn("Assessment page snapshot could not be uploaded:", error);
      } finally {
        isCapturing = false;
      }
      if (!cancelled) timer = window.setTimeout(() => void capture(), 90_000);
    };

    // Trigger on visibility change (tab switch / blur) for immediate security capture
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void capture();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Keep periodic snapshots sequential on a 90s cadence
    timer = window.setTimeout(() => void capture(), 90_000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [id, isLoading, isSubmitting, loadedAssessmentId, proctoring?.mode]);

  // 4. Server-Authoritative Zero-Jitter Countdown Clock on a 250ms UI tick
  useEffect(() => {
    const targetEpoch = serverEndsAtEpochMs ?? attemptDeadlineAt;
    if (isLoading || isSubmitting || targetEpoch === null) return;
    const updateClock = () => {
      const remainingMs = Math.max(
        0,
        targetEpoch - (Date.now() + serverClockOffsetMsRef.current)
      );
      setTimeLeftSeconds(Math.ceil(remainingMs / 1000));
    };
    updateClock();
    const timer = setInterval(updateClock, 250);
    return () => clearInterval(timer);
  }, [serverEndsAtEpochMs, attemptDeadlineAt, isLoading, isSubmitting]);

  const hasAutoSubmittedRef = useRef(false);

  useEffect(() => {
    if (
      !isLoading &&
      !isSubmitting &&
      loadedAssessmentId === id &&
      attemptDeadlineAt !== null &&
      timeLeftSeconds <= 0
    ) {
      if (!hasAutoSubmittedRef.current) {
        hasAutoSubmittedRef.current = true;
        void submitExam(true);
      }
    }
  }, [id, isLoading, isSubmitting, loadedAssessmentId, submitExam, timeLeftSeconds, attemptDeadlineAt]);

  // 5. Smart Autosave Progress Interval (Only transmits when responses or violations change)
  const lastSavedFingerprintRef = useRef<string>("");

  useEffect(() => {
    if (isLoading || loadedAssessmentId !== id || isExamSubmitted) return;

    const autosaveInterval = setInterval(async () => {
      const currentFingerprint = JSON.stringify(responsesRef.current)
        + `:${violationsRef.current.length}`
        + (lockQuestionsSequentially ? `:${permittedQuestionIndex}` : `:${currentIndex}`);
      if (currentFingerprint === lastSavedFingerprintRef.current) {
        // No modifications since last successful sync; avoid redundant network traffic
        return;
      }

      const progressQuestions = lockQuestionsSequentially
        ? questions.filter((_, index) => index === permittedQuestionIndex)
        : lockSectionsSequentially
          ? questions.filter((question) => question && question.sectionId === activeSectionId)
          : questions.filter(Boolean);
      const formattedResponses = progressQuestions.map((q) => {
        const r = responsesRef.current[q._id];
        return {
          questionId: q._id,
          selectedAnswer: r ? r.selectedAnswer : -1,
          selectedAnswers: r?.selectedAnswers ?? (r && r.selectedAnswer >= 0 ? [r.selectedAnswer] : []),
          code: r?.code || "",
          language: r?.language || q.language || q.supportedLanguages?.[0] || "python",
          testCasesPassed: r?.testCasesPassed || 0,
          totalTestCases: r?.totalTestCases || 0,
          status: r ? r.status : "unvisited",
        };
      });

      try {
        const payload = {
          responses: formattedResponses,
          timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
          violations: violationsRef.current,
        };
        await offlineAutosaveQueue.enqueue({
          attemptId: id,
          questionId: questions[lockQuestionsSequentially ? permittedQuestionIndex : currentIndex]?._id || 'all-progress',
          idempotencyKey: compactLockdown ? crypto.randomUUID() : undefined,
          payload,
          endpoint: `/api/assessments/${id}/save-progress`,
          method: 'POST',
        });
        lastSavedFingerprintRef.current = currentFingerprint;
      } catch (e) {
        // Handled in offline queue
      }
    }, 15000);

    return () => clearInterval(autosaveInterval);
  }, [compactLockdown, id, isLoading, loadedAssessmentId, isExamSubmitted, questions, startedAt, lockSectionsSequentially, lockQuestionsSequentially, activeSectionId, permittedQuestionIndex, currentIndex, violations.length]);

  // Anti-Cheat functionality is handled by the exam security container component.
  // The hooks below rely on the security container.

  // Keyboard shortcuts, fullscreen logic, and context menu are handled by the security container.

  // Toast Auto-Dismiss
  useEffect(() => {
    if (!warningToast) return;
    const t = setTimeout(() => {
      setWarningToast(null);
    }, 4000);
    return () => clearTimeout(t);
  }, [warningToast]);

  const enforceFullscreen = proctoring?.enforceFullscreen !== false;
  const toggleFullscreen = useCallback(() => {
    if (isDocumentFullscreen()) {
      if (!enforceFullscreen) void document.exitFullscreen().catch(() => {});
    } else {
      void enterDocumentFullscreen().catch(() => setWarningToast({ id: Date.now(), message: "Fullscreen could not be enabled. Please allow fullscreen and try again.", type: "warning" }));
    }
  }, [enforceFullscreen]);

  const toggleQuestionSidebar = useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) setSidebarCollapsed(value => !value);
    else setMobileSidebarOpen(value => !value);
  }, []);
  const openSubmitModal = useCallback(() => setShowSubmitModal(true), []);

  // Question Interaction Handlers
  const currentQ = questions[currentIndex];
  const isMultiChoice = Boolean(
    currentQ && (
      currentQ.questionType?.toLowerCase() === "multiple_choice" ||
      currentQ.questionType?.toLowerCase() === "multiple"
    )
  );
  const currentResponse = currentQ ? responses[currentQ._id] : null;
  const isCurrentQuestionAttempted = Boolean(
    currentResponse
    && (
      (Array.isArray(currentResponse.selectedAnswers) && currentResponse.selectedAnswers.length > 0)
      || currentResponse.selectedAnswer >= 0
      || currentResponse.code?.trim()
    ),
  );
  const selectedAnswer = currentResponse ? currentResponse.selectedAnswer : -1;
  const selectedAnswers = currentResponse?.selectedAnswers ?? (selectedAnswer >= 0 ? [selectedAnswer] : []);

  const handleSelectOption = (optionIndex: number) => {
    if (!currentQ) return;
    if (isMultiChoice) {
      const prevAnswers = responsesRef.current[currentQ._id]?.selectedAnswers ?? (
        responsesRef.current[currentQ._id]?.selectedAnswer !== undefined && responsesRef.current[currentQ._id]?.selectedAnswer >= 0
          ? [responsesRef.current[currentQ._id]!.selectedAnswer]
          : []
      );
      const nextAnswers = prevAnswers.includes(optionIndex)
        ? prevAnswers.filter((idx) => idx !== optionIndex)
        : [...prevAnswers, optionIndex].sort((a, b) => a - b);
      const hasSelections = nextAnswers.length > 0;
      const next = {
        ...responsesRef.current,
        [currentQ._id]: {
          ...responsesRef.current[currentQ._id],
          selectedAnswer: nextAnswers[0] ?? -1,
          selectedAnswers: nextAnswers,
          status: responsesRef.current[currentQ._id]?.status === "marked_for_review"
            ? "marked_for_review"
            : hasSelections
              ? "answered"
              : "skipped",
        },
      };
      responsesRef.current = next;
      setResponses(next);

      const updated = next[currentQ._id];
      void offlineAutosaveQueue.enqueue({
        attemptId: id,
        questionId: currentQ._id,
        payload: {
          responses: [{
            questionId: currentQ._id,
            selectedAnswer: updated.selectedAnswer,
            selectedAnswers: updated.selectedAnswers || [],
            code: updated.code || "",
            language: updated.language || currentQ.language || "python",
            testCasesPassed: updated.testCasesPassed || 0,
            totalTestCases: updated.totalTestCases || 0,
            status: updated.status,
          }],
          timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
          violations: violationsRef.current,
        },
        endpoint: `/api/assessments/${id}/save-progress`,
        method: 'POST',
      });
    } else {
      const next = {
        ...responsesRef.current,
        [currentQ._id]: {
          ...responsesRef.current[currentQ._id],
          selectedAnswer: optionIndex,
          selectedAnswers: [optionIndex],
          status: responsesRef.current[currentQ._id]?.status === "marked_for_review" ? "marked_for_review" : "answered",
        },
      };
      responsesRef.current = next;
      setResponses(next);

      const updated = next[currentQ._id];
      void offlineAutosaveQueue.enqueue({
        attemptId: id,
        questionId: currentQ._id,
        payload: {
          responses: [{
            questionId: currentQ._id,
            selectedAnswer: updated.selectedAnswer,
            selectedAnswers: updated.selectedAnswers || [],
            code: updated.code || "",
            language: updated.language || currentQ.language || "python",
            testCasesPassed: updated.testCasesPassed || 0,
            totalTestCases: updated.totalTestCases || 0,
            status: updated.status,
          }],
          timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
          violations: violationsRef.current,
        },
        endpoint: `/api/assessments/${id}/save-progress`,
        method: 'POST',
      });
    }
  };

  const handleClearSelection = () => {
    if (!currentQ) return;
    const next = {
      ...responsesRef.current,
      [currentQ._id]: {
        ...responsesRef.current[currentQ._id],
        selectedAnswer: -1,
        selectedAnswers: [],
        status: responsesRef.current[currentQ._id]?.status === "marked_for_review" ? "marked_for_review" : "skipped",
      },
    };
    responsesRef.current = next;
    setResponses(next);

    const updated = next[currentQ._id];
    void offlineAutosaveQueue.enqueue({
      attemptId: id,
      questionId: currentQ._id,
      payload: {
        responses: [{
          questionId: currentQ._id,
          selectedAnswer: updated.selectedAnswer,
          selectedAnswers: updated.selectedAnswers || [],
          code: updated.code || "",
          language: updated.language || currentQ.language || "python",
          testCasesPassed: updated.testCasesPassed || 0,
          totalTestCases: updated.totalTestCases || 0,
          status: updated.status,
        }],
        timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
        violations: violationsRef.current,
      },
      endpoint: `/api/assessments/${id}/save-progress`,
      method: 'POST',
    });
  };

  const handleMarkForReview = () => {
    flushDraftToState();
    if (!currentQ) return;
    const previous = responsesRef.current[currentQ._id];
    const removing = previous?.status === "marked_for_review";
    const hasAnswer = (previous?.selectedAnswers && previous.selectedAnswers.length > 0) || (previous?.selectedAnswer ?? -1) >= 0 || Boolean(previous?.code?.trim());
    const next = { ...responsesRef.current, [currentQ._id]: {
      ...previous,
      selectedAnswer: previous?.selectedAnswer ?? -1,
      selectedAnswers: previous?.selectedAnswers,
      status: removing ? (hasAnswer ? "answered" : "skipped") : "marked_for_review",
    } };
    responsesRef.current = next;
    setResponses(next);
    // Removing review keeps the candidate on this question.
    if (!isSequentialActive && !isSectionLockActive && !removing && currentIndex < questions.length - 1) {
      setCurrentIndex(index => index + 1);
    }
  };

  // Keep editor drafts in the attempt state so sidebar navigation and timed
  // autosaves include the latest code, even before Submit Solution is clicked.
  const handleCodingDraft = useCallback(
    (code: string, language: string, codeByLanguage?: Record<string, string>) => {
      if (!currentQ) return;
      const previous = responsesRef.current[currentQ._id];
      const wasSubmitted = compactLockdown && previous?.status === "answered";
      const status = wasSubmitted ? "answered" : previous?.status === "marked_for_review" ? "marked_for_review" : "draft";
      const testCasesPassed = wasSubmitted ? previous?.testCasesPassed ?? 0 : 0;
      const totalTestCases = wasSubmitted ? previous?.totalTestCases ?? 0 : 0;
      const languageDrafts = { ...(previous?.codeByLanguage || {}), ...(codeByLanguage || {}), [language]: code };
      const next = {
        ...responsesRef.current,
        [currentQ._id]: {
          ...previous,
          selectedAnswer: -1,
          code,
          language,
          codeByLanguage: languageDrafts,
          testCasesPassed,
          totalTestCases,
          status,
        },
      };
      // 1. Synchronously update ref: timed autosaves, navigation, and submission always have up-to-date code
      responsesRef.current = next;
      if (compactLockdown && attemptIdRef.current !== "attempt") {
        checkpointMacAssessmentDraft(attemptIdRef.current, currentQ._id, {
          code, language, codeByLanguage: languageDrafts,
        });
      }

      // 2. Debounce parent state re-render by 400ms so fast typing doesn't choke React on low-spec CPUs
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
      const saveDraft = () => {
        void offlineAutosaveQueue.enqueue({
          attemptId: id,
          questionId: currentQ._id,
          idempotencyKey: compactLockdown ? crypto.randomUUID() : undefined,
          payload: {
            responses: [{
              questionId: currentQ._id,
              selectedAnswer: -1,
              selectedAnswers: [],
              code,
              language,
              testCasesPassed,
              totalTestCases,
              status,
            }],
            timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
            violations: violationsRef.current,
          },
          endpoint: `/api/assessments/${id}/save-progress`,
          method: 'POST',
        });
      };
      if (compactLockdown) pendingMacCodingSave.current = saveDraft;

      draftDebounceRef.current = setTimeout(() => {
        draftDebounceRef.current = null;
        pendingMacCodingSave.current = null;
        setResponses(responsesRef.current);
        saveDraft();
      }, 400);
    },
    [compactLockdown, currentQ, id, startedAt]
  );

  const handleSaveCodingQuestion = useCallback(async (
    code: string,
    language: string,
    testCasesPassed: number,
    totalTestCases: number
  ) => {
    flushDraftToState();
    if (!currentQ) return;
    const nextResponses = {
      ...responsesRef.current,
      [currentQ._id]: {
        ...responsesRef.current[currentQ._id],
        selectedAnswer: -1,
        selectedAnswers: [] as number[],
        code,
        language,
        codeByLanguage: { ...(responsesRef.current[currentQ._id]?.codeByLanguage || {}), [language]: code },
        testCasesPassed,
        totalTestCases,
        status: "answered",
      },
    };
    setResponses(nextResponses);
    responsesRef.current = nextResponses;

    // Send formatted progress to server immediately
    const progressQuestions = lockSectionsSequentially || lockQuestionsSequentially
      ? [currentQ]
      : questions.filter(Boolean);
    const formatted = progressQuestions.map((q) => {
      const r = nextResponses[q._id];
      return {
        questionId: q._id,
        selectedAnswer: r ? r.selectedAnswer : -1,
        selectedAnswers: r?.selectedAnswers ?? (r && r.selectedAnswer >= 0 ? [r.selectedAnswer] : []),
        code: r?.code || "",
        language: r?.language || q.language || q.supportedLanguages?.[0] || "python",
        testCasesPassed: r?.testCasesPassed || 0,
        totalTestCases: r?.totalTestCases || 0,
        status: r ? r.status : "unvisited",
        timeSpentSeconds: 0,
      };
    });

    try {
      await studentAssessmentsAPI.saveProgress(id, {
        responses: formatted,
        timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
        violations: violationsRef.current,
      });
    } catch (err) {
      void offlineAutosaveQueue.enqueue({
        attemptId: id,
        questionId: currentQ._id,
        payload: {
          responses: formatted,
          timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
          violations: violationsRef.current,
        },
        endpoint: `/api/assessments/${id}/save-progress`,
        method: 'POST',
      });
      throw err;
    }
  }, [currentQ, flushDraftToState, id, lockQuestionsSequentially, lockSectionsSequentially, questions, startedAt]);

  // Section grouping & sequential locking calculation
  const sectionGroups = useMemo(() => {
    if (!questions.length) return [];
    const map = new Map<string, { id: string; title: string; order: number; questionIndices: number[] }>();
    
    questions.forEach((q, idx) => {
      const id = q.sectionId || q.sectionTitle || "default";
      const title = q.sectionTitle || "General Section";
      const order = typeof q.sectionOrder === "number" ? q.sectionOrder : 0;
      
      if (!map.has(id)) {
        map.set(id, {
          id,
          title,
          order,
          questionIndices: [idx],
        });
      } else {
        map.get(id)!.questionIndices.push(idx);
      }
    });

    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [questions]);

  const isSequentialActive = lockQuestionsSequentially;
  const isSectionLockActive = lockSectionsSequentially && !lockQuestionsSequentially;

  const activeSectionIndex = useMemo(() => {
    if (!isSectionLockActive) return -1;
    const activeIndex = sectionGroups.findIndex((section) => section.id === activeSectionId);
    if (activeIndex >= 0) return activeIndex;
    const firstIncompleteIdx = sectionGroups.findIndex((s) => !completedSectionIds.includes(s.id));
    return firstIncompleteIdx;
  }, [isSectionLockActive, sectionGroups, activeSectionId, completedSectionIds]);

  const activeSection = useMemo(() => {
    if (activeSectionIndex === -1) return null;
    return sectionGroups[activeSectionIndex] || null;
  }, [activeSectionIndex, sectionGroups]);

  const questionSectionMap = useMemo(() => {
    const map = new Map<number, { section: { id: string; title: string; order: number; questionIndices: number[] }; status: "completed" | "active" | "locked" | "unlocked" }>();
    if (!isSequentialActive && !isSectionLockActive) {
      sectionGroups.forEach((s) => {
        s.questionIndices.forEach((qIdx) => map.set(qIdx, { section: s, status: "unlocked" }));
      });
      return map;
    }
    sectionGroups.forEach((s) => {
      s.questionIndices.forEach((qIdx) => {
        const status = isSequentialActive
          ? qIdx < permittedQuestionIndex
            ? "completed"
            : qIdx === permittedQuestionIndex
              ? "active"
              : "locked"
          : completedSectionIds.includes(s.id)
            ? "completed"
            : s.id === activeSection?.id
              ? "active"
              : "locked";
        map.set(qIdx, { section: s, status });
      });
    });
    return map;
  }, [isSequentialActive, isSectionLockActive, sectionGroups, completedSectionIds, activeSection, permittedQuestionIndex]);

  const isFirstQuestionOfCurrentSection = useMemo(() => {
    if (!activeSection) return currentIndex === 0;
    return activeSection.questionIndices[0] === currentIndex;
  }, [activeSection, currentIndex]);

  const isLastQuestionOfCurrentSection = useMemo(() => {
    if (!activeSection) return currentIndex === questions.length - 1;
    return activeSection.questionIndices[activeSection.questionIndices.length - 1] === currentIndex;
  }, [activeSection, currentIndex]);

  useEffect(() => {
    if (isSequentialActive && currentIndex !== permittedQuestionIndex) {
      setCurrentIndex(permittedQuestionIndex);
    }
  }, [isSequentialActive, currentIndex, permittedQuestionIndex]);

  const activeSectionStats = useMemo(() => {
    if (!activeSection) return { answered: 0, review: 0, unattempted: 0, total: 0 };
    let answered = 0;
    let review = 0;
    let unattempted = 0;
    activeSection.questionIndices.forEach((idx) => {
      const q = questions[idx];
      if (!q) return;
      const r = responses[q._id];
      if (
        r?.status === "answered" &&
        ((r.selectedAnswers && r.selectedAnswers.length > 0) || r.selectedAnswer >= 0 || Boolean(r.code?.trim()))
      ) {
        answered++;
      } else if (r?.status === "marked_for_review") {
        review++;
      } else {
        unattempted++;
      }
    });
    return { answered, review, unattempted, total: activeSection.questionIndices.length };
  }, [activeSection, questions, responses]);

  const handleCompleteCurrentSection = useCallback(async () => {
    if (!isSectionLockActive || !activeSection || isNavigating) return;
    flushDraftToState();
    setIsNavigating(true);
    try {
      if (offlineAutosaveQueue.getPendingCount() > 0) {
        const flushed = await offlineAutosaveQueue.flush();
        if (!flushed) throw new Error("Could not sync saved answers. Reconnect before submitting this section.");
      }

      const sectionQuestions = activeSection.questionIndices
        .map((index) => questions[index])
        .filter((question): question is Question => Boolean(question));
      const formatted = sectionQuestions.map((question) => {
        const response = responsesRef.current[question._id];
        return {
          questionId: question._id,
          selectedAnswer: response?.selectedAnswer ?? -1,
          selectedAnswers: response?.selectedAnswers ?? [],
          code: response?.code || "",
          language: response?.language || question.language || question.supportedLanguages?.[0] || "python",
          testCasesPassed: response?.testCasesPassed || 0,
          totalTestCases: response?.totalTestCases || 0,
          status: response?.status || "unvisited",
          timeSpentSeconds: 0,
        };
      });
      await studentAssessmentsAPI.saveProgress(id, {
        currentQuestionIndex: currentIndex,
        responses: formatted,
        timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
        violations: violationsRef.current,
      });
      const response = await studentAssessmentsAPI.completeSection(id, {
        sectionId: activeSection.id,
        navigationVersion,
      });
      const data = response.data?.data || response.data;
      const nextCompletedSectionIds = Array.isArray(data.completedSectionIds)
        ? data.completedSectionIds.map(String)
        : [...completedSectionIds, activeSection.id];

      setCompletedSectionIds(nextCompletedSectionIds);
      setActiveSectionId(data.activeSectionId ?? null);
      setNavigationVersion(data.navigationVersion ?? navigationVersion + 1);
      setQuestions((previous) =>
        mergeAttemptQuestions(previous, data.questions || [], totalQuestionCount),
      );
      if (typeof data.currentQuestionIndex === "number") {
        setCurrentIndex(data.currentQuestionIndex);
        setPermittedQuestionIndex(data.currentQuestionIndex);
      }
      setShowSectionSubmitModal(false);
      await offlineAutosaveQueue.discardQuestions(
        id,
        sectionQuestions.map((question) => question._id),
      );

      if (data.assessmentReadyForSubmission) {
        toast.success("All sections completed. You may now submit your assessment.");
        setShowSubmitModal(true);
      } else {
        toast.success(`Section "${activeSection.title}" submitted. The next section is now unlocked.`);
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || "Could not submit this section. Please retry.";
      toast.error(Array.isArray(message) ? message.join(" ") : message);
    } finally {
      setIsNavigating(false);
    }
  }, [
    isSectionLockActive,
    isNavigating,
    activeSection,
    flushDraftToState,
    id,
    questions,
    currentIndex,
    startedAt,
    navigationVersion,
    completedSectionIds,
    totalQuestionCount,
  ]);

  const navigateWithinActiveSection = useCallback(async (targetIndex: number) => {
    if (!isSectionLockActive || !activeSection || isNavigating || targetIndex === currentIndex) return;
    if (!activeSection.questionIndices.includes(targetIndex)) return;
    const targetQuestion = questions[targetIndex];
    if (!targetQuestion || !currentQ) return;

    setIsNavigating(true);
    try {
      const currentResponse = responsesRef.current[currentQ._id];
      await studentAssessmentsAPI.saveProgress(id, {
        currentQuestionIndex: currentIndex,
        responses: [{
          questionId: currentQ._id,
          selectedAnswer: currentResponse?.selectedAnswer ?? -1,
          selectedAnswers: currentResponse?.selectedAnswers ?? [],
          code: currentResponse?.code || "",
          language: currentResponse?.language || currentQ.language || "python",
          status: currentResponse?.status || "unvisited",
          timeSpentSeconds: 0,
        }],
        timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
        violations: violationsRef.current,
      });
      if (offlineAutosaveQueue.getPendingCount() > 0) {
        const flushed = await offlineAutosaveQueue.flush();
        if (!flushed) throw new Error("Could not sync saved answers. Reconnect and retry before navigating.");
      }
      const response = await studentAssessmentsAPI.navigateAttempt(id, {
        targetQuestionId: targetQuestion._id,
        targetQuestionIndex: targetIndex,
        navigationVersion,
      });
      const navigation = response.data?.data || response.data;
      if (!navigation?.navigationAllowed) {
        throw new Error("The server did not authorize navigation to that question.");
      }
      setQuestions((previous) => mergeAttemptQuestions(
        previous,
        navigation.permittedQuestion ? [navigation.permittedQuestion] : [],
        totalQuestionCount,
      ));
      setCurrentIndex(navigation.currentQuestionIndex ?? targetIndex);
      setNavigationVersion(navigation.navigationVersion ?? navigationVersion + 1);
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || "Could not open that question. Please retry.";
      toast.error(Array.isArray(message) ? message.join(" ") : message);
    } finally {
      setIsNavigating(false);
    }
  }, [
    isSectionLockActive,
    activeSection,
    isNavigating,
    currentIndex,
    questions,
    currentQ,
    id,
    startedAt,
    navigationVersion,
    totalQuestionCount,
  ]);

  const handleSaveAndNext = useCallback(async () => {
    if (isNavigating) return;
    flushDraftToState();
    if (isSectionLockActive) {
      if (isLastQuestionOfCurrentSection) {
        setShowSectionSubmitModal(true);
      } else {
        const currentPosition = activeSection?.questionIndices.indexOf(currentIndex) ?? -1;
        const nextIndex = activeSection?.questionIndices[currentPosition + 1];
        if (typeof nextIndex === "number") await navigateWithinActiveSection(nextIndex);
      }
      return;
    }
    if (isSequentialActive) {
      if (currentIndex < totalQuestionCount - 1) {
        const nextIndex = currentIndex + 1;
        if (!currentQ) return;
        setIsNavigating(true);
        try {
          const currentResponse = responsesRef.current[currentQ._id];
          await studentAssessmentsAPI.saveProgress(id, {
            responses: [{
              questionId: currentQ._id,
              selectedAnswer: currentResponse?.selectedAnswer ?? -1,
              selectedAnswers: currentResponse?.selectedAnswers ?? [],
              code: currentResponse?.code || "",
              language: currentResponse?.language || currentQ.language || "python",
              status: currentResponse?.status || "unvisited",
              timeSpentSeconds: 0,
            }],
            timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
            violations: violationsRef.current,
          });
          await offlineAutosaveQueue.discardQuestions(id, [currentQ._id]);
          if (offlineAutosaveQueue.getPendingCount() > 0) {
            const flushed = await offlineAutosaveQueue.flush();
            if (!flushed) {
              throw new Error("Could not sync saved answers. Reconnect and retry before advancing.");
            }
          }
          const res = await studentAssessmentsAPI.navigateAttempt(id, {
            targetQuestionIndex: nextIndex,
            targetQuestionId: questions[nextIndex]?._id,
            navigationVersion,
          });
          const navigation = res.data?.data || res.data;
          if (!navigation?.navigationAllowed) return;
          if (typeof navigation.serverNowMs === "number") {
            serverClockOffsetMsRef.current = navigation.serverNowMs - Date.now();
          }
          const questionLimit = lockQuestionsSequentially
            ? Math.max(0, Number(navigation.questionTimeLimitSeconds ?? questionTimeLimitSeconds) || 0)
            : 0;
          const questionStartedAtEpochMs = Number(navigation.currentQuestionStartedAtEpochMs)
            || new Date(navigation.currentQuestionStartedAt || Date.now()).getTime();
          setQuestionTimeLimitSeconds(questionLimit);
          setQuestionDeadlineAtEpochMs(
            questionLimit > 0 ? questionStartedAtEpochMs + questionLimit * 1000 : null,
          );
          setQuestionTimeLeftSeconds(questionLimit > 0
            ? Math.max(0, Math.ceil(
                (questionStartedAtEpochMs + questionLimit * 1000 - (Date.now() + serverClockOffsetMsRef.current)) / 1000,
              ))
            : 0);
          questionTimerExpiryHandledRef.current = false;
          setNavigationVersion(navigation.navigationVersion ?? navigationVersion + 1);
          setPermittedQuestionIndex(navigation.currentQuestionIndex ?? nextIndex);
          setCurrentIndex(navigation.currentQuestionIndex ?? nextIndex);
          if (navigation.permittedQuestion) {
            setQuestions((previous) => mergeAttemptQuestions(
              previous,
              [navigation.permittedQuestion],
              totalQuestionCount,
            ));
          }
        } catch (error: any) {
          const message = error?.response?.data?.message || error?.message || "Could not advance. Please retry without refreshing your answers.";
          toast.error(Array.isArray(message) ? message.join(" ") : message);
        } finally {
          setIsNavigating(false);
        }
      } else {
        setShowSubmitModal(true);
      }
      return;
    }

    if (currentIndex < totalQuestionCount - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowSubmitModal(true);
    }
  }, [
    isNavigating,
    flushDraftToState,
    isSectionLockActive,
    isLastQuestionOfCurrentSection,
    activeSection,
    navigateWithinActiveSection,
    isSequentialActive,
    currentIndex,
    totalQuestionCount,
    currentQ,
    id,
    startedAt,
    navigationVersion,
    questionTimeLimitSeconds,
    lockQuestionsSequentially,
    questions,
  ]);

  const handlePreviousQuestion = useCallback(() => {
    if (isSequentialActive || (compactLockdown && isNavigating)) return;
    flushDraftToState();
    if (isSectionLockActive && activeSection) {
      const previousIndex = activeSection.questionIndices[activeSection.questionIndices.indexOf(currentIndex) - 1];
      if (typeof previousIndex === "number") void navigateWithinActiveSection(previousIndex);
    } else {
      setCurrentIndex((prev) => Math.max(0, prev - 1));
    }
  }, [activeSection, compactLockdown, currentIndex, flushDraftToState, isNavigating, isSectionLockActive, isSequentialActive, navigateWithinActiveSection]);

  useEffect(() => {
    questionTimerExpiryHandledRef.current = false;
  }, [currentIndex]);

  useEffect(() => {
    if (
      !lockQuestionsSequentially
      || questionTimeLimitSeconds <= 0
      || questionDeadlineAtEpochMs === null
      || questionTimeLeftSeconds > 0
      || isLoading
      || loadedAssessmentId !== id
      || isSubmitting
      || isNavigating
      || submissionRequestedRef.current
      || submitStartedRef.current
      || hasAutoSubmittedRef.current
      || questionTimerExpiryHandledRef.current
    ) {
      return;
    }

    const expiryAction = window.setTimeout(() => {
      if (submissionRequestedRef.current || submitStartedRef.current || hasAutoSubmittedRef.current) {
        return;
      }
      questionTimerExpiryHandledRef.current = true;
      if (currentIndex >= totalQuestionCount - 1) {
        void submitExam(true);
      } else {
        void handleSaveAndNext();
      }
    }, 0);
    return () => window.clearTimeout(expiryAction);
  }, [
    id,
    currentIndex,
    totalQuestionCount,
    lockQuestionsSequentially,
    questionTimeLimitSeconds,
    questionDeadlineAtEpochMs,
    questionTimeLeftSeconds,
    isLoading,
    loadedAssessmentId,
    isSubmitting,
    isNavigating,
    submitExam,
    handleSaveAndNext,
  ]);

  // Keyboard Navigation (A, B, C, D to select options, Arrow keys for prev/next)
  useEffect(() => {
    const handleKeyNav = (e: KeyboardEvent) => {
      // Don't trigger if modal is open or typing
      if (showSubmitModal || showSectionSubmitModal || showViolationModal) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, button, [contenteditable='true'], .monaco-editor")) return;
      if (["coding", "algorithmic", "dsa"].includes(currentQ?.questionType?.toLowerCase())) return;

      const key = e.key.toUpperCase();
      if (key === "A" && currentQ?.options?.length > 0) handleSelectOption(0);
      else if (key === "B" && currentQ?.options?.length > 1) handleSelectOption(1);
      else if (key === "C" && currentQ?.options?.length > 2) handleSelectOption(2);
      else if (key === "D" && currentQ?.options?.length > 3) handleSelectOption(3);
      else if (e.key === "ArrowRight") {
        if (isSequentialActive || isSectionLockActive) {
          void handleSaveAndNext();
        } else if (currentIndex < totalQuestionCount - 1) {
          setCurrentIndex((i) => i + 1);
        }
      } else if (e.key === "ArrowLeft") {
        if (isSectionLockActive && activeSection) {
          const previousIndex = activeSection.questionIndices[
            activeSection.questionIndices.indexOf(currentIndex) - 1
          ];
          if (typeof previousIndex === "number") void navigateWithinActiveSection(previousIndex);
        } else if (!isSequentialActive && currentIndex > 0) {
          setCurrentIndex((i) => i - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyNav);
    return () => window.removeEventListener("keydown", handleKeyNav);
  }, [
    currentQ,
    currentIndex,
    totalQuestionCount,
    showSubmitModal,
    showSectionSubmitModal,
    showViolationModal,
    isSequentialActive,
    isSectionLockActive,
    isLastQuestionOfCurrentSection,
    isFirstQuestionOfCurrentSection,
    activeSection,
    activeSectionIndex,
    sectionGroups.length,
    handleSaveAndNext,
  ]);

  // Pre-calculate section counts once to avoid O(N^2) questions.filter inside render
  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const q of questions) {
      if (!q) continue;
      if (q.sectionTitle) {
        counts[q.sectionTitle] = (counts[q.sectionTitle] || 0) + 1;
      }
    }
    return counts;
  }, [questions]);

  // Metrics for Question Palette memoized
  const answeredCount = useMemo(() => {
    return Object.values(responses).filter(
      (r) =>
        r.status === "answered" &&
        ((r.selectedAnswers && r.selectedAnswers.length > 0) || r.selectedAnswer >= 0
          || (compactLockdown ? r.code !== undefined : Boolean(r.code?.trim())))
    ).length;
  }, [compactLockdown, responses]);

  const reviewCount = useMemo(() => {
    return Object.values(responses).filter(
      (r) => r.status === "marked_for_review"
    ).length;
  }, [responses]);

  const attemptedQuestionCount = useMemo(
    () => Object.values(responses).filter((response) =>
      (Array.isArray(response.selectedAnswers) && response.selectedAnswers.length > 0)
      || response.selectedAnswer >= 0
      || Boolean(response.code?.trim()),
    ).length,
    [responses],
  );
  const unattemptedCount = Math.max(
    0,
    totalQuestionCount - (isSequentialActive ? attemptedQuestionCount : answeredCount + reviewCount),
  );

  // Format Clock Time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const renderCloseAppsGateModal = () => (
    <AnimatePresence>
      {isCloseAppsGateOpen && runningAppsList.length > 0 && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-card border border-border rounded-2xl p-6 shadow-2xl w-full max-w-lg space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground">Close Non-Essential Applications</h3>
                <p className="text-xs text-muted-foreground">
                  CodeSkill LockDown detected running applications. Please close them before proceeding with the examination.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-3 max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin">
              {runningAppsList.map((app) => (
                <div key={app.pid} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-background border border-border/50">
                  <span className="font-semibold text-foreground truncate max-w-[260px]">{app.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">PID: {app.pid}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                disabled={isClosingApps}
                onClick={async () => {
                  setIsClosingApps(true);
                  const remaining = await listNonEssentialApps();
                  setRunningAppsList(remaining);
                  if (remaining.length === 0) {
                    setIsCloseAppsGateOpen(false);
                    toast.success("All applications closed. You may proceed.");
                  } else {
                    toast.error(`${remaining.length} application(s) still open.`);
                  }
                  setIsClosingApps(false);
                }}
                className="px-3.5 py-2 rounded-xl border border-border hover:bg-muted text-foreground text-xs font-medium cursor-pointer"
              >
                Re-check
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isClosingApps}
                  onClick={async () => {
                    setIsClosingApps(true);
                    const remaining = await closeNonEssentialApps(false);
                    setRunningAppsList(remaining);
                    if (remaining.length === 0) {
                      setIsCloseAppsGateOpen(false);
                      toast.success("Applications closed successfully.");
                    }
                    setIsClosingApps(false);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {isClosingApps ? <Spinner className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                  Close All & Continue
                </button>
                <button
                  type="button"
                  disabled={isClosingApps}
                  onClick={async () => {
                    setIsClosingApps(true);
                    const remaining = await closeNonEssentialApps(true);
                    setRunningAppsList(remaining);
                    if (remaining.length === 0) {
                      setIsCloseAppsGateOpen(false);
                      toast.success("Applications forcefully terminated.");
                    }
                    setIsClosingApps(false);
                  }}
                  className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Force Close
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (isLockdownClient() && isExamSubmitted) {
    return (
      <LockdownSubmissionFeedback
        assessmentId={id}
        submissionReceiptId={submissionReceiptId || `REC-${id.slice(0, 8)}`}
        submittedAt={submittedAtMs || Date.now()}
        kioskMode={isLockdownActive ? "kiosk_active" : "standard"}
      />
    );
  }

  const requiresLockdown = Boolean(
    requireLockdown ||
    securityPolicy?.requireSEB ||
    securityPolicy?.requireLockdown ||
    securityPolicy?.secureExamMode === "STRICT" ||
    securityPolicy?.secureExamMode === "STANDARD"
  );

  if (!isLoadingSettings && !settingsError && requiresLockdown && !isLockdownClient()) {
    return <LockdownLaunchGate examId={id} examTitle={assessmentTitle} />;
  }

  // Pre-Exam Media & Hardware Permission Gate (only rendered if media is required by this assessment)
  if (!isLoadingSettings && !settingsError && isLockdownClient() && mediaRequirements.needsMediaGate && !isMediaGatePassed) {
    return (
      <LockdownMediaPermissionGate
        assessmentId={id}
        requireCamera={mediaRequirements.requireCamera}
        requireMic={mediaRequirements.requireMicrophone}
        cameraSelectionPolicy={proctoring?.cameraSelectionPolicy}
        onReady={() => {
          setIsMediaGatePassed(true);
          void LockdownSessionStore.saveState(id, { mediaPermissionsVerified: true });
        }}
      />
    );
  }

  // Pre-Exam Interactive Background Apps Blocker Gate (must pass before attempt starts)
  if (!isLoadingSettings && !settingsError && isLockdownClient() && isMediaGatePassed && !isAppsGatePassed) {
    return (
      <LockdownAppBlockerGate
        assessmentId={id}
        requireCloseOtherApps={requireCloseOtherApps}
        onReady={() => setIsAppsGatePassed(true)}
      />
    );
  }

  const preparationError = settingsError || startError;
  if (preparationError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
        <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-amber-500" />
          <h1 className="text-xl font-bold text-foreground">Assessment could not be started</h1>
          <p role="alert" className="mt-3 text-sm text-muted-foreground">{preparationError}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (settingsError) {
                  setIsLoadingSettings(true);
                  setSettingsError(null);
                  setSettingsRetry((retry) => retry + 1);
                  return;
                }
                setStartError(null);
                setIsLoading(true);
                if (!isLockdownClient() && proctoring?.enforceFullscreen === false) {
                  void beginAssessmentAfterFullscreen();
                }
              }}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 cursor-pointer"
            >
              Try again
            </button>
            <Link
              href={`/assessments/${id}`}
              className="rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition-colors cursor-pointer"
            >
              Back to Assessment Details
            </Link>
            {(!compactLockdown || hasPreviousResult) && <button
              type="button"
              onClick={async () => {
                await releaseLockdownKiosk();
                router.push(`/assessments/${id}/result`);
              }}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted cursor-pointer"
            >
              View previous result
            </button>}
          </div>
        </section>
      </main>
    );
  }

  if (isSubmitting) {
    return (
      <main role="status" aria-live="polite" className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
        <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
          <Spinner className="mx-auto h-10 w-10 animate-spin text-primary" />
          <h1 className="mt-5 text-xl font-bold text-foreground">{isAutoSubmitting ? "Submitting your assessment" : "Finalizing your assessment"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isAutoSubmitting ? "Your saved answers are being submitted after the proctoring warning limit." : "Your answers are being saved and your result is loading."}
          </p>
        </section>
      </main>
    );
  }

  if (isLoading || loadedAssessmentId !== id || !currentQ) {
    return (
      <LockdownRouteGuard assessmentId={id} allowedUrlPatterns={allowedUrlPatterns} allowFindOnPage={allowFindOnPage} accommodations={accommodations}>
        <SafeExamBrowser
          isEnabled={!isLoadingSettings && !isSubmitting}
          requireFullscreen={proctoring?.enforceFullscreen !== false && !isLockdownClient()}
          monitorViolations={false}
          detectTabSwitch={false}
          blockCopyPaste={false}
          onFullscreenEntered={isLockdownClient() ? undefined : beginAssessmentAfterFullscreen}
        >
          <div className="flex-1 min-h-screen bg-background flex items-center justify-center font-sans">
            <div className="text-center space-y-3">
              <Spinner className="w-9 h-9 animate-spin text-primary mx-auto" />
              <h2 className="text-sm font-semibold text-foreground">Preparing Secure Assessment Environment</h2>
              <p className="text-xs text-muted-foreground">{isLoadingSettings
                ? "Loading assessment settings…"
                : isLockdownClient() || proctoring?.enforceFullscreen === false
                  ? "Verifying your session and opening the assessment…"
                  : "The test will start after you enter fullscreen."}</p>
            </div>
            {isLockdownClient() && (
              <LockdownUtilityDock
                assessmentId={id}
                sessionId={attestedSessionId}
                allowCalculators={allowCalculators}
                allowScratchpad={allowScratchpad}
                allowReferenceDoc={allowReferenceDoc}
                referencePdfUrl={referencePdfUrl}
                bottomInset={compactLockdown ? 16 : undefined}
                showSyncStatus={!compactLockdown}
                isSubmitted={false}
                onSafeReload={async () => {
                  await offlineAutosaveQueue.forceSyncNow(api);
                }}
                onTimerSync={(newEpoch, newServerNow) => {
                  setServerEndsAtEpochMs(newEpoch);
                  setAttemptDeadlineAt(newEpoch);
                  if (typeof newServerNow === "number") {
                    serverClockOffsetMsRef.current = newServerNow - Date.now();
                  }
                }}
              />
            )}
            {renderCloseAppsGateModal()}
          </div>
        </SafeExamBrowser>
      </LockdownRouteGuard>
    );
  }

  const isLastQuestion = isSectionLockActive && activeSection
    ? isLastQuestionOfCurrentSection
    : currentIndex >= totalQuestionCount - 1;
  const isTimeCritical = timeLeftSeconds < 300; // < 5 mins

  return (
    <LockdownRouteGuard
      assessmentId={id}
      allowedUrlPatterns={allowedUrlPatterns}
      allowFindOnPage={allowFindOnPage}
      accommodations={accommodations}
    >
    <SafeExamBrowser
      isEnabled={!isSubmitting}
      requireFullscreen={proctoring?.enforceFullscreen !== false && !isLockdownClient()}
      detectTabSwitch={proctoring?.detectTabSwitch !== false}
      blockCopyPaste={proctoring?.blockCopyPaste !== false}
      monitorViolations={loadedAssessmentId === id}
      autoSubmitOnViolation={proctoring?.mode !== 'partial_proctored' && proctoring?.autoSubmitOnViolation !== false}
      onFullscreenEntered={beginAssessmentAfterFullscreen}
      maxWarnings={proctoring?.maxTabSwitches ?? maxTabSwitches}
      onTerminate={() => submitExam(true)}
      onViolation={recordViolation}
      activeMediaStream={mediaStream}
      requireCamera={mediaRequirements.requireCamera}
      requireMicrophone={mediaRequirements.requireMicrophone}
      isExamSubmitted={isExamSubmitted}
      assessmentId={id}
      candidateId={resolvedCandidateId}
      candidateIdentifier={resolvedCandidateIdentifier}
      attestationSessionId={attestedSessionId}
      enableForensicWatermark={enableForensicWatermark}
      reconnectMedia={reconnectMedia}
    >
      <div ref={examPageRef} data-assessment-page-capture className={`h-dvh overflow-hidden bg-background text-foreground font-sans flex flex-col relative [touch-action:pan-x_pan-y_pinch-zoom] ${proctoring?.blockCopyPaste !== false ? "select-none" : ""}`}>
      <AssessmentTakeHeader
        questionNumber={currentIndex + 1}
        totalQuestionCount={totalQuestionCount}
        assessmentCode={assessmentCode}
        topic={currentQ.topic}
        subtopic={currentQ.subtopic}
        isLockdownActive={isLockdownActive}
        showPenalty={proctoring?.mode === "partial_proctored" || (proctoring?.violationPenaltyMarks ?? 0) > 0 || totalPenaltyMarks > 0}
        totalPenaltyMarks={totalPenaltyMarks}
        violationCount={violations.length}
        timeRemaining={formatTime(timeLeftSeconds)}
        isTimeCritical={isTimeCritical}
        questionTimeRemaining={isSequentialActive && questionTimeLimitSeconds > 0 ? formatTime(questionTimeLeftSeconds) : undefined}
        isQuestionTimeCritical={questionTimeLeftSeconds <= 10}
        syncStatus={syncStatus}
        pendingSyncCount={syncStatus === "offline-buffered" || syncStatus === "error" ? pendingSyncCount : 0}
        compactLockdown={compactLockdown}
        isFullscreen={isFullscreen}
        enforceFullscreen={enforceFullscreen}
        tabSwitches={proctoring?.detectTabSwitch !== false ? tabSwitches : 0}
        maxTabSwitches={maxTabSwitches}
        submitDisabled={(isSequentialActive && !isLastQuestion) || (isSectionLockActive && Boolean(activeSection))}
        onToggleSidebar={toggleQuestionSidebar}
        onPreviousQuestion={compactLockdown ? handlePreviousQuestion : undefined}
        onNextQuestion={compactLockdown ? handleSaveAndNext : undefined}
        previousQuestionDisabled={isNavigating || isSequentialActive || (isSectionLockActive ? isFirstQuestionOfCurrentSection : currentIndex === 0)}
        nextQuestionDisabled={isNavigating || isLastQuestion}
        onToggleFullscreen={toggleFullscreen}
        onSubmit={openSubmitModal}
      />

      {/* Warning Toast Floating Notification */}
      {submitError && (
        <div
          role="alert"
          className="fixed bottom-8 left-1/2 z-[60] w-[min(92vw,38rem)] -translate-x-1/2 rounded-2xl border border-rose-300/80 bg-card/95 backdrop-blur-md p-4 text-sm text-foreground shadow-2xl animate-in slide-in-from-bottom-3 fade-in duration-200"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
              <p className="min-w-0 flex-1 text-xs sm:text-sm font-medium">{submitError}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  submissionRequestedRef.current = false;
                  submitStartedRef.current = false;
                  void submitExam(isAutoSubmitting);
                }}
                className="rounded-lg bg-primary hover:bg-primary/90 px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors shadow-xs"
              >
                Retry submission
              </button>
              <button
                type="button"
                aria-label="Dismiss alert"
                onClick={() => setSubmitError(null)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
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
        {!isSequentialActive && (
        <aside id="assessment-question-sidebar" aria-label="Assessment question sidebar" className={`shrink-0 w-72 min-h-0 flex-col border-r border-border bg-card ${sidebarCollapsed ? "lg:hidden" : "lg:flex"} ${mobileSidebarOpen ? "absolute inset-y-0 left-0 z-40 flex shadow-2xl" : "hidden"}`}>
          <div className="shrink-0 border-b border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground break-words">{assessmentTitle}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {answeredCount} of {totalQuestionCount} answered
                  {!isSequentialActive && ` · ${reviewCount} for review`}
                </p>
              </div>
              <button aria-label="Close question sidebar" onClick={() => { setSidebarCollapsed(true); setMobileSidebarOpen(false); }} className="p-1 rounded hover:bg-muted"><X className="size-4" /></button>
            </div>
            <div role="progressbar" aria-label="Assessment progress" aria-valuenow={answeredCount} aria-valuemin={0} aria-valuemax={totalQuestionCount} className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{width: `${totalQuestionCount ? answeredCount / totalQuestionCount * 100 : 0}%`}} /></div>
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span>● Answered</span>
              {!isSequentialActive && <span className="text-amber-500">● Review</span>}
              <span>○ Not answered</span>
            </div>
          </div>
          {isSequentialActive && (
            <div className="mx-3 my-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5 shrink-0">
              <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 font-semibold text-[11px]">
                <span className="flex items-center gap-1.5">
                  <Lock className="size-3.5" /> Sequential Navigation
                </span>
                <span>Question {currentIndex + 1}/{totalQuestionCount}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Advance to unlock the next question. Previous questions cannot be revisited.
              </p>
            </div>
          )}
          <nav aria-label="Assessment questions" className="assessment-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-1">
            {questions.map((q, index) => {
              const prevQ = questions[index - 1];
              const showSectionHeader = Boolean(
                q.sectionTitle && (!prevQ || prevQ.sectionTitle !== q.sectionTitle)
              );
              const qSectionInfo = questionSectionMap.get(index);
              const sectionStatus = qSectionInfo?.status || "unlocked";
              const sectionGroup = qSectionInfo?.section;
              const sectionHeaderStatus = isSequentialActive && sectionGroup
                ? sectionGroup.questionIndices[sectionGroup.questionIndices.length - 1] < permittedQuestionIndex
                  ? "completed"
                  : sectionGroup.questionIndices[0] > permittedQuestionIndex
                    ? "locked"
                    : "active"
                : sectionStatus;
              const isQuestionLocked = isSequentialActive
                ? index !== permittedQuestionIndex
                : isSectionLockActive && sectionStatus !== "active";
              const response = responses[q._id];
              const review = !isSequentialActive && response?.status === "marked_for_review";
              const current = index === currentIndex;
              const coding = ["coding", "algorithmic", "dsa"].includes(q.questionType?.toLowerCase()) || (!q.options?.length && Boolean(q.starterCode || q.codeSnippet));
              const answered = response?.status === "answered" && (
                (compactLockdown && coding) || Boolean(response.selectedAnswers?.length)
                || response.selectedAnswer >= 0 || Boolean(response.code?.trim())
              );
              const sectionQuestionsCount = q.sectionTitle
                ? sectionCounts[q.sectionTitle] || 0
                : 0;

              return (
                <Fragment key={q._id}>
                  {showSectionHeader && (
                    <div className="pt-3 pb-1 px-2.5 first:pt-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className="truncate flex items-center gap-1.5">
                          {sectionHeaderStatus === "locked" && <Lock className="size-3 text-muted-foreground shrink-0" />}
                          {sectionHeaderStatus === "completed" && <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />}
                          <span className="truncate">{q.sectionTitle}</span>
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {isSequentialActive && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                              sectionHeaderStatus === "completed"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : sectionHeaderStatus === "active"
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "bg-muted text-muted-foreground border border-border"
                            }`}>
                              {sectionHeaderStatus === "completed" ? "Completed" : sectionHeaderStatus === "active" ? "In Progress" : "Locked"}
                            </span>
                          )}
                          {sectionQuestionsCount > 0 && (
                            <span className="text-[10px] font-normal text-muted-foreground/70">
                              {sectionQuestionsCount} Qs
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-px bg-border/60 mt-1 mb-1.5" />
                    </div>
                  )}
                  <button type="button" aria-current={current ? "step" : undefined}
                    disabled={isQuestionLocked}
                    aria-label={`Question ${index + 1}${current ? ", current" : ""}${answered ? ", answered" : ""}${review ? ", marked for review" : ""}${isQuestionLocked ? `, ${sectionStatus}` : ""}`}
                    onClick={() => {
                      if (isQuestionLocked) return;
                      flushDraftToState();
                      if (isSectionLockActive) {
                        void navigateWithinActiveSection(index);
                      } else {
                        setCurrentIndex(index);
                      }
                      setMobileSidebarOpen(false);
                    }}
                    className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${
                      isQuestionLocked
                        ? "opacity-50 cursor-not-allowed border-transparent bg-muted/20"
                        : current
                        ? "border-primary bg-primary/10 ring-1 ring-inset ring-primary/30"
                        : "border-transparent hover:bg-muted/60"
                    }`}>
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${
                      isQuestionLocked && sectionStatus === "locked"
                        ? "border-border bg-muted/60 text-muted-foreground"
                        : answered
                        ? "border-emerald-500 bg-emerald-500 text-slate-950"
                        : review
                        ? "border-amber-500/50 bg-amber-500/15 text-amber-500"
                        : "border-border bg-muted text-muted-foreground"
                    }`}>
                      {isQuestionLocked && sectionStatus === "locked" ? (
                        <Lock className="size-3" />
                      ) : answered ? (
                        <Check className="size-4" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground" title={q.question}>
                        {index + 1}. {q.question}
                      </span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">
                        {coding ? "Coding" : "MCQ"} · {
                          isQuestionLocked
                            ? sectionStatus === "completed" ? "Submitted" : "Locked"
                            : review ? "Review" : answered ? "Answered" : response?.code?.trim() && !compactLockdown ? "Draft" : "Not answered"
                        }
                      </span>
                    </span>
                    {review && !isQuestionLocked && <Bookmark className="size-3 shrink-0 text-amber-500" />}
                  </button>
                </Fragment>
              );
            })}
          </nav>
        </aside>
        )}
        {(() => {
          const isCodingQuestion = ["coding", "algorithmic", "dsa"].includes(currentQ.questionType?.toLowerCase()) || (!currentQ.options?.length && Boolean(currentQ.starterCode || currentQ.codeSnippet));
          return <AssessmentReadingZoom>{readingScale => <main className={`relative flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden p-3 ${compactLockdown ? "pb-2" : "pb-24"}`}>
            {(isSequentialActive || isSectionLockActive) && (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
                aria-label="Sequential assessment progress"
              >
                <span className="text-sm font-semibold text-foreground">
                  {isSectionLockActive && activeSection
                    ? `${activeSection.title} · Question ${activeSection.questionIndices.indexOf(currentIndex) + 1} of ${activeSection.questionIndices.length}`
                    : `Question ${currentIndex + 1} of ${totalQuestionCount}`}
                </span>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Attempted: <strong className="text-foreground">{attemptedQuestionCount}</strong></span>
                  <span>Not attempted: <strong className="text-foreground">{unattemptedCount}</strong></span>
                  <span className={isCurrentQuestionAttempted ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                    Current question: {isCurrentQuestionAttempted ? "Attempted" : "Not attempted"}
                  </span>
                </div>
              </div>
            )}
            {isCodingQuestion ? (
              <CodingEditor assessmentId={id} macLockdown={compactLockdown} readingScale={readingScale} key={currentQ._id} question={currentQ} savedResponse={responses[currentQ._id]} onDraftChange={handleCodingDraft} onSave={handleSaveCodingQuestion} onControlsChange={compactLockdown ? undefined : setCodingControls} blockCopyPaste={proctoring?.blockCopyPaste !== false} />
            ) : (
              <ResizableAssessmentPanels key={currentQ._id} className="rounded-2xl border border-border bg-card">
                <section aria-label="Question statement" tabIndex={0} className="assessment-scroll flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain p-5 space-y-6">
                  <div style={{ zoom: readingScale }} className="space-y-6">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statement</div>
                  {/* Question Metadata Ribbon */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
                    <div className="flex items-center gap-2">
                      {!isSequentialActive && currentQ.sectionTitle && (
                        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-secondary text-secondary-foreground border border-border">
                          {currentQ.sectionTitle}
                        </span>
                      )}
                      <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase bg-primary/10 text-primary border border-primary/20">
                        {currentQ.questionType === "multiple_choice" ? "Multiple Choice" : "Single Choice"}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground border border-border capitalize">
                        {currentQ.difficulty}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                        <span>+{currentQ.marks || 1} mark</span>
                      </div>
                      {currentQ.negativeMarks > 0 && (
                        <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-mono font-bold">
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
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">
                      {isMultiChoice ? "Choose all that apply" : "Choose your answer"}
                    </h2>
                    {isMultiChoice && (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                        Multiple Choice
                      </span>
                    )}
                  </div>
                  {/* Options Selection (4 Cards) */}
                  <div className="space-y-3 pt-2">
                    {(currentQ.options ?? []).map((optionText, optIndex) => {
                      const isSelected = isMultiChoice
                        ? selectedAnswers.includes(optIndex)
                        : selectedAnswer === optIndex;
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
                          {/* Option Indicator: square checkbox style for multi-choice, rounded pill for single-choice */}
                          <div
                            className={`w-7 h-7 flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                              isMultiChoice ? "rounded-lg" : "rounded-xl"
                            } ${
                              isSelected
                                ? "bg-emerald-500 text-slate-950 shadow-sm ring-2 ring-emerald-300/50"
                                : "bg-muted text-muted-foreground border border-border group-hover:border-primary/50 group-hover:text-foreground"
                            }`}
                          >
                            {isSelected && isMultiChoice ? (
                              <Check className="w-4 h-4 stroke-[3]" />
                            ) : (
                              letter
                            )}
                          </div>

                          <div className="flex-1 text-[15px] sm:text-base font-medium text-foreground pt-0.5 leading-7">
                            {optionText}
                          </div>

                          {/* Checkmark when chosen */}
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 self-center" />
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
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* Assessment actions */}
            {/* ───────────────────────────────────────────────────────────── */}
            <div className={compactLockdown
              ? "z-20 shrink-0 rounded-lg border border-border bg-card"
              : "fixed bottom-4 left-1/2 z-40 max-w-[calc(100vw-32px)] -translate-x-1/2"}
            >
              <nav
                aria-label="Assessment navigation and actions"
                className={compactLockdown
                  ? "flex min-h-10 flex-wrap items-center gap-1.5 px-2 py-1"
                  : "flex items-center gap-2 rounded-2xl border border-border bg-card/95 px-3 py-2 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-2.5 dark:bg-card/90 dark:ring-white/10"}
              >
                {/* Coding execution actions (Run Code, Submit Solution, Saved indicator) */}
                {!compactLockdown && isCodingQuestion && codingControls && (
                  <>
                    <div className="hidden md:flex items-center gap-1.5 px-2 text-[11px] font-semibold">
                      {codingControls.isSaved ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Solution Saved
                        </span>
                      ) : (
                        <span className="text-muted-foreground flex items-center gap-1">
                          Draft
                        </span>
                      )}
                    </div>

                    {/* Run Code */}
                    <button
                      type="button"
                      aria-label="Run Code"
                      onClick={codingControls.runTest}
                      disabled={codingControls.isRunning || codingControls.isSubmitting || codingControls.runCooldown > 0}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-bold text-foreground shadow-xs transition-all hover:bg-muted disabled:opacity-50 cursor-pointer sm:px-4"
                    >
                      {codingControls.isRunning ? (
                        <Spinner className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 fill-amber-600 dark:fill-amber-400" />
                      )}
                      <span>{codingControls.runCooldown > 0 ? `Run Code (${codingControls.runCooldown}s)` : "Run Code"}</span>
                    </button>

                    {/* Submit Solution */}
                    <button
                      type="button"
                      aria-label="Submit Solution"
                      onClick={codingControls.submitSolution}
                      disabled={codingControls.isSubmitting || codingControls.submitCooldown > 0}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50 cursor-pointer sm:px-5"
                    >
                      {codingControls.isSubmitting ? (
                        <Spinner className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>{codingControls.submitCooldown > 0 ? `Submit Solution (${codingControls.submitCooldown}s)` : "Submit Solution"}</span>
                    </button>

                    <div className="h-5 w-px bg-border my-auto" />
                  </>
                )}

                {/* MCQ Clear option */}
                {!isCodingQuestion && (
                  <>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      disabled={isMultiChoice ? selectedAnswers.length === 0 : selectedAnswer < 0}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title="Clear current answer choice"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Clear
                    </button>
                    <div className="h-5 w-px bg-border my-auto" />
                  </>
                )}

                {compactLockdown && <LockdownSaveStatus syncStatus={syncStatus} />}

                {!isSequentialActive && (
                  <button
                    type="button"
                    onClick={handleMarkForReview}
                    aria-label={compactLockdown ? (currentResponse?.status === "marked_for_review" ? "Remove review flag" : "Mark for later review") : undefined}
                    className={compactLockdown
                      ? `grid size-8 place-items-center rounded-md hover:bg-muted ${currentResponse?.status === "marked_for_review" ? "text-amber-500" : "text-muted-foreground"}`
                      : "inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-500/10 cursor-pointer dark:text-amber-400"}
                    title={currentResponse?.status === "marked_for_review" ? "Remove review flag" : "Mark for later review"}
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    {!compactLockdown && <span>{currentResponse?.status === "marked_for_review" ? "Unreview" : isCodingQuestion ? "Review later" : "Review"}</span>}
                  </button>
                )}

                {/* Previous question */}
                {!compactLockdown && (
                  <button type="button" onClick={handlePreviousQuestion}
                    disabled={isSequentialActive || (isSectionLockActive ? isFirstQuestionOfCurrentSection : currentIndex === 0)}
                    className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer sm:px-4"
                  >
                    <ChevronLeft className="size-4" /> <span>Previous</span>
                  </button>
                )}

                {/* Advance one question or submit the final assessment. */}
                {isLastQuestion ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (isSectionLockActive) setShowSectionSubmitModal(true);
                      else setShowSubmitModal(true);
                    }}
                    className={compactLockdown
                      ? "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted"
                      : "inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 cursor-pointer sm:px-5"}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {isSectionLockActive && activeSection
                        ? "Submit Section"
                        : isSequentialActive || isSectionLockActive
                          ? "Submit Assessment"
                          : "Review answers"}
                    </span>
                  </button>
                ) : !compactLockdown && (
                  <button
                    type="button"
                    onClick={handleSaveAndNext}
                    disabled={isNavigating}
                    className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-60 disabled:cursor-wait cursor-pointer sm:px-5"
                  >
                    <span>{isNavigating ? "Loading…" : "Next question"}</span>
                    <ChevronRight className="size-4" />
                  </button>
                )}
              </nav>
            </div>
          </main>}</AssessmentReadingZoom>;
        })()}
      </div>

      {mediaRequirements.requireCamera && <FloatingAssessmentMonitor minimized={isPipMinimized}>
          {/* Live Proctoring Camera & Mic PIP Card */}
          <div className="bg-card border border-border rounded-xl p-3 shadow-sm space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full bg-emerald-500 ${compactLockdown ? "" : "animate-pulse"}`} />
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
            <div className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-[10px] ${faceWarningCount ? "border-amber-500/30 bg-amber-500/5 text-amber-700" : "border-emerald-500/20 bg-emerald-500/5 text-emerald-700"}`}>
              <span className="min-w-0 truncate">Face check: {faceMonitorStatus}</span>
              <span className="shrink-0 font-semibold">{faceWarningCount}/5 warnings</span>
            </div>

            <div role="status" className={`rounded-lg border px-2 py-1.5 text-xs ${faceWarningCount > 0 ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300" : "border-border bg-muted/30 text-muted-foreground"}`}>
              <div className="flex items-center justify-between gap-2 font-semibold">
                <span>Face verification warnings</span>
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
                  <MicrophoneLevelIndicator
                    subscribeAudioLevel={subscribeAudioLevel}
                    fallbackLevel={audioLevel}
                  />
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
                            ? (compactLockdown ? "bg-rose-400" : "bg-rose-400 animate-pulse")
                            : "bg-emerald-400"
                          : faceDetectionStatus === "initializing"
                            ? (compactLockdown ? "bg-amber-400" : "bg-amber-400 animate-pulse")
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
      </FloatingAssessmentMonitor>}

      {/* Section Submit Confirmation Modal */}
      {showSectionSubmitModal && activeSection && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Submit & Lock Section ${activeSection.title}`}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full space-y-5 animate-in fade-in zoom-in-95 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Submit & Lock Section?</h3>
                <p className="text-xs text-muted-foreground">{activeSection.title}</p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-700 dark:text-amber-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="size-4 shrink-0" /> Important: Section lock notice
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Once you submit this section, it will be <strong>permanently locked</strong>. You will advance to the next section and <strong>cannot return</strong> to change your answers in &ldquo;{activeSection.title}&rdquo;.
              </p>
            </div>

            <div className={`p-4 bg-muted/40 border border-border rounded-2xl grid gap-2 text-center text-xs font-mono ${isSequentialActive ? "grid-cols-2" : "grid-cols-3"}`}>
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Answered</span>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{activeSectionStats.answered}</div>
              </div>
              {!isSequentialActive && <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Review</span>
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{activeSectionStats.review}</div>
              </div>}
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Unattempted</span>
                <div className="text-xl font-bold text-muted-foreground">{activeSectionStats.unattempted}</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSectionSubmitModal(false)}
                className="px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-foreground transition-colors"
              >
                Return to Section
              </button>

              <button
                type="button"
                onClick={handleCompleteCurrentSection}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-amber-600/20"
              >
                <Lock className="w-4 h-4" />
                Yes, Submit Section & Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showSubmitModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Submit Assessment"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
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

            <div className={`p-4 bg-muted/40 border border-border rounded-2xl grid gap-2 text-center text-xs font-mono ${isSequentialActive ? "grid-cols-2" : "grid-cols-3"}`}>
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Answered</span>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{answeredCount}</div>
              </div>
              {!isSequentialActive && <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Review</span>
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{reviewCount}</div>
              </div>}
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Unattempted</span>
                <div className="text-xl font-bold text-muted-foreground">{unattemptedCount}</div>
              </div>
            </div>

            {violations.length > 0 && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Notice: {violations.length} proctoring event(s) logged and submitted with attempt.</span>
              </div>
            )}

            {!isSequentialActive && activeSectionIndex < sectionGroups.length - 1 && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Warning: You have uncompleted sections remaining ({sectionGroups.length - 1 - activeSectionIndex} remaining). Submitting now will finalize your entire assessment.</span>
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

      {/* Proctoring Violation Warning Modal is integrated in security overlay */}

      {/* Bottom Utility Dock for Native CodeSkill LockDown Client */}
      {isLockdownClient() && (
        <LockdownUtilityDock
          assessmentId={id}
          sessionId={attestedSessionId}
          allowCalculators={allowCalculators}
          allowScratchpad={allowScratchpad}
          allowReferenceDoc={allowReferenceDoc}
          referencePdfUrl={referencePdfUrl}
          bottomInset={compactLockdown ? 58 : undefined}
          showSyncStatus={!compactLockdown}
          isSubmitted={isSubmitting || submissionRequestedRef.current}
          onSafeReload={async () => {
            if (compactLockdown) flushDraftToState();
            await offlineAutosaveQueue.forceSyncNow(api);
          }}
          onTimerSync={(newEpoch, newServerNow) => {
            setServerEndsAtEpochMs(newEpoch);
            setAttemptDeadlineAt(newEpoch);
            if (typeof newServerNow === "number") {
              serverClockOffsetMsRef.current = newServerNow - Date.now();
            }
          }}
        />
      )}

      {/* Pre-Exam Close Non-Essential Apps Gate Modal */}
      {renderCloseAppsGateModal()}
    </div>
    </SafeExamBrowser>
    </LockdownRouteGuard>
  );
}
