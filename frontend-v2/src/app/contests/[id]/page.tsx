"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { isAxiosError } from "axios";
import { ArrowLeft, ArrowRight, Calendar, CheckCircle2, Clock, Code2, LockKeyhole, RotateCcw, ShieldAlert, ShieldCheck, Trophy, Users } from "lucide-react";
import api from "@/config/api";
import { useAuth } from "@/context/AuthContext";
import { Spinner } from "@/components/ui/spinner";

interface Contest {
  id: string;
  title: string;
  slug: string;
  description: string;
  startTime: string;
  endTime: string;
  problems: string[];
  isPrivate: boolean;
  participants?: string[];
  antiCheatConfig?: { maxTabSwitchViolations?: number; actionOnMaxViolations?: string };
}

type ContestResult = {
  key: string;
  contest?: Contest;
  error?: string;
};

export default function ContestDetailsPage() {
  // The existing [id] segment carries the public slug on this detail route.
  const { id: slug } = useParams<{ id: string }>();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<ContestResult>();
  const [now, setNow] = useState(Date.now);
  const requestKey = `${slug}:${retry}`;

  useEffect(() => {
    const controller = new AbortController();
    api.get<Contest>(`/contests/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, contest: data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key: requestKey,
          error: isAxiosError(error) && error.response?.status === 404
            ? "Contest not found. It may not have been published or may no longer be available."
            : "Unable to load this contest. Please try again.",
        });
      });
    return () => {
      controller.abort();
    };
  }, [slug, requestKey]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  if (result?.key !== requestKey) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center gap-3" role="status">
        <Spinner className="text-primary" /> Loading contest...
      </div>
    );
  }

  const contest = result.contest;
  if (!contest) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center space-y-4">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><Trophy className="h-7 w-7" /></span>
        <h1 className="text-2xl font-bold text-foreground">Contest unavailable</h1>
        <p className="text-muted-foreground" role="alert">{result.error}</p>
        <button type="button" onClick={() => setRetry((value) => value + 1)} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground">
          Try again
        </button>
      </div>
    );
  }

  const ended = now >= new Date(contest.endTime).getTime();
  const upcoming = now < new Date(contest.startTime).getTime();
  const status = ended ? "Completed" : upcoming ? "Upcoming" : "Live";


  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-28 pb-16 space-y-7">
      <Link href="/contests" className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-4 w-4" /> Back to contests</Link>
      <header className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/[0.06] via-card to-muted/40 p-6 sm:p-9 shadow-sm">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative max-w-3xl"><div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground"><Trophy className="h-3.5 w-3.5 text-primary" /> CODESKILL CONTEST <span className="text-border">/</span><span className={`inline-flex items-center gap-1.5 ${status === "Live" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>{status === "Live" && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}{status}</span></div><h1 className="mt-5 text-3xl sm:text-4xl font-bold tracking-tight text-foreground break-words">{contest.title}</h1><p className="mt-3 max-w-2xl text-sm sm:text-base leading-relaxed text-muted-foreground">{contest.description || "Test your problem-solving skills in this CodeSkill contest."}</p></div>
        <div className="relative mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Starts", value: new Date(contest.startTime).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}), icon: Calendar },
            { label: "Ends", value: new Date(contest.endTime).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}), icon: Clock },
            { label: "Problems", value: `${contest.problems.length} ${contest.problems.length === 1 ? "problem" : "problems"}`, icon: Code2 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 p-4 backdrop-blur-sm"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground"><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold text-foreground">{value}</p></div></div>
          ))}
        </div>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <div className="space-y-5">
          <section className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-sm"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground"><ShieldCheck className="h-5 w-5" /></span><div><h2 className="text-base font-semibold">About this contest</h2><p className="mt-2 text-sm leading-7 text-muted-foreground whitespace-pre-wrap break-words">{contest.description || "The contest is ready. Review the schedule and register to take part."}</p></div></div></section>
          <section className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-foreground"><Code2 className="h-5 w-5" /></span><div><h2 className="font-semibold">What to expect</h2><p className="text-sm text-muted-foreground mt-1">{contest.problems.length} {contest.problems.length === 1 ? "problem" : "problems"} selected for this challenge</p></div></div><div className="mt-4 flex flex-wrap gap-2">{["Individual participation", "Accepted submissions count toward standings"].map(item=><span key={item} className="inline-flex items-center gap-1.5 rounded-lg bg-muted/70 px-3 py-2 text-xs font-medium text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />{item}</span>)}</div></section>
          <section className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-foreground"><ShieldAlert className="h-5 w-5" /></span><div><h2 className="font-semibold">Contest rules &amp; exam security</h2><p className="mt-1 text-sm text-muted-foreground">Review these requirements before you begin.</p></div></div><ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground"><li><strong className="text-foreground">Fullscreen:</strong> Remain in fullscreen mode throughout your attempt. Exiting fullscreen is recorded as a violation.</li><li><strong className="text-foreground">Tab switching:</strong> Up to <strong className="text-foreground">{contest.antiCheatConfig?.maxTabSwitchViolations || 3} violations</strong> are allowed before {contest.antiCheatConfig?.actionOnMaxViolations === "lock_attempt" ? "your session is locked" : contest.antiCheatConfig?.actionOnMaxViolations === "flag_review" ? "your attempt is flagged for review" : "your attempt is submitted automatically"}.</li><li><strong className="text-foreground">One active session:</strong> Additional attempts require administrator authorization.</li></ul></section>
          {!contest.isPrivate && <Link href={`/contests/leaderboard?contest=${encodeURIComponent(slug)}`} className="inline-flex items-center gap-2 text-sm font-semibold text-foreground hover:text-muted-foreground transition">View contest leaderboard <ArrowRight className="h-4 w-4" /></Link>}
        </div>
        <ContestRegistration key={contest.id} contest={contest} ended={ended} upcoming={upcoming} />
      </div>
    </main>
  );
}


