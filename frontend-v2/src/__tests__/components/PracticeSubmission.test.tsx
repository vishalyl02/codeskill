import "@testing-library/jest-dom";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import Page from "@/app/problems/[id]/page";
import { problemsAPI, runAPI, submissionAPI } from "@/config/api";
import { useExecutionRuntimes } from "@/hooks/useExecutionRuntimes";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  use: () => ({ id: "feedback" }),
}));
jest.mock("@/hooks/useExecutionRuntimes", () => ({
  useExecutionRuntimes: jest.fn(() => []),
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light" }),
}));
jest.mock("@/components/pet/PracticePet", () => () => null);
jest.mock("@gsap/react", () => ({ useGSAP: () => {} }));
jest.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: ({ value, onChange }: any) => (
    <textarea
      aria-label="Practice code editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
jest.mock("react-resizable-panels", () => ({
  Panel: ({ children }: any) => <div>{children}</div>,
  Group: ({ children }: any) => <div>{children}</div>,
  Separator: () => <div />,
}));
jest.mock("@/config/api", () => ({
  problemsAPI: { getBySlug: jest.fn() },
  runAPI: { run: jest.fn(), getJob: jest.fn(), analyzeComplexity: jest.fn() },
  submissionAPI: { submitAndWait: jest.fn(), getSubmissions: jest.fn(), getResult: jest.fn(), getProblemStats: jest.fn() },
  discussionsAPI: {},
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(runAPI.run).mockReset();
  jest.mocked(runAPI.getJob).mockReset();
  jest.mocked(useExecutionRuntimes).mockReturnValue([]);
  localStorage.clear();
  localStorage.setItem("codeskill_token", "local-test-token");
  jest.mocked(submissionAPI.getProblemStats).mockResolvedValue({
    data: { problemId: "problem-1", totalSubmissions: 0, acceptedSubmissions: 0, acceptanceRate: 0, solvers: 0, acceptedSolvers: 0 },
  } as any);
  jest.mocked(submissionAPI.getSubmissions).mockResolvedValue({
    data: { data: [] },
  } as any);
  jest.mocked(submissionAPI.getResult).mockResolvedValue({ data: null } as any);
  jest.mocked(runAPI.analyzeComplexity).mockResolvedValue({
    data: {
      success: true,
      timeComplexity: "O(n)",
      spaceComplexity: "O(1)",
      explanation: "Estimated from the code structure: a single linear loop.",
      confidence: "high",
    },
  } as any);
  jest.mocked(problemsAPI.getBySlug).mockResolvedValue({
    data: {
      data: {
        _id: "problem-1",
        title: "Feedback problem",
        slug: "feedback",
        difficulty: "Easy",
        categories: [],
        statement: {
          description: "Read input and echo it.",
          samples: [{ input: "PUBLIC", output: "PUBLIC" }],
        },
        testCases: { cases: [{ input: "PUBLIC", output: "PUBLIC" }] },
        config: {
          supportedLanguages: ["javascript"],
          starterCode: { javascript: "console.log(0)" },
        },
      },
    },
  } as any);
});

it("shows sample test cases in a dedicated left-panel tab and loads one into the console", async () => {
  const response = await jest.mocked(problemsAPI.getBySlug)("feedback");
  response.data.data.statement = {
    description: "Read input and echo it.",
    samples: [
      { input: "PUBLIC", output: "PUBLIC", explanation: "identity" },
      { input: "OTHER", output: "OTHER" },
    ],
  };
  response.data.data.testCases = {
    cases: [
      { input: "PUBLIC", output: "PUBLIC", isHidden: false },
      { input: "OTHER", output: "OTHER", isHidden: false },
      { input: "SECRET", output: "SECRET", isHidden: true },
    ],
  };
  jest.mocked(problemsAPI.getBySlug).mockResolvedValue(response);
  render(<Page params={Promise.resolve({ id: "feedback" })} />);

  fireEvent.click(await screen.findByRole("button", { name: "Samples" }));
  const panel = await screen.findByText("Sample Test Cases");
  expect(panel).toBeInTheDocument();
  expect(screen.getByText("Example 1")).toBeInTheDocument();
  expect(screen.getByText("Example 2")).toBeInTheDocument();
  expect(screen.getByText("identity")).toBeInTheDocument();
  // Hidden cases never reach the candidate panel.
  expect(screen.queryByText("SECRET")).not.toBeInTheDocument();

  fireEvent.click(screen.getAllByRole("button", { name: /Load in Console/ })[1]);
  expect(screen.getByText("Case 2")).toBeInTheDocument();
});

it("falls back to public test cases when no samples are authored", async () => {
  const response = await jest.mocked(problemsAPI.getBySlug)("feedback");
  response.data.data.statement = { description: "Echo it.", samples: [] };
  response.data.data.testCases = {
    cases: [
      { input: "VISIBLE", output: "VISIBLE", isHidden: false },
      { input: "HIDDEN-CASE", output: "HIDDEN-CASE", isHidden: true },
      { input: "HIDDEN-STRING-CASE", output: "HIDDEN-STRING-CASE", isHidden: "true" },
    ],
  };
  jest.mocked(problemsAPI.getBySlug).mockResolvedValue(response);
  render(<Page params={Promise.resolve({ id: "feedback" })} />);

  fireEvent.click(await screen.findByRole("button", { name: "Samples" }));
  expect((await screen.findAllByText("VISIBLE")).length).toBeGreaterThan(0);
  expect(screen.queryByText("HIDDEN-CASE")).not.toBeInTheDocument();
  expect(screen.queryByText("HIDDEN-STRING-CASE")).not.toBeInTheDocument();
});

it("restores the candidate's saved language preference over the author default", async () => {
  const response = await jest.mocked(problemsAPI.getBySlug)("feedback");
  response.data.data.config = {
    supportedLanguages: ["python", "javascript"],
    starterCode: { python: "print(1)", javascript: "console.log(1)" },
    defaultLanguage: "javascript",
  };
  jest.mocked(problemsAPI.getBySlug).mockResolvedValue(response);
  localStorage.setItem("codeskill_lang_feedback", "python");
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  const selector = await screen.findByRole("button", {
    name: "Select programming language",
  });
  await waitFor(() => expect(selector).toHaveTextContent("Python 3"));
});

it("falls back to the author's default language when no preference is saved", async () => {
  const response = await jest.mocked(problemsAPI.getBySlug)("feedback");
  response.data.data.config = {
    supportedLanguages: ["python", "javascript"],
    starterCode: { python: "print(1)", javascript: "console.log(1)" },
    defaultLanguage: "javascript",
  };
  jest.mocked(problemsAPI.getBySlug).mockResolvedValue(response);
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  const selector = await screen.findByRole("button", {
    name: "Select programming language",
  });
  await waitFor(() => expect(selector).toHaveTextContent("JavaScript"));
});

it("selects Python automatically for a Python-only problem and submits its restored Python draft", async () => {
  const response = await jest.mocked(problemsAPI.getBySlug)("feedback");
  response.data.data.config = {
    supportedLanguages: ["python"],
    starterCode: { python: "print(input())" },
  };
  jest.mocked(problemsAPI.getBySlug).mockResolvedValue(response);
  localStorage.setItem(
    "codeskill_draft_feedback_python",
    'print("saved Python draft")',
  );
  jest
    .mocked(submissionAPI.submitAndWait)
    .mockResolvedValue({
      status: "accepted",
      passedCount: 1,
      totalCount: 1,
      results: [],
    });
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  const selector = await screen.findByRole("button", {
    name: "Select programming language",
  });
  expect(selector).toHaveTextContent("Python 3");
  await waitFor(() =>
    expect(
      screen.getByRole("textbox", { name: "Practice code editor" }),
    ).toHaveValue('print("saved Python draft")'),
  );
  fireEvent.click(selector);
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByRole("option", { name: "Python 3" })).toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: "JavaScript" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Submit", exact: true }));
  await waitFor(() =>
    expect(submissionAPI.submitAndWait).toHaveBeenCalledWith(
      {
        problemId: "problem-1",
        code: 'print("saved Python draft")',
        language: "python",
      },
      expect.any(Function),
    ),
  );
  expect(await screen.findByTestId("practice-confetti")).toBeInTheDocument();
});

it("disables execution when no enabled runtime supports the problem", async () => {
  const response = await jest.mocked(problemsAPI.getBySlug)("feedback");
  response.data.data.config = {
    supportedLanguages: ["python"],
    starterCode: { python: "print(input())" },
  };
  jest.mocked(problemsAPI.getBySlug).mockResolvedValue(response);
  jest
    .mocked(useExecutionRuntimes)
    .mockReturnValue([{ language: "python", enabled: false }]);
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  expect(
    await screen.findByRole("button", { name: "Submit", exact: true }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Run", exact: true }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Select programming language" }),
  );
  expect(
    screen.getByText("No runtime is available for this problem."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
});

it("practice Submit waits for the full verdict and reveals only failing hidden-case details", async () => {
  let finish!: (result: any) => void;
  jest.mocked(submissionAPI.submitAndWait).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Submit", exact: true }),
  );
  await screen.findByText("Waiting for a judge");
  expect(screen.queryByText("Accepted")).not.toBeInTheDocument();
  expect(screen.queryByTestId("practice-confetti")).not.toBeInTheDocument();
  expect(runAPI.run).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Run", exact: true }),
  ).toBeDisabled();
  await act(async () =>
    finish({
      status: "wrong_answer",
      passedCount: 2,
      totalCount: 3,
      runtime: 5,
      memory: 12,
      results: [
        { id: 1, passed: true, output: "DO-NOT-SHOW-PASSED" },
        {
          id: 3,
          isHidden: true,
          passed: false,
          input: "FAILED-HIDDEN-INPUT",
          expected: "EXPECTED",
          output: "ACTUAL",
        },
      ],
    }),
  );
  expect(
    await screen.findByRole("region", { name: "Submission result" }),
  ).toBeInTheDocument();
  expect(screen.getByText("2 / 3")).toBeInTheDocument();
  expect(screen.getByText("FAILED-HIDDEN-INPUT")).toBeInTheDocument();
  expect(screen.getByText("ACTUAL")).toBeInTheDocument();
  expect(screen.queryByTestId("practice-confetti")).not.toBeInTheDocument();
  expect(screen.queryByText("DO-NOT-SHOW-PASSED")).not.toBeInTheDocument();
  expect(submissionAPI.submitAndWait).toHaveBeenCalledWith(
    expect.objectContaining({ problemId: "problem-1" }),
    expect.any(Function),
  );
});

