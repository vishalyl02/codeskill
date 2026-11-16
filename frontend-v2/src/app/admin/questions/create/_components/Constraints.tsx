"use client";

import dynamic from "next/dynamic";
import { useQuestionEditorStore } from "../_store/QuestionEditorProvider";
import SectionCard from "./SectionCard";
import { AlertTriangle } from "lucide-react";

const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-[180px] w-full flex items-center justify-center bg-card text-muted-foreground animate-pulse text-sm">
      Loading Editor...
    </div>
  ),
});

export default function Constraints() {
  const { statement, updateStatement, isDarkMode } = useQuestionEditorStore();

  return (
    <SectionCard
      id="constraints"
      title="Constraints"
      subtitle="Define the input constraints and bounds."
      icon={AlertTriangle}
      delay={0.2}
    >
      <div className="space-y-3">
        <div className="border border-border dark:border-border rounded-xl overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
          <Editor
            height="180px"
            language="markdown"
            theme={isDarkMode ? "vs-dark" : "light"}
            value={statement.constraints}
            onChange={(value) => updateStatement({ constraints: value || "" })}
            options={{
              minimap: { enabled: false },
              padding: { top: 12 },
              scrollBeyondLastLine: false,
              lineNumbers: "off",
              wordWrap: "on",
              fontSize: 14,
              renderLineHighlightOnlyWhenFocus: true,
            }}
          />
        </div>

        {/* Hint examples */}
        <div className="flex flex-wrap gap-2">
          {[
            "1 ≤ n ≤ 10^5",
            "-10^9 ≤ nums[i] ≤ 10^9",
            "1 ≤ s.length ≤ 10^4",
          ].map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => {
                const current = statement.constraints;
                updateStatement({
                  constraints: current ? `${current}\n${hint}` : hint,
                });
              }}
              className="px-3 py-1.5 text-xs font-mono bg-muted/50 dark:bg-card border border-border dark:border-border rounded-lg text-muted-foreground dark:text-muted-foreground hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:border-indigo-500/30 dark:hover:text-indigo-400 transition-all cursor-pointer"
            >
              + {hint}
            </button>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
