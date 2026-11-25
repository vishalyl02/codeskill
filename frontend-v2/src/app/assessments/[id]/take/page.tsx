"use client";

import { useEffect, useState, useRef, use, useCallback, Fragment, useMemo, useContext } from "react";
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
  ShieldCheck,
  Lock,
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
  X,
  Loader2,
  WifiOff,
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
import {
  isLockdownClient,
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
import { AssessmentReadingZoom } from "@/components/assessment/AssessmentReadingZoom";
import { ResizableAssessmentPanels } from "@/components/assessment/ResizableAssessmentPanels";
import { FloatingAssessmentMonitor } from "@/components/assessment/FloatingAssessmentMonitor";
import { CodeSnippet } from "@/components/assessment/CodeSnippet";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import {
  checkAssessmentFace,
  getAssessmentFaceReference,
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

export default function TakeAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
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
  const [attemptDeadlineAt, setAttemptDeadlineAt] = useState<number | null>(null);
  const [serverEndsAtEpochMs, setServerEndsAtEpochMs] = useState<number | null>(null);
  const serverClockOffsetMsRef = useRef<number>(0);
  const candidateIdRef = useRef<string>("candidate");
  const attemptIdRef = useRef<string>("attempt");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
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
    const local = LockdownSessionStore.getLocalState(id);
    return Boolean(local?.isSubmitted);
  });
  const [submissionReceiptId, setSubmissionReceiptId] = useState<string | null>(() => {
    if (typeof window === "undefined" || !isLockdownClient()) return null;
    return LockdownSessionStore.getLocalState(id)?.submissionReceiptId || null;
  });
  const [submittedAtMs, setSubmittedAtMs] = useState<number | null>(() => {
    if (typeof window === "undefined" || !isLockdownClient()) return null;
    return LockdownSessionStore.getLocalState(id)?.submittedAtMs || null;
  });
  const [startError, setStartError] = useState<string | null>(null);
  const [accommodations, setAccommodations] = useState<any>(null);
  const [lockSectionsSequentially, setLockSectionsSequentially] = useState(false);
  const [completedSectionIds, setCompletedSectionIds] = useState<string[]>([]);
  const [showSectionSubmitModal, setShowSectionSubmitModal] = useState(false);
  const mediaCleanupRef = useRef<{ assessmentId: string; timer: number } | null>(null);
  const examPageRef = useRef<HTMLDivElement | null>(null);

  // Live offline autosave queue status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

  useEffect(() => {
    const unsubscribe = offlineAutosaveQueue.onStatusChange((status, count) => {
      setSyncStatus(status);
      setPendingSyncCount(count);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (id) {
      void offlineAutosaveQueue.hydrate(id);
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
          if (persisted?.isSubmitted) {
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
    if (!isLockdownClient()) return;

    let unlisten: (() => void) | undefined;
    void listenToLockdownViolation(async (violation) => {
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

  // Restore completed sections from storage for reload resilience
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`codeskill_sections_done_${id}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setCompletedSectionIds(parsed);
          }
        }
      } catch {
        // ignore
      }
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingSettings(true);

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
          }
        } catch (err: any) {
          console.warn("[Lockdown] Launch token ingestion warning:", err);
        }
      }

      if (cancelled) return;

      try {
        const res = await studentAssessmentsAPI.getOverview(id);
        if (!cancelled) {
          const asmt = res.data?.assessment;
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

          // Check authoritative server resume state
          if (typeof studentAssessmentsAPI.getResumeState === "function") {
            try {
              const resumeRes = await studentAssessmentsAPI.getResumeState(id);
              const resumeData = resumeRes.data?.data || resumeRes.data;
              if (resumeData?.alreadySubmitted) {
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
              if (resumeData?.hasAttempt && typeof resumeData.remainingSeconds === "number") {
                if (resumeData.serverEndsAtEpochMs) {
                  setServerEndsAtEpochMs(resumeData.serverEndsAtEpochMs);
                  setAttemptDeadlineAt(resumeData.serverEndsAtEpochMs);
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
        console.error("Failed to load assessment proctoring settings:", error);
        if (!cancelled) setProctoring({});
      } finally {
        if (!cancelled) setIsLoadingSettings(false);
      }
    };

    void loadAssessment();

    return () => {
      cancelled = true;
    };
  }, [id]);

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

  const responsesRef = useRef(responses);
  if (!draftDebounceRef.current) {
    responsesRef.current = responses;
  }

  const flushDraftToState = useCallback(() => {
    if (draftDebounceRef.current) {
      clearTimeout(draftDebounceRef.current);
      draftDebounceRef.current = null;
      setResponses(responsesRef.current);
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
      const formattedResponses = questions.map((q) => {
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
    [id, questions, startedAt, proctoring?.detectTabSwitch]
  );

  // Start the attempt only after the candidate enters fullscreen from the secure gate.
  const startAttemptRequestedRef = useRef(false);
  const beginAssessmentAfterFullscreen = useCallback(async () => {
    if (isLockdownClient() && ((mediaRequirements.needsMediaGate && !isMediaGatePassed) || !isAppsGatePassed)) {
      console.info("[LockDown Start] Waiting on pre-exam gates:", {
        needsMediaGate: mediaRequirements.needsMediaGate,
        isMediaGatePassed,
        isAppsGatePassed,
      });
      startAttemptRequestedRef.current = false;
      setIsLoading(false);
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
          res = await studentAssessmentsAPI.startAttempt(id);
        } catch (startErr: any) {
          const msg = startErr?.response?.data?.message || "";
          if (
            msg.includes("not started yet") ||
            msg.includes("duplicate key") ||
            msg.includes("concurrent") ||
            startErr?.response?.status === 429
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
      setQuestions(questionsList);
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
      console.error("Failed to start assessment:", err);
      releaseAssessmentStream(id);
      const message = err?.response?.data?.message;
      setStartError(Array.isArray(message) ? message.join(" ") : message || "We could not start this assessment. Please check your attempt eligibility and try again.");
      startAttemptRequestedRef.current = false;
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    } finally {
      setIsLoading(false);
    }
  }, [id, router, mediaRequirements.requireCamera, mediaRequirements.needsMediaGate, isMediaGatePassed, isAppsGatePassed]);

  // Trigger attempt start once LockDown pre-exam gates pass
  useEffect(() => {
    if (
      isLockdownClient() &&
      isMediaGatePassed &&
      isAppsGatePassed &&
      !startAttemptRequestedRef.current &&
      !isExamSubmitted &&
      !isLoadingSettings
    ) {
      void beginAssessmentAfterFullscreen();
    }
  }, [isMediaGatePassed, isAppsGatePassed, isExamSubmitted, isLoadingSettings, beginAssessmentAfterFullscreen]);

  // Media starts only for a loaded, active session; stopping is permanent for this assessment.
  const {
    videoRef,
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

      const formattedResponses = questions.map((q) => {
        const r = responsesRef.current[q._id];
        return {
          questionId: q._id,
          selectedAnswer: r ? r.selectedAnswer : -1,
          selectedAnswers: r?.selectedAnswers ?? (r && r.selectedAnswer >= 0 ? [r.selectedAnswer] : []),
          code: r?.code || "",
          language: r?.language || q.language || q.supportedLanguages?.[0] || "python",
          testCasesPassed: r?.testCasesPassed || 0,
          totalTestCases: r?.totalTestCases || 0,
          status: r ? r.status : "skipped",
          timeSpentSeconds: 0,
        };
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
    [id, isSubmitting, questions, startedAt, stopCamera, router]
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

  useEffect(() => {
    if (!cameraActive || loadedAssessmentId !== id || isSubmitting || timeLeftSeconds <= 0) return;
    const reference = getAssessmentFaceReference(id);
    if (!reference) {
      setFaceMonitorStatus("Identity selfie missing");
      return;
    }

    let cancelled = false;
    const reportFaceIssue = (issue: string, details: string) => {
      if (activeFaceIssueRef.current === issue) return;
      activeFaceIssueRef.current = issue;
      faceWarningsRef.current += 1;
      setFaceWarningCount(faceWarningsRef.current);
      recordViolation(issue, details);
      const warningNumber = faceWarningsRef.current;
      const isAutoSubmitMode =
        proctoring?.autoSubmitOnViolation !== false &&
        proctoring?.mode !== "partial_proctored";

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
        setFaceMonitorStatus(details);
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
      } else {
        setFaceMonitorStatus(`${details} (Negative marks deducted)`);
      }
    };

    const inspectFrame = async () => {
      if (cancelled || faceMonitorBusyRef.current || isSubmitting) return;
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
      faceMonitorBusyRef.current = true;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = Math.max(180, Math.round((320 * video.videoHeight) / video.videoWidth));
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const check: AssessmentFaceCheck = await checkAssessmentFace(canvas, reference);
        if (cancelled) return;

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
          activeFaceIssueRef.current = null;
          setFaceMonitorStatus("Face matched · monitoring");
          return;
        }

        const previous = faceCandidateRef.current;
        const candidate = previous?.issue === issue.type
          ? { issue: issue.type, count: previous.count + 1 }
          : { issue: issue.type, count: 1 };
        faceCandidateRef.current = candidate;
        setFaceMonitorStatus(issue.details);
        // Require two consecutive detections to avoid transient camera/pose false positives.
        if (candidate.count >= 2) reportFaceIssue(issue.type, issue.details);
      } catch {
        if (!cancelled) setFaceMonitorStatus("Face check unavailable · retrying");
      } finally {
        faceMonitorBusyRef.current = false;
      }
    };

    setFaceMonitorStatus("Loading face verification models…");
    void inspectFrame();
    const interval = window.setInterval(() => void inspectFrame(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      faceMonitorBusyRef.current = false;
    };
  }, [cameraActive, id, isSubmitting, loadedAssessmentId, recordViolation, submitExam, timeLeftSeconds, videoRef, proctoring?.autoSubmitOnViolation]);

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
    if (isLoading) return;

    const autosaveInterval = setInterval(async () => {
      const currentFingerprint = JSON.stringify(responsesRef.current) + `:${violationsRef.current.length}`;
      if (currentFingerprint === lastSavedFingerprintRef.current) {
        // No modifications since last successful sync; avoid redundant network traffic
        return;
      }

      const formattedResponses = questions.map((q) => {
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
          questionId: currentQ?._id || 'all-progress',
          payload,
          endpoint: `/api/student/assessments/${id}/progress`,
          method: 'POST',
        });
        lastSavedFingerprintRef.current = currentFingerprint;
      } catch (e) {
        // Handled in offline queue
      }
    }, 15000);

    return () => clearInterval(autosaveInterval);
  }, [id, isLoading, questions, startedAt]);

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

  // Fullscreen trigger helper
  const toggleFullscreen = () => {
    if (isDocumentFullscreen()) {
      if (proctoring?.enforceFullscreen === false) void document.exitFullscreen().catch(() => {});
    } else {
      void enterDocumentFullscreen().catch(() => setWarningToast({ id: Date.now(), message: "Fullscreen could not be enabled. Please allow fullscreen and try again.", type: "warning" }));
    }
  };

  // Question Interaction Handlers
  const currentQ = questions[currentIndex];
  const isMultiChoice = Boolean(
    currentQ && (
      currentQ.questionType?.toLowerCase() === "multiple_choice" ||
      currentQ.questionType?.toLowerCase() === "multiple"
    )
  );
  const currentResponse = currentQ ? responses[currentQ._id] : null;
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
        endpoint: `/api/student/assessments/${id}/progress`,
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
        endpoint: `/api/student/assessments/${id}/progress`,
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
      endpoint: `/api/student/assessments/${id}/progress`,
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
    if (!removing && currentIndex < questions.length - 1) setCurrentIndex(index => index + 1);
  };

  // Keep editor drafts in the attempt state so sidebar navigation and timed
  // autosaves include the latest code, even before Submit Solution is clicked.
  const handleCodingDraft = useCallback(
    (code: string, language: string, codeByLanguage?: Record<string, string>) => {
      if (!currentQ) return;
      const previous = responsesRef.current[currentQ._id];
      const next = {
        ...responsesRef.current,
        [currentQ._id]: {
          ...previous,
          selectedAnswer: -1,
          code,
          language,
          codeByLanguage: { ...(previous?.codeByLanguage || {}), ...(codeByLanguage || {}), [language]: code },
          testCasesPassed: 0,
          totalTestCases: 0,
          status: previous?.status === "marked_for_review" ? "marked_for_review" : "draft",
        },
      };
      // 1. Synchronously update ref: timed autosaves, navigation, and submission always have up-to-date code
      responsesRef.current = next;

      // 2. Debounce parent state re-render by 400ms so fast typing doesn't choke React on low-spec CPUs
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
      draftDebounceRef.current = setTimeout(() => {
        setResponses(responsesRef.current);
        if (currentQ?._id) {
          void offlineAutosaveQueue.enqueue({
            attemptId: id,
            questionId: currentQ._id,
            payload: {
              responses: [{
                questionId: currentQ._id,
                selectedAnswer: -1,
                selectedAnswers: [],
                code,
                language,
                testCasesPassed: 0,
                totalTestCases: 0,
                status: previous?.status === "marked_for_review" ? "marked_for_review" : "draft",
              }],
              timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
              violations: violationsRef.current,
            },
            endpoint: `/api/student/assessments/${id}/progress`,
            method: 'POST',
          });
        }
      }, 400);
    },
    [currentQ, id, startedAt]
  );

  const handleSaveCodingQuestion = async (
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
    const formatted = questions.map((q) => {
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
        endpoint: `/api/student/assessments/${id}/progress`,
        method: 'POST',
      });
      throw err;
    }
  };

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

  const isSequentialActive = lockSectionsSequentially && sectionGroups.length > 1;

  const activeSectionIndex = useMemo(() => {
    if (!isSequentialActive) return -1;
    const firstIncompleteIdx = sectionGroups.findIndex((s) => !completedSectionIds.includes(s.id));
    return firstIncompleteIdx === -1 ? sectionGroups.length - 1 : firstIncompleteIdx;
  }, [isSequentialActive, sectionGroups, completedSectionIds]);

  const activeSection = useMemo(() => {
    if (activeSectionIndex === -1) return null;
    return sectionGroups[activeSectionIndex] || null;
  }, [activeSectionIndex, sectionGroups]);

  const questionSectionMap = useMemo(() => {
    const map = new Map<number, { section: { id: string; title: string; order: number; questionIndices: number[] }; status: "completed" | "active" | "locked" | "unlocked" }>();
    if (!isSequentialActive) {
      sectionGroups.forEach((s) => {
        s.questionIndices.forEach((qIdx) => map.set(qIdx, { section: s, status: "unlocked" }));
      });
      return map;
    }
    sectionGroups.forEach((s, sIdx) => {
      const isCompleted = completedSectionIds.includes(s.id);
      const isActive = sIdx === activeSectionIndex;
      const status = isCompleted ? "completed" : isActive ? "active" : "locked";
      s.questionIndices.forEach((qIdx) => map.set(qIdx, { section: s, status }));
    });
    return map;
  }, [isSequentialActive, sectionGroups, completedSectionIds, activeSectionIndex]);

  const isFirstQuestionOfCurrentSection = useMemo(() => {
    if (!activeSection) return currentIndex === 0;
    return activeSection.questionIndices[0] === currentIndex;
  }, [activeSection, currentIndex]);

  const isLastQuestionOfCurrentSection = useMemo(() => {
    if (!activeSection) return currentIndex === questions.length - 1;
    return activeSection.questionIndices[activeSection.questionIndices.length - 1] === currentIndex;
  }, [activeSection, currentIndex]);

  // Keep currentIndex aligned within the active section if sequential locking is enabled
  useEffect(() => {
    if (isSequentialActive && activeSection && !activeSection.questionIndices.includes(currentIndex)) {
      setCurrentIndex(activeSection.questionIndices[0]);
    }
  }, [isSequentialActive, activeSection, currentIndex]);

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
    if (!activeSection) return;
    flushDraftToState();
    const currentSectionId = activeSection.id;
    const nextCompleted = completedSectionIds.includes(currentSectionId)
      ? completedSectionIds
      : [...completedSectionIds, currentSectionId];
    setCompletedSectionIds(nextCompleted);
    try {
      localStorage.setItem(`codeskill_sections_done_${id}`, JSON.stringify(nextCompleted));
    } catch {}

    const formatted = questions.map((q) => {
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
        timeSpentSeconds: 0,
      };
    });

    studentAssessmentsAPI.saveProgress(id, {
      responses: formatted,
      timeSpentSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      violations: violationsRef.current,
    }).catch(() => {});

    setShowSectionSubmitModal(false);

    if (activeSectionIndex < sectionGroups.length - 1) {
      const nextSec = sectionGroups[activeSectionIndex + 1];
      setCurrentIndex(nextSec.questionIndices[0]);
      toast.success(`Section "${activeSection.title}" submitted. Now starting "${nextSec.title}".`);
    } else {
      toast.success("All sections completed! You may now submit your assessment.");
      setShowSubmitModal(true);
    }
  }, [activeSection, completedSectionIds, id, questions, startedAt, activeSectionIndex, sectionGroups, flushDraftToState]);

  const handleSaveAndNext = () => {
    flushDraftToState();
    if (isSequentialActive && isLastQuestionOfCurrentSection && activeSectionIndex < sectionGroups.length - 1) {
      setShowSectionSubmitModal(true);
      return;
    }
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
      if (showSubmitModal || showSectionSubmitModal || showViolationModal) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, button, [contenteditable='true'], .monaco-editor")) return;
      if (["coding", "algorithmic", "dsa"].includes(currentQ?.questionType?.toLowerCase())) return;

      const key = e.key.toUpperCase();
      if (key === "A" && currentQ?.options?.length > 0) handleSelectOption(0);
      else if (key === "B" && currentQ?.options?.length > 1) handleSelectOption(1);
      else if (key === "C" && currentQ?.options?.length > 2) handleSelectOption(2);
      else if (key === "D" && currentQ?.options?.length > 3) handleSelectOption(3);
      else if (e.key === "ArrowRight") {
        if (isSequentialActive && isLastQuestionOfCurrentSection && activeSectionIndex < sectionGroups.length - 1) {
          setShowSectionSubmitModal(true);
        } else if (currentIndex < questions.length - 1) {
          setCurrentIndex((i) => i + 1);
        }
      } else if (e.key === "ArrowLeft") {
        if (isSequentialActive && isFirstQuestionOfCurrentSection) {
          // Cannot navigate backward past start of active section
        } else if (currentIndex > 0) {
          setCurrentIndex((i) => i - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyNav);
    return () => window.removeEventListener("keydown", handleKeyNav);
  }, [
    currentQ,
    currentIndex,
    questions.length,
    showSubmitModal,
    showSectionSubmitModal,
    showViolationModal,
    isSequentialActive,
    isLastQuestionOfCurrentSection,
    isFirstQuestionOfCurrentSection,
    activeSectionIndex,
    sectionGroups.length,
  ]);

  // Pre-calculate section counts once to avoid O(N^2) questions.filter inside render
  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const q of questions) {
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
        ((r.selectedAnswers && r.selectedAnswers.length > 0) || r.selectedAnswer >= 0 || (r.code && r.code.trim().length > 0))
    ).length;
  }, [responses]);

  const reviewCount = useMemo(() => {
    return Object.values(responses).filter(
      (r) => r.status === "marked_for_review"
    ).length;
  }, [responses]);

  const unattemptedCount = Math.max(0, questions.length - answeredCount);

  // Format Clock Time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const renderCloseAppsGateModal = () => (
    <AnimatePresence>
      {isCloseAppsGateOpen && runningAppsList.length > 0 && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
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

  if (!isLoadingSettings && requiresLockdown && !isLockdownClient()) {
    return <LockdownLaunchGate examId={id} examTitle={assessmentTitle} />;
  }

  // Pre-Exam Media & Hardware Permission Gate (only rendered if media is required by this assessment)
  if (!isLoadingSettings && isLockdownClient() && mediaRequirements.needsMediaGate && !isMediaGatePassed) {
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
  if (isLockdownClient() && isMediaGatePassed && !isAppsGatePassed) {
    return (
      <LockdownAppBlockerGate
        requireCloseOtherApps={requireCloseOtherApps}
        onReady={() => setIsAppsGatePassed(true)}
      />
    );
  }

  if (startError) {
    const isSelfieRequired = startError.toLowerCase().includes("selfie") || startError.toLowerCase().includes("identity");
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
        <section className="w-full max-w-xl rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-amber-500" />
          <h1 className="text-xl font-bold text-foreground">Assessment could not be started</h1>
          <p role="alert" className="mt-3 text-sm text-muted-foreground">{startError}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={async () => {
                setStartError(null);
                startAttemptRequestedRef.current = false;
                await beginAssessmentAfterFullscreen();
              }}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 cursor-pointer"
            >
              Try again
            </button>
            <Link
              href={`/assessments/${id}`}
              className="rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition-colors cursor-pointer"
            >
              {isSelfieRequired ? "Take Selfie on Briefing Page" : "Back to Assessment Details"}
            </Link>
            <button
              type="button"
              onClick={async () => {
                await releaseLockdownKiosk();
                router.push(`/assessments/${id}/result`);
              }}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted cursor-pointer"
            >
              View previous result
            </button>
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

  if (isLoading || !currentQ) {
    return (
      <LockdownRouteGuard assessmentId={id} allowedUrlPatterns={allowedUrlPatterns} allowFindOnPage={allowFindOnPage} accommodations={accommodations}>
        <SafeExamBrowser
          isEnabled={!isLoadingSettings && !isSubmitting}
          requireFullscreen={proctoring?.enforceFullscreen !== false && !isLockdownClient()}
          monitorViolations={false}
          detectTabSwitch={false}
          blockCopyPaste={false}
          onFullscreenEntered={async () => {
            if (isLockdownClient() && (!isMediaGatePassed || !isAppsGatePassed)) return;
            await beginAssessmentAfterFullscreen();
          }}
        >
          <div className="flex-1 min-h-screen bg-background flex items-center justify-center font-sans">
            <div className="text-center space-y-3">
              <Spinner className="w-9 h-9 animate-spin text-primary mx-auto" />
              <h2 className="text-sm font-semibold text-foreground">Preparing Secure Assessment Environment</h2>
              <p className="text-xs text-muted-foreground">{isLoadingSettings ? "Loading assessment settings…" : proctoring?.enforceFullscreen === false ? "Your assessment is starting." : "The test will start after you enter fullscreen."}</p>
            </div>
            {isLockdownClient() && (
              <LockdownUtilityDock
                assessmentId={id}
                sessionId={attestedSessionId}
                allowCalculators={allowCalculators}
                allowScratchpad={allowScratchpad}
                allowReferenceDoc={allowReferenceDoc}
                referencePdfUrl={referencePdfUrl}
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

  const isLastQuestion = currentIndex === questions.length - 1;
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

        {/* Center: Live Countdown Clock & Penalty Badge */}
        <div className="flex items-center gap-2 sm:gap-3">
          {isLockdownActive && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-semibold select-none shadow-xs"
              title="CodeSkill LockDown active: Attestation verified & OS kiosk engaged"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>LockDown Active</span>
            </div>
          )}
          {((proctoring?.mode === 'partial_proctored') || (proctoring?.violationPenaltyMarks && proctoring.violationPenaltyMarks > 0) || totalPenaltyMarks > 0) && (
            <div
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md border text-xs font-mono font-bold transition-all shadow-xs ${
                totalPenaltyMarks > 0
                  ? "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
                  : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800"
              }`}
              title="Partial proctored exam: Negative marks applied for violations. Manual submission is required."
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>
                Penalty: -{totalPenaltyMarks}
              </span>
              <span className="hidden lg:inline font-normal text-[10px] opacity-80">
                ({violations.length} {violations.length === 1 ? "violation" : "violations"})
              </span>
            </div>
          )}

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

          {/* Offline Autosave Live Sync Indicator */}
          <div className="flex items-center">
            {syncStatus === 'synced' && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 text-[11px] font-medium transition-all shadow-xs"
                title="All answers saved to server"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="hidden sm:inline">Saved</span>
              </div>
            )}
            {syncStatus === 'syncing' && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800 text-[11px] font-medium transition-all shadow-xs"
                title="Syncing answers with server"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600 dark:text-sky-400" />
                <span className="hidden sm:inline">Syncing...</span>
              </div>
            )}
            {syncStatus === 'offline-buffered' && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-700 text-[11px] font-medium animate-pulse shadow-xs"
                title="Wi-Fi disconnected. Answers are encrypted and stored locally, will sync automatically once connected."
              >
                <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Offline — {pendingSyncCount} {pendingSyncCount === 1 ? 'answer' : 'answers'} saved locally (Encrypted)</span>
              </div>
            )}
            {syncStatus === 'error' && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-300 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800 text-[11px] font-medium shadow-xs"
                title="Temporary sync error. Retrying automatically..."
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Sync Error ({pendingSyncCount})</span>
              </div>
            )}
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="hidden sm:flex items-center justify-center p-2 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
            disabled={isFullscreen && proctoring?.enforceFullscreen !== false}
            title={isFullscreen && proctoring?.enforceFullscreen !== false ? "Fullscreen required during the test" : isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Tab Switch Strike Counter */}
          {proctoring?.detectTabSwitch !== false && tabSwitches > 0 && (
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
        <aside id="assessment-question-sidebar" aria-label="Assessment question sidebar" className={`shrink-0 w-72 min-h-0 flex-col border-r border-border bg-card ${sidebarCollapsed ? "lg:hidden" : "lg:flex"} ${mobileSidebarOpen ? "absolute inset-y-0 left-0 z-40 flex shadow-2xl" : "hidden"}`}>
          <div className="shrink-0 border-b border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><h2 className="text-sm font-semibold text-foreground break-words">{assessmentTitle}</h2><p className="mt-1 text-xs text-muted-foreground">{answeredCount} of {questions.length} answered · {reviewCount} for review</p></div>
              <button aria-label="Close question sidebar" onClick={() => { setSidebarCollapsed(true); setMobileSidebarOpen(false); }} className="p-1 rounded hover:bg-muted"><X className="size-4" /></button>
            </div>
            <div role="progressbar" aria-label="Assessment progress" aria-valuenow={answeredCount} aria-valuemin={0} aria-valuemax={questions.length} className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{width: `${questions.length ? answeredCount / questions.length * 100 : 0}%`}} /></div>
            <div className="flex gap-3 text-[10px] text-muted-foreground"><span>● Answered</span><span className="text-amber-500">● Review</span><span>○ Not answered</span></div>
          </div>
          {isSequentialActive && activeSection && (
            <div className="mx-3 my-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1.5 shrink-0">
              <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 font-semibold text-[11px]">
                <span className="flex items-center gap-1.5">
                  <Lock className="size-3.5" /> Sequential Sections
                </span>
                <span>Section {activeSectionIndex + 1}/{sectionGroups.length}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Current: &ldquo;{activeSection.title}&rdquo;. Prior sections lock upon submission.
              </p>
              {activeSectionIndex < sectionGroups.length - 1 && (
                <button
                  type="button"
                  onClick={() => setShowSectionSubmitModal(true)}
                  className="w-full mt-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors flex items-center justify-center gap-1 shadow-xs"
                >
                  Complete Section & Next <ChevronRight className="size-3" />
                </button>
              )}
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
              const isQuestionLocked = isSequentialActive && sectionStatus !== "active";
              const response = responses[q._id];
              const answered = response?.status === "answered" && (((response.selectedAnswers && response.selectedAnswers.length > 0) || response.selectedAnswer >= 0) || Boolean(response.code?.trim()));
              const review = response?.status === "marked_for_review";
              const current = index === currentIndex;
              const coding = ["coding", "algorithmic", "dsa"].includes(q.questionType?.toLowerCase()) || (!q.options?.length && Boolean(q.starterCode || q.codeSnippet));
              const sectionQuestionsCount = q.sectionTitle
                ? sectionCounts[q.sectionTitle] || 0
                : 0;

              return (
                <Fragment key={q._id}>
                  {showSectionHeader && (
                    <div className="pt-3 pb-1 px-2.5 first:pt-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        <span className="truncate flex items-center gap-1.5">
                          {sectionStatus === "locked" && <Lock className="size-3 text-muted-foreground shrink-0" />}
                          {sectionStatus === "completed" && <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />}
                          <span className="truncate">{q.sectionTitle}</span>
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {isSequentialActive && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                              sectionStatus === "completed"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : sectionStatus === "active"
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "bg-muted text-muted-foreground border border-border"
                            }`}>
                              {sectionStatus === "completed" ? "Submitted" : sectionStatus === "active" ? "In Progress" : "Locked"}
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
                      setCurrentIndex(index);
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
                            : review ? "Review" : answered ? "Answered" : response?.code?.trim() ? "Draft" : "Not answered"
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
        {(() => {
          const isCodingQuestion = ["coding", "algorithmic", "dsa"].includes(currentQ.questionType?.toLowerCase()) || (!currentQ.options?.length && Boolean(currentQ.starterCode || currentQ.codeSnippet));
          return <AssessmentReadingZoom>{readingScale => <main className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden p-3 pb-24 gap-3 relative">
            {isCodingQuestion ? (
              <DSAAssessmentEditor assessmentId={id} readingScale={readingScale} key={currentQ._id} question={currentQ} savedResponse={responses[currentQ._id]} onDraftChange={handleCodingDraft} onSave={handleSaveCodingQuestion} onControlsChange={setCodingControls} blockCopyPaste={proctoring?.blockCopyPaste !== false} />
            ) : (
              <ResizableAssessmentPanels key={currentQ._id} className="rounded-2xl border border-border bg-card">
                <section aria-label="Question statement" tabIndex={0} className="assessment-scroll flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain p-5 space-y-6">
                  <div style={{ zoom: readingScale }} className="space-y-6">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Statement</div>
                  {/* Question Metadata Ribbon */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
                    <div className="flex items-center gap-2">
                      {currentQ.sectionTitle && (
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
            {/* Fixed Bottom Center Action Controls Bar (Outside Container)   */}
            {/* ───────────────────────────────────────────────────────────── */}
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-32px)]">
              <nav
                aria-label="Assessment navigation and actions"
                className="flex items-center gap-2 sm:gap-3 bg-card/95 dark:bg-card/90 backdrop-blur-xl border border-border px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
              >
                {/* Coding execution actions (Run Code, Submit Solution, Saved indicator) */}
                {isCodingQuestion && codingControls && (
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
                      className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-xl bg-background hover:bg-muted text-foreground text-xs font-bold border border-border shadow-xs transition-all disabled:opacity-50 cursor-pointer"
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
                      className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 disabled:opacity-50 cursor-pointer"
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

                {/* Review later toggle */}
                <button
                  type="button"
                  onClick={handleMarkForReview}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-xs font-semibold text-amber-600 dark:text-amber-400 transition-colors cursor-pointer"
                  title={currentResponse?.status === "marked_for_review" ? "Remove review flag" : "Mark for later review"}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{currentResponse?.status === "marked_for_review" ? "Unreview" : isCodingQuestion ? "Review later" : "Review"}</span>
                </button>

                {/* Previous question */}
                <button
                  type="button"
                  onClick={() => { flushDraftToState(); setCurrentIndex((prev) => Math.max(0, prev - 1)); }}
                  disabled={currentIndex === 0 || (isSequentialActive && isFirstQuestionOfCurrentSection)}
                  className="inline-flex items-center gap-1 px-3 sm:px-4 py-2 rounded-xl border border-border hover:bg-muted text-xs font-semibold text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" /> <span>Previous</span>
                </button>

                {/* Next Question / Complete Section / Review & Finish */}
                {isSequentialActive && isLastQuestionOfCurrentSection && activeSectionIndex < sectionGroups.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setShowSectionSubmitModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm shadow-amber-600/20 cursor-pointer"
                  >
                    Complete Section <ChevronRight className="w-4 h-4" />
                  </button>
                ) : isLastQuestion ? (
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-md shadow-primary/20 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> <span>Review answers</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveAndNext}
                    className="inline-flex items-center gap-1 px-4 sm:px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-sm shadow-primary/20 cursor-pointer"
                  >
                    <span>Next question</span> <ChevronRight className="w-4 h-4" />
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
      </FloatingAssessmentMonitor>}

      {/* Section Submit Confirmation Modal */}
      {showSectionSubmitModal && activeSection && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Submit & Lock Section ${activeSection.title}`}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
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

            <div className="p-4 bg-muted/40 border border-border rounded-2xl grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Answered</span>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{activeSectionStats.answered}</div>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Review</span>
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{activeSectionStats.review}</div>
              </div>
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
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
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

            <div className="p-4 bg-muted/40 border border-border rounded-2xl grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Answered</span>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{answeredCount}</div>
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">Review</span>
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{reviewCount}</div>
              </div>
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

            {isSequentialActive && activeSectionIndex < sectionGroups.length - 1 && (
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
          isSubmitted={isSubmitting || submissionRequestedRef.current}
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

      {/* Pre-Exam Close Non-Essential Apps Gate Modal */}
      {renderCloseAppsGateModal()}
    </div>
    </SafeExamBrowser>
    </LockdownRouteGuard>
  );
}
