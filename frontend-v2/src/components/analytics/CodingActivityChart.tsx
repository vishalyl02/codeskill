"use client";

import React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { CodingActivityPoint } from "./types";
import { CHART_COLORS } from "./analyticsData";
import { ChartTooltip } from "./ChartTooltip";
import { ChartCard } from "./ChartCard";
import { Code2 } from "lucide-react";

export interface CodingActivityChartProps {
  data: CodingActivityPoint[];
  isLoading?: boolean;
  timeframeLabel?: string;
}

export function CodingActivityChart({
  data,
  isLoading = false,
  timeframeLabel = "Recent",
}: CodingActivityChartProps) {
  const isEmpty = !data || data.length === 0 || data.every((d) => d.total === 0);

  // Compute average acceptance rate for badge
  const totalSubmissions = data?.reduce((acc, curr) => acc + (curr.total || 0), 0) || 0;
  const totalAccepted = data?.reduce((acc, curr) => acc + (curr.accepted || 0), 0) || 0;
  const avgRate = totalSubmissions > 0 ? ((totalAccepted / totalSubmissions) * 100).toFixed(1) : "0";

  return (
    <ChartCard
      title="Coding Submission Activity & Acceptance"
      subtitle={`Daily breakdown of accepted vs failed evaluations (${timeframeLabel})`}
      icon={Code2}
      badge={`${avgRate}% Avg Acceptance`}
      badgeVariant={Number(avgRate) >= 65 ? "success" : "warning"}
      isEmpty={isEmpty}
      emptyMessage="No coding submissions recorded"
      emptySubtext="Submissions from candidates solving practice challenges or examination tests will appear here."
      isLoading={isLoading}
      chartHeight={320}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorAccepted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.emerald} stopOpacity={0.4} />
              <stop offset="95%" stopColor={CHART_COLORS.emerald} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.rose} stopOpacity={0.3} />
              <stop offset="95%" stopColor={CHART_COLORS.rose} stopOpacity={0.02} />
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
            yAxisId="left"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted-foreground"
            tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
          />

          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-muted-foreground"
            tickFormatter={(val) => `${val}%`}
          />

          <Tooltip
            content={<ChartTooltip labelPrefix="Period" />}
            formatter={(value, name) => {
              if (String(name ?? "") === "Acceptance Rate") {
                return `${Number(value).toFixed(1)}%`;
              }
              return Number(value).toLocaleString();
            }}
          />

          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ paddingBottom: 12, fontSize: 11 }}
            iconType="circle"
          />

          <Area
            yAxisId="left"
            type="monotone"
            dataKey="accepted"
            name="Accepted Submissions"
            stroke={CHART_COLORS.emerald}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorAccepted)"
          />

          <Area
            yAxisId="left"
            type="monotone"
            dataKey="failed"
            name="Failed Submissions"
            stroke={CHART_COLORS.rose}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorFailed)"
          />

          <Line
            yAxisId="right"
            type="monotone"
            dataKey="acceptanceRate"
            name="Acceptance Rate"
            stroke="#38bdf8"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#38bdf8", strokeWidth: 1, stroke: "#ffffff" }}
            activeDot={{ r: 5, strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
