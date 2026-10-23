/**
 * Optimized Motion utilities & re-exports (motion.dev / Motion v12)
 *
 * Centralizes Motion primitives to promote bundle-size optimization (via `m` + `LazyMotion`)
 * and consistent accessibility (via `MotionConfig` + `reducedMotion="user"`).
 */

export {
  m,
  motion,
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domAnimation,
  domMax,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useInView,
  useMotionValue,
  useMotionValueEvent,
} from "motion/react";

export type {
  Variants,
  Transition,
  TargetAndTransition,
  HTMLMotionProps,
  MotionValue,
} from "motion/react";

/**
 * High-performance spring & easing presets (GPU accelerated: transform + opacity only)
 */
export const MOTION_TRANSITIONS = {
  snappy: { type: "spring", stiffness: 400, damping: 30 },
  bouncy: { type: "spring", stiffness: 350, damping: 20 },
  smooth: { type: "spring", stiffness: 200, damping: 25 },
  subtle: { duration: 0.2, ease: "easeOut" },
} as const;

/**
 * Shared accessible animation variants
 */
export const motionFadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: MOTION_TRANSITIONS.subtle },
};

export const motionScaleUp = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: MOTION_TRANSITIONS.smooth },
};
