"use client";

import React from "react";
import Link from "next/link";
import { ShieldAlert, AlertTriangle, ExternalLink, UserRound, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DisqualifiedCandidate } from "../_types";

interface ContestDisqualifiedSectionProps {
  disqualified: DisqualifiedCandidate[];
  isStaff: boolean;
}

export function ContestDisqualifiedSection({
  disqualified,
  isStaff,
}: ContestDisqualifiedSectionProps) {
  if (disqualified.length === 0) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card p-10 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-3">
          <ShieldAlert className="w-6 h-6" />
        </span>
        <h4 className="font-semibold text-base">No Disqualified Candidates</h4>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          All participant attempts in this contest met security and proctoring integrity thresholds.
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label="Disqualified participant records"
      className="space-y-4 rounded-3xl border border-destructive/30 bg-destructive/[0.02] p-5 sm:p-7"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-destructive/20 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-destructive/15 text-destructive font-bold text-xs">
              <ShieldAlert className="w-4 h-4" />
            </span>
            <h3 className="text-lg font-bold text-foreground">Anti-Cheat Review & Disqualifications</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            These candidates were flagged or terminated by proctoring policies (e.g. repeated tab switching, multi-device access, or manual lockouts). They are isolated from the competitive scoreboard.
          </p>
        </div>

        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20 self-start sm:self-auto">
          {disqualified.length} Flagged / Terminated
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2">
        {disqualified.map((candidate) => (
          <div
            key={candidate.userId}
            className="flex flex-col justify-between rounded-2xl border border-destructive/25 bg-card p-4 shadow-2xs hover:border-destructive/40 transition-all"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive font-bold text-xs">
                    {candidate.name ? candidate.name.charAt(0).toUpperCase() : <UserRound className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground" title={candidate.name}>
                      {candidate.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{candidate.username} • {candidate.department || "General"} ({candidate.batch || "N/A"})
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-destructive/15 text-destructive shrink-0">
                  <AlertTriangle className="w-3 h-3" />
                  {candidate.warnings} Flags
                </span>
              </div>

              <div className="rounded-xl bg-destructive/[0.04] border border-destructive/15 p-2.5 my-2.5 text-xs text-destructive">
                <p className="font-medium">{candidate.reason}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {candidate.violationsCount} security telemetry violation events recorded during session.
                </p>
              </div>
            </div>

            {/* Faculty Action Link to Student 360 Activity Journey */}
            {isStaff && (
              <div className="pt-2 border-t border-border/60 flex justify-end">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <Link href={`/admin/activity?actorId=${encodeURIComponent(candidate.userId)}`}>
                    <ExternalLink className="w-3 h-3" />
                    Inspect Student 360° Journey
                  </Link>
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
