"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { problemsAPI } from "@/config/api";
import { parsePublicProblemList, type PublicProblem } from "@/lib/public-problems";
import styles from "./WorkspaceEnhancements.module.css";

type Neighbors = { previous?: PublicProblem; next?: PublicProblem };
const cache = new Map<string, { value: Neighbors; expires: number }>();

/** Follow the public problem list's order, including page boundaries. */
export function ProblemNavigation({ slug, disabled = false }: { slug: string; disabled?: boolean }) {
  const [result, setResult] = useState<{ slug: string; neighbors: Neighbors } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const saved = cache.get(slug);
      if (saved && saved.expires > Date.now()) { setResult({ slug, neighbors: saved.value }); return; }
      let previous: PublicProblem | undefined;
      for (let page = 1; !controller.signal.aborted; page++) {
        const response = await problemsAPI.getAll(page, 100, "", "All Topics", controller.signal);
        const data = parsePublicProblemList(response.data, 100);
        const index = data.problems.findIndex(problem => problem.slug === slug || problem.id === slug);
        if (index >= 0) {
          let next = data.problems[index + 1];
          if (!next && page < data.totalPages) {
            const following = await problemsAPI.getAll(page + 1, 100, "", "All Topics", controller.signal);
            next = parsePublicProblemList(following.data, 100).problems[0];
          }
          const neighbors = { previous: index ? data.problems[index - 1] : previous, next };
          if (!controller.signal.aborted) {
            cache.set(slug, { value: neighbors, expires: Date.now() + 60_000 });
            setResult({ slug, neighbors });
          }
          return;
        }
        if (page >= data.totalPages || !data.problems.length) return;
        previous = data.problems[data.problems.length - 1];
      }
    };
    void load().catch(() => { if (!controller.signal.aborted) setResult({ slug, neighbors: {} }); });
    return () => controller.abort();
  }, [slug]);
  const neighbors = result?.slug === slug ? result.neighbors : {};
  return <nav className={styles.problemNavigation} aria-label="Previous and next problem">
    {(["previous", "next"] as const).map(direction => {
      const target = neighbors[direction];
      const label = direction === "previous" ? "Previous question" : "Next question";
      const icon = direction === "previous" ? <ChevronLeft size={17} /> : <ChevronRight size={17} />;
      return target && !disabled ? <Link key={direction} href={`/problems/${encodeURIComponent(target.slug || target.id)}`} title={`${label}: ${target.title}`} aria-label={label}>{icon}</Link> : <button key={direction} type="button" disabled aria-label={label}>{icon}</button>;
    })}
  </nav>;
}
