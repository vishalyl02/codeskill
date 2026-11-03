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
    let lastFocusFetch = Date.now();
    const onProgressEvent = () => setRevision(value => value + 1);
    const onWindowFocus = () => {
      const now = Date.now();
      // Only refetch on focus if at least 45 seconds have passed to prevent network storms
      if (now - lastFocusFetch >= 45_000) {
        lastFocusFetch = now;
        setRevision(value => value + 1);
      }
    };
    window.addEventListener(eventName, onProgressEvent);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener(eventName, onProgressEvent);
      window.removeEventListener("focus", onWindowFocus);
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
