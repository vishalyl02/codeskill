import { create } from 'zustand';

export type AssessmentQuestionConfig = {
  questionId: string;
  marks: number;
  negativeMarks: number;
  order: number;
  // UI only fields for rendering
  topic?: string;
  difficulty?: string;
  questionText?: string;
  questionType?: string;
};

export type AssessmentSection = {
  id: string;
  title: string;
  description: string;
  order: number;
  timeLimit: number;
  questions: AssessmentQuestionConfig[];
};

export type ProctoringMode = 'fully_proctored' | 'partial_proctored' | 'non_proctored';

export type ProctoringSettings = {
  mode: ProctoringMode;
  cameraSelectionPolicy: 'system_default' | 'student_select';
  violationPenaltyMarks: number;
  useCamera: boolean;
  enforceFullscreen: boolean;
  blockCopyPaste: boolean;
  detectTabSwitch: boolean;
  maxTabSwitches: number;
  autoSubmitOnViolation: boolean;
};

export type ResultDisplaySettings = {
  showScore: boolean;
  showQuestionReview: boolean;
  showCorrectAnswers: boolean;
  showRankAndPercentile: boolean;
  showTopicBreakdown: boolean;
  customSubmissionMessage?: string;
};

interface AssessmentStore {
  title: string;
  code: string;
  description: string;
  instructions: string[];
  durationMinutes: number;
  questionTimeLimitSeconds: number;
  passingMarks: number | '';
  negativeMarking: boolean;
  category: string;
  allowedAttempts: number;
  proctoring: ProctoringSettings;
  sections: AssessmentSection[];
  status: 'draft' | 'published';
  targetStudentIds: string[];
  lockSectionsSequentially: boolean;
  requireLockdown: boolean;
  allowVirtualMachine: boolean;
  lockdownQuitPassword: string;
  allowCalculators: boolean;
  allowScratchpad: boolean;
  allowReferenceDoc: boolean;
  referencePdfUrl: string;
  requireCloseOtherApps: boolean;
  allowSpellCheck: boolean;
  allowFindOnPage: boolean;
  allowedUrlPatterns: string[];
  enableScreenCaptureSnapshots: boolean;
  enableForensicWatermark: boolean;
  showResultImmediately: boolean;
  allowReview: boolean;
  resultDisplaySettings: ResultDisplaySettings;

  setTitle: (title: string) => void;
  setCode: (code: string) => void;
  setDescription: (desc: string) => void;
  setDurationMinutes: (dur: number) => void;
  setQuestionTimeLimitSeconds: (seconds: number) => void;
  setPassingMarks: (marks: number | '') => void;
  setCategory: (cat: string) => void;
  setAllowedAttempts: (attempts: number) => void;
  setProctoring: (proctoring: Partial<ProctoringSettings>) => void;
  setStatus: (status: 'draft' | 'published') => void;
  setTargetStudentIds: (ids: string[]) => void;
  setLockSectionsSequentially: (lock: boolean) => void;
  setRequireLockdown: (require: boolean) => void;
  setAllowVirtualMachine: (allow: boolean) => void;
  setLockdownQuitPassword: (pwd: string) => void;
  setAllowCalculators: (allow: boolean) => void;
  setAllowScratchpad: (allow: boolean) => void;
  setAllowReferenceDoc: (allow: boolean) => void;
  setReferencePdfUrl: (url: string) => void;
  setRequireCloseOtherApps: (require: boolean) => void;
  setAllowSpellCheck: (allow: boolean) => void;
  setAllowFindOnPage: (allow: boolean) => void;
  setAllowedUrlPatterns: (patterns: string[]) => void;
  setEnableScreenCaptureSnapshots: (enable: boolean) => void;
  setEnableForensicWatermark: (enable: boolean) => void;
  setShowResultImmediately: (show: boolean) => void;
  setAllowReview: (allow: boolean) => void;
  setResultDisplaySettings: (settings: Partial<ResultDisplaySettings>) => void;
  hydrate: (assessment: any) => void;
  reset: () => void;

  addSection: () => void;
  updateSection: (id: string, updates: Partial<AssessmentSection>) => void;
  removeSection: (id: string) => void;
  
  addQuestionToSection: (sectionId: string, q: AssessmentQuestionConfig) => void;
  removeQuestionFromSection: (sectionId: string, questionId: string) => void;
  updateQuestionConfig: (sectionId: string, questionId: string, config: Partial<AssessmentQuestionConfig>) => void;
}

const defaultResultDisplay: ResultDisplaySettings = {
  showScore: true,
  showQuestionReview: true,
  showCorrectAnswers: false,
  showRankAndPercentile: true,
  showTopicBreakdown: true,
  customSubmissionMessage: '',
};

const defaultProctoring: ProctoringSettings = {
  mode: 'fully_proctored',
  cameraSelectionPolicy: 'student_select',
  violationPenaltyMarks: 2,
  useCamera: true,
  enforceFullscreen: true,
  blockCopyPaste: true,
  detectTabSwitch: true,
  maxTabSwitches: 3,
  autoSubmitOnViolation: true,
};

