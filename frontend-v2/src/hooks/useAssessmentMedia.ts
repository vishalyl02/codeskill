"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPreferredAssessmentCamera, releaseAssessmentStream, takeAssessmentStream, trackAssessmentStream } from "@/lib/assessment-media-session";

import {
  AssessmentMediaError,
  requestAssessmentMedia,
  verifyAssessmentMediaStream,
  type AssessmentCameraSelectionPolicy,
} from "@/lib/assessment-media-policy";

type ViolationHandler = (type: string, details: string) => void;

interface AssessmentMediaOptions {
  cameraSelectionPolicy?: AssessmentCameraSelectionPolicy;
  requireCamera?: boolean;
  requireMicrophone?: boolean;
}

type FaceDetectorInstance = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => { detections?: unknown[] };
  close: () => void;
};

type FaceDetectionStatus = "idle" | "initializing" | "active" | "unavailable";

function playVideo(video: HTMLVideoElement) {
  try {
    const playback = video.play();
    if (playback && typeof playback.catch === "function") void playback.catch(() => {});
  } catch {
    // Some browsers and test DOMs may not implement media playback.
  }
}

export function useAssessmentMedia(
  sessionId: string,
  enabled: boolean,
  onViolation: ViolationHandler,
  {
    cameraSelectionPolicy = "student_select",
    requireCamera = true,
    requireMicrophone = true,
  }: AssessmentMediaOptions = {},
) {
  const reconnectRef = useRef<(() => Promise<void>) | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const violationRef = useRef(onViolation);
  useEffect(() => { violationRef.current = onViolation; }, [onViolation]);
  const sessionRef = useRef({
    id: sessionId,
    ended: false,
    stream: null as MediaStream | null,
    audioContext: null as AudioContext | null,
    analyser: null as AnalyserNode | null,
    audioFrame: null as number | null,
    cooldown: 0,
    analysisVideo: null as HTMLVideoElement | null,
    faceDetector: null as FaceDetectorInstance | null,
    faceDetectionFrame: null as number | null,
    lastFaceCheck: 0,
    multipleFaceFrames: 0,
    faceCooldown: 0,
    audioListeners: new Set<(level: number) => void>(),
  });
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceCount, setFaceCount] = useState(0);
  const [faceDetectionStatus, setFaceDetectionStatus] = useState<FaceDetectionStatus>("idle");

  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    const stream = sessionRef.current.stream;
    if (!video || !stream || sessionRef.current.ended) return;

    video.srcObject = stream;
    playVideo(video);
  }, []);

  const releaseMedia = useCallback(() => {
    const session = sessionRef.current;
    if (session.audioFrame !== null) cancelAnimationFrame(session.audioFrame);
    session.audioFrame = null;
    if (session.faceDetectionFrame !== null) cancelAnimationFrame(session.faceDetectionFrame);
    session.faceDetectionFrame = null;
    session.faceDetector?.close();
    session.faceDetector = null;
    session.multipleFaceFrames = 0;
    session.lastFaceCheck = 0;
    if (session.analysisVideo) {
      session.analysisVideo.pause();
      session.analysisVideo.srcObject = null;
      session.analysisVideo = null;
    }
    session.analyser?.disconnect();
    session.analyser = null;
    session.stream = null;
    setMediaStream(null);
    releaseAssessmentStream(session.id);
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    const audio = session.audioContext;
    session.audioContext = null;
    if (audio && audio.state !== "closed") void audio.close().catch(() => {});
  }, []);

  const stopCamera = useCallback(() => {
    sessionRef.current.ended = true;
    releaseMedia();
    setCameraActive(false);
    setMicActive(false);
    setAudioLevel(0);
    setFaceCount(0);
    setFaceDetectionStatus("idle");
  }, [releaseMedia]);

  useEffect(() => {
    if (sessionRef.current.id !== sessionId) sessionRef.current = {
      id: sessionId, ended: false, stream: null, audioContext: null, analyser: null, audioFrame: null, cooldown: 0, analysisVideo: null,
      faceDetector: null, faceDetectionFrame: null, lastFaceCheck: 0, multipleFaceFrames: 0, faceCooldown: 0,
      audioListeners: new Set<(level: number) => void>(),
    };
    const session = sessionRef.current;
    if (!enabled || session.ended) return;
    let cancelled = false;
    const capture = { requireCamera, requireMicrophone, cameraSelectionPolicy };
    let requestVersion = 0;
    const setup = async (useHandoff: boolean) => {
      const version = ++requestVersion;
      const preferredCamera = requireCamera && cameraSelectionPolicy === "student_select"
        ? getPreferredAssessmentCamera(sessionId)
        : undefined;
      const handoff = useHandoff ? takeAssessmentStream(sessionId, preferredCamera, cameraSelectionPolicy) : null;
      const stream = handoff ?? await requestAssessmentMedia({
        ...capture,
        deviceId: preferredCamera,
        videoConstraints: { width: { ideal: 640, max: 1280 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 15 } },
      });
      // A permission prompt may settle after submission, navigation or a StrictMode cleanup.
      if (cancelled || session.ended || version !== requestVersion) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      if (handoff) {
        try {
          verifyAssessmentMediaStream(handoff, capture);
        } catch (error) {
          handoff.getTracks().forEach((track) => track.stop());
          throw error;
        }
      }
      if (session.stream) releaseMedia();
      session.stream = stream;
      setMediaStream(stream);
      trackAssessmentStream(sessionId, stream);
      setCameraActive(requireCamera);
      setMicActive(requireMicrophone);
      setCameraError(null);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        playVideo(videoRef.current);
      }

      if (requireCamera) {
        // Keep a detached video element for analysis so face monitoring stays
        // active while the candidate collapses the visible camera preview.
        const analysisVideo = document.createElement("video");
        analysisVideo.autoplay = true;
        analysisVideo.muted = true;
        analysisVideo.playsInline = true;
        analysisVideo.srcObject = stream;
        session.analysisVideo = analysisVideo;
        playVideo(analysisVideo);

        // Face detection is intentionally local: the browser analyzes the
        // existing proctoring stream and no frame is sent to an external API.
        setFaceDetectionStatus("initializing");
        void (async () => {
          try {
            const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
            const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
            const detector = await FaceDetector.createFromOptions(vision, {
              baseOptions: { modelAssetPath: "/mediapipe/face_detector.tflite" },
              runningMode: "VIDEO",
              minDetectionConfidence: 0.55,
            });

            if (cancelled || session.ended || session.stream !== stream) {
              detector.close();
              return;
            }

            session.faceDetector = detector;
            setFaceDetectionStatus("active");

            const detectFaces = () => {
              if (cancelled || session.ended || session.faceDetector !== detector) return;

              const video = session.analysisVideo;
              const now = performance.now();
              if (
                video &&
                video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
                video.videoWidth > 0 &&
                now - session.lastFaceCheck >= 700
              ) {
                session.lastFaceCheck = now;
                try {
                  const count = detector.detectForVideo(video, now).detections?.length || 0;
                  setFaceCount(count);

                  // Require consecutive frames before flagging an event so a
                  // brief detection error does not create a false warning.
                  session.multipleFaceFrames = count > 1 ? session.multipleFaceFrames + 1 : 0;
                  if (session.multipleFaceFrames >= 2 && Date.now() > session.faceCooldown) {
                    session.faceCooldown = Date.now() + 15_000;
                    violationRef.current(
                      "multiple_faces_detected",
                      `${count} faces detected in the proctoring camera feed. Only the candidate may be visible.`,
                    );
                  }
                } catch {
                  // Detection is optional telemetry. Keep the assessment and
                  // camera active if a browser cannot process a video frame.
                  setFaceDetectionStatus("unavailable");
                  detector.close();
                  session.faceDetector = null;
                  return;
                }
              }

              session.faceDetectionFrame = requestAnimationFrame(detectFaces);
            };
            detectFaces();
          } catch {
            // MediaPipe can be unavailable on older browsers. Camera and mic
            // proctoring remain available in that case.
            if (!cancelled && !session.ended && session.stream === stream) setFaceDetectionStatus("unavailable");
          }
        })();
      }

      const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (requireMicrophone && AudioCtx) {
        const context = new AudioCtx();
        session.audioContext = context;
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;
        session.analyser = analyser;
        context.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        let lastAudioLevelUpdate = 0;
        let lastAudioLevel = 0;
        const detectAudio = () => {
          if (cancelled || session.ended || !session.analyser) return;
          analyser.getByteFrequencyData(data);
          const average = data.reduce((sum, value) => sum + value, 0) / data.length;
          const normalized = Math.min(100, Math.round((average / 128) * 100));
          const now = Date.now();
          // Broadcast to isolated leaf listeners for zero React re-render updates
          session.audioListeners.forEach((fn) => {
            try { fn(normalized); } catch { /* ignore */ }
          });

          // Throttle top-level React state updates to prevent main-thread choking on low-spec CPUs
          const thresholdCrossed = (lastAudioLevel > 40) !== (normalized > 40);
          if (now - lastAudioLevelUpdate >= 1200 || (thresholdCrossed && now - lastAudioLevelUpdate >= 300)) {
            lastAudioLevelUpdate = now;
            lastAudioLevel = normalized;
            setAudioLevel(normalized);
          }
          if (normalized > 42 && now > session.cooldown) {
            session.cooldown = now + 7000;
            violationRef.current("voice_detected", "Voice or elevated noise detected by microphone proctor");
          }
          session.audioFrame = requestAnimationFrame(detectAudio);
        };
        detectAudio();
      }
      return true;
    };

    const requestReconnect = async () => {
      if (cancelled || session.ended) throw new Error("This assessment is no longer using the camera.");
      if (!await setup(false)) throw new Error("This media request is no longer active.");
    };
    reconnectRef.current = requestReconnect;
    void setup(true).catch((error: unknown) => {
      if (cancelled || session.ended || requestVersion !== 1) return;
      releaseMedia();
      setCameraActive(false);
      setMicActive(false);
      if (error instanceof AssessmentMediaError) {
        setCameraError(error.message);
      } else {
        setCameraError("Camera or microphone access is required for this assessment.");
      }
      violationRef.current("media_permission_denied", "Could not start the required proctoring media");
    });
    const onPageHide = () => stopCamera();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      cancelled = true;
      reconnectRef.current = null;
      window.removeEventListener("pagehide", onPageHide);
      releaseMedia();
    };
  }, [cameraSelectionPolicy, enabled, requireCamera, requireMicrophone, sessionId, releaseMedia, stopCamera]);

  const reconnectMedia = useCallback(async () => {
    const requestReconnect = reconnectRef.current;
    if (!requestReconnect) throw new Error("This assessment is no longer using the camera.");
    await requestReconnect();
  }, []);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session.ended && cameraActive && videoRef.current && session.stream) {
      videoRef.current.srcObject = session.stream;
    }
  }, [cameraActive, sessionId]);

  const subscribeAudioLevel = useCallback((callback: (level: number) => void) => {
    const listeners = sessionRef.current.audioListeners;
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, []);

  const getAnalysisVideo = useCallback(() => sessionRef.current.analysisVideo, []);

  return {
    videoRef,
    getAnalysisVideo,
    attachVideo,
    cameraActive: enabled && cameraActive,
    micActive: enabled && micActive,
    mediaStream: enabled ? mediaStream : null,
    audioLevel: enabled ? audioLevel : 0,
    cameraError,
    faceCount: enabled ? faceCount : 0,
    faceDetectionStatus: enabled ? faceDetectionStatus : "idle",
    stopCamera,
    reconnectMedia,
    subscribeAudioLevel,
  };
}
