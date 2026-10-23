import React, { Suspense } from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import AnalyticsDashboardPage from "@/app/admin/assessments/[id]/analytics/page";
import { analyticsAPI } from "@/config/api";

jest.mock("@/config/api", () => ({
  analyticsAPI: {
    getOverview: jest.fn(),
    getQuestionAnalytics: jest.fn(),
  },
}));

const mockGetOverview = jest.mocked(analyticsAPI.getOverview);
const mockGetQuestions = jest.mocked(analyticsAPI.getQuestionAnalytics);

const mockValidOverview = {
  data: {
    success: true,
    assessment: {
      id: "af3df981-0978-4b0e-91a8-4bc3027e2363",
      title: "Practice Assessment 3 - Problem Solving",
      code: "EXAM-4103",
      status: "published",
      type: "mixed",
      durationMinutes: 60,
      totalMarks: 50,
      passingMarks: 25,
    },
    participation: {
      total: 6,
      completed: 6,
      totalCandidates: 6,
      completedCandidates: 6,
    },
    metrics: {
      avgScore: 32.5,
      maxScore: 50,
      minScore: 15,
      avgTimeSpent: 2542,
      totalPassed: 4,
      passRate: 66.7,
    },
    proctoring: {
      totalViolations: 10,
      totalTabSwitches: 7,
      totalFullscreenExits: 3,
      securityEventsCount: 2,
      recentEvents: [
        {
          id: "sec-1",
          eventType: "WINDOW_BLUR_OR_TAB_SWITCH",
          severity: "MEDIUM",
          candidateName: "Rohan Gupta",
          candidateEmail: "rohan@test.com",
          createdAt: "2026-10-22T14:34:00Z",
        },
      ],
    },
    auditLogs: [
      {
        id: "audit-1",
        action: "ASSESSMENT_ANALYTICS_REVIEW",
        actorEmail: "admin@codeskill.local",
        timestamp: "2026-10-22T14:34:00Z",
        event: "Analytics snapshot reviewed",
      },
    ],
  },
};

const mockValidQuestions = {
  data: {
    success: true,
    data: [
      {
        questionId: "q-1",
        title: "Balanced Parentheses Verification",
        type: "single_choice",
        difficulty: "easy",
        totalAttempts: 6,
        correctCount: 4,
        successRate: 66.7,
        avgTimeSpent: 240,
        avgMarksAwarded: 8.3,
      },
      {
        questionId: "q-2",
        title: "Two-Pointer Array Search",
        type: "coding",
        difficulty: "medium",
        totalAttempts: 6,
        correctCount: 4,
        successRate: 66.7,
        avgTimeSpent: 1152,
        avgMarksAwarded: 10,
      },
    ],
  },
};

async function renderDashboard(id = "af3df981-0978-4b0e-91a8-4bc3027e2363") {
  let utils: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <Suspense fallback={<div role="status">Loading...</div>}>
        <AnalyticsDashboardPage params={Promise.resolve({ id })} />
      </Suspense>
    );
  });
  return utils!;
}

