"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CRITICAL_API_FAILURE_EVENT, type CriticalFailure } from "@/lib/error-fallback-navigation";
import { ErrorFallback } from "./ErrorFallback";

type FailureDetail = { failure: CriticalFailure; statusCode?: number };

export function ServiceErrorOverlay() {
  const pathname = usePathname();
  const [issue, setIssue] = useState<(FailureDetail & { path: string }) | null>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    dismissed.current = false;
  }, [pathname]);

  useEffect(() => {
    const handleFailure = (event: Event) => {
      if (dismissed.current || pathname === "/error-fallback") return;
      const detail = (event as CustomEvent<FailureDetail>).detail;
      if (!detail || !["server", "network", "timeout", "unexpected"].includes(detail.failure)) return;
      setIssue({ ...detail, path: pathname });
    };
    window.addEventListener(CRITICAL_API_FAILURE_EVENT, handleFailure);
    return () => window.removeEventListener(CRITICAL_API_FAILURE_EVENT, handleFailure);
  }, [pathname]);

  if (!issue || issue.path !== pathname) return null;
  const kind = issue.failure === "timeout" ? "timeout" : issue.failure === "network" ? "network" : "server";
  return <ErrorFallback kind={kind} statusCode={issue.statusCode} onDismiss={() => { dismissed.current = true; setIssue(null); }} />;
}
