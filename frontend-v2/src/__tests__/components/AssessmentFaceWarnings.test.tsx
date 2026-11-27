import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Page from "@/app/assessments/[id]/take/page";
import { studentAssessmentsAPI } from "@/config/api";
import { clearAssessmentFaceReference, setAssessmentFaceReference, checkAssessmentFace } from "@/lib/assessment-face-verification";
import { isLockdownClient } from "@/lib/lockdown-bridge";

const mockStopCamera = jest.fn();
const mockRouter = { replace: jest.fn() };
const mockVideo = document.createElement("video");
Object.defineProperties(mockVideo, { readyState: { value: 2 }, videoWidth: { value: 640 }, videoHeight: { value: 480 } });
const mockVideoRef = { current: mockVideo };
let mockFaceTick: (() => void) | null = null;
let mockClockTick: (() => void) | null = null;
jest.mock("react", () => ({ ...jest.requireActual("react"), use: () => ({ id: "exam" }) }));
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("@/config/api", () => ({ studentAssessmentsAPI: {
  getOverview: jest.fn().mockResolvedValue({ data: { assessment: { proctoring: {} } } }),
  startAttempt: jest.fn(), submitAttempt: jest.fn(), saveProgress: jest.fn().mockResolvedValue({}),
} }));
jest.mock("@/lib/assessment-face-verification", () => ({
  ...jest.requireActual("@/lib/assessment-face-verification"),
  checkAssessmentFace: jest.fn(),
  prepareAssessmentFaceVerification: jest.fn(async () => {}),
}));
jest.mock("@/hooks/useAssessmentMedia", () => ({ useAssessmentMedia: () => {
  return { videoRef: mockVideoRef, attachVideo: jest.fn(), cameraActive: true, micActive: true,
    audioLevel: 0, cameraError: null, faceCount: 2, faceDetectionStatus: "active", stopCamera: mockStopCamera };
} }));
jest.mock("@/components/assessment/DSAAssessmentEditor", () => () => null);
jest.mock("@/components/assessment/SafeExamBrowser", () => ({ children, onFullscreenEntered, isEnabled }: {
  children: React.ReactNode; onFullscreenEntered?: () => void; isEnabled: boolean;
}) => <div>{isEnabled && onFullscreenEntered && <button onClick={onFullscreenEntered}>Enter Fullscreen</button>}{children}</div>);
jest.mock("@/components/assessment/LockdownUtilityDock", () => () => null);
jest.mock("@/components/assessment/LockdownMediaPermissionGate", () => ({ onReady }: { onReady: () => void }) => (
  <button onClick={onReady}>Confirm camera access</button>
));
jest.mock("@/lib/lockdown-bridge", () => ({
  ...jest.requireActual("@/lib/lockdown-bridge"),
  isLockdownClient: jest.fn(() => false),
  detectClientPlatform: () => "macos",
  consumeLockdownLaunchToken: jest.fn(async () => ({ success: true })),
  initializeLockdownAttestation: jest.fn(async () => ({ success: true, sessionId: "mac-session" })),
  listenToLockdownViolation: jest.fn(async () => () => {}),
  listenToDeepLinkLaunch: jest.fn(async () => () => {}),
}));
jest.mock("@/lib/lockdown-logger", () => ({ lockdownLogger: {
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), uploadDiagnosticsSnapshot: jest.fn(),
} }));

beforeEach(() => {
  mockFaceTick = null;
  mockClockTick = null;
  jest.mocked(isLockdownClient).mockReturnValue(false);
  jest.spyOn(window, "setInterval").mockImplementation(((callback: TimerHandler, delay?: number) => {
    if (delay === 2500 && typeof callback === "function") mockFaceTick = callback as () => void;
    if (delay === 250 && typeof callback === "function") mockClockTick = callback as () => void;
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as typeof window.setInterval);
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: jest.fn() } as any);
  jest.mocked(checkAssessmentFace).mockResolvedValue({ status: "multiple-faces" } as any);
  setAssessmentFaceReference("exam", { embedding: [0.1, 0.2], capturedAt: Date.now() });
});
afterEach(() => { clearAssessmentFaceReference("exam"); jest.restoreAllMocks(); });

