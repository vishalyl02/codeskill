"use client";

import { ReactNode } from "react";
import { MotionConfig, LazyMotion, domAnimation } from "motion/react";

export interface MotionProviderProps {
  children: ReactNode;
  /**
   * Accessibility preference for animations:
   * - "user": automatically respects OS `prefers-reduced-motion`
   * - "always": forces reduced motion
   * - "never": forces all animations
   * Defaults to "user".
   */
  reducedMotion?: "user" | "always" | "never";
}

/**
 * Global Motion optimization provider (motion.dev / Motion v12):
 * - MotionConfig with reducedMotion="user" delivers accessible animations out of the box.
 * - LazyMotion with domAnimation dramatically reduces the initial bundle size
 *   by excluding unneeded layout projection and drag features until requested.
 * - strict={false} allows smooth interop between `motion.*` and optimized `m.*` components.
 */
export function MotionProvider({
  children,
  reducedMotion = "user",
}: MotionProviderProps) {
  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <LazyMotion features={domAnimation} strict={false}>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
