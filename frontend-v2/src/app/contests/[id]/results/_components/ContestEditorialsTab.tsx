"use client";

import React, { useState, useEffect } from "react";
import { Lock, BookOpen, Code, Copy, Check, AlertCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { contestsAPI } from "@/config/api";
import type { EditorialItem } from "../_types";

interface ContestEditorialsTabProps {
  contestId: string;
  isContestEnded: boolean;
  resultsPublished: boolean;
}

export function ContestEditorialsTab({
  contestId,
  isContestEnded,
  resultsPublished,
}: ContestEditorialsTabProps) {
  const [loading, setLoading] = useState(true);
  const [editorials, setEditorials] = useState<EditorialItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeProblemId, setActiveProblemId] = useState<string>("");
  const [activeLang, setActiveLang] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchEditorials = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await contestsAPI.getEditorials(contestId);
        if (!cancelled) {
          if (Array.isArray(data.editorials)) {
            setEditorials(data.editorials);
            if (data.editorials.length > 0) {
              setActiveProblemId(data.editorials[0].problemId);
              if (data.editorials[0].referenceSolutions?.length > 0) {
                setActiveLang(data.editorials[0].referenceSolutions[0].language);
              }
            }
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          const msg =
            err.response?.data?.message ||
            "Editorials are locked until the contest concludes and results are published.";
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchEditorials();
    return () => {
      cancelled = true;
    };
  }, [contestId]);

  const activeEditorial = editorials.find((e) => e.problemId === activeProblemId) || editorials[0];
  const solutions = activeEditorial?.referenceSolutions || [];
  const currentSolution = solutions.find((s) => s.language === activeLang) || solutions[0];

  const handleCopy = async () => {
    if (!currentSolution?.sourceCode) return;
    try {
      await navigator.clipboard.writeText(currentSolution.sourceCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // copy fallback
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <Spinner />
        Loading official contest editorials...
      </div>
    );
  }

  if (error || editorials.length === 0) {
    return (
      <div className="rounded-3xl border border-border/80 bg-card p-12 text-center max-w-2xl mx-auto shadow-xs">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-500 mb-4">
          <Lock className="w-7 h-7" />
        </span>
        <h3 className="text-xl font-bold tracking-tight">Editorials Currently Locked</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {error ||
            "Official solution walkthroughs, algorithmic analyses, and reference implementations will unlock once the contest closes and results are published."}
        </p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          <AlertCircle className="w-4 h-4 text-primary" />
          Status: {isContestEnded ? "Contest Ended (Tabulating)" : "Contest Active in Arena"} • Results{" "}
          {resultsPublished ? "Published" : "Pending Publication"}
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Official problem editorials and solutions" className="space-y-6">
      {/* Problem Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-border">
        {editorials.map((e) => {
          const isActive = e.problemId === activeProblemId;
          return (
            <button
              key={e.problemId}
              onClick={() => {
                setActiveProblemId(e.problemId);
                if (e.referenceSolutions?.length > 0) {
                  setActiveLang(e.referenceSolutions[0].language);
                }
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 whitespace-nowrap ${
                isActive
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <span className="grid h-5 w-5 place-items-center rounded-md bg-muted text-[11px] font-bold">
                {e.index}
              </span>
              <span>{e.title}</span>
            </button>
          );
        })}
      </div>

      {activeEditorial && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Problem Editorial & Complexity Walkthrough */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                    {activeEditorial.index}
                  </span>
                  <h3 className="font-bold text-lg">{activeEditorial.title}</h3>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border/80">
                  {activeEditorial.difficulty || "Medium"}
                </span>
              </div>

              <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-primary" />
                  Editorial & Approach
                </h4>
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-line text-sm">
                  {activeEditorial.editorial}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Reference Implementation Code */}
          <div className="lg:col-span-5 space-y-3">
            <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden flex flex-col">
              {/* Language Selector Toolbar */}
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-muted/40">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <Code className="w-3.5 h-3.5 text-muted-foreground mr-1" />
                  {solutions.length > 0 ? (
                    solutions.map((sol) => (
                      <button
                        key={sol.language}
                        onClick={() => setActiveLang(sol.language)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          (currentSolution?.language || activeLang) === sol.language
                            ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {sol.language}
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Solution Code</span>
                  )}
                </div>

                {currentSolution?.sourceCode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-7 px-2 text-xs gap-1"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                )}
              </div>

              {/* Code Viewer */}
              <div className="p-4 bg-muted/15 font-mono text-xs overflow-auto max-h-[500px]">
                {currentSolution?.sourceCode ? (
                  <pre className="p-3.5 rounded-xl border border-border/70 bg-background overflow-x-auto leading-relaxed text-foreground">
                    <code>{currentSolution.sourceCode}</code>
                  </pre>
                ) : (
                  <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-1.5">
                    <FileText className="w-6 h-6 opacity-40" />
                    <p className="text-xs">No reference code uploaded for this language.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
