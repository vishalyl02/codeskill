"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Clock,
  Radio,
  AlertTriangle,
  Lock,
  Unlock,
  Plus,
  Send,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  Megaphone,
} from "lucide-react";

export interface InvigilationStudent {
  attemptId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  status: string;
  score: number;
  startedAt?: string;
  expiresAt?: string;
  timeSpentSeconds: number;
  tabSwitchCount: number;
  fullscreenExitCount: number;
  violationsCount: number;
  extraTimeGrantedMinutes: number;
  gradeHeld: boolean;
  gradeHoldReason?: string;
  accommodation?: {
    timeMultiplier: number;
    extraMinutesFlat?: number;
    configuredByRole?: string;
    secondaryDisplayAllowed: boolean;
    screenReaderAllowed: boolean;
  } | null;
}

interface LiveClassroomInvigilationPanelProps {
  assessmentId: string;
  userRole?: "TA" | "INSTRUCTOR" | "ADMIN";
}

export default function LiveClassroomInvigilationPanel({
  assessmentId,
  userRole = "INSTRUCTOR",
}: LiveClassroomInvigilationPanelProps) {
  const [students, setStudents] = useState<InvigilationStudent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Broadcast modal state
  const [showBroadcastModal, setShowBroadcastModal] = useState<boolean>(false);
  const [broadcastMessage, setBroadcastMessage] = useState<string>("");
  const [broadcastSent, setBroadcastSent] = useState<boolean>(false);

  const apiBase =
    userRole === "ADMIN"
      ? `/api/admin/assessments/${assessmentId}`
      : `/api/assessments/${assessmentId}`;

  const fetchRoster = async () => {
    setLoading(true);
    try {
      let res = await fetch(`${apiBase}/invigilation-roster`);
      if (!res.ok && apiBase.includes("/admin/")) {
        res = await fetch(`/api/assessments/${assessmentId}/invigilation-roster`);
      }
      if (res.ok) {
        const data = await res.json();
        setStudents(Array.isArray(data) ? data : data.data || []);
      }
    } catch (err) {
      console.error("Failed to load invigilation roster:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
    const interval = setInterval(fetchRoster, 15000);
    return () => clearInterval(interval);
  }, [assessmentId, apiBase]);

  const handleGrantTime = async (studentId: string, extraMinutes: number) => {
    setActionLoadingId(studentId);
    try {
      let res = await fetch(`${apiBase}/invigilation-grant-time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, extraMinutes }),
      });
      if (!res.ok && apiBase.includes("/admin/")) {
        res = await fetch(`/api/assessments/${assessmentId}/invigilation-grant-time`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId, extraMinutes }),
        });
      }
      if (res.ok) {
        await fetchRoster();
      }
    } catch (err) {
      console.error("Failed to grant extra time:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleGradeHold = async (attemptId: string, currentHeld: boolean) => {
    setActionLoadingId(attemptId);
    try {
      let res = await fetch(`${apiBase}/invigilation-grade-hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          hold: !currentHeld,
          reason: !currentHeld ? "Held by proctor for integrity review" : "",
        }),
      });
      if (!res.ok && apiBase.includes("/admin/")) {
        res = await fetch(`/api/assessments/${assessmentId}/invigilation-grade-hold`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attemptId,
            hold: !currentHeld,
            reason: !currentHeld ? "Held by proctor for integrity review" : "",
          }),
        });
      }
      if (res.ok) {
        await fetchRoster();
      }
    } catch (err) {
      console.error("Failed to update grade hold:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSendBroadcast = () => {
    if (!broadcastMessage.trim()) return;
    setBroadcastSent(true);
    setTimeout(() => {
      setBroadcastSent(false);
      setShowBroadcastModal(false);
      setBroadcastMessage("");
    }, 1500);
  };

  const filtered = students.filter((s) => {
    const term = searchQuery.toLowerCase();
    return s.studentName.toLowerCase().includes(term) || s.studentEmail.toLowerCase().includes(term);
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-400" />
              Live Classroom Invigilation & Proctoring Roster
            </h2>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold uppercase tracking-wider">
              <Radio className="w-2.5 h-2.5 animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time candidate telemetry, instant extra-time grants, and exam grade hold controls.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search student..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <button
            onClick={() => setShowBroadcastModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Megaphone className="w-3.5 h-3.5" />
            Broadcast Message
          </button>

          <button
            onClick={fetchRoster}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            title="Refresh roster"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-sky-400" : ""}`} />
          </button>
        </div>
      </div>

      {loading && students.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400">Loading classroom roster...</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-slate-800/80">
          <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs font-medium text-slate-300">No Active Students in Examination</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            When students begin their exam attempts, their real-time telemetry will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3">Student</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Tab Switches</th>
                <th className="py-2.5 px-3">Integrity Flags</th>
                <th className="py-2.5 px-3">Extra Time</th>
                <th className="py-2.5 px-3">Grade Hold</th>
                <th className="py-2.5 px-3 text-right">Quick Time Grant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((s) => (
                <tr key={s.attemptId} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-white">{s.studentName}</div>
                    <div className="font-mono text-[11px] text-slate-400">{s.studentEmail}</div>
                    {s.accommodation && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {s.accommodation.timeMultiplier}x Accommodated
                        {Number(s.accommodation.extraMinutesFlat || 0) > 0 && ` (+${s.accommodation.extraMinutesFlat}m)`}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        s.status === "in_progress"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : s.status === "submitted"
                          ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    <span className={s.tabSwitchCount > 0 ? "text-amber-400 font-bold" : "text-slate-400"}>
                      {s.tabSwitchCount}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    {s.violationsCount > 0 ? (
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">
                        {s.violationsCount} flag(s)
                      </span>
                    ) : (
                      <span className="text-emerald-400">0 flags</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    {s.extraTimeGrantedMinutes > 0 ? (
                      <span className="text-sky-300 font-semibold">+{s.extraTimeGrantedMinutes} min</span>
                    ) : (
                      <span className="text-slate-500">None</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <button
                      onClick={() => handleToggleGradeHold(s.attemptId, s.gradeHeld)}
                      disabled={actionLoadingId === s.attemptId}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                        s.gradeHeld
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30"
                          : "bg-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {s.gradeHeld ? (
                        <>
                          <Lock className="w-3 h-3" /> Held
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3 h-3" /> Hold
                        </>
                      )}
                    </button>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleGrantTime(s.studentId, 5)}
                        disabled={actionLoadingId === s.studentId || s.status !== "in_progress"}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        +5m
                      </button>
                      <button
                        onClick={() => handleGrantTime(s.studentId, 10)}
                        disabled={actionLoadingId === s.studentId || s.status !== "in_progress"}
                        className="px-2 py-1 rounded bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 disabled:opacity-40 text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        +10m
                      </button>
                      <button
                        onClick={() => handleGrantTime(s.studentId, 15)}
                        disabled={actionLoadingId === s.studentId || s.status !== "in_progress"}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        +15m
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Broadcast Message Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-sky-400" />
              Send Live Classroom Broadcast
            </h3>
            <p className="text-xs text-slate-400">
              This message will flash as a non-dismissible banner across every active candidate's LockDown client immediately.
            </p>

            <div className="pt-2">
              <textarea
                rows={3}
                placeholder="e.g. Please note: Clarification for Question 3 has been posted. You have 15 minutes remaining."
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>

            {broadcastSent ? (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Broadcast Dispatched to All Active Clients!
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  onClick={() => setShowBroadcastModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendBroadcast}
                  disabled={!broadcastMessage.trim()}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send Broadcast
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
