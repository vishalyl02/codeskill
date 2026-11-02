import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Page from "@/app/assessments/[id]/take/page";
import { studentAssessmentsAPI, runAPI } from "@/config/api";
import { clearAssessmentFaceReference, setAssessmentFaceReference } from "@/lib/assessment-face-verification";

jest.mock("react", () => ({ ...jest.requireActual("react"), use: () => ({ id: "workspace" }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("next/dynamic", () => () => function MockEditor({ value, onChange, options }: any) {
  return <textarea aria-label="Assessment code editor" value={value} readOnly={options.readOnly} onChange={event => onChange(event.target.value)} />;
});
jest.mock("@/hooks/useExecutionRuntimes", () => ({ useExecutionRuntimes: () => [] }));
jest.mock("@/config/api", () => ({
  studentAssessmentsAPI: { getOverview: jest.fn().mockResolvedValue({ data: { assessment: { proctoring: {} } } }), startAttempt: jest.fn(), submitAttempt: jest.fn(), saveProgress: jest.fn().mockResolvedValue({}), evaluateCode: jest.fn() },
  runAPI: { run: jest.fn(), getJob: jest.fn() },
}));
jest.mock("@/hooks/useAssessmentMedia", () => ({ useAssessmentMedia: () => ({
  videoRef: { current: null }, attachVideo: jest.fn(), cameraActive: true, micActive: true, audioLevel: 0,
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
  setAssessmentFaceReference("workspace", { embedding: [0.1, 0.2], capturedAt: Date.now() });
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValue({ data: { title: "Workspace check", durationMinutes: 60, startedAt: new Date().toISOString(), questions, savedResponses: [{ questionId: "coding", code: "", language: "python", selectedAnswer: -1, status: "unvisited" }] } });
  jest.mocked(studentAssessmentsAPI.submitAttempt).mockResolvedValue({} as any);
  jest.mocked(studentAssessmentsAPI.evaluateCode).mockResolvedValue({ data: { status: 'accepted', passedCount: 2, totalCount: 2, results: [{ id: 1, passed: true, output: 'hello', status: 'accepted' }, { id: 2, passed: true, isHidden: true, status: 'accepted' }] } } as any);
  jest.mocked(runAPI.run).mockResolvedValue({ data: { success: true, status: "queued", jobId: "job-1" } } as any);
  jest.mocked(runAPI.getJob).mockResolvedValue({ data: { success: true, status: "accepted", passedCount: 1, totalCount: 1, results: [{ id: "run", passed: true, stdout: "hello", output: "hello", status: "accepted" }] } } as any);
});
afterEach(() => clearAssessmentFaceReference("workspace"));

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

it("loads each question's uploaded language templates and keeps edits question-local", async () => {
  const customQuestions = [
    {
      _id: "custom-one", question: "First template", questionType: "coding", topic: "Templates",
      language: "python3", supportedLanguages: ["cpp", "java", "python3"], options: [], marks: 5,
      starterCode: [
        { language: "cpp", code: "CUSTOM_CPP_ONE" },
        { language: "java", code: "CUSTOM_JAVA_ONE" },
        { language: "python3", code: "CUSTOM_PYTHON_ONE" },
      ], testCases: [],
    },
    {
      _id: "custom-two", question: "Second template", questionType: "coding", topic: "Templates",
      language: "python3", supportedLanguages: ["cpp", "java", "python3"], options: [], marks: 5,
      starterCode: [
        { language: "cpp", code: "CUSTOM_CPP_TWO" },
        { language: "java", code: "CUSTOM_JAVA_TWO" },
        { language: "python3", code: "CUSTOM_PYTHON_TWO" },
      ], testCases: [],
    },
  ];
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValueOnce({ data: {
    title: "Template assessment", durationMinutes: 60, startedAt: new Date().toISOString(),
    questions: customQuestions,
    savedResponses: customQuestions.map((question) => ({ questionId: question._id, code: "", language: "python", status: "unvisited" })),
  } } as any);
  render(<Page params={Promise.resolve({ id: "workspace" })} />);
  fireEvent.click(screen.getByRole("button", { name: "Start workspace" }));
  await screen.findByRole("textbox", { name: "Assessment code editor" });

  const editor = await screen.findByRole("textbox", { name: "Assessment code editor" });
  expect(editor).toHaveValue("CUSTOM_PYTHON_ONE");

  fireEvent.click(screen.getByRole("button", { name: /Python 3/ }));
  fireEvent.click(screen.getByRole("button", { name: "C++ (GCC)" }));
  expect(editor).toHaveValue("CUSTOM_CPP_ONE");
  fireEvent.change(editor, { target: { value: "MY_CPP_DRAFT" } });
  fireEvent.click(screen.getByRole("button", { name: /C\+\+ \(GCC\)/ }));
  fireEvent.click(screen.getByRole("button", { name: "Java (OpenJDK)" }));
  expect(editor).toHaveValue("CUSTOM_JAVA_ONE");

  fireEvent.click(screen.getByRole("button", { name: "Question 2" }));
  expect(await screen.findByRole("textbox", { name: "Assessment code editor" })).toHaveValue("CUSTOM_PYTHON_TWO");
  fireEvent.click(screen.getByRole("button", { name: "Question 1" }));
  const restoredEditor = await screen.findByRole("textbox", { name: "Assessment code editor" });
  expect(restoredEditor).toHaveValue("CUSTOM_JAVA_ONE");
  fireEvent.click(screen.getByRole("button", { name: /Java \(OpenJDK\)/ }));
  fireEvent.click(screen.getByRole("button", { name: "C++ (GCC)" }));
  expect(restoredEditor).toHaveValue("MY_CPP_DRAFT");

  fireEvent.click(screen.getByRole("button", { name: "Reset Boilerplate" }));
  expect(restoredEditor).toHaveValue("CUSTOM_CPP_ONE");
});

it("hides C++ main from editing but sends the original driver with the edited solution", async () => {
  const starterCode = [
    "#include <iostream>",
    "int solve() { return 0; }",
    "int main() {",
    "  if (true) { std::cout << solve(); }",
    "  return 0;",
    "}",
    "",
  ].join("\n");
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValueOnce({ data: {
    title: "Driver protection", durationMinutes: 60, startedAt: new Date().toISOString(),
    questions: [{
      _id: "driver-question", question: "Edit solve", questionType: "coding", topic: "C++",
      language: "cpp", supportedLanguages: ["cpp"], options: [], marks: 5,
      hideMainMethod: true,
      starterCode: [{ language: "cpp", code: starterCode }], testCases: [],
    }],
    savedResponses: [{ questionId: "driver-question", code: "", language: "cpp", status: "unvisited" }],
  } } as any);

  render(<Page params={Promise.resolve({ id: "workspace" })} />);
  fireEvent.click(screen.getByRole("button", { name: "Start workspace" }));
  const editor = await screen.findByRole("textbox", { name: "Assessment code editor" });
  expect(editor).toHaveValue("#include <iostream>\nint solve() { return 0; }\n\n");
  expect((editor as HTMLTextAreaElement).value).not.toContain("int main()");

  fireEvent.change(editor, { target: { value: "#include <iostream>\nint solve() { return 42; }\n\n" } });
  expect(editor).toHaveValue("#include <iostream>\nint solve() { return 42; }\n\n");
  expect((editor as HTMLTextAreaElement).value).not.toContain("int main()");

  fireEvent.click(screen.getByRole("button", { name: "Custom Input" }));
  fireEvent.change(screen.getByPlaceholderText("Enter custom input lines here..."), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Run Code" }));
  await waitFor(() => expect(runAPI.run).toHaveBeenCalledWith(expect.objectContaining({
    code: expect.stringContaining("int main()"),
    language: "cpp",
  })));
  const runSource = jest.mocked(runAPI.run).mock.calls.at(-1)?.[0].code;
  expect(runSource).toContain("int solve() { return 42; }");
  expect(runSource?.match(/int main\s*\(/g)).toHaveLength(1);
  expect(runSource).toContain("if (true) { std::cout << solve(); }");

  await screen.findByText("Run successful");
  fireEvent.click(screen.getByRole("button", { name: "Submit Solution" }));
  await waitFor(() => expect(studentAssessmentsAPI.evaluateCode).toHaveBeenCalledWith("workspace", expect.objectContaining({
    questionId: "driver-question",
    code: runSource,
    language: "cpp",
  })));
});

it("hides a Python main guard while retaining it in run and submission source", async () => {
  const starterCode = "def solve():\n    return 0\n\nif __name__ == '__main__':\n    print(solve())\n";
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValueOnce({ data: {
    title: "Python driver protection", durationMinutes: 60, startedAt: new Date().toISOString(),
    questions: [{
      _id: "python-driver-question", question: "Edit solve", questionType: "coding", topic: "Python",
      language: "python", supportedLanguages: ["python"], options: [], marks: 5,
      hideMainMethod: true,
      starterCode: [{ language: "python", code: starterCode }], testCases: [],
    }],
    savedResponses: [{ questionId: "python-driver-question", code: "", language: "python", status: "unvisited" }],
  } } as any);

  render(<Page params={Promise.resolve({ id: "workspace" })} />);
  fireEvent.click(screen.getByRole("button", { name: "Start workspace" }));
  const editor = await screen.findByRole("textbox", { name: "Assessment code editor" });
  expect(editor).toHaveValue("def solve():\n    return 0\n\n");
  fireEvent.change(editor, { target: { value: "def solve():\n    return 42\n\n" } });

  fireEvent.click(screen.getByRole("button", { name: "Custom Input" }));
  fireEvent.change(screen.getByPlaceholderText("Enter custom input lines here..."), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Run Code" }));
  await waitFor(() => expect(runAPI.run).toHaveBeenCalledWith(expect.objectContaining({
    code: "def solve():\n    return 42\n\nif __name__ == '__main__':\n    print(solve())\n",
    language: "python",
  })));
  const runSource = jest.mocked(runAPI.run).mock.calls.at(-1)?.[0].code;
  expect(runSource?.match(/if __name__ == '__main__':/g)).toHaveLength(1);

  await screen.findByText("Run successful");
  fireEvent.click(screen.getByRole("button", { name: "Submit Solution" }));
  await waitFor(() => expect(studentAssessmentsAPI.evaluateCode).toHaveBeenCalledWith("workspace", expect.objectContaining({
    questionId: "python-driver-question",
    code: runSource,
    language: "python",
  })));
});

it("leaves main method visible and editable when hideMainMethod is false or undefined", async () => {
  const starterCode = [
    "#include <iostream>",
    "int main() {",
    "  std::cout << 42;",
    "  return 0;",
    "}",
  ].join("\n");
  jest.mocked(studentAssessmentsAPI.startAttempt).mockResolvedValueOnce({ data: {
    title: "Driver visible", durationMinutes: 60, startedAt: new Date().toISOString(),
    questions: [{
      _id: "visible-driver-question", question: "Full code", questionType: "coding", topic: "C++",
      language: "cpp", supportedLanguages: ["cpp"], options: [], marks: 5,
      hideMainMethod: false,
      starterCode: [{ language: "cpp", code: starterCode }], testCases: [],
    }],
    savedResponses: [{ questionId: "visible-driver-question", code: "", language: "cpp", status: "unvisited" }],
  } } as any);

  render(<Page params={Promise.resolve({ id: "workspace" })} />);
  fireEvent.click(screen.getByRole("button", { name: "Start workspace" }));
  const editor = await screen.findByRole("textbox", { name: "Assessment code editor" });
  expect(editor).toHaveValue(starterCode);
  expect((editor as HTMLTextAreaElement).value).toContain("int main()");
});

it("runs custom input, saves a coding solution, and submits the latest code with the attempt", async () => {
  await start();
  fireEvent.click(screen.getByRole("button", { name: "Question 2" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Assessment code editor" }), { target: { value: 'print(input().upper())' } });
  fireEvent.click(screen.getByRole("button", { name: "Custom Input" }));
  fireEvent.change(screen.getByPlaceholderText("Enter custom input lines here..."), { target: { value: "hello" } });
  fireEvent.click(screen.getByRole("button", { name: "Run Code" }));
  await waitFor(() => expect(runAPI.run).toHaveBeenCalledWith(expect.objectContaining({ code: 'print(input().upper())', language: "python", testCases: [{ id: "run", input: "hello", expected: "" }] })));
  await screen.findByText("Run successful");
  fireEvent.click(screen.getByRole("button", { name: "Submit Solution" }));
  await screen.findByRole("button", { name: "Question 2, current, answered" });
  expect(studentAssessmentsAPI.evaluateCode).toHaveBeenCalledWith('workspace', { questionId: 'coding', code: 'print(input().upper())', language: 'python' });
  expect(runAPI.run).toHaveBeenCalledTimes(1);
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
  jest.mocked(studentAssessmentsAPI.evaluateCode).mockRejectedValueOnce(new Error("Runner offline"));
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Submit Solution" }));
  await screen.findByText("Code saved. Execution could not be verified; try running it again.");
  expect(screen.getByText("Runner offline")).toBeInTheDocument();
  spy.mockRestore();
});

it('shows full assessment pass counts while hidden failure details remain private', async () => {
  jest.mocked(studentAssessmentsAPI.evaluateCode).mockResolvedValueOnce({ data: {
    status: 'wrong_answer', passedCount: 1, totalCount: 3, runtime: 6,
    results: [{ id: 'hidden-2', isHidden: true, passed: false, input: 'PRIVATE-INPUT', expected: 'PRIVATE-EXPECTED', output: 'PRIVATE-OUTPUT', error: 'PRIVATE-ERROR' }],
  } } as any);
  await start();
  fireEvent.click(screen.getByRole('button', { name: 'Question 2' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Submit Solution' }));
  await screen.findByRole('region', { name: 'Submission result' });
  expect(screen.getByText('1 / 3')).toBeInTheDocument();
  expect(screen.getByText(/Details are private/)).toBeInTheDocument();
  for (const value of ['PRIVATE-INPUT', 'PRIVATE-EXPECTED', 'PRIVATE-OUTPUT', 'PRIVATE-ERROR']) expect(screen.queryByText(value)).not.toBeInTheDocument();
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