it("practice Run checks samples and displays a run result without creating a submission", async () => {
  jest.mocked(runAPI.run).mockResolvedValue({
    data: {
      success: true,
      status: "accepted",
      passedCount: 1,
      totalCount: 1,
      runtime: 4,
      results: [{ id: 1, passed: true, output: "PUBLIC", expected: "PUBLIC" }],
    },
  } as any);
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Run", exact: true }),
  );
  await screen.findByText("Test cases passed");
  expect(screen.queryByTestId("practice-confetti")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(runAPI.run).toHaveBeenCalledWith(
      expect.objectContaining({
        testCases: [{ id: 1, input: "PUBLIC", expected: "PUBLIC" }],
      }),
    ),
  );
  expect(submissionAPI.submitAndWait).not.toHaveBeenCalled();
  expect(screen.queryByText("Custom test cases passed")).not.toBeInTheDocument();
});

it("retains separate sample and custom results after one Run without submitting custom verdicts", async () => {
  jest.mocked(runAPI.run).mockImplementation(async (request: any) => ({
    data: {
      success: true, status: "accepted", passedCount: request.testCases.length,
      totalCount: request.testCases.length,
      results: request.testCases.map((test: any) => ({ id: test.id, passed: true, output: test.expected, expected: test.expected })),
    },
  }) as any);
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  fireEvent.click(await screen.findByRole("button", { name: /^Custom/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Custom test 1 input" }), { target: { value: "MY INPUT" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Custom test 1 expected output" }), { target: { value: "MY OUTPUT" } });
  fireEvent.click(screen.getByRole("button", { name: "Run", exact: true }));
  expect(await screen.findByText("Custom test cases passed")).toBeInTheDocument();
  expect(runAPI.run).toHaveBeenCalledTimes(2);
  expect(runAPI.run).toHaveBeenNthCalledWith(1, expect.objectContaining({
    testCases: [{ id: 1, input: "PUBLIC", expected: "PUBLIC" }], config: expect.objectContaining({ customInput: false }),
  }));
  expect(runAPI.run).toHaveBeenNthCalledWith(2, expect.objectContaining({
    testCases: [{ id: 1, input: "MY INPUT", expected: "MY OUTPUT" }], config: expect.objectContaining({ customInput: true }),
  }));
  fireEvent.click(screen.getByRole("button", { name: /^Samples \d/ }));
  expect(await screen.findByText("Test cases passed")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Custom/ }));
  expect(await screen.findByText("Custom test cases passed")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Results", exact: true }));
  expect(await screen.findByRole("region", { name: "Run result" })).toBeInTheDocument();
  expect(runAPI.run).toHaveBeenCalledTimes(2);
  expect(submissionAPI.submitAndWait).not.toHaveBeenCalled();
});

