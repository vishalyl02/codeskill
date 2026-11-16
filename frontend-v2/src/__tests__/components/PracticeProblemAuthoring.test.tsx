import React from "react";
import "@testing-library/jest-dom";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import PracticeProblemEditor from "@/components/admin/PracticeProblemEditor";
import ImportPracticeProblemPage from "@/app/admin/problems/import/page";
import { adminProblemsAPI, adminQuestionsAPI } from "@/config/api";
import { useQuestionStore } from "@/app/admin/questions/create/_store/useQuestionStore";
import { practiceDraft } from "@/lib/practice-problem-editor";

const push = jest.fn();
let query = "";
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(query),
}));
jest.mock("@/config/api", () => ({
  adminProblemsAPI: {
    create: jest.fn(),
    update: jest.fn(),
    getById: jest.fn(),
    delete: jest.fn(),
  },
  adminQuestionsAPI: {
    getById: jest.fn(),
    getAll: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock("next/dynamic", () => (loader: any) => {
  return function DynamicComponent(props: any) {
    const Editor = require("@monaco-editor/react").default;
    return <Editor {...props} />;
  };
});
jest.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="Code editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const bankQuestion = {
  id: "bank-1",
  questionType: "coding",
  question: "Sum of two numbers",
  slug: "sum",
  difficulty: "easy",
  problemStatement: "Read two integers and print their sum.",
  constraints: ["-100 <= a, b <= 100"],
  inputFormat: "Two integers",
  outputFormat: "Their sum",
  topic: "Math",
  tags: ["arithmetic"],
  supportedLanguages: ["python3", "cpp"],
  language: "cpp",
  timeLimit: 1500,
  memoryLimit: 128,
  starterCode: [{ language: "cpp", code: "// begin" }],
  referenceSolutions: [{ language: "cpp", sourceCode: "// private solution" }],
  testCases: [
    {
      id: "public",
      input: "1 2",
      expectedOutput: "3",
      isHidden: false,
      weight: 1,
    },
    {
      id: "hidden",
      input: "99 100",
      expectedOutput: "199",
      isHidden: true,
      weight: 3,
    },
  ],
  examples: [{ input: "1 2", output: "3", explanation: "Add both numbers" }],
};

beforeEach(() => {
  jest.clearAllMocks();
  query = "";
  useQuestionStore.getState().resetStore();
  jest.mocked(adminProblemsAPI.create).mockResolvedValue({ data: {} } as never);
  jest.mocked(adminProblemsAPI.update).mockResolvedValue({ data: {} } as never);
  HTMLElement.prototype.scrollIntoView = jest.fn();
});

function statement(container: HTMLElement) {
  return within(container.querySelector("#statement")!).getByRole("textbox");
}

it("imports legacy statements without promoting an explicitly hidden example", () => {
  const draft = practiceDraft({
    questionType: "algorithmic", question: "Read two numbers and print their sum.",
    testCases: [{ input: "secret input", expectedOutput: "secret output", isHidden: true }],
    examples: [{ input: "secret input", output: "secret output" }],
  }, true);
  expect(draft.statement?.description).toBe("Read two numbers and print their sum.");
  expect(draft.testCases).toHaveLength(1);
  expect(draft.testCases?.[0].isHidden).toBe(true);
});

it("creates a practice problem using the bank sections without changing a bank draft", async () => {
  useQuestionStore
    .getState()
    .updateMetadata({ title: "Unsaved bank draft", questionType: "MCQ" });
  const { container } = render(<PracticeProblemEditor />);
  expect(screen.getByRole("combobox", { name: "Question Type" })).toHaveValue(
    "DSA",
  );
  expect(
    screen.getByRole("combobox", { name: "Question Type" }),
  ).toBeDisabled();
  expect(screen.queryByRole("heading", { name: "Compiler / Runtime Versions" })).not.toBeInTheDocument();
  for (const name of [
    "Basic Information",
    "Programming Languages",
    "Execution Settings",
    "Problem Statement",
    "Constraints",
    "Input & Output Format",
    "Starter Code",
    "Reference Solution",
    "Test Cases",
    "Publishing",
  ]) {
    expect(screen.getByRole("heading", { name })).toBeInTheDocument();
  }
  fireEvent.change(screen.getByLabelText("Question Title"), {
    target: { value: "New Practice" },
  });
  fireEvent.change(statement(container), {
    target: { value: "Print the provided integer." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
  await waitFor(() =>
    expect(adminProblemsAPI.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          title: "New Practice",
          slug: "new-practice",
          visibility: "Draft",
        }),
        statement: expect.objectContaining({
          description: "Print the provided integer.",
        }),
      }),
    ),
  );
  expect(push).toHaveBeenCalledWith("/admin/problems");
  expect(useQuestionStore.getState().metadata.title).toBe("Unsaved bank draft");
  expect(useQuestionStore.getState().metadata.questionType).toBe("MCQ");
});

it("imports, edits, and publishes an independent copy with private tests and reference code", async () => {
  query = "fromQuestion=bank-1";
  jest
    .mocked(adminQuestionsAPI.getById)
    .mockResolvedValue({ data: bankQuestion } as never);
  render(<PracticeProblemEditor />);
  expect(await screen.findByText("Imported from Question Bank.")).toBeVisible();
  expect(screen.getByLabelText("URL Slug")).toHaveValue("sum-practice");
  expect(screen.getByLabelText("Practice visibility")).toHaveValue("Draft");
  expect(screen.getByLabelText("Test case 2 expected output")).toHaveValue(
    "199",
  );
  fireEvent.change(screen.getByLabelText("Question Title"), {
    target: { value: "Sum Practice Copy" },
  });
  fireEvent.change(screen.getByLabelText("Test case 2 expected output"), {
    target: { value: "200" },
  });
  fireEvent.change(screen.getByLabelText("Default Language"), {
    target: { value: "python3" },
  });
  fireEvent.change(screen.getByLabelText("Practice visibility"), {
    target: { value: "Published" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish Problem" }));
  await waitFor(() =>
    expect(adminProblemsAPI.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          title: "Sum Practice Copy",
          visibility: "Published",
        }),
        languages: ["python3", "cpp"],
        defaultLanguage: "python3",
        execution: expect.objectContaining({
          timeLimit: 1500,
          memoryLimit: 128,
        }),
        starterCode: { cpp: "// begin" },
        referenceSolution: { cpp: "// private solution" },
        sampleExamples: [
          { input: "1 2", output: "3", explanation: "Add both numbers" },
        ],
        testCases: {
          cases: [
            expect.objectContaining({ output: "3", isHidden: false }),
            expect.objectContaining({
              output: "200",
              isHidden: true,
              weight: 3,
            }),
          ],
        },
      }),
    ),
  );
  expect(adminQuestionsAPI.update).not.toHaveBeenCalled();
  expect(bankQuestion.testCases[1].expectedOutput).toBe("199");
});

it("loads an existing practice problem and saves default language changes without dropping reference code", async () => {
  jest.mocked(adminProblemsAPI.getById).mockResolvedValue({
    data: {
      id: "practice-1",
      title: "Existing",
      slug: "existing",
      visibility: "Published",
      statement: { description: "Existing statement" },
      config: {
        supportedLanguages: ["python3", "cpp"],
        defaultLanguage: "cpp",
        starterCode: { cpp: "// template" },
        referenceSolution: { cpp: "// reference" },
        executionMode: "function",
        functionSignature: { name: "solve" },
        exactOutput: true,
      },
      testCases: {
        cases: [{ input: "2", output: "4", isHidden: true, weight: 2 }],
      },
    },
  } as never);
  render(<PracticeProblemEditor problemId="practice-1" />);
  await screen.findByDisplayValue("Existing");
  expect(adminQuestionsAPI.getById).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Default Language"), {
    target: { value: "python3" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish Problem" }));
  await waitFor(() =>
    expect(adminProblemsAPI.update).toHaveBeenCalledWith(
      "practice-1",
      expect.objectContaining({
        defaultLanguage: "python3",
        referenceSolution: { cpp: "// reference" },
        execution: expect.objectContaining({
          executionMode: "function",
          functionSignature: { name: "solve" },
          exactOutput: true,
        }),
        sampleExamples: [],
        testCases: {
          cases: [expect.objectContaining({ isHidden: true, weight: 2 })],
        },
      }),
    ),
  );
});

it("blocks publishing without tests and retains edits after a save error", async () => {
  const { container } = render(<PracticeProblemEditor />);
  fireEvent.change(screen.getByLabelText("Question Title"), {
    target: { value: "Draft" },
  });
  fireEvent.change(statement(container), { target: { value: "Description" } });
  fireEvent.change(screen.getByLabelText("Practice visibility"), {
    target: { value: "Published" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish Problem" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Add at least one test case",
  );
  expect(adminProblemsAPI.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Add Test Case" }));
  fireEvent.change(screen.getByLabelText("Test case 1 expected output"), {
    target: { value: "0" },
  });
  jest.mocked(adminProblemsAPI.create).mockRejectedValueOnce({
    response: { data: { message: "Choose a different slug" } },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish Problem" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Choose a different slug",
  );
  expect(screen.getByLabelText("Question Title")).toHaveValue("Draft");
  expect(screen.getByRole("button", { name: "Publish Problem" })).toBeEnabled();
});

it("does not allow a failed import or a non-coding question to be saved", async () => {
  query = "fromQuestion=mcq-1";
  jest
    .mocked(adminQuestionsAPI.getById)
    .mockResolvedValue({ data: { id: "mcq-1", questionType: "MCQ" } } as never);
  render(<PracticeProblemEditor />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Only coding questions",
  );
  expect(
    screen.queryByRole("button", { name: "Save Draft" }),
  ).not.toBeInTheDocument();
  jest
    .mocked(adminQuestionsAPI.getById)
    .mockRejectedValueOnce(new Error("Question unavailable"));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Question unavailable",
  );
  expect(adminProblemsAPI.create).not.toHaveBeenCalled();
});

it("starts a fresh copy when the import selection changes and ignores a late response", async () => {
  query = "fromQuestion=slow-question";
  let resolveFirst!: (value: never) => void;
  jest.mocked(adminQuestionsAPI.getById).mockReturnValueOnce(
    new Promise((resolve) => {
      resolveFirst = resolve;
    }),
  );
  const { rerender } = render(<PracticeProblemEditor />);
  query = "fromQuestion=bank-1";
  jest
    .mocked(adminQuestionsAPI.getById)
    .mockResolvedValueOnce({ data: bankQuestion } as never);
  rerender(<PracticeProblemEditor />);
  expect(await screen.findByLabelText("Question Title")).toHaveValue(
    "Sum of two numbers",
  );
  await React.act(async () => {
    resolveFirst({
      data: { ...bankQuestion, question: "Late question" },
    } as never);
  });
  expect(screen.getByLabelText("Question Title")).toHaveValue(
    "Sum of two numbers",
  );
  expect(screen.getByLabelText("Test case 2 expected output")).toHaveValue(
    "199",
  );
});

it("searches and paginates eligible coding questions and links to an editable practice copy", async () => {
  jest.mocked(adminQuestionsAPI.getAll).mockResolvedValue({
    data: {
      questions: [
        bankQuestion,
        { id: "mcq", questionType: "MCQ", question: "Quiz" },
      ],
      pagination: { totalPages: 2 },
    },
  } as never);
  render(<ImportPracticeProblemPage />);
  const link = await screen.findByRole("link", {
    name: "Import Sum of two numbers",
  });
  expect(link).toHaveAttribute(
    "href",
    "/admin/problems/create?fromQuestion=bank-1",
  );
  expect(screen.queryByText("Quiz")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(adminQuestionsAPI.getAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.any(AbortSignal),
    ),
  );
  fireEvent.change(screen.getByLabelText("Search Question Bank"), {
    target: { value: "Math" },
  });
  await waitFor(() =>
    expect(adminQuestionsAPI.getAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, search: "Math", questionType: "DSA" }),
      expect.any(AbortSignal),
    ),
  );
});

it("recovers from an import list error and cancels its request on unmount", async () => {
  jest
    .mocked(adminQuestionsAPI.getAll)
    .mockRejectedValueOnce(new Error("Offline"));
  const { unmount } = render(<ImportPracticeProblemPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Question Bank could not be loaded",
  );
  jest.mocked(adminQuestionsAPI.getAll).mockResolvedValueOnce({
    data: { questions: [], pagination: { totalPages: 1 } },
  } as never);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No coding questions found")).toBeVisible();
  const signal = jest.mocked(adminQuestionsAPI.getAll).mock.calls.at(-1)![1]!;
  unmount();
  expect(signal.aborted).toBe(true);
});
