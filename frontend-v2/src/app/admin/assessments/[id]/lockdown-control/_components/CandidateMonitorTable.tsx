"use client";

import React, { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Search,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  History,
  Unlock,
  RotateCcw,
  Monitor,
  Flame,
  FileCode,
  CheckCircle2,
  Clock,
  Radio,
} from "lucide-react";

export interface CandidateRecord {
  candidateId: string;
  name: string;
  email: string;
  status: "ACTIVE" | "BLOCKED" | "SUBMITTED" | "ABRUPT_SUBMIT" | "DISCONNECTED" | string;
  kioskTier: string;
  os: string;
  attestationTier: string;
  compositeRiskScore: number;
  plagiarismSimilarity: number;
  lastHeartbeatAt?: string | Date;
  dwellTimeMs?: number;
  violationsCount?: number;
  mediaDisconnects?: number;
  isAbruptSubmit?: boolean;
}

export interface PlagiarismPairRecord {
  candidateA: { id: string; name: string };
  candidateB: { id: string; name: string };
  similarityPercentage: number;
  sharedTokensCount: number;
  problemId?: string;
}

interface CandidateMonitorTableProps {
  candidates: CandidateRecord[];
  plagiarismPairs?: PlagiarismPairRecord[];
  onSelectCandidate: (candidateId: string) => void;
  onQuickUnlock: (candidateId: string) => void;
  onQuickReopen: (candidateId: string) => void;
  onViewPlagiarismDiff: (candidateAId: string, candidateBId: string) => void;
}

type FilterPill =
  | "ALL"
  | "ACTIVE"
  | "BLOCKED"
  | "ABRUPT_SUBMIT"
  | "HIGH_RISK"
  | "HARDWARE_DISCONNECT"
  | "PLAGIARISM_FLAGGED";

