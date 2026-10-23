"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, RotateCw } from "lucide-react";
import { logger } from "@/lib/logger";
import styles from "./ErrorFallback.module.css";

type ErrorKind = "unexpected" | "network" | "timeout" | "server";
type ErrorCopy = { label: string; title: string; description: string; note: string };

const copy: Record<ErrorKind, ErrorCopy> = {
  unexpected: {
    label: "Something went wrong",
    title: "A small pause. Back to solving soon.",
    description: "We hit an unexpected issue while loading this page. Give it another try in a moment.",
    note: "The page could not finish loading.",
  },
  network: {
    label: "Connection issue",
    title: "You’re offline or disconnected",
    description: "We couldn’t connect to the server. Check your connection and try again.",
    note: "Check your connection, then retry.",
  },
  timeout: {
    label: "Connection timed out",
    title: "That took too long.",
    description: "CodeSkill did not respond in time. Please try again.",
    note: "The connection reached its time limit.",
  },
  server: {
    label: "Service interruption",
    title: "We’ll be back shortly.",
    description: "CodeSkill is temporarily unavailable. Please try again in a little while.",
    note: "The service is taking a moment to respond.",
  },
};

const statusCopy: Record<number, ErrorCopy> = {
  400: { label: "Bad request", title: "That request didn’t work.", description: "We couldn’t understand this request. Check the address and try again.", note: "The request could not be processed." },
  401: { label: "Sign in required", title: "Please sign in again.", description: "Your session may have ended. Sign in to continue where you left off.", note: "This page needs an active session." },
  403: { label: "Access restricted", title: "This page isn’t available to you.", description: "Your account doesn’t have access to this page. If this seems wrong, contact your administrator.", note: "Access to this page was denied." },
  404: { label: "Page not found", title: "Looks like a wrong turn", description: "We couldn’t find the page you’re looking for. Check the address or head back home.", note: "The requested page was not found." },
  408: { label: "Request timed out", title: "That took too long.", description: "The request timed out before CodeSkill could respond. Please try again.", note: "The request reached its time limit." },
  429: { label: "Too many requests", title: "Let’s slow down for a moment.", description: "Too many requests reached CodeSkill at once. Wait a moment, then try again.", note: "The request limit was reached." },
  500: { label: "Server error", title: "We hit a problem.", description: "CodeSkill couldn’t finish loading this page. Please try again in a little while.", note: "The server could not complete this request." },
  502: { label: "Bad gateway", title: "We’ll be back shortly.", description: "CodeSkill couldn’t reach a service it needs. Please try again in a little while.", note: "A service did not respond as expected." },
  503: { label: "Service unavailable", title: "We’ll be back shortly.", description: "CodeSkill is temporarily unavailable. Please try again in a little while.", note: "The service is temporarily unavailable." },
  504: { label: "Gateway timeout", title: "This is taking longer than usual.", description: "A CodeSkill service took too long to respond. Please try again in a little while.", note: "The upstream service timed out." },
};

