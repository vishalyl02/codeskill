"use client";

import dynamic from "next/dynamic";
import { useQuestionEditorStore } from "../_store/QuestionEditorProvider";
import SectionCard from "./SectionCard";
import { ArrowRightLeft } from "lucide-react";

const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-[200px] w-full flex items-center justify-center bg-card text-muted-foreground animate-pulse text-sm">
      Loading Editor...
    </div>
  ),
});

export default function InputOutputFormat() {
  const { statement, updateStatement, isDarkMode } = useQuestionEditorStore();

  return (
    <SectionCard
      id="io-format"
      title="Input & Output Format"
      subtitle="Describe the expected input and output format."
      icon={ArrowRightLeft}
      delay={0.25}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Input Format */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-gray-700 dark:text-slate-300">Input Format</label>
          <div className="border border-border dark:border-border rounded-xl overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
            <Editor
              height="200px"
              language="markdown"
              theme={isDarkMode ? "vs-dark" : "light"}
              value={statement.inputFormat}
              onChange={(value) => updateStatement({ inputFormat: value || "" })}
              options={{
                minimap: { enabled: false },
                padding: { top: 12 },
                scrollBeyondLastLine: false,
                lineNumbers: "off",
                wordWrap: "on",
                fontSize: 13,
                renderLineHighlightOnlyWhenFocus: true,
              }}
            />
          </div>
        </div>

        {/* Output Format */}
        <div className="space-y-2">
          <label className="text-[13px] font-medium text-gray-700 dark:text-slate-300">Output Format</label>
          <div className="border border-border dark:border-border rounded-xl overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
            <Editor
              height="200px"
              language="markdown"
              theme={isDarkMode ? "vs-dark" : "light"}
              value={statement.outputFormat}
              onChange={(value) => updateStatement({ outputFormat: value || "" })}
              options={{
                minimap: { enabled: false },
                padding: { top: 12 },
                scrollBeyondLastLine: false,
                lineNumbers: "off",
                wordWrap: "on",
                fontSize: 13,
                renderLineHighlightOnlyWhenFocus: true,
              }}
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
