"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

export interface ForensicWatermarkOverlayProps {
  enabled?: boolean;
  isSubmitted?: boolean;
  candidateId?: string;
  candidateIdentifier?: string; // Roll number, registration ID, or email
  assessmentId?: string;
  attestationSessionId?: string;
  onTamper?: (reason: string, details?: Record<string, any>) => void;
}

function maskIdentifier(id?: string): string {
  if (!id) return "STUDENT-***";
  if (id.includes("@")) {
    const [local, domain] = id.split("@");
    if (local.length <= 2) return `${local[0] || "*"}***@${domain}`;
    return `${local[0]}${"*".repeat(Math.min(local.length - 2, 4))}${local[local.length - 1]}@${domain}`;
  }
  if (id.length <= 4) return `${id.slice(0, 1)}***`;
  return `${id.slice(0, 2)}${"*".repeat(Math.min(id.length - 4, 4))}${id.slice(-2)}`;
}

function formatUtcTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mm = pad(date.getUTCMinutes());
  return `${y}-${m}-${d} ${hh}:${mm} UTC`;
}

export default function ForensicWatermarkOverlay({
  enabled = false,
  isSubmitted = false,
  candidateId = "ANON-CANDIDATE",
  candidateIdentifier = "",
  assessmentId = "EXAM",
  attestationSessionId,
  onTamper,
}: ForensicWatermarkOverlayProps) {
  // CRITICAL REQUIREMENT: If disabled or already submitted, render null and attach zero observers.
  if (!enabled || isSubmitted) {
    return null;
  }

  return (
    <ActiveWatermarkCanvas
      candidateId={candidateId}
      candidateIdentifier={candidateIdentifier}
      assessmentId={assessmentId}
      attestationSessionId={attestationSessionId}
      onTamper={onTamper}
    />
  );
}

function ActiveWatermarkCanvas({
  candidateId,
  candidateIdentifier,
  assessmentId,
  attestationSessionId,
  onTamper,
}: Omit<ForensicWatermarkOverlayProps, "enabled" | "isSubmitted">) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [remountKey, setRemountKey] = useState(0);
  const [utcTimestamp, setUtcTimestamp] = useState(() => formatUtcTimestamp(new Date()));
  const lastTamperReportRef = useRef<number>(0);

  // Update UTC timestamp every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setUtcTimestamp(formatUtcTimestamp(new Date()));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const reportTamper = useCallback(
    (reason: string, details?: Record<string, any>) => {
      const now = Date.now();
      if (now - lastTamperReportRef.current > 5000) {
        lastTamperReportRef.current = now;
        onTamper?.(reason, details);
      }
      // Force immediate re-mount if tampered
      setRemountKey((prev) => prev + 1);
    },
    [onTamper]
  );

  // Render high-DPI canvas pattern
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const width = typeof window !== "undefined" ? window.innerWidth : 1920;
    const height = typeof window !== "undefined" ? window.innerHeight : 1080;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const maskedId = maskIdentifier(candidateIdentifier || candidateId);
    const shortSession = attestationSessionId ? attestationSessionId.slice(0, 10) : "HW-VERIFIED";

    const line1 = `CANDIDATE: ${candidateId} [${maskedId}]`;
    const line2 = `EXAM: ${assessmentId} • SES: ${shortSession}`;
    const line3 = `${utcTimestamp} • CODESKILL SECURE`;

    // Canvas diagonal grid parameters
    const tileWidth = 340;
    const tileHeight = 180;
    const angleRad = -0.40; // ~ -23 degrees

    ctx.fillStyle = "rgba(100, 116, 139, 1)"; // Base slate color, opacity controlled via overlay container / style
    ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.textBaseline = "middle";

    for (let y = -tileHeight; y < height + tileHeight * 2; y += tileHeight) {
      for (let x = -tileWidth; x < width + tileWidth * 2; x += tileWidth) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angleRad);
        ctx.fillText(line1, 0, 0);
        ctx.fillText(line2, 0, 16);
        ctx.fillText(line3, 0, 32);
        ctx.restore();
      }
    }

    ctx.restore();
  }, [candidateId, candidateIdentifier, assessmentId, attestationSessionId, utcTimestamp]);

  // Window resize listener
  useEffect(() => {
    renderCanvas();
    const handleResize = () => renderCanvas();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [renderCanvas]);

  // Anti-tamper MutationObserver & Computed Style Guard
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const verifyIntegrity = () => {
      if (!canvas.isConnected || !container.isConnected) {
        reportTamper("WATERMARK_TAMPER_ATTEMPT", { detail: "Watermark node was detached from DOM" });
        return;
      }

      const style = window.getComputedStyle(container);
      const canvasStyle = window.getComputedStyle(canvas);

      const isHidden =
        style.display === "none" ||
        style.visibility === "hidden" ||
        parseFloat(style.opacity || "1") < 0.02 ||
        canvasStyle.display === "none" ||
        canvasStyle.visibility === "hidden" ||
        parseFloat(canvasStyle.opacity || "1") < 0.02;

      const zIndex = parseInt(style.zIndex, 10);
      const isDeprioritized = !isNaN(zIndex) && zIndex < 1000;

      if (isHidden || isDeprioritized) {
        reportTamper("WATERMARK_TAMPER_ATTEMPT", {
          detail: "Watermark display or opacity modified",
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          zIndex: style.zIndex,
        });
      }
    };

    // Periodic style sanity check every 2 seconds
    const interval = setInterval(verifyIntegrity, 2000);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          verifyIntegrity();
        } else if (mutation.type === "childList") {
          for (const removed of Array.from(mutation.removedNodes)) {
            if (removed === canvas || removed === container || (removed as HTMLElement).contains?.(canvas)) {
              reportTamper("WATERMARK_TAMPER_ATTEMPT", { detail: "Watermark element removed by script" });
            }
          }
        }
      }
    });

    observer.observe(container, {
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
    });

    if (container.parentElement) {
      observer.observe(container.parentElement, {
        childList: true,
      });
    }

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, [remountKey, reportTamper]);

  return (
    <div
      key={remountKey}
      ref={containerRef}
      id="codeskill-forensic-watermark"
      aria-hidden="true"
      className="pointer-events-none select-none fixed inset-0 z-[9998] overflow-hidden"
      style={{
        opacity: 0.035, // 3.5% opacity as specified in Phase 6 spec
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ pointerEvents: "none" }}
      />
    </div>
  );
}
