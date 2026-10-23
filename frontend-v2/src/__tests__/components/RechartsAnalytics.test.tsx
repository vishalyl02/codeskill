import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  CodingActivityChart,
  StudentEngagementChart,
  ScoreDistributionChart,
  LanguageUsageChart,
  WeeklyActivityChart,
  AnalyticsDashboardView,
  ChartTooltip,
  getAnalyticsDataset,
  getEmptyAnalyticsData,
} from "@/components/analytics";

// Mock Recharts ResponsiveContainer to render children reliably in JSDOM
jest.mock("recharts", () => {
  const OriginalModule = jest.requireActual("recharts");
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container" style={{ width: "100%", height: "300px" }}>
        {children}
      </div>
    ),
  };
});

describe("Recharts Analytics Components & Dashboard Tests", () => {
  const dataset7d = getAnalyticsDataset("7d");
  const emptyDataset = getEmptyAnalyticsData("7d");

  describe("CodingActivityChart", () => {
    it("renders with representative dataset showing submissions and average acceptance", () => {
      render(
        <CodingActivityChart
          data={dataset7d.codingActivity}
          timeframeLabel="Past 7 Days"
        />
      );

      expect(screen.getByText("Coding Submission Activity & Acceptance")).toBeInTheDocument();
      expect(screen.getByText(/Daily breakdown of accepted vs failed evaluations/)).toBeInTheDocument();
      expect(screen.getByText(/Avg Acceptance/)).toBeInTheDocument();
      expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    });

    it("renders meaningful empty state when data is empty or zero", () => {
      render(<CodingActivityChart data={emptyDataset.codingActivity} />);

      expect(screen.getByText("No coding submissions recorded")).toBeInTheDocument();
      expect(
        screen.getByText(/Submissions from candidates solving practice challenges/)
      ).toBeInTheDocument();
    });
  });

  describe("StudentEngagementChart", () => {
    it("renders engagement curves with active users and test participation", () => {
      render(
        <StudentEngagementChart
          data={dataset7d.engagement}
          timeframeLabel="Past 7 Days"
        />
      );

      expect(screen.getByText("Student Engagement Trends")).toBeInTheDocument();
      expect(screen.getByText(/Peak:/)).toBeInTheDocument();
      expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    });

    it("renders meaningful empty state when engagement data is missing", () => {
      render(<StudentEngagementChart data={emptyDataset.engagement} />);

      expect(screen.getByText("No engagement telemetry recorded")).toBeInTheDocument();
    });
  });

  describe("ScoreDistributionChart", () => {
    it("renders score distribution histogram and pass rate badge", () => {
      render(
        <ScoreDistributionChart
          data={dataset7d.scoreDistribution}
          passingScorePercent={40}
        />
      );

      expect(screen.getByText("Assessment Score Distribution")).toBeInTheDocument();
      expect(screen.getByText(/Pass Rate/)).toBeInTheDocument();
      expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    });

    it("renders empty state when no assessment scores exist", () => {
      render(<ScoreDistributionChart data={emptyDataset.scoreDistribution} />);

      expect(screen.getByText("No assessment score data")).toBeInTheDocument();
    });
  });

  describe("LanguageUsageChart", () => {
    it("renders compiler distribution donut chart with top language badge", () => {
      render(<LanguageUsageChart data={dataset7d.languages} />);

      expect(screen.getByText("Programming Language Usage")).toBeInTheDocument();
      expect(screen.getByText("Primary: Python")).toBeInTheDocument();
      expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    });

    it("renders empty state when language data is empty", () => {
      render(<LanguageUsageChart data={emptyDataset.languages} />);

      expect(screen.getByText("No compiler telemetry")).toBeInTheDocument();
    });
  });

  describe("WeeklyActivityChart", () => {
    it("renders weekly problem-solving rhythm comparing current vs previous week", () => {
      render(<WeeklyActivityChart data={dataset7d.weeklyActivity} />);

      expect(screen.getByText("Weekly Problem-Solving Rhythm")).toBeInTheDocument();
      expect(screen.getByText(/vs Last Week/)).toBeInTheDocument();
      expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    });

    it("renders empty state when weekly solves are zero", () => {
      render(<WeeklyActivityChart data={emptyDataset.weeklyActivity} />);

      expect(screen.getByText("No weekly solving records")).toBeInTheDocument();
    });
  });

  describe("ChartTooltip", () => {
    it("formats values and handles undefined, null, or zero gracefully", () => {
      const payload = [
        { name: "Accepted", value: 350, color: "#10b981", unit: "solves" },
        { name: "Rate", value: 74.5, color: "#38bdf8", unit: "%" },
        { name: "Missing", value: null, color: "#94a3b8" },
      ];

      render(
        <ChartTooltip
          active={true}
          payload={payload}
          label="Test Period"
          labelPrefix="Timeline"
        />
      );

      expect(screen.getByText(/Timeline:/)).toBeInTheDocument();
      expect(screen.getByText("Test Period")).toBeInTheDocument();
      expect(screen.getByText("350 solves")).toBeInTheDocument();
      expect(screen.getByText("74.5 %")).toBeInTheDocument();
      expect(screen.getByText("0")).toBeInTheDocument();
    });

    it("returns null when inactive or payload is empty", () => {
      const { container } = render(<ChartTooltip active={false} payload={[]} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("AnalyticsDashboardView Integrated Behavior", () => {
    it("renders the summary KPI cards and switches datasets upon timeframe selection", async () => {
      render(<AnalyticsDashboardView initialTimeframe="7d" />);

      // Verify summary KPI ribbon
      expect(screen.getByText("Evaluations Volume")).toBeInTheDocument();
      expect(screen.getByText("Acceptance Rate")).toBeInTheDocument();
      expect(screen.getByText("Active Candidates")).toBeInTheDocument();
      expect(screen.getByText("Primary Language")).toBeInTheDocument();

      // Check default timeframe label
      expect(screen.getByText("Past 7 Days")).toBeInTheDocument();

      // Click 30D filter button
      const btn30d = screen.getByRole("button", { name: "30D" });
      fireEvent.click(btn30d);

      // Verify timeframe updated to 30 Days
      await waitFor(() => {
        expect(screen.getByText("Past 30 Days")).toBeInTheDocument();
      });

      // Click 1Y filter button
      const btn1y = screen.getByRole("button", { name: "1Y" });
      fireEvent.click(btn1y);

      await waitFor(() => {
        expect(screen.getByText("Past 1 Year")).toBeInTheDocument();
      });

      // Toggle simulate empty mode
      const emptyToggleBtn = screen.getByRole("button", { name: /Live \/ Active/i });
      fireEvent.click(emptyToggleBtn);

      await waitFor(() => {
        expect(screen.getByText("No coding submissions recorded")).toBeInTheDocument();
        expect(screen.getByText("Empty Mode")).toBeInTheDocument();
      });
    });
  });
});
