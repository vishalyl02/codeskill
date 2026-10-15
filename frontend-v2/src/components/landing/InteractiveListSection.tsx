"use client";

import { useState } from "react";
import InteractiveListPreview, { InteractiveListItem } from "@/components/ui/interactive-list-preview";
import { Sparkles, Terminal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const PLATFORM_MODULES: InteractiveListItem[] = [
  {
    client: "ALGORITHMIC CORE",
    platform: "DSA & CODING",
    services: "DYNAMIC PROGRAMMING, GRAPH THEORY, TREES, BIT MANIPULATION",
    img: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=1000&auto=format&fit=crop",
  },
  {
    client: "AI PROCTORING",
    platform: "SECURE ENGINE",
    services: "CONTINUOUS FACE VERIFICATION, TAB SWITCHING SHIELD, LIVE PROCTOR ALERTS",
    img: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1000&auto=format&fit=crop",
  },
  {
    client: "ISOLATED SANDBOX",
    platform: "MULTI-LANGUAGE RUNTIME",
    services: "DOCKERIZED KERNEL, MILLISECOND EXECUTION, MEMORY & CPU QUOTAS",
    img: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop",
  },
  {
    client: "SKILL MATRIX",
    platform: "CU DEPT SKILL LAB",
    services: "BATCH DIAGNOSTICS, STUDENT SCORECARDS, REALTIME ELO RATINGS",
    img: "https://images.unsplash.com/photo-1558655146-d09347e92766?q=80&w=1000&auto=format&fit=crop",
  },
  {
    client: "CAMPUS HACK ARENA",
    platform: "LIVE CONTESTS",
    services: "INTER-DEPARTMENT BATTLES, ANTI-PLAGIARISM HEURISTICS, GLOBAL STANDINGS",
    img: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?q=80&w=1000&auto=format&fit=crop",
  },
  {
    client: "VERIFIED CREDENTIALS",
    platform: "INSTITUTIONAL CERT",
    services: "CRYPTOGRAPHIC BADGING, PLACEMENT READINESS SCORE, PDF TRANSCRIPTS",
    img: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1000&auto=format&fit=crop",
  },
];

export function InteractiveListSection() {
  const [activeItem, setActiveItem] = useState<InteractiveListItem | null>(null);

  return (
    <section className="relative w-full overflow-hidden border-y border-emerald-100/70 bg-gradient-to-br from-emerald-50/55 via-white to-sky-50/55 py-20 text-slate-900 dark:border-emerald-950/70 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/20 sm:py-24">
      
      {/* 1. Full Screen Background Colorful Radial Gradient Ambient Mesh */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* Purple / Magenta Glow on Left */}
        <div className="absolute -top-10 -left-20 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(59,130,246,0.14)_0%,rgba(59,130,246,0.07)_40%,transparent_70%)] blur-3xl" />
        
        {/* Emerald / Green Glow on Right */}
        <div className="absolute top-10 -right-20 w-[650px] h-[650px] bg-[radial-gradient(circle,rgba(16,185,129,0.2)_0%,rgba(5,150,105,0.08)_40%,transparent_70%)] blur-3xl" />
        
        {/* Deep Teal / Cyan Ambient Glow Bottom Left */}
        <div className="absolute -bottom-20 left-1/4 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(6,182,212,0.15)_0%,transparent_70%)] blur-3xl" />
        
        {/* Pink / Rose Subtle Accent Bottom Right */}
        <div className="absolute bottom-0 right-10 w-[450px] h-[450px] bg-[radial-gradient(circle,rgba(245,158,11,0.12)_0%,transparent_70%)] blur-3xl" />
      </div>

      {/* 2. Dynamic Image Animation on the MAIN SCREEN BEHIND the container */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeItem && (
            <motion.div
              key={activeItem.client}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 0.28, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="absolute inset-0 w-full h-full"
            >
              <img
                src={activeItem.img}
                alt={activeItem.client}
                className="w-full h-full object-cover filter blur-xl mix-blend-screen"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white/70 via-white/30 to-white/70 dark:from-slate-950/80 dark:via-slate-950/45 dark:to-slate-950/80" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 3. Main Content Wrapper */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="mx-auto mb-10 max-w-3xl space-y-3 text-center sm:mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-800 shadow-sm backdrop-blur-lg dark:border-emerald-900 dark:bg-slate-900/75 dark:text-emerald-300">
            <span># INTERACTIVE ASSESSMENT MATRIX</span>
          </div>

          <h2 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl lg:text-5xl">
            Engineered For High-Stakes Evaluation
          </h2>

          <p className="mx-auto max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
            Hover over any technical module to inspect the underlying architecture, execution sandbox, and proctoring systems.
          </p>
        </div>

        {/* Center List / Terminal Container (Dark background for crisp readability) */}
        <div className="overflow-hidden rounded-2xl border border-white/85 bg-white/70 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.35)] backdrop-blur-2xl transition-all dark:border-slate-700/80 dark:bg-slate-900/65">
          
          {/* Terminal Topbar */}
          <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/70 px-5 py-3.5 dark:border-slate-700/80 dark:bg-slate-900/60 sm:px-6">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="ml-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">codeskill-engine://modules/preview</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Terminal className="w-3.5 h-3.5 text-neutral-400" />
              <span>GSAP Motion Accelerated</span>
            </div>
          </div>

          {/* Interactive Table (No inner image obscuring rows) */}
          <InteractiveListPreview
            items={PLATFORM_MODULES}
            bgColor="transparent"
            onHoverChange={(item) => setActiveItem(item)}
          />
        </div>

      </div>
    </section>
  );
}

export default InteractiveListSection;
