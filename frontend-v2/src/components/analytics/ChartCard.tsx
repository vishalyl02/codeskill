"use client";

import React, { useState, useEffect } from "react";
import { LucideIcon, BarChart2, Info } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  badge?: string;
  badgeVariant?: "default" | "success" | "warning" | "info";
  isEmpty?: boolean;
  emptyMessage?: string;
  emptySubtext?: string;
  isLoading?: boolean;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  chartHeight?: number | string;
}

export function ChartCard({
  title,
  subtitle,
  icon: Icon = BarChart2,
  badge,
  badgeVariant = "default",
  isEmpty = false,
  emptyMessage = "No telemetry data recorded",
  emptySubtext = "Activity will appear here once candidates start submitting code or taking tests.",
  isLoading = false,
  headerAction,
  children,
  className = "",
  chartHeight = 300,
}: ChartCardProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const badgeStyles = {
    default: "bg-muted text-muted-foreground border-border",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    info: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  }[badgeVariant];

  return (
    <div
      className={`bg-card/60 backdrop-blur-md rounded-2xl border border-border/70 p-4 sm:p-5 flex flex-col justify-between shadow-xs hover:border-border transition-all duration-200 group ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4 pb-3 border-b border-border/40">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-foreground tracking-tight truncate">
                {title}
              </h3>
              {badge && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeStyles}`}
                >
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </div>

      {/* Chart Canvas / State Container */}
      <div
        className="w-full relative flex items-center justify-center min-w-0"
        style={{ height: chartHeight }}
      >
        {!isMounted || isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Spinner className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-medium">Preparing chart visualization…</span>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center text-center p-6 rounded-xl border border-dashed border-border/60 bg-muted/20 w-full h-full max-h-[260px]">
            <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground mb-2.5">
              <Info className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-foreground">{emptyMessage}</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mt-1 leading-relaxed">
              {emptySubtext}
            </p>
          </div>
        ) : (
          <div className="w-full h-full min-w-0">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
