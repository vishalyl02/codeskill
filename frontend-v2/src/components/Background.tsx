"use client";

import { useEffect, useState } from "react";

export function Background() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden bg-background transition-colors duration-200">
      <div className="absolute -top-72 left-[8%] h-[36rem] w-[36rem] rounded-full bg-cyan-300/[0.045] blur-[130px] dark:bg-cyan-500/[0.035]" />
      <div className="absolute -top-64 right-[4%] h-[34rem] w-[34rem] rounded-full bg-emerald-300/[0.04] blur-[130px] dark:bg-emerald-500/[0.03]" />
    </div>
  );
}
