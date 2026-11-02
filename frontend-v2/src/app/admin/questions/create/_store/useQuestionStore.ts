import { normalizeQuestionType } from "@/lib/question-types";
import { create } from 'zustand';

// ── Language & Compiler Definitions ──
export const ALL_LANGUAGES = [
  { id: 'c', label: 'C', monacoId: 'c', icon: '🇨' },
  { id: 'cpp', label: 'C++', monacoId: 'cpp', icon: '⊕' },
  { id: 'java', label: 'Java', monacoId: 'java', icon: '☕' },
  { id: 'javascript', label: 'JavaScript (Node.js)', monacoId: 'javascript', icon: '🟨' },
  { id: 'python', label: 'Python', monacoId: 'python', icon: '🐍' },
  { id: 'python3', label: 'Python 3', monacoId: 'python', icon: '🐍' },
  { id: 'go', label: 'Go', monacoId: 'go', icon: '🐹' },
  { id: 'rust', label: 'Rust', monacoId: 'rust', icon: '🦀' },
  { id: 'csharp', label: 'C#', monacoId: 'csharp', icon: '🎯' },
  { id: 'kotlin', label: 'Kotlin', monacoId: 'kotlin', icon: '🇰' },
  { id: 'swift', label: 'Swift', monacoId: 'swift', icon: '🕊' },
  { id: 'php', label: 'PHP', monacoId: 'php', icon: '🐘' },
  { id: 'ruby', label: 'Ruby', monacoId: 'ruby', icon: '💎' },
  { id: 'typescript', label: 'TypeScript', monacoId: 'typescript', icon: '🔷' },
  { id: 'scala', label: 'Scala', monacoId: 'scala', icon: '🔴' },
] as const;

export const DEFAULT_COMPILER_VERSIONS: Record<string, string> = {
  c: 'GCC 13',
  cpp: 'GCC 13',
  java: '21',
  javascript: 'Node.js v20 LTS',
  python: '2.7',
  python3: '3.12',
  go: '1.22',
  rust: '1.77',
  csharp: '.NET 8',
  kotlin: '1.9',
  swift: '5.9',
  php: '8.3',
  ruby: '3.3',
  typescript: '5.4',
  scala: '3.4',
};

// ── Interfaces ──
export interface ProblemMetadata {
  title: string;
  slug: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'easy' | 'medium' | 'hard';
  categories: string[];
  tags: string[];
  visibility: 'Draft' | 'Published' | 'Private';
  author: string;
  questionId: string;
  estimatedSolveTime: number; // minutes
  points: number;
  negativeMarks?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  questionType: 'MCQ' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'CODE_OUTPUT' | 'DSA';
}

export interface ProblemLanguages {
  supported: string[];
  compilerVersions: Record<string, string>;
  /** Preferred language pre-selected for candidates; they can override it. */
  default: string;
}

export interface ExecutionConfig {
  timeLimit: number;
  memoryLimit: number;
  stackSize: number;
  outputLimit: number;
  maxSourceCodeSize: number;
  cpuLimit: number;
  enableCustomInput: boolean;
  allowMultipleFiles: boolean;
  enableFileUpload: boolean;
}

export interface ProblemStatement {
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
}

export interface TestCase {
  id: string;
  input: string;
  output: string;
  isHidden: boolean;
  explanation: string;
  weight: number;
}

export interface CustomChecker {
  enabled: boolean;
  language: string;
  code: string;
}

export interface SolutionExplanation {
  content: string;
  timeComplexity: string;
  spaceComplexity: string;
}

export interface SEOData {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  slug: string;
}

export interface AnalyticsData {
  expectedAcceptanceRate: number;
  avgRuntime: string;
  avgMemory: string;
  recommendedCompanies: string[];
  recommendedUniversities: string[];
}

export interface PublishingConfig {
  publishImmediately: boolean;
  saveAsDraft: boolean;
  scheduledDate: string;
  isArchived: boolean;
  isFeatured: boolean;
  contestOnly: boolean;
  practiceOnly: boolean;
}

export interface MCQOption {
  text: string;
  isCorrect: boolean;
  explanation: string;
}

