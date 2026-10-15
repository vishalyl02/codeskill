"use client";

import { Code2, ShieldCheck, TimerReset, Zap, CircleCheck } from "lucide-react";

const highlights = [
  { icon: ShieldCheck, title: "Secure Code Execution", detail: "Isolated Docker sandbox runtime" },
  { icon: Zap, title: "Instant Test Evaluation", detail: "Millisecond automated test runs" },
  { icon: Code2, title: "Multiple Languages", detail: "C++, Java, Python, JS, TS, C" },
  { icon: TimerReset, title: "Real-Time Submissions", detail: "Instant metrics, memory & runtime" },
  { icon: CircleCheck, title: "Automated Scoring", detail: "Objective rubric & benchmarks" },
];

export function TrustBar() {
  return (
    <section className="border-b border-emerald-100/70 bg-white/45 px-4 py-8 backdrop-blur-lg dark:border-emerald-950/70 dark:bg-slate-950/40 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between gap-4 text-xs">
          <div className="inline-flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Proctored execution environment with instant evaluation</div>
          <span className="hidden font-mono text-slate-500 sm:block">Zero setup required · High throughput</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {highlights.map(({ icon: Icon, title, detail }) => (
            <article key={title} className="rounded-lg border border-white/85 bg-white/70 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-700/75 dark:bg-slate-900/65">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-300"><Icon className="h-4 w-4" /></span>
              <h3 className="mt-2 text-xs font-semibold text-slate-900 dark:text-white">{title}</h3>
              <p className="mt-1 text-xs leading-4 text-slate-500 dark:text-slate-400">{detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TrustBar;
