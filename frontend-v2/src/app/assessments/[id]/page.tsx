"use client";

import { useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
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
  RefreshCw,
  BarChart3
} from "lucide-react";
import { studentAssessmentsAPI } from "@/config/api";
import { useAuth } from "@/context/AuthContext";
import { handoffAssessmentStream, releaseAssessmentStream, setPreferredAssessmentCamera } from "@/lib/assessment-media-session";

export default function AssessmentBriefingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();
  const { user } = useAuth();

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [agreedToRules, setAgreedToRules] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [isCheckingMedia, setIsCheckingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const streamHandedOffRef = useRef(false);
  const cameraRequestIdRef = useRef(0);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
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
        navigator.mediaDevices.enumerateDevices(),
        Promise.resolve(stream.getVideoTracks()[0]?.getSettings()),
      ]);
      const cameras = devices.filter((device) => device.kind === "videoinput");
      setCameraDevices(cameras);
      setSelectedCamera(settings?.deviceId || deviceId || cameras[0]?.deviceId || "");
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
    const fetchOverview = async () => {
      setIsLoading(true);
      try {
        const res = await studentAssessmentsAPI.getOverview(id);
        const nextData = res.data as {
          assessment?: Record<string, unknown> | null;
          attempt?: { status?: string } | null;
          canRetake?: boolean;
          completedAttemptsCount?: number;
        };
        setData(nextData);
        // Only redirect to result if student finished and cannot retake
        if (
          (nextData.attempt?.status === "submitted" || nextData.attempt?.status === "auto_submitted") &&
          nextData.canRetake === false
        ) {
          router.replace(`/assessments/${id}/result`);
        }
      } catch (err) {
        console.error("Failed to load assessment overview:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOverview();
  }, [id, router]);

  const assessment = data?.assessment;

  const handleStartExam = async () => {
    if (!agreedToRules || !cameraStreamRef.current) return;
    setIsStarting(true);

    try {
      // Request Fullscreen if supported
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => { });
      }
    } catch (e) {
      // Fullscreen prompt optional fallback
    }

    const attemptToken = Date.now();

    // If re-attempting after completing, ensure fresh attempt is initialized
    if (data?.completedAttemptsCount > 0 && data?.attempt?.status !== "in_progress") {
      try {
        await studentAssessmentsAPI.retakeAttempt(id);
      } catch (e) {
        console.error("Retake attempt error:", e);
      }
    }

    router.push(`/assessments/${id}/take?attempt=${attemptToken}`);
  };

  if (isLoading) {
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
          <h2 className="text-lg font-bold text-foreground">Assessment Not Found</h2>
          <p className="text-xs text-muted-foreground">
            This assessment does not exist or you may not have permission to view it.
          </p>
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

          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-muted text-foreground border border-border">
                  {assessment.code}
                </span>
                {assessment.isAvailable !== false ? (
                  <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse" /> Available Now
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                    {assessment.unavailabilityReason || "Currently Closed"}
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

            {user?.uid && (
              <div className="bg-muted/50 border border-border px-4 py-2.5 rounded-md text-left sm:text-right shrink-0">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Candidate</span>
                <div className="text-xs font-bold text-foreground mt-0.5">{user.name}</div>
                <div className="text-[11px] font-mono text-primary font-semibold">{user.uid}</div>
              </div>
            )}
          </div>

          {/* Timing Window Banner (If configured by Admin) */}
          {(assessment.startTime || assessment.endTime) && (
            <div className="p-3.5 bg-muted/40 border border-border rounded-md flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4 text-primary" />
                <span className="font-semibold text-foreground">Scheduled Window:</span>
                <span>
                  {assessment.startTime ? new Date(assessment.startTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "Immediate"}
                  {" — "}
                  {assessment.endTime ? new Date(assessment.endTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "No Expiry"}
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
          <section aria-labelledby="assessment-media-heading" className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 id="assessment-media-heading" className="text-sm font-bold text-foreground">Camera &amp; microphone check</h3>
                <p className="mt-1 text-xs text-muted-foreground">Choose your camera and confirm your devices before entering the secure assessment.</p>
              </div>
              {cameraStream ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Devices ready</span> : <span className="text-xs text-muted-foreground">Camera access required</span>}
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.85fr)] sm:items-center">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-950">
                <video ref={cameraPreviewRef} autoPlay muted playsInline className={`h-full w-full object-cover ${cameraStream ? "" : "hidden"}`} />
                {!cameraStream && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300"><ShieldAlert className="h-8 w-8 text-slate-400" /><span className="text-xs">Camera preview will appear here</span></div>}
              </div>
              <div className="space-y-3">
                {cameraDevices.length > 0 && <label className="block space-y-1.5 text-xs font-medium text-foreground">Choose camera
                  <select aria-label="Choose camera" value={selectedCamera} disabled={isCheckingMedia} onChange={(event) => { setSelectedCamera(event.target.value); void enableCamera(event.target.value); }} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
                    {cameraDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
                  </select>
                </label>}
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 ${cameraStream?.getVideoTracks().some((track) => track.readyState === "live") ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700" : "border-border text-muted-foreground"}`}><Video className="h-3.5 w-3.5" />Camera</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 ${cameraStream?.getAudioTracks().some((track) => track.readyState === "live") ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700" : "border-border text-muted-foreground"}`}><Mic className="h-3.5 w-3.5" />Microphone</span>
                </div>
                {!cameraStream && <button type="button" onClick={() => void enableCamera()} disabled={isCheckingMedia} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 px-3 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/5 disabled:opacity-60">
                  {isCheckingMedia ? <><RefreshCw className="h-4 w-4 animate-spin" /> Checking devices…</> : "Enable camera & microphone"}
                </button>}
              </div>
            </div>
            {mediaError && <p role="alert" className="text-xs font-medium text-destructive">{mediaError}</p>}
            {startError && <p role="alert" className="text-xs font-medium text-destructive">{startError}</p>}
          </section>

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
                I acknowledge that I am attempting this assessment independently without external assistance. I agree to camera/microphone proctoring and telemetry integrity monitoring.
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
                {assessment.isAvailable === false
                  ? "This assessment is currently not accepting new attempts."
                  : data?.completedAttemptsCount > 0
                    ? "Starting a new attempt will allow you to improve your score. The highest score is permanently saved."
                    : "Review your devices and rules before entering the secure assessment."}
              </span>

              <button
                onClick={handleStartExam}
                disabled={!agreedToRules || !cameraStream || isStarting || isCheckingMedia || assessment.isAvailable === false}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 active:bg-primary/80 text-white font-semibold rounded-md text-xs sm:text-sm uppercase tracking-wider transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Maximize2 className="w-4 h-4" />
                {isStarting
                  ? "Launching Exam..."
                  : assessment.isAvailable === false
                    ? "Assessment Closed"
                    : "Begin Assessment"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
