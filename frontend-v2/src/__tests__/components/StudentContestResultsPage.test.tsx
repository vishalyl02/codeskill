import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContestResultsPage from "@/app/contests/[id]/results/page";
import { contestsAPI } from "@/config/api";

jest.mock("next/navigation", () => ({
  useParams: () => ({ id: "contest-101" }),
  useSearchParams: () => ({
    get: (key: string) => (key === "page" ? "1" : null),
  }),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "user-alice",
      name: "Alice Smith",
      username: "alice",
      role: "student",
    },
    loading: false,
  }),
}));

jest.mock("@/config/api", () => ({
  contestsAPI: {
    getResults: jest.fn(),
    getEditorials: jest.fn(),
  },
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockResultsData = {
  contest: {
    id: "contest-101",
    slug: "winter-icpc-clash",
    title: "Winter ICPC Clash 2026",
    description: "Annual regional collegiate programming battle",
    startTime: "2026-11-01T10:00:00Z",
    endTime: "2026-11-01T13:00:00Z",
    contestFormat: "icpc",
    resultsPublished: true,
    isPrivate: false,
  },
  problems: [
    {
      id: "prob-1",
      index: "A",
      title: "Binary Inversion",
      slug: "binary-inversion",
      maxPoints: 100,
      difficulty: "Easy",
      totalSolved: 12,
      firstSolver: { name: "Bob", username: "bob", timeInMinutes: 8 },
    },
    {
      id: "prob-2",
      index: "B",
      title: "Graph Dominance",
      slug: "graph-dominance",
      maxPoints: 100,
      difficulty: "Hard",
      totalSolved: 3,
      firstSolver: { name: "Alice", username: "alice", timeInMinutes: 24 },
    },
  ],
  standings: [
    {
      userId: "user-alice",
      name: "Alice Smith",
      username: "alice",
      avatar: "",
      department: "CSE",
      batch: "2025",
      status: "Submitted",
      warnings: 0,
      violationsCount: 0,
      problemsSolved: 2,
      totalScore: 200,
      totalPenaltyMinutes: 44,
      problemResults: {
        "prob-1": {
          status: "accepted",
          score: 100,
          attempts: 1,
          timeInMinutes: 12,
          savedCode: "def solveA(): pass",
          language: "python",
        },
        "prob-2": {
          status: "accepted",
          score: 100,
          attempts: 2,
          timeInMinutes: 24,
          isFirstSolve: true,
          savedCode: "def solveB(): pass",
          language: "python",
        },
      },
      rank: 1,
      isCurrentUser: true,
    },
    {
      userId: "user-bob",
      name: "Bob Jones",
      username: "bob",
      avatar: "",
      department: "ECE",
      batch: "2025",
      status: "Submitted",
      warnings: 1,
      violationsCount: 1,
      problemsSolved: 1,
      totalScore: 100,
      totalPenaltyMinutes: 8,
      problemResults: {
        "prob-1": {
          status: "accepted",
          score: 100,
          attempts: 1,
          timeInMinutes: 8,
          isFirstSolve: true,
        },
        "prob-2": { status: "unattempted", score: 0, attempts: 0 },
      },
      rank: 2,
      isCurrentUser: false,
    },
  ],
  pagination: {
    page: 1,
    limit: 50,
    total: 2,
    totalPages: 1,
  },
  myResult: {
    rank: 1,
    departmentRank: 1,
    percentile: 100,
    totalScore: 200,
    totalPenaltyMinutes: 44,
    problemsSolved: 2,
    totalProblems: 2,
    status: "Submitted",
    warnings: 0,
    proctoringVerified: true,
    page: 1,
    problemResults: {
      "prob-1": {
        status: "accepted",
        score: 100,
        attempts: 1,
        timeInMinutes: 12,
        savedCode: "def solveA(): pass",
        language: "python",
      },
      "prob-2": {
        status: "accepted",
        score: 100,
        attempts: 2,
        timeInMinutes: 24,
        savedCode: "def solveB(): pass",
        language: "python",
      },
    },
  },
  departments: ["CSE", "ECE"],
  batches: ["2025"],
  disqualified: [
    {
      userId: "user-charlie",
      name: "Charlie Brown",
      username: "charlie",
      department: "CSE",
      batch: "2026",
      reason: "Session terminated: Security threshold exceeded",
      warnings: 3,
      violationsCount: 3,
      submittedAt: "2026-11-01T11:00:00Z",
      activityJourneyUrl: "/admin/activity?actorId=user-charlie",
    },
  ],
};

describe("StudentContestResultsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (contestsAPI.getResults as jest.Mock).mockResolvedValue({
      data: mockResultsData,
    });
    (contestsAPI.getEditorials as jest.Mock).mockResolvedValue({
      data: {
        contest: mockResultsData.contest,
        editorials: [
          {
            problemId: "prob-1",
            index: "A",
            title: "Binary Inversion",
            slug: "binary-inversion",
            difficulty: "Easy",
            editorial: "Count the number of inversions in linear time.",
            referenceSolutions: [{ language: "python", sourceCode: "def solve(): pass" }],
          },
        ],
      },
    });
  });

  it("renders contest header, personal scorecard, and scoreboard table", async () => {
    render(<ContestResultsPage />);

    // Contest title and format
    await waitFor(() => {
      expect(screen.getByText("Winter ICPC Clash 2026")).toBeInTheDocument();
    });
    expect(screen.getByText("Official Verified Results")).toBeInTheDocument();

    // Personal scorecard banner
    expect(screen.getByText("Personal Scorecard")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("Proctoring Verified (0 Flags)")).toBeInTheDocument();
    expect(screen.getByText("Top 1%")).toBeInTheDocument();

    // Scoreboard standings rows
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();

    // Problem columns in scoreboard header
    expect(screen.getByText("Binary Inversion")).toBeInTheDocument();
    expect(screen.getByText("Graph Dominance")).toBeInTheDocument();
  });

  it("switches to Problem Breakdown tab and opens Review Code modal", async () => {
    render(<ContestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Winter ICPC Clash 2026")).toBeInTheDocument();
    });

    // Switch to "My Problem Breakdown" tab
    const breakdownTab = screen.getByText(/My Problem Breakdown/i);
    fireEvent.click(breakdownTab);

    // Problem cards should be displayed
    await waitFor(() => {
      expect(screen.getByText("Problem-by-Problem Breakdown")).toBeInTheDocument();
    });

    // Both problems should show Accepted badge
    const acceptedBadges = screen.getAllByText("Accepted");
    expect(acceptedBadges.length).toBeGreaterThanOrEqual(2);

    // Click "Review Code" on Problem A
    const reviewButtons = screen.getAllByText("Review Code");
    fireEvent.click(reviewButtons[0]);

    // Review Code modal should be open
    await waitFor(() => {
      expect(screen.getByText("Submitted Code (python)")).toBeInTheDocument();
      expect(screen.getByText("def solveA(): pass")).toBeInTheDocument();
    });

    // Close modal
    const closeBtn = screen.getByText("Close");
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText("def solveA(): pass")).not.toBeInTheDocument();
    });
  });

  it("switches to Anti-Cheat Review tab and shows segregated candidates", async () => {
    render(<ContestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Winter ICPC Clash 2026")).toBeInTheDocument();
    });

    // Switch to Anti-Cheat Review tab
    const antiCheatTab = screen.getByText(/Anti-Cheat Review/i);
    fireEvent.click(antiCheatTab);

    await waitFor(() => {
      expect(screen.getByText("Anti-Cheat Review & Disqualifications")).toBeInTheDocument();
    });

    // Charlie Brown should be displayed
    expect(screen.getByText("Charlie Brown")).toBeInTheDocument();
    expect(screen.getByText(/Session terminated: Security threshold exceeded/i)).toBeInTheDocument();
    expect(screen.getByText("3 Flags")).toBeInTheDocument();
  });

  it("switches to Official Editorials tab and loads solutions", async () => {
    render(<ContestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Winter ICPC Clash 2026")).toBeInTheDocument();
    });

    // Switch to Editorials tab
    const editorialsTab = screen.getByText("Official Editorials");
    fireEvent.click(editorialsTab);

    await waitFor(() => {
      expect(screen.getByText("Count the number of inversions in linear time.")).toBeInTheDocument();
      expect(screen.getByText("def solve(): pass")).toBeInTheDocument();
    });
  });

  it("triggers filter change when department filter is selected", async () => {
    render(<ContestResultsPage />);

    await waitFor(() => {
      expect(screen.getByText("Winter ICPC Clash 2026")).toBeInTheDocument();
    });

    const deptSelect = screen.getByLabelText("Filter by department");
    fireEvent.change(deptSelect, { target: { value: "ECE" } });

    await waitFor(() => {
      expect(contestsAPI.getResults).toHaveBeenCalledWith(
        "contest-101",
        expect.objectContaining({ department: "ECE" }),
      );
    });
  });
});
