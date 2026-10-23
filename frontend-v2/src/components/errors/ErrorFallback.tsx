"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Braces, Home, LoaderCircle, RotateCcw, WifiOff } from "lucide-react";
import { logger } from "@/lib/logger";

type ErrorKind = "unexpected" | "network" | "server";

const copy: Record<ErrorKind, { eyebrow: string; title: string; description: string }> = {
  unexpected: {
    eyebrow: "Something went wrong",
    title: "Oops! Something went wrong.",
    description: "We hit an unexpected issue while loading this page. Your work matters to us, and we’re here to help you get back on track.",
  },
  network: {
    eyebrow: "Connection issue",
    title: "You’re offline or disconnected",
    description: "We couldn’t connect to the server. Check your connection and try again.",
  },
  server: {
    eyebrow: "Service interruption",
    title: "Something isn’t working right",
    description: "Our server encountered a problem. Please try again in a little while.",
  },
};

export function ErrorFallback({
  error,
  reset,
  kind = "unexpected",
  homeHref = "/",
  homeLabel = "Back to Home",
  reloadOnRetry = false,
}: {
  error?: Error & { digest?: string };
  reset: () => void;
  kind?: ErrorKind;
  homeHref?: string;
  homeLabel?: string;
  reloadOnRetry?: boolean;
}) {
  const [retrying, setRetrying] = useState(false);
  const text = copy[kind];
  const Icon = kind === "network" ? WifiOff : kind === "server" ? AlertTriangle : Braces;

  const retry = () => {
    if (retrying) return;
    setRetrying(true);
    logger.info("User requested error recovery", { kind, digest: error?.digest }, "ErrorBoundary");
    try {
      if (reloadOnRetry) {
        window.location.reload();
      } else {
        reset();
      }
    } finally {
      // Keep the control disabled briefly to prevent rapid repeated retries.
      window.setTimeout(() => setRetrying(false), 900);
    }
  };

  return (
    <section className="relative isolate flex min-h-[min(680px,75vh)] flex-1 items-center justify-center overflow-hidden px-4 py-12 sm:px-6 sm:py-16" aria-labelledby="error-title">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="error-orb absolute -left-32 top-[-8rem] h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="error-orb error-orb-delay absolute -right-36 bottom-[-10rem] h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background to-background/80" />
      </div>

      <div className="error-enter w-full max-w-2xl text-center">
        <div className="relative mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-[2rem] border border-border/80 bg-card/85 shadow-xl shadow-primary/5 backdrop-blur sm:h-28 sm:w-28">
          <div aria-hidden="true" className="absolute inset-2 rounded-[1.5rem] border border-primary/10" />
          <Icon aria-hidden="true" className="h-10 w-10 text-primary sm:h-12 sm:w-12" strokeWidth={1.6} />
          <span aria-hidden="true" className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground shadow-md">
            {kind === "network" ? <WifiOff className="h-4 w-4" /> : <span className="font-mono text-xs">!</span>}
          </span>
        </div>

        <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />{text.eyebrow}
        </p>
        <h1 id="error-title" className="mx-auto mt-5 max-w-xl text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-[2.75rem]">
          {text.title}
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-pretty text-sm leading-7 text-muted-foreground sm:text-base">
          {text.description}
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={retry} disabled={retrying} aria-label="Try again" className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/15 transition duration-200 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-80 motion-reduce:transform-none motion-reduce:transition-none">
            {retrying ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RotateCcw className="h-4 w-4" />}
            {retrying ? "Trying again…" : "Try Again"}
          </button>
          <Link href={homeHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card/70 px-6 text-sm font-semibold text-foreground shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none">
            <Home className="h-4 w-4" />{homeLabel}
          </Link>
        </div>

        <p className="mt-7 text-xs text-muted-foreground">If this keeps happening, please try again in a moment.</p>
        {process.env.NODE_ENV === "development" && error?.message && (
          <details className="mx-auto mt-7 max-w-lg rounded-xl border border-border bg-card/70 p-3 text-left text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium">Developer details</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words font-mono">{error.message}{error.digest ? `\nDigest: ${error.digest}` : ""}</pre>
          </details>
        )}
      </div>
    </section>
  );
}
