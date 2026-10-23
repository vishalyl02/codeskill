"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { WeeklyActivityPoint } from "./types";
import { CHART_COLORS } from "./analyticsData";
import { ChartTooltip } from "./ChartTooltip";
import { ChartCard } from "./ChartCard";
import { Calendar } from "lucide-react";

export interface WeeklyActivityChartProps {
  data: WeeklyActivityPoint[];
  isLoading?: boolean;
}

export function WeeklyActivityChart({
  data,
  isLoading = false,
}: WeeklyActivityChartProps) {
  const isEmpty =
    !data ||
    data.length === 0 ||
    data.every((d) => (d.currentWeek || 0) === 0 && (d.previousWeek || 0) === 0);

  const currentTotal = data?.reduce((acc, curr) => acc + (curr.currentWeek || 0), 0) || 0;
  const prevTotal = data?.reduce((acc, curr) => acc + (curr.previousWeek || 0), 0) || 0;
  const growthPercent =
    prevTotal > 0 ? (((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1) : "0";

  return (
    <ChartCard
      title="Weekly Problem-Solving Rhythm"
      subtitle="Day-by-day challenge solves comparing Current Week vs Previous Week"
      icon={Calendar}
      badge={
        Number(growthPercent) >= 0
          ? `+${growthPercent}% vs Last Week`
          : `${growthPercent}% vs Last Week`
      }
      badgeVariant={Number(growthPercent) >= 0 ? "success" : "warning"}
      isEmpty={isEmpty}
      emptyMessage="No weekly solving records"
      emptySubtext="Weekly patterns will display as candidates solve practice challenges throughout the days."
      isLoading={isLoading}
      chartHeight={300}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-border/40"
            vertical={false}
          />

          <XAxis
            dataKey="day"
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
            content={<ChartTooltip labelPrefix="Day" unit="solves" />}
            formatter={(value, name) => {
              const count = Number(value) || 0;
              return `${count.toLocaleString()} solves`;
            }}
          />

          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ paddingBottom: 12, fontSize: 11 }}
            iconType="circle"
          />

          <Bar
            dataKey="currentWeek"
            name="Current Week"
            fill={CHART_COLORS.blue}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />

          <Bar
            dataKey="previousWeek"
            name="Previous Week"
            fill="#94a3b8"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            opacity={0.65}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
