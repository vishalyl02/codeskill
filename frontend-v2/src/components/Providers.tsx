"use client";

import { AuthProvider } from "@/context/AuthContext";
import { ReactNode, useEffect } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { googleClientId, googleOAuthEnabled } from "@/config/auth";
import { ThemeProvider } from "@/context/ThemeContext";
import { Toaster } from "react-hot-toast";
import { logger } from "@/lib/logger";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleError = (event: ErrorEvent) => {
      logger.error(
        `Uncaught client error: ${event.message}`,
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
        },
        "GlobalErrorListener"
      );
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logger.error(
        `Unhandled promise rejection: ${event.reason?.message || String(event.reason)}`,
        {
          reason:
            event.reason instanceof Error
              ? event.reason.message
              : String(event.reason),
          stack: event.reason instanceof Error ? event.reason.stack : undefined,
        },
        "GlobalPromiseRejectionListener"
      );
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  const content = (
    <AuthProvider>
      {children}
      <Toaster position="top-center" />
    </AuthProvider>
  );

  return (
    <ThemeProvider defaultTheme="light">
      {googleOAuthEnabled ? (
        <GoogleOAuthProvider clientId={googleClientId}>
          {content}
        </GoogleOAuthProvider>
      ) : (
        content
      )}
    </ThemeProvider>
  );
}
