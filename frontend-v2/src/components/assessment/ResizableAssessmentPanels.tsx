"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight } from "lucide-react";

/** A keyboard and pointer accessible splitter; stacks vertically on narrow screens. */
export function ResizableAssessmentPanels({ children, className = "", initialSize = 50 }: {
  children: [ReactNode, ReactNode]; className?: string; initialSize?: number;
}) {
  const [size, setSize] = useState(initialSize);
  const [vertical, setVertical] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setVertical(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const clamp = (value: number) => Math.min(75, Math.max(25, value));
  return <div ref={root} className={`flex flex-1 min-h-0 min-w-0 flex-col md:flex-row overflow-hidden ${className}`}>
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden" style={{ flex: `0 0 ${size}%` }}>{children[0]}</div>
    <div role="separator" aria-label="Resize statement and answer panels" aria-orientation={vertical ? "horizontal" : "vertical"}
      aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(size)} tabIndex={0}
      title="Drag to resize · Arrow keys to adjust · Double-click to reset"
      onDoubleClick={() => setSize(initialSize)}
      onKeyDown={event => {
        const decrease = vertical ? "ArrowUp" : "ArrowLeft";
        const increase = vertical ? "ArrowDown" : "ArrowRight";
        if ([decrease, increase, "Home", "End"].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          setSize(previous => event.key === "Home" ? 25 : event.key === "End" ? 75 : clamp(previous + (event.key === increase ? 2 : -2)));
        }
      }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
      }}
      onPointerMove={event => {
        if (!dragging.current || !root.current) return;
        const box = root.current.getBoundingClientRect();
        const length = vertical ? box.height : box.width;
        if (length > 0) setSize(clamp(((vertical ? event.clientY - box.top : event.clientX - box.left) / length) * 100));
      }}
      onPointerUp={event => { dragging.current = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { dragging.current = false; }} onLostPointerCapture={() => { dragging.current = false; }}
      className="group z-10 flex h-4 w-full shrink-0 touch-none items-center justify-center border-y border-border/60 bg-muted/20 cursor-row-resize hover:bg-primary/10 focus-visible:bg-primary/15 focus-visible:outline-2 focus-visible:outline-primary md:h-auto md:w-4 md:border-y-0 md:border-x md:cursor-col-resize">
      <ArrowLeftRight aria-hidden="true" className="size-3 rotate-90 text-muted-foreground group-hover:text-primary md:rotate-0" />
    </div>
    <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">{children[1]}</div>
  </div>;
}
