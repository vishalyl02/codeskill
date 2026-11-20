"use client";

import React, { useState, useEffect } from "react";
import {
  Flame,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  BarChart2,
} from "lucide-react";

export interface QuestionFrictionStat {
  questionId: string;
  totalAttempts: number;
  successRate: number;
  averageTimeSpentSeconds: number;
  pasteCount: number;
  frictionScore: number;
  difficultyTier: "HIGH_FRICTION" | "MODERATE" | "SMOOTH";
}

interface QuestionFrictionHeatmapProps {
  assessmentId: string;
}

export default function QuestionFrictionHeatmap({
  assessmentId,
}: QuestionFrictionHeatmapProps) {
  const [stats, setStats] = useState<QuestionFrictionStat[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<"friction" | "time" | "success">("friction");

  const fetchFriction = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/assessments/${assessmentId}/friction-analytics`);
      if (res.ok) {
        const data = await res.json();
        setStats(Array.isArray(data) ? data : data.data || []);
      }
    } catch (err) {
      console.error("Failed to load friction analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFriction();
  }, [assessmentId]);

  const sorted = [...stats].sort((a, b) => {
    if (sortBy === "friction") return b.frictionScore - a.frictionScore;
    if (sortBy === "time") return b.averageTimeSpentSeconds - a.averageTimeSpentSeconds;
    return a.successRate - b.successRate;
  });

  const tierBadge = (tier: string) => {
    if (tier === "HIGH_FRICTION") {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
          <Flame className="w-3 h-3 text-rose-400" /> High Friction
        </span>
      );
    }
    if (tier === "MODERATE") {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Moderate
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Smooth
      </span>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-rose-400" />
            Per-Question Friction & Student Struggle Heatmap
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Identifies questions where candidates spent disproportionate time, encountered errors, or had high paste frequencies.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Sort by:</span>
          <button
            onClick={() => setSortBy("friction")}
            className={`px-2.5 py-1 rounded-lg font-medium cursor-pointer ${
              sortBy === "friction" ? "bg-rose-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            Friction Score
          </button>
          <button
            onClick={() => setSortBy("time")}
            className={`px-2.5 py-1 rounded-lg font-medium cursor-pointer ${
              sortBy === "time" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            Time Spent
          </button>
          <button
            onClick={() => setSortBy("success")}
            className={`px-2.5 py-1 rounded-lg font-medium cursor-pointer ${
              sortBy === "success" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            Success Rate
          </button>
          <button
            onClick={fetchFriction}
            disabled={loading}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 ml-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-sky-400" : ""}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400">Loading question friction metrics...</div>
      ) : sorted.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-slate-800/80">
          <BarChart2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs font-medium text-slate-300">No Submission Response Telemetry Yet</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Per-question friction metrics will be computed automatically as candidates submit responses.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3">Question ID</th>
                <th className="py-2.5 px-3">Attempts</th>
                <th className="py-2.5 px-3">Success Rate</th>
                <th className="py-2.5 px-3">Avg Time Spent</th>
                <th className="py-2.5 px-3">Paste Count</th>
                <th className="py-2.5 px-3">Friction Score</th>
                <th className="py-2.5 px-3 text-right">Struggle Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sorted.map((stat) => (
                <tr key={stat.questionId} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-3 font-mono font-semibold text-white truncate max-w-xs">
                    {stat.questionId}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">{stat.totalAttempts}</td>
                  <td className="py-2.5 px-3">
                    <span className={`font-semibold ${stat.successRate < 40 ? "text-rose-400" : stat.successRate < 70 ? "text-amber-400" : "text-emerald-400"}`}>
                      {stat.successRate}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">
                    {Math.floor(stat.averageTimeSpentSeconds / 60)}m {stat.averageTimeSpentSeconds % 60}s
                  </td>
                  <td className="py-2.5 px-3 font-mono">
                    <span className={stat.pasteCount > 3 ? "text-amber-400 font-bold" : "text-slate-400"}>
                      {stat.pasteCount}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full ${
                            stat.frictionScore > 70
                              ? "bg-rose-500"
                              : stat.frictionScore > 40
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                          style={{ width: `${stat.frictionScore}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] text-slate-300">{stat.frictionScore}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right">{tierBadge(stat.difficultyTier)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
