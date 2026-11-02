"use client";

import { useEffect, useState, useMemo, useRef, useLayoutEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminProblemsAPI, adminQuestionsAPI } from "@/config/api";
import { useQuestionStore } from "./_store/useQuestionStore";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Settings,
  FileText,
  Code2,
  Database,
  BarChart3,
  Rocket,
  LayoutTemplate,
  Shield,
  Search,
  Cpu,
  AlertTriangle,
  ArrowRightLeft,
  Lightbulb,
  BookOpen,
  Sparkles,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import { motion } from "framer-motion";
import { ToastProvider, useToast } from "./_components/Toast";
import { formatConstraints } from "@/lib/utils";
import ProgressBar from "./_components/ProgressBar";

import BasicInfo from "./_components/BasicInfo";
import ProgrammingLanguages from "./_components/ProgrammingLanguages";
import ExecutionSettings from "./_components/ExecutionSettings";
import ProblemStatement from "./_components/ProblemStatement";
import Constraints from "./_components/Constraints";
import InputOutputFormat from "./_components/InputOutputFormat";
import StarterCode from "./_components/StarterCode";
import ReferenceSolution from "./_components/ReferenceSolution";
import TestCases from "./_components/TestCases";
import CustomChecker from "./_components/CustomChecker";
import SolutionExplanation from "./_components/SolutionExplanation";
import AIAssistance from "./_components/AIAssistance";
import SEOSection from "./_components/SEOSection";
import AnalyticsSection from "./_components/AnalyticsSection";
import PublishingSection from "./_components/PublishingSection";
import MCQEditor from "./_components/MCQEditor";
import CodeOutputEditor from "./_components/CodeOutputEditor";
import { Spinner } from "@/components/ui/spinner";

// Main Create Question Page
export default function CreateQuestionContent() {
  return (
    <ToastProvider>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner className="w-8 h-8 animate-spin text-amber-500" /></div>}>
        <UnifiedQuestionForm />
      </Suspense>
    </ToastProvider>
  );
}

function UnifiedQuestionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams && typeof searchParams.get === "function"
    ? searchParams.get("type")?.toLowerCase()
    : typeof window !== "undefined" && window.location?.search
      ? new URLSearchParams(window.location.search).get("type")?.toLowerCase()
      : null;
  const formRef = useRef<HTMLFormElement>(null);
  const mcqCreationInitialized = useRef(false);
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const store = useQuestionStore();
  const { lastSaved, markSaved, getProgress, activeSection, setActiveSection, updateMetadata, resetStore } = store;
  const questionType = store.metadata.questionType;

  // A new MCQ route must not inherit the edit form's persisted Zustand state.
  // Run before paint and only once per create-page mount; subsequent edits to
  // the form are left alone. Coding routes retain their existing initialization.
  useLayoutEffect(() => {
    const requestedMcq = typeParam === "mcq" || typeParam === "multiple_choice";
    const requestedCoding = typeParam === "coding" || typeParam === "dsa";
    const isMcqType = ["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(questionType);
    if ((requestedMcq || (!requestedCoding && isMcqType)) && !mcqCreationInitialized.current) {
      resetStore();
      mcqCreationInitialized.current = true;
      updateMetadata({ questionType: requestedMcq ? "MCQ" : questionType });
    } else if (requestedMcq) {
      updateMetadata({ questionType: "MCQ" });
    } else if (typeParam === "coding" || typeParam === "dsa") {
      updateMetadata({ questionType: "DSA" });
    }
  }, [typeParam, questionType, resetStore, updateMetadata]);

  // Dynamically compute nav items based on questionType
  const navItems = useMemo(() => {
    const baseItems = [{ id: "basic-info", label: "Basic Info", icon: Settings }];
    
    if (["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(questionType)) {
      baseItems.push({ id: "mcq-options", label: "Options", icon: ListChecks });
      baseItems.push({ id: "solution-explanation", label: "Explanation", icon: BookOpen });
    } else if (questionType === "CODE_OUTPUT") {
      baseItems.push({ id: "code-output", label: "Code Snippet", icon: Code2 });
      baseItems.push({ id: "solution-explanation", label: "Explanation", icon: BookOpen });
    } else { // DSA
      baseItems.push(
        { id: "languages", label: "Languages", icon: Code2 },
        { id: "execution-settings", label: "Execution", icon: Cpu },
        { id: "statement", label: "Statement", icon: FileText },
        { id: "constraints", label: "Constraints", icon: AlertTriangle },
        { id: "io-format", label: "I/O Format", icon: ArrowRightLeft },
        { id: "starter-code", label: "Starter Code", icon: LayoutTemplate },
        { id: "reference-solution", label: "Reference", icon: Shield },
        { id: "test-cases", label: "Test Cases", icon: Database },
        { id: "solution-explanation", label: "Editorial", icon: BookOpen },
      );
    }
    
    baseItems.push(
      { id: "publishing", label: "Publishing", icon: Rocket }
    );
    
    return baseItems;
  }, [questionType]);

  useEffect(() => {
    const interval = setInterval(() => markSaved(), 60000);
    return () => clearInterval(interval);
  }, [markSaved]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const root = form.closest("main");
    // Reset a selection that disappeared after changing the question type.
    if (!navItems.some(({ id }) => id === useQuestionStore.getState().activeSection)) {
      setActiveSection("basic-info");
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { root, rootMargin: "-100px 0px -50% 0px", threshold: 0 }
    );
    navItems.forEach(({ id }) => {
      const el = form.querySelector<HTMLElement>(`[id="${id}"]`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [setActiveSection, navItems]);

  const scrollToSection = (id: string) => {
    const el = formRef.current?.querySelector<HTMLElement>(`[id="${id}"]`);
    if (el) {
      setActiveSection(id);
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleValidate = () => {
    const isMcq = ["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(questionType);
    if (!store.metadata.title.trim() || !store.metadata.slug.trim() || (isMcq && !store.statement.description.trim())) {
      addToast("error", "Validation Failed", isMcq ? "Title, URL Slug, and Question are required." : "Question Title and URL Slug are required.");
      scrollToSection("basic-info");
      return false;
    }

    if (questionType === "DSA" && store.languages.supported.length === 0) {
      addToast("error", "Validation Failed", "Please select at least one programming language.");
      scrollToSection("languages");
      return false;
    }
    
    if (["MCQ", "MULTIPLE_CHOICE"].includes(questionType)) {
      if (!store.mcqOptions.some(o => o.isCorrect)) {
        addToast("error", "Validation Failed", "Select at least one correct option.");
        scrollToSection("mcq-options");
        return false;
      }
    }

    if (questionType === "TRUE_FALSE") {
      const isTrue = !!store.mcqOptions[0]?.isCorrect;
      const isFalse = !!store.mcqOptions[1]?.isCorrect;
      if (!isTrue && !isFalse) {
        addToast("error", "Validation Failed", "Please select either True or False as the correct answer.");
        scrollToSection("mcq-options");
        return false;
      }
    }
    
    if (questionType === "CODE_OUTPUT" && !store.codeOutput.expectedOutput.trim()) {
       addToast("error", "Validation Failed", "Expected Output is required.");
       scrollToSection("code-output");
       return false;
    }

    return true;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!handleValidate()) return;
    setLoading(true);
    try {
      const visibility = store.metadata.visibility;
      const status = visibility === "Published" ? "active" : "draft";

      let payload: any = {
        question: ["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(questionType) ? store.statement.description : store.metadata.title,
        title: store.metadata.title,
        slug: store.metadata.slug?.trim() || undefined,
        ...(["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(questionType) ? { url_slug: store.metadata.slug?.trim() || undefined } : {}),
        visibility,
        contestOnly: store.publishing.contestOnly,
        topic: store.metadata.categories[0] || "General",
        categories: store.metadata.categories,
        difficulty: store.metadata.difficulty.toLowerCase(),
        marks: store.metadata.points,
        negativeMarks: store.metadata.negativeMarks ?? 0,
        status,
        tags: store.metadata.tags,
        explanation: store.solutionExplanation.content,
        questionType: questionType,
      };

      if (questionType === "TRUE_FALSE") {
        const isFalse = !!store.mcqOptions[1]?.isCorrect;
        payload.options = [
          { text: "True", isCorrect: !isFalse, explanation: store.mcqOptions[0]?.explanation || "" },
          { text: "False", isCorrect: isFalse, explanation: store.mcqOptions[1]?.explanation || "" },
        ];
        payload.correctAnswer = isFalse ? 1 : 0;
        payload.correctAnswers = [isFalse ? 1 : 0];
      } else if (["MCQ", "MULTIPLE_CHOICE"].includes(questionType)) {
        payload.options = store.mcqOptions.map(opt => ({
          text: opt.text,
          isCorrect: opt.isCorrect,
          explanation: opt.explanation,
        }));
        const correctIdx = store.mcqOptions.findIndex(o => o.isCorrect);
        payload.correctAnswer = correctIdx >= 0 ? correctIdx : 0;
        payload.correctAnswers = store.mcqOptions.map((o, idx) => o.isCorrect ? idx : -1).filter(idx => idx >= 0);
      } else if (questionType === "CODE_OUTPUT") {
        payload.language = store.codeOutput.language;
        payload.codeSnippet = store.codeOutput.code;
        payload.expectedOutput = store.codeOutput.expectedOutput;
      } else if (questionType === "DSA" || !["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE", "CODE_OUTPUT"].includes(questionType)) {
        payload.problemStatement = store.statement.description;
        payload.constraints = formatConstraints(store.statement.constraints);
        payload.inputFormat = store.statement.inputFormat;
        payload.outputFormat = store.statement.outputFormat;
        // Public test cases double as the sample examples shown to candidates.
        payload.examples = store.testCases
          .filter((tc) => !tc.isHidden)
          .map((tc) => ({
            input: tc.input,
            output: tc.output,
            explanation: tc.explanation || "",
          }));
        payload.starterCode = Object.entries(store.starterCode).map(
          ([language, code]) => ({ language, code }),
        );
        payload.referenceSolutions = Object.entries(store.referenceSolution)
          .filter(([, sourceCode]) => sourceCode.trim())
          .map(([language, sourceCode]) => ({ language, sourceCode }));
        payload.testCases = store.testCases.map((tc) => ({
          ...tc,
          // The backend persists test case outputs as expectedOutput.
          expectedOutput: tc.output,
        }));
        payload.timeLimit = store.execution.timeLimit;
        payload.memoryLimit = store.execution.memoryLimit;
        payload.supportedLanguages = store.languages.supported;
        payload.language = store.languages.default;
        payload.hideMainMethod = store.hideMainMethod;
      }

      await adminQuestionsAPI.create(payload);
      addToast("success", "Question Created", "Successfully added to the question bank.");
      setTimeout(() => router.push("/admin/questions"), 1000);
    } catch (err: any) {
      addToast("error", "Failed", err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const progress = getProgress();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/admin/questions"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Question Bank
            </Link>
            <span className="text-border text-sm">/</span>
            <h1 className="text-sm font-semibold text-foreground truncate">Create Unified Question</h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:block w-32">
              <ProgressBar value={progress} />
            </div>
            {lastSaved && (
              <span className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Saved{" "}
                {new Date(lastSaved).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Page Body */}
      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Sidebar nav */}
          <aside className="hidden lg:block w-56 flex-shrink-0 sticky top-24">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-2">
              Sections
            </p>
            <nav className="space-y-0.5">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  aria-current={activeSection === item.id ? "location" : undefined}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-all text-left ${
                    activeSection === item.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon
                    className={`w-4 h-4 shrink-0 ${
                      activeSection === item.id ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>

          {/* Main form */}
          <div className="flex-1 w-full min-w-0 pb-32">
            <form ref={formRef} id="question-form" onSubmit={handleSubmit} className="space-y-8 max-w-4xl [&>div[id]]:scroll-mt-[100px]">
              {/* Question Mode: 2 Primary Options (MCQ vs Coding Problem) */}
              <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                  Choose Question Format
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      updateMetadata({ questionType: "MCQ" });
                      if (typeof window !== "undefined") {
                        const url = new URL(window.location.href);
                        url.searchParams.set("type", "mcq");
                        window.history.replaceState(null, "", url.toString());
                      }
                    }}
                    className={`flex items-start gap-3.5 p-4 rounded-xl border text-left transition-all ${
                      ["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE", "CODE_OUTPUT"].includes(questionType)
                        ? "bg-amber-500/10 border-amber-500 text-foreground ring-1 ring-amber-500 shadow-sm"
                        : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <div className={`p-2.5 rounded-lg shrink-0 ${
                      ["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE", "CODE_OUTPUT"].includes(questionType)
                        ? "bg-amber-500 text-zinc-950 font-bold"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      <ListChecks className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm flex items-center gap-2">
                        Multiple Choice Question (MCQ)
                        {["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE", "CODE_OUTPUT"].includes(questionType) && (
                          <span className="text-[10px] bg-amber-500 text-zinc-950 px-1.5 py-0.5 rounded font-mono font-semibold">Active</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Single or multiple choice options, true/false, explanations, and negative marks deduction.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      updateMetadata({ questionType: "DSA" });
                      if (typeof window !== "undefined") {
                        const url = new URL(window.location.href);
                        url.searchParams.set("type", "coding");
                        window.history.replaceState(null, "", url.toString());
                      }
                    }}
                    className={`flex items-start gap-3.5 p-4 rounded-xl border text-left transition-all ${
                      questionType === "DSA"
                        ? "bg-amber-500/10 border-amber-500 text-foreground ring-1 ring-amber-500 shadow-sm"
                        : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <div className={`p-2.5 rounded-lg shrink-0 ${
                      questionType === "DSA"
                        ? "bg-amber-500 text-zinc-950 font-bold"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      <Code2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm flex items-center gap-2">
                        Coding Question (DSA)
                        {questionType === "DSA" && (
                          <span className="text-[10px] bg-amber-500 text-zinc-950 px-1.5 py-0.5 rounded font-mono font-semibold">Active</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Algorithmic challenges, code templates, I/O formats, test cases, and sandbox execution limits.
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <BasicInfo />
              
              {["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(questionType) && (
                <>
                  <MCQEditor />
                  <SolutionExplanation />
                </>
              )}

              {questionType === "CODE_OUTPUT" && (
                <>
                  <CodeOutputEditor />
                  <SolutionExplanation />
                </>
              )}

              {questionType === "DSA" && (
                <>
                  <ProgrammingLanguages />
                  <ExecutionSettings />
                  <ProblemStatement />
                  <Constraints />
                  <InputOutputFormat />
                  <StarterCode />
                  <ReferenceSolution />
                  <TestCases />
                  <SolutionExplanation />
                </>
              )}

              <PublishingSection />
            </form>
          </div>
        </div>
      </div>

      {/* Sticky action bar */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.1 }}
        className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border px-6 py-3 shadow-2xl z-50"
      >
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/admin/questions")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => {
                markSaved();
                addToast("info", "Draft Saved", "Progress saved locally.");
              }}
              className="px-4 py-2 text-xs font-semibold text-foreground bg-muted border border-border rounded-lg hover:bg-muted/70 transition-colors whitespace-nowrap"
            >
              Save Draft
            </button>
            
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              Publish to Question Bank
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
