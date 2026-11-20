/**
 * Unified Media Requirement Policy for CodeSkill Assessments
 * 
 * Determines whether Camera and/or Microphone permissions are required
 * based on the assessment's proctoring and security policy settings.
 */

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
