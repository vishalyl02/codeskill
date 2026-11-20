"use client";

import React, { useEffect } from "react";
import { isLockdownClient, setLockedAssessment, setClientAccommodations } from "@/lib/lockdown-bridge";

interface LockdownRouteGuardProps {
  assessmentId: string;
  allowedUrlPatterns?: string[];
  allowFindOnPage?: boolean;
  accommodations?: {
    allowSecondaryDisplay?: boolean;
    allowAccessibilitySpeech?: boolean;
    [key: string]: any;
  } | null;
  children: React.ReactNode;
}

export default function LockdownRouteGuard({
  assessmentId,
  allowedUrlPatterns = [],
  allowFindOnPage = true,
  accommodations,
  children,
}: LockdownRouteGuardProps) {
  // 1. Enforce single-assessment isolation in the native Rust client
  useEffect(() => {
    if (isLockdownClient() && assessmentId) {
      void setLockedAssessment(assessmentId, allowedUrlPatterns);
    }
  }, [assessmentId, allowedUrlPatterns]);

  // 2. Synchronize approved candidate accommodations (VoiceOver speech, secondary monitor)
  useEffect(() => {
    if (isLockdownClient() && accommodations) {
      void setClientAccommodations(
        Boolean(accommodations.allowSecondaryDisplay),
        Boolean(accommodations.allowAccessibilitySpeech),
      );
    }
  }, [accommodations]);

  // 2. Suppress Find-on-Page (Cmd+F / Ctrl+F) if allowFindOnPage is false
  useEffect(() => {
    if (allowFindOnPage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [allowFindOnPage]);

  // 3. Beforeunload navigation guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Leaving this examination will forfeit your progress.";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  return <>{children}</>;
}