function ContestRegistration({ contest, ended, upcoming }: { contest: Contest; ended: boolean; upcoming: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const [password, setPassword] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registeredId, setRegisteredId] = useState<string>();
  const [attemptEnded, setAttemptEnded] = useState(false);
  const [canReattempt, setCanReattempt] = useState(false);
  const [reattemptDetails, setReattemptDetails] = useState<{ usedAttempts?: number; allowedAttempts?: number; expiresAt?: string; reason?: string } | null>(null);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    api.get(`/contests/${encodeURIComponent(contest.id)}/registration`, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted && data.registered) { setRegisteredId(contest.id); setAttemptEnded(!!data.attemptStatus && data.attemptStatus !== "InProgress"); setCanReattempt(!!data.canReattempt); setReattemptDetails(data.reattemptDetails || null); }
    }).catch(() => {});
    return () => controller.abort();
  }, [contest.id, user]);
  const [registrationError, setRegistrationError] = useState("");
  const registrationRequest = useRef<AbortController | null>(null);
  useEffect(() => () => registrationRequest.current?.abort(), []);
  const registered = registeredId === contest.id || !!(user && contest.participants?.includes(user.id || user._id));

  const register = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || registering || registered || Date.now() >= new Date(contest.endTime).getTime()) return;
    const controller = new AbortController();
    registrationRequest.current = controller;
    setRegistering(true);
    setRegistrationError("");
    try {
      // Registration takes the database ID, while public detail links use the slug.
      await api.post(`/contests/${encodeURIComponent(contest.id)}/register`,
        contest.isPrivate ? { password } : {}, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setRegisteredId(contest.id);
        setPassword("");
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        const message = isAxiosError<{ message?: string }>(error) ? error.response?.data?.message : undefined;
        setRegistrationError(typeof message === "string" ? message : "Registration failed. Please try again.");
      }
    } finally {
      if (!controller.signal.aborted) setRegistering(false);
    }
  };


  const buttonClass = "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
  return (
      <aside className="lg:sticky lg:top-24 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className="border-b border-border/70 bg-muted/35 p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Your next step</p><h2 className="mt-2 text-xl font-bold">{ended ? "Contest wrapped up" : registered ? "You're on the list" : upcoming ? "Save your spot" : "Ready to compete?"}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{ended ? "This contest is over. Check the standings to see how participants did." : upcoming ? "Register now. You can enter the challenge when it starts." : "Register to enter the contest and submit your solutions."}</p></div>
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-4 w-4" />{contest.isPrivate ? "Private contest" : "Open to all students"}<span className="mx-1 text-border">·</span><LockKeyhole className="h-3.5 w-3.5" />{contest.isPrivate ? "Password required" : "Free to join"}</div>
          {ended ? <div className="space-y-3"><p className="rounded-xl bg-muted/60 px-3.5 py-3 text-sm text-muted-foreground" role="status">Registration is closed because this contest has ended.</p>{!contest.isPrivate && <Link className={buttonClass} href={`/contests/leaderboard?contest=${encodeURIComponent(contest.slug)}`}>View standings <ArrowRight className="h-4 w-4" /></Link>}</div>
            : registered ? <div className="space-y-3"><p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3.5 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400" role="status"><CheckCircle2 className="h-4 w-4 shrink-0" />You are registered for this contest.</p>{canReattempt && <div className="space-y-3 rounded-xl border border-border bg-muted/50 p-3.5"><p className="flex items-center gap-2 text-sm font-semibold"><RotateCcw className="h-4 w-4" />Authorized reattempt</p><p className="text-xs leading-relaxed text-muted-foreground">{reattemptDetails?.usedAttempts || 0} of {reattemptDetails?.allowedAttempts || 1} attempts used.{reattemptDetails?.expiresAt && ` Access until ${new Date(reattemptDetails.expiresAt).toLocaleString()}.`}{reattemptDetails?.reason && ` Reason: ${reattemptDetails.reason}`}</p><Link className={buttonClass} href={`/contests/${encodeURIComponent(contest.id)}/attempt`}>Start reattempt <ArrowRight className="h-4 w-4" /></Link></div>}{attemptEnded && !canReattempt ? <Link className={buttonClass} href={`/contests/leaderboard?contest=${encodeURIComponent(contest.slug)}`}>View your rankings <ArrowRight className="h-4 w-4" /></Link> : !upcoming && !canReattempt && <Link className={buttonClass} href={`/contests/${encodeURIComponent(contest.id)}/attempt`}>Enter contest <ArrowRight className="h-4 w-4" /></Link>}</div>
            : authLoading ? <p className="py-2 text-sm text-muted-foreground" role="status"><Spinner className="mr-2 inline h-4 w-4" />Checking your account...</p>
            : !user ? <div className="space-y-3"><p className="text-sm leading-relaxed text-muted-foreground">Sign in to register and take part in this contest.</p><Link className={buttonClass} href="/login">Sign in to register <ArrowRight className="h-4 w-4" /></Link></div>
            : <form onSubmit={register} className="space-y-4">
              {contest.isPrivate && <div className="space-y-2"><label htmlFor="contest-password" className="block text-sm font-medium text-foreground">Contest password</label><input id="contest-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter the contest password" className="w-full px-3.5 py-3 rounded-xl border border-border bg-background text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15" /></div>}
              {registrationError && <p className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{registrationError}</p>}
              <button type="submit" disabled={registering} className={buttonClass}>{registering ? <><Spinner className="h-4 w-4" />Registering...</> : <>Register for contest <ArrowRight className="h-4 w-4" /></>}</button>
              <p className="text-center text-xs text-muted-foreground">Your contest progress will appear on the standings.</p>
            </form>}
        </div>
      </aside>
  );
}