it("compares custom expectations in the UI while leaving the final verdict to Submit", async () => {
  jest.mocked(runAPI.run).mockImplementation(async (request: any) => ({ data: {
    success: true, status: "accepted", passedCount: request.testCases.length, totalCount: request.testCases.length,
    results: request.testCases.map((test: any) => ({ id: test.id, status: "accepted", passed: true, output: request.config.customInput ? "ACTUAL" : test.expected })),
  } }) as any);
  jest.mocked(submissionAPI.submitAndWait).mockResolvedValue({ status: "accepted", results: [] } as any);
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  fireEvent.click(await screen.findByRole("button", { name: /^Custom/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Custom test 1 input" }), { target: { value: "MY INPUT" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Custom test 1 expected output" }), { target: { value: "EXPECTED" } });
  fireEvent.click(screen.getByRole("button", { name: "Run", exact: true }));
  expect(await screen.findByText("Custom tests need attention")).toBeInTheDocument();
  expect(screen.getByText("Output differs")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Results", exact: true }));
  expect(await screen.findByRole("region", { name: "Run result" })).toHaveTextContent("0 / 1");
  fireEvent.click(screen.getByRole("button", { name: "Submit", exact: true }));
  await waitFor(() => expect(submissionAPI.submitAndWait).toHaveBeenCalledWith({ problemId: "problem-1", language: "javascript", code: "console.log(0)" }, expect.any(Function)));
  expect(await screen.findByRole("region", { name: "Submission result" })).toHaveTextContent("Accepted");
});

it.each([
  ["c", "#include <stdio.h>\nint solve(void) { return 1; }\nint main(void) { printf(\"%d\", solve()); }\n", "int main"],
  ["cpp", "#include <iostream>\nint solve() { return 1; }\nint main() { std::cout << solve(); }\n", "int main"],
  ["java", "public class Main {\n  static int solve() { return 1; }\n  public static void main(String[] args) { System.out.println(solve()); }\n}\n", "public static void main"],
  ["python", "def solve():\n    return 1\n\nif __name__ == '__main__':\n    print(solve())\n", "if __name__"],
])("preserves the hidden %s driver when editing, running and submitting", async (language, source, hiddenSignature) => {
  const response = await jest.mocked(problemsAPI.getBySlug)("feedback");
  response.data.data.config = { supportedLanguages: [language], starterCode: { [language]: source }, timeLimit: 2000, memoryLimit: 256 };
  jest.mocked(problemsAPI.getBySlug).mockResolvedValue(response);
  jest.mocked(runAPI.run).mockResolvedValue({ data: { success: true, status: "accepted", results: [{ id: 1, passed: true, output: "PUBLIC" }] } } as any);
  jest.mocked(submissionAPI.submitAndWait).mockResolvedValue({ status: "accepted", results: [] } as any);
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  const editor = await screen.findByRole("textbox", { name: "Practice code editor" });
  expect((editor as HTMLTextAreaElement).value).not.toContain(hiddenSignature);
  fireEvent.change(editor, { target: { value: (editor as HTMLTextAreaElement).value.replace("return 1", "return 2") } });
  const fullSource = source.replace("return 1", "return 2");
  fireEvent.click(screen.getByRole("button", { name: "Run", exact: true }));
  await screen.findByText("Test cases passed");
  expect(runAPI.run).toHaveBeenCalledWith(expect.objectContaining({ code: fullSource, language, config: expect.objectContaining({ timeLimit: 2000, memoryLimit: 256, customInput: false }) }));
  fireEvent.click(screen.getByRole("button", { name: "Submit", exact: true }));
  await waitFor(() => expect(submissionAPI.submitAndWait).toHaveBeenCalledWith({ problemId: "problem-1", code: fullSource, language }, expect.any(Function)));
});

it("shows compiler errors without presenting a passing-test badge", async () => {
  jest.mocked(runAPI.run).mockResolvedValue({ data: { success: false, status: "compile_error", results: [{ id: 1, passed: false, status: "compile_error", error: "Compiler diagnostic" }] } } as any);
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  fireEvent.click(await screen.findByRole("button", { name: "Run", exact: true }));
  expect(await screen.findByText("Compiler diagnostic")).toBeInTheDocument();
  expect(screen.getByText("Tests need attention")).toBeInTheDocument();
  expect(screen.queryByText("Test cases passed")).not.toBeInTheDocument();
  expect(submissionAPI.submitAndWait).not.toHaveBeenCalled();
});

it("shows live problem statistics and refetches them after a judged submission", async () => {
  jest.mocked(submissionAPI.getProblemStats).mockResolvedValue({
    data: {
      problemId: "problem-1",
      totalSubmissions: 12,
      acceptedSubmissions: 5,
      acceptanceRate: 41.7,
      solvers: 7,
      acceptedSolvers: 3,
    },
  } as any);
  jest.mocked(submissionAPI.submitAndWait).mockResolvedValue({
    status: "wrong_answer",
    passedCount: 0,
    totalCount: 1,
    results: [],
  });
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  expect(await screen.findByText("41.7% acceptance")).toBeInTheDocument();
  expect(screen.getByText("12 submissions")).toBeInTheDocument();
  expect(screen.getByText("3/7 solved")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Submit", exact: true }),
  );
  await waitFor(() =>
    expect(submissionAPI.getProblemStats).toHaveBeenCalledTimes(2),
  );
});

it("shows a no-submissions badge instead of N/A acceptance when stats are unavailable", async () => {
  jest
    .mocked(submissionAPI.getProblemStats)
    .mockRejectedValue(new Error("network offline"));
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  expect(await screen.findByText("No submissions yet")).toBeInTheDocument();
  expect(screen.queryByText(/N\/A/)).not.toBeInTheDocument();
  expect(screen.queryByText(/acceptance/)).not.toBeInTheDocument();
});

it("records submissions in the history table with expandable verdict, metrics, graph and code", async () => {
  jest.mocked(submissionAPI.getProblemStats).mockResolvedValue({
    data: {
      problemId: "problem-1",
      totalSubmissions: 6,
      acceptedSubmissions: 4,
      acceptanceRate: 66.7,
      solvers: 4,
      acceptedSolvers: 4,
    },
  } as any);
  jest.mocked(submissionAPI.submitAndWait).mockResolvedValue({
    status: "accepted",
    passedCount: 1,
    totalCount: 1,
    runtime: 21,
    memory: 3.2,
    comparison: {
      runtime: { percentile: 75, sampleSize: 4 },
      memory: { percentile: 60, sampleSize: 4 },
    },
    distribution: {
      buckets: [
        { min: 0, max: 10, count: 2 },
        { min: 10, max: 20, count: 5 },
        { min: 20, max: 40, count: 1 },
      ],
      sampleSize: 8,
    },
    results: [{ id: 1, passed: true, output: "PUBLIC", expected: "PUBLIC" }],
  });
  jest.mocked(submissionAPI.getSubmissions).mockResolvedValue({
    data: {
      data: [
        {
          id: "sub-1",
          status: "accepted",
          language: "javascript",
          code: 'console.log("solve")',
          runtime: 21,
          memory: 3.2,
          testCasesPassed: 1,
          totalTestCases: 1,
          createdAt: "2026-10-16T00:00:00.000Z",
        },
      ],
    },
  } as any);
  jest.mocked(submissionAPI.getResult).mockResolvedValue({
    data: {
      status: "accepted",
      runtime: 21,
      memory: 3.2,
      testCasesPassed: 1,
      totalTestCases: 1,
      comparison: {
        runtime: { percentile: 75, sampleSize: 4 },
        memory: { percentile: 60, sampleSize: 4 },
      },
      distribution: {
        buckets: [
          { min: 0, max: 10, count: 2 },
          { min: 10, max: 20, count: 5 },
          { min: 20, max: 40, count: 1 },
        ],
        sampleSize: 8,
      },
      testResults: [{ id: 1, passed: true, output: "PUBLIC", expected: "PUBLIC" }],
    },
  } as any);
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Submit", exact: true }),
  );
  // No result modal — the submission lands in the history table, expanded.
  expect(await screen.findByText("✓ Accepted")).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Submission result" })).not.toBeInTheDocument();
  expect(await screen.findByText("Runtime Distribution")).toBeInTheDocument();
  expect(screen.getByText(/You · 21 ms/)).toBeInTheDocument();
  expect(screen.getByText(/faster than 75% of 4 students/)).toBeInTheDocument();
  expect(screen.getByText(/lighter than 60% of 4 students/)).toBeInTheDocument();
  expect(screen.getByText("O(n)")).toBeInTheDocument();
  expect(screen.getByText("O(1)")).toBeInTheDocument();
  expect(screen.getByText(/single linear loop/)).toBeInTheDocument();
  expect(screen.getByText('console.log("solve")')).toBeInTheDocument();
  expect(screen.getByTestId("practice-confetti")).toBeInTheDocument();
  expect(runAPI.analyzeComplexity).toHaveBeenCalledWith({
    code: 'console.log("solve")',
    language: "javascript",
  });
});

