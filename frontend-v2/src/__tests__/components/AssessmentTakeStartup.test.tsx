import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TakeAssessmentPage from "@/app/assessments/[id]/take/page";
import { studentAssessmentsAPI } from "@/config/api";
import { offlineAutosaveQueue } from "@/lib/offline-autosave-queue";
import { lockdownLogger } from "@/lib/lockdown-logger";
import {
  consumeLockdownLaunchToken, detectClientPlatform, engageOsKiosk, initializeLockdownAttestation, isLockdownClient, listNonEssentialApps,
} from "@/lib/lockdown-bridge";

const { renderToString } = jest.requireActual<typeof import("react-dom/server")>("react-dom/server.node");

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock("react", () => ({ ...jest.requireActual("react"), use: () => ({ id: "exam" }) }));
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter, usePathname: () => "/assessments/exam/take" }));
jest.mock("@/context/AuthContext", () => ({ __esModule: true, default: jest.requireActual("react").createContext(null) }));
jest.mock("@/config/api", () => ({ __esModule: true, default: {}, studentAssessmentsAPI: {
  getOverview: jest.fn(), startAttempt: jest.fn(),
} }));
jest.mock("@/lib/offline-autosave-queue", () => ({ offlineAutosaveQueue: {
  onStatusChange: () => () => {}, hydrate: jest.fn(), enqueue: jest.fn(),
} }));
jest.mock("@/lib/lockdown-bridge", () => ({
  ...jest.requireActual("@/lib/lockdown-bridge"),
  isLockdownClient: jest.fn(),
  detectClientPlatform: jest.fn(),
  consumeLockdownLaunchToken: jest.fn(async (_api, _id, options) => options?.deferAttestation
    ? { success: true }
    : { success: true, attestation: { success: true, sessionId: "test" } }),
  initializeLockdownAttestation: jest.fn(async () => ({ success: true, sessionId: "test" })),
  listenToLockdownViolation: () => Promise.resolve(() => {}),
  listenToDeepLinkLaunch: () => Promise.resolve(() => {}),
  engageOsKiosk: jest.fn(async () => {}),
  listNonEssentialApps: jest.fn(async () => []),
  getStartupPermissionChecklist: () => Promise.resolve({ onboardingCompleted: true, allRequiredGranted: true }),
}));
jest.mock("@/components/assessment/LockdownMediaPermissionGate", () => ({ onReady }: { onReady: () => void }) => (
  <button onClick={onReady}>Confirm camera access</button>
));
jest.mock("@/components/assessment/LockdownUtilityDock", () => () => null);
jest.mock("@/components/assessment/DSAAssessmentEditor", () => function MockEditor({
  onDraftChange, macLockdown, savedResponse,
}: { onDraftChange: (code: string, language: string, codeByLanguage?: Record<string, string>) => void; macLockdown: boolean; savedResponse?: { status?: string; code?: string } }) {
  return <>
    <button data-draft-status={savedResponse?.status} data-saved-code={savedResponse?.code}
      onClick={() => onDraftChange("", "python")}>Clear code in {macLockdown ? "Mac" : "standard"} editor</button>
    <button onClick={() => onDraftChange("print(42)", "python", { python: "print(42)" })}>Type new source</button>
  </>;
});
jest.mock("@/components/assessment/SafeExamBrowser", () => ({ children, isEnabled, onFullscreenEntered }: {
  children: React.ReactNode; isEnabled: boolean; onFullscreenEntered?: () => void;
}) => <>{isEnabled && onFullscreenEntered && <button onClick={onFullscreenEntered}>Enter fullscreen</button>}{children}</>);
jest.mock("@/hooks/useAssessmentMedia", () => ({ useAssessmentMedia: () => ({}) }));
jest.mock("@/lib/lockdown-logger", () => ({ lockdownLogger: {
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), uploadDiagnosticsSnapshot: jest.fn(),
} }));

const overview = {
  data: { assessment: {
    questionCount: 1, requireLockdown: true, requireCloseOtherApps: false, proctoring: { mode: "non_proctored" },
  } },
};

const attempt = {
  data: {
    startedAt: new Date().toISOString(),
    durationMinutes: 30,
    questions: [{ _id: "q1", question: "What is two plus two?", questionType: "mcq", options: ["3", "4"] }],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(studentAssessmentsAPI.getOverview).mockReset();
  jest.mocked(studentAssessmentsAPI.startAttempt).mockReset();
  window.sessionStorage.clear();
  jest.mocked(isLockdownClient).mockReturnValue(true);
  jest.mocked(detectClientPlatform).mockReturnValue("windows");
});