export default function CandidateMonitorTable({
  candidates,
  plagiarismPairs = [],
  onSelectCandidate,
  onQuickUnlock,
  onQuickReopen,
  onViewPlagiarismDiff,
}: CandidateMonitorTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterPill>("ALL");

  // Filter candidates
  const filteredCandidates = useMemo(() => {
    let result = candidates;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.candidateId.toLowerCase().includes(q)
      );
    }

    // Category filter
    switch (activeFilter) {
      case "ACTIVE":
        return result.filter((c) => c.status === "ACTIVE" || c.status === "in_progress");
      case "BLOCKED":
        return result.filter((c) => c.status === "BLOCKED" || c.status === "disqualified");
      case "ABRUPT_SUBMIT":
        return result.filter((c) => c.status === "ABRUPT_SUBMIT" || c.isAbruptSubmit);
      case "HIGH_RISK":
        return result.filter((c) => c.compositeRiskScore >= 50);
      case "HARDWARE_DISCONNECT":
        return result.filter((c) => (c.mediaDisconnects || 0) > 0);
      case "PLAGIARISM_FLAGGED":
        return result.filter((c) => (c.plagiarismSimilarity || 0) >= 70);
      default:
        return result;
    }
  }, [candidates, searchQuery, activeFilter]);

  // Virtualizer parent ref
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: filteredCandidates.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 68,
    overscan: 10,
  });

  // Calculate pill counts
  const counts = useMemo(() => {
    return {
      all: candidates.length,
      active: candidates.filter((c) => c.status === "ACTIVE" || c.status === "in_progress").length,
      blocked: candidates.filter((c) => c.status === "BLOCKED" || c.status === "disqualified").length,
      abrupt: candidates.filter((c) => c.status === "ABRUPT_SUBMIT" || c.isAbruptSubmit).length,
      highRisk: candidates.filter((c) => c.compositeRiskScore >= 50).length,
      disconnects: candidates.filter((c) => (c.mediaDisconnects || 0) > 0).length,
      plagiarism: candidates.filter((c) => (c.plagiarismSimilarity || 0) >= 70).length,
    };
  }, [candidates]);

  return (
    <div className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden flex flex-col">
      {/* Controls Bar */}
      <div className="p-4 border-b border-border flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidate name, email, or ID..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-muted/50 border border-border focus:outline-hidden focus:border-indigo-500 text-foreground transition-colors placeholder:text-muted-foreground"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setActiveFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              activeFilter === "ALL"
                ? "bg-indigo-600 text-white"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("ACTIVE")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              activeFilter === "ACTIVE"
                ? "bg-emerald-600 text-white"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            Active ({counts.active})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("BLOCKED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              activeFilter === "BLOCKED"
                ? "bg-rose-600 text-white"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            Blocked ({counts.blocked})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("ABRUPT_SUBMIT")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              activeFilter === "ABRUPT_SUBMIT"
                ? "bg-amber-600 text-white"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            Abrupt Exit ({counts.abrupt})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("HIGH_RISK")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              activeFilter === "HIGH_RISK"
                ? "bg-orange-600 text-white"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            High Risk ({counts.highRisk})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("HARDWARE_DISCONNECT")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              activeFilter === "HARDWARE_DISCONNECT"
                ? "bg-violet-600 text-white"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            Outages ({counts.disconnects})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("PLAGIARISM_FLAGGED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
              activeFilter === "PLAGIARISM_FLAGGED"
                ? "bg-red-700 text-white"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
            }`}
          >
            Plagiarism ({counts.plagiarism})
          </button>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        <div className="col-span-3">Candidate</div>
        <div className="col-span-2">Client Attestation</div>
        <div className="col-span-2">Security Status</div>
        <div className="col-span-1 text-center">Risk</div>
        <div className="col-span-1 text-center">Plagiarism</div>
        <div className="col-span-1 text-center">Violations</div>
        <div className="col-span-2 text-right pr-2">Proctor Actions</div>
      </div>

      {/* Virtualized Rows Container */}
      <div
        ref={parentRef}
        className="overflow-y-auto max-h-[580px] min-h-[240px] divide-y divide-border"
      >
        {filteredCandidates.length === 0 ? (
          <div className="py-16 text-center text-xs text-muted-foreground">
            No candidates matching current filter criteria.
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const c = filteredCandidates[virtualRow.index];
              const isBlocked = c.status === "BLOCKED" || c.status === "disqualified";
              const isAbrupt = c.status === "ABRUPT_SUBMIT" || c.isAbruptSubmit;
              const isSubmitted = c.status === "SUBMITTED" || c.status === "submitted";

              // Risk score styling
              const riskColor =
                c.compositeRiskScore >= 60
                  ? "text-rose-500 bg-rose-500/10 border-rose-500/20"
                  : c.compositeRiskScore >= 30
                  ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
                  : "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";

              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-muted/40 transition-colors text-xs border-b border-border/50"
                >
                  {/* Candidate Info */}
                  <div className="col-span-3 flex flex-col justify-center min-w-0 pr-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-semibold text-foreground truncate">{c.name}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground truncate">{c.email}</span>
                    <span className="text-[10px] text-muted-foreground/80 font-mono truncate">
                      ID: {c.candidateId.substring(0, 12)}...
                    </span>
                  </div>

                  {/* OS & Kiosk Attestation */}
                  <div className="col-span-2 flex flex-col gap-1 justify-center min-w-0">
                    <div className="flex items-center gap-1 text-[11px] text-foreground truncate">
                      <Monitor className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="capitalize truncate font-mono">{c.os || "Web"}</span>
                      <span className="text-muted-foreground font-mono truncate text-[10px]">
                        ({c.kioskTier?.replace(/_/g, " ") || "standard"})
                      </span>
                    </div>
                    <div>
                      {c.attestationTier === "hardware_tpm_enclave" ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">
                          <ShieldCheck className="w-3 h-3" /> Hardware TPM
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-500/10 text-slate-400 border border-slate-500/20 text-[10px] font-mono">
                          <Radio className="w-3 h-3" /> Software Attestation
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Security Status */}
                  <div className="col-span-2 flex flex-col gap-1 justify-center">
                    <div>
                      {isBlocked ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[11px] font-semibold">
                          <ShieldAlert className="w-3 h-3" /> Blocked
                        </span>
                      ) : isAbrupt ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-semibold">
                          <AlertTriangle className="w-3 h-3" /> Abrupt Exit
                        </span>
                      ) : isSubmitted ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[11px] font-semibold">
                          <CheckCircle2 className="w-3 h-3" /> Submitted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
                          <Clock className="w-3 h-3" /> Active
                        </span>
                      )}
                    </div>
                    {c.lastHeartbeatAt && (
                      <span className="text-[10px] text-muted-foreground font-mono truncate">
                        Last ping: {new Date(c.lastHeartbeatAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  {/* Risk Score */}
                  <div className="col-span-1 flex justify-center items-center">
                    <span
                      className={`px-2 py-1 rounded-lg text-xs font-mono font-bold border ${riskColor}`}
                    >
                      {c.compositeRiskScore}
                    </span>
                  </div>

                  {/* Plagiarism Similarity */}
                  <div className="col-span-1 flex justify-center items-center">
                    {c.plagiarismSimilarity >= 70 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const pair = plagiarismPairs.find(
                            (p) =>
                              p.candidateA.id === c.candidateId ||
                              p.candidateB.id === c.candidateId
                          );
                          if (pair) {
                            onViewPlagiarismDiff(pair.candidateA.id, pair.candidateB.id);
                          }
                        }}
                        className="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-bold font-mono hover:bg-rose-500/30 transition-colors cursor-pointer"
                        title="Click to view code diff comparison"
                      >
                        {c.plagiarismSimilarity}%
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {c.plagiarismSimilarity > 0 ? `${c.plagiarismSimilarity}%` : "—"}
                      </span>
                    )}
                  </div>

                  {/* Violations Count */}
                  <div className="col-span-1 flex justify-center items-center">
                    {(c.violationsCount || 0) > 0 ? (
                      <span className="flex items-center gap-0.5 text-rose-400 font-mono text-xs font-bold">
                        <Flame className="w-3 h-3" />
                        {c.violationsCount}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[11px] font-mono">0</span>
                    )}
                  </div>

                  {/* Proctor Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-1.5 pr-2">
                    {/* Inspect Forensic Timeline */}
                    <button
                      type="button"
                      onClick={() => onSelectCandidate(c.candidateId)}
                      className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-colors cursor-pointer"
                      title="Inspect Forensic Timeline Dossier"
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>

                    {/* Quick Unlock if blocked */}
                    {isBlocked && (
                      <button
                        type="button"
                        onClick={() => onQuickUnlock(c.candidateId)}
                        className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors cursor-pointer"
                        title="Quick Unlock Session & Reset Device Lock"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Quick Reopen if abrupt or submitted */}
                    {(isAbrupt || isSubmitted) && (
                      <button
                        type="button"
                        onClick={() => onQuickReopen(c.candidateId)}
                        className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-colors cursor-pointer"
                        title="Reopen Attempt to In-Progress via Sharded Store"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
