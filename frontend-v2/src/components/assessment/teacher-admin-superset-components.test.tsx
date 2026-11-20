import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AccommodationsManagerPanel from "./AccommodationsManagerPanel";
import LiveClassroomInvigilationPanel from "./LiveClassroomInvigilationPanel";
import IntegrityReviewCard from "./IntegrityReviewCard";
import QuestionFrictionHeatmap from "./QuestionFrictionHeatmap";

describe("Unified Teacher + Admin Superset Components", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe("AccommodationsManagerPanel", () => {
    it("renders candidate accommodations list with extra minutes and role badge", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "acc-1",
            assessment_id: "asmt-1",
            user_id: "cand-1",
            user: { name: "Alice Student", email: "alice@test.com" },
            time_multiplier: 1.5,
            extra_minutes_flat: 15,
            configured_by_role: "INSTRUCTOR",
            secondary_display_allowed: true,
            screen_reader_allowed: false,
            custom_notes: "Visual accommodation approved",
          },
        ],
      });

      render(
        <AccommodationsManagerPanel
          assessmentId="asmt-1"
          userRole="INSTRUCTOR"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Alice Student")).toBeInTheDocument();
        expect(screen.getByText("1.5x")).toBeInTheDocument();
        expect(screen.getByText("+15m")).toBeInTheDocument();
        expect(screen.getByText("INSTRUCTOR")).toBeInTheDocument();
        expect(screen.getByText("Waived")).toBeInTheDocument();
      });
    });
  });

  describe("LiveClassroomInvigilationPanel", () => {
    it("renders classroom roster with quick time grant controls", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            attemptId: "att-1",
            studentId: "cand-1",
            studentName: "Bob Candidate",
            studentEmail: "bob@test.com",
            status: "in_progress",
            score: 80,
            timeSpentSeconds: 1200,
            tabSwitchCount: 1,
            violationsCount: 0,
            extraTimeGrantedMinutes: 10,
            gradeHeld: false,
          },
        ],
      });

      render(
        <LiveClassroomInvigilationPanel
          assessmentId="asmt-1"
          userRole="INSTRUCTOR"
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Bob Candidate")).toBeInTheDocument();
        expect(screen.getByText("+10 min")).toBeInTheDocument();
        expect(screen.getByText("+5m")).toBeInTheDocument();
        expect(screen.getByText("+10m")).toBeInTheDocument();
        expect(screen.getByText("+15m")).toBeInTheDocument();
      });
    });
  });

  describe("IntegrityReviewCard", () => {
    it("renders candidate integrity findings and evolution scrubber controls", () => {
      render(
        <IntegrityReviewCard
          candidateName="Charlie Brown"
          candidateId="cand-2"
          assessmentId="asmt-1"
          gradeHeld={true}
          gradeHoldReason="Secondary monitor detected"
          violations={[
            {
              type: "SECONDARY_DISPLAY_CONNECTED",
              details: "Dual monitor active for 30s",
              severity: "HIGH",
            },
          ]}
          codeSnapshots={[
            {
              timestamp: "00:03:00",
              code: "def solve():\n    return True",
              charDelta: 25,
            },
            {
              timestamp: "00:08:00",
              code: "def solve():\n    # Burst\n    return False",
              charDelta: 85,
              pasteEvent: true,
            },
          ]}
        />,
      );

      expect(
        screen.getByText(/Integrity Review & Code Evolution: Charlie Brown/),
      ).toBeInTheDocument();
      expect(screen.getByText("Grade Held")).toBeInTheDocument();
      expect(screen.getByText("SECONDARY DISPLAY CONNECTED")).toBeInTheDocument();
      expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
      expect(screen.getByText("Release Grade")).toBeInTheDocument();
    });
  });

  describe("QuestionFrictionHeatmap", () => {
    it("renders question struggle analytics and friction metrics", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          questions: [
            {
              questionId: "q-1",
              title: "Reverse Linked List",
              type: "coding",
              marks: 10,
              attemptsCount: 25,
              averageTimeSpentSeconds: 340,
              averageScorePercentage: 42,
              frictionScore: 78,
              difficultyCategory: "HIGH_FRICTION",
            },
          ],
        }),
      });

      render(<QuestionFrictionHeatmap assessmentId="asmt-1" />);

      await waitFor(() => {
        expect(screen.getByText("Reverse Linked List")).toBeInTheDocument();
        expect(screen.getByText("78/100")).toBeInTheDocument();
        expect(screen.getByText("High Friction")).toBeInTheDocument();
        expect(screen.getByText(/5m 40s/)).toBeInTheDocument();
      });
    });
  });
});