it("offers recovery after the bounded Mac settings retries are exhausted", async () => {
  jest.mocked(detectClientPlatform).mockReturnValue("macos");
  jest.mocked(studentAssessmentsAPI.getOverview)
    .mockRejectedValueOnce({ response: { status: 503 } })
    .mockRejectedValueOnce({ response: { status: 503 } })
    .mockRejectedValueOnce({ response: { status: 503 } })
    .mockResolvedValueOnce(overview);
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValueOnce(attempt);

  render(<TakeAssessmentPage params={Promise.resolve({ id: "exam" })} />);

  expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("could not reach the assessment service");
  expect(studentAssessmentsAPI.startAttempt).not.toHaveBeenCalled();
  expect(offlineAutosaveQueue.hydrate).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("What is two plus two?")).toBeInTheDocument();
  expect(studentAssessmentsAPI.startAttempt).toHaveBeenCalledTimes(1);
  expect(offlineAutosaveQueue.hydrate).toHaveBeenCalledWith("exam");
});

it("allows retry when the Mac attempt starts without any questions", async () => {
  jest.mocked(detectClientPlatform).mockReturnValue("macos");
  jest.mocked(studentAssessmentsAPI.getOverview).mockResolvedValueOnce(overview);
  jest.mocked(studentAssessmentsAPI.startAttempt)
    .mockResolvedValueOnce({ data: { questions: [] } })
    .mockResolvedValueOnce(attempt);

  render(<TakeAssessmentPage params={Promise.resolve({ id: "exam" })} />);

  expect(await screen.findByRole("alert")).toHaveTextContent("did not receive any questions");
  expect(offlineAutosaveQueue.hydrate).not.toHaveBeenCalled();
  expect(studentAssessmentsAPI.startAttempt).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("What is two plus two?")).toBeInTheDocument();
  expect(studentAssessmentsAPI.startAttempt).toHaveBeenCalledTimes(2);
});


it("hydrates the loading shell before initializing the active LockDown webview", async () => {
  jest.mocked(studentAssessmentsAPI.getOverview).mockResolvedValueOnce(overview);
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValueOnce(attempt);
  const page = <TakeAssessmentPage params={Promise.resolve({ id: "exam" })} />;
  const container = document.body.appendChild(document.createElement("div"));
  container.innerHTML = renderToString(page);
  expect(container).toHaveTextContent("Loading assessment settings…");
  expect(studentAssessmentsAPI.getOverview).not.toHaveBeenCalled();
  const onRecoverableError = jest.fn();

  render(page, { container, hydrate: true, onRecoverableError });

  expect(await screen.findByText("What is two plus two?")).toBeInTheDocument();
  expect(onRecoverableError).not.toHaveBeenCalled();
});

it("returns a camera-required LockDown launch to briefing before starting", async () => {
  jest.mocked(studentAssessmentsAPI.getOverview).mockResolvedValueOnce({
    data: { assessment: { ...overview.data.assessment, proctoring: { requireCamera: true } } },
  });
  render(<TakeAssessmentPage params={Promise.resolve({ id: "exam" })} />);
  fireEvent.click(await screen.findByRole("button", { name: "Confirm camera access" }));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/assessments/exam"));
  expect(studentAssessmentsAPI.startAttempt).not.toHaveBeenCalled();
});

it("recovers the macOS LockDown settings read and starts once through the existing LockDown flow", async () => {
  jest.mocked(detectClientPlatform).mockReturnValue("macos");
  jest.mocked(studentAssessmentsAPI.getOverview)
    .mockRejectedValueOnce({ response: { status: 503 } })
    .mockResolvedValueOnce(overview);
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValueOnce(attempt);

  render(<TakeAssessmentPage params={Promise.resolve({ id: "exam" })} />);

  expect(await screen.findByText("What is two plus two?")).toBeInTheDocument();
  expect(studentAssessmentsAPI.getOverview).toHaveBeenCalledTimes(2);
  expect(consumeLockdownLaunchToken).toHaveBeenCalledWith(expect.anything(), "exam");
  expect(initializeLockdownAttestation).not.toHaveBeenCalled();
  expect(listNonEssentialApps).not.toHaveBeenCalled();
  expect(engageOsKiosk).toHaveBeenCalledTimes(1);
  expect(studentAssessmentsAPI.startAttempt).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  const header = screen.getByRole("banner");
  expect(within(header).queryByText("LockDown Active")).not.toBeInTheDocument();
  expect(within(header).getByRole("button", { name: "Previous question" })).toBeDisabled();
  expect(within(header).getByRole("button", { name: "Next question" })).toBeDisabled();
  expect(within(header).queryByText("Saved")).not.toBeInTheDocument();
  expect(within(header).queryByRole("button", { name: /fullscreen/i })).not.toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "Assessment navigation and actions" })).getByText("Saved")).toBeInTheDocument();
});

