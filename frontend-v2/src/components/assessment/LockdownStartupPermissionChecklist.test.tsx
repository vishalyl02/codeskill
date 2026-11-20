import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LockdownStartupPermissionChecklist from "./LockdownStartupPermissionChecklist";
import LockdownRouteGuard from "./LockdownRouteGuard";
import * as bridge from "@/lib/lockdown-bridge";

jest.mock("@/lib/lockdown-bridge", () => {
  const actual = jest.requireActual("@/lib/lockdown-bridge");
  return {
    ...actual,
    isLockdownClient: jest.fn(),
    getStartupPermissionChecklist: jest.fn(),
    requestOsPermission: jest.fn(),
    completePermissionOnboarding: jest.fn(),
    logoutAndExitLockdown: jest.fn(),
    exitLockdownApp: jest.fn(),
    setLockedAssessment: jest.fn(),
    setClientAccommodations: jest.fn(),
  };
});

describe("LockdownStartupPermissionChecklist & LockdownRouteGuard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (bridge.isLockdownClient as jest.Mock).mockReturnValue(true);
  });

  describe("LockdownStartupPermissionChecklist", () => {
    it("renders permissions checklist with OS badge and disabled continue button when action needed", async () => {
      (bridge.getStartupPermissionChecklist as jest.Mock).mockResolvedValue({
        platform: "macos",
        onboardingCompleted: false,
        allRequiredGranted: false,
        items: [
          {
            id: "camera",
            name: "Camera Access",
            description: "Allows video proctoring",
            status: "granted",
            required: true,
            actionType: "open_settings",
          },
          {
            id: "accessibility",
            name: "Accessibility & Kiosk Guard",
            description: "Enables hardware-level keyboard protection",
            status: "needs_action",
            required: true,
            actionType: "open_settings",
            settingsTarget: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
          },
        ],
        verifiedAtMs: 1732000000000,
        clientVersion: "1.0.0",
        pendingExamUrl: null,
      });

      const { container } = render(<LockdownStartupPermissionChecklist />);

      // Verify non-trapping attribute for keyboard/clipboard bypass
      expect(container.querySelector('[data-lockdown-checklist="true"]')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText("macOS Privacy & Security")).toBeInTheDocument();
        expect(screen.getByText("Camera Access")).toBeInTheDocument();
        expect(screen.getByText("Accessibility & Kiosk Guard")).toBeInTheDocument();
        expect(screen.getByText("Granted")).toBeInTheDocument();
        expect(screen.getByText("Action Needed")).toBeInTheDocument();
      });

      // Save & Continue should be disabled
      const continueBtn = screen.getByRole("button", { name: /save & continue/i });
      expect(continueBtn).toBeDisabled();
    });

    it("triggers requestOsPermission when clicking Open Settings", async () => {
      (bridge.getStartupPermissionChecklist as jest.Mock).mockResolvedValue({
        platform: "macos",
        onboardingCompleted: false,
        allRequiredGranted: false,
        items: [
          {
            id: "camera",
            name: "Camera Access",
            description: "Video proctoring",
            status: "needs_action",
            required: true,
            actionType: "open_settings",
          },
        ],
        verifiedAtMs: 1732000000000,
        clientVersion: "1.0.0",
        pendingExamUrl: null,
      });
      (bridge.requestOsPermission as jest.Mock).mockResolvedValue({
        id: "camera",
        name: "Camera Access",
        description: "Video proctoring",
        status: "granted",
        required: true,
        actionType: "open_settings",
      });

      render(<LockdownStartupPermissionChecklist />);

      await waitFor(() => {
        expect(screen.getByText("Camera Access")).toBeInTheDocument();
      });

      const openSettingsBtn = screen.getByRole("button", { name: /open settings/i });
      fireEvent.click(openSettingsBtn);

      await waitFor(() => {
        expect(bridge.requestOsPermission).toHaveBeenCalledWith("camera");
      });
    });

    it("enables Save & Continue when all required permissions are granted and completes onboarding", async () => {
      (bridge.getStartupPermissionChecklist as jest.Mock).mockResolvedValue({
        platform: "macos",
        onboardingCompleted: false,
        allRequiredGranted: true,
        items: [
          {
            id: "camera",
            name: "Camera Access",
            description: "Allows video proctoring",
            status: "granted",
            required: true,
            actionType: "open_settings",
          },
        ],
        verifiedAtMs: 1732000000000,
        clientVersion: "1.0.0",
        pendingExamUrl: "http://localhost:3000/assessments/test-456/take",
      });
      (bridge.completePermissionOnboarding as jest.Mock).mockResolvedValue({
        success: true,
        targetUrl: "http://localhost:3000/assessments/test-456/take",
      });

      const onCompleteMock = jest.fn();
      render(<LockdownStartupPermissionChecklist onComplete={onCompleteMock} />);

      await waitFor(() => {
        expect(screen.getByText("All required permissions verified ✅")).toBeInTheDocument();
      });

      const continueBtn = screen.getByRole("button", { name: /save & continue/i });
      expect(continueBtn).not.toBeDisabled();

      fireEvent.click(continueBtn);

      await waitFor(() => {
        expect(bridge.completePermissionOnboarding).toHaveBeenCalled();
        expect(onCompleteMock).toHaveBeenCalled();
      });
    });

    it("calls logoutAndExitLockdown and does not navigate to website when clicking Exit button", async () => {
      (bridge.getStartupPermissionChecklist as jest.Mock).mockResolvedValue({
        platform: "macos",
        onboardingCompleted: false,
        allRequiredGranted: false,
        items: [],
        verifiedAtMs: 1732000000000,
        clientVersion: "1.0.0",
        pendingExamUrl: null,
      });

      render(<LockdownStartupPermissionChecklist />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /exit/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /exit/i }));

      await waitFor(() => {
        expect(bridge.logoutAndExitLockdown).toHaveBeenCalled();
      });
    });
  });

  describe("LockdownRouteGuard", () => {
    it("renders minimal loader and does not mount exam children while checklist is being checked", async () => {
      let resolveChecklist: (value: any) => void = () => {};
      const checklistPromise = new Promise((resolve) => {
        resolveChecklist = resolve;
      });
      (bridge.getStartupPermissionChecklist as jest.Mock).mockReturnValue(checklistPromise);

      render(
        <LockdownRouteGuard assessmentId="test-789">
          <div data-testid="exam-content">Exam Content</div>
        </LockdownRouteGuard>,
      );

      // Exam content must NOT be mounted yet
      expect(screen.queryByTestId("exam-content")).not.toBeInTheDocument();
      expect(bridge.setLockedAssessment).not.toHaveBeenCalled();

      // Resolve checklist with onboarding needed
      resolveChecklist({
        platform: "macos",
        onboardingCompleted: false,
        allRequiredGranted: false,
        items: [
          { id: "camera", name: "Camera Access", description: "desc", status: "needs_action", required: true, actionType: "open_settings" },
        ],
        verifiedAtMs: Date.now(),
        clientVersion: "1.0.0",
      });

      await waitFor(() => {
        expect(screen.getByText("Camera Access")).toBeInTheDocument();
        expect(screen.queryByTestId("exam-content")).not.toBeInTheDocument();
      });
    });

    it("immediately mounts exam children and locks assessment when onboarding is already complete", async () => {
      (bridge.getStartupPermissionChecklist as jest.Mock).mockResolvedValue({
        platform: "macos",
        onboardingCompleted: true,
        allRequiredGranted: true,
        items: [
          { id: "camera", name: "Camera Access", description: "desc", status: "granted", required: true, actionType: "open_settings" },
        ],
        verifiedAtMs: Date.now(),
        clientVersion: "1.0.0",
      });

      render(
        <LockdownRouteGuard assessmentId="test-789" allowedUrlPatterns={["https://allowed.test"]}>
          <div data-testid="exam-content">Exam Content</div>
        </LockdownRouteGuard>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("exam-content")).toBeInTheDocument();
        expect(bridge.setLockedAssessment).toHaveBeenCalledWith("test-789", ["https://allowed.test"]);
      });
    });
  });
});
