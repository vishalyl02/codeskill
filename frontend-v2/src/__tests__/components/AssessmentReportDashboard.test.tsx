import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AssessmentResultPage from "@/app/assessments/[id]/result/page";
import { studentAssessmentsAPI } from "@/config/api";
import { useAuth } from "@/context/AuthContext";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/config/api", () => ({
  studentAssessmentsAPI: {
    getResult: jest.fn(),
    getAttemptReport: jest.fn(),
  },
}));

jest.mock("@/components/reports/ContestReportDownloadButton", () => ({
  ContestReportDownloadButton: () => <button data-testid="contest-pdf-btn">Client PDF</button>,
}));

const mockGetResult = jest.mocked(studentAssessmentsAPI.getResult);
const mockGetAttemptReport = jest.mocked(studentAssessmentsAPI.getAttemptReport);
const mockUseAuth = jest.mocked(useAuth);

const mockAssessmentData = {
  data: {
    success: true,
    rank: 1,
    totalParticipants: 18,
    percentile: "Top 1%",
    canRetake: false,
    assessment: {
      title: "C Quiz (003)-Oct Evening",
      code: "EXAM-C003",
      durationMinutes: 60,
      totalMarks: 20,
      passingMarks: 10,
      allowReview: true,
      institution: "Chandigarh University",
    },
    attempt: {
      id: "attempt-26bcs11930",
      studentId: "student-1",
      studentName: "HIMANSHU KUMAR",
      studentUid: "26BCS11930",
      studentEmail: "26bcs11930@cuchd.in",
      score: 20,
      maxScore: 20,
      percentage: 100,
      accuracy: 100,
      totalAttempted: 20,
      totalCorrect: 20,
      totalWrong: 0,
      timeSpentSeconds: 876, // 14m 36s
      submittedAt: "2026-10-28T13:27:26.000Z",
      status: "submitted",
      passed: true,
    },
    reviewQuestions: [
      {
        questionId: "q-1",
        question: "int x=10; { int x=20; } printf('%d', x); What is the scope and output in C?",
        topic: "Scope & Storage",
        difficulty: "easy",
        isCorrect: true,
        marksAwarded: 1,
        marks: 1,
      },
      {
        questionId: "q-2",
        question: "What happens to the variables listed in a function's header definition?",
        topic: "Functions",
        difficulty: "easy",
        isCorrect: true,
        marksAwarded: 1,
        marks: 1,
      },
      {
        questionId: "q-3",
        question: "Pointer arithmetic indexing: Equivalence of *(ptr + 3) vs ptr[3]",
        topic: "Pointers",
        difficulty: "medium",
        isCorrect: true,
        marksAwarded: 1,
        marks: 1,
      },
      {
        questionId: "q-4",
        question: "2D Array row-major address calculation for element arr[2][3]",
        topic: "Arrays & Memory",
        difficulty: "hard",
        isCorrect: true,
        marksAwarded: 1,
        marks: 1,
      },
    ],
  },
};

describe("Assessment Report & Analytics Dashboard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: "student-1",
        name: "HIMANSHU KUMAR",
        uid: "26BCS11930",
        email: "26bcs11930@cuchd.in",
      },
      loading: false,
    } as any);
    mockGetResult.mockResolvedValue(mockAssessmentData as any);
    if (typeof window !== "undefined") {
      window.URL.createObjectURL = jest.fn(() => "blob:mock-url");
      window.URL.revokeObjectURL = jest.fn();
    }
  });

  it("renders the institutional header, candidate profile, and assessment metadata", async () => {
    render(<AssessmentResultPage params={{ id: "assessment-c003" }} />);

    expect(await screen.findByText("HIMANSHU KUMAR")).toBeInTheDocument();
    expect(screen.getAllByText("Chandigarh University").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("C Quiz (003)-Oct Evening")).toBeInTheDocument();
    expect(screen.getByText("26BCS11930")).toBeInTheDocument();
    expect(screen.getByText("26bcs11930@cuchd.in")).toBeInTheDocument();
    expect(screen.getByText("14m 36s")).toBeInTheDocument();
    expect(screen.getByText("PASSED EXAMINATION")).toBeInTheDocument();
  });

  it("displays the 5 performance summary KPI cards with exact calculations", async () => {
    render(<AssessmentResultPage params={{ id: "assessment-c003" }} />);

    await screen.findByText("HIMANSHU KUMAR");
    expect(screen.getByText("Total Evaluated")).toBeInTheDocument();
    expect(screen.getByText("Solved Correctly")).toBeInTheDocument();
    expect(screen.getByText("Score Obtained")).toBeInTheDocument();
    expect(screen.getByText("Cohort Rank")).toBeInTheDocument();
    expect(screen.getByText("Top 1%")).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("of 18 Candidates"))).toBeInTheDocument();
    expect(screen.getByText("Clean")).toBeInTheDocument();
  });

  it("renders data integrity notice with verified cohort size of 18 candidates", async () => {
    render(<AssessmentResultPage params={{ id: "assessment-c003" }} />);

    await screen.findByText("HIMANSHU KUMAR");
    expect(screen.getByText("Authoritative Examination Data Integrity")).toBeInTheDocument();
    expect(screen.getAllByText(/18 candidates/i).length).toBeGreaterThanOrEqual(1);
  });

  it("supports interactive question search by problem title and topic", async () => {
    render(<AssessmentResultPage params={{ id: "assessment-c003" }} />);

    await screen.findByText("HIMANSHU KUMAR");
    expect(screen.getByText(/Pointer arithmetic indexing/i)).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText("Search problem title or topic...");
    fireEvent.change(searchInput, { target: { value: "row-major" } });

    expect(screen.getByText(/row-major address calculation/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pointer arithmetic indexing/i)).not.toBeInTheDocument();
  });

  it("filters questions by difficulty using category chips", async () => {
    render(<AssessmentResultPage params={{ id: "assessment-c003" }} />);

    await screen.findByText("HIMANSHU KUMAR");
    const hardFilterBtn = screen.getByRole("button", { name: "Hard" });
    fireEvent.click(hardFilterBtn);

    expect(screen.getByText(/row-major address calculation/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pointer arithmetic indexing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/int x=10/i)).not.toBeInTheDocument();
  });

  it("triggers server PDF download when clicking Official PDF", async () => {
    mockGetAttemptReport.mockResolvedValueOnce({
      data: new Blob(["%PDF-1.4 mock"], { type: "application/pdf" }),
    } as any);

    render(<AssessmentResultPage params={{ id: "assessment-c003" }} />);

    await screen.findByText("HIMANSHU KUMAR");
    const pdfButtons = screen.getAllByRole("button", { name: /Official PDF/i });
    fireEvent.click(pdfButtons[0]);

    await waitFor(() => {
      expect(mockGetAttemptReport).toHaveBeenCalledWith("attempt-26bcs11930");
    });
  });
});
