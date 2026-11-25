"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isLockdownClient } from "@/lib/lockdown-bridge";
import LockdownUtilityDock from "./LockdownUtilityDock";

export default function GlobalLockdownDock() {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState<boolean>(false);

  useEffect(() => {
    setIsClient(isLockdownClient());
  }, []);

  if (!isClient) {
    return null;
  }

  // If the native Tauri integral frame controls bar is mounted, yield to it to avoid duplicate docks
  if (typeof document !== "undefined" && document.getElementById("codeskill-lockdown-frame-controls")) {
    return null;
  }

  // The active assessment exam taking page (/assessments/[id]/take) renders
  // its own assessment-configured dock with calculator, scratchpad, timer, and autosave.
  const isAssessmentTakingPage = Boolean(
    pathname && (pathname.endsWith("/take") || pathname.includes("/take/"))
  );

  if (isAssessmentTakingPage) {
    return null;
  }

  // If candidate is on /assessments/[id] or instructions, extract the assessment ID for context
  let extractedAssessmentId: string | undefined;
  if (pathname) {
    const match = pathname.match(/^\/assessments\/([^/]+)/);
    if (match && match[1] && match[1] !== "create") {
      extractedAssessmentId = match[1];
    }
  }

  return (
    <LockdownUtilityDock
      assessmentId={extractedAssessmentId}
      allowCalculators={false}
      allowScratchpad={false}
    />
  );
}
