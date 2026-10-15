// Built using Hyperiux Vault: https://vault.hyperiux.com

"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import gsap from "gsap";

export interface InteractiveListItem {
  client: string;
  platform?: string;
  services: string;
  img: string;
}

export interface InteractiveListPreviewProps {
  items?: InteractiveListItem[];
  /** Highlight bar + row text transition smoothing (seconds). */
  smoothness?: number;
  /** Background color of the list surface. */
  bgColor?: string;
  className?: string;
  /** Callback when hovered row changes to drive background preview */
  onHoverChange?: (item: InteractiveListItem | null, index: number | null) => void;
}

const DEFAULT_SMOOTHNESS = 0.25;
const DEFAULT_ITEMS: InteractiveListItem[] = [
  {
    client: "ALGORITHMIC CORE",
    platform: "DSA & CODING",
    services: "Data Structures, Dynamic Programming, Graphs & Trees",
    img: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?q=80&w=1000&auto=format&fit=crop",
  },
  {
    client: "AI PROCTORING",
    platform: "SECURE ENGINE",
    services: "Multi-Camera Tracking, Tab Switch Detection, Audio AI",
    img: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1000&auto=format&fit=crop",
  },
  {
    client: "SANDBOX COMPILER",
    platform: "ISOLATED RUNTIME",
    services: "Dockerized Execution, Resource Caps, 40+ Languages",
    img: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop",
  },
  {
    client: "ANALYTICS MATRIX",
    platform: "CU DEPT SKILL LAB",
    services: "Skill Gap Analysis, Performance Benchmarks, Radar Charts",
    img: "https://images.unsplash.com/photo-1558655146-d09347e92766?q=80&w=1000&auto=format&fit=crop",
  },
  {
    client: "CAMPUS ARENA",
    platform: "LIVE CONTESTS",
    services: "Realtime ELO Rating, Global Leaderboard, Head-to-Head",
    img: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?q=80&w=1000&auto=format&fit=crop",
  },
  {
    client: "VERIFIED CERTIFICATE",
    platform: "INSTITUTIONAL",
    services: "Cryptographic Badges, University Endorsed, Placement Ready",
    img: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=1000&auto=format&fit=crop",
  },
];

export default function InteractiveListPreview({
  items = DEFAULT_ITEMS,
  smoothness = DEFAULT_SMOOTHNESS,
  bgColor = "transparent",
  className = "",
  onHoverChange,
}: InteractiveListPreviewProps) {
  const tableRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const activeIndexRef = useRef<number | null>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarsePointer(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!highlightRef.current) return;
    gsap.set(highlightRef.current, {
      opacity: 0,
      y: 0,
      height: 0,
    });
  }, []);

  const moveHighlightToRow = (rowElement: HTMLTableRowElement | null) => {
    const tableElement = tableRef.current;
    const highlightElement = highlightRef.current;

    if (!tableElement || !highlightElement || !rowElement) return;

    const tableBounds = tableElement.getBoundingClientRect();
    const rowBounds = rowElement.getBoundingClientRect();

    gsap.to(highlightElement, {
      y: rowBounds.top - tableBounds.top,
      height: rowBounds.height,
      opacity: 1,
      duration: smoothness,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  const onRowEnter = (rowElement: HTMLTableRowElement, index: number) => {
    rowRefs.current[index] = rowElement;
    activeIndexRef.current = index;
    moveHighlightToRow(rowElement);

    if (onHoverChange && items[index]) {
      onHoverChange(items[index], index);
    }
  };

  const onRowLeave = () => {
    // leave handled at table level or row change
  };

  const onTableLeave = () => {
    activeIndexRef.current = null;

    if (highlightRef.current) {
      gsap.to(highlightRef.current, {
        opacity: 0,
        duration: smoothness,
        ease: "power2.out",
        overwrite: "auto",
      });
    }

    if (onHoverChange) {
      onHoverChange(null, null);
    }
  };

  return (
    <>
      {!isCoarsePointer && (
        <div
          style={{ backgroundColor: bgColor }}
          className={`relative w-full overflow-hidden font-sans text-slate-800 dark:text-slate-100 ${className}`}
        >
          {/* Subtle Row Hover Highlight Bar */}
          <div
            ref={highlightRef}
            className="pointer-events-none absolute inset-x-0 top-0 z-10 border-y border-emerald-200/70 bg-emerald-100/55 transition-opacity dark:border-emerald-700/50 dark:bg-emerald-900/25"
          />

          <div
            ref={tableRef}
            className="relative w-full"
            onMouseLeave={onTableLeave}
          >
            <table className="relative z-20 w-full table-fixed border-collapse">
              <colgroup>
                <col style={{ width: "25%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "53%" }} />
              </colgroup>

              <tbody>
                {items.map((item, index) => (
                  <tr
                    key={`${item.client}-${index}`}
                    className="cursor-pointer border-b border-slate-200/70 transition-colors hover:bg-emerald-50/70 dark:border-slate-700/70 dark:hover:bg-emerald-950/30"
                    onMouseEnter={(event) =>
                      onRowEnter(event.currentTarget, index)
                    }
                    onMouseLeave={onRowLeave}
                  >
                    <td className="whitespace-nowrap px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-900 dark:text-slate-100">
                      {item.client}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-xs uppercase tracking-widest text-emerald-800 dark:text-emerald-300">
                      {item.platform}
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-xs uppercase tracking-widest text-slate-600 dark:text-slate-300">
                      {item.services}
                    </td>
                  </tr>
                ))}

                <tr>
                  <td colSpan={3} className="p-0" />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isCoarsePointer && (
        <div
          style={{ backgroundColor: bgColor }}
          className={`w-full font-sans text-slate-800 dark:text-slate-100 ${className}`}
        >
          {items.map((item, index) => (
            <div
              key={`${item.client}-${index}`}
              className="flex flex-col gap-2 border-b border-slate-200/70 p-4 dark:border-slate-700/70"
            >
              <p className="text-sm font-bold uppercase tracking-widest text-slate-900 dark:text-slate-100">
                {item.client}
              </p>

              {item.platform && (
                <p className="text-xs uppercase tracking-widest text-emerald-800 dark:text-emerald-300">
                  {item.platform}
                </p>
              )}

              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {item.services}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
