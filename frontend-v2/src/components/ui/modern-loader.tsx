"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import TypeAnimation from "@/components/ui/modern-loader-utils/typeanimation";

export interface ModernLoaderProps {
  words?: string[];
  className?: string;
}

const COLORS = [
  "bg-[#3B82F6]",
  "bg-[#10B981]",
  "bg-[#F59E0B]",
  "bg-[#EF4444]",
  "bg-[#9CA3AF]",
];

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateDeterministicLines(count = 25, seedOffset = 0) {
  return Array.from({ length: count }, (_, idx) => {
    const lineSeed = idx + seedOffset + 1;
    const segCount = Math.floor(seededRandom(lineSeed * 13) * 4) + 1;
    return {
      id: `line-${seedOffset + idx}`,
      segments: Array.from({ length: segCount }, (__, segIdx) => {
        const segSeed = lineSeed * 31 + segIdx * 17;
        const colorIdx = Math.floor(seededRandom(segSeed * 7) * COLORS.length);
        const width = Math.floor(seededRandom(segSeed * 11) * 120) + 80;
        const isCircle = seededRandom(segSeed * 19) > 0.92;
        const indent = seededRandom(segSeed * 23) > 0.75 ? 1 : 0;
        return {
          width: `${width}px`,
          color: COLORS[colorIdx],
          isCircle,
          indent,
        };
      }),
    };
  });
}

export const ModernLoader: React.FC<ModernLoaderProps> = ({
  words = [
    "Setting things up...",
    "Initializing modules...",
    "Compiling test cases...",
    "Almost ready...",
  ],
  className,
}) => {
  const [currentLine, setCurrentLine] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const BUFFER = 20;
  const MAX_LINES = 100;

  const [lines, setLines] = useState(() => generateDeterministicLines(30, 0));

  const getVisibleRange = () => {
    const start = Math.max(0, currentLine - BUFFER);
    const end = Math.min(lines.length, currentLine + BUFFER);
    return { start, end };
  };

  const { start: visibleStart, end: visibleEnd } = getVisibleRange();

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [currentLine]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentLine((prev) => {
        const nextLine = prev + 1;
        if (nextLine >= lines.length - 10)
          setLines((old) => [...old, ...generateDeterministicLines(30, old.length)]);
        return nextLine;
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [currentLine, lines.length]);

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((prev) => !prev), 530);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const cleanup = () => {
      if (lines.length > MAX_LINES && currentLine > BUFFER * 2) {
        setLines((oldLines) => {
          const safeIndex = currentLine - BUFFER * 2;
          if (safeIndex > 0) {
            setCurrentLine((prev) => prev - safeIndex);
            return oldLines.slice(safeIndex);
          }
          return oldLines;
        });
      }
    };
    const interval = setInterval(cleanup, 5000);
    return () => clearInterval(interval);
  }, [currentLine, lines.length]);

  const visibleLines = lines.slice(visibleStart, visibleEnd);

  return (
    <div className={cn("w-full max-w-2xl mx-auto p-2 sm:p-4", className)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="relative bg-white dark:bg-card h-[380px] sm:h-[420px] rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.07)] dark:shadow-2xl overflow-hidden border border-black/[0.09] dark:border-border"
      >
        <div className="px-4 py-3 flex items-center z-10 relative border-b border-black/[0.08] dark:border-border/50 bg-[#FAFAFA] dark:bg-muted/20">
          <div className="flex items-center gap-1.5">
            <motion.div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <motion.div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <motion.div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex-1 text-center"
          >
            <TypeAnimation
              words={words}
              typingSpeed="slow"
              deletingSpeed="slow"
              pauseDuration={2000}
              className="text-muted-foreground dark:text-muted-foreground text-xs font-mono font-medium"
            />
          </motion.div>
        </div>

        <div
          ref={containerRef}
          className="relative px-5 py-4 font-mono text-sm overflow-hidden h-[calc(100%-48px)] bg-white dark:bg-transparent"
        >
          <div className="space-y-2 relative z-10">
            <AnimatePresence mode="sync">
              {visibleLines.map((line, idx) => {
                const actualIndex = visibleStart + idx;
                if (actualIndex >= currentLine) return null;
                const extraMargin = (idx + 1) % 4 === 0 ? "mt-2" : "";
                const paddingClass = line.segments[0]?.indent ? "pl-4" : "";
                return (
                  <React.Fragment key={line.id}>
                    <motion.div
                      className={cn(
                        "flex items-center gap-2 h-5",
                        extraMargin,
                        paddingClass,
                      )}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      {line.segments.map((seg, i) =>
                        seg.isCircle ? (
                          <motion.div
                            key={i}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.2, delay: 0.05 }}
                            className={cn(
                              "w-4 h-4 rounded-full opacity-85 dark:opacity-60",
                              seg.color,
                            )}
                          />
                        ) : (
                          <motion.div
                            key={i}
                            initial={{ width: 0 }}
                            animate={{ width: seg.width }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className={cn(
                              "h-3 rounded-sm opacity-85 dark:opacity-60",
                              seg.color,
                            )}
                            style={{ width: seg.width }}
                          />
                        ),
                      )}
                    </motion.div>

                    {(actualIndex + 1) % 6 === 0 && (
                      <motion.div
                        className="w-full h-1 bg-neutral-200/50 dark:bg-background rounded-sm opacity-30"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </AnimatePresence>

            {currentLine < lines.length && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center h-5"
                style={{
                  paddingLeft: `${
                    lines[currentLine]?.segments[0]?.indent ? 16 : 0
                  }px`,
                }}
              >
                <motion.div
                  animate={{ opacity: cursorVisible ? 1 : 0 }}
                  transition={{ duration: 0.1 }}
                  className="w-0.5 h-3.5 bg-foreground dark:bg-primary"
                />
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ModernLoader;
