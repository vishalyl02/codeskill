"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { HeroCodePreview } from "@/components/landing/HeroCodePreview";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";

export function Hero() {
  const { user, loading } = useAuth();
  const dashboardPath = user?.role === 'teacher' ? '/teacher/dashboard' : user?.isAdmin || ['admin', 'super_admin'].includes(user?.role || '') ? '/admin/dashboard' : '/dashboard';

  return (
    <section className="relative isolate w-full overflow-hidden border-b border-emerald-100/80 bg-[#fbfffc] px-4 pb-16 pt-28 text-foreground dark:border-emerald-950 dark:bg-slate-950 sm:px-6 sm:pb-20 sm:pt-32 md:pt-36">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_12%_20%,rgba(125,225,232,0.35),transparent_38%),radial-gradient(ellipse_at_86%_18%,rgba(172,238,191,0.45),transparent_40%),radial-gradient(ellipse_at_65%_85%,rgba(255,226,160,0.25),transparent_38%),linear-gradient(135deg,#f6fdff_0%,#fbfffc_54%,#f6fff7_100%)] dark:bg-[radial-gradient(ellipse_at_12%_20%,rgba(8,145,178,0.16),transparent_40%),radial-gradient(ellipse_at_86%_18%,rgba(16,185,129,0.15),transparent_40%),linear-gradient(135deg,#08131e_0%,#0b1512_100%)]" />
      <div aria-hidden="true" className="codeskill-aurora-blob pointer-events-none absolute -left-32 top-28 -z-10 h-72 w-72 rounded-full bg-cyan-200/50 blur-[100px] dark:bg-cyan-500/10" />
      <div aria-hidden="true" className="codeskill-aurora-blob codeskill-aurora-blob-delay pointer-events-none absolute -right-24 top-24 -z-10 h-80 w-80 rounded-full bg-emerald-200/45 blur-[110px] dark:bg-emerald-500/10" />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col items-start space-y-6 text-left lg:col-span-6">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-md dark:border-emerald-900 dark:bg-slate-900/80 dark:text-slate-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <span>Algorithmic Assessment &amp; Skill System</span>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="select-none text-4xl font-extrabold leading-[1.08] tracking-[-0.04em] text-slate-950 dark:text-white sm:text-5xl lg:text-[58px]">
            Build Stronger<br className="hidden sm:inline" /> Coding Skills.
            <span aria-hidden="true" className="mt-1 block h-2.5 w-fit rounded-full bg-gradient-to-r from-sky-300 via-emerald-300 to-amber-200 opacity-80" />
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="max-w-lg text-base leading-relaxed text-slate-600 dark:text-slate-300 sm:text-lg">
            Practice data structures and algorithms, take proctored assessments, and prepare for technical interviews.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="flex w-full flex-col items-stretch gap-3.5 pt-1 sm:w-auto sm:flex-row sm:items-center">
            {!loading && <Link href={user ? dashboardPath : "/login"} className="group inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02] hover:bg-emerald-800 hover:shadow-md active:scale-[0.98] dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400">
              <span>{user ? 'Go to Dashboard' : 'Log In'}</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>}
            <Link href="/assessments" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white/85 px-6 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition hover:border-emerald-300 hover:bg-emerald-50/80 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:bg-slate-800">
              View Assessments
            </Link>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.4 }} className="flex items-center gap-2 pt-2 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Proctored execution environment with instant evaluation</span>
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="flex w-full justify-center lg:col-span-6">
          <HeroCodePreview />
        </motion.div>
      </div>
    </section>
  );
}
