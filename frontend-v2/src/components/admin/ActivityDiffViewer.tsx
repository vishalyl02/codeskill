"use client";

import React from "react";
import { ArrowRight, FileDiff, AlertCircle } from "lucide-react";

interface DiffEntry {
  from: any;
  to: any;
  truncated?: boolean;
}

interface ActivityDiffViewerProps {
  diff: Record<string, DiffEntry>;
}

export function ActivityDiffViewer({ diff }: ActivityDiffViewerProps) {
  if (!diff || Object.keys(diff).length === 0) {
    return null;
  }

  const formatValue = (val: any) => {
    if (val === null || val === undefined) return <span className="text-muted-foreground italic font-mono text-[10px]">null</span>;
    if (typeof val === "boolean") return <span className="font-mono text-[11px] font-bold">{val ? "true" : "false"}</span>;
    if (typeof val === "object") return <pre className="font-mono text-[10px] whitespace-pre-wrap">{JSON.stringify(val, null, 1)}</pre>;
    return <span className="break-all">{String(val)}</span>;
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">
        <FileDiff className="w-3.5 h-3.5 text-primary" />
        <span>Modified Fields (Before & After Diff)</span>
      </div>

      <div className="rounded-xl border border-border/80 overflow-hidden divide-y divide-border/60 bg-muted/20">
        {Object.entries(diff).map(([field, { from, to, truncated }]) => (
          <div key={field} className="p-2.5 space-y-1.5 hover:bg-muted/40 transition-colors">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-foreground text-[11px]">{field}</span>
              {truncated && (
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  <AlertCircle className="w-2.5 h-2.5" />
                  <span>Preview capped at 300 chars</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              {/* Previous state */}
              <div className="p-2 rounded-lg bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20 font-mono">
                <span className="text-[9px] uppercase font-bold text-red-500/80 block mb-0.5">Previous Value</span>
                <div className="line-through opacity-85">{formatValue(from)}</div>
              </div>

              {/* Updated state */}
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-mono">
                <span className="text-[9px] uppercase font-bold text-emerald-500/80 block mb-0.5">New Value</span>
                <div className="font-semibold">{formatValue(to)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
