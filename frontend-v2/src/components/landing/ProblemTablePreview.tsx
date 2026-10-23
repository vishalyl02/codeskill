"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, ArrowRight } from "lucide-react";
import { problemsAPI } from "@/config/api";
import { parsePublicProblemList, type PublicProblem } from "@/lib/public-problems";

import { useProblemProgress } from "@/hooks/useProblemProgress";
import { ProblemProgressMark } from "@/components/problems/ProblemProgressMark";

const PREVIEW_LIMIT = 5;

export function ProblemTablePreview() {
  const [search, setSearch] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState<string>("All");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; problems: PublicProblem[]; error: boolean } | null>(null);
  const requestKey = JSON.stringify([debouncedSearch, filterDifficulty, retry]);
  const loading = result?.key !== requestKey;
  const problems = loading ? [] : result?.problems ?? [];
  const error = !loading && Boolean(result?.error);
  const progress = useProblemProgress(problems.map(problem => problem.id));

  useEffect(() => {
    const query = search.trim();
    if (query === debouncedSearch) return;
    const timer = setTimeout(() => setDebouncedSearch(query), 250);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    problemsAPI.getAll(1, PREVIEW_LIMIT, debouncedSearch, "All Topics", controller.signal, filterDifficulty)
      .then((response) => {
        if (controller.signal.aborted) return;
        const { problems } = parsePublicProblemList(response.data, PREVIEW_LIMIT);
        setResult({ key: requestKey, problems, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key: requestKey, problems: [], error: true });
      });
    return () => controller.abort();
  }, [debouncedSearch, filterDifficulty, retry, requestKey]);

  return (
    <section className="w-full py-16 px-4 sm:px-6 md:px-8 border-b border-border bg-background text-foreground">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Problems
            </h2>
          </div>

          <Link
            href="/problems"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground hover:underline"
          >
            <span>View all problems</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-md bg-card border border-border">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search problems..."
              aria-label="Search problems"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md bg-background border border-border focus:outline-none focus:border-foreground transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {["All", "Easy", "Medium", "Hard"].map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => setFilterDifficulty(diff)}
                aria-pressed={filterDifficulty === diff}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  filterDifficulty === diff
                    ? "bg-black text-white dark:bg-white dark:text-black font-semibold"
                    : "bg-background text-neutral-600 dark:text-neutral-400 hover:text-foreground border border-border"
                }`}
              >
                {diff}
              </button>
            ))}
          </div>
        </div>

        {/* LeetCode-style Problem Table */}
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-neutral-50 dark:bg-neutral-900/50 text-neutral-500 font-medium">
                <th className="py-2.5 px-4 w-10 text-center">Status</th>
                <th className="py-2.5 px-4">Title</th>
                <th className="py-2.5 px-4 w-32">Difficulty</th>
                <th className="py-2.5 px-4 w-28">Acceptance</th>
                <th className="py-2.5 px-4 w-24 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr><td colSpan={5} className="py-6 px-4 text-center text-neutral-600 dark:text-neutral-400" role="status">Loading problems…</td></tr>
              )}
              {error && (
                <tr><td colSpan={5} className="py-6 px-4 text-center">
                  <span role="alert" className="text-red-600 dark:text-red-400">Problems could not be loaded.</span>{" "}
                  <button type="button" onClick={() => setRetry(value => value + 1)} className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">Try again</button>
                </td></tr>
              )}
              {problems.map((prob) => (
                <tr
                  key={prob.id}
                  className="hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition-colors"
                >
                  <td className="py-3 px-4 text-center">
                    <ProblemProgressMark status={progress[prob.id]} className="w-4 h-4 mx-auto" />
                  </td>
                  <td className="py-3 px-4 font-medium text-foreground">
                    {prob.slug ? <Link href={`/problems/${encodeURIComponent(prob.slug)}`} className="hover:underline">{prob.title}</Link> : prob.title}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                        prob.difficulty === "Easy"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : prob.difficulty === "Medium"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                      }`}
                    >
                      {prob.difficulty}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-neutral-600 dark:text-neutral-400">
                    {prob.stats.acceptanceRate > 0 ? `${prob.stats.acceptanceRate}%` : "—"}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {prob.slug && <Link
                      href={`/problems/${encodeURIComponent(prob.slug)}`}
                      className="px-2.5 py-1 rounded border border-border bg-background hover:bg-neutral-100 dark:hover:bg-neutral-800 text-[11px] font-medium text-foreground transition-colors inline-block"
                    >
                      Solve
                    </Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </section>
  );
}

export default ProblemTablePreview;
