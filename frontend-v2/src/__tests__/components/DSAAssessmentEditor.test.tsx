import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import DSAAssessmentEditor from "@/components/assessment/DSAAssessmentEditor";
import { runAPI } from "@/config/api";

jest.mock("next/dynamic", () => () => function MockEditor({
  value, onChange,
}: { value: string; onChange: (value: string) => void }) {
  return <textarea aria-label="Code editor" value={value} onChange={(event) => onChange(event.target.value)} />;
});
jest.mock("@/context/ThemeContext", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
jest.mock("@/hooks/useExecutionRuntimes", () => ({ useExecutionRuntimes: () => [] }));
jest.mock("@/config/api", () => ({ runAPI: { run: jest.fn(), getJob: jest.fn() } }));

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
