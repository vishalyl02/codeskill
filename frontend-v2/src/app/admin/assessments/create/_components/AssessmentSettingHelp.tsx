import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

type Props = {
  name: string;
  label?: ReactNode;
  align?: "start" | "end";
  children: ReactNode;
};

export default function AssessmentSettingHelp({ name, label, align = "end", children }: Props) {
  return (
    <details className="group/help relative min-w-0 shrink-0">
      <summary aria-label={`${name} details`} className="inline-flex min-h-6 max-w-full cursor-pointer list-none items-center gap-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        {label}
        <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors group-open/help:border-primary/30 group-open/help:bg-primary/10 group-open/help:text-primary group-hover/help:bg-muted">
          <ChevronRight aria-hidden="true" className="size-3.5 transition-transform group-open/help:rotate-90 motion-reduce:transition-none" />
        </span>
      </summary>
      <div className={label
        ? "mt-1.5 border-l border-primary/30 pl-2.5 text-xs leading-relaxed text-muted-foreground"
        : `absolute top-full z-10 mt-1 w-60 max-w-[calc(100vw-4.5rem)] rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-lg ${align === "start" ? "left-0" : "right-0"}`
      }>
        {children}
      </div>
    </details>
  );
}
