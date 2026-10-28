import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Page from "@/app/assessments/[id]/take/page";
import { studentAssessmentsAPI } from "@/config/api";
import { clearAssessmentFaceReference, setAssessmentFaceReference } from "@/lib/assessment-face-verification";
import { releaseAssessmentStream } from "@/lib/assessment-media-session";
const replace = jest.fn();
const mockRouter = { replace };
jest.mock("react", () => ({ ...jest.requireActual("react"), use: () => ({ id: "exam" }) }));
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("@/config/api", () => ({ studentAssessmentsAPI: { getOverview: jest.fn().mockResolvedValue({ data: { assessment: { proctoring: {} } } }), startAttempt: jest.fn(), submitAttempt: jest.fn(), saveProgress: jest.fn().mockResolvedValue({}) } }));
jest.mock("@/components/assessment/DSAAssessmentEditor", () => () => null);
jest.mock("@/components/assessment/SafeExamBrowser", () => ({ children, onTerminate, onFullscreenEntered }: { children: React.ReactNode; onTerminate: () => void; onFullscreenEntered: () => void }) => <div><button onClick={onFullscreenEntered}>Enter Fullscreen</button>{children}<button onClick={onTerminate}>Force termination</button></div>);
const getUserMedia = jest.fn();
let videoStop: jest.Mock; let audioStop: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks(); videoStop = jest.fn(); audioStop = jest.fn();
  setAssessmentFaceReference("exam", { embedding: [0.1, 0.2], capturedAt: Date.now() });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: videoStop }, { stop: audioStop }] });
  jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, "play").mockReturnValue(undefined as unknown as Promise<void>);
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValue({ data: { durationMinutes: 1, startedAt: new Date().toISOString(), questions: [{ _id: "q1", question: "Question", questionType: "MCQ", options: ["A", "B"], marks: 1, difficulty: "easy" }] } });
  jest.mocked(studentAssessmentsAPI.submitAttempt).mockImplementation(() => new Promise(() => {}));
});
afterEach(() => { releaseAssessmentStream("exam"); clearAssessmentFaceReference("exam"); jest.restoreAllMocks(); jest.useRealTimers(); });
async function renderAssessmentPage() {
  render(<Page params={Promise.resolve({ id: "exam" })} />);
  // Wait for the settings effect to settle before interacting with the assessment.
  // This keeps its final state update inside Testing Library's act boundary.
  await waitFor(() => expect(screen.queryByText("Loading assessment settings…")).not.toBeInTheDocument());
}
it("keeps both tracks active until the manual submission API resolves", async () => {
  await renderAssessmentPage();
  fireEvent.click(await screen.findByRole("button", { name: "Enter Fullscreen" }));
  await screen.findByRole("button", { name: "Submit Test" });
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Submit Test" }));
  expect(videoStop).not.toHaveBeenCalled(); // Opening confirmation does not end the session.
  fireEvent.click(screen.getByRole("button", { name: "Yes, Submit Now" }));
  expect(videoStop).not.toHaveBeenCalled(); expect(audioStop).not.toHaveBeenCalled();
  expect(studentAssessmentsAPI.submitAttempt).toHaveBeenCalledTimes(1);
});
it("keeps the attempt and media available when forced submission fails", async () => {
  jest.mocked(studentAssessmentsAPI.submitAttempt).mockRejectedValue(new Error("Network failure"));
  jest.spyOn(console, "error").mockImplementation(() => {});
  await renderAssessmentPage(); fireEvent.click(await screen.findByRole("button", { name: "Enter Fullscreen" })); await screen.findByRole("button", { name: "Force termination" });
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
  jest.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Force termination" }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  await act(async () => { await jest.runAllTimersAsync(); });
  expect(studentAssessmentsAPI.submitAttempt).toHaveBeenCalledTimes(3);
  expect(await screen.findByRole("alert")).toHaveTextContent("Your saved answers are still here");
  expect(screen.getByRole("button", { name: "Retry submission" })).toBeInTheDocument();
  const dismissBtn = screen.getByRole("button", { name: "Dismiss alert" });
  expect(dismissBtn).toBeInTheDocument();
  fireEvent.click(dismissBtn);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
  expect(videoStop).not.toHaveBeenCalled(); expect(audioStop).not.toHaveBeenCalled();
  expect(getUserMedia).toHaveBeenCalledTimes(1);
});
it("automatically dismisses the submission error alert after timeout", async () => {
  jest.mocked(studentAssessmentsAPI.submitAttempt).mockRejectedValue(new Error("Network failure"));
  jest.spyOn(console, "error").mockImplementation(() => {});
  await renderAssessmentPage(); fireEvent.click(await screen.findByRole("button", { name: "Enter Fullscreen" })); await screen.findByRole("button", { name: "Force termination" });
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
  jest.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Force termination" }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  await act(async () => { await jest.runAllTimersAsync(); });
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(8000); });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("stops media when the countdown reaches zero", async () => {
  jest.useFakeTimers();
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValueOnce({ data: { durationMinutes: 1, startedAt: new Date(Date.now() - 59000).toISOString(), questions: [{ _id: "q1", question: "Question", questionType: "MCQ", options: ["A", "B"] }] } });
  await renderAssessmentPage();
  fireEvent.click(await screen.findByRole("button", { name: "Enter Fullscreen" }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(1000));
  expect(videoStop).toHaveBeenCalledTimes(1); expect(audioStop).toHaveBeenCalledTimes(1);
  expect(studentAssessmentsAPI.submitAttempt).toHaveBeenCalledTimes(1);
});
it("auto-submits an already-expired restored session without requesting camera permission", async () => {
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValueOnce({ data: { durationMinutes: 1, startedAt: new Date(Date.now() - 65000).toISOString(), questions: [{ _id: "q1", question: "Question", questionType: "MCQ", options: ["A", "B"] }] } });
  await renderAssessmentPage();
  fireEvent.click(await screen.findByRole("button", { name: "Enter Fullscreen" }));
  await waitFor(() => expect(studentAssessmentsAPI.submitAttempt).toHaveBeenCalledTimes(1));
  expect(getUserMedia).not.toHaveBeenCalled();
});

it('never requests camera permission when the server rejects an ended or missing session', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.mocked(studentAssessmentsAPI.startAttempt).mockRejectedValueOnce(new Error('Assessment already submitted'));
  await renderAssessmentPage();
  fireEvent.click(await screen.findByRole("button", { name: "Enter Fullscreen" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("We could not start this assessment");
  expect(studentAssessmentsAPI.startAttempt).toHaveBeenCalledWith("exam");
  expect(replace).not.toHaveBeenCalled();
  expect(getUserMedia).not.toHaveBeenCalled();
});
