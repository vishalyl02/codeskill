import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import AdminAssessmentsPage from "@/app/admin/assessments/page";
import { adminAssessmentsAPI } from "@/config/api";

jest.mock("@/config/api", () => ({
  adminAssessmentsAPI: {
    getAll: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockGetAll = jest.mocked(adminAssessmentsAPI.getAll);

const mockAssessmentsList = [
  {
    _id: "exam-1",
    id: "exam-1",
    title: "Data Structures Midterm Examination",
    code: "CS-201",
    status: "published",
    allowedAttempts: 1,
    targetSemesters: ["3", "4"],
    targetSections: ["A", "B"],
    targetGroups: [],
    passingPercentage: 40,
    duration: 60,
    questions: ["q1", "q2", "q3"],
    createdAt: new Date().toISOString(),
  },
  {
    _id: "exam-2",
    id: "exam-2",
    title: "Operating Systems Quiz 1",
    code: "OS-301",
    status: "draft",
    allowedAttempts: 0,
    targetSemesters: ["5"],
    targetSections: ["C"],
    targetGroups: [],
    passingPercentage: 50,
    duration: 30,
    questions: ["q4", "q5"],
    createdAt: new Date().toISOString(),
  },
];

describe("AdminAssessmentsPage Search and Zero-Flicker UX", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("loads initial assessments and renders the grid without flickering", async () => {
    mockGetAll.mockResolvedValueOnce({
      data: { success: true, assessments: mockAssessmentsList },
    } as any);

    render(<AdminAssessmentsPage />);

    expect(screen.getByText(/loading assessments/i)).toBeInTheDocument();

    await act(async () => {
      jest.runAllTimers();
    });

    expect(screen.getByText("Data Structures Midterm Examination")).toBeInTheDocument();
    expect(screen.getByText("Operating Systems Quiz 1")).toBeInTheDocument();
  });

  it("filters assessments instantly client-side on keystroke without unmounting grid", async () => {
    mockGetAll.mockResolvedValueOnce({
      data: { success: true, assessments: mockAssessmentsList },
    } as any);

    render(<AdminAssessmentsPage />);

    await act(async () => {
      jest.runAllTimers();
    });

    const searchInput = screen.getByPlaceholderText(/search assessments by title or test code/i);

    // Simulate typing continuously "OS-301"
    fireEvent.change(searchInput, { target: { value: "OS-301" } });

    // Client-side filtering applies immediately (no full-screen loader)
    expect(screen.queryByText(/loading assessments\.\.\./i)).not.toBeInTheDocument();
    expect(screen.getByText("Operating Systems Quiz 1")).toBeInTheDocument();
    expect(screen.queryByText("Data Structures Midterm Examination")).not.toBeInTheDocument();

    // Verify debounce prevents immediate API flood
    expect(mockGetAll).toHaveBeenCalledTimes(1); // Only the initial load

    // Fast forward debounce timer (250ms)
    mockGetAll.mockResolvedValueOnce({
      data: {
        success: true,
        assessments: [mockAssessmentsList[1]],
      },
    } as any);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    // Now debounced backend call has fired exactly once
    expect(mockGetAll).toHaveBeenCalledTimes(2);
    expect(mockGetAll).toHaveBeenLastCalledWith({ search: "OS-301" });
    expect(screen.getByText("Operating Systems Quiz 1")).toBeInTheDocument();
  });

  it("shows clear search button and resets filter smoothly", async () => {
    mockGetAll.mockResolvedValueOnce({
      data: { success: true, assessments: mockAssessmentsList },
    } as any);

    render(<AdminAssessmentsPage />);

    await act(async () => {
      jest.runAllTimers();
    });

    const searchInput = screen.getByPlaceholderText(/search assessments by title or test code/i);

    // Type query
    fireEvent.change(searchInput, { target: { value: "NonExistentExam" } });

    // Shows graceful empty state for search
    expect(screen.getByText(/no assessments matched/i)).toBeInTheDocument();

    // Click clear search button
    const clearButton = screen.getByRole("button", { name: /clear search filter/i });
    fireEvent.click(clearButton);

    // Search input is cleared and grid restored
    expect(searchInput).toHaveValue("");
    expect(screen.getByText("Data Structures Midterm Examination")).toBeInTheDocument();
    expect(screen.getByText("Operating Systems Quiz 1")).toBeInTheDocument();
  });
});
