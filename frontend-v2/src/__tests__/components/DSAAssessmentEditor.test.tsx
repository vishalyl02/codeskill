import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import DSAAssessmentEditor from "@/components/assessment/DSAAssessmentEditor";
import { runAPI, studentAssessmentsAPI } from "@/config/api";

jest.mock("next/dynamic", () => () => function MockEditor({
  value, onChange,
}: { value: string; onChange: (value: string) => void }) {
  return <textarea aria-label="Code editor" value={value} onChange={(event) => onChange(event.target.value)} />;
});
jest.mock("@/context/ThemeContext", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
jest.mock("@/hooks/useExecutionRuntimes", () => ({ useExecutionRuntimes: () => [] }));
jest.mock("@/config/api", () => ({
  runAPI: { run: jest.fn(), getJob: jest.fn() },
  studentAssessmentsAPI: { evaluateCode: jest.fn() },
}));

beforeEach(() => {
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
});

it("keeps every compilation diagnostic through edits and replaces them on the next run", async () => {
  jest.useFakeTimers();
  try {
    const diagnostics = "Main.java:10: missing semicolon\nMain.java:16: unexpected token\nMain.java:20: unknown name";
    jest.mocked(runAPI.run)
      .mockResolvedValueOnce({
        data: { status: "compile_error", passedCount: 0, totalCount: 1, results: [], compileOutput: diagnostics },
      })
      .mockResolvedValueOnce({
        data: { status: "compile_error", passedCount: 0, totalCount: 1, results: [], compileOutput: "Main.java:20: unknown name" },
      });

    const onDraftChange = jest.fn();
    render(<DSAAssessmentEditor
      assessmentId="exam-1"
      question={{
        _id: "q1", questionIndex: 1, question: "Echo a value", language: "java",
        topic: "Basics", difficulty: "easy", marks: 1, starterCode: "class Main {}",
        testCases: [{ id: "abc", input: "abc", expected: "abc" }],
      }}
      onDraftChange={onDraftChange}
      onSave={jest.fn()}
    />);

    expect(screen.getByRole("button", { name: "Test Case 1" })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Run Code" })); });
    expect(screen.getByRole("heading", { name: "Compilation error" })).toBeInTheDocument();
    expect(screen.getByText(/Main.java:16: unexpected token/)).toHaveTextContent(/Main.java:10: missing semicolon.*Main.java:20: unknown name/);

    const modifiedCode = " class Main {}";
    fireEvent.change(screen.getByRole("textbox", { name: "Code editor" }), { target: { value: modifiedCode } });
    expect(onDraftChange).toHaveBeenCalledWith(modifiedCode, "java", { java: modifiedCode });
    expect(screen.getByText(/Main.java:16: unexpected token/)).toBeInTheDocument();
    expect(screen.getByText(/Showing results for the code last executed/)).toBeInTheDocument();
    expect(runAPI.run).toHaveBeenCalledTimes(1);

    act(() => { jest.advanceTimersByTime(4_000); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Run Code" })); });
    expect(runAPI.run).toHaveBeenLastCalledWith(expect.objectContaining({ code: modifiedCode, language: "java" }));
    expect(screen.queryByText(/Main.java:16: unexpected token/)).not.toBeInTheDocument();
    expect(screen.getByText("Main.java:20: unknown name")).toBeInTheDocument();
    expect(screen.queryByText(/Showing results for the code last executed/)).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

it("keeps each custom input with its output on macOS LockDown without saving a submission", async () => {
  jest.mocked(runAPI.run).mockResolvedValueOnce({
    data: { status: "accepted", passedCount: 2, totalCount: 2, results: [
      { id: "custom-2", passed: true, output: "second response" },
      { id: "custom-1", passed: true, output: "first response" },
    ] },
  });
  const onSave = jest.fn();
  render(<DSAAssessmentEditor
    macLockdown
    assessmentId="exam-1"
    question={{
      _id: "q1", questionIndex: 1, question: "Echo a value", language: "python",
      topic: "Basics", difficulty: "easy", marks: 1, starterCode: "print(input())",
    }}
    onSave={onSave}
  />);

  expect(screen.getByRole("separator", { name: "Resize code editor and test console" })).toHaveAttribute("aria-orientation", "horizontal");
  expect(screen.getByRole("tab", { name: "Test Cases" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByText("Basics")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Custom case 1 input" }), { target: { value: "first input" } });
  fireEvent.click(screen.getByRole("button", { name: "Add case" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Custom case 2 input" }), { target: { value: "second input" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Run Code" })); });

  expect(screen.getByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "true");
  expect(runAPI.run).toHaveBeenLastCalledWith(expect.objectContaining({
    testCases: [
      { id: "custom-1", input: "first input", expected: "" },
      { id: "custom-2", input: "second input", expected: "" },
    ],
  }));
  expect(screen.getByRole("heading", { name: "Accepted" })).toBeInTheDocument();
  const results = within(screen.getByRole("region", { name: "Run result" }));
  const first = results.getByRole("region", { name: "Case 1 details" });
  expect(first).toHaveTextContent("first input");
  expect(first).toHaveTextContent("first response");
  fireEvent.click(results.getByRole("button", { name: /Custom 2/ }));
  const second = results.getByRole("region", { name: "Case 2 details" });
  expect(second).toHaveTextContent("second input");
  expect(second).toHaveTextContent("second response");
  expect(results.queryByText("Expected output")).not.toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("tab", { name: "Results" }), { key: "ArrowLeft" });
  expect(screen.getByRole("textbox", { name: "Custom case 2 input" })).toHaveValue("second input");
  fireEvent.click(screen.getByRole("button", { name: "Custom 1" }));
  expect(screen.getByRole("textbox", { name: "Custom case 1 input" })).toHaveValue("first input");
});

it("keeps the existing single custom input in the standard editor", () => {
  render(<DSAAssessmentEditor
    assessmentId="exam-1"
    question={{ _id: "q1", questionIndex: 1, question: "Echo", topic: "Basics", difficulty: "easy", marks: 1 }}
    onSave={jest.fn()}
  />);
  fireEvent.click(screen.getByRole("button", { name: "Custom Input" }));
  expect(screen.getByPlaceholderText("Enter custom input lines here...")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add case" })).not.toBeInTheDocument();
});

it("shows only public cases and keeps the code when a sample becomes custom", () => {
  const onDraftChange = jest.fn();
  render(<DSAAssessmentEditor macLockdown assessmentId="exam-1"
    question={{
      _id: "q1", questionIndex: 1, question: "Echo", language: "python", starterCode: "print(input())",
      topic: "Basics", difficulty: "easy", marks: 1,
      testCases: [
        { id: "sample-1", input: "visible input", expected: "visible output" },
        { id: "hidden-1", input: "private input", expected: "private output", isHidden: true },
      ],
    }}
    onDraftChange={onDraftChange}
    onSave={jest.fn()}
  />);

  const consolePanel = within(screen.getByRole("region", { name: "Assessment test console" }));
  expect(consolePanel.getByRole("button", { name: "Run Code" })).toBeEnabled();
  expect(consolePanel.getByRole("button", { name: "Submit Solution" })).toBeEnabled();
  expect(consolePanel.getByRole("button", { name: "Case 1" })).toHaveAttribute("aria-pressed", "true");
  expect(consolePanel.queryByRole("button", { name: "Case 2" })).not.toBeInTheDocument();
  expect(consolePanel.getByText("visible output")).toBeInTheDocument();
  expect(screen.queryByText("private output")).not.toBeInTheDocument();

  const code = "print(input().strip())";
  fireEvent.change(screen.getByRole("textbox", { name: "Code editor" }), { target: { value: code } });
  fireEvent.click(consolePanel.getByRole("button", { name: "Use as custom" }));
  expect(consolePanel.getByRole("textbox", { name: "Custom case 1 input" })).toHaveValue("visible input");
  expect(screen.getByRole("textbox", { name: "Code editor" })).toHaveValue(code);
  expect(onDraftChange).toHaveBeenCalledTimes(1);
  fireEvent.click(consolePanel.getByRole("button", { name: "Remove custom case 1" }));
  expect(consolePanel.getByRole("button", { name: "Case 1" })).toHaveAttribute("aria-pressed", "true");
});

it("restores an intentionally cleared Mac draft instead of inserting the template again", () => {
  render(<DSAAssessmentEditor
    macLockdown assessmentId="exam-1"
    question={{
      _id: "q1", questionIndex: 1, question: "Echo", topic: "Basics", difficulty: "easy",
      marks: 1, starterCode: "print(input())", language: "python",
    }}
    savedResponse={{ code: "", language: "python", status: "draft" }}
    onSave={jest.fn()}
  />);
  expect(screen.getByRole("textbox", { name: "Code editor" })).toHaveValue("");
});

const macQuestion = {
  _id: "q1", questionIndex: 1, question: "Echo a value", language: "python",
  topic: "Basics", difficulty: "easy", marks: 1, starterCode: "print(input())",
  testCases: [{ id: "sample-1", input: "42", expected: "expected text" }],
};

it("shows wrong-answer output and comparison for the failed sample", async () => {
  jest.mocked(runAPI.run).mockResolvedValueOnce({ data: {
    status: "wrong_answer", passedCount: 0, totalCount: 1, runtime: 0,
    results: [{ id: "sample-1", passed: false, status: "wrong_answer", output: "actual text" }],
  } });
  render(<DSAAssessmentEditor macLockdown assessmentId="exam-1" question={macQuestion} onSave={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Run Code" }));
  expect(await screen.findByRole("heading", { name: "Wrong Answer" })).toBeInTheDocument();
  const result = within(screen.getByRole("region", { name: "Case 1 details" }));
  expect(result.getByText("42")).toBeInTheDocument();
  expect(result.getByText("actual text")).toBeInTheDocument();
  expect(result.getByText("expected text")).toBeInTheDocument();
  expect(screen.getByText("Runtime 0 ms")).toBeInTheDocument();
  fireEvent.click(result.getByRole("button", { name: "Compare output" }));
  expect(result.getByRole("button", { name: "Compare output" })).toHaveAttribute("aria-pressed", "true");
  expect(result.getByText("actual text")).toHaveClass("bg-amber-500/20");
});

it("shows the full compiler diagnostic and omits case controls for a failed compilation", async () => {
  const diagnostic = "main.cpp:12: expected expression\nmain.cpp:24: unknown identifier";
  jest.mocked(runAPI.run).mockResolvedValueOnce({ data: {
    status: "compilation_error", passedCount: 0, totalCount: 1,
    results: [{ id: "sample-1", passed: false, error: diagnostic }], compileOutput: diagnostic,
  } });
  render(<DSAAssessmentEditor macLockdown assessmentId="exam-1" question={macQuestion} onSave={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Run Code" }));
  expect(await screen.findByRole("heading", { name: "Compile Error" })).toBeInTheDocument();
  const result = within(screen.getByRole("region", { name: "Run result" }));
  expect(result.getAllByText(/main.cpp:24: unknown identifier/)).toHaveLength(1);
  expect(result.queryByRole("group", { name: "Test case results" })).not.toBeInTheDocument();
});

it("waits for the real judge result and save before confirming a Mac submission", async () => {
  jest.useFakeTimers();
  try {
    jest.mocked(studentAssessmentsAPI.evaluateCode).mockResolvedValueOnce({
      data: { status: "queued", jobId: "judge-1" },
    });
    jest.mocked(runAPI.getJob)
      .mockResolvedValueOnce({ data: { status: "running", jobId: "judge-1" } })
      .mockResolvedValueOnce({ data: { status: "accepted", passedCount: 2, totalCount: 2, results: [
        { id: "sample-1", passed: true, isHidden: false, input: "42", output: "expected text", expected: "expected text" },
        { id: "hidden-1", passed: true, isHidden: true, input: "private input", expected: "private result" },
      ] } });
    let finishSave!: () => void;
    const onSave = jest.fn(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    render(<DSAAssessmentEditor macLockdown assessmentId="exam-1" question={macQuestion} onSave={onSave} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Submit Solution" })); });
    expect(screen.getByText("Checking your submission…")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(800); });
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(onSave).toHaveBeenCalledWith("print(input())", "python", 2, 2);
    expect(screen.queryByText("Code submitted")).not.toBeInTheDocument();
    await act(async () => finishSave());
    expect(screen.getByText("Code submitted")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accepted" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Case 2/ }));
    expect(screen.getByText(/Hidden test case/)).toBeInTheDocument();
    expect(screen.queryByText("private input")).not.toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

it("leaves the draft available when the judge cannot evaluate a Mac submission", async () => {
  jest.mocked(studentAssessmentsAPI.evaluateCode).mockRejectedValueOnce(new Error("Judge is unavailable"));
  const onSave = jest.fn();
  render(<DSAAssessmentEditor macLockdown assessmentId="exam-1" question={macQuestion} onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: "Submit Solution" }));
  await waitFor(() => expect(screen.getByText("Judge is unavailable")).toBeInTheDocument());
  expect(screen.queryByText("Code submitted")).not.toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Code editor" })).toHaveValue("print(input())");
});
