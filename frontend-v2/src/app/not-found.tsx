import Link from "next/link";
import { ArrowLeft, Braces } from "lucide-react";

export default function NotFound() {
  return (
    <section className="relative isolate flex min-h-[60vh] flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div aria-hidden="true" className="pointer-events-none absolute -z-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="flex h-20 w-20 items-center justify-center rounded-[1.6rem] border border-border bg-card shadow-lg shadow-primary/5">
        <Braces aria-hidden="true" className="h-9 w-9 text-primary" strokeWidth={1.6} />
      </div>
      <p className="mt-6 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">404 · Page not found</p>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Looks like a wrong turn</h1>
      <p className="mt-3 max-w-md leading-7 text-muted-foreground">
        We couldn’t find the page you’re looking for.
      </p>
      <Link href="/" className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-foreground shadow-md shadow-primary/15 transition duration-200 hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none">
        <ArrowLeft className="h-4 w-4" /> Back to Home
      </Link>
    </section>
  );
}
