"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { ScoreDistributionPoint } from "./types";
import { CHART_COLORS } from "./analyticsData";
import { ChartTooltip } from "./ChartTooltip";
import { ChartCard } from "./ChartCard";
import { Target } from "lucide-react";

export interface ScoreDistributionChartProps {
  data: ScoreDistributionPoint[];
  isLoading?: boolean;
  passingScorePercent?: number;
}

export function ScoreDistributionChart({
  data,
  isLoading = false,
  passingScorePercent = 40,
}: ScoreDistributionChartProps) {
  const isEmpty = !data || data.length === 0 || data.every((d) => (d.count || 0) === 0);

  const totalEvaluations = data?.reduce((acc, curr) => acc + (curr.count || 0), 0) || 0;
  const passingEvaluations =
    data
      ?.filter((d) => d.passStatus === "pass" || d.passStatus === "distinction")
      .reduce((acc, curr) => acc + (curr.count || 0), 0) || 0;

  const passRate =
    totalEvaluations > 0
      ? ((passingEvaluations / totalEvaluations) * 100).toFixed(1)
      : "0";

  const getBarColor = (item: ScoreDistributionPoint) => {
    if (item.passStatus === "distinction") return "#059669"; // Emerald dark
    if (item.passStatus === "pass") return CHART_COLORS.emerald;
    if (item.bracket === "21-40%") return CHART_COLORS.amber;
    return CHART_COLORS.rose;
  };

  return (
    <ChartCard
      title="Assessment Score Distribution"
      subtitle={`Candidate test performance grouped by score percentage bands (Pass Mark: ${passingScorePercent}%)`}
      icon={Target}
      badge={`${passRate}% Pass Rate`}
      badgeVariant={Number(passRate) >= 60 ? "success" : "warning"}
      isEmpty={isEmpty}
      emptyMessage="No assessment score data"
      emptySubtext="Candidate scores will populate this histogram once examinations are evaluated."
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
            dataKey="bracket"
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
            content={<ChartTooltip labelPrefix="Score Bracket" />}
            formatter={(val, _name) => {
              const count = Number(val) || 0;
              const pct = totalEvaluations > 0 ? ((count / totalEvaluations) * 100).toFixed(1) : "0";
              return `${count.toLocaleString()} candidates (${pct}%)`;
            }}
          />

          <Bar
            dataKey="count"
            name="Candidates"
            radius={[6, 6, 0, 0]}
            maxBarSize={48}
          >
            {data?.map((entry, index) => (
              <Cell
                key={`score-cell-${index}-${entry.bracket}`}
                fill={getBarColor(entry)}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
