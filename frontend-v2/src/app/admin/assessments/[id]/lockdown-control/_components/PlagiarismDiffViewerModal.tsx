"use client";

import React, { useState } from "react";
import { X, Copy, Check, Split, Columns2, Code2, AlertTriangle } from "lucide-react";

export interface PlagiarismPairData {
  candidateA: { id: string; name: string };
  candidateB: { id: string; name: string };
  similarityPercentage: number;
  sharedTokensCount: number;
  problemId?: string;
  codeA?: string;
  codeB?: string;
}

interface PlagiarismDiffViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pair: PlagiarismPairData | null;
}

export default function PlagiarismDiffViewerModal({
  isOpen,
  onClose,
  pair,
}: PlagiarismDiffViewerModalProps) {
  const [copiedSide, setCopiedSide] = useState<"A" | "B" | null>(null);

  if (!isOpen || !pair) return null;

  const handleCopy = (code: string, side: "A" | "B") => {
    navigator.clipboard.writeText(code);
    setCopiedSide(side);
    setTimeout(() => setCopiedSide(null), 2000);
  };

  const codeA = pair.codeA || "// Candidate A source code not available or loaded";
  const codeB = pair.codeB || "// Candidate B source code not available or loaded";

  const linesA = codeA.split("\n");
  const linesB = codeB.split("\n");

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-6xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-foreground text-sm">
                  AST Winnowing Plagiarism Match
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-mono font-bold">
                  {pair.similarityPercentage}% Similarity
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  ({pair.sharedTokensCount} Shared N-Gram Hashes)
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Comparing submissions {pair.problemId ? `for Problem: ${pair.problemId}` : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Diff Columns Container */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
          {/* Side A */}
          <div className="flex flex-col h-full overflow-hidden bg-muted/10">
            <div className="p-3 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold text-xs text-foreground truncate">
                  {pair.candidateA.name}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  ({pair.candidateA.id.substring(0, 8)})
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(codeA, "A")}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono bg-muted hover:bg-muted/80 text-foreground transition-colors cursor-pointer"
              >
                {copiedSide === "A" ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
              <table className="w-full border-collapse">
                <tbody>
                  {linesA.map((line, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="w-10 pr-3 text-right select-none text-[11px] text-muted-foreground/50 border-r border-border/40">
                        {idx + 1}
                      </td>
                      <td className="pl-3 text-foreground whitespace-pre-wrap break-all font-mono">
                        {line}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Side B */}
          <div className="flex flex-col h-full overflow-hidden bg-muted/10">
            <div className="p-3 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-rose-400" />
                <span className="font-semibold text-xs text-foreground truncate">
                  {pair.candidateB.name}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  ({pair.candidateB.id.substring(0, 8)})
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(codeB, "B")}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono bg-muted hover:bg-muted/80 text-foreground transition-colors cursor-pointer"
              >
                {copiedSide === "B" ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
              <table className="w-full border-collapse">
                <tbody>
                  {linesB.map((line, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="w-10 pr-3 text-right select-none text-[11px] text-muted-foreground/50 border-r border-border/40">
                        {idx + 1}
                      </td>
                      <td className="pl-3 text-foreground whitespace-pre-wrap break-all font-mono">
                        {line}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border flex items-center justify-between bg-muted/20 text-xs text-muted-foreground">
          <span>
            Identical AST token structures flagged by k-gram Winnowing hash matching.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors cursor-pointer"
          >
            Close Diff
          </button>
        </div>
      </div>
    </div>
  );
}
