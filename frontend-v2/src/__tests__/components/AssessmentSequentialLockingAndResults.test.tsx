import React, { act } from "react";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import AssessmentResultPage from "@/app/assessments/[id]/result/page";
import { studentAssessmentsAPI } from "@/config/api";
import { useAuth } from "@/context/AuthContext";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/config/api", () => ({
  studentAssessmentsAPI: {
    getResult: jest.fn(),
  },
}));

jest.mock("@/lib/assessment-media-session", () => ({
  releaseAssessmentStream: jest.fn(),
}));

const mockGetResult = jest.mocked(studentAssessmentsAPI.getResult);
const mockAuth = jest.mocked(useAuth);

describe("Assessment Sequential Sections & Result Visibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockReturnValue({
      user: {
        id: "student-1",
        uid: "UID-101",
        name: "Rohit Sharma",
        studentProfile: { semester: 4, section: "CSE-A", course: "B.Tech CSE" },
      },
      loading: false,
    } as any);
  });

  it("renders pending evaluation view when results are withheld by admin", async () => {
    mockGetResult.mockResolvedValueOnce({
      data: {
        resultsPending: true,
        message: "Your submission has been received. Scores will be announced after faculty evaluation.",
        assessment: {
          title: "Mid-Term DSA Exam",
          code: "DSA-MID-2026",
          durationMinutes: 60,
        },
        attempt: {
          id: "attempt-1",
          submittedAt: new Date().toISOString(),
          timeSpentSeconds: 1800,
          status: "submitted",
        },
      },
    });

    await act(async () => {
      render(
        <React.Suspense fallback={<div>Loading Suspense...</div>}>
          <AssessmentResultPage params={Promise.resolve({ id: "assessment-1" })} />
        </React.Suspense>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Results Withheld / Under Evaluation")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Your submission has been received. Scores will be announced after faculty evaluation.")
    ).toBeInTheDocument();
    expect(screen.getByText("Mid-Term DSA Exam")).toBeInTheDocument();
    expect(screen.getByText("Rohit Sharma")).toBeInTheDocument();

    // Verify detailed metrics, scores and download button are withheld
    expect(screen.queryByText("Overall Score")).not.toBeInTheDocument();
    expect(screen.queryByText("Detailed Question Review")).not.toBeInTheDocument();
    expect(screen.queryByText("Download Contest Report")).not.toBeInTheDocument();
  });

  it("renders full scorecard when results are immediately available", async () => {
    mockGetResult.mockResolvedValueOnce({
      data: {
        resultsPending: false,
        assessment: {
          title: "Mid-Term DSA Exam",
          code: "DSA-MID-2026",
          durationMinutes: 60,
        },
        attempt: {
          id: "attempt-1",
          score: 85,
          maxScore: 100,
          percentage: 85,
          passed: true,
          accuracy: 90,
          totalCorrect: 9,
          totalWrong: 1,
          totalAttempted: 10,
          submittedAt: new Date().toISOString(),
          timeSpentSeconds: 2400,
        },
        reviewQuestions: [
          {
            questionId: "q-1",
            question: "What is the time complexity of quicksort in the worst case?",
            options: ["O(N)", "O(N log N)", "O(N^2)", "O(1)"],
            selectedAnswer: 2,
            correctAnswer: 2,
            isCorrect: true,
            marksAwarded: 5,
            topic: "Algorithms",
          },
        ],
        topicBreakdown: [
          {
            topic: "Algorithms",
            correct: 1,
            total: 1,
            accuracy: 100,
          },
        ],
      },
    });

    await act(async () => {
      render(
        <React.Suspense fallback={<div>Loading Suspense...</div>}>
          <AssessmentResultPage params={Promise.resolve({ id: "assessment-1" })} />
        </React.Suspense>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Overall Score")).toBeInTheDocument();
    });

    expect(screen.getByText("85% Aggregate")).toBeInTheDocument();
    expect(screen.getByText("PASSED EXAMINATION")).toBeInTheDocument();
    expect(screen.getByText("Topic Performance Breakdown")).toBeInTheDocument();
    expect(screen.getByText("Detailed Question Review")).toBeInTheDocument();
    expect(screen.getByText("Correct Answer")).toBeInTheDocument();
  });

  it("withholds correct answers and explanations when showCorrectAnswers is false", async () => {
    mockGetResult.mockResolvedValueOnce({
      data: {
        resultsPending: false,
        assessment: {
          title: "Mid-Term DSA Exam",
          code: "DSA-MID-2026",
          durationMinutes: 60,
        },
        attempt: {
          id: "attempt-1",
          score: 50,
          maxScore: 100,
          percentage: 50,
          passed: true,
          accuracy: 50,
          totalCorrect: 5,
          totalWrong: 5,
          totalAttempted: 10,
          submittedAt: new Date().toISOString(),
          timeSpentSeconds: 2400,
        },
        reviewQuestions: [
          {
            questionId: "q-1",
            question: "What is the time complexity of quicksort in the worst case?",
            options: ["O(N)", "O(N log N)", "O(N^2)", "O(1)"],
            selectedAnswer: 0,
            // correctAnswer & explanation were redacted by backend
            isCorrect: false,
            marksAwarded: 0,
            topic: "Algorithms",
          },
        ],
      },
    });

    await act(async () => {
      render(
        <React.Suspense fallback={<div>Loading Suspense...</div>}>
          <AssessmentResultPage params={Promise.resolve({ id: "assessment-1" })} />
        </React.Suspense>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Detailed Question Review")).toBeInTheDocument();
    });

    // Student selection should show "Your Selection" or "Your Answer" but NOT "Correct Answer"
    expect(screen.queryByText("Correct Answer")).not.toBeInTheDocument();
  });

  it("manages store state for target students, sequential sections, and result visibility", () => {
    const { useAssessmentStore } = require("@/app/admin/assessments/create/_store/useAssessmentStore");
    const store = useAssessmentStore.getState();

    // Verify initial defaults
    expect(store.targetStudentIds).toEqual([]);
    expect(store.lockSectionsSequentially).toBe(false);
    expect(store.showResultImmediately).toBe(true);
    expect(store.resultDisplaySettings.showScore).toBe(true);
    expect(store.resultDisplaySettings.showCorrectAnswers).toBe(false);

    // Update targeting & sequential sections
    store.setTargetStudentIds(["student-uuid-1", "student-uuid-2"]);
    store.setLockSectionsSequentially(true);
    store.setShowResultImmediately(false);
    store.setResultDisplaySettings({
      showScore: false,
      showCorrectAnswers: true,
      customSubmissionMessage: "Faculty is reviewing answers.",
    });

    const updated = useAssessmentStore.getState();
    expect(updated.targetStudentIds).toEqual(["student-uuid-1", "student-uuid-2"]);
    expect(updated.lockSectionsSequentially).toBe(true);
    expect(updated.showResultImmediately).toBe(false);
    expect(updated.resultDisplaySettings.showScore).toBe(false);
    expect(updated.resultDisplaySettings.showCorrectAnswers).toBe(true);
    expect(updated.resultDisplaySettings.customSubmissionMessage).toBe("Faculty is reviewing answers.");

    // Reset store
    store.reset();
    const resetState = useAssessmentStore.getState();
    expect(resetState.targetStudentIds).toEqual([]);
    expect(resetState.lockSectionsSequentially).toBe(false);
    expect(resetState.showResultImmediately).toBe(true);
  });
});