export interface QuestionState {
  // State slices
  metadata: ProblemMetadata;
  languages: ProblemLanguages;
  execution: ExecutionConfig;
  statement: ProblemStatement;
  
  // MCQ specific
  mcqOptions: MCQOption[];
  
  // Code Output specific
  codeOutput: {
    language: string;
    code: string;
    expectedOutput: string;
  };

  starterCode: Record<string, string>;
  referenceSolution: Record<string, string>;
  hideMainMethod: boolean;
  testCases: TestCase[];
  customChecker: CustomChecker;
  solutionExplanation: SolutionExplanation;
  seo: SEOData;
  analytics: AnalyticsData;
  publishing: PublishingConfig;

  // UI State
  isDarkMode: boolean;
  lastSaved: string | null;
  activeSection: string;

  // Actions
  updateMetadata: (updates: Partial<ProblemMetadata>) => void;
  updateLanguages: (updates: Partial<ProblemLanguages>) => void;
  toggleLanguage: (langId: string) => void;
  setCompilerVersion: (langId: string, version: string) => void;
  updateExecution: (updates: Partial<ExecutionConfig>) => void;
  updateStatement: (updates: Partial<ProblemStatement>) => void;

  setStarterCode: (lang: string, code: string) => void;
  setReferenceSolution: (lang: string, code: string) => void;
  setHideMainMethod: (hide: boolean) => void;

  addTestCase: () => void;
  updateTestCase: (id: string, updates: Partial<TestCase>) => void;
  removeTestCase: (id: string) => void;

  updateCustomChecker: (updates: Partial<CustomChecker>) => void;
  updateSolutionExplanation: (updates: Partial<SolutionExplanation>) => void;
  updateSEO: (updates: Partial<SEOData>) => void;
  updateAnalytics: (updates: Partial<AnalyticsData>) => void;
  updatePublishing: (updates: Partial<PublishingConfig>) => void;

  updateMCQOptions: (options: MCQOption[]) => void;
  updateCodeOutput: (updates: Partial<{ language: string; code: string; expectedOutput: string }>) => void;
  
  setDarkMode: (dark: boolean) => void;
  setActiveSection: (section: string) => void;
  markSaved: () => void;
  getProgress: () => number;
  resetStore: () => void;
  setAllData: (
    data: Partial<QuestionState> & {
      /** Legacy: separate example list migrated into public test cases. */
      examples?: Array<{ input?: string; output?: string; explanation?: string }>;
      sampleExamples?: Array<{ input?: string; output?: string; explanation?: string }>;
    },
  ) => void;
}

/**
 * Accepts a per-language code map ({ python: "..." }), an array of
 * { language, code } / { language, sourceCode } entries (how the question bank
 * stores it), or undefined, and always returns a plain string map.
 */
function toCodeMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  if (Array.isArray(value)) {
    return value.reduce<Record<string, string>>((map, entry) => {
      const language = String(entry?.language ?? "").trim();
      const code = entry?.code ?? entry?.sourceCode;
      if (language && typeof code === "string") map[language] = code;
      return map;
    }, {});
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, code]) => key && typeof code === "string")
      .map(([key, code]) => [key, code as string]),
  );
}

const generateId = () => Math.random().toString(36).substring(2, 9);

/** Older questions stored examples separately from test cases; unify them as public test cases. */
function migrateExamplesIntoTestCases(
  testCases: TestCase[],
  examples: Array<{ input?: string; output?: string; explanation?: string }>,
): TestCase[] {
  const publicInputs = new Set(
    testCases.filter((tc) => !tc.isHidden).map((tc) => String(tc.input ?? "").trim()),
  );
  const migrated = (examples || [])
    .filter((ex) => String(ex?.input ?? "").trim() && !publicInputs.has(String(ex?.input ?? "").trim()))
    .map((ex) => ({
      id: generateId(),
      input: String(ex.input ?? "").trim(),
      output: ex.output || "",
      explanation: ex.explanation || "",
      isHidden: false,
      weight: 1,
    }));
  return [...testCases, ...migrated];
}

