import { Variants } from "motion/react";

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", damping: 25, stiffness: 200 }
  },
};

export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -30 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", damping: 25, stiffness: 200 }
  },
};

export const fadeLeft: Variants = {
  hidden: { opacity: 0, x: 30 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", damping: 25, stiffness: 200 }
  },
};

export const fadeRight: Variants = {
  hidden: { opacity: 0, x: -30 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", damping: 25, stiffness: 200 }
  },
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", damping: 20, stiffness: 300 }
  },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", damping: 15, stiffness: 400 }
  },
};

export const slideUp: Variants = {
  hidden: { y: "100%" },
  show: {
    y: 0,
    transition: { type: "spring", damping: 25, stiffness: 200 }
  },
};

export const slideDown: Variants = {
  hidden: { y: "-100%" },
  show: {
    y: 0,
    transition: { type: "spring", damping: 25, stiffness: 200 }
  },
};

export const pageTransition: Variants = {
  hidden: { opacity: 0, scale: 0.98, filter: "blur(4px)" },
  show: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.3, ease: "easeOut" }
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    filter: "blur(4px)",
    transition: { duration: 0.2, ease: "easeIn" }
  }
};

export const hoverCard = {
  whileHover: {
    y: -5,
    scale: 1.01,
    transition: { type: "spring", stiffness: 400, damping: 25 }
  },
};

export const buttonInteract: any = {
  whileHover: { scale: 1.03, transition: { type: "spring", stiffness: 400, damping: 25 } },
  whileTap: { scale: 0.97, transition: { type: "spring", stiffness: 400, damping: 25 } },
};
