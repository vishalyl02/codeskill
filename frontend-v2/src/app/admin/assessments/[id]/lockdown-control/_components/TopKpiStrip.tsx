"use client";

import React from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  CheckCircle2,
  AlertOctagon,
  VideoOff,
  Copy,
  Star,
  RefreshCw,
  KeyRound,
  Download,
  Fingerprint,
  Monitor,
  Flame,
} from "lucide-react";

interface TopKpiStripProps {
  kpi: {
    activeCandidates: number;
    blockedCandidates: number;
    cleanSubmissions: number;
    abruptSubmissions: number;
    totalCandidates: number;
    hardwareAttestationRatio: number;
    mediaDisconnectRate: number;
    plagiarismAlertCount: number;
    candidateFeedbackAverage: number;
  };
  analytics: {
    osDistribution: Record<string, number>;
    kioskTierBreakdown: Record<string, number>;
    attestationPosture: { hardwareTPM: number; softwareAttestation: number };
    violationHeatmap: Record<string, number>;
    mediaOutageStats: { disconnectCount: number; totalOutageDurationSeconds: number };
    feedback: {
      averageRating: number;
      totalResponses: number;
      technicalIssuesCounts: Record<string, number>;
      recentComments: Array<{ rating: number; comment?: string; candidateId: string }>;
    };
  };
  onRotateQuitPin: () => void;
  onRunPlagiarismScan: () => void;
  onExportAudit: (format: "csv" | "json") => void;
  isScanningPlagiarism: boolean;
  isRotatingPin: boolean;
  quitPin?: string | null;
}

