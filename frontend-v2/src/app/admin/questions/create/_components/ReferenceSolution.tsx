"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ALL_LANGUAGES } from "../_store/useQuestionStore";
import { useQuestionEditorStore } from "../_store/QuestionEditorProvider";
import SectionCard from "./SectionCard";
import { ShieldCheck } from "lucide-react";
import { ProgrammingLanguageIcon } from "@/components/ui/ProgrammingLanguageIcon";

const Editor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] w-full flex items-center justify-center bg-card text-muted-foreground animate-pulse text-sm">
      Loading Editor...
    </div>
  ),
});

export default function ReferenceSolution() {
  const { languages, referenceSolution, setReferenceSolution, isDarkMode } = useQuestionEditorStore();
  const [activeTab, setActiveTab] = useState(languages.supported[0] || "javascript");

  const supportedLangs = ALL_LANGUAGES.filter((l) => languages.supported.includes(l.id));

  return (
    <SectionCard
      id="reference-solution"
      title="Reference Solution"
      subtitle="Provide the verified solution for validating test cases."
      icon={ShieldCheck}
      badge="HIDDEN"
      badgeColor="bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
      delay={0.4}
    >
      <div className="space-y-4">
        {/* Warning banner */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 dark:bg-primary/10 border border-primary/20 dark:border-primary/20 rounded-xl text-primary dark:text-primary text-xs font-medium">
          <ShieldCheck className="w-4 h-4 flex-shrink-0" />
          This solution is strictly hidden from candidates and used only for test case validation.
        </div>

        {/* Language Tabs */}
        <div className="flex flex-wrap gap-2 pb-2">
          {supportedLangs.map((lang) => (
            <button
              key={lang.id}
              type="button"
              onClick={() => setActiveTab(lang.id)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-all rounded-lg border ${
                activeTab === lang.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <ProgrammingLanguageIcon language={lang.id} className="w-4 h-4 flex-shrink-0" />
              {lang.label}
            </button>
          ))}
        </div>

        {/* Monaco Editor */}
        <div className="border border-border dark:border-border rounded-xl overflow-hidden bg-card">
          <Editor
            height="380px"
            language={ALL_LANGUAGES.find((l) => l.id === activeTab)?.monacoId || "plaintext"}
            theme="vs-dark"
            value={referenceSolution[activeTab] || ""}
            onChange={(value) => setReferenceSolution(activeTab, value || "")}
            options={{
              minimap: { enabled: false },
              padding: { top: 16 },
              fontSize: 14,
              scrollBeyondLastLine: false,
              renderLineHighlightOnlyWhenFocus: true,
            }}
          />
        </div>
      </div>
    </SectionCard>
  );
}
