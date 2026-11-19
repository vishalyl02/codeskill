"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  History,
  Unlock,
  RotateCcw,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Send,
  AlertTriangle,
  Monitor,
  VideoOff,
  Flame,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Award,
} from "lucide-react";

export interface TimelineEvent {
  id: string;
  timestamp: number;
  eventType: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  title: string;
  description: string;
  metadata: Record<string, any>;
}

export interface CandidateDossier {
  candidateId: string;
  sessionStatus: string;
  attemptStatus: string;
  timeline: TimelineEvent[];
}

interface CandidateForensicDrawerProps {
  assessmentId: string;
  candidateId: string | null;
  candidateName?: string;
  candidateEmail?: string;
  isOpen: boolean;
  onClose: () => void;
  onUnlock: (candidateId: string, reason: string) => Promise<void>;
  onReopenSubmission: (candidateId: string, reason: string) => Promise<void>;
  onExtendTime: (candidateId: string, extraMinutes: number, reason: string) => Promise<void>;
  onGrantWaiver: (candidateId: string, waiverType: string, reason: string) => Promise<void>;
  onSendProctorMessage: (
    candidateId: string,
    message: string,
    action: "BANNER" | "FORCE_SUBMIT" | "FORCE_QUIT",
    reason: string
  ) => Promise<void>;
}

