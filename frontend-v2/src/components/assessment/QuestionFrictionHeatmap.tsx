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
  title?: string;
  type?: string;
  marks?: number;
  totalAttempts?: number;
  attemptsCount?: number;
  successRate?: number;
  averageScorePercentage?: number;
  averageTimeSpentSeconds: number;
  pasteCount?: number;
  frictionScore: number;
  difficultyTier?: "HIGH_FRICTION" | "MODERATE" | "SMOOTH";
  difficultyCategory?: "HIGH_FRICTION" | "MODERATE" | "LOW_FRICTION";
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
      let res = await fetch(`/api/exam-security/assessments/${assessmentId}/question-friction-analytics`);
      if (!res.ok) {
        res = await fetch(`/api/assessments/${assessmentId}/question-friction-analytics`);
      }
      if (!res.ok) {
        res = await fetch(`/api/admin/assessments/${assessmentId}/friction-analytics`);
      }
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data)
          ? data
          : data.questions || data.data || [];
        setStats(list);
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
    const aSuccess = a.successRate ?? a.averageScorePercentage ?? 0;
    const bSuccess = b.successRate ?? b.averageScorePercentage ?? 0;
    return aSuccess - bSuccess;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-white">
              Per-Question Friction & Candidate Struggle Heatmap
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Algorithmic struggle detection based on solve dwell times, compilation retries, and high-velocity paste events.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs">
            <button
              onClick={() => setSortBy("friction")}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                sortBy === "friction" ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Friction
            </button>
            <button
              onClick={() => setSortBy("time")}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                sortBy === "time" ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Time Spent
            </button>
            <button
              onClick={() => setSortBy("success")}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                sortBy === "success" ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Success Rate
            </button>
          </div>

          <button
            onClick={fetchFriction}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            title="Refresh friction"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-amber-400" : ""}`} />
          </button>
        </div>
      </div>

      {loading && stats.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-400">Analyzing exam question struggle telemetry...</div>
      ) : sorted.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-slate-950/40 border border-slate-800/80">
          <BarChart2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs font-medium text-slate-300">No Struggle Telemetry Available</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            As students solve problems in the assessment, per-question struggle heatmaps will populate here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((q, idx) => {
            const tier = q.difficultyCategory || q.difficultyTier || "LOW_FRICTION";
            const successPct = q.successRate ?? q.averageScorePercentage ?? 0;
            const attempts = q.attemptsCount ?? q.totalAttempts ?? 0;
            const isHighFriction = tier === "HIGH_FRICTION" || q.frictionScore >= 65;
            const isModerate = tier === "MODERATE" || (q.frictionScore >= 35 && q.frictionScore < 65);

            return (
              <div
                key={q.questionId}
                className={`p-4 rounded-xl border transition-all ${
                  isHighFriction
                    ? "bg-rose-950/10 border-rose-500/30 hover:border-rose-500/50"
                    : isModerate
                    ? "bg-amber-950/10 border-amber-500/30 hover:border-amber-500/50"
                    : "bg-slate-950/40 border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-mono text-[11px] font-bold text-slate-400">
                      #{idx + 1}
                    </span>
                    <span className="text-xs font-bold text-white truncate">
                      {q.title || `Question ${q.questionId.slice(0, 8)}`}
                    </span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      isHighFriction
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : isModerate
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                    }`}
                  >
                    {isHighFriction ? "High Friction" : isModerate ? "Moderate" : "Smooth"}
                  </span>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800/60 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      Avg Time Spent
                    </span>
                    <span className="font-mono font-semibold text-slate-200">
                      {Math.floor(q.averageTimeSpentSeconds / 60)}m {q.averageTimeSpentSeconds % 60}s
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                      Success / Accuracy
                    </span>
                    <span className="font-mono font-semibold text-slate-200">
                      {successPct}% ({attempts} attempts)
                    </span>
                  </div>

                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Friction Score</span>
                      <span
                        className={`font-mono font-bold ${
                          isHighFriction
                            ? "text-rose-400"
                            : isModerate
                            ? "text-amber-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {q.frictionScore}/100
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isHighFriction
                            ? "bg-rose-500"
                            : isModerate
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, q.frictionScore)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
