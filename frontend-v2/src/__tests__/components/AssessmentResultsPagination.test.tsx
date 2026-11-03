import React from "react";
import "@testing-library/jest-dom";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import AssessmentResultsPage from "@/app/admin/assessments/[id]/results/page";
import { adminAssessmentsAPI } from "@/config/api";
import { assessmentResultsCSV } from "@/lib/assessment-results-export";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  use: () => ({ id: "test-assessment-id" }),
}));

jest.mock("@/config/api", () => ({
  adminAssessmentsAPI: {
    getResults: jest.fn(),
    getAttemptReport: jest.fn(),
  },
}));

jest.mock("@/lib/assessment-results-export", () => ({
  assessmentResultsCSV: jest.fn().mockReturnValue("CSV,Data"),
  resultText: (v: any) => v || "—",
}));

describe("AssessmentResultsPage Pagination", () => {
  const generateMockCandidates = (count: number) => {
    return Array.from({ length: count }, (_, idx) => ({
      _id: `cand-${idx + 1}`,
      id: `cand-${idx + 1}`,
      studentUid: `UID${1000 + idx}`,
      studentName: `Student ${idx + 1}`,
      studentEmail: `student${idx + 1}@example.com`,
      score: 50 + (idx % 50),
      maxScore: 100,
      accuracy: 80,
      passed: idx % 2 === 0,
      timeSpentSeconds: 1200,
      violations: [],
      tabSwitchCount: 0,
      totalAttempts: 1,
      submittedAt: "2026-11-03T10:00:00Z",
    }));
  };

  const generateMockRawAttempts = (count: number) => {
    return Array.from({ length: count }, (_, idx) => ({
      _id: `att-${idx + 1}`,
      id: `att-${idx + 1}`,
      studentUid: `UID${1000 + idx}`,
      studentName: `Student ${idx + 1}`,
      studentEmail: `student${idx + 1}@example.com`,
      score: 50 + (idx % 50),
      maxScore: 100,
      passed: idx % 2 === 0,
      timeSpentSeconds: 1200,
      status: "submitted",
      attemptNumber: 1,
      violations: [],
      submittedAt: "2026-11-03T10:00:00Z",
    }));
  };

  const mockData = {
    assessment: {
      id: "test-assessment-id",
      code: "CSE101",
      title: "Algorithms Midterm",
      totalMarks: 100,
    },
    stats: {
      totalCandidates: 60,
      submittedCount: 60,
      passedCount: 30,
      passPercentage: 50,
      avgScore: 75,
    },
    attempts: generateMockCandidates(60),
    rawAttempts: generateMockRawAttempts(60),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(adminAssessmentsAPI.getResults).mockResolvedValue({
      data: mockData,
    } as any);
  });

  it("slices candidate rows by default page size (25) and renders pagination controls", async () => {
    render(<AssessmentResultsPage params={Promise.resolve({ id: "test-assessment-id" })} />);

    await waitFor(() => {
      expect(screen.getByText("Student 1")).toBeInTheDocument();
    });

    // Student 1 to 25 should be rendered
    expect(screen.getByText("Student 25")).toBeInTheDocument();
    // Student 26 should NOT be rendered on page 1
    expect(screen.queryByText("Student 26")).not.toBeInTheDocument();

    // Verify pagination footer showing 1 to 25 of 60
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
    expect(screen.getAllByText("60").length).toBeGreaterThan(0);

    // Navigate to page 2
    const page2Button = screen.getByRole("button", { name: "2" });
    fireEvent.click(page2Button);

    // Student 26 should now be visible
    expect(screen.getByText("Student 26")).toBeInTheDocument();
    expect(screen.getByText("Student 50")).toBeInTheDocument();
    expect(screen.queryByText("Student 1")).not.toBeInTheDocument();
  });

  it("changes page size and resets to page 1", async () => {
    render(<AssessmentResultsPage params={Promise.resolve({ id: "test-assessment-id" })} />);

    await waitFor(() => {
      expect(screen.getByText("Student 1")).toBeInTheDocument();
    });

    // Change page size to 10
    const select = screen.getByRole("combobox", { name: "Rows per page" });
    fireEvent.change(select, { target: { value: "10" } });

    // Now only 10 students should show
    expect(screen.getByText("Student 1")).toBeInTheDocument();
    expect(screen.getByText("Student 10")).toBeInTheDocument();
    expect(screen.queryByText("Student 11")).not.toBeInTheDocument();
  });

  it("resets to page 1 when search filter changes", async () => {
    render(<AssessmentResultsPage params={Promise.resolve({ id: "test-assessment-id" })} />);

    await waitFor(() => {
      expect(screen.getByText("Student 1")).toBeInTheDocument();
    });

    // Go to page 2
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(screen.getByText("Student 26")).toBeInTheDocument();

    // Type in search box
    const searchInput = screen.getByPlaceholderText(/Search by student UID/);
    fireEvent.change(searchInput, { target: { value: "Student 1" } });

    // Should reset to page 1 and show matching students
    expect(screen.getByText("Student 1")).toBeInTheDocument();
  });

  it("exports all filtered candidates, not just the single page slice", async () => {
    // Mock URL.createObjectURL and revokeObjectURL
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-url");
    window.URL.revokeObjectURL = jest.fn();

    render(<AssessmentResultsPage params={Promise.resolve({ id: "test-assessment-id" })} />);

    await waitFor(() => {
      expect(screen.getByText("Student 1")).toBeInTheDocument();
    });

    const exportButton = screen.getByRole("button", { name: /Export Results/ });
    fireEvent.click(exportButton);

    // assessmentResultsCSV should have been called with all 60 attempts, NOT just the 25 on page 1
    expect(assessmentResultsCSV).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ studentName: "Student 1" }),
        expect.objectContaining({ studentName: "Student 60" }),
      ]),
      "candidates"
    );

    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("filters candidates by result (Passed Only / Failed Only) and resets via Reset button", async () => {
    render(<AssessmentResultsPage params={Promise.resolve({ id: "test-assessment-id" })} />);

    await waitFor(() => {
      expect(screen.getByText("Student 1")).toBeInTheDocument();
    });

    // In mock data: even index (idx % 2 === 0) passed = true => Student 1 (idx 0), Student 3 (idx 2) passed.
    // odd index (idx % 2 === 1) passed = false => Student 2 (idx 1), Student 4 (idx 3) failed.
    const resultFilter = screen.getByRole("combobox", { name: "Filter by result" });
    fireEvent.change(resultFilter, { target: { value: "passed" } });

    // Passed students show, failed student 2 should not show
    expect(screen.getByText("Student 1")).toBeInTheDocument();
    expect(screen.queryByText("Student 2")).not.toBeInTheDocument();

    // Reset button should now be visible
    const resetButton = screen.getByRole("button", { name: "Reset Filters" });
    expect(resetButton).toBeInTheDocument();
    fireEvent.click(resetButton);

    // After reset, Student 2 is back
    expect(screen.getByText("Student 1")).toBeInTheDocument();
    expect(screen.getByText("Student 2")).toBeInTheDocument();
  });
});
