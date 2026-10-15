"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Code2, FileCheck2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

const FEATURES = [
  { icon: BookOpen, eyebrow: "CORE DSA", title: "Practice", description: "Solve curated DSA problems with multiple difficulty levels, structured hints, and comprehensive editorial guides.", detail: "Explore the problem set", href: "/problems", tone: "green" },
  { icon: FileCheck2, eyebrow: "EVALUATIONS", title: "Assessments", description: "Take structured technical assessments with automated evaluation, timed sections, and standardized scoring rubrics.", detail: "Timed tests and results", href: "/assessments", tone: "blue" },
  { icon: Sparkles, eyebrow: "SECURITY", title: "Proctored Exams", description: "Secure assessment environment with browser lockdown, tab-switch monitoring, and anti-cheating audit controls.", detail: "Integrity-focused exams", href: "/assessments", tone: "violet" },
  { icon: Code2, eyebrow: "SPEED", title: "Instant Evaluation", description: "Get immediate feedback from automated test-case execution with memory quotas and runtime performance breakdowns.", detail: "Fast code feedback", href: "/problems", tone: "green" },
  { icon: Sparkles, eyebrow: "ANALYTICS", title: "Skill Analytics", description: "Track your progress across algorithms, data structures, and programming languages with progress charts and skill ratings.", detail: "Progress insights", href: "/dashboard", tone: "blue" },
  { icon: ArrowRight, eyebrow: "PLACEMENT", title: "Interview Preparation", description: "Practice problems designed around real technical interview patterns from top software engineering companies.", detail: "Get interview-ready", href: "/assessments", tone: "violet" },
]

const toneClasses = {
  blue: {
    wash: "from-blue-50/90 to-white dark:from-blue-950/35 dark:to-slate-900",
    icon: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
    label: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  green: {
    wash: "from-emerald-50/90 to-white dark:from-emerald-950/30 dark:to-slate-900",
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    label: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  violet: {
    wash: "from-violet-50/85 to-white dark:from-violet-950/30 dark:to-slate-900",
    icon: "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300",
    label: "text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
  },
};

export function FeatureGrid() {
  return (
    <section id="features" className="border-b border-slate-200/80 bg-white px-4 py-16 text-foreground dark:border-slate-800 dark:bg-slate-950 sm:px-6 md:py-[72px]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-3 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">
              <Sparkles className="h-4 w-4" /> Your coding journey
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-[34px]">Everything you need to become interview-ready.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">Practice, assessment, analytics, and interview preparation in one connected skill platform.</p>
          </div>
          <Link href="/assessments" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-blue-700 transition hover:gap-3 dark:text-blue-300">
            See all assessments <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            const tone = toneClasses[feature.tone as keyof typeof toneClasses];
            return (
              <motion.article
                key={feature.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.32, delay: index * 0.06 }}
                className={`group overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br ${tone.wash} shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:hover:border-blue-900`}
              >
                <div className="p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${tone.icon}`}><Icon className="h-5 w-5" /></span>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.11em] ${tone.label}`}><span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />{feature.eyebrow}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold tracking-tight text-slate-950 dark:text-white">{feature.title}</h3>
                  <p className="mt-2 min-h-[48px] max-w-sm text-sm leading-[1.55] text-slate-600 dark:text-slate-300">{feature.description}</p>
                  <div className="mt-5 flex items-center justify-between border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{feature.detail}</span>
                    <Link href={feature.href} aria-label={`Explore ${feature.eyebrow.toLowerCase()}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white/80 text-slate-700 transition group-hover:border-blue-300 group-hover:bg-blue-600 group-hover:text-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:group-hover:border-blue-500 dark:group-hover:bg-blue-500">
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