it("expanded submission always shows the runtime distribution graph, even without peer data", async () => {
  jest.mocked(submissionAPI.submitAndWait).mockResolvedValue({
    status: "accepted",
    passedCount: 1,
    totalCount: 1,
    runtime: 21,
    memory: 3.2,
    comparison: null,
    results: [{ id: 1, passed: true, output: "PUBLIC", expected: "PUBLIC" }],
  });
  jest.mocked(submissionAPI.getSubmissions).mockResolvedValue({
    data: {
      data: [
        {
          id: "sub-1",
          status: "accepted",
          language: "javascript",
          code: "console.log(0)",
          runtime: 21,
          memory: 3.2,
          testCasesPassed: 1,
          totalTestCases: 1,
          createdAt: "2026-10-16T00:00:00.000Z",
        },
      ],
    },
  } as any);
  jest.mocked(submissionAPI.getResult).mockResolvedValue({
    data: {
      status: "accepted",
      runtime: 21,
      memory: 3.2,
      testCasesPassed: 1,
      totalTestCases: 1,
      comparison: null,
      distribution: null,
      testResults: [],
    },
  } as any);
  render(<Page params={Promise.resolve({ id: "feedback" })} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Submit", exact: true }),
  );
  expect(await screen.findByText("Runtime Distribution")).toBeInTheDocument();
  expect(screen.getByText("no peer solutions yet")).toBeInTheDocument();
  expect(screen.getByText(/You · 21 ms/)).toBeInTheDocument();
  expect(screen.getByTitle("20–40 ms: 1 solution")).toBeInTheDocument();
  expect(screen.getByText(/the chart fills in as other candidates submit/)).toBeInTheDocument();
});
