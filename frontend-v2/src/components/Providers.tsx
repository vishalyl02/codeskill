"use client";

import { AuthProvider } from "@/context/AuthContext";
import { ReactNode, useEffect } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { googleClientId, googleOAuthEnabled } from "@/config/auth";
import { ThemeProvider } from "@/context/ThemeContext";
import { Toaster } from "react-hot-toast";
import { logger } from "@/lib/logger";
import { MotionProvider } from "@/components/providers/MotionProvider";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // MediaPipe's WASM runtime writes this informational initialization message
    // to console.error in some Chromium builds. Suppress only that exact line;
    // it is not a face-detection failure and Next's dev overlay mislabels it.
    const originalConsoleError = console.error;
    const filteredConsoleError = (...args: unknown[]) => {
      if (args.some((arg) => (typeof arg === "string" && arg.includes("Created TensorFlow Lite XNNPACK delegate for CPU.")) || (arg instanceof Error && arg.message.includes("Created TensorFlow Lite XNNPACK delegate for CPU.")))) return;
      originalConsoleError.apply(console, args);
    };
    console.error = filteredConsoleError;

    const handleError = (event: ErrorEvent) => {
      // Chromium can dispatch this benign layout diagnostic during resize-heavy
      // exam pages. It does not represent an application exception.
      if (event.message?.includes("ResizeObserver loop")) {
        event.preventDefault();
        return;
      }
      if (event.message?.includes("Created TensorFlow Lite XNNPACK delegate for CPU.")) {
        event.preventDefault();
        return;
      }
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
      if (console.error === filteredConsoleError) console.error = originalConsoleError;
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
      <MotionProvider>
        {googleOAuthEnabled ? (
          <GoogleOAuthProvider clientId={googleClientId}>
            {content}
          </GoogleOAuthProvider>
        ) : (
          content
        )}
      </MotionProvider>
    </ThemeProvider>
  );
}
