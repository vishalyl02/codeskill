import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import QuestionPicker from "@/app/admin/assessments/create/_components/QuestionPicker";
import { adminQuestionsAPI } from "@/config/api";

let mockAssessmentStore: {
  sections: Array<{ id: string; title: string; questions: Array<{ questionId: string }> }>;
  addQuestionToSection: jest.Mock;
};

jest.mock("@/config/api", () => ({
  adminQuestionsAPI: { getAll: jest.fn(), getTopics: jest.fn() },
}));
jest.mock("@/app/admin/assessments/create/_store/useAssessmentStore", () => ({
  useAssessmentStore: () => mockAssessmentStore,
}));

const firstQuestion = {
  _id: "question-1",
  question: "Linear equation question",
  topic: "Mathematics",
  subtopic: "Algebra",
  difficulty: "medium",
  questionType: "MCQ",
};
const secondQuestion = {
  ...firstQuestion,
  _id: "question-2",
  question: "Second linear equation question",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAssessmentStore = {
    sections: [{ id: "section-1", title: "Section A", questions: [] }],
    addQuestionToSection: jest.fn(),
  };
  jest.mocked(adminQuestionsAPI.getTopics).mockImplementation(async (subject) => ({
    data: {
      topics: subject ? ["Algebra"] : [{ topic: "Mathematics", approved: 2 }],
    },
  } as never));
  jest.mocked(adminQuestionsAPI.getAll).mockImplementation(async (params) => {
    if (params?.subtopic === "Algebra" && params?.difficulty === "medium") {
      return {
        data: {
          questions: params.page === 2 ? [secondQuestion] : [firstQuestion],
          pagination: { page: params.page, totalPages: 2 },
        },
      } as never;
    }
    if (params?.topic === "Mathematics") {
      return {
        data: { questions: [firstQuestion], pagination: { page: params.page, totalPages: 1 } },
      } as never;
    }
    return {
      data: { questions: [firstQuestion], pagination: { page: 1, totalPages: 1 } },
    } as never;
  });
});

it("combines subject, dependent topic, difficulty, and search while retaining paged selections", async () => {
  render(<QuestionPicker sectionId="section-1" onClose={jest.fn()} />);

  await screen.findByRole("option", { name: "Mathematics" });
  fireEvent.change(screen.getByRole("combobox", { name: "Subject" }), {
    target: { value: "Mathematics" },
  });
  const topicFilter = screen.getByRole("combobox", { name: "Topic" });
  await waitFor(() => expect(topicFilter).toBeEnabled());
  expect(await screen.findByRole("option", { name: "Algebra" })).toBeInTheDocument();

  fireEvent.change(topicFilter, { target: { value: "Algebra" } });
  await waitFor(() => expect(adminQuestionsAPI.getTopics).toHaveBeenCalledWith("Mathematics"));
  fireEvent.change(screen.getByRole("combobox", { name: "Difficulty Level" }), {
    target: { value: "medium" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Search questions" }), {
    target: { value: "linear" },
  });

  await screen.findByText(firstQuestion.question);
  await waitFor(() => expect(adminQuestionsAPI.getAll).toHaveBeenCalledWith(
    expect.objectContaining({
      topic: "Mathematics",
      subtopic: "Algebra",
      difficulty: "medium",
      search: "linear",
      status: "approved",
    }),
    expect.any(AbortSignal),
  ));

  fireEvent.click(screen.getByText(firstQuestion.question).closest("div.flex.items-start")!);
  fireEvent.click(screen.getByRole("button", { name: "Next questions page" }));
  await screen.findByText(secondQuestion.question);
  fireEvent.click(screen.getByText(secondQuestion.question).closest("div.flex.items-start")!);

  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("combobox", { name: "Subject" })).toHaveValue("");
  expect(screen.getByRole("combobox", { name: "Topic" })).toHaveValue("");
  expect(screen.getByRole("combobox", { name: "Difficulty Level" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Search questions" })).toHaveValue("");
  expect(screen.getByText("2 selected")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Add to Section" }));
  expect(mockAssessmentStore.addQuestionToSection).toHaveBeenCalledTimes(2);
});
