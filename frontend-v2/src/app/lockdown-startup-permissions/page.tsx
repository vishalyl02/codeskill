"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import LockdownStartupPermissionChecklist from "@/components/assessment/LockdownStartupPermissionChecklist";

function LockdownStartupPermissionsContent() {
  const searchParams = useSearchParams();
  const targetUrl = searchParams.get("targetUrl") || undefined;

  return <LockdownStartupPermissionChecklist targetUrl={targetUrl} />;
}

export default function LockdownStartupPermissionsPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <LockdownStartupPermissionsContent />
    </Suspense>
  );
}
