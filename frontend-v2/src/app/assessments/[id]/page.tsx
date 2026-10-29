"use client";

import { useEffect, useRef, useState, use, type ReactNode } from "react";
import { useRouter } from "next/navigation";

function Countdown({
  date,
  onComplete,
  renderer,
}: {
  date: number;
  onComplete?: () => void;
  renderer: (props: { days: number; hours: number; minutes: number; seconds: number; completed: boolean }) => ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= date) {
        onComplete?.();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [date, onComplete]);

  const diff = Math.max(0, date - now);
  const completed = diff <= 0;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return <>{renderer({ days, hours, minutes, seconds, completed })}</>;
}
import Link from "next/link";
import {
  Clock,
  Award,
  Layers,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Maximize2,
  Mic,
  Video,
  Camera,
  RefreshCw,
  BarChart3
} from "lucide-react";
import { studentAssessmentsAPI } from "@/config/api";
import { useAuth } from "@/context/AuthContext";
import { formatAssessmentTimeLeft } from "@/lib/assessment-cards";
import { handoffAssessmentStream, releaseAssessmentStream, setPreferredAssessmentCamera } from "@/lib/assessment-media-session";
import {
  clearAssessmentFaceReference,
  createAssessmentFaceReference,
  getAssessmentFaceReference,
  setAssessmentFaceReference,
} from "@/lib/assessment-face-verification";
import { formatAssessmentDateTime, getAssessmentScheduleState } from "@/lib/assessment-schedule";

