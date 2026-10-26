import { CheckCircle2, Circle, CircleDot } from "lucide-react";

export function ProblemProgressMark({ status, className = "w-5 h-5 mx-auto" }: { status?: string; className?: string }) {
  if (status === "solved") return <span role="img" aria-label="Solved" title="Solved"><CheckCircle2 className={`${className} text-emerald-500`} aria-hidden="true" /></span>;
  if (status === "attempted") return <span role="img" aria-label="Attempted" title="Attempted"><CircleDot className={`${className} text-amber-500`} aria-hidden="true" /></span>;
  return <span role="img" aria-label="Not attempted" title="Not attempted"><Circle className={`${className} text-muted-foreground/30`} aria-hidden="true" /></span>;
}
