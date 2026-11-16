"use client";

import React, { useState } from "react";
import { X, Copy, Check, Code, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReviewCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  problemTitle: string;
  problemIndex: string;
  code: string;
  language: string;
}

export function ReviewCodeModal({
  isOpen,
  onClose,
  problemTitle,
  problemIndex,
  code,
  language,
}: ReviewCodeModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // copy fallback
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-code-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0 duration-200"
    >
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-6 py-4 bg-muted/30">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
              {problemIndex}
            </span>
            <div>
              <h3 id="review-code-title" className="font-semibold text-base">
                {problemTitle}
              </h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5" />
                Submitted Code ({language || "plaintext"})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5 text-xs h-8"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-lg"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Code Content */}
        <div className="flex-1 overflow-auto p-5 bg-muted/15 font-mono text-xs sm:text-sm">
          {code ? (
            <pre className="p-4 rounded-xl border border-border/60 bg-background/95 overflow-x-auto leading-relaxed text-foreground">
              <code>{code}</code>
            </pre>
          ) : (
            <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-2">
              <FileText className="w-8 h-8 opacity-40" />
              <p>No saved code found for this problem.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/80 px-6 py-3 bg-muted/20 flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
