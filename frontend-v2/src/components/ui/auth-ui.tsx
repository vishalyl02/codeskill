"use client";

import * as React from "react";
import { useState, useId, useEffect, useRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { Eye, EyeOff, Sparkles, Quote as QuoteIcon } from "lucide-react";
import gsap from "gsap";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface TypewriterProps {
  text: string | string[];
  speed?: number;
  cursor?: string;
  loop?: boolean;
  deleteSpeed?: number;
  delay?: number;
  className?: string;
}

export function Typewriter({
  text,
  speed = 100,
  cursor = "|",
  loop = false,
  deleteSpeed = 50,
  delay = 1500,
  className,
}: TypewriterProps) {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [textArrayIndex, setTextArrayIndex] = useState(0);

  const textArray = Array.isArray(text) ? text : [text];
  const currentText = textArray[textArrayIndex] || "";

  useEffect(() => {
    if (!currentText) return;

    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          if (currentIndex < currentText.length) {
            setDisplayText((prev) => prev + currentText[currentIndex]);
            setCurrentIndex((prev) => prev + 1);
          } else if (loop) {
            setTimeout(() => setIsDeleting(true), delay);
          }
        } else {
          if (displayText.length > 0) {
            setDisplayText((prev) => prev.slice(0, -1));
          } else {
            setIsDeleting(false);
            setCurrentIndex(0);
            setTextArrayIndex((prev) => (prev + 1) % textArray.length);
          }
        }
      },
      isDeleting ? deleteSpeed : speed,
    );

    return () => clearTimeout(timeout);
  }, [
    currentIndex,
    isDeleting,
    currentText,
    loop,
    speed,
    deleteSpeed,
    delay,
    displayText,
    text,
  ]);

  return (
    <span className={className}>
      {displayText}
      <span className="animate-pulse">{cursor}</span>
    </span>
  );
}

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input dark:border-input/50 bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary-foreground/60 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-md px-6",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input dark:border-input/50 bg-background px-3 py-3 text-sm text-foreground shadow-sm shadow-black/5 transition-shadow placeholder:text-muted-foreground/70 focus-visible:bg-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
}
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, ...props }, ref) => {
    const id = useId();
    const [showPassword, setShowPassword] = useState(false);
    const togglePasswordVisibility = () => setShowPassword((prev) => !prev);
    return (
      <div className="grid w-full items-center gap-2">
        {label && <Label htmlFor={id}>{label}</Label>}
        <div className="relative">
          <Input id={id} type={showPassword ? "text" : "password"} className={cn("pe-10", className)} ref={ref} {...props} />
          <button type="button" onClick={togglePasswordVisibility} className="absolute inset-y-0 end-0 flex h-full w-10 items-center justify-center text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50" aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? (<EyeOff className="size-4" aria-hidden="true" />) : (<Eye className="size-4" aria-hidden="true" />)}
          </button>
        </div>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

interface AuthContentProps {
    image?: {
        src: string;
        alt: string;
    };
    quote?: {
        text: string;
        author: string;
    }
}

interface AuthUIProps {
    signInContent?: AuthContentProps;
    signUpContent?: AuthContentProps;
    children?: React.ReactNode;
}

const defaultSignInContent = {
    image: {
        src: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2070&auto=format&fit=crop",
        alt: "Collaborative environment"
    },
    quote: {
        text: "Build your technical foundation. Master your skills securely.",
        author: "CodeSkill"
    }
};

const defaultSignUpContent = {
    image: {
        src: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?q=80&w=2070&auto=format&fit=crop",
        alt: "A vibrant, modern space for new beginnings"
    },
    quote: {
        text: "Join CodeSkill. A new chapter awaits.",
        author: "CodeSkill"
    }
};

const CURATED_QUOTES = [
  {
    text: "First, solve the problem. Then, write the code.",
    author: "John Johnson",
  },
  {
    text: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.",
    author: "Martin Fowler",
  },
  {
    text: "Simplicity is prerequisite for reliability.",
    author: "Edsger W. Dijkstra",
  },
  {
    text: "Make it work, make it right, make it fast.",
    author: "Kent Beck",
  },
  {
    text: "Talk is cheap. Show me the code.",
    author: "Linus Torvalds",
  },
  {
    text: "Build your technical foundation. Master your skills securely.",
    author: "CodeSkill",
  },
  {
    text: "The best error message is the one that never shows up.",
    author: "Thomas Fuchs",
  },
  {
    text: "Experience is the name everyone gives to their mistakes.",
    author: "Oscar Wilde",
  },
  {
    text: "Knowledge is power, but practice is the key to mastery.",
    author: "CodeSkill",
  },
];

export function AuthUI({ signInContent = {}, signUpContent = {}, children }: AuthUIProps) {
  const finalSignInContent = {
      image: { ...defaultSignInContent.image, ...signInContent.image },
      quote: { ...defaultSignInContent.quote, ...signInContent.quote },
  };

  const currentContent = finalSignInContent;

  const [quote, setQuote] = useState<{ text: string; author: string }>(currentContent.quote);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rotationInterval: NodeJS.Timeout;

    const availableQuotes = [
      currentContent.quote,
      ...CURATED_QUOTES.filter(q => q.text !== currentContent.quote.text)
    ];

    const pickRandom = () => availableQuotes[Math.floor(Math.random() * availableQuotes.length)];
    
    setIsQuoteLoading(false);

    rotationInterval = setInterval(() => {
      setQuote(pickRandom());
    }, 10000);

    return () => {
      if (rotationInterval) clearInterval(rotationInterval);
    };
  }, [currentContent.quote]);

  // GSAP animation for hero showcase
  useEffect(() => {
    if (typeof window === "undefined" || !heroRef.current) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      gsap.from(".gsap-hero-bg", {
        scale: 1.08,
        duration: 2,
        ease: "power2.out",
      });

      gsap.from(".gsap-hero-badge", {
        y: -18,
        opacity: 0,
        duration: 0.8,
        delay: 0.2,
        ease: "power3.out",
      });

      gsap.from(".gsap-quote-panel", {
        y: 28,
        opacity: 0,
        duration: 0.9,
        delay: 0.35,
        ease: "power3.out",
      });
    }, heroRef);

    return () => ctx.revert();
  }, []);

  return (
    <div className="w-full min-h-screen lg:grid lg:grid-cols-2 relative overflow-hidden bg-background">
      <style>{`
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear {
          display: none;
        }
      `}</style>

      {/* Left Form Column (Full Screen Responsive) */}
      <div className="flex min-h-screen items-center justify-center p-4 py-8 sm:p-6 sm:py-12 lg:p-12 relative z-10 bg-background/50 overflow-y-auto">
        {children}
      </div>

      {/* Right Hero / Campus Showcase Column (Desktop Only) */}
      <div
        ref={heroRef}
        className="hidden lg:flex relative overflow-hidden flex-col justify-between p-10 xl:p-14 min-h-screen select-none"
      >
        {/* Background Image with GSAP subtle scale */}
        <div
          className="gsap-hero-bg absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out"
          style={{ backgroundImage: `url(${currentContent.image.src})` }}
        />
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-x-0 bottom-0 h-[480px] bg-gradient-to-t from-black/95 via-black/60 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-[180px] bg-gradient-to-b from-black/60 to-transparent" />

        {/* Top Floating Badge */}
        <div className="relative z-10 flex items-center justify-start">
          <div className="gsap-hero-badge inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white shadow-xl shadow-black/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold tracking-wide text-white/95">
              Chandigarh University • Department of Skill Development
            </span>
          </div>
        </div>

        {/* Bottom Frosted Glass Quote Card */}
        <div className="relative z-10 flex flex-col items-center justify-end">
          <div className="gsap-quote-panel w-full max-w-xl rounded-3xl bg-black/40 backdrop-blur-xl border border-white/15 p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-400/90 text-xs font-bold uppercase tracking-wider">
              <QuoteIcon className="w-4 h-4 fill-emerald-400/20" />
              <span>Campus Inspiration</span>
            </div>

            <blockquote className="space-y-4 text-white min-h-[90px] flex flex-col justify-end">
              {isQuoteLoading ? (
                <div className="flex items-center space-x-3 text-white/70 py-4">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <p className="text-sm font-medium">Loading inspiration...</p>
                </div>
              ) : (
                <>
                  <p className="text-xl xl:text-2xl font-bold leading-snug drop-shadow-md text-white/95">
                    “<Typewriter
                        key={quote.text}
                        text={quote.text}
                        speed={45}
                      />”
                  </p>
                  <cite className="block text-xs font-semibold text-emerald-300 not-italic uppercase tracking-widest">
                    — {quote.author}
                  </cite>
                </>
              )}
            </blockquote>
          </div>
        </div>
      </div>
    </div>
  );
}
