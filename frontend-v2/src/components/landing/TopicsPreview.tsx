"use client";

import Link from "next/link";
import { ArrowRight, Braces, GitFork, Layers3, Network, Orbit, Rows3, Search, Waypoints } from "lucide-react";

const topics = [
  { name: "Arrays & Strings", detail: "Indexing, windows, and sequences", icon: Rows3 },
  { name: "Hash Maps & Sets", detail: "Fast lookup and frequency patterns", icon: Search },
  { name: "Linked Lists", detail: "Pointers, cycles, and list transforms", icon: GitFork },
  { name: "Stacks & Queues", detail: "Ordering, parsing, and scheduling", icon: Layers3 },
  { name: "Trees & Tries", detail: "Traversal, search, and hierarchy", icon: Waypoints },
  { name: "Graphs", detail: "Paths, connectivity, and networks", icon: Network },
  { name: "Dynamic Programming", detail: "State, transitions, and optimization", icon: Orbit },
  { name: "Algorithms", detail: "Sorting, searching, and greedy methods", icon: Braces },
];

export function TopicsPreview() {
  return (
    <section className="border-b border-emerald-100/70 px-4 py-14 sm:px-6 md:py-16 dark:border-emerald-950/70">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Explore the fundamentals</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">Build skill across every core topic.</h2>
          </div>
          <Link href="/problems" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300">Browse problems <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {topics.map(({ name, detail, icon: Icon }) => (
            <Link key={name} href="/problems" className="group rounded-xl border border-white/80 bg-white/65 p-4 shadow-sm backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-white/85 hover:shadow-md dark:border-slate-700/70 dark:bg-slate-900/60 dark:hover:border-emerald-900 dark:hover:bg-slate-900/85">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"><Icon className="h-4 w-4" /></span>
                <span><span className="block text-sm font-semibold text-slate-900 dark:text-white">{name}</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</span></span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
