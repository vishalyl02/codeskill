"use client";

import Link from "next/link";
import {
  BarChart3,
  Download,
  Share2,
  ChevronRight,
  ShieldCheck,
  Cpu,
} from "lucide-react";
import { AnalyticsDashboardView } from "@/components/analytics";

export default function AdminAnalyticsPage() {
  const handleExportCSV = () => {
    // Generate simple client-side telemetry export summary
    const csvContent =
      "data:text/csv;charset=utf-8," +
      "Metric,Value\n" +
      "Platform,CodeSkill\n" +
      "Report,Engineering Telemetry & Evaluation Analytics\n" +
      "Timestamp," +
      new Date().toISOString() +
      "\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `codeskill-analytics-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-3.5 sm:p-6 md:p-8 font-sans relative min-h-full">
      {/* Background radial highlight */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background pointer-events-none" />

      <div className="relative z-10 max-w-7xl mx-auto space-y-6 sm:space-y-8">
        {/* Breadcrumb Strip */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/admin/dashboard" className="hover:text-foreground transition-colors">
            Admin
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-semibold">Analytics Dashboard</span>
        </div>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 pb-4 border-b border-border/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold font-heading text-foreground tracking-tight">
                Analytics{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-foreground via-foreground/85 to-primary">
                  Dashboard
                </span>
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Real-time submission telemetry, student engagement trends, and multi-language compiler activity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border border-border bg-card/60 hover:bg-card text-foreground transition-all shadow-xs hover:border-primary/40 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Export CSV</span>
            </button>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Telemetry Live</span>
            </div>
          </div>
        </div>

        {/* Recharts Analytics Dashboard View */}
        <AnalyticsDashboardView initialTimeframe="7d" showSimulateEmptyToggle={true} />
      </div>
    </div>
  );
}
