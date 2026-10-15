"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Calendar, Clock, Code2, Search, ArrowRight, Sparkles, Radio, CheckCircle2 } from "lucide-react";
import { usePublicContests } from "@/hooks/usePublicContests";
import { contestDuration, contestStatus } from "@/lib/contests";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export default function ContestsPage() {
  const { contests, loading, error, refresh } = usePublicContests();
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState("All"); const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const visible = contests.filter(contest => contest.title.toLowerCase().includes(search.trim().toLowerCase()) && (filter === "All" || contestStatus(contest, now) === filter));
  const counts = { All: contests.length, Upcoming: 0, Live: 0, Completed: 0 };
  contests.forEach(contest => { const status = contestStatus(contest, now); if (status in counts) counts[status as keyof typeof counts]++; });
  return <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-16 space-y-8">
    <header className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/[0.06] via-card to-muted/40 p-6 sm:p-10 shadow-sm">
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-7">
        <div className="max-w-2xl"><p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-primary mb-4"><Sparkles className="w-3.5 h-3.5" /> CODESKILL ARENA</p><h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Think fast.<br className="hidden sm:block" /> <span className="text-primary">Code together.</span></h1><p className="text-muted-foreground mt-4 leading-relaxed max-w-xl">Take on focused coding challenges, climb the standings, and track your progress across every contest.</p></div>
        <Link href="/contests/leaderboard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"> <Trophy className="w-4 h-4" /> View leaderboard <ArrowRight className="w-4 h-4" /></Link>
      </div>
      <div className="relative mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[{label:"Total contests",value:counts.All,icon:Trophy},{label:"Live now",value:counts.Live,icon:Radio},{label:"Completed",value:counts.Completed,icon:CheckCircle2}].map(({label,value,icon:Icon})=><div key={label} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/75 p-4 backdrop-blur-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><div><p className="text-2xl font-bold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></div>)}
      </div>
    </header>
    <section aria-label="Find a contest" className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input aria-label="Search contests" placeholder="Search contests..." value={search} onChange={event => setSearch(event.target.value)} className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-border/70 bg-background text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15" /></div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter contests">{["All", "Upcoming", "Live", "Completed"].map(status => <button key={status} onClick={() => setFilter(status)} aria-pressed={filter === status} className={`px-3.5 py-2 rounded-xl border text-sm font-medium transition ${filter === status ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/70"}`}>{status}<span className={`ml-2 text-xs ${filter === status ? "opacity-75" : "opacity-60"}`}>{counts[status as keyof typeof counts]}</span></button>)}</div>
      </div>
    </section>
    {error && <div role="alert" className="border border-destructive/30 rounded-xl p-5 space-y-3"><p className="text-destructive">{error}</p><Button variant="outline" onClick={() => void refresh()}>Try again</Button></div>}
    {loading ? <div role="status" className="py-16 flex justify-center gap-3 text-muted-foreground"><Spinner />Loading contests...</div> : !error && visible.length === 0 ? <div className="border border-border bg-card rounded-2xl p-12 text-center text-muted-foreground">No contests found matching your criteria.</div> : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">{visible.map(contest => {
      const status = contestStatus(contest, now);
      return <article key={contest.id} className="group flex min-h-[380px] flex-col rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm transition-colors duration-200 hover:border-foreground/20 hover:shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-muted/40 text-foreground"><Trophy className="h-4 w-4" /></div>
          <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${status === "Live" ? "border-emerald-600/20 bg-emerald-600/5 text-emerald-700 dark:text-emerald-400" : status === "Upcoming" ? "border-border bg-muted/50 text-muted-foreground" : "border-border bg-background text-muted-foreground"}`}>{status === "Live" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />}{status}</span>
        </div>
        <div className="mt-5 min-h-[104px]"><h2 className="text-lg font-semibold leading-snug tracking-tight text-foreground break-words line-clamp-2">{contest.title}</h2><p className="mt-2.5 text-sm leading-6 text-muted-foreground line-clamp-2">{contest.description || "Put your problem-solving skills to the test in this CodeSkill contest."}</p></div>
        <dl className="mt-5 space-y-3 border-t border-border/70 pt-4 text-sm">
          <div className="flex items-start gap-3"><Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><dt className="text-xs text-muted-foreground">Starts</dt><dd className="mt-0.5 font-medium text-foreground">{new Date(contest.startTime).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})}</dd></div></div>
          <div className="flex items-center gap-5 pl-7 text-xs text-muted-foreground"><div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /><dd>{contestDuration(contest)} min</dd></div><div className="flex items-center gap-1.5"><Code2 className="h-3.5 w-3.5" /><dd>{contest.problems.length} problems</dd></div></div>
        </dl>
        <Link href={`/contests/${encodeURIComponent(contest.slug)}`} className="mt-auto flex items-center justify-between border-t border-border/70 pt-4 text-sm font-semibold text-foreground transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">View contest <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></Link>
      </article>;
    })}</div>}
  </main>;
}
