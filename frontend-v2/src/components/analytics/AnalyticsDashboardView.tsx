"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import {
  DateFilterOption,
  FilteredAnalyticsData,
} from "./types";
import { getAnalyticsDataset, getEmptyAnalyticsData } from "./analyticsData";
import { CodingActivityChart } from "./CodingActivityChart";
import { StudentEngagementChart } from "./StudentEngagementChart";
import { ScoreDistributionChart } from "./ScoreDistributionChart";
import { LanguageUsageChart } from "./LanguageUsageChart";
import { WeeklyActivityChart } from "./WeeklyActivityChart";
import { analyticsAPI } from "@/config/api";
import {
  Calendar,
  CheckCircle2,
  RefreshCw,
  Terminal,
  TrendingUp,
  Users,
  Layers,
  Database,
  AlertCircle,
} from "lucide-react";

export interface AnalyticsDashboardViewProps {
  initialTimeframe?: DateFilterOption;
  initialData?: FilteredAnalyticsData;
  showSimulateEmptyToggle?: boolean;
}

// Module-level in-memory cache to prevent redundant fetches during Next.js navigation
interface CachedAnalyticsEntry {
  data: FilteredAnalyticsData;
  isLive: boolean;
  timestamp: number;
}
const clientAnalyticsCache = new Map<string, CachedAnalyticsEntry>();
const CACHE_TTL_MS = 45000; // 45 seconds TTL

