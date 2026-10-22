"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import styles from "./WorkspaceEnhancements.module.css";

export function hasSampleContent(tc: { input?: string; output?: string; expected?: string; expectedOutput?: string }) {
  return Boolean((tc.input || "").trim() || (tc.output || "").trim() || (tc.expected || "").trim() || (tc.expectedOutput || "").trim());
}
export interface SampleCase { input?: string; output?: string; explanation?: string }
interface Props { samples: SampleCase[]; onLoad?: (sample: SampleCase, index: number) => void }

export default function PracticeSampleCases({ samples, onLoad }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key); setCopyError(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1800);
    } catch { setCopyError(true); }
  }
  if (!samples.length) return <p className="text-xs text-muted-foreground leading-relaxed">No public examples are available. Use custom input to explore your solution.</p>;
  return <div className={styles.examples}>
    {samples.map((sample, index) => <section key={index} className={styles.example} aria-label={`Example ${index + 1}`}>
      <div className={styles.exampleHeading}><h4>Example {index + 1}</h4>{onLoad && <button type="button" onClick={() => onLoad(sample, index)}><Terminal size={13} /> Load in console</button>}</div>
      {(["input", "output"] as const).map(kind => {
        const key = `${index}-${kind}`, value = sample[kind] ?? "";
        return <div key={kind} className={styles.exampleValue}>
          <div><span>{kind === "input" ? "Input" : "Output"}</span><button type="button" title={copied === key ? "Copied" : `Copy ${kind}`} aria-label={`${copied === key ? "Copied" : "Copy"} example ${index + 1} ${kind}`} onClick={() => void copy(value, key)}>{copied === key ? <Check size={15} /> : <Copy size={15} />}</button></div>
          <pre>{value || (kind === "input" ? "(empty input)" : "(empty output)")}</pre>
        </div>;
      })}
      {sample.explanation && <p className={styles.exampleExplanation}><strong>Explanation.</strong> {sample.explanation}</p>}
    </section>)}
    <span role="status" className="sr-only">{copied ? "Copied to clipboard" : ""}</span>
    {copyError && <p role="alert" className="text-xs text-muted-foreground">Copy unavailable. Select the text to copy it manually.</p>}
  </div>;
}