export const useAssessmentStore = create<AssessmentStore>((set) => ({
  title: '',
  code: `EXAM-${Date.now().toString().slice(-4)}`,
  description: '',
  instructions: [
    'Ensure a stable internet connection throughout the test duration.',
    'Fullscreen mode is strictly enforced. Leaving fullscreen or switching tabs will be recorded.',
    'Negative marking applies for incorrect answers where specified.',
    'The assessment will automatically submit when the countdown reaches zero.',
  ],
  durationMinutes: 60,
  questionTimeLimitSeconds: 0,
  passingMarks: '',
  negativeMarking: true,
  category: 'exam',
  allowedAttempts: 1,
  proctoring: defaultProctoring,
  sections: [{ id: 'sec-1', title: 'Section A', description: '', order: 0, timeLimit: 0, questions: [] }],
  status: 'draft',
  targetStudentIds: [],
  lockSectionsSequentially: false,
  requireLockdown: false,
  allowVirtualMachine: false,
  lockdownQuitPassword: '',
  allowCalculators: false,
  allowScratchpad: true,
  allowReferenceDoc: false,
  referencePdfUrl: '',
  requireCloseOtherApps: true,
  allowSpellCheck: false,
  allowFindOnPage: true,
  allowedUrlPatterns: [],
  enableScreenCaptureSnapshots: false,
  enableForensicWatermark: false,
  showResultImmediately: true,
  allowReview: true,
  resultDisplaySettings: defaultResultDisplay,

  setTitle: (title) => set({ title }),
  setCode: (code) => set({ code }),
  setDescription: (description) => set({ description }),
  setDurationMinutes: (durationMinutes) => set({ durationMinutes }),
  setQuestionTimeLimitSeconds: (questionTimeLimitSeconds) => set({ questionTimeLimitSeconds }),
  setPassingMarks: (passingMarks) => set({ passingMarks }),
  setCategory: (category) => set({ category }),
  setAllowedAttempts: (allowedAttempts) => set({ allowedAttempts }),
  setProctoring: (proctoring) => set((state) => ({ proctoring: { ...state.proctoring, ...proctoring } })),
  setStatus: (status) => set({ status }),
  setTargetStudentIds: (targetStudentIds) => set({ targetStudentIds }),
  setLockSectionsSequentially: (lockSectionsSequentially) => set({ lockSectionsSequentially }),
  setRequireLockdown: (requireLockdown) =>
    set((state) => ({
      requireLockdown,
      allowVirtualMachine: requireLockdown ? state.allowVirtualMachine : false,
      enableForensicWatermark: requireLockdown ? state.enableForensicWatermark : false,
    })),
  setAllowVirtualMachine: (allowVirtualMachine) => set({ allowVirtualMachine }),
  setLockdownQuitPassword: (lockdownQuitPassword) => set({ lockdownQuitPassword }),
  setAllowCalculators: (allowCalculators) => set({ allowCalculators }),
  setAllowScratchpad: (allowScratchpad) => set({ allowScratchpad }),
  setAllowReferenceDoc: (allowReferenceDoc) => set({ allowReferenceDoc }),
  setReferencePdfUrl: (referencePdfUrl) => set({ referencePdfUrl }),
  setRequireCloseOtherApps: (requireCloseOtherApps) => set({ requireCloseOtherApps }),
  setAllowSpellCheck: (allowSpellCheck) => set({ allowSpellCheck }),
  setAllowFindOnPage: (allowFindOnPage) => set({ allowFindOnPage }),
  setAllowedUrlPatterns: (allowedUrlPatterns) => set({ allowedUrlPatterns }),
  setEnableScreenCaptureSnapshots: (enableScreenCaptureSnapshots) => set({ enableScreenCaptureSnapshots }),
  setEnableForensicWatermark: (enableForensicWatermark) => set({ enableForensicWatermark }),
  setShowResultImmediately: (showResultImmediately) => set({ showResultImmediately }),
  setAllowReview: (allowReview) => set({ allowReview }),
  setResultDisplaySettings: (settings) =>
    set((state) => ({
      resultDisplaySettings: { ...state.resultDisplaySettings, ...settings },
    })),
  hydrate: (assessment) => set((state) => {
    const incoming = assessment.proctoring || {};
    const mode: ProctoringMode =
      incoming.mode ||
      (incoming.autoSubmitOnViolation === false
        ? incoming.useCamera === false && incoming.detectTabSwitch === false
          ? 'non_proctored'
          : 'partial_proctored'
        : 'fully_proctored');

    return {
      ...assessment,
      targetStudentIds: assessment.targetStudentIds || [],
      lockSectionsSequentially: assessment.lockSectionsSequentially ?? false,
      questionTimeLimitSeconds: Number(assessment.questionTimeLimitSeconds || 0),
      requireLockdown: Boolean(assessment.requireLockdown ?? assessment.securityPolicy?.requireSEB),
      allowVirtualMachine: Boolean(assessment.allowVirtualMachine),
      lockdownQuitPassword: assessment.lockdownQuitPassword || assessment.securityPolicy?.lockdownQuitPassword || '',
      allowCalculators: Boolean(assessment.allowCalculators ?? assessment.securityPolicy?.allowCalculators),
      allowScratchpad: assessment.allowScratchpad ?? assessment.securityPolicy?.allowScratchpad ?? true,
      allowReferenceDoc: Boolean(assessment.allowReferenceDoc ?? assessment.securityPolicy?.allowReferenceDoc),
      referencePdfUrl: assessment.referencePdfUrl || assessment.securityPolicy?.referencePdfUrl || '',
      requireCloseOtherApps: assessment.requireCloseOtherApps ?? assessment.securityPolicy?.requireCloseOtherApps ?? true,
      allowSpellCheck: assessment.allowSpellCheck ?? assessment.securityPolicy?.allowSpellCheck ?? false,
      allowFindOnPage: assessment.allowFindOnPage ?? assessment.securityPolicy?.allowFindOnPage ?? true,
      allowedUrlPatterns: assessment.allowedUrlPatterns ?? assessment.securityPolicy?.allowedUrlPatterns ?? [],
      enableScreenCaptureSnapshots: assessment.enableScreenCaptureSnapshots ?? assessment.securityPolicy?.enableScreenCaptureSnapshots ?? false,
      enableForensicWatermark: Boolean(assessment.enableForensicWatermark ?? assessment.securityPolicy?.enableForensicWatermark),
      showResultImmediately: assessment.showResultImmediately ?? true,
      allowReview: assessment.allowReview ?? true,
      resultDisplaySettings: {
        ...defaultResultDisplay,
        ...(assessment.resultDisplaySettings || {}),
      },
      proctoring: {
        ...defaultProctoring,
        ...incoming,
        mode,
        violationPenaltyMarks:
          incoming.violationPenaltyMarks !== undefined
            ? Number(incoming.violationPenaltyMarks)
            : defaultProctoring.violationPenaltyMarks,
      },
      sections: assessment.sections ?? state.sections,
    };
  }),
  reset: () => set({
    title: '',
    code: `EXAM-${Date.now().toString().slice(-4)}`,
    description: '',
    instructions: [
      'Ensure a stable internet connection throughout the test duration.',
      'Fullscreen mode is strictly enforced. Leaving fullscreen or switching tabs will be recorded.',
      'Negative marking applies for incorrect answers where specified.',
      'The assessment will automatically submit when the countdown reaches zero.',
    ],
    durationMinutes: 60,
    questionTimeLimitSeconds: 0,
    passingMarks: '',
    negativeMarking: true,
    category: 'exam',
    allowedAttempts: 1,
    proctoring: defaultProctoring,
    sections: [{ id: 'sec-1', title: 'Section A', description: '', order: 0, timeLimit: 0, questions: [] }],
    status: 'draft',
    targetStudentIds: [],
    lockSectionsSequentially: false,
    requireLockdown: false,
    allowVirtualMachine: false,
    lockdownQuitPassword: '',
    allowCalculators: false,
    allowScratchpad: true,
    allowReferenceDoc: false,
    referencePdfUrl: '',
    requireCloseOtherApps: true,
    allowSpellCheck: false,
    allowFindOnPage: true,
    allowedUrlPatterns: [],
    enableScreenCaptureSnapshots: false,
    enableForensicWatermark: false,
    showResultImmediately: true,
    allowReview: true,
    resultDisplaySettings: defaultResultDisplay,
  }),

  addSection: () => set((state) => ({
    sections: [...state.sections, {
      id: `sec-${Date.now()}`,
      title: `Section ${String.fromCharCode(65 + state.sections.length)}`,
      description: '',
      order: state.sections.length,
      timeLimit: 0,
      questions: []
    }]
  })),

  updateSection: (id, updates) => set((state) => ({
    sections: state.sections.map(s => s.id === id ? { ...s, ...updates } : s)
  })),

  removeSection: (id) => set((state) => ({
    sections: state.sections.filter(s => s.id !== id)
  })),

  addQuestionToSection: (sectionId, q) => set((state) => ({
    sections: state.sections.map(s => {
      if (s.id === sectionId) {
        if (s.questions.some(sq => sq.questionId === q.questionId)) return s;
        return { ...s, questions: [...s.questions, q] };
      }
      return s;
    })
  })),

  removeQuestionFromSection: (sectionId, questionId) => set((state) => ({
    sections: state.sections.map(s => {
      if (s.id === sectionId) {
        return { ...s, questions: s.questions.filter(q => q.questionId !== questionId) };
      }
      return s;
    })
  })),

  updateQuestionConfig: (sectionId, questionId, config) => set((state) => ({
    sections: state.sections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          questions: s.questions.map(q => q.questionId === questionId ? { ...q, ...config } : q)
        };
      }
      return s;
    })
  })),
}));
