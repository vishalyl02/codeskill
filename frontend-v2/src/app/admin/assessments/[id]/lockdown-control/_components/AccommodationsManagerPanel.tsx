"use client";

import React, { useState, useEffect } from "react";
import {
  Clock,
  Monitor,
  Volume2,
  Plus,
  Trash2,
  Save,
  Search,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";

export interface CandidateAccommodation {
  id: string;
  assessment_id: string;
  user_id: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  time_multiplier: number;
  secondary_display_allowed: boolean;
  screen_reader_allowed: boolean;
  custom_notes?: string;
  created_at: string;
}

interface AccommodationsManagerPanelProps {
  assessmentId: string;
  userRole?: "TA" | "INSTRUCTOR" | "ADMIN";
}

export default function AccommodationsManagerPanel({
  assessmentId,
  userRole = "INSTRUCTOR",
}: AccommodationsManagerPanelProps) {
  const [accommodations, setAccommodations] = useState<CandidateAccommodation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // New accommodation form
  const [newUserId, setNewUserId] = useState<string>("");
  const [newTimeMultiplier, setNewTimeMultiplier] = useState<number>(1.5);
  const [newSecondaryDisplay, setNewSecondaryDisplay] = useState<boolean>(false);
  const [newScreenReader, setNewScreenReader] = useState<boolean>(false);
  const [newNotes, setNewNotes] = useState<string>("");

  const fetchAccommodations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/assessments/${assessmentId}/accommodations`);
      if (res.ok) {
        const data = await res.json();
        setAccommodations(Array.isArray(data) ? data : data.data || []);
      }
    } catch (err) {
      console.error("Failed to load accommodations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccommodations();
  }, [assessmentId]);

  const handleSaveAccommodation = async () => {
    if (!newUserId.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/assessments/${assessmentId}/accommodations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: newUserId.trim(),
          timeMultiplier: Number(newTimeMultiplier),
          secondaryDisplayAllowed: Boolean(newSecondaryDisplay),
          screenReaderAllowed: Boolean(newScreenReader),
          customNotes: newNotes,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setNewUserId("");
        setNewNotes("");
        await fetchAccommodations();
      }
    } catch (err) {
      console.error("Failed to save accommodation:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccommodation = async (userId: string) => {
    try {
      await fetch(`/api/admin/assessments/${assessmentId}/accommodations/${userId}`, {
        method: "DELETE",
      });
      await fetchAccommodations();
    } catch (err) {
      console.error("Failed to delete accommodation:", err);
    }
  };

  const filtered = accommodations.filter((acc) => {
    const term = searchQuery.toLowerCase();
    const name = acc.user?.name?.toLowerCase() || "";
    const email = acc.user?.email?.toLowerCase() || "";
    const uid = acc.user_id.toLowerCase();
    return name.includes(term) || email.includes(term) || uid.includes(term);
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-400" />
            Candidate Exam Accommodations & Waivers
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure extra-time multipliers, assistive technology allowances, and multi-monitor waivers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search candidate..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Grant Accommodation
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400">Loading accommodations...</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-slate-800/80">
          <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs font-medium text-slate-300">No Custom Accommodations Granted</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            All students are following standard exam duration and hardware security constraints.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3">Candidate</th>
                <th className="py-2.5 px-3">Time Multiplier</th>
                <th className="py-2.5 px-3">Secondary Display Waiver</th>
                <th className="py-2.5 px-3">Screen Reader Waiver</th>
                <th className="py-2.5 px-3">Notes</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((acc) => (
                <tr key={acc.id} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-white">{acc.user?.name || "Student"}</div>
                    <div className="font-mono text-[11px] text-slate-400">{acc.user?.email || acc.user_id}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      {acc.time_multiplier}x
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    {acc.secondary_display_allowed ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Waived
                      </span>
                    ) : (
                      <span className="text-slate-500">Standard (Blocked)</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {acc.screen_reader_allowed ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Allowed
                      </span>
                    ) : (
                      <span className="text-slate-500">Disabled</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate">
                    {acc.custom_notes || "--"}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => handleDeleteAccommodation(acc.user_id)}
                      className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                      title="Revoke accommodation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Grant Accommodation Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Grant Candidate Accommodation
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Student User ID (UUID)</label>
                <input
                  type="text"
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Time Extension Multiplier</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1.25, 1.5, 2.0, 3.0].map((mult) => (
                    <button
                      key={mult}
                      type="button"
                      onClick={() => setNewTimeMultiplier(mult)}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                        newTimeMultiplier === mult
                          ? "bg-indigo-600 border-indigo-500 text-white"
                          : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {mult}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newSecondaryDisplay}
                    onChange={(e) => setNewSecondaryDisplay(e.target.checked)}
                    className="rounded border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-slate-300">Waiver for Secondary / External Display</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newScreenReader}
                    onChange={(e) => setNewScreenReader(e.target.checked)}
                    className="rounded border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-slate-300">Allow Screen Reader / Assistive Speech Synthesis</span>
                </label>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Administrative Notes</label>
                <textarea
                  placeholder="e.g. Approved medical accommodation request #4912"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2 text-xs">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAccommodation}
                disabled={saving || !newUserId.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "Saving..." : "Save Accommodation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