const initialState = {
  metadata: {
    title: '',
    slug: '',
    difficulty: 'Easy' as const,
    categories: [],
    tags: [],
    visibility: 'Draft' as const,
    author: '',
    questionId: `QID-${Date.now().toString(36).toUpperCase()}`,
    estimatedSolveTime: 30,
    points: 100,
    negativeMarks: 0,
    questionType: 'DSA' as const,
  },
  languages: {
    supported: ['javascript', 'python3', 'cpp', 'java'],
    compilerVersions: { ...DEFAULT_COMPILER_VERSIONS },
    default: 'python3',
  },
  execution: {
    timeLimit: 2000,
    memoryLimit: 256,
    stackSize: 8,
    outputLimit: 1,
    maxSourceCodeSize: 50,
    cpuLimit: 1,
    enableCustomInput: true,
    allowMultipleFiles: false,
    enableFileUpload: false,
  },
  statement: {
    description: '',
    inputFormat: '',
    outputFormat: '',
    constraints: '',
  },
  mcqOptions: [
    { text: '', isCorrect: true, explanation: '' },
    { text: '', isCorrect: false, explanation: '' },
    { text: '', isCorrect: false, explanation: '' },
    { text: '', isCorrect: false, explanation: '' },
  ],
  codeOutput: {
    language: 'javascript',
    code: '',
    expectedOutput: '',
  },
  starterCode: {},
  referenceSolution: {},
  hideMainMethod: false,
  testCases: [],
  customChecker: {
    enabled: false,
    language: 'cpp',
    code: '',
  },
  solutionExplanation: {
    content: '',
    timeComplexity: '',
    spaceComplexity: '',
  },
  seo: {
    metaTitle: '',
    metaDescription: '',
    keywords: [],
    slug: '',
  },
  analytics: {
    expectedAcceptanceRate: 50,
    avgRuntime: '',
    avgMemory: '',
    recommendedCompanies: [],
    recommendedUniversities: [],
  },
  publishing: {
    publishImmediately: false,
    saveAsDraft: true,
    scheduledDate: '',
    isArchived: false,
    isFeatured: false,
    contestOnly: false,
    practiceOnly: false,
  },
  isDarkMode: false,
  lastSaved: null,
  activeSection: 'basic-info',
};

export function normalizeTrueFalseOptions(existing?: any[], correctAnswer?: number): MCQOption[] {
  let isFalse = false;
  if (correctAnswer === 1) {
    isFalse = true;
  } else if (Array.isArray(existing) && existing.length > 0) {
    const falseIndex = existing.findIndex(
      (o: any) => (typeof o === 'string' ? o : o?.text || '').trim().toLowerCase() === 'false'
    );
    if (falseIndex >= 0) {
      if (typeof existing[falseIndex] === 'object' && existing[falseIndex]?.isCorrect) {
        isFalse = true;
      } else if (correctAnswer === falseIndex) {
        isFalse = true;
      }
    } else if (existing.length >= 2 && existing[1]?.isCorrect && !existing[0]?.isCorrect) {
      isFalse = true;
    }
  }

  let trueExp = '';
  let falseExp = '';
  if (Array.isArray(existing)) {
    existing.forEach((o, i) => {
      if (typeof o === 'object') {
        const text = (o?.text || '').toLowerCase();
        if (text === 'true' || i === 0) trueExp = o?.explanation || trueExp;
        if (text === 'false' || i === 1) falseExp = o?.explanation || falseExp;
      }
    });
  }

  return [
    { text: 'True', isCorrect: !isFalse, explanation: trueExp },
    { text: 'False', isCorrect: isFalse, explanation: falseExp },
  ];
}

