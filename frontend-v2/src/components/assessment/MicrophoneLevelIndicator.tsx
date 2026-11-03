"use client";

import React, { useEffect, useRef, useState } from "react";

interface MicrophoneLevelIndicatorProps {
  subscribeAudioLevel?: (callback: (level: number) => void) => () => void;
  fallbackLevel?: number;
}

/**
 * Isolated leaf component for rendering proctored microphone decibel feedback.
 * Updates DOM styles directly via refs to avoid triggering top-level page re-renders.
 */
export const MicrophoneLevelIndicator = React.memo(function MicrophoneLevelIndicator({
  subscribeAudioLevel,
  fallbackLevel = 0,
}: MicrophoneLevelIndicatorProps) {
  const [level, setLevel] = useState(fallbackLevel);
  const barRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!subscribeAudioLevel) {
      setLevel(fallbackLevel);
      return;
    }

    return subscribeAudioLevel((newLevel) => {
      if (barRef.current) {
        barRef.current.style.width = `${newLevel}%`;
        if (newLevel > 40) {
          barRef.current.className = "h-full transition-all duration-100 bg-rose-500";
        } else {
          barRef.current.className = "h-full transition-all duration-100 bg-emerald-500";
        }
      }
      if (textRef.current) {
        textRef.current.textContent = newLevel > 40 ? "Loud" : "Quiet";
      }
    });
  }, [subscribeAudioLevel, fallbackLevel]);

  return (
    <>
      <div className="flex-1 max-w-[120px] h-2 bg-muted rounded-full overflow-hidden border border-border">
        <div
          ref={barRef}
          className={`h-full transition-all duration-100 ${
            level > 40 ? "bg-rose-500" : "bg-emerald-500"
          }`}
          style={{ width: `${level}%` }}
        />
      </div>
      <span ref={textRef} className="text-[10px] font-mono text-muted-foreground">
        {level > 40 ? "Loud" : "Quiet"}
      </span>
    </>
  );
});