export function ErrorFallback({
  error,
  reset,
  kind = "unexpected",
  statusCode,
  retryHref,
  onDismiss,
  homeHref = "/",
  homeLabel = "Back to Home",
  reloadOnRetry = false,
}: {
  error?: Error & { digest?: string };
  reset?: () => void;
  kind?: ErrorKind;
  statusCode?: number;
  retryHref?: string;
  onDismiss?: () => void;
  homeHref?: string;
  homeLabel?: string;
  reloadOnRetry?: boolean;
}) {
  const [retrying, setRetrying] = useState(false);
  const reportedStatus = (error as Error & { status?: number; statusCode?: number; response?: { status?: number } } | undefined);
  const candidateStatus = statusCode ?? reportedStatus?.status ?? reportedStatus?.statusCode ?? reportedStatus?.response?.status;
  const effectiveStatus = typeof candidateStatus === "number" && candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : undefined;
  const effectiveKind = kind === "unexpected" && error && /^(NetworkError|TimeoutError)$/.test(error.name)
    ? error.name === "TimeoutError" ? "timeout" : "network"
    : kind;
  const content = effectiveStatus
    ? statusCopy[effectiveStatus] || (effectiveStatus >= 500 ? copy.server : copy.unexpected)
    : copy[effectiveKind];
  const destination = effectiveStatus === 401 ? { href: "/login", label: "Sign in" }
    : effectiveStatus === 403 || effectiveStatus === 404 ? { href: "/", label: "Back to Home" }
    : null;

  const retry = () => {
    if (retrying) return;
    setRetrying(true);
    logger.info("User requested error recovery", { kind: effectiveKind, digest: error?.digest }, "ErrorBoundary");
    if (retryHref || reloadOnRetry) {
      if (retryHref) window.location.replace(retryHref);
      else window.location.reload();
      return;
    }
    reset?.();
    window.setTimeout(() => setRetrying(false), 900);
  };

  return (
    <section className={styles.screen} aria-labelledby="error-title" role="alert">
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand} aria-label="CodeSkill homepage">
            <span className={styles.brandMark} aria-hidden="true"><span>&lt;/&gt;</span></span>
            <span>CodeSkill</span>
          </Link>
          <span className={styles.headerStatus}><span className={styles.statusDot} /> {content.label}</span>
        </header>

        <main className={styles.main}>
          <div className={styles.content}>
            <p className={styles.kicker}><span className={styles.kickerLine} /> CODE<span className={styles.kickerSeparator}>/</span>PAUSE</p>
            <div className={styles.badge}>{effectiveStatus ? `${effectiveStatus} · ${content.label}` : content.label}</div>
            <h1 id="error-title" className={styles.title}>{content.title}</h1>
            <p className={styles.description}>{content.description}</p>

            <div className={styles.actions}>
              {destination && !onDismiss ? (
                <Link href={destination.href} className={styles.primaryAction}>{destination.label}<ArrowRight size={17} strokeWidth={1.8} aria-hidden="true" /></Link>
              ) : (
                <button type="button" onClick={onDismiss || retry} disabled={retrying} aria-label={onDismiss ? "Return to page" : "Try again"} className={styles.primaryAction}>
                  <RotateCw size={17} strokeWidth={1.8} className={retrying ? styles.spinning : undefined} aria-hidden="true" />
                  {onDismiss ? "Return to page" : retrying ? "Trying again…" : "Try again"}
                </button>
              )}
              {!onDismiss && !destination && <Link href={homeHref} className={styles.secondaryAction}>{homeLabel}<ArrowRight size={17} strokeWidth={1.8} aria-hidden="true" /></Link>}
            </div>

            <div className={styles.statusPanel} aria-label="Current status">
              <div className={styles.statusPanelTop}><span className={styles.terminalDots} aria-hidden="true"><i /><i /><i /></span><span>codeskill / status</span></div>
              <p><span className={styles.prompt}>&gt;</span> {content.note}</p>
              <p className={styles.panelMuted}><span className={styles.prompt}>&gt;</span> {onDismiss ? "Return to the page to retry there." : destination ? `Choose “${destination.label}” to continue.` : "Use “Try again” to reload when ready."}</p>
            </div>

            {process.env.NODE_ENV === "development" && error?.message && (
              <details className={styles.details}><summary>Developer details</summary><pre>{error.message}{error.digest ? `\nDigest: ${error.digest}` : ""}</pre></details>
            )}
          </div>
          <div className={styles.art} aria-hidden="true">
            <div className={styles.artRingOuter}><div className={styles.artRingMiddle}><div className={styles.artCore}><span>&lt;/&gt;</span></div></div></div>
            <span className={`${styles.artNode} ${styles.artNodeOne}`} /><span className={`${styles.artNode} ${styles.artNodeTwo}`} /><span className={`${styles.artNode} ${styles.artNodeThree}`} />
            <div className={styles.artCaption}>A brief pause in the flow.</div>
          </div>
        </main>

        <footer className={styles.footer}><span>© CodeSkill</span><span>Keep the ideas flowing.</span></footer>
      </div>
    </section>
  );
}
