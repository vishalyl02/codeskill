"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

/** Content magnification that also works when fullscreen suppresses browser zoom. */
export function AssessmentReadingZoom({ children }: { children: (scale: number) => ReactNode }) {
  const [scale, setScale] = useState(1);
  const root = useRef<HTMLDivElement>(null);
  const current = useRef(1);
  const apply = (next: number) => {
    const value = Math.min(2, Math.max(0.8, next));
    current.current = value; setScale(value);
  };
  useEffect(() => {
    const target = root.current; if (!target) return;
    let startScale = 1, distance = 0;
    const wheel = (event: WheelEvent) => {
      // Chrome/Edge/Firefox trackpad pinch is delivered as a Ctrl+wheel event.
      // Ordinary wheel scrolling is left untouched.
      if (!event.ctrlKey) return;
      event.preventDefault();
      apply(current.current * Math.exp(-event.deltaY * 0.008));
    };
    const touchDistance = (event: TouchEvent) => Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      startScale = current.current; distance = touchDistance(event);
    };
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || distance <= 0) return;
      event.preventDefault(); apply(startScale * touchDistance(event) / distance);
    };
    const touchEnd = () => { distance = 0; };
    const gestureStart = (event: Event) => { event.preventDefault(); startScale = current.current; };
    const gestureChange = (event: Event) => {
      const value = (event as Event & { scale?: number }).scale;
      if (typeof value !== "number") return;
      event.preventDefault(); apply(startScale * value);
    };
    target.addEventListener("wheel", wheel, { passive: false });
    target.addEventListener("touchstart", touchStart, { passive: true });
    target.addEventListener("touchmove", touchMove, { passive: false });
    target.addEventListener("touchend", touchEnd);
    target.addEventListener("touchcancel", touchEnd);
    // Safari emits gesture events rather than Ctrl+wheel.
    target.addEventListener("gesturestart", gestureStart, { passive: false });
    target.addEventListener("gesturechange", gestureChange, { passive: false });
    return () => {
      target.removeEventListener("wheel", wheel); target.removeEventListener("touchstart", touchStart);
      target.removeEventListener("touchmove", touchMove); target.removeEventListener("touchend", touchEnd);
      target.removeEventListener("touchcancel", touchEnd);
      target.removeEventListener("gesturestart", gestureStart); target.removeEventListener("gesturechange", gestureChange);
    };
  }, []);
  return <div ref={root} className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden [touch-action:pan-x_pan-y]">
    <div className="flex shrink-0 items-center justify-end gap-2 px-3 pt-2 text-xs text-muted-foreground">
      <span className="mr-1 hidden sm:inline">Pinch over the question to zoom</span>
      <div role="group" aria-label="Question reading zoom" className="flex items-center rounded-lg border border-border bg-card">
        <button type="button" aria-label="Zoom out question" disabled={scale <= 0.8} onClick={() => apply(scale - 0.1)} className="rounded-l-lg p-1.5 hover:bg-muted disabled:opacity-30"><Minus className="size-3.5" /></button>
        <button type="button" aria-label="Reset question zoom" title="Reset to 100%" onClick={() => apply(1)} className="min-w-14 px-2 py-1.5 font-mono tabular-nums hover:bg-muted">{Math.round(scale * 100)}%</button>
        <button type="button" aria-label="Zoom in question" disabled={scale >= 2} onClick={() => apply(scale + 0.1)} className="rounded-r-lg p-1.5 hover:bg-muted disabled:opacity-30"><Plus className="size-3.5" /></button>
      </div>
    </div>
    {children(scale)}
  </div>;
}
