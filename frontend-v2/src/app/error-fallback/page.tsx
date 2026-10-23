import type { Metadata } from "next";
import { ErrorFallback } from "@/components/errors/ErrorFallback";

export const metadata: Metadata = {
  title: "Temporarily unavailable · CodeSkill",
  robots: { index: false, follow: false },
};

export default async function ErrorFallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; failure?: string; returnTo?: string }>;
}) {
  const { code, failure, returnTo } = await searchParams;
  const parsedCode = Number(code);
  const statusCode = /^\d{3}$/.test(code || "") && parsedCode >= 400 && parsedCode <= 599 ? parsedCode : undefined;
  const kind = failure === "network" ? "network" : failure === "timeout" ? "timeout" : failure === "unexpected" ? "unexpected" : "server";
  const retryUrl = returnTo ? new URL(returnTo, "http://codeskill.local") : undefined;
  const retryHref = returnTo?.startsWith("/") && retryUrl?.origin === "http://codeskill.local" && !retryUrl.pathname.startsWith("/error-fallback")
    ? `${retryUrl.pathname}${retryUrl.search}${retryUrl.hash}`
    : undefined;

  return <ErrorFallback kind={kind} statusCode={statusCode} retryHref={retryHref} reloadOnRetry />;
}
