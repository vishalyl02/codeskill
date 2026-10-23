"use client";

import { useContext, useEffect, useState } from "react";
import AuthContext from "@/context/AuthContext";
import { submissionAPI } from "@/config/api";

export type ProblemProgress = "solved" | "attempted";
const eventName = "codeskill:problem-progress";

/** Refresh personal progress after a server-judged submission, never after Run. */
export function refreshProblemProgress() {
  window.dispatchEvent(new Event(eventName));
}

export function useProblemProgress(problemIds: readonly string[]) {
  const auth = useContext(AuthContext);
  const owner = auth?.user?._id || auth?.user?.id || "";
  const ids = [...new Set(problemIds)].sort().join(",");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ owner: string; statuses: Record<string, ProblemProgress> } | null>(null);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(eventName, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(eventName, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (!owner || !ids) return;
    const controller = new AbortController();
    submissionAPI.getProgress(ids.split(","), controller.signal)
      .then(response => {
        if (controller.signal.aborted) return;
        const statuses: Record<string, ProblemProgress> = {};
        for (const row of response.data.data ?? []) {
          if (row.status === "solved" || row.status === "attempted") statuses[row.problemId] = row.status;
        }
        setResult({ owner, statuses });
      })
      .catch(() => { /* Keep the catalog usable if personal progress is temporarily unavailable. */ });
    return () => controller.abort();
  }, [owner, ids, revision]);

  return result && result.owner === owner ? result.statuses : {};
}
