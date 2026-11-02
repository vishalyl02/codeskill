"use client";

import { useState } from "react";
import { ALL_LANGUAGES } from "../_store/useQuestionStore";
import { useQuestionEditorStore } from "../_store/QuestionEditorProvider";
import SectionCard from "./SectionCard";
import Editor from "@monaco-editor/react";
import { Code2 } from "lucide-react";
import { ProgrammingLanguageIcon } from "@/components/ui/ProgrammingLanguageIcon";

export default function StarterCode() {
  const { languages, starterCode, setStarterCode, hideMainMethod, setHideMainMethod, isDarkMode } = useQuestionEditorStore();
  const [activeTab, setActiveTab] = useState(languages.supported[0] || "javascript");

  const supportedLangs = ALL_LANGUAGES.filter((l) => languages.supported.includes(l.id));

  return (
    <SectionCard
      id="starter-code"
      title="Starter Code"
      subtitle="Provide the initial boilerplate code shown to candidates."
      icon={Code2}
      delay={0.35}
    >
      <div className="space-y-4">
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
            value={starterCode[activeTab] || ""}
            onChange={(value) => setStarterCode(activeTab, value || "")}
            options={{
              minimap: { enabled: false },
              padding: { top: 16 },
              fontSize: 14,
              scrollBeyondLastLine: false,
              renderLineHighlightOnlyWhenFocus: true,
            }}
          />
        </div>

        {/* Hide Main Method Option */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/40 hover:bg-muted/60 transition-colors">
          <div className="space-y-0.5 pr-4">
            <div className="flex items-center gap-2">
              <label htmlFor="hide-main-method-toggle" className="text-sm font-semibold text-foreground cursor-pointer">
                Hide Main Method / Driver Code
              </label>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Optional
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, the entry point function (such as <code>main()</code> in C, C++, Java, Go, or <code>if __name__ == &apos;__main__&apos;:</code> in Python) will be hidden from the candidate&apos;s editor while running the full code in the background.
            </p>
          </div>
          <button
            id="hide-main-method-toggle"
            role="switch"
            aria-checked={Boolean(hideMainMethod)}
            aria-label="Hide main method in starter code"
            type="button"
            onClick={() => setHideMainMethod(!hideMainMethod)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
              hideMainMethod ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                hideMainMethod ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {supportedLangs.length === 0 && (
          <p className="text-sm text-primary dark:text-primary bg-primary/10 dark:bg-primary/10 border border-primary/20 dark:border-primary/20 rounded-xl px-4 py-3">
            Please select at least one programming language in the Languages section above.
          </p>
        )}
      </div>
    </SectionCard>
  );
}
