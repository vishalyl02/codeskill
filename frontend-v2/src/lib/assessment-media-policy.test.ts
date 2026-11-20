import { resolveAssessmentMediaRequirements } from "./assessment-media-policy";

describe("resolveAssessmentMediaRequirements", () => {
  describe("Non-proctored and disabled modes", () => {
    it("returns false for needsMediaGate when mode is non_proctored", () => {
      const result = resolveAssessmentMediaRequirements({
        mode: "non_proctored",
        proctoring: { useCamera: true, useMicrophone: true },
      });
      expect(result.needsMediaGate).toBe(false);
      expect(result.requireCamera).toBe(false);
      expect(result.requireMicrophone).toBe(false);
    });

    it("returns false when proctoring.mode is non_proctored", () => {
      const result = resolveAssessmentMediaRequirements({
        proctoring: { mode: "non_proctored", useCamera: true },
      });
      expect(result.needsMediaGate).toBe(false);
      expect(result.requireCamera).toBe(false);
      expect(result.requireMicrophone).toBe(false);
    });

    it("returns false when securityPolicy.proctoringMode is NONE", () => {
      const result = resolveAssessmentMediaRequirements({
        securityPolicy: { proctoringMode: "NONE" },
        proctoring: { useCamera: true, useMicrophone: true },
      });
      expect(result.needsMediaGate).toBe(false);
      expect(result.requireCamera).toBe(false);
      expect(result.requireMicrophone).toBe(false);
    });

    it("returns false when assessment has no proctoring configuration (default/empty)", () => {
      const result = resolveAssessmentMediaRequirements({});
      expect(result.needsMediaGate).toBe(false);
      expect(result.requireCamera).toBe(false);
      expect(result.requireMicrophone).toBe(false);
    });
  });

  describe("Camera and microphone conditional resolution", () => {
    it("enables camera when proctoring.useCamera is true", () => {
      const result = resolveAssessmentMediaRequirements({
        proctoring: { useCamera: true, useMicrophone: false },
      });
      expect(result.needsMediaGate).toBe(true);
      expect(result.requireCamera).toBe(true);
      expect(result.requireMicrophone).toBe(false);
    });

    it("enables microphone when proctoring.useMicrophone is true", () => {
      const result = resolveAssessmentMediaRequirements({
        proctoring: { useCamera: false, useMicrophone: true },
      });
      expect(result.needsMediaGate).toBe(true);
      expect(result.requireCamera).toBe(false);
      expect(result.requireMicrophone).toBe(true);
    });

    it("enables both camera and microphone when both are true", () => {
      const result = resolveAssessmentMediaRequirements({
        proctoring: { useCamera: true, useMicrophone: true },
      });
      expect(result.needsMediaGate).toBe(true);
      expect(result.requireCamera).toBe(true);
      expect(result.requireMicrophone).toBe(true);
    });

    it("supports enableWebcam and enableMicrophone aliases", () => {
      const result = resolveAssessmentMediaRequirements({
        proctoring: { enableWebcam: true, enableMicrophone: true },
      });
      expect(result.needsMediaGate).toBe(true);
      expect(result.requireCamera).toBe(true);
      expect(result.requireMicrophone).toBe(true);
    });

    it("supports requireCamera and requireMicrophone aliases", () => {
      const result = resolveAssessmentMediaRequirements({
        proctoring: { requireCamera: true, requireMicrophone: true },
      });
      expect(result.needsMediaGate).toBe(true);
      expect(result.requireCamera).toBe(true);
      expect(result.requireMicrophone).toBe(true);
    });

    it("respects explicit false even in fully_proctored mode", () => {
      const result = resolveAssessmentMediaRequirements({
        mode: "fully_proctored",
        proctoring: { useCamera: false, useMicrophone: false },
      });
      expect(result.needsMediaGate).toBe(false);
      expect(result.requireCamera).toBe(false);
      expect(result.requireMicrophone).toBe(false);
    });

    it("activates camera in fully_proctored mode when not explicitly disabled", () => {
      const result = resolveAssessmentMediaRequirements({
        mode: "fully_proctored",
        proctoring: {},
      });
      expect(result.needsMediaGate).toBe(true);
      expect(result.requireCamera).toBe(true);
    });
  });

  describe("Overrides support", () => {
    it("allows proctoringOverride to take precedence over assessment.proctoring", () => {
      const assessment = {
        proctoring: { useCamera: true, useMicrophone: true },
      };
      const override = {
        useCamera: false,
        useMicrophone: false,
      };
      const result = resolveAssessmentMediaRequirements(assessment, override);
      expect(result.needsMediaGate).toBe(false);
      expect(result.requireCamera).toBe(false);
      expect(result.requireMicrophone).toBe(false);
    });

    it("allows securityPolicyOverride to force proctoringMode NONE", () => {
      const assessment = {
        mode: "fully_proctored",
        proctoring: { useCamera: true },
      };
      const result = resolveAssessmentMediaRequirements(assessment, undefined, { proctoringMode: "NONE" });
      expect(result.needsMediaGate).toBe(false);
      expect(result.requireCamera).toBe(false);
    });
  });
});
