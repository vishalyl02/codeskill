"use client";

import { getTopicCategories, normalizeQuestionType } from "@/lib/question-types";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { adminProblemsAPI, adminQuestionsAPI } from "@/config/api";
import { useQuestionStore } from "../../create/_store/useQuestionStore";
import { formatConstraints } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, Save, Settings, FileText, Code2, Database, BarChart3, Rocket, LayoutTemplate, Shield, Moon, Sun, Search, Cpu, AlertTriangle, ArrowRightLeft, Lightbulb, BookOpen, Sparkles, CheckCircle2, ListChecks } from "lucide-react";
import { motion } from "framer-motion";
import { ToastProvider, useToast } from "../../create/_components/Toast";
import ProgressBar from "../../create/_components/ProgressBar";

import BasicInfo from "../../create/_components/BasicInfo";
import MCQEditor from "../../create/_components/MCQEditor";
import CodeOutputEditor from "../../create/_components/CodeOutputEditor";
import ProgrammingLanguages from "../../create/_components/ProgrammingLanguages";
import ExecutionSettings from "../../create/_components/ExecutionSettings";
import ProblemStatement from "../../create/_components/ProblemStatement";
import Constraints from "../../create/_components/Constraints";
import InputOutputFormat from "../../create/_components/InputOutputFormat";
import StarterCode from "../../create/_components/StarterCode";
import ReferenceSolution from "../../create/_components/ReferenceSolution";
import TestCases from "../../create/_components/TestCases";
import CustomChecker from "../../create/_components/CustomChecker";
import SolutionExplanation from "../../create/_components/SolutionExplanation";
import AIAssistance from "../../create/_components/AIAssistance";
import SEOSection from "../../create/_components/SEOSection";
import AnalyticsSection from "../../create/_components/AnalyticsSection";
import PublishingSection from "../../create/_components/PublishingSection";
import { Spinner } from "@/components/ui/spinner";

function normalizeLanguageCodeMap(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};

  const normalizeLanguage = (language: string) => {
    const raw = language.trim().toLowerCase();
    if (["c++", "cpp", "cxx", "g++"].includes(raw)) return "cpp";
    const key = raw.replace(/[\s_+.-]/g, "");
    if (["cpp", "cxx", "gpp"].includes(key)) return "cpp";
    if (["py", "python3"].includes(key)) return "python3";
    if (["js", "node", "nodejs"].includes(key)) return "javascript";
    return key;
  };

  const addEntry = (language: unknown, value: unknown) => {
    if (typeof language !== "string" || !language.trim()) return;
    const code =
      typeof value === "string"
        ? value
        : value && typeof value === "object"
        ? ["code", "sourceCode", "solution", "content"]
            .map((field) => (value as Record<string, unknown>)[field])
            .find((candidate): candidate is string => typeof candidate === "string")
        : undefined;
    if (typeof code === "string") {
      result[normalizeLanguage(language)] = code;
    }
  };

  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const record = entry as Record<string, unknown>;
      addEntry(record.language ?? record.languageId ?? record.lang, record);
    });
  } else if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([language, code]) => {
      addEntry(language, code);
    });
  }

  return result;
}

