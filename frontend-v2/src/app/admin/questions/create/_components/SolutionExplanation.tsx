"use client";

import dynamic from "next/dynamic";
import { useQuestionStore } from "../_store/useQuestionStore";
import SectionCard from "./SectionCard";
import { BookOpen } from "lucide-react";

const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-[250px] w-full flex items-center justify-center bg-card text-muted-foreground animate-pulse text-sm">
      Loading Editor...
    </div>
  ),
});

const inputClass =
  "w-full px-3.5 py-2.5 bg-muted/50 dark:bg-card border border-border dark:border-border rounded-xl text-sm text-foreground dark:text-white placeholder:text-gray-400 dark:placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all";

export default function SolutionExplanation() {
  const { solutionExplanation, updateSolutionExplanation, isDarkMode } = useQuestionStore();

  return (
    <SectionCard
      id="solution-explanation"
      title="Solution Explanation"
      subtitle="Write the editorial with complexity analysis."
      icon={BookOpen}
      delay={0.55}
    >
      <div className="space-y-5">
        {/* Markdown editor */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-gray-700 dark:text-slate-300">Editorial (Markdown)</label>
          <div className="border border-border dark:border-border rounded-xl overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
            <Editor
              height="300px"
              language="markdown"
              theme={isDarkMode ? "vs-dark" : "light"}
              value={solutionExplanation.content}
              onChange={(value) => updateSolutionExplanation({ content: value || "" })}
              options={{
                minimap: { enabled: false },
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                lineNumbers: "off",
                fontSize: 14,
                renderLineHighlightOnlyWhenFocus: true,
              }}
            />
          </div>
        </div>

        {/* Complexity Analysis */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-gray-100 dark:border-white/[0.04]">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700 dark:text-slate-300">Time Complexity</label>
            <input
              type="text"
              value={solutionExplanation.timeComplexity}
              onChange={(e) => updateSolutionExplanation({ timeComplexity: e.target.value })}
              placeholder="e.g. O(n log n)"
              className={`${inputClass} font-mono`}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700 dark:text-slate-300">Space Complexity</label>
            <input
              type="text"
              value={solutionExplanation.spaceComplexity}
              onChange={(e) => updateSolutionExplanation({ spaceComplexity: e.target.value })}
              placeholder="e.g. O(n)"
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
