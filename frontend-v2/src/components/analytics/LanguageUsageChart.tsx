"use client";

import React from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import { LanguageUsagePoint } from "./types";
import { ChartTooltip } from "./ChartTooltip";
import { ChartCard } from "./ChartCard";
import { Terminal } from "lucide-react";

export interface LanguageUsageChartProps {
  data: LanguageUsagePoint[];
  isLoading?: boolean;
}

export function LanguageUsageChart({
  data,
  isLoading = false,
}: LanguageUsageChartProps) {
  const isEmpty = !data || data.length === 0 || data.every((d) => (d.submissions || 0) === 0);

  const topLanguage = data && data.length > 0 ? data[0].name : "None";
  const totalSubmissions = data?.reduce((acc, curr) => acc + (curr.submissions || 0), 0) || 0;

  return (
    <ChartCard
      title="Programming Language Usage"
      subtitle="Evaluation and execution distribution by compiler/runtime"
      icon={Terminal}
      badge={`Primary: ${topLanguage}`}
      badgeVariant="info"
      isEmpty={isEmpty}
      emptyMessage="No compiler telemetry"
      emptySubtext="Submissions executed across compilers (Python, C++, Java, JS) will appear here."
      isLoading={isLoading}
      chartHeight={300}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Tooltip
            content={<ChartTooltip labelPrefix="Language" />}
            formatter={(value, _name) => {
              const count = Number(value) || 0;
              const pct = totalSubmissions > 0 ? ((count / totalSubmissions) * 100).toFixed(1) : "0";
              return `${count.toLocaleString()} submissions (${pct}%)`;
            }}
          />

          <Legend
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{ paddingTop: 8, fontSize: 11 }}
            iconType="circle"
          />

          <Pie
            data={data}
            dataKey="submissions"
            nameKey="name"
            cx="50%"
            cy="45%"
            innerRadius={55}
            outerRadius={88}
            paddingAngle={3}
            stroke="currentColor"
            className="text-card stroke-2"
          >
            {data?.map((entry, index) => (
              <Cell
                key={`lang-cell-${index}-${entry.name}`}
                fill={entry.color || "#3b82f6"}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
