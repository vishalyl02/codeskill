import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import TopKpiStrip from "./_components/TopKpiStrip";
import CandidateMonitorTable, {
  CandidateRecord,
} from "./_components/CandidateMonitorTable";

// Mock @tanstack/react-virtual
jest.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 68,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: String(index),
        start: index * 68,
        size: 68,
      })),
    measureElement: () => {},
  }),
}));

describe("LockDown Command Center Frontend Components", () => {
  const mockKpi = {
    activeCandidates: 12,
    blockedCandidates: 2,
    cleanSubmissions: 28,
    abruptSubmissions: 3,
    totalCandidates: 45,
    hardwareAttestationRatio: 85,
    mediaDisconnectRate: 0.15,
    plagiarismAlertCount: 7,
    candidateFeedbackAverage: 4.8,
  };

  const mockAnalytics = {
    osDistribution: { macos: 25, windows: 20 },
    kioskTierBreakdown: { enterprise_app_mode: 30, standard: 15 },
    attestationPosture: { hardwareTPM: 38, softwareAttestation: 7 },
    violationHeatmap: { SECONDARY_DISPLAY_CONNECTED: 4, BLUR: 12 },
    mediaOutageStats: { disconnectCount: 7, totalOutageDurationSeconds: 42 },
    feedback: {
      averageRating: 4.8,
      totalResponses: 30,
      technicalIssuesCounts: { display_reconfig: 2 },
      recentComments: [
        { rating: 5, comment: "Super smooth lockdown browser!", candidateId: "cand-1" },
      ],
    },
  };

  const mockCandidates: CandidateRecord[] = [
    {
      candidateId: "cand-1",
      name: "Alice Smith",
      email: "alice@example.com",
      status: "ACTIVE",
      kioskTier: "enterprise_app_mode",
      os: "macos",
      attestationTier: "hardware_tpm_enclave",
      compositeRiskScore: 12,
      plagiarismSimilarity: 15,
      lastHeartbeatAt: new Date().toISOString(),
      violationsCount: 0,
      mediaDisconnects: 0,
    },
    {
      candidateId: "cand-2",
      name: "Bob Jones",
      email: "bob@example.com",
      status: "BLOCKED",
      kioskTier: "standard",
      os: "windows",
      attestationTier: "software_binary_bound",
      compositeRiskScore: 88,
      plagiarismSimilarity: 82,
      lastHeartbeatAt: new Date().toISOString(),
      violationsCount: 5,
      mediaDisconnects: 2,
    },
  ];

  describe("TopKpiStrip Component", () => {
    it("renders headline and all essential KPI metrics", () => {
      const onRotate = jest.fn();
      const onScan = jest.fn();
      const onExport = jest.fn();

      render(
        <TopKpiStrip
          kpi={mockKpi}
          analytics={mockAnalytics}
          onRotateQuitPin={onRotate}
          onRunPlagiarismScan={onScan}
          onExportAudit={onExport}
          isScanningPlagiarism={false}
          isRotatingPin={false}
          quitPin="491823"
        />
      );

      expect(screen.getByText(/LockDown Command Center & Live Recovery Console/i)).toBeInTheDocument();
      expect(screen.getByText("45")).toBeInTheDocument(); // totalCandidates
      expect(screen.getByText("12 active")).toBeInTheDocument(); // activeCandidates
      expect(screen.getByText("2")).toBeInTheDocument(); // blockedCandidates
      expect(screen.getByText("85%")).toBeInTheDocument(); // hardwareAttestationRatio
      expect(screen.getByText("4.8")).toBeInTheDocument(); // candidateFeedbackAverage
      expect(screen.getByText(/491823/)).toBeInTheDocument(); // quitPin

      // Test actions
      const scanBtn = screen.getByText(/Run Plagiarism Scan/i);
      fireEvent.click(scanBtn);
      expect(onScan).toHaveBeenCalled();

      const rotateBtn = screen.getByText(/Rotate Quit PIN/i);
      fireEvent.click(rotateBtn);
      expect(onRotate).toHaveBeenCalled();

      const csvBtn = screen.getByTitle("Export Forensic Audit as CSV");
      fireEvent.click(csvBtn);
      expect(onExport).toHaveBeenCalledWith("csv");
    });
  });

  describe("CandidateMonitorTable Component", () => {
    it("renders candidates and triggers select, unlock, and filter actions", () => {
      const onSelect = jest.fn();
      const onQuickUnlock = jest.fn();
      const onQuickReopen = jest.fn();
      const onViewDiff = jest.fn();

      render(
        <CandidateMonitorTable
          candidates={mockCandidates}
          onSelectCandidate={onSelect}
          onQuickUnlock={onQuickUnlock}
          onQuickReopen={onQuickReopen}
          onViewPlagiarismDiff={onViewDiff}
        />
      );

      // Verify candidates displayed
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();

      // Inspect timeline action
      const timelineBtns = screen.getAllByTitle("Inspect Forensic Timeline Dossier");
      expect(timelineBtns.length).toBe(2);
      fireEvent.click(timelineBtns[0]);
      expect(onSelect).toHaveBeenCalledWith("cand-1");

      // Quick unlock button should be present for blocked candidate Bob
      const unlockBtn = screen.getByTitle("Quick Unlock Session & Reset Device Lock");
      expect(unlockBtn).toBeInTheDocument();
      fireEvent.click(unlockBtn);
      expect(onQuickUnlock).toHaveBeenCalledWith("cand-2");

      // Filter pills
      const blockedPill = screen.getByText(/Blocked \(1\)/i);
      fireEvent.click(blockedPill);
      expect(screen.getByText("Bob Jones")).toBeInTheDocument();
      expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument();
    });
  });
});
