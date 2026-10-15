"use client";

import { useMemo, useState } from "react";
import { ChevronDown, CircleHelp, Search, Sparkles } from "lucide-react";
import { faqCategories } from "@/lib/faq-data";

export default function AdminFAQPage() {
  const [activeCategory, setActiveCategory] = useState(faqCategories[0].name);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const active = faqCategories.find((category) => category.name === activeCategory) || faqCategories[0];
  const ActiveIcon = active.icon;
  const questions = useMemo(() => active.questions.filter((item) => `${item.question} ${item.answer}`.toLowerCase().includes(search.trim().toLowerCase())), [active, search]);

  return <main className="admin-page-shell min-h-full px-4 py-5 md:px-7 md:py-7">
    <div className="mx-auto max-w-[1450px]">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-emerald-50/70 px-2.5 py-1 text-[10px] font-bold tracking-[.1em] text-emerald-800 dark:border-emerald-300/15 dark:bg-emerald-300/10 dark:text-emerald-300"><Sparkles size={12}/> STUDENT SUPPORT</span>
          <h1 className="text-[25px] font-bold tracking-[-0.035em] text-slate-950 dark:text-white">Frequently Asked Questions</h1>
          <p className="mt-1 max-w-2xl text-[13px] text-slate-600 dark:text-slate-400">Career and technical guidance for CodeSkill learners, grouped by topic.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/75 px-3 py-2 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/65 dark:text-slate-300">
          <CircleHelp size={15} className="text-emerald-700 dark:text-emerald-300"/>{faqCategories.length} topics <span className="text-slate-300 dark:text-slate-600">·</span> {faqCategories.reduce((total, category) => total + category.questions.length, 0)} answers
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="FAQ topics">
          {faqCategories.map(({ name, icon: Icon, questions: items }) => <button key={name} type="button" role="tab" aria-selected={activeCategory === name} onClick={() => setActiveCategory(name)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold transition ${activeCategory === name ? "border-emerald-700 bg-emerald-700 text-white shadow-sm dark:border-emerald-400 dark:bg-emerald-400 dark:text-slate-950" : "border-slate-200/80 bg-white/75 text-slate-600 hover:border-emerald-300 hover:text-emerald-800 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-emerald-400/30 dark:hover:text-emerald-200"}`}><Icon size={14}/>{name}<span className={`rounded-full px-1.5 py-0.5 text-[9px] ${activeCategory === name ? "bg-white/20" : "bg-slate-100 dark:bg-white/[0.08]"}`}>{items.length}</span></button>)}
        </div>
        <label className="relative block w-full xl:max-w-[280px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${active.name} FAQs`} className="w-full rounded-xl border border-slate-200/80 bg-white/75 py-2.5 pl-9 pr-3 text-[12px] text-slate-800 shadow-sm outline-none backdrop-blur-xl transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-white/10 dark:bg-slate-900/65 dark:text-slate-100 dark:placeholder:text-slate-500"/></label>
      </div>

      <section role="tabpanel" aria-label={`${active.name} FAQs`}>
        <div className="mb-3 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"><ActiveIcon size={16}/></span><div><h2 className="text-[14px] font-bold text-slate-900 dark:text-white">{active.name}</h2><p className="text-[11px] text-slate-500 dark:text-slate-400">Select a card to expand its complete answer.</p></div></div>
        {questions.length ? <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {questions.map((item, index) => {
            const key = `${active.name}-${item.question}`;
            const isExpanded = expanded.includes(key);
            return <article key={key} className="group flex min-h-[205px] flex-col rounded-2xl border border-white/90 bg-white/80 p-4 shadow-[0_10px_30px_rgba(15,23,42,.06)] ring-1 ring-slate-200/65 backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_16px_38px_rgba(16,110,78,.1)] dark:border-white/[0.08] dark:bg-slate-900/65 dark:ring-white/[0.06] dark:hover:border-emerald-400/20">
              <div className="mb-3 flex items-center justify-between"><span className="rounded-lg bg-emerald-50 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">{active.name}</span><span className="font-mono text-[10px] text-slate-400">{String(index + 1).padStart(2, "0")}</span></div>
              <h3 className="text-[14px] font-bold leading-5 text-slate-900 dark:text-slate-100">{item.question}</h3>
              <p className="mt-2 flex-1 text-[12px] leading-[1.7] text-slate-600 dark:text-slate-300" style={{ display: isExpanded ? "block" : "-webkit-box", WebkitLineClamp: isExpanded ? "unset" : 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.answer}</p>
              <button type="button" aria-expanded={isExpanded} onClick={() => setExpanded((current) => isExpanded ? current.filter((value) => value !== key) : [...current, key])} className="mt-3 inline-flex w-fit items-center gap-1.5 text-[11px] font-bold text-emerald-700 transition hover:gap-2.5 dark:text-emerald-300">{isExpanded ? "Read less" : "Read more"}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}/></button>
            </article>;
          })}
        </div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-5 py-12 text-center dark:border-white/15 dark:bg-slate-900/40"><p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">No matching questions</p><p className="mt-1 text-[11px] text-slate-500">Try a different search term or select another FAQ topic.</p></div>}
      </section>
    </div>
  </main>;
}
