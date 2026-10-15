import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Page from "@/app/assessments/[id]/take/page";
import { studentAssessmentsAPI, azureRunAPI } from "@/config/api";

jest.mock("react", () => ({ ...jest.requireActual("react"), use: () => ({ id: "workspace" }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("next/dynamic", () => () => function MockEditor({ value, onChange, options }: any) {
  return <textarea aria-label="Assessment code editor" value={value} readOnly={options.readOnly} onChange={event => onChange(event.target.value)} />;
});
jest.mock("@/hooks/useExecutionRuntimes", () => ({ useExecutionRuntimes: () => [] }));
jest.mock("@/config/api", () => ({
  studentAssessmentsAPI: { startAttempt: jest.fn(), submitAttempt: jest.fn(), saveProgress: jest.fn().mockResolvedValue({}) },
  azureRunAPI: { run: jest.fn() },
}));
jest.mock("@/hooks/useAssessmentMedia", () => ({ useAssessmentMedia: () => ({
  attachVideo: jest.fn(), cameraActive: true, micActive: true, audioLevel: 0,
  faceCount: 1, faceDetectionStatus: "active", stopCamera: jest.fn(),
}) }));
jest.mock("@/components/assessment/SafeExamBrowser", () => ({ children, onFullscreenEntered }: any) =>
  <div><button onClick={onFullscreenEntered}>Start workspace</button>{children}</div>);

const questions = [
  { _id: "mcq", question: "Choose the keyword", questionType: "MCQ", topic: "Basics", options: ["const", "other"], marks: 1 },
  { _id: "coding", question: "Echo the input", questionType: "coding", topic: "Strings", language: "python", starterCode: 'print(input())', options: [], marks: 5,
    testCases: [{ input: "hello", expected: "hello" }, { input: "secret", expected: "secret", isHidden: true }] },
  { _id: "last", question: "Choose the output", questionType: "MCQ", options: ["one", "two"], marks: 1 },
];
async function start() {
  render(<Page params={Promise.resolve({ id: "workspace" })} />);
  fireEvent.click(screen.getByRole("button", { name: "Start workspace" }));
  await screen.findByRole("region", { name: "Question statement" });
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValue({ data: { title: "Workspace check", durationMinutes: 60, startedAt: new Date().toISOString(), questions, savedResponses: [{ questionId: "coding", code: "", language: "python", selectedAnswer: -1, status: "unvisited" }] } });
  jest.mocked(studentAssessmentsAPI.submitAttempt).mockResolvedValue({} as any);
  jest.mocked(azureRunAPI.run).mockResolvedValue({ data: { passedCount: 1, totalCount: 1, results: [{ passed: true, stdout: "hello", status: "accepted" }] } } as any);
});

it("keeps MCQ answers and coding drafts across sidebar navigation and review", async () => {
  await start();
  const statement = screen.getByRole("region", { name: "Question statement" });
  expect(statement).toHaveClass("overflow-y-auto");
  expect(screen.getByRole("region", { name: "Answer options" })).toHaveClass("overflow-y-auto");
  fireEvent.click(screen.getByRole("button", { name: "A const" }));
  expect(screen.getByRole("button", { name: "Question 1, current, answered" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Question 2" }));
  const editor = await screen.findByRole("textbox", { name: "Assessment code editor" });
  expect(editor).toHaveValue("print(input())");
  fireEvent.change(editor, { target: { value: 'print("my draft")' } });
  fireEvent.keyDown(editor, { key: "ArrowRight" });
  expect(screen.getByRole("textbox", { name: "Assessment code editor" })).toHaveValue('print("my draft")');
  fireEvent.click(screen.getByRole("button", { name: "Review later" }));
  fireEvent.click(screen.getByRole("button", { name: "Question 2, marked for review" }));
  expect(await screen.findByRole("textbox", { name: "Assessment code editor" })).toHaveValue('print("my draft")');
  fireEvent.click(screen.getByRole("button", { name: "Question 1, answered" }));
  expect(screen.getByRole("button", { name: "A const" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("progressbar", { name: "Assessment progress" })).toHaveAttribute("aria-valuenow", "1");
});

it("runs custom input, saves a coding solution, and submits the latest code with the attempt", async () => {
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Question 2" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Assessment code editor" }), { target: { value: 'print(input().upper())' } });
  fireEvent.click(screen.getByRole("button", { name: "Custom Input" }));
  fireEvent.change(screen.getByPlaceholderText("Enter custom input lines here..."), { target: { value: "hello" } });
  fireEvent.click(screen.getByRole("button", { name: "Run Code" }));
  await waitFor(() => expect(azureRunAPI.run).toHaveBeenCalledWith(expect.objectContaining({ stdin: "hello", code: 'print(input().upper())', language: "python" })));
  await screen.findByText("ACCEPTED");
  fireEvent.click(screen.getByRole("button", { name: "Submit Solution" }));
  await screen.findByRole("button", { name: "Question 2, current, answered" });
  expect(azureRunAPI.run).toHaveBeenLastCalledWith(expect.objectContaining({ testCases: [{ id: "1", input: "hello", expected: "hello" }] }));
  fireEvent.click(screen.getByRole("button", { name: "Submit Test" }));
  fireEvent.click(screen.getByRole("button", { name: "Yes, Submit Now" }));
  await waitFor(() => expect(studentAssessmentsAPI.submitAttempt).toHaveBeenCalledWith("workspace", expect.objectContaining({ responses: expect.arrayContaining([
    expect.objectContaining({ questionId: "coding", code: 'print(input().upper())', status: "answered" }),
  ]) })));
});

it("preserves code when execution fails and reports that verification failed", async () => {
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Question 2" }));
  await screen.findByRole("textbox", { name: "Assessment code editor" });
  jest.mocked(azureRunAPI.run).mockRejectedValueOnce(new Error("Runner offline"));
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Submit Solution" }));
  await screen.findByText("Code saved. Execution could not be verified; try running it again.");
  expect(screen.getByText("Runner offline")).toBeInTheDocument();
  spy.mockRestore();
});

it("keeps the code and reports a failed server save truthfully", async () => {
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Question 2" }));
  const editor = await screen.findByRole("textbox", { name: "Assessment code editor" });
  fireEvent.change(editor, { target: { value: 'print("retained")' } });
  jest.mocked(studentAssessmentsAPI.saveProgress).mockRejectedValueOnce(new Error("Offline"));
  fireEvent.click(screen.getByRole("button", { name: "Submit Solution" }));
  await screen.findByText("Code kept in this session. Server save failed; please try Submit Solution again.");
  expect(screen.getByRole("textbox", { name: "Assessment code editor" })).toHaveValue('print("retained")');
});

it("unreviews an answered question without moving or clearing the selected answer", async () => {
  await start();
  fireEvent.click(screen.getByRole("button", { name: "A const" }));
  fireEvent.click(screen.getByRole("button", { name: "Review", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Question 1, marked for review" }));
  fireEvent.click(screen.getByRole("button", { name: "Unreview" }));
  expect(screen.getByRole("button", { name: "Question 1, current, answered" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "A const" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("button", { name: "Unreview" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Finish & Submit Test" })).not.toBeInTheDocument();
});

it("unreviews an unanswered question back to skipped and retains the coding draft", async () => {
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Review", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Question 1, marked for review" }));
  fireEvent.click(screen.getByRole("button", { name: "Unreview" }));
  expect(screen.getByRole("button", { name: "Question 1, current" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Question 2" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Assessment code editor" }), { target: { value: 'print("keep me")' } });
  fireEvent.click(screen.getByRole("button", { name: "Review later" }));
  fireEvent.click(screen.getByRole("button", { name: "Question 2, marked for review" }));
  fireEvent.click(screen.getByRole("button", { name: "Unreview" }));
  expect(screen.getByRole("textbox", { name: "Assessment code editor" })).toHaveValue('print("keep me")');
  expect(screen.getByRole("button", { name: "Question 2, current, answered" })).toBeInTheDocument();
});