export default function AssessmentBriefingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const isSignedIn = Boolean(user);
  const userKey = user?.id || user?._id || user?.uid;

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ status?: number; message: string } | null>(null);
  const [loadRetry, setLoadRetry] = useState(0);
  const [scheduleNow, setScheduleNow] = useState(() => Date.now());
  const [agreedToRules, setAgreedToRules] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [isCheckingMedia, setIsCheckingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [isCapturingSelfie, setIsCapturingSelfie] = useState(false);
  const [selfieError, setSelfieError] = useState<string | null>(null);
  const [selfieCaptured, setSelfieCaptured] = useState(false);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const streamHandedOffRef = useRef(false);
  const cameraRequestIdRef = useRef(0);

  useEffect(() => {
    clearAssessmentFaceReference(id);
  }, [id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (cameraPreviewRef.current) cameraPreviewRef.current.srcObject = cameraStream;
  }, [cameraStream]);


  useEffect(() => () => {
    cameraRequestIdRef.current += 1;
    if (!streamHandedOffRef.current) {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      releaseAssessmentStream(id);
    }
  }, [id]);

  const enableCamera = async (deviceId?: string) => {
    const requestId = ++cameraRequestIdRef.current;
    setIsCheckingMedia(true);
    setMediaError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera and microphone access is not supported in this browser.");
      }
      const systemDefaultCamera = assessment?.proctoring?.cameraSelectionPolicy === 'system_default';
      const stream = await navigator.mediaDevices.getUserMedia({
        video: systemDefaultCamera
          ? true
          : deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
            : { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      if (requestId !== cameraRequestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      const [devices, settings] = await Promise.all([
        systemDefaultCamera ? Promise.resolve([] as MediaDeviceInfo[]) : navigator.mediaDevices.enumerateDevices(),
        Promise.resolve(stream.getVideoTracks()[0]?.getSettings()),
      ]);
      const cameras = devices.filter((device) => device.kind === "videoinput");
      setCameraDevices(cameras);
      setSelectedCamera(settings?.deviceId || deviceId || cameras[0]?.deviceId || "");
      if (!systemDefaultCamera && settings?.deviceId) setPreferredAssessmentCamera(id, settings.deviceId);
    } catch (error) {
      if (requestId !== cameraRequestIdRef.current) return;
      setCameraStream(cameraStreamRef.current);
      const activeCameraId = cameraStreamRef.current?.getVideoTracks()[0]?.getSettings().deviceId;
      if (activeCameraId) setSelectedCamera(activeCameraId);
      setMediaError(error instanceof Error && error.name === "NotAllowedError"
        ? "Allow camera and microphone access in your browser to continue."
        : error instanceof Error ? error.message : "Camera and microphone could not be started.");
    } finally {
      if (requestId === cameraRequestIdRef.current) setIsCheckingMedia(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isSignedIn) {
      setIsLoading(false);
      setData(null);
      return;
    }
    let active = true;
    const fetchOverview = async () => {
      setIsLoading(true);
      setData(null);
      setLoadError(null);
      try {
        const res = await studentAssessmentsAPI.getOverview(id);
        if (!active) return;
        const nextData = res.data as {
          assessment?: Record<string, unknown> | null;
          attempt?: { status?: string } | null;
          canRetake?: boolean;
          completedAttemptsCount?: number;
        };
        if (!nextData.assessment) throw new Error("Invalid assessment response");
        setData(nextData);
        // Only redirect to result if student finished and cannot retake
        if (
          (nextData.attempt?.status === "submitted" || nextData.attempt?.status === "auto_submitted") &&
          nextData.canRetake === false
        ) {
          router.replace(`/assessments/${id}/result`);
        }
      } catch (err: unknown) {
        if (!active) return;
        const status = (err as { response?: { status?: number } }).response?.status;
        setLoadError({ status, message: status === 404
          ? "This assessment link is no longer available. Check the link with your instructor."
          : status === 403
            ? "This assessment is not assigned to your account. Ask your instructor to check your batch or semester."
            : status === 401
              ? "Your session has expired. Sign in again to open this assessment."
              : "We couldn’t load this assessment. Please try again. If this continues, contact your instructor." });
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void fetchOverview();
    return () => { active = false; };
  }, [id, router, authLoading, isSignedIn, userKey, loadRetry]);

  useEffect(() => {
    const timer = window.setInterval(() => setScheduleNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const assessment = data?.assessment;
  const activeAttempt = data?.attempt?.status === "in_progress";
  const resumesLeft = data?.attempt?.resumeAttemptsRemaining ?? 3;
  const resumeExpired = Boolean(activeAttempt && data?.attempt?.attemptExpiresAt && new Date(data.attempt.attemptExpiresAt).getTime() <= now);
  const resumeUnavailable = activeAttempt && (resumesLeft <= 0 || resumeExpired);
  const scheduleState = assessment
    ? getAssessmentScheduleState(assessment.startTime, assessment.endTime, scheduleNow)
    : "invalid";
  const countdownTarget = scheduleState === "upcoming" && assessment?.startTime
    ? new Date(assessment.startTime).getTime()
    : scheduleState === "live" && assessment?.endTime
      ? new Date(assessment.endTime).getTime()
      : null;
  const countdownLabel = scheduleState === "upcoming" ? "Assessment opens in" : "Assessment closes in";
  const canStartInWindow = scheduleState === "live" && assessment?.isAvailable !== false;

  const previousScheduleState = useRef(scheduleState);
  useEffect(() => {
    const previousState = previousScheduleState.current;
    previousScheduleState.current = scheduleState;
    if (!((previousState === "upcoming" && scheduleState === "live") || (previousState === "live" && scheduleState === "expired"))) return;

    // Re-check eligibility at the scheduled opening time so the Begin button
    // reflects the server's current attempt and cohort rules without a reload.
    let active = true;
    void studentAssessmentsAPI.getOverview(id)
      .then((response) => { if (active) setData(response.data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [id, scheduleState]);

  const handleStartExam = async () => {
    if (!canStartInWindow) return;
    const cameraRequired = assessment?.proctoring?.useCamera !== false;
    if (!agreedToRules || resumeUnavailable || (cameraRequired && (!cameraStreamRef.current || !getAssessmentFaceReference(id)))) return;
    setIsStarting(true);

    const attemptToken = Date.now();
    const retake = data?.completedAttemptsCount > 0 && !activeAttempt;
    router.push(`/assessments/${id}/take?attempt=${attemptToken}${retake ? "&retake=1" : ""}`);
  };


  const captureSelfie = async () => {
    const video = cameraPreviewRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setSelfieError("Wait for the camera preview, then take your selfie.");
      return;
    }
    setIsCapturingSelfie(true);
    setSelfieError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The camera image could not be processed. Please try again.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const reference = await createAssessmentFaceReference(canvas);
      setAssessmentFaceReference(id, reference);
      setSelfiePreview(canvas.toDataURL("image/jpeg", 0.86));
      setSelfieCaptured(true);
    } catch (error) {
      clearAssessmentFaceReference(id);
      setSelfiePreview(null);
      setSelfieCaptured(false);
      setSelfieError(error instanceof Error ? error.message : "Face verification could not be initialized. Check your connection and retry.");
    } finally {
      setIsCapturingSelfie(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex-1 min-h-screen bg-background flex items-center justify-center font-sans">
        <div className="text-center space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin text-amber-500 mx-auto" />
          <p className="text-xs text-muted-foreground">Preparing assessment briefing...</p>
        </div>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="flex-1 min-h-screen bg-background flex items-center justify-center font-sans p-6">
        <div className="text-center space-y-4 max-w-sm">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h2 className="text-lg font-bold text-foreground">{!isSignedIn || loadError?.status === 401 ? "Sign in to continue" : loadError?.status === 404 ? "Assessment Not Found" : loadError?.status === 403 ? "Assessment not assigned" : "Assessment couldn’t be loaded"}</h2>
          <p role="alert" className="text-sm text-muted-foreground">{!isSignedIn ? "Sign in with your student account to open this assessment." : loadError?.message}</p>
          {(!isSignedIn || loadError?.status === 401) ? <Link href="/login" className="inline-flex px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold">Sign in</Link> : loadError?.status !== 404 && loadError?.status !== 403 ? <button type="button" onClick={() => setLoadRetry(value => value + 1)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold"><RefreshCw className="w-4 h-4" />Try again</button> : null}
          <Link
            href="/assessments"
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-zinc-950 font-semibold rounded-xl text-xs hover:bg-amber-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Assessments
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background text-foreground font-sans min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8 mt-16 md:mt-24 space-y-8">
        {/* Navigation Breadcrumb */}
        <Link
          href="/assessments"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Assessments
        </Link>

        {/* Exam Header Card */}
        <div className="bg-card text-card-foreground border border-border rounded-lg p-6 sm:p-8 space-y-6 shadow-xs">
          {/* Institutional Branding Header */}
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <div className="w-10 h-10 rounded-md overflow-hidden bg-white shrink-0 border border-border p-0.5 flex items-center justify-center">
              <img
                src="https://images.seeklogo.com/logo-png/43/1/chandigarh-university-cu-logo-png_seeklogo-432515.png"
                alt="Chandigarh University"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/cu-logo.png";
                }}
              />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground leading-tight">Chandigarh University</p>
              <p className="text-[10px] text-primary font-semibold uppercase tracking-wider">Official Assessment & Examination Portal</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-muted text-foreground border border-border">
                  {assessment.code}
                </span>
                {canStartInWindow ? (
                  <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse" /> Available Now
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                    {scheduleState === "upcoming" ? "Upcoming" : scheduleState === "expired" ? "Assessment Closed" : assessment.unavailabilityReason || "Currently Closed"}
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-muted text-foreground border border-border">
                  {assessment.allowedAttempts === 1
                    ? "1 Attempt Allowed"
                    : assessment.allowedAttempts === 0
                      ? "Multiple Attempts Allowed"
                      : `${assessment.allowedAttempts} Attempts Allowed`}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {assessment.title}
              </h1>
              {assessment.description && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-2 leading-relaxed">
                  {assessment.description}
                </p>
              )}
            </div>

            <aside className="space-y-3">
              {user?.uid && (
                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-left md:text-right">
                  <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">Candidate</span>
                  <div className="mt-1 text-sm font-bold text-foreground">{user.name}</div>
                  <div className="text-xs font-mono text-primary font-semibold">{user.uid}</div>
                </div>
              )}

              <section aria-label="Assessment schedule countdown" className={`rounded-xl border p-4 ${scheduleState === "expired" ? "border-rose-500/25 bg-rose-500/5" : scheduleState === "upcoming" ? "border-amber-500/25 bg-amber-500/5" : "border-primary/20 bg-primary/5"}`}>
                <div className="flex items-center gap-2 text-primary">
                  <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground">
                    {scheduleState === "expired" ? "Assessment window" : countdownTarget ? countdownLabel : "Attempt duration"}
                  </p>
                </div>
                {countdownTarget ? (
                  <Countdown
                    date={countdownTarget}
                    onComplete={() => setScheduleNow(Date.now())}
                    renderer={({ days, hours, minutes, seconds, completed }) => completed ? (
                      <p className="mt-3 text-sm font-bold text-rose-600 dark:text-rose-400">Updating schedule…</p>
                    ) : (
                      <div className="mt-3 grid grid-cols-4 gap-1.5" role="timer" aria-live="off">
                        {[{ value: days, unit: "days" }, { value: hours, unit: "hrs" }, { value: minutes, unit: "min" }, { value: seconds, unit: "sec" }].map(({ value, unit }) => (
                          <div key={unit} className="min-w-0 rounded-lg border border-border/70 bg-background px-1 py-2 text-center">
                            <div className="font-mono text-base font-bold tabular-nums text-foreground">{String(value).padStart(2, "0")}</div>
                            <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{unit}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  />
                ) : (
                  <p className={`mt-3 text-sm font-bold ${scheduleState === "expired" ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
                    {scheduleState === "expired" ? "Closed" : scheduleState === "invalid" ? "Schedule unavailable" : `${assessment.durationMinutes} minutes`}
                  </p>
                )}
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {scheduleState === "upcoming" && assessment.startTime
                    ? `Opens ${formatAssessmentDateTime(assessment.startTime, "D MMM, h:mm A")}. The attempt timer starts after you begin.`
                    : scheduleState === "expired"
                      ? "The scheduled assessment window has ended."
                      : scheduleState === "invalid"
                        ? "The assessment schedule could not be read. Refresh the page or contact your administrator."
                        : assessment.endTime
                          ? `Scheduled end: ${formatAssessmentDateTime(assessment.endTime, "D MMM, h:mm A")}. Your attempt also has its own ${assessment.durationMinutes}-minute timer.`
                          : "No scheduled closing time. Your per-attempt timer starts when you begin."}
                </p>
              </section>
            </aside>
          </div>

          {/* Timing Window Banner (If configured by Admin) */}
          {(assessment.startTime || assessment.endTime) && (
            <div className="p-3.5 bg-muted/40 border border-border rounded-md flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4 text-primary" />
                <span className="font-semibold text-foreground">Scheduled Window:</span>
                <span>
                  {assessment.startTime ? formatAssessmentDateTime(assessment.startTime, "D MMM YYYY, h:mm A") : "Immediate"}
                  {" — "}
                  {assessment.endTime ? formatAssessmentDateTime(assessment.endTime, "D MMM YYYY, h:mm A") : "No Expiry"}
                </span>
              </div>
              {assessment.unavailabilityReason && (
                <span className="text-[11px] font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                  {assessment.unavailabilityReason}
                </span>
              )}
            </div>
          )}

          {/* Test Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-y border-border">
            <div className="bg-muted/45 p-3.5 rounded-xl border border-border">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-primary" /> Duration
              </span>
              <div className="text-lg sm:text-xl font-bold text-foreground mt-1">
                {assessment.durationMinutes} mins
              </div>
            </div>

            <div className="bg-muted/45 p-3.5 rounded-xl border border-border">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-primary" /> Questions
              </span>
              <div className="text-lg sm:text-xl font-bold text-foreground mt-1">
                {assessment.questionCount} Questions
              </div>
            </div>

            <div className="bg-muted/45 p-3.5 rounded-xl border border-border">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Award className="w-3.5 h-3.5 text-emerald-400" /> Total Marks
              </span>
              <div className="text-lg sm:text-xl font-bold text-foreground mt-1">
                {assessment.totalMarks} pts
              </div>
            </div>

            <div className="bg-muted/45 p-3.5 rounded-xl border border-border">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Passing Marks
              </span>
              <div className="text-lg sm:text-xl font-bold text-foreground mt-1">
                {assessment.passingMarks} pts
              </div>
            </div>
          </div>

          {/* Candidate Instructions */}
          <div className="space-y-3">
            <h3 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">
              Examination Rules & Integrity Notice
            </h3>
            <ul className="space-y-2.5 text-xs text-muted-foreground">
              {(Array.isArray(assessment.instructions) && assessment.instructions.length > 0
                ? assessment.instructions
                : typeof assessment.instructions === "string" && assessment.instructions.trim().length > 0
                  ? assessment.instructions.split("\n").map((s: string) => s.trim()).filter(Boolean)
                  : [
                    "Camera & Microphone proctoring is enabled to monitor your test environment.",
                    "Fullscreen mode is strictly enforced. Tab switching or exiting fullscreen will trigger security warnings.",
                    "Copy, Paste, and inspect shortcuts are prohibited and recorded.",
                    "The assessment auto-submits when the countdown reaches 0:00. Ensure you submit before time expires.",
                  ]
              ).map((inst: string, i: number) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{inst}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Camera and microphone check before the test starts */}
          {assessment.proctoring?.useCamera !== false ? <section aria-labelledby="assessment-media-heading" className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id="assessment-media-heading" className="text-sm font-bold text-foreground">Camera &amp; microphone check</h3>
                <p className="mt-1 text-xs text-muted-foreground">{assessment.proctoring?.cameraSelectionPolicy === 'system_default' ? "Your browser's default camera and microphone will be used for the secure assessment." : 'Choose your camera and confirm your devices before entering the secure assessment.'}</p>
              </div>
              {cameraStream ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Devices ready</span> : <span className="text-xs text-muted-foreground">Camera access required</span>}
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.85fr)] sm:items-center">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-950">
                <video ref={cameraPreviewRef} autoPlay muted playsInline className={`h-full w-full object-cover ${cameraStream ? "" : "hidden"}`} />
                {!cameraStream && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300"><ShieldAlert className="h-8 w-8 text-slate-400" /><span className="text-xs">Camera preview will appear here</span></div>}
              </div>
              <div className="space-y-3">
                {assessment.proctoring?.cameraSelectionPolicy !== 'system_default' && cameraDevices.length > 0 && <label className="block space-y-1.5 text-xs font-medium text-foreground">Choose camera
                  <select aria-label="Choose camera" value={selectedCamera} disabled={isCheckingMedia} onChange={(event) => { clearAssessmentFaceReference(id); setSelfieCaptured(false); setSelfiePreview(null); setSelfieError(null); setSelectedCamera(event.target.value); void enableCamera(event.target.value); }} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
                    {cameraDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
                  </select>
                </label>}
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 ${cameraStream?.getVideoTracks().some((track) => track.readyState === "live") ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700" : "border-border text-muted-foreground"}`}><Video className="h-3.5 w-3.5" />Camera</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 ${cameraStream?.getAudioTracks().some((track) => track.readyState === "live") ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700" : "border-border text-muted-foreground"}`}><Mic className="h-3.5 w-3.5" />Microphone</span>
                </div>
                {cameraStream && <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Identity selfie required</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Center your face alone in the frame. We’ll compare this selfie with your camera during the assessment.</p>
                  </div>
                  <button type="button" onClick={() => void captureSelfie()} disabled={isCapturingSelfie || isCheckingMedia} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60">
                    {isCapturingSelfie ? <><RefreshCw className="h-4 w-4 animate-spin" /> Preparing face check…</> : selfieCaptured ? <><CheckCircle2 className="h-4 w-4" /> Retake identity selfie</> : <><Camera className="h-4 w-4" /> Take identity selfie</>}
                  </button>
                  {selfiePreview && <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
                    <img src={selfiePreview} alt="Captured identity selfie" className="h-14 w-14 rounded-md object-cover" />
                    <div className="text-xs"><p className="font-semibold text-emerald-700">Selfie captured</p><p className="mt-0.5 text-muted-foreground">Face matching will stay on during your test.</p></div>
                  </div>}
                </div>}
                {!cameraStream && <button type="button" onClick={() => void enableCamera()} disabled={isCheckingMedia} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 px-3 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/5 disabled:opacity-60">
                  {isCheckingMedia ? <><RefreshCw className="h-4 w-4 animate-spin" /> Checking devices…</> : "Enable camera & microphone"}
                </button>}
              </div>
            </div>
            {mediaError && <p role="alert" className="text-xs font-medium text-destructive">{mediaError}</p>}
            {selfieError && <p role="alert" className="text-xs font-medium text-destructive">{selfieError}</p>}
            {startError && <p role="alert" className="text-xs font-medium text-destructive">{startError}</p>}
          </section> : <section className="rounded-2xl border border-border bg-card p-4 sm:p-5"><p className="text-sm font-semibold text-foreground">Camera and microphone are not required for this assessment.</p><p className="mt-1 text-xs text-muted-foreground">You can begin without enabling either device.</p>{startError && <p role="alert" className="mt-3 text-xs font-medium text-destructive">{startError}</p>}</section>}

          {/* System Check & Anti-Cheat Consent */}
          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreedToRules}
                onChange={(e) => setAgreedToRules(e.target.checked)}
                className="mt-0.5 rounded border-border text-primary focus:ring-primary h-4 w-4"
              />
              <span className="text-xs text-foreground font-medium leading-relaxed">
                I acknowledge that I am attempting this assessment independently without external assistance.{assessment.proctoring?.useCamera !== false ? " I agree to camera/microphone proctoring." : ""} Periodic assessment snapshots may be captured.
              </span>
            </label>
          </div>

          {/* Previous Attempt Summary for Re-attempts */}
          {data?.completedAttemptsCount > 0 && (
            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Previous Attempt Completed ({data.completedAttemptsCount} {data.completedAttemptsCount === 1 ? "attempt" : "attempts"} taken)
                </span>
                <p className="text-muted-foreground">
                  Highest Score Recorded: <strong className="text-emerald-400 font-bold">{data.highestScore ?? data.attempt?.score ?? 0}</strong> / {assessment.totalMarks} pts.
                  {assessment.allowedAttempts === 0 ? " (Unlimited Re-attempts Allowed)" : ` (${assessment.allowedAttempts - data.completedAttemptsCount} attempts remaining)`}
                </p>
              </div>
              <Link
                href={`/assessments/${id}/result`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-lg border border-border text-xs transition-colors"
              >
                <BarChart3 className="w-3.5 h-3.5 text-primary" /> View Last Scorecard
              </Link>
            </div>
          )}

          {activeAttempt && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
            <span className="inline-flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4 text-primary" />Time left <strong className="font-mono text-foreground">{formatAssessmentTimeLeft(data.attempt.attemptExpiresAt, now)}</strong></span>
            <span className="text-muted-foreground">Resumes left <strong className="font-mono text-foreground">{resumesLeft} / {data.attempt.maxResumeAttempts ?? 3}</strong></span>
          </div>}

          {/* Start Action / Scorecard Redirect */}
          {data?.attempt?.status === "submitted" && data?.canRetake === false ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
              <span className="text-xs text-muted-foreground font-medium">
                You have already completed your permitted attempt(s) for this examination.
              </span>

              <Link
                href={`/assessments/${id}/result`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-xs sm:text-sm transition-all shadow-md shadow-primary/20"
              >
                <BarChart3 className="w-4 h-4" /> View Your Scorecard & Result
              </Link>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
              <span className="text-xs text-muted-foreground">
                {resumeUnavailable
                  ? resumeExpired ? "This attempt has run out of time." : "All three resume opportunities have been used."
                  : !canStartInWindow
                  ? "This assessment is currently not accepting new attempts."
                  : data?.completedAttemptsCount > 0
                    ? "Starting a new attempt will allow you to improve your score. The highest score is permanently saved."
                    : "Review your devices and rules before entering the secure assessment."}
              </span>

              <button
                onClick={handleStartExam}
                disabled={!agreedToRules || resumeUnavailable || (assessment.proctoring?.useCamera !== false && (!cameraStream || !selfieCaptured || isCheckingMedia || isCapturingSelfie)) || isStarting || !canStartInWindow}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 active:bg-primary/80 text-white font-semibold rounded-md text-xs sm:text-sm uppercase tracking-wider transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Maximize2 className="w-4 h-4" />
                {isStarting
                  ? "Launching Exam..."
                  : resumeExpired
                    ? "Time Expired"
                    : resumeUnavailable
                    ? "Resume Limit Reached"
                    : !canStartInWindow
                      ? scheduleState === "upcoming" ? "Not Yet Available" : "Assessment Closed"
                      : activeAttempt ? "Resume Assessment" : "Begin Assessment"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