export default function TopKpiStrip({
  kpi,
  analytics,
  onRotateQuitPin,
  onRunPlagiarismScan,
  onExportAudit,
  isScanningPlagiarism,
  isRotatingPin,
  quitPin,
}: TopKpiStripProps) {
  return (
    <div className="space-y-4">
      {/* Action Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-2xl p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
            <Fingerprint className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">
              LockDown Command Center & Live Recovery Console
            </h2>
            <p className="text-xs text-muted-foreground">
              Authoritative client attestation posture, forensic timelines, and real-time proctor interventions.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {quitPin && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Quit PIN: <strong>{quitPin}</strong></span>
            </div>
          )}

          <button
            type="button"
            onClick={onRotateQuitPin}
            disabled={isRotatingPin}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-secondary hover:bg-secondary/80 text-secondary-foreground border border-border transition-colors cursor-pointer disabled:opacity-50"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-500" />
            {isRotatingPin ? "Rotating..." : "Rotate Quit PIN"}
          </button>

          <button
            type="button"
            onClick={onRunPlagiarismScan}
            disabled={isScanningPlagiarism}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <Copy className="w-3.5 h-3.5" />
            {isScanningPlagiarism ? "Scanning Codes..." : "Run Plagiarism Scan"}
          </button>

          <div className="flex items-center rounded-xl border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => onExportAudit("csv")}
              className="flex items-center gap-1 px-2.5 py-2 text-xs font-medium bg-muted/60 hover:bg-muted text-foreground transition-colors cursor-pointer"
              title="Export Forensic Audit as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <div className="w-[1px] h-6 bg-border" />
            <button
              type="button"
              onClick={() => onExportAudit("json")}
              className="flex items-center gap-1 px-2.5 py-2 text-xs font-medium bg-muted/60 hover:bg-muted text-foreground transition-colors cursor-pointer"
              title="Export Forensic Audit as JSON"
            >
              JSON
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* 1. Total & Active */}
        <div className="bg-card border border-border rounded-2xl p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-1">
            <span>Candidates</span>
            <Users className="w-4 h-4 text-sky-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">{kpi.totalCandidates}</span>
            <span className="text-xs text-sky-400 font-semibold">{kpi.activeCandidates} active</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {kpi.cleanSubmissions} finished
          </div>
        </div>

        {/* 2. Blocked / Terminated */}
        <div className="bg-card border border-border rounded-2xl p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-1">
            <span>Lockouts</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${kpi.blockedCandidates > 0 ? "text-rose-500" : "text-foreground"}`}>
              {kpi.blockedCandidates}
            </span>
            <span className="text-xs text-muted-foreground">blocked</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Requires proctor unblock
          </div>
        </div>

        {/* 3. Abrupt Submissions */}
        <div className="bg-card border border-border rounded-2xl p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-1">
            <span>Abrupt Exits</span>
            <AlertOctagon className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${kpi.abruptSubmissions > 0 ? "text-amber-500" : "text-foreground"}`}>
              {kpi.abruptSubmissions}
            </span>
            <span className="text-xs text-muted-foreground">auto-submitted</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Restorable to in_progress
          </div>
        </div>

        {/* 4. Hardware TPM Posture */}
        <div className="bg-card border border-border rounded-2xl p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-1">
            <span>Hardware TPM</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              {kpi.hardwareAttestationRatio}%
            </span>
            <span className="text-xs text-emerald-400 font-semibold">enclave</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {analytics.attestationPosture.hardwareTPM} HW / {analytics.attestationPosture.softwareAttestation} SW
          </div>
        </div>

        {/* 5. Media Disconnect Outages */}
        <div className="bg-card border border-border rounded-2xl p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-1">
            <span>Media Outages</span>
            <VideoOff className="w-4 h-4 text-violet-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              {analytics.mediaOutageStats.disconnectCount}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {analytics.mediaOutageStats.totalOutageDurationSeconds}s total
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Rate: {kpi.mediaDisconnectRate}/candidate
          </div>
        </div>

        {/* 6. Plagiarism Alerts */}
        <div className="bg-card border border-border rounded-2xl p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-1">
            <span>Plagiarism Flags</span>
            <Copy className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${kpi.plagiarismAlertCount > 0 ? "text-rose-400" : "text-foreground"}`}>
              {kpi.plagiarismAlertCount}
            </span>
            <span className="text-xs text-muted-foreground">pairs &ge; 70%</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            AST Winnowing similarity
          </div>
        </div>

        {/* 7. Candidate Feedback */}
        <div className="bg-card border border-border rounded-2xl p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium mb-1">
            <span>Candidate Rating</span>
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              {kpi.candidateFeedbackAverage}
            </span>
            <span className="text-xs text-muted-foreground">/ 5.0</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {analytics.feedback.totalResponses} student reviews
          </div>
        </div>
      </div>

      {/* Operational Breakdown Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* OS & Kiosk Enforcement Breakdown */}
        <div className="bg-card border border-border rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3 text-xs font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <Monitor className="w-4 h-4 text-indigo-400" />
              OS & Kiosk Enforcement Tier
            </span>
          </div>
          <div className="space-y-2 text-xs">
            {Object.keys(analytics.kioskTierBreakdown).length === 0 && (
              <p className="text-muted-foreground italic text-[11px]">No active client attestations yet.</p>
            )}
            {Object.entries(analytics.kioskTierBreakdown).map(([tier, count]) => {
              const total = kpi.totalCandidates || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={tier} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-mono text-foreground capitalize">{tier.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground">{count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Violation Heatmap */}
        <div className="bg-card border border-border rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3 text-xs font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-rose-500" />
              Violation Heatmap
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            {Object.keys(analytics.violationHeatmap).length === 0 && (
              <p className="text-muted-foreground italic text-[11px]">No security violations logged yet.</p>
            )}
            {Object.entries(analytics.violationHeatmap).map(([type, count]) => (
              <div
                key={type}
                className="flex items-center justify-between py-1 px-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px]"
              >
                <span className="font-mono truncate max-w-[200px]">{type.replace(/_/g, " ")}</span>
                <span className="font-bold">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Student Feedback & Reported Issues */}
        <div className="bg-card border border-border rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3 text-xs font-semibold text-foreground">
            <span className="flex items-center gap-1.5">
              <Star className="w-4 h-4 text-amber-400" />
              Post-Exam Candidate Feedback
            </span>
            <span className="text-[11px] text-muted-foreground">
              {analytics.feedback.totalResponses} submitted
            </span>
          </div>
          <div className="space-y-2 text-xs">
            {analytics.feedback.recentComments.length === 0 && (
              <p className="text-muted-foreground italic text-[11px]">No post-exam feedback submitted yet.</p>
            )}
            {analytics.feedback.recentComments.slice(-3).map((comm, idx) => (
              <div key={idx} className="p-2 rounded-xl bg-muted/40 border border-border text-[11px] space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex text-amber-400">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i}>{i < comm.rating ? "★" : "☆"}</span>
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Candidate {comm.candidateId.substring(0, 8)}
                  </span>
                </div>
                {comm.comment && <p className="text-foreground italic">&ldquo;{comm.comment}&rdquo;</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
