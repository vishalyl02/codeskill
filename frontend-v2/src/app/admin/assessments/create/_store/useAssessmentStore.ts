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

export type ProctoringSettings = {
  enforceFullscreen: boolean;
  blockCopyPaste: boolean;
  detectTabSwitch: boolean;
  maxTabSwitches: number;
  autoSubmitOnViolation: boolean;
};

interface AssessmentStore {
  title: string;
  code: string;
  description: string;
  instructions: string[];
  durationMinutes: number;
  passingMarks: number | '';
  negativeMarking: boolean;
  category: string;
  allowedAttempts: number;
  proctoring: ProctoringSettings;
  sections: AssessmentSection[];
  status: 'draft' | 'published';

  setTitle: (title: string) => void;
  setCode: (code: string) => void;
  setDescription: (desc: string) => void;
  setDurationMinutes: (dur: number) => void;
  setPassingMarks: (marks: number | '') => void;
  setCategory: (cat: string) => void;
  setAllowedAttempts: (attempts: number) => void;
  setProctoring: (proctoring: Partial<ProctoringSettings>) => void;
  setStatus: (status: 'draft' | 'published') => void;
  hydrate: (values: Partial<Pick<AssessmentStore, 'title' | 'code' | 'description' | 'instructions' | 'durationMinutes' | 'passingMarks' | 'negativeMarking' | 'category' | 'allowedAttempts' | 'proctoring' | 'sections' | 'status'>>) => void;
  reset: () => void;

  addSection: () => void;
  updateSection: (id: string, updates: Partial<AssessmentSection>) => void;
  removeSection: (id: string) => void;
  
  addQuestionToSection: (sectionId: string, q: AssessmentQuestionConfig) => void;
  removeQuestionFromSection: (sectionId: string, questionId: string) => void;
  updateQuestionConfig: (sectionId: string, questionId: string, config: Partial<AssessmentQuestionConfig>) => void;
}

const defaultProctoring: ProctoringSettings = {
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
  passingMarks: '',
  negativeMarking: true,
  category: 'exam',
  allowedAttempts: 1,
  proctoring: defaultProctoring,
  sections: [{ id: 'sec-1', title: 'Section A', description: '', order: 0, timeLimit: 0, questions: [] }],
  status: 'draft',

  setTitle: (title) => set({ title }),
  setCode: (code) => set({ code }),
  setDescription: (description) => set({ description }),
  setDurationMinutes: (durationMinutes) => set({ durationMinutes }),
  setPassingMarks: (passingMarks) => set({ passingMarks }),
  setCategory: (category) => set({ category }),
  setAllowedAttempts: (allowedAttempts) => set({ allowedAttempts }),
  setProctoring: (proctoring) => set((state) => ({ proctoring: { ...state.proctoring, ...proctoring } })),
  setStatus: (status) => set({ status }),
  hydrate: (values) => set((state) => ({ ...state, ...values, proctoring: { ...defaultProctoring, ...values.proctoring } })),
  reset: () => set({
    title: '', code: `EXAM-${Date.now().toString().slice(-4)}`, description: '',
    instructions: [
      'Ensure a stable internet connection throughout the test duration.',
      'Fullscreen mode is strictly enforced. Leaving fullscreen or switching tabs will be recorded.',
      'Negative marking applies for incorrect answers where specified.',
      'The assessment will automatically submit when the countdown reaches zero.',
    ],
    durationMinutes: 60, passingMarks: '', negativeMarking: true, category: 'exam',
    allowedAttempts: 1, proctoring: { ...defaultProctoring },
    sections: [{ id: 'sec-1', title: 'Section A', description: '', order: 0, timeLimit: 0, questions: [] }], status: 'draft',
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
