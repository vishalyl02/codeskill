"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpenCheck, Brain, CheckCircle2, ChevronRight, Clock3, Code2, Database, Layers3, ListChecks, Network, Plus, RefreshCw, Search, ServerCog, Shield, Sparkles } from "lucide-react";
import { adminAssessmentsAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";

type Subject = { id: string; name: string; group: string; description: string; icon: typeof Shield; color: string; topics: string[] };
const subjects: Subject[] = [
  { id: "os", name: "Operating Systems", group: "Computer Science Fundamentals", description: "Processes, memory, scheduling, synchronization, and deadlocks.", icon: ServerCog, color: "violet", topics: ["OS Fundamentals", "Process Management", "Memory Management", "Synchronization & Deadlocks", "Advanced OS Concepts"] },
  { id: "dbms", name: "Database Management Systems", group: "Computer Science Fundamentals", description: "SQL, relational design, transactions, indexing, and concurrency.", icon: Database, color: "blue", topics: ["DBMS Fundamentals", "SQL & Joins", "Keys & Normalization", "Transactions & ACID", "Indexing & Concurrency"] },
  { id: "cn", name: "Computer Networks", group: "Computer Science Fundamentals", description: "Network layers, addressing, transport protocols, routing, and web protocols.", icon: Network, color: "cyan", topics: ["Network Fundamentals", "OSI & TCP/IP Models", "IP Addressing & Routing", "TCP, UDP & DNS", "HTTP, HTTPS & Security"] },
  { id: "dsa", name: "Data Structures & Algorithms", group: "Programming & Development", description: "Core data structures, algorithms, complexity, and problem-solving patterns.", icon: Brain, color: "amber", topics: ["DSA Fundamentals", "Arrays, Strings & Lists", "Stacks, Queues & Trees", "Graphs & Traversals", "Sorting, Search & Dynamic Programming"] },
  { id: "react", name: "React.js", group: "Programming & Development", description: "Components, hooks, state, rendering, routing, and performance.", icon: Code2, color: "sky", topics: ["React Fundamentals", "Components, Props & State", "Hooks & Effects", "Context, Routing & Data", "Rendering & Performance"] },
  { id: "node", name: "Node.js", group: "Programming & Development", description: "The event loop, async code, modules, Express, APIs, and security basics.", icon: Layers3, color: "emerald", topics: ["Node.js Fundamentals", "Event Loop & Async", "Modules, npm & APIs", "Express & Middleware", "Errors, Security & Authentication"] },
];
const colorClasses: Record<string, { icon: string; chip: string; border: string }> = {
  violet: { icon: "bg-violet-500/10 text-violet-600 dark:text-violet-400", chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300", border: "hover:border-violet-300 dark:hover:border-violet-700" },
  blue: { icon: "bg-blue-500/10 text-blue-600 dark:text-blue-400", chip: "bg-blue-500/10 text-blue-700 dark:text-blue-300", border: "hover:border-blue-300 dark:hover:border-blue-700" },
  cyan: { icon: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400", chip: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300", border: "hover:border-cyan-300 dark:hover:border-cyan-700" },
  amber: { icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400", chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300", border: "hover:border-amber-300 dark:hover:border-amber-700" },
  sky: { icon: "bg-sky-500/10 text-sky-600 dark:text-sky-400", chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300", border: "hover:border-sky-300 dark:hover:border-sky-700" },
  emerald: { icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", border: "hover:border-emerald-300 dark:hover:border-emerald-700" },
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export default function McqsAdminPage() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(false);
    adminAssessmentsAPI.getAll({ status: "all" }).then(({ data }) => {
      if (active) setAssessments(Array.isArray(data?.assessments) ? data.assessments : []);
    }).catch(() => { if (active) setLoadError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  const selected = subjects.find(s => s.id === selectedId) || null;
  const filteredSubjects = useMemo(() => subjects.filter(s => `${s.name} ${s.group} ${s.description} ${s.topics.join(" ")}`.toLowerCase().includes(search.toLowerCase().trim())), [search]);
  const findTests = (subject: Subject) => assessments.filter(a => {
    const haystack = norm(`${a.title || ""} ${a.description || ""} ${a.category || ""} ${a.code || ""}`);
    const subjectTerms = [subject.name, subject.id, ...(subject.id === "cn" ? ["computer networks", "network"] : []), ...(subject.id === "os" ? ["operating systems"] : []), ...(subject.id === "dsa" ? ["data structures", "algorithms"] : [])].map(norm);
    return subjectTerms.some(term => term && haystack.includes(term));
  });
  const groups = ["Computer Science Fundamentals", "Programming & Development"];

  return <main className="min-h-full bg-background px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><ListChecks className="h-4 w-4" /> Question Bank / MCQs</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-3xl">MCQ Practice &amp; Assessments</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">Browse focused tests for core computer science subjects and modern development skills.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setRefresh(n => n + 1)} aria-label="Refresh assessments" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button>
          <Link href="/admin/assessments/create" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"><Plus className="h-4 w-4" />Create test</Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[{ label: "Subjects", value: "06", icon: BookOpenCheck }, { label: "Test templates", value: "30", icon: Layers3 }, { label: "Target questions / test", value: "20", icon: Brain }, { label: "Available tests", value: loading ? "…" : String(assessments.filter(a => a.status === "published" || a.status === "ongoing").length).padStart(2, "0"), icon: CheckCircle2 }].map(stat => <div key={stat.label} className="rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between text-muted-foreground"><span className="text-xs font-medium sm:text-sm">{stat.label}</span><stat.icon className="h-4 w-4" /></div><p className="mt-2 text-2xl font-bold">{stat.value}</p></div>)}
      </section>

      <div className="relative max-w-xl"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search subjects, topics..." aria-label="Search MCQ subjects" className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" /></div>

      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><span>Assessment data could not be loaded. You can still browse subjects and create tests.</span><button onClick={() => setRefresh(n => n + 1)} className="font-semibold text-primary">Try again</button></div>}

      {selected ? <section className="space-y-5">
        <button onClick={() => setSelectedId(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />All subjects</button>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-4"><div className={`rounded-2xl p-3 ${colorClasses[selected.color].icon}`}><selected.icon className="h-7 w-7" /></div><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{selected.group}</p><h2 className="mt-1 text-2xl font-bold">{selected.name}</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">{selected.description}</p></div></div>
          <Link href="/admin/assessments/create" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />Create subject test</Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {selected.topics.map((topic, i) => {
            const matches = findTests(selected).filter((a: any) => norm(a.title || "").includes(norm(topic)) || norm(topic).includes(norm(a.title || "")));
            const test = matches[0];
            return <article key={topic} className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between"><span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${colorClasses[selected.color].chip}`}>TEST {String(i + 1).padStart(2, "0")}</span><span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />20-question target</span></div>
              <h3 className="mt-4 text-lg font-bold">{topic}</h3><p className="mt-1 min-h-10 text-sm text-muted-foreground">A focused multiple-choice assessment template covering {topic.toLowerCase()}.</p>
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs"><span className="text-muted-foreground">{test ? `${test.durationMinutes || 30} min · ${test.status || "draft"}` : "30 minutes · Mixed difficulty"}</span>{test ? <Link href={`/admin/assessments/${test.id || test._id}`} className="inline-flex items-center gap-1 font-semibold text-primary">Manage<ArrowRight className="h-3.5 w-3.5" /></Link> : <Link href="/admin/assessments/create" className="inline-flex items-center gap-1 font-semibold text-primary">Build test<ChevronRight className="h-3.5 w-3.5" /></Link>}</div>
            </article>;
          })}
        </div>
      </section> : <div className="space-y-7">
        {groups.map(group => {
          const list = filteredSubjects.filter(s => s.group === group);
          if (!list.length) return null;
          return <section key={group}>
            <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Learning paths</p><h2 className="mt-1 text-xl font-bold">{group}</h2></div><span className="text-sm text-muted-foreground">{list.length} subjects</span></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map(subject => {
              const Icon = subject.icon; const styles = colorClasses[subject.color]; const tests = findTests(subject);
              return <button key={subject.id} onClick={() => { setSelectedId(subject.id); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`group rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${styles.border}`}>
                <div className="flex items-start justify-between"><span className={`rounded-xl p-3 ${styles.icon}`}><Icon className="h-6 w-6" /></span><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{tests.length} available</span></div>
                <h3 className="mt-4 text-lg font-bold group-hover:text-primary">{subject.name}</h3><p className="mt-1 min-h-10 text-sm leading-relaxed text-muted-foreground">{subject.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">{subject.topics.slice(0, 3).map(topic => <span key={topic} className="rounded-md bg-muted/70 px-2 py-1 text-[11px] text-muted-foreground">{topic}</span>)}<span className="rounded-md bg-muted/70 px-2 py-1 text-[11px] text-muted-foreground">+2 topics</span></div>
                <div className="mt-5 flex items-center justify-between border-t border-border pt-4"><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><ListChecks className="h-3.5 w-3.5" />5 topic tests</span><span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">View tests<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></div>
              </button>;
            })}</div>
          </section>;
        })}
        {filteredSubjects.length === 0 && <div className="rounded-2xl border border-dashed border-border py-16 text-center"><Sparkles className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-semibold">No subjects match “{search}”</p><p className="mt-1 text-sm text-muted-foreground">Try a different subject or topic.</p></div>}
      </div>}
      {loading && <div role="status" className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground"><Spinner />Refreshing assessment counts…</div>}
    </div>
  </main>;
}
