"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuestionEditorStore } from "../_store/QuestionEditorProvider";
import SectionCard from "./SectionCard";
import { FileText, Eye, Edit3, Bold, Italic, Heading, Code, Table, Image, Link, List } from "lucide-react";

const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-[350px] w-full flex items-center justify-center bg-card text-muted-foreground animate-pulse text-sm">
      Loading Editor...
    </div>
  ),
});

export default function ProblemStatement() {
  const { statement, updateStatement, isDarkMode } = useQuestionEditorStore();
  const [mode, setMode] = useState<"write" | "preview">("write");

  const insertMarkdown = (prefix: string, suffix: string = "") => {
    const currentText = statement.description;
    updateStatement({ description: currentText + prefix + suffix });
  };

  const toolbarButtons = [
    { icon: Bold, label: "Bold", action: () => insertMarkdown("**", "Bold Text**") },
    { icon: Italic, label: "Italic", action: () => insertMarkdown("*", "Italic Text*") },
    { icon: Heading, label: "Heading", action: () => insertMarkdown("\n## ", "Heading\n") },
    { icon: Code, label: "Code Block", action: () => insertMarkdown("\n```\n", "code\n```\n") },
    { icon: Table, label: "Table", action: () => insertMarkdown("\n| Col 1 | Col 2 |\n|-------|-------|\n| ", "data | data |\n") },
    { icon: Image, label: "Image", action: () => insertMarkdown("![alt text](", "url)") },
    { icon: Link, label: "Link", action: () => insertMarkdown("[link text](", "url)") },
    { icon: List, label: "List", action: () => insertMarkdown("\n- ", "Item\n") },
  ];

  return (
    <SectionCard
      id="statement"
      title="Problem Statement"
      subtitle="Write the problem description using Markdown syntax."
      icon={FileText}
      delay={0.15}
    >
      <div className="space-y-4">
        {/* Toolbar + Mode Toggle */}
        <div className="flex items-center justify-between">
          {/* Toolbar */}
          <div className="flex items-center gap-1 bg-muted/50 dark:bg-card rounded-lg p-1">
            {toolbarButtons.map(({ icon: Icon, label, action }) => (
              <button
                key={label}
                type="button"
                onClick={action}
                title={label}
                className="p-1.5 rounded-md text-gray-500 dark:text-muted-foreground hover:text-foreground dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-all"
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          {/* Write / Preview toggle */}
          <div className="flex bg-muted dark:bg-card p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setMode("write")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                mode === "write"
                  ? "bg-white dark:bg-slate-700 text-foreground dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-muted-foreground hover:text-gray-700"
              }`}
            >
              <Edit3 className="w-3 h-3" /> Write
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                mode === "preview"
                  ? "bg-white dark:bg-slate-700 text-foreground dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-muted-foreground hover:text-gray-700"
              }`}
            >
              <Eye className="w-3 h-3" /> Preview
            </button>
          </div>
        </div>

        {/* Editor / Preview */}
        {mode === "write" ? (
          <div className="border border-border dark:border-border rounded-xl overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
            <Editor
              height="350px"
              language="markdown"
              theme={isDarkMode ? "vs-dark" : "light"}
              value={statement.description}
              onChange={(value) => updateStatement({ description: value || "" })}
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
        ) : (
          <div className="border border-border dark:border-border rounded-xl p-6 min-h-[350px] bg-white dark:bg-card/50 prose dark:prose-invert max-w-none text-sm">
            {statement.description ? (
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-slate-300">
                {statement.description}
              </pre>
            ) : (
              <p className="text-gray-400 dark:text-muted-foreground italic">
                Nothing to preview yet. Start writing your problem statement.
              </p>
            )}
          </div>
        )}

        <p className="text-[11px] text-gray-400 dark:text-muted-foreground">
          Supports full Markdown syntax including LaTeX math expressions, code blocks, and tables.
        </p>
      </div>
    </SectionCard>
  );
}
