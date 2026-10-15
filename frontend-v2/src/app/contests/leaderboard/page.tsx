"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Trophy, Medal, ArrowLeft, Sparkles, Crown, UserRound, Target } from "lucide-react";
import api from "@/config/api";
import { useAuth } from "@/context/AuthContext";
import { usePublicContests } from "@/hooks/usePublicContests";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type PublicContest } from "@/lib/contests";

interface Ranking { rank: number; name: string; username?: string; solved: number; totalProblems: number }
export default function ContestLeaderboardPage() {
  return <Suspense fallback={<div role="status" className="pt-28 text-center">Loading contest rankings...</div>}><ContestLeaderboard /></Suspense>;
}
function ContestLeaderboard() {
  const querySlug = useSearchParams().get("contest");
  const { user } = useAuth();
  const { contests, loading, error: catalogError } = usePublicContests();
  const [slug, setSlug] = useState(""); const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; rows: Ranking[]; contest?: PublicContest; error?: string }>();
  const selected = slug || querySlug || contests[0]?.slug || "";
  const key = `${selected}:${retry}:${user?.id || user?._id || "guest"}`;
  const endpoint = user && !contests.some(contest => contest.slug === selected) ? "member-leaderboard" : "leaderboard";
  useEffect(() => {
    if (!selected) return;
    let request: AbortController | undefined;
    const load = async () => {
      request?.abort(); request = new AbortController(); const active = request;
      try {
        const { data } = await api.get(`/contests/${encodeURIComponent(selected)}/${endpoint}`, { signal: active.signal });
        if (!Array.isArray(data.leaderboard)) throw new Error("Invalid leaderboard response");
        if (!active.signal.aborted) setResult({ key, rows: data.leaderboard, contest: data.contest });
      } catch { if (!active.signal.aborted) setResult({ key, rows: [], error: "Contest rankings could not be loaded. Please try again." }); }
    };
    void load(); const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30000);
    return () => { clearInterval(timer); request?.abort(); };
  }, [selected, key, endpoint]);
  const error = catalogError || (result?.key === key ? result.error : null);
  const options = result?.key === key && result.contest && !contests.some(contest => contest.slug === result.contest?.slug) ? [...contests, result.contest] : contests;
  return <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-16 space-y-7">
    <header className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/[0.06] via-card to-muted/40 p-6 sm:p-9 shadow-sm">
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
      <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5"><div><Link href="/contests" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition mb-5"><ArrowLeft className="w-4 h-4" /> All contests</Link><p className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-primary mb-3"><Sparkles className="w-4 h-4" /> THE ARENA</p><h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Contest leaderboard</h1><p className="text-muted-foreground mt-2 max-w-xl">Every accepted solution counts. See how you stack up against the field.</p></div><div className="inline-flex items-center gap-2 self-start sm:self-auto rounded-xl border border-border/70 bg-background/75 px-3.5 py-2.5 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-success animate-pulse" /> Updates every 30 seconds</div></div>
    </header>
    {options.length > 0 && <div className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5 shadow-sm"><label htmlFor="ranked-contest" className="block text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">Choose a contest</label><select id="ranked-contest" value={selected} onChange={event => setSlug(event.target.value)} className="block w-full sm:max-w-xl p-3 rounded-xl border border-border/70 bg-background text-sm font-medium outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"><option value="" disabled>Select a contest</option>{options.map(contest => <option key={contest.id} value={contest.slug}>{contest.title}</option>)}</select></div>}
    {error ? <div role="alert" className="p-6 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-3"><p className="font-medium">{error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Try again</Button></div> : loading || (selected && result?.key !== key) ? <div role="status" className="py-20 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><Spinner />Loading rankings...</div> : !selected ? <div className="p-12 border border-border/70 bg-card rounded-2xl text-center text-muted-foreground"><Trophy className="mx-auto mb-3 h-8 w-8 opacity-40" />No published public contests are available.</div> : <>
      {result?.rows.length ? <>
        <section aria-label="Top contestants" className="rounded-3xl border border-border/70 bg-card px-4 sm:px-8 pt-7 pb-6 shadow-sm"><div className="flex items-center gap-2 mb-7"><Crown className="w-5 h-5 text-amber-500" /><h2 className="font-semibold">Top performers</h2></div><div className="grid grid-cols-3 gap-2 sm:gap-5 max-w-3xl mx-auto items-end">{[result.rows[1],result.rows[0],result.rows[2]].map((row,index)=>{if(!row)return <div key={`empty-${index}`} className="min-h-20"/>;const rank=row.rank;const first=rank===1;return <div key={`${row.rank}:${row.username||row.name}`} className={`relative flex min-w-0 flex-col items-center rounded-t-2xl border border-b-0 px-2 sm:px-4 pt-5 pb-4 text-center ${first?"min-h-48 sm:min-h-56 border-amber-400/40 bg-gradient-to-t from-amber-400/15 to-amber-400/5":"min-h-40 sm:min-h-48 border-border bg-gradient-to-t from-muted/70 to-muted/20"}`}><span className={`mb-3 grid h-11 w-11 sm:h-14 sm:w-14 place-items-center rounded-full border text-lg font-bold ${first?"border-amber-400/40 bg-amber-400/15 text-amber-500":"border-border bg-background text-muted-foreground"}`}>{first?<Medal className="h-6 w-6" />:rank}</span><p className="w-full truncate text-xs sm:text-sm font-semibold" title={row.name}>{row.name}</p>{row.username&&<p className="w-full truncate text-[10px] sm:text-xs text-muted-foreground">@{row.username}</p>}<p className="mt-3 text-lg sm:text-2xl font-bold tabular-nums">{row.solved}<span className="text-xs sm:text-sm font-medium text-muted-foreground"> / {row.totalProblems}</span></p><p className="text-[10px] sm:text-xs text-muted-foreground">problems solved</p></div>})}</div></section>
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm" aria-label="Contest rankings"><div className="flex items-center justify-between border-b border-border/70 px-4 sm:px-6 py-4"><div><h2 className="font-semibold">Full standings</h2><p className="text-xs text-muted-foreground mt-0.5">{result.rows.length} {result.rows.length===1?"participant":"participants"}</p></div><div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Target className="w-3.5 h-3.5" />Solved / total</div></div><ol className="divide-y divide-border/70">{result.rows.map(row=><li key={`${row.rank}:${row.username||row.name}`} className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:grid-cols-[4rem_minmax(0,1fr)_10rem] items-center gap-3 sm:gap-5 px-4 sm:px-6 py-3.5 transition hover:bg-muted/35 ${row.rank<=3?"bg-primary/[0.025]":""}`}><span className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-bold tabular-nums ${row.rank===1?"bg-amber-400/15 text-amber-600 dark:text-amber-400":row.rank===2?"bg-slate-400/15 text-slate-500":row.rank===3?"bg-orange-700/10 text-orange-700 dark:text-orange-400":"text-muted-foreground"}`}>{row.rank===1?<Medal className="h-4 w-4" />:`#${row.rank}`}</span><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><UserRound className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{row.name}</p>{row.username&&<p className="truncate text-xs text-muted-foreground">@{row.username}</p>}</div></div><div className="text-right"><p className="text-sm font-bold tabular-nums">{row.solved}<span className="font-normal text-muted-foreground"> / {row.totalProblems}</span></p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">solved</p></div></li>)}</ol></section>
      </> : <div className="p-10 sm:p-14 border border-border/70 bg-card rounded-2xl text-center shadow-sm"><span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Trophy className="h-7 w-7" /></span><h2 className="text-lg font-semibold">Standings are warming up</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">No ranked submissions yet. Once participants solve problems during the contest, the leaderboard will appear here.</p></div>}
    </>}
  </main>;
}