describe("Assessment Analytics Dashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders valid assessment with candidate results and metrics without crashing", async () => {
    mockGetOverview.mockResolvedValueOnce(mockValidOverview as any);
    mockGetQuestions.mockResolvedValueOnce(mockValidQuestions as any);

    await renderDashboard();

    // Renders header information
    expect(
      await screen.findByText("Practice Assessment 3 - Problem Solving")
    ).toBeInTheDocument();
    expect(screen.getAllByText("EXAM-4103").length).toBeGreaterThan(0);

    // KPI Cards
    expect(screen.getByText("32.5")).toBeInTheDocument();
    expect(screen.getAllByText("66.7%").length).toBeGreaterThan(0);
    expect(screen.getByText("42m 22s")).toBeInTheDocument();

    // Proctoring telemetry
    expect(screen.getByText("Proctoring Telemetry")).toBeInTheDocument();
    expect(screen.getByText("Rohan Gupta")).toBeInTheDocument();

    // Question performance table
    expect(
      screen.getByText("Balanced Parentheses Verification")
    ).toBeInTheDocument();
    expect(screen.getByText("Two-Pointer Array Search")).toBeInTheDocument();
  });

  it("handles assessments with zero submissions safely", async () => {
    mockGetOverview.mockResolvedValueOnce({
      data: {
        assessment: {
          id: "empty-exam",
          title: "Fresh Assessment",
          code: "EXAM-9999",
          status: "published",
          durationMinutes: 45,
          totalMarks: 100,
          passingMarks: 40,
        },
        participation: { total: 0, completed: 0 },
        metrics: {
          avgScore: 0,
          maxScore: 0,
          minScore: 0,
          avgTimeSpent: 0,
          totalPassed: 0,
          passRate: 0,
        },
        proctoring: {
          totalViolations: 0,
          totalTabSwitches: 0,
          totalFullscreenExits: 0,
          securityEventsCount: 0,
          recentEvents: [],
        },
      },
    } as any);
    mockGetQuestions.mockResolvedValueOnce({
      data: { success: true, data: [] },
    } as any);

    await renderDashboard("empty-exam");

    expect(
      await screen.findByText("No Candidate Submissions Yet")
    ).toBeInTheDocument();
    expect(screen.getByText("Fresh Assessment")).toBeInTheDocument();
    expect(screen.getByText("0.0%")).toBeInTheDocument();
  });

  it("displays unauthorized error state on 401 response", async () => {
    const error: any = new Error("Unauthorized");
    error.response = { status: 401, data: { message: "Not authorized" } };
    mockGetOverview.mockRejectedValueOnce(error);
    mockGetQuestions.mockResolvedValueOnce({ data: [] } as any);

    await renderDashboard("unauth-exam");

    expect(
      await screen.findByText("Administrator Access Required")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Sign In as Admin" })
    ).toBeInTheDocument();
  });

  it("displays not-found error state on 404 response", async () => {
    const error: any = new Error("Not Found");
    error.response = { status: 404, data: { message: "Assessment not found" } };
    mockGetOverview.mockRejectedValueOnce(error);
    mockGetQuestions.mockResolvedValueOnce({ data: [] } as any);

    await renderDashboard("missing-id");

    expect(await screen.findByText("Assessment Not Found")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to Assessments" })
    ).toBeInTheDocument();
  });

  it("displays retryable error screen on API failure and recovers on retry", async () => {
    const error: any = new Error("Server error");
    error.response = {
      status: 500,
      data: { message: "Database connection failed" },
    };
    mockGetOverview.mockRejectedValueOnce(error);
    mockGetQuestions.mockResolvedValueOnce({ data: [] } as any);

    await renderDashboard("error-exam");

    expect(
      await screen.findByText("Unable to Load Analytics")
    ).toBeInTheDocument();
    expect(screen.getByText("Database connection failed")).toBeInTheDocument();

    // Now resolve successfully on retry
    mockGetOverview.mockResolvedValueOnce(mockValidOverview as any);
    mockGetQuestions.mockResolvedValueOnce(mockValidQuestions as any);

    const retryBtn = screen.getByRole("button", { name: /try again/i });
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(
      await screen.findByText("Practice Assessment 3 - Problem Solving")
    ).toBeInTheDocument();
  });

  it("safely handles wrapped envelope format and prevents questions.map crash", async () => {
    mockGetOverview.mockResolvedValueOnce({
      data: mockValidOverview.data,
    } as any);
    mockGetQuestions.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            questionId: "q-wrapped",
            title: "Array Search Problem",
            type: "coding",
            totalAttempts: 5,
            correctCount: 5,
            successRate: 100,
            avgTimeSpent: 120,
            avgMarksAwarded: 10,
          },
        ],
      },
    } as any);

    await renderDashboard("wrapped-exam");

    expect(
      await screen.findByText("Array Search Problem")
    ).toBeInTheDocument();
    expect(screen.getByText("100.0%")).toBeInTheDocument();
  });
});
