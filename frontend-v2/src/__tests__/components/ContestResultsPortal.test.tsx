import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContestResultsPage from "@/app/admin/contest-results/page";
import { adminContestsAPI } from "@/config/api";
import { useSearchParams } from "next/navigation";

jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(() => ({
    get: jest.fn().mockReturnValue("contest-1"),
  })),
}));

jest.mock("@/config/api", () => ({
  adminContestsAPI: {
    getAll: jest.fn(),
    getResults: jest.fn(),
    togglePublishResults: jest.fn(),
    grantReattempts: jest.fn(),
    revokeReattempt: jest.fn(),
    exportResultsCsv: jest.fn(),
  },
}));

const mockContests = [
  {
    id: "contest-1",
    title: "CU Algorithm Cup 2026",
    slug: "cu-algo-cup",
    startTime: "2026-11-01T04:30:00Z",
    endTime: "2026-11-01T06:30:00Z",
    isPublished: true,
    resultsPublished: false,
    participantCount: 2,
    antiCheatConfig: {
      maxTabSwitchViolations: 3,
      actionOnMaxViolations: "auto_submit",
    },
  },
];

const mockResultsData = {
  contest: {
    id: "contest-1",
    title: "CU Algorithm Cup 2026",
    slug: "cu-algo-cup",
    resultsPublished: false,
    problemsCount: 3,
    antiCheatConfig: {
      maxTabSwitchViolations: 3,
      actionOnMaxViolations: "auto_submit",
    },
  },
  results: [
    {
      id: "attempt-1",
      attemptNumber: 1,
      user: {
        id: "student-1",
        name: "Aman Sharma",
        email: "aman@cu.edu",
        username: "aman_s",
      },
      score: 300,
      problemsSolved: 3,
      status: "Completed",
      startedAt: "2026-11-01T04:30:00Z",
      submittedAt: "2026-11-01T05:15:00Z",
      durationSeconds: 2700,
      warnings: 0,
      violations: [],
      reattemptGrant: null,
    },
    {
      id: "attempt-2",
      attemptNumber: 1,
      user: {
        id: "student-2",
        name: "Priya Singh",
        email: "priya@cu.edu",
        username: "priya_s",
      },
      score: 100,
      problemsSolved: 1,
      status: "Terminated",
      startedAt: "2026-11-01T04:30:00Z",
      submittedAt: "2026-11-01T04:45:00Z",
      durationSeconds: 900,
      warnings: 3,
      violations: [
        { type: "TabSwitch_WindowBlur", timestamp: "2026-11-01T04:35:00Z" },
        { type: "TabSwitch_VisibilityHidden", timestamp: "2026-11-01T04:40:00Z" },
        { type: "Fullscreen_Exit", timestamp: "2026-11-01T04:45:00Z" },
      ],
      reattemptGrant: null,
    },
  ],
  total: 2,
  stats: {
    totalAttempts: 2,
    completedCount: 1,
    avgScore: 200,
    maxScore: 300,
  },
};

describe("Contest Results Portal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(adminContestsAPI.getAll).mockResolvedValue({
      data: { contests: mockContests },
    } as any);
    jest.mocked(adminContestsAPI.getResults).mockResolvedValue({
      data: mockResultsData,
    } as any);
    jest.mocked(adminContestsAPI.togglePublishResults).mockResolvedValue({
      data: { success: true, resultsPublished: true },
    } as any);
    jest.mocked(adminContestsAPI.grantReattempts).mockResolvedValue({
      data: { success: true, count: 1 },
    } as any);
  });

  it("renders portal header, CU department branding, and contest KPIs", async () => {
    render(<ContestResultsPage />);

    expect(
      screen.getByText(/Department of Skill Development & Lab/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Contest Results & Proctoring Hub"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Aman Sharma")).toBeInTheDocument();
      expect(screen.getByText("Priya Singh")).toBeInTheDocument();
    });

    expect(screen.getByText("300 pts")).toBeInTheDocument();
    expect(screen.getByText("100 pts")).toBeInTheDocument();
    expect(screen.getByText("Limit: 3 violations")).toBeInTheDocument();
  });

  it("opens the security audit trail modal when clicking on violations badge", async () => {
    render(<ContestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("3 violations")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("3 violations"));

    expect(
      await screen.findByText("Security Audit Trail"),
    ).toBeInTheDocument();
    expect(screen.getByText(/#1 TabSwitch_WindowBlur/)).toBeInTheDocument();
    expect(screen.getByText(/#2 TabSwitch_VisibilityHidden/)).toBeInTheDocument();
    expect(screen.getByText(/#3 Fullscreen_Exit/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Close Audit Trail"));
    expect(screen.queryByText("Security Audit Trail")).not.toBeInTheDocument();
  });

  it("opens reattempt authorization modal and submits grant with justification", async () => {
    render(<ContestResultsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Allow Reattempt")).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByText("Allow Reattempt")[1]);

    expect(
      await screen.findByText("Grant Contest Reattempt"),
    ).toBeInTheDocument();

    const reasonInput = screen.getByPlaceholderText(
      /University lab electricity outage/i,
    );
    fireEvent.change(reasonInput, {
      target: { value: "Lab terminal network freeze verified by invigilator" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Authorize Reattempt" }));

    await waitFor(() => {
      expect(adminContestsAPI.grantReattempts).toHaveBeenCalledWith(
        "contest-1",
        expect.objectContaining({
          studentIds: ["student-2"],
          reason: "Lab terminal network freeze verified by invigilator",
          allowedAttempts: 1,
        }),
      );
    });
  });

  it("toggles contest results publication for students", async () => {
    render(<ContestResultsPage />);

    const publishBtn = await screen.findByRole("button", {
      name: "Results Hidden (Draft)",
    });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(adminContestsAPI.togglePublishResults).toHaveBeenCalledWith(
        "contest-1",
        true,
      );
    });
  });
});
