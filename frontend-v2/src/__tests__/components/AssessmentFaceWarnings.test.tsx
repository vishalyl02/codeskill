import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Page from "@/app/assessments/[id]/take/page";
import { studentAssessmentsAPI } from "@/config/api";

const mockStopCamera = jest.fn();
const mockRouter = { replace: jest.fn() };
let mockViolation: (type: string, details: string) => void;
jest.mock("react", () => ({ ...jest.requireActual("react"), use: () => ({ id: "exam" }) }));
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("@/config/api", () => ({ studentAssessmentsAPI: {
  startAttempt: jest.fn(), submitAttempt: jest.fn(), saveProgress: jest.fn().mockResolvedValue({}),
} }));
jest.mock("@/hooks/useAssessmentMedia", () => ({ useAssessmentMedia: (_id: string, _enabled: boolean, callback: typeof mockViolation) => {
  mockViolation = callback;
  return { videoRef: { current: null }, attachVideo: jest.fn(), cameraActive: true, micActive: true,
    audioLevel: 0, cameraError: null, faceCount: 2, faceDetectionStatus: "active", stopCamera: mockStopCamera };
} }));
jest.mock("@/components/assessment/DSAAssessmentEditor", () => () => null);
jest.mock("@/components/assessment/SafeExamBrowser", () => ({ children, onFullscreenEntered }: {
  children: React.ReactNode; onFullscreenEntered: () => void;
}) => <div><button onClick={onFullscreenEntered}>Enter Fullscreen</button>{children}</div>);

it("allows four face warnings and stops media and submits all responses exactly once on the fifth", async () => {
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValue({ data: {
    startedAt: new Date().toISOString(), durationMinutes: 60,
    questions: [{ _id: "q1", question: "Choose an answer", questionType: "MCQ", options: ["Alpha", "Beta"] }],
  } });
  jest.mocked(studentAssessmentsAPI.submitAttempt).mockImplementation(() => new Promise(() => {}));
  render(<Page params={Promise.resolve({ id: "exam" })} />);
  fireEvent.click(screen.getByRole("button", { name: "Enter Fullscreen" }));
  await screen.findByText("Choose an answer");
  expect(screen.getByRole("button", { name: "Question 1, current" })).toHaveAttribute("aria-current", "step");
  for (let i = 0; i < 4; i++) {
    act(() => mockViolation("multiple_faces_detected", "Two faces detected"));
  }
  expect(screen.getByText("4 / 5")).toBeInTheDocument();
  expect(studentAssessmentsAPI.submitAttempt).not.toHaveBeenCalled();
  act(() => mockViolation("voice_detected", "Noise detected"));
  expect(studentAssessmentsAPI.submitAttempt).not.toHaveBeenCalled();
  act(() => mockViolation("multiple_faces_detected", "Two faces detected"));
  await waitFor(() => expect(studentAssessmentsAPI.submitAttempt).toHaveBeenCalledTimes(1));
  expect(mockStopCamera).toHaveBeenCalledTimes(1);
  expect(studentAssessmentsAPI.submitAttempt).toHaveBeenCalledWith("exam", expect.objectContaining({
    violations: expect.arrayContaining([expect.objectContaining({ type: "multiple_faces_detected" })]),
    responses: expect.arrayContaining([expect.objectContaining({ questionId: "q1" })]),
  }));
  act(() => mockViolation("multiple_faces_detected", "Two faces detected"));
  expect(studentAssessmentsAPI.submitAttempt).toHaveBeenCalledTimes(1);
});
