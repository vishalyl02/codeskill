"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/config/api";
import { useAuth } from "@/context/AuthContext";
import { useAntiCheatMaster } from "@/hooks/anti-cheat/useAntiCheatMaster";
import ProblemWorkspace from "@/components/problems/ProblemWorkspace";
import { ContestStartGate } from "./_components/ContestStartGate";
import { AntiCheatWarningDialog } from "./_components/AntiCheatWarningDialog";
import { WatermarkOverlay } from "./_components/WatermarkOverlay";
import { SubmissionConfirmationDialog } from "./_components/SubmissionConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type PublicContest } from "@/lib/contests";

interface AttemptContext {
  contest: PublicContest; sessionId: string; startedAt: string;
  problems: Array<{ id: string; title: string; slug: string }>;
  antiCheatConfig: {
    enableFullscreen: boolean; enableCopyProtect: boolean; enablePasteProtect: boolean;
    enableDevToolsDetect: boolean; enableTabSwitchDetect: boolean; warningLimit: number;
    autoSubmitOnViolation?: boolean; enableWatermark?: boolean;
  };
}
export default function ContestAttemptPage() {
  const { id } = useParams<{ id: string }>();
  return <ContestSession key={id} id={id} />;
}
function ContestSession({ id }: { id: string }) {
  const router = useRouter(); const { user, loading: authLoading } = useAuth();
  const [result, setResult] = useState<{ key: string; context?: AttemptContext; error?: string }>();
  const [submissionError, setSubmissionError] = useState(""); const [retry, setRetry] = useState(0);
  const [hasStarted, setHasStarted] = useState(false); const [busy, setBusy] = useState(false); const [ended, setEnded] = useState(false);
  const [confirm, setConfirm] = useState(false); const [selected, setSelected] = useState(0); const [now, setNow] = useState(Date.now);
  const submission = useRef(false);
  const finishRequest = useRef<AbortController | null>(null);
  useEffect(() => () => finishRequest.current?.abort(), []);
  const key = `${id}:${user?.id || user?._id || 'guest'}:${retry}`;
  const context = result?.key === key ? result.context : undefined;
  const error = submissionError || (result?.key === key ? result.error : "");
  useEffect(() => {
    if (!user || authLoading) return;
    const controller = new AbortController();
    api.post(`/contests/${encodeURIComponent(id)}/start`, {}, { signal: controller.signal }).then(({ data }) => {
      if (!Array.isArray(data.problems) || !data.contest || !data.sessionId) throw new Error("Invalid contest session response");
      if (!controller.signal.aborted) setResult({ key, context: data });
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      const response = failure as { response?: { data?: { message?: string } } };
      setResult({ key, error: response.response?.data?.message || "This contest session could not be opened. Please try again." });
    });
    return () => controller.abort();
  }, [id, user, authLoading, key]);
  const finish = useCallback(async (automatic = false) => {
    if (!context || submission.current) return;
    submission.current = true; setBusy(true); setConfirm(false);
    if (automatic) setEnded(true);
    const controller = new AbortController(); finishRequest.current = controller;
    try {
      await api.post(`/contests/${encodeURIComponent(id)}/submit`, { sessionId: context.sessionId }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setEnded(true);
      router.replace(`/contests/leaderboard?contest=${encodeURIComponent(context.contest.slug)}`);
    } catch { if (!controller.signal.aborted) { setSubmissionError("Your contest could not be finalized. Please retry submission."); submission.current = false; } }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [id, context, router]);
  const autoSubmit = useCallback(() => { void finish(true); }, [finish]);
  const proctor = useAntiCheatMaster(
    id,
    user?.id || user?._id || "",
    context?.sessionId || "",
    context?.antiCheatConfig || {
      enableFullscreen: false,
      enableCopyProtect: false,
      enablePasteProtect: false,
      enableDevToolsDetect: false,
      enableTabSwitchDetect: false,
      warningLimit: 3,
    },
    autoSubmit,
    hasStarted && !ended,
  );
  useEffect(() => {
    if (!context || ended) return;
    const tick = () => { const time = Date.now(); setNow(time); if (time >= new Date(context.contest.endTime).getTime()) void finish(true); };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [context, ended, finish]);
  const problem = context?.problems[selected];
  const workspaceParams = useMemo(() => Promise.resolve({ id: problem?.slug || "" }), [problem?.slug]);
  if (authLoading || (!context && !error && user)) return <div role="status" className="min-h-screen flex justify-center items-center gap-3"><Spinner />Loading contest session...</div>;
  if (!user) return <div className="pt-28 p-8 text-center space-y-4"><h1 className="text-2xl font-bold">Sign in to participate</h1><Link href="/login" className="text-primary hover:underline">Log In</Link></div>;
  if (!context) return <div className="pt-28 p-8 text-center space-y-4"><h1 className="text-2xl font-bold">Contest unavailable</h1><p role="alert">{error}</p><Button onClick={() => setRetry(value => value + 1)}>Try again</Button><Link href="/contests" className="block text-primary">Browse contests</Link></div>;
  if (!hasStarted && !ended)
    return (
      <ContestStartGate
        onAccept={() => setHasStarted(true)}
        requestFullscreen={proctor.requestFullscreen}
        isFullscreen={proctor.isFullscreen}
        hasRequestedFullscreen={proctor.hasRequestedFullscreen}
        requireFullscreen={context.antiCheatConfig?.enableFullscreen !== false}
        maxViolations={(context.antiCheatConfig as any)?.maxTabSwitchViolations ?? (context.antiCheatConfig as any)?.warningLimit ?? 3}
        action={(context.antiCheatConfig as any)?.actionOnMaxViolations || "auto_submit"}
      />
    );
  const remaining = Math.max(0, Math.ceil((new Date(context.contest.endTime).getTime() - now) / 1000));
  const elapsed = Math.max(0, Math.floor((now - new Date(context.startedAt).getTime()) / 1000));
  return <div className="h-dvh bg-background flex flex-col overflow-hidden">
    {context.antiCheatConfig?.enableWatermark && <WatermarkOverlay fullName={user.name} username={user.username || user.uid || user.name} candidateId={user.uid || user.id} contestName={context.contest.title} sessionId={context.sessionId} enabled={!ended} />}
    <AntiCheatWarningDialog isOpen={proctor.isWarningDialogOpen && !ended} onClose={() => proctor.setIsWarningDialogOpen(false)} warnings={proctor.warnings} warningLimit={proctor.warningLimit} lastViolation={proctor.lastViolation} requestFullscreen={proctor.requestFullscreen} isFullscreen={proctor.isFullscreen} />
    <SubmissionConfirmationDialog isOpen={confirm} onClose={() => setConfirm(false)} onConfirm={() => void finish()} fullName={user.name} username={user.username || user.uid || user.name} contestName={context.contest.title} warnings={proctor.warnings} elapsedSeconds={elapsed} />
    <header className="border-b border-border bg-card px-4 py-3 flex flex-wrap gap-3 justify-between items-center shrink-0 z-50"><div className="min-w-0"><h1 className="font-bold truncate">{context.contest.title}</h1><p className="text-xs text-muted-foreground">{user.name} · Warnings {proctor.warnings} / {proctor.warningLimit}</p></div><div className="flex items-center gap-3"><span className="font-mono text-sm">{Math.floor(remaining / 3600).toString().padStart(2, "0")}:{Math.floor(remaining / 60 % 60).toString().padStart(2, "0")}:{(remaining % 60).toString().padStart(2, "0")}</span><Button size="sm" disabled={busy} onClick={() => ended ? void finish(true) : setConfirm(true)}>{busy ? "Submitting..." : ended ? "Retry submission" : "Finish Contest"}</Button></div></header>
    {error && <p role="alert" className="px-4 py-2 text-destructive shrink-0">{error}</p>}
    {ended ? <div className="p-8 text-center">This contest session has ended.</div> : <><nav aria-label="Contest problems" className="flex gap-2 overflow-x-auto p-2 border-b border-border shrink-0">{context.problems.map((item, index) => <button key={item.id} aria-pressed={selected === index} onClick={() => setSelected(index)} className={`px-3 py-2 text-sm rounded-md whitespace-nowrap ${selected === index ? "bg-foreground text-background" : "hover:bg-muted"}`}>{index + 1}. {item.title}</button>)}</nav><div className="flex-1 min-h-0"><Suspense fallback={<div role="status" className="p-8">Loading problem...</div>}>{problem ? <ProblemWorkspace key={problem.id} params={workspaceParams} embedded /> : <p className="p-8 text-center">No available problems are configured for this contest.</p>}</Suspense></div></>}
  </div>;
}