export const createQuestionStore = () => create<QuestionState>((set, get) => ({
  ...initialState,

  updateMetadata: (updates) =>
    set((s) => {
      let newMcqOptions = s.mcqOptions;
      if (updates.questionType && updates.questionType !== s.metadata.questionType) {
        if (updates.questionType === 'TRUE_FALSE') {
          newMcqOptions = normalizeTrueFalseOptions(s.mcqOptions);
        } else if (s.metadata.questionType === 'TRUE_FALSE' && ['MCQ', 'MULTIPLE_CHOICE'].includes(updates.questionType)) {
          if (s.mcqOptions.length < 4) {
            newMcqOptions = [
              { text: '', isCorrect: true, explanation: '' },
              { text: '', isCorrect: false, explanation: '' },
              { text: '', isCorrect: false, explanation: '' },
              { text: '', isCorrect: false, explanation: '' },
            ];
          }
        }
      }

      return {
        metadata: { ...s.metadata, ...updates },
        mcqOptions: newMcqOptions,
        seo: {
          ...s.seo,
          slug: updates.slug ?? s.seo.slug,
          metaTitle: updates.title && !s.seo.metaTitle ? updates.title : s.seo.metaTitle,
        },
      };
    }),

  updateLanguages: (updates) =>
    set((s) => ({ languages: { ...s.languages, ...updates } })),

  toggleLanguage: (langId) =>
    set((s) => {
      const supported = s.languages.supported.includes(langId)
        ? s.languages.supported.filter((l) => l !== langId)
        : [...s.languages.supported, langId];
      return { languages: { ...s.languages, supported } };
    }),

  setCompilerVersion: (langId, version) =>
    set((s) => ({
      languages: {
        ...s.languages,
        compilerVersions: { ...s.languages.compilerVersions, [langId]: version },
      },
    })),

  updateExecution: (updates) =>
    set((s) => ({ execution: { ...s.execution, ...updates } })),

  updateStatement: (updates) =>
    set((s) => ({ statement: { ...s.statement, ...updates } })),

  setStarterCode: (lang, code) =>
    set((s) => ({ starterCode: { ...s.starterCode, [lang]: code } })),

  setReferenceSolution: (lang, code) =>
    set((s) => ({ referenceSolution: { ...s.referenceSolution, [lang]: code } })),

  setHideMainMethod: (hide) => set({ hideMainMethod: hide }),

  addTestCase: () =>
    set((s) => ({
      testCases: [
        ...s.testCases,
        { id: generateId(), input: '', output: '', isHidden: false, explanation: '', weight: 1 },
      ],
    })),

  updateTestCase: (id, updates) =>
    set((s) => ({
      testCases: s.testCases.map((tc) => (tc.id === id ? { ...tc, ...updates } : tc)),
    })),

  removeTestCase: (id) =>
    set((s) => ({ testCases: s.testCases.filter((tc) => tc.id !== id) })),

  updateCustomChecker: (updates) =>
    set((s) => ({ customChecker: { ...s.customChecker, ...updates } })),

  updateSolutionExplanation: (updates) =>
    set((s) => ({ solutionExplanation: { ...s.solutionExplanation, ...updates } })),

  updateSEO: (updates) =>
    set((s) => ({ seo: { ...s.seo, ...updates } })),

  updateAnalytics: (updates) =>
    set((s) => ({ analytics: { ...s.analytics, ...updates } })),

  updatePublishing: (updates) =>
    set((s) => ({ publishing: { ...s.publishing, ...updates } })),

  updateMCQOptions: (options) =>
    set((s) => {
      if (s.metadata.questionType === 'TRUE_FALSE') {
        return { mcqOptions: normalizeTrueFalseOptions(options) };
      }
      return { mcqOptions: options };
    }),
  updateCodeOutput: (updates) => set((s) => ({ codeOutput: { ...s.codeOutput, ...updates } })),

  setDarkMode: (dark) => set({ isDarkMode: dark }),
  setActiveSection: (section) => set({ activeSection: section }),
  markSaved: () => set({ lastSaved: new Date().toISOString() }),

  getProgress: () => {
    const s = get();
    let filled = 0;
    let total = 0;

    // Basic Info (5 required fields)
    total += 5;
    if (s.metadata.title.trim()) filled++;
    if (s.metadata.slug.trim()) filled++;
    if (s.metadata.difficulty) filled++;
    if (s.metadata.categories.length > 0) filled++;
    if (s.metadata.points > 0) filled++;

    // Languages
    total += 1;
    if (s.languages.supported.length > 0) filled++;

    // Execution
    total += 2;
    if (s.execution.timeLimit > 0) filled++;
    if (s.execution.memoryLimit > 0) filled++;

    // Statement
    total += 1;
    if (s.statement.description.trim().length > 10) filled++;

    // Constraints
    total += 1;
    if (s.statement.constraints.trim().length > 0) filled++;

    // I/O Format
    total += 2;
    if (s.statement.inputFormat.trim().length > 0) filled++;
    if (s.statement.outputFormat.trim().length > 0) filled++;

    // Samples (public test cases are shown to candidates as examples)
    total += 1;
    if (s.testCases.some((tc) => !tc.isHidden)) filled++;

    // Starter Code
    total += 1;
    if (Object.values(s.starterCode).some((c) => String(c).trim())) filled++;

    // Reference Solution
    total += 1;
    if (Object.values(s.referenceSolution).some((c) => String(c).trim())) filled++;

    // Test Cases
    total += 1;
    if (s.testCases.length > 0) filled++;

    // SEO
    total += 1;
    if (s.seo.metaTitle.trim()) filled++;

    return Math.round((filled / total) * 100);
  },

  resetStore: () => set({ ...initialState, metadata: { ...initialState.metadata, questionId: `QID-${Date.now().toString(36).toUpperCase()}` } }),
  setAllData: (data) => set((state) => {
    const rawQType = data.metadata?.questionType || (data as any).questionType || state.metadata.questionType;
    const isTF = rawQType === 'TRUE_FALSE' || rawQType === 'true_false';

    let nextMcqOptions = state.mcqOptions;
    if (isTF) {
      nextMcqOptions = normalizeTrueFalseOptions(
        data.mcqOptions || (data as any).options,
        (data as any).correctAnswer !== undefined ? (data as any).correctAnswer : (data.mcqOptions?.findIndex((o: any) => o.isCorrect))
      );
    } else if (data.mcqOptions) {
      nextMcqOptions = data.mcqOptions;
    } else if (Array.isArray((data as any).options) && (data as any).options.length > 0) {
      const opts = (data as any).options;
      const cAns = (data as any).correctAnswer ?? 0;
      const cAnss = (data as any).correctAnswers || [cAns];
      nextMcqOptions = opts.map((opt: any, i: number) => ({
        text: typeof opt === 'string' ? opt : opt.text || '',
        isCorrect: typeof opt === 'object' && opt.isCorrect !== undefined ? opt.isCorrect : cAnss.includes(i),
        explanation: typeof opt === 'object' ? opt.explanation || '' : '',
      }));
    }

    return {
      metadata: { ...state.metadata, ...data.metadata, questionType: normalizeQuestionType(rawQType, state.metadata.questionType) },
      languages: { ...state.languages, ...data.languages },
      execution: { ...state.execution, ...data.execution },
      statement: {
        ...state.statement,
        ...data.statement,
        constraints: Array.isArray(data.statement?.constraints)
          ? data.statement.constraints.join("\n")
          : typeof data.statement?.constraints === "string"
          ? data.statement.constraints
          : state.statement.constraints,
      },
      mcqOptions: nextMcqOptions,
      starterCode: { ...state.starterCode, ...toCodeMap(data.starterCode) },
      referenceSolution: { ...state.referenceSolution, ...toCodeMap(data.referenceSolution) },
      hideMainMethod: (data as any).hideMainMethod !== undefined ? Boolean((data as any).hideMainMethod) : state.hideMainMethod,
      testCases: migrateExamplesIntoTestCases(
        data.testCases || state.testCases,
        data.examples || data.sampleExamples || [],
      ),
      customChecker: { ...state.customChecker, ...data.customChecker },
      solutionExplanation: { ...state.solutionExplanation, ...data.solutionExplanation },
      seo: { ...state.seo, ...data.seo },
      analytics: { ...state.analytics, ...data.analytics },
      publishing: { ...state.publishing, ...data.publishing }
    };
  }),
}));

export const useQuestionStore = createQuestionStore();
