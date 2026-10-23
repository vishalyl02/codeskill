"use client";

import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { EngagementTrendPoint } from "./types";
import { CHART_COLORS } from "./analyticsData";
import { ChartTooltip } from "./ChartTooltip";
import { ChartCard } from "./ChartCard";
import { Users } from "lucide-react";

export interface StudentEngagementChartProps {
  data: EngagementTrendPoint[];
  isLoading?: boolean;
  timeframeLabel?: string;
}

export function StudentEngagementChart({
  data,
  isLoading = false,
  timeframeLabel = "Recent",
}: StudentEngagementChartProps) {
  const isEmpty =
    !data ||
    data.length === 0 ||
    data.every((d) => (d.activeStudents || 0) === 0 && (d.practiceSolves || 0) === 0);

  const peakActive = data?.reduce((max, curr) => Math.max(max, curr.activeStudents || 0), 0) || 0;

  return (
    <ChartCard
      title="Student Engagement Trends"
      subtitle={`Active students, examination participation, and practice volume (${timeframeLabel})`}
      icon={Users}
      badge={`Peak: ${peakActive.toLocaleString()} Users`}
      badgeVariant="info"
      isEmpty={isEmpty}
      emptyMessage="No engagement telemetry recorded"
      emptySubtext="Student activity from logins, tests, and practice problem submissions will display here."
      isLoading={isLoading}
      chartHeight={300}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorActiveStudents" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.4} />
              <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="colorAssessmentsTaken" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.cyan} stopOpacity={0.4} />
              <stop offset="95%" stopColor={CHART_COLORS.cyan} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="colorPracticeSolves" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.purple} stopOpacity={0.35} />
              <stop offset="95%" stopColor={CHART_COLORS.purple} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-border/40"
            vertical={false}
          />

          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={{ stroke: "currentColor", className: "text-border/60" }}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted-foreground"
          />

          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted-foreground"
            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
          />

          <Tooltip
            content={<ChartTooltip labelPrefix="Timeline" unit="students" />}
            formatter={(val, name) => {
              const num = Number(val) || 0;
              const nameStr = String(name ?? "");
              const unit = nameStr.includes("Solves") ? "solves" : "candidates";
              return `${num.toLocaleString()} ${unit}`;
            }}
          />

          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ paddingBottom: 12, fontSize: 11 }}
            iconType="circle"
          />

          <Area
            type="monotone"
            dataKey="activeStudents"
            name="Active Students"
            stroke={CHART_COLORS.blue}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorActiveStudents)"
          />

          <Area
            type="monotone"
            dataKey="assessmentsTaken"
            name="Assessments Taken"
            stroke={CHART_COLORS.cyan}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorAssessmentsTaken)"
          />

          <Area
            type="monotone"
            dataKey="practiceSolves"
            name="Practice Solves"
            stroke={CHART_COLORS.purple}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorPracticeSolves)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
