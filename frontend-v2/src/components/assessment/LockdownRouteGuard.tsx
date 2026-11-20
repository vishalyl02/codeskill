"use client";

import React, { useEffect, useState } from "react";
import {
  isLockdownClient,
  setLockedAssessment,
  setClientAccommodations,
  getStartupPermissionChecklist,
} from "@/lib/lockdown-bridge";
import LockdownStartupPermissionChecklist from "./LockdownStartupPermissionChecklist";

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
  const [shouldShowChecklist, setShouldShowChecklist] = useState<boolean>(false);
  const [checklistVerified, setChecklistVerified] = useState<boolean>(false);

  // 0. Verify one-time startup permissions checklist in LockDown client
  useEffect(() => {
    if (!isLockdownClient()) {
      setChecklistVerified(true);
      return;
    }

    getStartupPermissionChecklist()
      .then((state) => {
        if (!state.onboardingCompleted || !state.allRequiredGranted) {
          setShouldShowChecklist(true);
        }
        setChecklistVerified(true);
      })
      .catch((err) => {
        console.warn("Failed to check startup permissions in RouteGuard:", err);
        setChecklistVerified(true);
      });
  }, []);

  // 1. Enforce single-assessment isolation in the native Rust client (only once checklist passed)
  useEffect(() => {
    if (isLockdownClient() && assessmentId && !shouldShowChecklist && checklistVerified) {
      void setLockedAssessment(assessmentId, allowedUrlPatterns);
    }
  }, [assessmentId, allowedUrlPatterns, shouldShowChecklist, checklistVerified]);

  // 2. Synchronize approved candidate accommodations (VoiceOver speech, secondary monitor)
  useEffect(() => {
    if (isLockdownClient() && accommodations && !shouldShowChecklist && checklistVerified) {
      void setClientAccommodations(
        Boolean(accommodations.allowSecondaryDisplay),
        Boolean(accommodations.allowAccessibilitySpeech),
      );
    }
  }, [accommodations, shouldShowChecklist, checklistVerified]);

  // 3. Suppress Find-on-Page (Cmd+F / Ctrl+F) if allowFindOnPage is false
  useEffect(() => {
    if (allowFindOnPage || shouldShowChecklist || !checklistVerified) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [allowFindOnPage, shouldShowChecklist, checklistVerified]);

  // 4. Beforeunload navigation guard
  useEffect(() => {
    if (shouldShowChecklist || !checklistVerified) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Leaving this examination will forfeit your progress.";
      return e.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldShowChecklist, checklistVerified]);

  if (isLockdownClient() && !checklistVerified) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (shouldShowChecklist) {
    return (
      <LockdownStartupPermissionChecklist
        onComplete={() => setShouldShowChecklist(false)}
      />
    );
  }

  return <>{children}</>;
}
