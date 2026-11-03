"use client";

import { useEffect, useState } from "react";

export function Background() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden bg-background transition-colors duration-200 print-hidden">
      <div
        className="absolute -top-72 left-[8%] h-[36rem] w-[36rem] rounded-full opacity-60 dark:opacity-40"
        style={{
          background: "radial-gradient(circle, rgba(103, 232, 249, 0.12) 0%, rgba(103, 232, 249, 0) 70%)",
        }}
      />
      <div
        className="absolute -top-64 right-[4%] h-[34rem] w-[34rem] rounded-full opacity-60 dark:opacity-40"
        style={{
          background: "radial-gradient(circle, rgba(110, 231, 183, 0.10) 0%, rgba(110, 231, 183, 0) 70%)",
        }}
      />
    </div>
  );
}
