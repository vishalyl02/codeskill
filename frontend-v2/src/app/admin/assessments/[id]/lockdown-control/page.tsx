"use client";

import React, { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  Fingerprint,
  Radio,
  Clock,
  AlertTriangle,
  FileCheck2,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "@/config/api";
import TopKpiStrip from "./_components/TopKpiStrip";
import CandidateMonitorTable, {
  CandidateRecord,
  PlagiarismPairRecord,
} from "./_components/CandidateMonitorTable";
import CandidateForensicDrawer from "./_components/CandidateForensicDrawer";
import PlagiarismDiffViewerModal, {
  PlagiarismPairData,
} from "./_components/PlagiarismDiffViewerModal";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function LockdownControlPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const assessmentId = resolvedParams.id;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Command center data state
  const [data, setData] = useState<{
    assessment: {
      id: string;
      title: string;
      durationMinutes: number;
      minLockdownVersion: string;
    };
    kpi: any;
    analytics: any;
    candidates: CandidateRecord[];
    plagiarismFlaggedPairs: PlagiarismPairRecord[];
    quitPin?: string;
  } | null>(null);

  // Modal / Drawer states
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedPair, setSelectedPair] = useState<PlagiarismPairData | null>(null);
  const [isScanningPlagiarism, setIsScanningPlagiarism] = useState(false);
  const [isRotatingPin, setIsRotatingPin] = useState(false);
  const [quitPin, setQuitPin] = useState<string | null>(null);

  // Fetch command center data
  const fetchData = useCallback(
    async (manual = false) => {
      if (!assessmentId) return;
      if (manual) setIsRefreshing(true);
      try {
        const res = await api.get(`/exam-security/assessments/${assessmentId}/command-center`);
        const result = res.data?.data || res.data;
        setData(result);
        if (result.quitPin) {
          setQuitPin(result.quitPin);
        }
        setError(null);
        setLastRefreshedAt(new Date());
      } catch (err: any) {
        console.error("Failed to load command center:", err);
        setError(err?.response?.data?.message || err?.message || "Error fetching lockdown state");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [assessmentId]
  );

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 10s auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Selected candidate object
  const selectedCandidate = data?.candidates?.find(
    (c) => c.candidateId === selectedCandidateId
  );

  // Handler: Rotate Exit PIN
  const handleRotateQuitPin = async () => {
    setIsRotatingPin(true);
    try {
      const res = await api.post(`/exam-security/assessments/${assessmentId}/rotate-quit-pin`, {
        reason: "Admin rotated LockDown exit PIN",
      });
      const result = res.data?.data || res.data;
      if (result.quitPin) {
        setQuitPin(result.quitPin);
      }
      toast.success(`One-time proctor quit PIN: ${result.quitPin || "Generated"}`);
      await fetchData(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to rotate PIN");
    } finally {
      setIsRotatingPin(false);
    }
  };

  // Handler: Run Plagiarism Scan
  const handleRunPlagiarismScan = async () => {
    setIsScanningPlagiarism(true);
    try {
      const res = await api.post(`/exam-security/assessments/${assessmentId}/run-plagiarism-scan`);
      const result = res.data?.data || res.data;
      toast.success(
        `AST Plagiarism Scan complete: ${result.flaggedCount || 0} flagged pairs (>= 70% match)`
      );
      await fetchData(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Plagiarism scan failed");
    } finally {
      setIsScanningPlagiarism(false);
    }
  };

  // Handler: Quick Unlock
  const handleQuickUnlock = async (candidateId: string) => {
    try {
      await api.post(`/exam-security/assessments/${assessmentId}/candidates/${candidateId}/unlock`, {
        reason: "Quick Unlock from Command Center monitor table",
      });
      toast.success("Candidate session unlocked and device lock cleared");
      await fetchData(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to unlock candidate");
    }
  };

  // Handler: Quick Reopen
  const handleQuickReopen = async (candidateId: string) => {
    try {
      await api.post(
        `/exam-security/assessments/${assessmentId}/candidates/${candidateId}/reopen-submission`,
        {
          reason: "Quick Reopen from Command Center monitor table",
        }
      );
      toast.success("Attempt restored to in_progress via sharded SubmissionStore");
      await fetchData(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to reopen submission");
    }
  };

  // Handler: Unlock with Reason
  const handleUnlockWithReason = async (candidateId: string, reason: string) => {
    await api.post(`/exam-security/assessments/${assessmentId}/candidates/${candidateId}/unlock`, {
      reason,
    });
    toast.success("Candidate unlocked successfully");
    await fetchData(false);
  };

  // Handler: Reopen Submission with Reason
  const handleReopenWithReason = async (candidateId: string, reason: string) => {
    await api.post(
      `/exam-security/assessments/${assessmentId}/candidates/${candidateId}/reopen-submission`,
      {
        reason,
      }
    );
    toast.success("Attempt restored to in_progress");
    await fetchData(false);
  };

  // Handler: Extend Time
  const handleExtendTime = async (
    candidateId: string,
    extraMinutes: number,
    reason: string
  ) => {
    await api.post(
      `/exam-security/assessments/${assessmentId}/candidates/${candidateId}/extend-time`,
      {
        extraMinutes,
        reason,
      }
    );
    toast.success(`+${extraMinutes}m added to candidate's exam time`);
    await fetchData(false);
  };

  // Handler: Grant Preflight Waiver
  const handleGrantWaiver = async (
    candidateId: string,
    waiverType: string,
    reason: string
  ) => {
    await api.post(
      `/exam-security/assessments/${assessmentId}/candidates/${candidateId}/preflight-waiver`,
      {
        waiverType,
        reason,
      }
    );
    toast.success(`Signed preflight waiver (${waiverType}) granted`);
    await fetchData(false);
  };

  // Handler: Send Proctor Message / Force Command
  const handleSendProctorMessage = async (
    candidateId: string,
    message: string,
    action: "BANNER" | "FORCE_SUBMIT" | "FORCE_QUIT",
    reason: string
  ) => {
    await api.post(
      `/exam-security/assessments/${assessmentId}/candidates/${candidateId}/proctor-message`,
      {
        message,
        action,
        reason,
      }
    );
    toast.success(`Proctor action (${action}) dispatched to candidate heartbeat queue`);
    await fetchData(false);
  };

  // Handler: View Plagiarism Diff
  const handleViewPlagiarismDiff = (candidateAId: string, candidateBId: string) => {
    const pair = data?.plagiarismFlaggedPairs?.find(
      (p) =>
        (p.candidateA.id === candidateAId && p.candidateB.id === candidateBId) ||
        (p.candidateA.id === candidateBId && p.candidateB.id === candidateAId)
    );
    if (pair) {
      setSelectedPair({
        candidateA: pair.candidateA,
        candidateB: pair.candidateB,
        similarityPercentage: pair.similarityPercentage,
        sharedTokensCount: pair.sharedTokensCount,
        problemId: pair.problemId,
        codeA: (pair as any).codeA || "// Source code snippet for " + pair.candidateA.name,
        codeB: (pair as any).codeB || "// Source code snippet for " + pair.candidateB.name,
      });
    }
  };

  // Handler: Export Audit
  const handleExportAudit = (format: "csv" | "json") => {
    if (!data) return;

    if (format === "json") {
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lockdown-audit-${assessmentId}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported audit JSON successfully");
      return;
    }

    // CSV format
    const headers = [
      "Candidate ID",
      "Name",
      "Email",
      "Status",
      "OS",
      "Kiosk Tier",
      "Attestation Tier",
      "Risk Score",
      "Plagiarism Similarity %",
      "Violations Count",
      "Media Disconnects",
      "Last Heartbeat",
    ];

    const rows = (data.candidates || []).map((c) => [
      `"${c.candidateId}"`,
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.email}"`,
      `"${c.status}"`,
      `"${c.os}"`,
      `"${c.kioskTier}"`,
      `"${c.attestationTier}"`,
      c.compositeRiskScore,
      c.plagiarismSimilarity,
      c.violationsCount || 0,
      c.mediaDisconnects || 0,
      `"${c.lastHeartbeatAt ? new Date(c.lastHeartbeatAt).toISOString() : ""}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lockdown-candidates-${assessmentId}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported audit CSV successfully");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navigation Bar */}
      <div className="border-b border-border bg-card/60 backdrop-blur-xs sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/assessments"
            className="p-2 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-foreground">
                {data?.assessment?.title || "Assessment"}
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-mono">
                LockDown Command Center
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Assessment ID: <span className="font-mono">{assessmentId}</span> • Min Version:{" "}
              <span className="font-mono">{data?.assessment?.minLockdownVersion || "1.0.0"}</span>
            </p>
          </div>
        </div>

        {/* Polling & Refresh Bar */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-xl border border-border">
            <Radio
              className={`w-3.5 h-3.5 ${
                autoRefresh ? "text-emerald-400 animate-pulse" : "text-muted-foreground"
              }`}
            />
            <span className="text-[11px] text-muted-foreground">
              {autoRefresh ? "Live 10s Polling" : "Polling Paused"}
            </span>
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 ml-1 cursor-pointer"
            >
              {autoRefresh ? "Pause" : "Resume"}
            </button>
          </div>

          {lastRefreshedAt && (
            <span className="text-[11px] text-muted-foreground hidden sm:inline-block">
              Updated {lastRefreshedAt.toLocaleTimeString()}
            </span>
          )}

          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium border border-border transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {isLoading ? (
          <div className="py-24 text-center space-y-3">
            <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Connecting to LockDown Command Center telemetry pipeline...
            </p>
          </div>
        ) : error ? (
          <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>Failed to Load LockDown Command Center</span>
            </div>
            <p className="text-xs">{error}</p>
            <button
              type="button"
              onClick={() => fetchData(true)}
              className="mt-3 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        ) : data ? (
          <>
            {/* Top KPI & Operational Metrics Strip */}
            <TopKpiStrip
              kpi={data.kpi}
              analytics={data.analytics}
              onRotateQuitPin={handleRotateQuitPin}
              onRunPlagiarismScan={handleRunPlagiarismScan}
              onExportAudit={handleExportAudit}
              isScanningPlagiarism={isScanningPlagiarism}
              isRotatingPin={isRotatingPin}
              quitPin={quitPin}
            />

            {/* Virtualized Candidate Monitor Table */}
            <CandidateMonitorTable
              candidates={data.candidates}
              plagiarismPairs={data.plagiarismFlaggedPairs}
              onSelectCandidate={(cid) => setSelectedCandidateId(cid)}
              onQuickUnlock={handleQuickUnlock}
              onQuickReopen={handleQuickReopen}
              onViewPlagiarismDiff={handleViewPlagiarismDiff}
            />
          </>
        ) : null}
      </div>

      {/* Forensic Drawer */}
      <CandidateForensicDrawer
        assessmentId={assessmentId}
        candidateId={selectedCandidateId}
        candidateName={selectedCandidate?.name}
        candidateEmail={selectedCandidate?.email}
        isOpen={Boolean(selectedCandidateId)}
        onClose={() => setSelectedCandidateId(null)}
        onUnlock={handleUnlockWithReason}
        onReopenSubmission={handleReopenWithReason}
        onExtendTime={handleExtendTime}
        onGrantWaiver={handleGrantWaiver}
        onSendProctorMessage={handleSendProctorMessage}
      />

      {/* Plagiarism Code Diff Modal */}
      <PlagiarismDiffViewerModal
        isOpen={Boolean(selectedPair)}
        onClose={() => setSelectedPair(null)}
        pair={selectedPair}
      />
    </div>
  );
}