function EditQuestionContent() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const { addToast } = useToast();
  
  const store = useQuestionStore();
  const { isDarkMode, setDarkMode, lastSaved, markSaved, getProgress, activeSection, setActiveSection, setAllData, resetStore } = store;
  const questionType = store.metadata.questionType;

  const navItems = useMemo(() => {
    const baseItems = [{ id: "basic-info", label: "Basic Info", icon: Settings }];

    if (["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(questionType)) {
      baseItems.push({ id: "mcq-options", label: "Options", icon: ListChecks });
      baseItems.push({ id: "solution-explanation", label: "Explanation", icon: BookOpen });
    } else if (questionType === "CODE_OUTPUT") {
      baseItems.push({ id: "code-output", label: "Code Snippet", icon: Code2 });
      baseItems.push({ id: "solution-explanation", label: "Explanation", icon: BookOpen });
    } else {
      baseItems.push(
        { id: "languages", label: "Languages", icon: Code2 },
        { id: "execution-settings", label: "Execution", icon: Cpu },
        { id: "statement", label: "Statement", icon: FileText },
        { id: "constraints", label: "Constraints", icon: AlertTriangle },
        { id: "io-format", label: "I/O Format", icon: ArrowRightLeft },
        { id: "starter-code", label: "Starter Code", icon: LayoutTemplate },
        { id: "reference-solution", label: "Reference", icon: Shield },
        { id: "test-cases", label: "Test Cases", icon: Database },
        { id: "custom-checker", label: "Checker", icon: Shield },
        { id: "solution-explanation", label: "Editorial", icon: BookOpen },
        { id: "ai-assistance", label: "AI Tools", icon: Sparkles },
        { id: "seo", label: "SEO", icon: Search },
        { id: "analytics", label: "Analytics", icon: BarChart3 }
      );
    }

    baseItems.push({ id: "publishing", label: "Publishing", icon: Rocket });
    return baseItems;
  }, [questionType]);

  // Fetch the existing problem
  useEffect(() => {
    async function fetchProblem() {
      try {
        let data: any;
        try {
          const res = await adminQuestionsAPI.getById(params.id as string);
          data = res.data.data ? res.data.data : res.data;
        } catch {
          const res = await adminProblemsAPI.getById(params.id as string);
          data = res.data.data ? res.data.data : res.data;
        }

        const rawType = data.questionType || (Array.isArray(data.options) && data.options.length ? "MCQ" : "DSA");
        const qType = normalizeQuestionType(rawType, "DSA");
        const isMcq = ["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE", "single_choice", "multiple_choice", "true_false"].includes(qType);
        const savedSlug = data.url_slug || data.slug;
        const slugFromTitle = String(data.title || data.question || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        const storedVisibility = String(data.visibility || data.metadata?.visibility || "").trim().toLowerCase();
        const visibility = ["public", "published"].includes(storedVisibility) ? "Published" : storedVisibility === "private" ? "Private" : "Draft";
        const contestOnly = typeof data.contestOnly === "boolean" ? data.contestOnly : data.metadata?.contestOnly === true;

        const rawConstraints = data.constraints || data.statement?.constraints;
        const constraintsString = Array.isArray(rawConstraints)
          ? rawConstraints.join("\n")
          : typeof rawConstraints === "string"
          ? rawConstraints
          : "";

        const mappedState: any = {
          hideMainMethod: Boolean(data.hideMainMethod ?? data.metadata?.hideMainMethod),
          metadata: {
            title: data.title || data.question || "",
            slug: savedSlug || (isMcq ? slugFromTitle : ""),
            difficulty: (data.difficulty ? data.difficulty.charAt(0).toUpperCase() + data.difficulty.slice(1).toLowerCase() : "Easy"),
            categories: getTopicCategories(data),
            tags: data.tags || [],
            visibility,
            author: data.author || "",
            questionId: data._id || data.id || "",
            estimatedSolveTime: 30, // Default if not in backend
            points: data.marks || 1,
            negativeMarks: data.negativeMarks ?? 0,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            questionType: qType,
          },
          options: data.options,
          correctAnswer: data.correctAnswer,
          correctAnswers: data.correctAnswers,
          seo: {
            metaTitle: data.metaTitle || "",
            metaDescription: data.metaDescription || "",
            keywords: data.keywords || [],
          },
          statement: {
            description: ["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE", "single_choice", "multiple_choice", "true_false"].includes(qType)
              ? data.question || data.title || ""
              : data.problemStatement || data.statement?.description || data.question || "",
            inputFormat: data.inputFormat || data.statement?.inputFormat || "",
            outputFormat: data.outputFormat || data.statement?.outputFormat || "",
            constraints: constraintsString,
          },
          solutionExplanation: {
            content: data.explanation || data.metadata?.solutionExplanation || "",
            timeComplexity: data.metadata?.timeComplexity || "",
            spaceComplexity: data.metadata?.spaceComplexity || "",
          },
          sampleExamples: data.examples || data.statement?.samples || [],
          languages: {
            supported: data.supportedLanguages || data.config?.supportedLanguages || ["cpp", "java", "python", "javascript"],
            default: data.language || data.config?.defaultLanguage || (data.supportedLanguages || data.config?.supportedLanguages || ["python"])[0],
            compilerVersions: {},
          },
          execution: {
            timeLimit: data.timeLimit || data.config?.timeLimit || 2000,
            memoryLimit: data.memoryLimit || data.config?.memoryLimit || 256,
            cpuLimit: data.config?.cpuLimit || 1,
            maxSourceCodeSize: data.config?.maxSourceCodeSize || 1048576,
          },
          starterCode: normalizeLanguageCodeMap(data.starterCode),
          referenceSolution: normalizeLanguageCodeMap(data.referenceSolutions ?? data.referenceSolution),
          customChecker: {
            enabled: data.config?.hasCustomChecker || false,
            language: data.config?.customCheckerCode?.language || "cpp",
            code: data.config?.customCheckerCode?.code || "",
          },
          testCases: (data.testCases?.cases || (Array.isArray(data.testCases) ? data.testCases : [])).map((tc: any) => ({
            id: tc.id || Math.random().toString(36).substring(2, 9),
            input: tc.input || "",
            output: tc.expectedOutput ?? tc.output ?? "",
            isHidden: Boolean(tc.isHidden),
            explanation: tc.explanation || "",
            weight: tc.weight || 1,
          })),
          publishing: {
            publishImmediately: visibility === "Published",
            saveAsDraft: visibility === "Draft",
            scheduledDate: "",
            isArchived: false,
            isFeatured: false,
            contestOnly,
            practiceOnly: true,
          },
        };

        setAllData(mappedState);
      } catch (err: any) {
        addToast("error", "Error fetching problem", err.message);
      } finally {
        setFetching(false);
      }
    }
    
    if (params.id) {
      fetchProblem();
    }
  }, [params.id, setAllData, addToast]);

  // Auto-save logic
  useEffect(() => {
    const interval = setInterval(() => {
      markSaved();
    }, 60000);
    return () => clearInterval(interval);
  }, [markSaved]);

  // Dark mode class toggle
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Scrollspy logic
  useEffect(() => {
    if (fetching) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -80% 0px" }
    );

    navItems.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [setActiveSection, fetching, navItems]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const offset = 100;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = el.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
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
    if (questionType === "TRUE_FALSE") {
      const isTrue = !!store.mcqOptions[0]?.isCorrect;
      const isFalse = !!store.mcqOptions[1]?.isCorrect;
      if (!isTrue && !isFalse) {
        addToast("error", "Validation Failed", "Please select either True or False as the correct answer.");
        scrollToSection("mcq-options");
        return false;
      }
    }
    if (["MCQ", "MULTIPLE_CHOICE"].includes(questionType)) {
      if (!store.mcqOptions.some((o) => o.isCorrect)) {
        addToast("error", "Validation Failed", "Select at least one correct option.");
        scrollToSection("mcq-options");
        return false;
      }
    }
    addToast("success", "Validation Passed", "All required fields look good.");
    return true;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!handleValidate()) return;

    setLoading(true);
    try {
      const visibility = store.metadata.visibility || "Draft";

      const formattedConstraints = formatConstraints(store.statement.constraints);

      const payload: any = {
        question: ["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(questionType) ? store.statement.description : store.metadata.title,
        title: store.metadata.title,
        slug: store.metadata.slug,
        ...(["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(questionType) ? { url_slug: store.metadata.slug } : {}),
        visibility,
        contestOnly: store.publishing.contestOnly,
        topic: store.metadata.categories[0] || "General",
        categories: store.metadata.categories,
        difficulty: store.metadata.difficulty.toLowerCase(),
        marks: store.metadata.points || 1,
        negativeMarks: store.metadata.negativeMarks ?? 0,
        status: visibility === "Published" ? "approved" : "draft",
        tags: store.metadata.tags,
        explanation: store.solutionExplanation?.content || "",
        questionType: questionType,
        problemStatement: store.statement.description,
        constraints: formattedConstraints,
        inputFormat: store.statement.inputFormat,
        outputFormat: store.statement.outputFormat,
        // Public test cases double as the sample examples shown to candidates.
        examples: store.testCases
          .filter((tc) => !tc.isHidden)
          .map((tc) => ({
            input: tc.input,
            output: tc.output,
            explanation: tc.explanation || "",
          })),
        starterCode: Object.entries(store.starterCode).map(
          ([language, code]) => ({ language, code }),
        ),
        referenceSolutions: Object.entries(store.referenceSolution)
          .filter(([, sourceCode]) => sourceCode.trim())
          .map(([language, sourceCode]) => ({ language, sourceCode })),
        testCases: store.testCases.map((tc) => ({
          ...tc,
          // The backend persists test case outputs as expectedOutput.
          expectedOutput: tc.output,
        })),
        timeLimit: store.execution.timeLimit,
        memoryLimit: store.execution.memoryLimit,
        supportedLanguages: store.languages.supported,
        language: store.languages.default,
        hideMainMethod: store.hideMainMethod,
        timeComplexity: store.solutionExplanation?.timeComplexity || "",
        spaceComplexity: store.solutionExplanation?.spaceComplexity || "",
        // Legacy problem structure compatibility
        metadata: {
          ...store.metadata,
          visibility,
          hideMainMethod: store.hideMainMethod,
        },
        languages: store.languages.supported || store.languages,
        execution: store.execution,
        statement: {
          ...store.statement,
          constraints: formattedConstraints,
        },
        sampleExamples: store.testCases
          .filter((tc) => !tc.isHidden)
          .map((tc) => ({
            input: tc.input,
            output: tc.output,
            explanation: tc.explanation || "",
          })),
        referenceSolution: store.referenceSolution,
        customChecker: store.customChecker,
        solutionExplanation: store.solutionExplanation,
        seo: store.seo,
        analytics: store.analytics,
        publishing: {
          ...store.publishing,
          visibility,
        },
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
        payload.options = store.mcqOptions.map((opt) => ({
          text: opt.text,
          isCorrect: opt.isCorrect,
          explanation: opt.explanation,
        }));
        const correctIdx = store.mcqOptions.findIndex((o) => o.isCorrect);
        payload.correctAnswer = correctIdx >= 0 ? correctIdx : 0;
        payload.correctAnswers = store.mcqOptions
          .map((o, idx) => (o.isCorrect ? idx : -1))
          .filter((idx) => idx >= 0);
      }

      try {
        await adminQuestionsAPI.update(params.id as string, payload);
      } catch {
        await adminProblemsAPI.update(params.id as string, payload);
      }
      addToast("success", "Question Updated", "Successfully updated question.");
      setTimeout(() => {
        router.push("/admin/questions");
      }, 1000);
    } catch (err: any) {
      addToast("error", "Failed to update question", err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = () => {
    markSaved();
    addToast("info", "Draft Saved", "Your progress has been saved locally.");
  };

  const progress = getProgress();

  if (fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-32 transition-colors duration-300 ${isDarkMode ? 'bg-[#0B0F1A]' : 'bg-[#F8FAFC]'}`}>
      {/* Top Header */}
      <div className="bg-white/80 dark:bg-background/80 backdrop-blur-xl border-b border-border dark:border-white/[0.04] sticky top-0 z-40 shadow-sm transition-colors duration-300">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-muted-foreground mb-1">
                <Link href="/admin/questions" className="hover:text-foreground dark:hover:text-white flex items-center gap-1 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" /> Question Bank
                </Link>
                <span>/</span>
                <span className="text-foreground dark:text-white font-medium">Edit Question</span>
              </div>
              <h1 className="text-2xl font-bold text-foreground dark:text-white tracking-tight">Edit Question</h1>
            </div>
            
            <div className="hidden lg:block h-10 w-px bg-gray-200 dark:bg-slate-700" />
            
            <div className="hidden lg:block w-48">
              <ProgressBar value={progress} />
            </div>

            {(store.metadata.createdAt || store.metadata.updatedAt) && (
              <div className="hidden xl:flex flex-col text-[11px] text-muted-foreground border-l border-border pl-4">
                {store.metadata.createdAt && (
                  <span>Created: {new Date(store.metadata.createdAt).toLocaleString()}</span>
                )}
                {store.metadata.updatedAt && (
                  <span>Last Modified: {new Date(store.metadata.updatedAt).toLocaleString()}</span>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
             <div className="hidden md:flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-muted-foreground bg-muted dark:bg-card px-3 py-1.5 rounded-full">
               {lastSaved ? (
                 <>
                   <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                   Saved {new Date(lastSaved).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                 </>
               ) : (
                 <>
                   <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Auto-saving enabled
                 </>
               )}
             </div>

             <button
               onClick={() => setDarkMode(!isDarkMode)}
               className="p-2.5 rounded-full bg-muted dark:bg-card text-muted-foreground dark:text-muted-foreground hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
             >
               {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
             </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          
          {/* Scrollspy Sidebar */}
          <div className="hidden lg:block w-64 flex-shrink-0 sticky top-32">
            <nav className="space-y-1">
              <p className="text-[10px] font-bold text-gray-400 dark:text-muted-foreground uppercase tracking-widest mb-4 px-3">Navigation</p>
              {navItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all text-left ${
                    activeSection === item.id
                      ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 shadow-sm"
                      : "text-muted-foreground dark:text-muted-foreground hover:bg-muted dark:hover:bg-card/50 hover:text-foreground dark:hover:text-white"
                  }`}
                >
                  <item.icon className={`w-4 h-4 ${activeSection === item.id ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400 dark:text-muted-foreground"}`} />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Main Form Content */}
          <div className="flex-1 w-full min-w-0">
            <form id="question-form" onSubmit={handleSubmit} className="space-y-8 max-w-4xl">
              <BasicInfo />
              {["MCQ", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(questionType) && (
                <div id="mcq-options">
                  <MCQEditor />
                </div>
              )}
              {questionType === "CODE_OUTPUT" && (
                <div id="code-output">
                  <CodeOutputEditor />
                </div>
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
                  <CustomChecker />
                </>
              )}
              <SolutionExplanation />
              <AIAssistance />
              <SEOSection />
              <AnalyticsSection />
              <PublishingSection />
            </form>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.5 }}
        className="fixed bottom-0 left-0 right-0 bg-card/90 backdrop-blur-xl border-t border-border p-4 shadow-2xl z-50"
      >
        <div className="max-w-[1600px] mx-auto flex items-center justify-between px-2">
          <button 
            type="button" 
            onClick={() => router.push("/admin/questions")}
            className="text-muted-foreground hover:text-foreground font-medium text-sm transition-colors"
          >
            Cancel
          </button>
          
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
            <button 
              type="button" 
              onClick={handleSaveDraft}
              className="px-5 py-2.5 text-sm font-medium text-foreground bg-card border border-border rounded-xl hover:bg-muted/60 transition-colors shadow-sm whitespace-nowrap"
            >
              Save Draft
            </button>
            <button 
              type="button" 
              onClick={handleValidate}
              className="px-5 py-2.5 text-sm font-medium text-foreground bg-card border border-border rounded-xl hover:bg-muted/60 transition-colors shadow-sm whitespace-nowrap"
            >
              Validate
            </button>
            <button 
              type="button" 
              className="px-5 py-2.5 text-sm font-medium text-primary bg-primary/10 border border-primary/20 rounded-xl hover:bg-primary/20 transition-colors shadow-sm whitespace-nowrap"
            >
              Preview
            </button>
            <button 
              type="submit" 
              form="question-form"
              disabled={loading}
              className="flex items-center justify-center gap-2 px-8 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loading ? <Spinner className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Update Question
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function EditAdvancedQuestionPage() {
  return (
    <ToastProvider>
      <EditQuestionContent />
    </ToastProvider>
  );
}