it("allows four face warnings and stops media and submits all responses exactly once on the fifth", async () => {
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValue({ data: {
    startedAt: new Date().toISOString(), durationMinutes: 60,
    questions: [{ _id: "q1", question: "Choose an answer", questionType: "MCQ", options: ["Alpha", "Beta"] }],
  } });
  jest.mocked(studentAssessmentsAPI.submitAttempt).mockResolvedValue({ data: {} } as any);
  render(<Page params={Promise.resolve({ id: "exam" })} />);
  fireEvent.click(await screen.findByRole("button", { name: "Enter Fullscreen" }));
  expect(await screen.findByText("Choose an answer")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Question 1, current" })).toHaveAttribute("aria-current", "step");
  const sample = async (status: string) => {
    jest.mocked(checkAssessmentFace).mockResolvedValue({ status } as any);
    await act(async () => { mockFaceTick?.(); await Promise.resolve(); await Promise.resolve(); });
  };
  for (let warning = 0; warning < 4; warning++) {
    await sample("multiple-faces");
    await sample("multiple-faces");
    await sample("matched");
  }
  expect(screen.getByText((_, element) => element?.textContent === "4/5 warnings")).toBeInTheDocument();
  expect(studentAssessmentsAPI.submitAttempt).not.toHaveBeenCalled();
  await sample("multiple-faces");
  await sample("multiple-faces");
  expect(studentAssessmentsAPI.submitAttempt).toHaveBeenCalledTimes(1);
  expect(studentAssessmentsAPI.submitAttempt).toHaveBeenCalledWith("exam", expect.objectContaining({
    violations: expect.arrayContaining([expect.objectContaining({ type: "multiple_faces" })]),
    responses: expect.arrayContaining([expect.objectContaining({ questionId: "q1" })]),
  }));
  await waitFor(() => expect(mockStopCamera).toHaveBeenCalledTimes(1));
  expect(studentAssessmentsAPI.submitAttempt).toHaveBeenCalledTimes(1);
});

it("holds the macOS camera message through a transient mismatch and countdown renders", async () => {
  jest.mocked(isLockdownClient).mockReturnValue(true);
  jest.mocked(studentAssessmentsAPI.getOverview).mockResolvedValueOnce({ data: { assessment: {
    requireLockdown: true,
    requireCloseOtherApps: false,
    proctoring: { useCamera: true },
  } } });
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValueOnce({ data: {
    startedAt: new Date().toISOString(), durationMinutes: 60,
    questions: [{ _id: "q1", question: "Choose an answer", questionType: "MCQ", options: ["Alpha", "Beta"] }],
  } });
  render(<Page params={Promise.resolve({ id: "exam" })} />);
  fireEvent.click(await screen.findByRole("button", { name: "Confirm camera access" }));
  expect(await screen.findByText("Choose an answer")).toBeInTheDocument();
  const originalTick = mockFaceTick;
  expect(originalTick).toBeTruthy();

  const sample = async (status: string) => {
    jest.mocked(checkAssessmentFace).mockResolvedValue({ status } as any);
    await act(async () => { mockFaceTick?.(); });
  };

  await sample("match");
  expect(screen.getByText(/Face matched/)).toBeInTheDocument();
  expect(mockClockTick).toBeTruthy();
  const now = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 2_000);
  act(() => { mockClockTick?.(); });
  now.mockRestore();
  expect(mockFaceTick).toBe(originalTick);
  expect(screen.getByText(/Face matched/)).toBeInTheDocument();
  await sample("mismatch");
  expect(screen.getByText(/Face matched/)).toBeInTheDocument();
  await sample("mismatch");
  expect(screen.getByText(/does not match your identity selfie/, { selector: "span" })).toBeInTheDocument();
  await sample("match");
  expect(screen.queryByText(/Face matched/)).not.toBeInTheDocument();
  await sample("match");
  expect(screen.getByText(/Face matched/)).toBeInTheDocument();
  expect(mockFaceTick).toBe(originalTick);
});
