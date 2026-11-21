"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function StudentLoginPage() {
  const router = useRouter();

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    router.replace(`/login${search}`);
  }, [router]);

  return (
    <div className="flex min-h-screen bg-background items-center justify-center font-sans">
      <div className="text-center text-xs text-muted-foreground font-mono animate-pulse">
        Redirecting to student login portal...
      </div>
    </div>
  );
}