it.each([
  { platform: "macos" as const, lockdown: true, expectedStatus: "answered", editor: "Mac" },
  { platform: "windows" as const, lockdown: true, expectedStatus: "draft", editor: "standard" },
  { platform: "macos" as const, lockdown: false, expectedStatus: "draft", editor: "standard" },
])("scopes submission tick persistence to macOS LockDown ($platform, native $lockdown)", async ({
  platform, lockdown, expectedStatus, editor,
}) => {
  jest.mocked(detectClientPlatform).mockReturnValue(platform);
  jest.mocked(isLockdownClient).mockReturnValue(lockdown);
  jest.mocked(studentAssessmentsAPI.getOverview).mockResolvedValueOnce({
    data: { assessment: { ...overview.data.assessment, requireLockdown: lockdown } },
  });
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValueOnce({
    data: {
      ...attempt.data,
      questions: [{ _id: "q1", question: "Write a solution", questionType: "coding", starterCode: "print(1)" }],
      savedResponses: [{ questionId: "q1", code: "print(2)", language: "python", status: "answered", testCasesPassed: 3, totalTestCases: 4 }],
    },
  });

  render(<TakeAssessmentPage params={Promise.resolve({ id: "exam" })} />);
  if (!lockdown) fireEvent.click(await screen.findByRole("button", { name: "Enter fullscreen" }));
  expect(await screen.findByRole("button", { name: "Question 1, current, answered" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear code in " + editor + " editor" }));

  await waitFor(() => expect(offlineAutosaveQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
    payload: expect.objectContaining({
      responses: [expect.objectContaining({ code: "", status: expectedStatus })],
    }),
  })));
  expect(screen.getByRole("button", {
    name: expectedStatus === "answered" ? "Question 1, current, answered" : "Question 1, current",
  })).toBeInTheDocument();
});

it("moves between Mac questions from the header and flushes the draft on navigation", async () => {
  jest.mocked(detectClientPlatform).mockReturnValue("macos");
  jest.mocked(studentAssessmentsAPI.getOverview).mockResolvedValueOnce({
    data: { assessment: { ...overview.data.assessment, questionCount: 2 } },
  });
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValueOnce({
    data: { ...attempt.data, questions: [
      { _id: "q1", question: "Write a solution", questionType: "coding", starterCode: "print(1)", topic: "Internal category" },
      { _id: "q2", question: "Choose a value", questionType: "mcq", options: ["A", "B"] },
    ] },
  });

  render(<TakeAssessmentPage params={Promise.resolve({ id: "exam" })} />);
  const header = within(await screen.findByRole("banner"));
  const next = header.getByRole("button", { name: "Next question" });
  expect(header.queryByText("Internal category")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear code in Mac editor" }));
  fireEvent.click(next);
  expect(await screen.findByText("Choose a value")).toBeInTheDocument();
  fireEvent.click(header.getByRole("button", { name: "Previous question" }));
  expect(screen.getByRole("button", { name: "Clear code in Mac editor" })).toHaveAttribute("data-draft-status", "draft");
});

it("restores an edit made immediately before refresh only for the same Mac attempt", async () => {
  jest.mocked(detectClientPlatform).mockReturnValue("macos");
  const arrange = (attemptId: string) => {
    jest.mocked(studentAssessmentsAPI.getOverview).mockResolvedValueOnce(overview);
    jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValueOnce({
      data: { ...attempt.data, attemptId, questions: [
        { _id: "q1", question: "Write a solution", questionType: "coding", starterCode: "print(1)" },
      ], savedResponses: [{ questionId: "q1", code: "print(1)", language: "python", status: "draft" }] },
    });
  };

  arrange("attempt-a");
  const first = render(<TakeAssessmentPage params={Promise.resolve({ id: "exam" })} />);
  fireEvent.click(await screen.findByRole("button", { name: "Type new source" }));
  first.unmount();
  expect(offlineAutosaveQueue.enqueue).not.toHaveBeenCalled();

  arrange("attempt-a");
  const refreshed = render(<TakeAssessmentPage params={Promise.resolve({ id: "exam" })} />);
  expect(await screen.findByRole("button", { name: "Clear code in Mac editor" })).toHaveAttribute("data-saved-code", "print(42)");
  refreshed.unmount();

  arrange("attempt-b");
  render(<TakeAssessmentPage params={Promise.resolve({ id: "exam" })} />);
  expect(await screen.findByRole("button", { name: "Clear code in Mac editor" })).toHaveAttribute("data-saved-code", "print(1)");
});

it("retries a rate-limited Mac start without flashing the retry screen", async () => {
  jest.mocked(detectClientPlatform).mockReturnValue("macos");
  jest.mocked(studentAssessmentsAPI.getOverview).mockResolvedValueOnce(overview);
  jest.mocked(studentAssessmentsAPI.startAttempt)
    .mockRejectedValueOnce({ response: { status: 429 } })
    .mockResolvedValueOnce(attempt);
  render(<TakeAssessmentPage params={Promise.resolve({ id: "exam" })} />);
  await waitFor(() => expect(studentAssessmentsAPI.startAttempt).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(await screen.findByText("What is two plus two?")).toBeInTheDocument();
  expect(studentAssessmentsAPI.startAttempt).toHaveBeenCalledTimes(2);
});