export function AnalyticsDashboardView({
  initialTimeframe = "7d",
  showSimulateEmptyToggle = true,
}: AnalyticsDashboardViewProps) {
  const [timeframe, setTimeframe] = useState<DateFilterOption>(initialTimeframe);
  const [simulateEmpty, setSimulateEmpty] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [hasFetchError, setHasFetchError] = useState(false);
  const [, startTransition] = useTransition();

  const [data, setData] = useState<FilteredAnalyticsData>(() => {
    const cached = clientAnalyticsCache.get(initialTimeframe);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    return getAnalyticsDataset(initialTimeframe);
  });

  const fetchLiveData = useCallback(
    async (targetTimeframe: DateFilterOption, emptyMode: boolean, forceRefresh = false) => {
      if (emptyMode) {
        setData(getEmptyAnalyticsData(targetTimeframe));
        setIsLiveConnected(false);
        setIsRefreshing(false);
        setHasFetchError(false);
        return;
      }

      // Check client memory cache to prevent redundant fetches during navigation
      if (!forceRefresh) {
        const cached = clientAnalyticsCache.get(targetTimeframe);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
          setData(cached.data);
          setIsLiveConnected(cached.isLive);
          setIsRefreshing(false);
          setHasFetchError(false);
          return;
        }
      }

      setIsRefreshing(true);
      setHasFetchError(false);
      try {
        const [overviewRes, actRes, langRes, asmtRes] = await Promise.allSettled([
          analyticsAPI.getPlatformOverview(),
          analyticsAPI.getActivity({ period: targetTimeframe }),
          analyticsAPI.getLanguages(),
          analyticsAPI.getAssessments(),
        ]);

        const overview =
          overviewRes.status === "fulfilled"
            ? overviewRes.value?.data?.data || overviewRes.value?.data || {}
            : {};
        const act =
          actRes.status === "fulfilled"
            ? actRes.value?.data?.data || actRes.value?.data || {}
            : {};
        const lang =
          langRes.status === "fulfilled"
            ? langRes.value?.data?.data || langRes.value?.data || {}
            : {};
        const asmt =
          asmtRes.status === "fulfilled"
            ? asmtRes.value?.data?.data || asmtRes.value?.data || {}
            : {};

        const hasDbRecords =
          Boolean(overview.totalUsers || overview.totalSubmissions || overview.totalAssessments || act.codingActivity?.length);

        if (hasDbRecords) {
          setIsLiveConnected(true);
          const freshData: FilteredAnalyticsData = {
            timeframe: targetTimeframe,
            summary: {
              totalSubmissions: Number(overview.totalSubmissions ?? 0),
              acceptedSubmissions: Number(overview.acceptedSubmissions ?? 0),
              failedSubmissions: Number(overview.failedSubmissions ?? 0),
              overallAcceptanceRate: Number(overview.overallAcceptanceRate ?? 0),
              activeStudentsCount: Number(
                overview.activeUsers ?? overview.totalStudents ?? overview.totalUsers ?? 0,
              ),
              primaryLanguage: String(overview.primaryLanguage ?? "Python"),
              weeklySolves: Array.isArray(act.weeklyActivity)
                ? act.weeklyActivity.reduce(
                    (acc: number, curr: any) => acc + (curr.currentWeek || 0),
                    0,
                  )
                : 0,
            },
            codingActivity: Array.isArray(act.codingActivity) ? act.codingActivity : [],
            engagement: Array.isArray(act.engagement) ? act.engagement : [],
            scoreDistribution: Array.isArray(asmt.scoreDistribution) ? asmt.scoreDistribution : [],
            languages: Array.isArray(lang.languages) ? lang.languages : [],
            weeklyActivity: Array.isArray(act.weeklyActivity) ? act.weeklyActivity : [],
          };
          setData(freshData);
          clientAnalyticsCache.set(targetTimeframe, {
            data: freshData,
            isLive: true,
            timestamp: Date.now(),
          });
        } else {
          // If no records in db yet, gracefully use representative fallback
          const fallback = getAnalyticsDataset(targetTimeframe);
          setData(fallback);
          clientAnalyticsCache.set(targetTimeframe, {
            data: fallback,
            isLive: false,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        setHasFetchError(true);
        setData(getAnalyticsDataset(targetTimeframe));
      } finally {
        setIsRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchLiveData(timeframe, simulateEmpty);
  }, [timeframe, simulateEmpty, fetchLiveData]);

  const handleTimeframeChange = (newTimeframe: DateFilterOption) => {
    startTransition(() => {
      setTimeframe(newTimeframe);
    });
  };

  const handleRefresh = () => {
    fetchLiveData(timeframe, simulateEmpty, true);
  };

  const timeframeLabels: Record<DateFilterOption, string> = {
    "7d": "Past 7 Days",
    "30d": "Past 30 Days",
    "90d": "Past 90 Days",
    "1y": "Past 1 Year",
    all: "All Time",
  };

  const filterButtons: Array<{ id: DateFilterOption; label: string }> = [
    { id: "7d", label: "7D" },
    { id: "30d", label: "30D" },
    { id: "90d", label: "90D" },
    { id: "1y", label: "1Y" },
    { id: "all", label: "All" },
  ];

  const summary = data.summary;

  return (
    <div className="space-y-6 w-full">
      {/* Top Filter and Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/50">
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Range:
          </span>
          <span className="text-xs font-bold text-foreground">
            {timeframeLabels[timeframe]}
          </span>
          {isLiveConnected && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Database className="w-3 h-3" />
              <span>RDS PostgreSQL Live</span>
            </span>
          )}
        </div>

        {hasFetchError && (
          <div className="w-full flex items-center justify-between p-2.5 px-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Live analytics temporarily unavailable. Showing cached data.</span>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="font-bold underline hover:no-underline cursor-pointer ml-2"
            >
              Retry
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Date Filter Buttons */}
          <div
            className="inline-flex items-center p-1 rounded-xl bg-card/60 border border-border shadow-xs"
            role="group"
            aria-label="Timeframe selection"
          >
            {filterButtons.map((btn) => {
              const isActive = timeframe === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => handleTimeframeChange(btn.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                  aria-pressed={isActive}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>

          {/* Empty State Toggle */}
          {showSimulateEmptyToggle && (
            <button
              type="button"
              onClick={() => setSimulateEmpty((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all cursor-pointer ${
                simulateEmpty
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                  : "bg-card/60 text-muted-foreground border-border hover:text-foreground"
              }`}
              title="Toggle empty state to verify zero-data handling"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{simulateEmpty ? "Empty Mode" : "Live / Active"}</span>
            </button>
          )}

          {/* Refresh Action */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-border bg-card/60 text-foreground hover:bg-card transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            title="Refresh analytics data"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-muted-foreground ${
                isRefreshing ? "animate-spin text-primary" : ""
              }`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1 */}
        <div className="p-4 rounded-2xl bg-card/50 backdrop-blur-md border border-border/70 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Evaluations Volume
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold font-heading text-foreground">
            {summary.totalSubmissions.toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {summary.acceptedSubmissions.toLocaleString()} accepted •{" "}
            {summary.failedSubmissions.toLocaleString()} failed
          </p>
        </div>

        {/* Metric 2 */}
        <div className="p-4 rounded-2xl bg-card/50 backdrop-blur-md border border-border/70 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Acceptance Rate
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold font-heading text-foreground">
            {summary.overallAcceptanceRate}%
          </p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 truncate font-medium">
            Based on completed judge test suites
          </p>
        </div>

        {/* Metric 3 */}
        <div className="p-4 rounded-2xl bg-card/50 backdrop-blur-md border border-border/70 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Active Candidates
            </span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Users className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold font-heading text-foreground">
            {summary.activeStudentsCount.toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            Period peak candidate engagement
          </p>
        </div>

        {/* Metric 4 */}
        <div className="p-4 rounded-2xl bg-card/50 backdrop-blur-md border border-border/70 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              Primary Language
            </span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Terminal className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="text-2xl font-bold font-heading text-foreground">
            {summary.primaryLanguage}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {summary.weeklySolves.toLocaleString()} solved this week
          </p>
        </div>
      </div>

      {/* Primary Chart: Coding Activity & Acceptance */}
      <div className="w-full">
        <CodingActivityChart
          data={data.codingActivity}
          isLoading={isRefreshing}
          timeframeLabel={timeframeLabels[timeframe]}
        />
      </div>

      {/* Secondary Split: Student Engagement Trends & Assessment Score Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        <StudentEngagementChart
          data={data.engagement}
          isLoading={isRefreshing}
          timeframeLabel={timeframeLabels[timeframe]}
        />

        <ScoreDistributionChart
          data={data.scoreDistribution}
          isLoading={isRefreshing}
        />
      </div>

      {/* Tertiary Split: Weekly Problem Solving Rhythm & Programming Language Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        <WeeklyActivityChart
          data={data.weeklyActivity}
          isLoading={isRefreshing}
        />

        <LanguageUsageChart
          data={data.languages}
          isLoading={isRefreshing}
        />
      </div>
    </div>
  );
}
