"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPreferredAssessmentCamera, releaseAssessmentStream, takeAssessmentStream, trackAssessmentStream } from "@/lib/assessment-media-session";

type ViolationHandler = (type: string, details: string) => void;

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

export function useAssessmentMedia(sessionId: string, enabled: boolean, onViolation: ViolationHandler) {
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
  });
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
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
    };
    const session = sessionRef.current;
    if (!enabled || session.ended) return;
    let cancelled = false;
    const setup = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError("Camera/Mic not supported by this browser.");
          violationRef.current("media_unsupported", "Browser does not support getUserMedia proctoring");
          return;
        }
        const preferredCamera = getPreferredAssessmentCamera(sessionId);
        const stream = takeAssessmentStream(sessionId, preferredCamera) || await navigator.mediaDevices.getUserMedia({
          video: preferredCamera
            ? { deviceId: { exact: preferredCamera }, width: { ideal: 320 }, height: { ideal: 240 } }
            : { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" },
          audio: true,
        });
        // A permission prompt may settle after submission, navigation or a StrictMode cleanup.
        if (cancelled || session.ended) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        session.stream = stream;
        trackAssessmentStream(sessionId, stream);
        setCameraActive(true);
        setMicActive(true);
        setCameraError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          playVideo(videoRef.current);
        }

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

            if (cancelled || session.ended) {
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
            if (!cancelled && !session.ended) setFaceDetectionStatus("unavailable");
          }
        })();

        const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const context = new AudioCtx();
          session.audioContext = context;
          const analyser = context.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.4;
          session.analyser = analyser;
          context.createMediaStreamSource(stream).connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const detectAudio = () => {
            if (cancelled || session.ended || !session.analyser) return;
            analyser.getByteFrequencyData(data);
            const average = data.reduce((sum, value) => sum + value, 0) / data.length;
            const normalized = Math.min(100, Math.round((average / 128) * 100));
            setAudioLevel(normalized);
            const now = Date.now();
            if (normalized > 42 && now > session.cooldown) {
              session.cooldown = now + 7000;
              violationRef.current("voice_detected", "Voice or elevated noise detected by microphone proctor");
            }
            session.audioFrame = requestAnimationFrame(detectAudio);
          };
          detectAudio();
        }
      } catch {
        if (cancelled || session.ended) return;
        releaseMedia();
        setCameraActive(false);
        setMicActive(false);
        setCameraError("Camera & Microphone access is required for proctoring verification.");
        violationRef.current("media_permission_denied", "Candidate denied or has no camera/microphone access");
      }
    };
    void setup();
    const onPageHide = () => stopCamera();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onPageHide);
      releaseMedia();
    };
  }, [enabled, sessionId, releaseMedia, stopCamera]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session.ended && cameraActive && videoRef.current && session.stream) {
      videoRef.current.srcObject = session.stream;
    }
  }, [cameraActive, sessionId]);

  return {
    videoRef,
    attachVideo,
    cameraActive: enabled && cameraActive,
    micActive: enabled && micActive,
    audioLevel: enabled ? audioLevel : 0,
    cameraError,
    faceCount: enabled ? faceCount : 0,
    faceDetectionStatus: enabled ? faceDetectionStatus : "idle",
    stopCamera,
  };
}