export default function CandidateForensicDrawer({
  assessmentId,
  candidateId,
  candidateName = "Candidate",
  candidateEmail = "",
  isOpen,
  onClose,
  onUnlock,
  onReopenSubmission,
  onExtendTime,
  onGrantWaiver,
  onSendProctorMessage,
}: CandidateForensicDrawerProps) {
  const [dossier, setDossier] = useState<CandidateDossier | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Action states
  const [actionReason, setActionReason] = useState("");
  const [extraMinutes, setExtraMinutes] = useState(10);
  const [selectedWaiver, setSelectedWaiver] = useState("secondary_display");
  const [proctorMessageText, setProctorMessageText] = useState("");
  const [proctorAction, setProctorAction] = useState<"BANNER" | "FORCE_SUBMIT" | "FORCE_QUIT">("BANNER");
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");

  // Fetch timeline
  const fetchTimeline = async () => {
    if (!candidateId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/exam-security/assessments/${assessmentId}/candidates/${candidateId}/forensic-timeline`
      );
      if (!res.ok) {
        throw new Error(`Failed to load dossier: ${res.statusText}`);
      }
      const data = await res.json();
      setDossier(data);
    } catch (err: any) {
      setError(err?.message || "Error fetching forensic timeline");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && candidateId) {
      fetchTimeline();
    } else {
      setDossier(null);
      setActionReason("");
    }
  }, [isOpen, candidateId, assessmentId]);

  if (!isOpen || !candidateId) return null;

  // Filtered timeline events
  const filteredEvents = (dossier?.timeline || []).filter((ev) => {
    if (severityFilter === "ALL") return true;
    return ev.severity === severityFilter;
  });

  const handleAction = async (actionFn: () => Promise<void>) => {
    setIsSubmittingAction(true);
    try {
      await actionFn();
      await fetchTimeline();
      setActionReason("");
    } catch (err: any) {
      alert(`Action failed: ${err?.message || "Unknown error"}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-background/80 backdrop-blur-xs flex justify-end">
      {/* Backdrop click to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer content */}
      <div className="w-full max-w-2xl bg-card border-l border-border h-full shadow-2xl flex flex-col z-10 overflow-hidden">
        {/* Drawer Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground text-sm">{candidateName}</h3>
                {dossier && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                    Status: {dossier.sessionStatus}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{candidateEmail} • ID: {candidateId}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchTimeline}
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground transition-colors cursor-pointer"
              title="Refresh timeline"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground transition-colors cursor-pointer"
              title="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Action Resolution Console */}
          <div className="bg-muted/30 border border-border rounded-2xl p-4 space-y-4">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-indigo-400" />
              Live Proctor Intervention & Overrides
            </h4>

            {/* Audit Reason Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Proctor Audit Log Reason (Required for Override Verification):
              </label>
              <input
                type="text"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="e.g. Verified legitimate multi-monitor setup / Candidate reported false positive crash"
                className="w-full px-3 py-1.5 text-xs rounded-xl bg-background border border-border focus:outline-hidden focus:border-indigo-500 text-foreground"
              />
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-2">
              {/* Unlock candidate */}
              <button
                type="button"
                disabled={isSubmittingAction}
                onClick={() =>
                  handleAction(() => onUnlock(candidateId, actionReason || "Proctor Manual Unlock"))
                }
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                <Unlock className="w-3.5 h-3.5" />
                Unlock & Reset Device Lock
              </button>

              {/* Reopen submission */}
              <button
                type="button"
                disabled={isSubmittingAction}
                onClick={() =>
                  handleAction(() =>
                    onReopenSubmission(
                      candidateId,
                      actionReason || "Proctor Restored Abrupt Submission"
                    )
                  )
                }
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore to In-Progress
              </button>
            </div>

            {/* Extend Time Row */}
            <div className="p-3 rounded-xl bg-background border border-border flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-medium text-foreground">Extend Time:</span>
                <div className="flex items-center gap-1">
                  {[5, 10, 15, 30].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setExtraMinutes(mins)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-mono cursor-pointer transition-colors ${
                        extraMinutes === mins
                          ? "bg-sky-600 text-white"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      +{mins}m
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={isSubmittingAction}
                onClick={() =>
                  handleAction(() =>
                    onExtendTime(
                      candidateId,
                      extraMinutes,
                      actionReason || `Proctor granted +${extraMinutes}m extra time`
                    )
                  )
                }
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                Grant +{extraMinutes}m
              </button>
            </div>

            {/* Preflight Waiver Row */}
            <div className="p-3 rounded-xl bg-background border border-border flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-medium text-foreground">Preflight Waiver:</span>
                <select
                  value={selectedWaiver}
                  onChange={(e) => setSelectedWaiver(e.target.value)}
                  className="px-2 py-1 rounded-lg text-xs bg-muted border border-border text-foreground"
                >
                  <option value="secondary_display">Secondary Display</option>
                  <option value="x11_session">X11 / Wayland Session</option>
                  <option value="hardware_mic">Hardware Microphone</option>
                  <option value="software_attestation">Software Attestation</option>
                </select>
              </div>

              <button
                type="button"
                disabled={isSubmittingAction}
                onClick={() =>
                  handleAction(() =>
                    onGrantWaiver(
                      candidateId,
                      selectedWaiver,
                      actionReason || `Proctor granted ${selectedWaiver} waiver`
                    )
                  )
                }
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                Issue Signed Waiver
              </button>
            </div>

            {/* Remote Proctor Message & Force Actions */}
            <div className="p-3 rounded-xl bg-background border border-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-indigo-400" />
                  Remote Proctor Command / Banner:
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setProctorAction("BANNER")}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono cursor-pointer ${
                      proctorAction === "BANNER"
                        ? "bg-indigo-600 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    BANNER
                  </button>
                  <button
                    type="button"
                    onClick={() => setProctorAction("FORCE_SUBMIT")}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono cursor-pointer ${
                      proctorAction === "FORCE_SUBMIT"
                        ? "bg-amber-600 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    FORCE SUBMIT
                  </button>
                  <button
                    type="button"
                    onClick={() => setProctorAction("FORCE_QUIT")}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono cursor-pointer ${
                      proctorAction === "FORCE_QUIT"
                        ? "bg-rose-600 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    FORCE QUIT
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={proctorMessageText}
                  onChange={(e) => setProctorMessageText(e.target.value)}
                  placeholder={
                    proctorAction === "BANNER"
                      ? "Message to candidate (e.g. Please face the webcam directly)"
                      : `Reason for remote ${proctorAction.toLowerCase()}`
                  }
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-muted/50 border border-border text-foreground"
                />
                <button
                  type="button"
                  disabled={isSubmittingAction || !proctorMessageText.trim()}
                  onClick={() =>
                    handleAction(() =>
                      onSendProctorMessage(
                        candidateId,
                        proctorMessageText,
                        proctorAction,
                        actionReason || `Proctor command: ${proctorAction}`
                      ).then(() => setProctorMessageText(""))
                    )
                  }
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Forensic Timeline Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-4 h-4 text-indigo-400" />
                Chronological Forensic Dossier ({filteredEvents.length} events)
              </h4>

              {/* Severity filter */}
              <div className="flex items-center gap-1">
                {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverityFilter(sev)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono cursor-pointer transition-colors ${
                      severityFilter === sev
                        ? "bg-indigo-600 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                Loading chronological audit log...
              </div>
            ) : error ? (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {error}
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No events logged matching this severity filter.
              </div>
            ) : (
              <div className="relative pl-6 space-y-3 border-l-2 border-border/80">
                {filteredEvents.map((ev) => {
                  const isExpanded = expandedEventId === ev.id;
                  const sevBadge =
                    ev.severity === "CRITICAL"
                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      : ev.severity === "HIGH"
                      ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                      : ev.severity === "MEDIUM"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : ev.severity === "LOW"
                      ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                      : "bg-muted text-muted-foreground border-border";

                  return (
                    <div key={ev.id} className="relative group">
                      {/* Timeline Dot */}
                      <div className="absolute -left-[31px] top-1.5 w-3 h-3 rounded-full bg-card border-2 border-indigo-500 group-hover:scale-125 transition-transform" />

                      <div className="p-3 rounded-xl bg-card border border-border shadow-xs hover:border-indigo-500/40 transition-colors">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-foreground">{ev.title}</span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono border ${sevBadge}`}
                            >
                              {ev.severity}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {new Date(ev.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>

                        {ev.description && (
                          <p className="text-xs text-muted-foreground mb-1.5">{ev.description}</p>
                        )}

                        {/* Collapsible Metadata */}
                        {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedEventId(isExpanded ? null : ev.id)
                              }
                              className="flex items-center gap-1 text-[10px] font-mono text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                              <span>
                                {isExpanded ? "Hide Metadata" : "Inspect Raw Metadata"}
                              </span>
                            </button>

                            {isExpanded && (
                              <pre className="mt-1.5 p-2 rounded-lg bg-black/40 border border-border/60 text-[10px] font-mono text-emerald-400 overflow-x-auto max-h-48">
                                {JSON.stringify(ev.metadata, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
