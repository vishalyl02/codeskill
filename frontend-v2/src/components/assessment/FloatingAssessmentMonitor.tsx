"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical, Maximize2, RotateCcw } from "lucide-react";

type Frame = { x: number; y: number; width: number; height: number };
export function FloatingAssessmentMonitor({ children, minimized = false }: { children: ReactNode; minimized?: boolean }) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const element = useRef<HTMLDivElement>(null);
  const interaction = useRef<{ mode: "move" | "resize"; x: number; y: number; frame: Frame } | null>(null);
  const constrain = (value: Frame): Frame => {
    const width = Math.max(180, Math.min(value.width, 560, window.innerWidth - 16));
    const height = Math.max(140, Math.min(value.height, window.innerHeight - 16));
    return { width, height, x: Math.max(0, Math.min(value.x, window.innerWidth - 96)), y: Math.max(0, Math.min(value.y, window.innerHeight - 36)) };
  };
  const reset = () => setFrame(constrain({ x: 12, y: window.innerHeight - 432, width: 280, height: 420 }));
  useEffect(() => {
    reset();
    const resize = () => setFrame(previous => previous ? constrain(previous) : previous);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("resize", resize); };
  }, []);
  const begin = (event: React.PointerEvent<HTMLElement>, mode: "move" | "resize") => {
    if (event.button !== 0 || !element.current) return;
    const box = element.current.getBoundingClientRect();
    interaction.current = { mode, x: event.clientX, y: event.clientY, frame: { x: box.left, y: box.top, width: box.width, height: frame?.height ?? box.height } };
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  };
  const move = (event: React.PointerEvent<HTMLElement>) => {
    const active = interaction.current; if (!active) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    setFrame(constrain(active.mode === "move"
      ? { ...active.frame, x: active.frame.x + dx, y: active.frame.y + dy }
      : { ...active.frame, width: active.frame.width + dx, height: active.frame.height + dy }));
  };
  const end = () => { interaction.current = null; };
  return <div ref={element} aria-label="Movable camera monitor" className="fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl"
    style={frame ? { left: frame.x, top: frame.y, width: frame.width, height: minimized ? Math.min(frame.height, 188) : frame.height } : { left: 12, bottom: 12, width: 280, height: minimized ? 188 : 420 }}>
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-2 py-1.5">
      <button type="button" aria-label="Move camera monitor" title="Drag anywhere · Arrow keys to move · Double-click or Home to reset" onDoubleClick={reset}
        onPointerDown={event => begin(event, "move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
        onKeyDown={event => {
          if (event.key === "Home") { event.preventDefault(); event.stopPropagation(); reset(); return; }
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          setFrame(previous => previous ? constrain({ ...previous, x: previous.x + (event.key === "ArrowRight" ? 12 : event.key === "ArrowLeft" ? -12 : 0), y: previous.y + (event.key === "ArrowDown" ? 12 : event.key === "ArrowUp" ? -12 : 0) }) : previous);
        }} className="flex flex-1 touch-none cursor-move items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"><GripVertical className="size-3.5" />Move monitor</button>
      <button type="button" aria-label="Reset camera position and size" title="Reset camera position and size" onClick={reset} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><RotateCcw className="size-3.5" /></button>
    </div>
    <div className="assessment-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain p-2">{children}</div>
    <button type="button" aria-label="Resize camera monitor" title="Drag to resize · Arrow keys to resize"
      onPointerDown={event => begin(event, "resize")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
      onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        setFrame(previous => previous ? constrain({ ...previous, width: previous.width + (event.key === "ArrowRight" ? 12 : event.key === "ArrowLeft" ? -12 : 0), height: previous.height + (event.key === "ArrowDown" ? 12 : event.key === "ArrowUp" ? -12 : 0) }) : previous);
      }} className="absolute bottom-0 right-0 flex size-6 touch-none cursor-nwse-resize items-center justify-center rounded-tl-lg bg-muted text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"><Maximize2 className="size-3" /></button>
  </div>;
}
