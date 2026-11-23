/**
 * Unified Media Requirement Policy for CodeSkill Assessments
 * 
 * Determines whether Camera and/or Microphone permissions are required
 * based on the assessment's proctoring and security policy settings.
 */

export type AssessmentCameraSelectionPolicy = "system_default" | "student_select";

interface AssessmentMediaCapture {
  requireCamera: boolean;
  requireMicrophone: boolean;
  cameraSelectionPolicy?: AssessmentCameraSelectionPolicy;
}

interface AssessmentMediaRequest extends AssessmentMediaCapture {
  deviceId?: string;
  videoConstraints?: MediaTrackConstraints;
}

// Browsers expose a label for video inputs but no standard phone/USB transport flag.
const phoneCameraLabel = /\b(?:iphone|ipad|android|continuity camera|connected camera|phone link|link to windows|droidcam|iriun|epoccam)\b/i;
const phoneCameraMessage =
  "This assessment requires the default webcam. Disconnect the phone camera, select your built-in or USB webcam as the default, and try again.";

export class AssessmentMediaError extends Error {}

export function verifyAssessmentMediaStream(stream: MediaStream, {
  requireCamera,
  requireMicrophone,
  cameraSelectionPolicy,
}: AssessmentMediaCapture) {
  if (requireCamera) {
    const camera = stream.getVideoTracks().find((track) => track.readyState === "live");
    if (!camera) throw new AssessmentMediaError("No live camera feed is available. Reconnect your camera and try again.");
    if (cameraSelectionPolicy === "system_default" && phoneCameraLabel.test(camera.label)) {
      throw new AssessmentMediaError(phoneCameraMessage);
    }
  }

  if (requireMicrophone && !stream.getAudioTracks().some((track) => track.readyState === "live")) {
    throw new AssessmentMediaError("No live microphone input is available. Reconnect your microphone and try again.");
  }
}

export async function requestAssessmentMedia({
  requireCamera,
  requireMicrophone,
  cameraSelectionPolicy = "student_select",
  deviceId,
  videoConstraints,
}: AssessmentMediaRequest): Promise<MediaStream> {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.getUserMedia) {
    throw new AssessmentMediaError("Camera and microphone access is unavailable in this browser.");
  }

  const useDefaultCamera = cameraSelectionPolicy === "system_default";
  if (requireCamera && useDefaultCamera && mediaDevices.enumerateDevices) {
    // If permission is already granted, stop before requesting a known phone
    // camera. Check the acquired track too because labels may be hidden until then.
    const devices = await mediaDevices.enumerateDevices().catch(() => []);
    const defaultCamera = devices.find((device) => device.kind === "videoinput");
    if (defaultCamera && phoneCameraLabel.test(defaultCamera.label)) {
      throw new AssessmentMediaError(phoneCameraMessage);
    }
  }

  let video: MediaStreamConstraints["video"] = requireCamera;
  if (requireCamera && !useDefaultCamera) {
    video = {
      ...videoConstraints,
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "user" } }),
    };
  }

  const stream = await mediaDevices.getUserMedia({ video, audio: requireMicrophone });
  try {
    verifyAssessmentMediaStream(stream, { requireCamera, requireMicrophone, cameraSelectionPolicy });
    return stream;
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

export interface AssessmentMediaRequirements {
  requireCamera: boolean;
  requireMicrophone: boolean;
  needsMediaGate: boolean;
  reason: string;
}

export function resolveAssessmentMediaRequirements(
  assessment: any,
  proctoringOverride?: any,
  securityPolicyOverride?: any,
): AssessmentMediaRequirements {
  const proctoring = proctoringOverride ?? assessment?.proctoring;
  const securityPolicy = securityPolicyOverride ?? assessment?.securityPolicy;
  const mode = assessment?.mode ?? proctoring?.mode;

  // 1. Explicit unproctored or disabled overrides
  if (
    mode === "non_proctored" ||
    proctoring?.mode === "non_proctored" ||
    securityPolicy?.proctoringMode === "NONE"
  ) {
    return {
      requireCamera: false,
      requireMicrophone: false,
      needsMediaGate: false,
      reason: "Assessment is non-proctored (mode is non_proctored or proctoringMode is NONE).",
    };
  }

  // If no proctoring object, mode, or policy is present, assessment is unproctored by default
  const hasProctoringConfig = Boolean(
    (proctoring !== undefined && proctoring !== null) ||
    (mode !== undefined && mode !== null) ||
    (securityPolicy !== undefined && securityPolicy !== null)
  );

  if (!hasProctoringConfig) {
    return {
      requireCamera: false,
      requireMicrophone: false,
      needsMediaGate: false,
      reason: "No proctoring configuration specified.",
    };
  }

  // 2. Camera Requirement Resolution
  // Explicit false takes strict precedence
  const explicitCameraOff =
    proctoring?.requireCamera === false ||
    proctoring?.enableWebcam === false ||
    proctoring?.useCamera === false;

  // When proctoring is enabled/configured, camera is required by default unless explicitly turned off
  const requireCamera = !explicitCameraOff;

  // 3. Microphone Requirement Resolution
  // Explicit false takes strict precedence
  const explicitMicOff =
    proctoring?.requireMicrophone === false ||
    proctoring?.enableMicrophone === false ||
    proctoring?.useMicrophone === false;

  // Explicit true flags
  const explicitMicOn =
    proctoring?.requireMicrophone === true ||
    proctoring?.enableMicrophone === true ||
    proctoring?.useMicrophone === true;

  // Strict mode can require audio monitoring
  const modeRequiresMic =
    securityPolicy?.proctoringMode === "STRICT" &&
    proctoring?.requireMicrophone !== false;

  // Require microphone only if explicitly enabled or strict proctoring audio monitoring is enabled
  const requireMicrophone = !explicitMicOff && (explicitMicOn || modeRequiresMic);

  const needsMediaGate = requireCamera || requireMicrophone;

  return {
    requireCamera,
    requireMicrophone,
    needsMediaGate,
    reason: needsMediaGate
      ? `Media required: ${requireCamera ? "Camera" : ""}${requireCamera && requireMicrophone ? " & " : ""}${requireMicrophone ? "Microphone" : ""}`
      : "Neither camera nor microphone is required by this assessment configuration.",
  };
}
