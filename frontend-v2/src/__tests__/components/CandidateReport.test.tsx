import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("@/config/api", () => ({
  adminUsersAPI: {
    getAll: jest.fn(),
    getReport: jest.fn(),
  },
}));

jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "admin-1", name: "Admin User", isAdmin: true },
  }),
}));

jest.mock("@react-pdf/renderer", () => ({
  Document: ({ children }: any) => <div data-testid="pdf-document">{children}</div>,
  Page: ({ children, style }: any) => <div data-testid="pdf-page" style={style}>{children}</div>,
  View: ({ children, style }: any) => <div data-testid="pdf-view" style={style}>{children}</div>,
  Text: ({ children, style }: any) => <span data-testid="pdf-text" style={style}>{children}</span>,
  Image: (props: any) => <img data-testid="pdf-image" alt="pdf" {...props} />,
  Svg: ({ children, ...props }: any) => <svg {...props}>{children}</svg>,
  Circle: (props: any) => <circle {...props} />,
  G: ({ children, ...props }: any) => <g {...props}>{children}</g>,
  Path: (props: any) => <path {...props} />,
  Rect: (props: any) => <rect {...props} />,
  Line: (props: any) => <line {...props} />,
  StyleSheet: {
    create: (styles: any) => styles,
  },
  pdf: () => ({
    toBlob: jest.fn().mockResolvedValue(new Blob(["mock-pdf"], { type: "application/pdf" })),
  }),
}));

import CandidatesAdminPage from "@/app/admin/candidates/page";
import { adminUsersAPI } from "@/config/api";
import { PDFDownloadButton } from "@/components/reports/pdf/PDFDownloadButton";

const mockAdminUsersAPI = adminUsersAPI as jest.Mocked<typeof adminUsersAPI>;

describe("Candidate Report and Preview System", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.URL.createObjectURL = jest.fn().mockReturnValue("blob:mock-pdf-url");
    window.URL.revokeObjectURL = jest.fn();
  });

  const mockUsersList = {
    data: {
      success: true,
      users: [
        {
          _id: "user-1",
          name: "Rohan Gupta",
          email: "rohan@example.com",
          role: "student",
          isAdmin: false,
          createdAt: "2026-09-15T10:00:00Z",
        },
        {
          _id: "user-2",
          name: "Priya Sharma",
          email: "priya@example.com",
          role: "student",
          isAdmin: true,
          createdAt: "2026-09-20T10:00:00Z",
        },
      ],
    },
  };

  const mockReportData = {
    data: {
      success: true,
      report: {
        user: {
          id: "user-1",
          _id: "user-1",
          name: "Rohan Gupta",
          email: "rohan@example.com",
          role: "student",
          isAdmin: false,
          createdAt: "2026-09-15T10:00:00Z",
          lastActive: "2026-11-03T10:00:00Z",
          solvedProblems: ["p1", "p2"],
          stats: { xp: 120, currentStreak: 5 },
        },
        stats: {
          totalSubmissions: 4,
          acceptedSubmissions: 3,
          accepted: 3,
          acceptanceRate: 75,
        },
        recentSubmissions: [
          {
            _id: "sub-1",
            problemTitle: "Balanced Parentheses",
            language: "cpp",
            status: "Accepted",
            createdAt: "2026-11-03T09:00:00Z",
          },
        ],
      },
    },
  };

  it("renders candidates list and opens in-page preview modal with scorecard stats", async () => {
    mockAdminUsersAPI.getAll.mockResolvedValueOnce(mockUsersList as any);
    mockAdminUsersAPI.getReport.mockResolvedValueOnce(mockReportData as any);

    render(<CandidatesAdminPage />);

    expect(await screen.findByText("Rohan Gupta")).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();

    const previewButtons = screen.getAllByRole("button", { name: /preview/i });
    expect(previewButtons.length).toBe(2);

    fireEvent.click(previewButtons[0]);

    expect(await screen.findByText("Candidate Report: Rohan Gupta")).toBeInTheDocument();
    expect(screen.getByText("Problems Solved")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("Balanced Parentheses")).toBeInTheDocument();

    // Close preview modal
    const closeBtn = screen.getByRole("button", { name: "Close preview" });
    fireEvent.click(closeBtn);

    expect(screen.queryByText("Candidate Report: Rohan Gupta")).not.toBeInTheDocument();
  });

  it("PDFDownloadButton generates blob preview on demand and cleans up on close", async () => {
    const reportData = {
      reportId: "CU-CS-2026-0001",
      generatedAt: "03 Nov 2026",
      assessmentName: "Technical Round",
      student: {
        name: "Rohan Gupta",
        email: "rohan@example.com",
      },
      performance: {
        totalSolved: 3,
        score: 80,
        acceptanceRate: 75,
        streak: 5,
      },
      submissions: [
        {
          _id: "sub-1",
          problemTitle: "Binary Search",
          status: "Accepted",
          language: "python",
          submittedAt: "03 Nov 2026",
        },
      ],
    };

    render(<PDFDownloadButton data={reportData} />);

    const previewBtn = screen.getByRole("button", { name: /preview pdf/i });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      const iframe = screen.getByTitle(/Preview - codeskill-assessment-rohan-gupta/i);
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute("src", "blob:mock-pdf-url");
    });

    const closeBtn = screen.getByRole("button", { name: "Close preview" });
    fireEvent.click(closeBtn);

    expect(screen.queryByTitle(/Preview - codeskill-assessment-rohan-gupta/i)).not.toBeInTheDocument();
  });
});