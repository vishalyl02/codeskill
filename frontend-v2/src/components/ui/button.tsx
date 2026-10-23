import { Spinner } from "@/components/ui/spinner";
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { m, type HTMLMotionProps } from "motion/react"

import { cn } from "@/lib/utils"
import { buttonInteract } from "@/lib/animations"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-[var(--ds-radius-control)] text-[length:var(--ds-font-sm)] font-semibold transition-colors duration-[var(--ds-motion-duration)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-border bg-background hover:bg-muted hover:text-foreground text-foreground",
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:bg-muted",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        glass: "bg-card border border-border text-foreground hover:bg-muted",
      },
      size: {
        default: "h-[var(--ds-control-height)] px-[var(--ds-space-4)]",
        sm: "h-[var(--ds-control-height)] px-[var(--ds-space-3)]",
        lg: "h-[var(--ds-control-height)] px-[var(--ds-space-6)]",
        icon: "h-[var(--ds-control-height)] w-[var(--ds-control-height)] shrink-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "size" | "children">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  isLoading?: boolean
  children?: React.ReactNode
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading, children, ...props }, ref) => {
    return (
      <m.button
        ref={ref}
        variants={buttonInteract}
        whileHover="whileHover"
        whileTap="whileTap"
        className={cn(buttonVariants({ variant, size, className }), "relative overflow-hidden")}
        disabled={isLoading || props.disabled}
        {...props}
      >
        <span className={cn("flex items-center gap-2 transition-opacity", isLoading && "opacity-0")}>
          {children}
        </span>
        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner className="h-5 w-5 animate-spin" />
          </span>
        )}
      </m.button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
