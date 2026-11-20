"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminAssessmentsAPI, adminQuestionsAPI, adminUsersAPI } from "@/config/api";
import { useAssessmentStore, type ProctoringSettings } from "./_store/useAssessmentStore";
import QuestionPicker from "./_components/QuestionPicker";
import {
  ArrowLeft, CheckCircle2, Clock, Plus, Trash2, Shield, ShieldAlert,
  ShieldOff, AlertTriangle, GripVertical, Settings, Save, Sparkles, X, GraduationCap,
  Lock, Search, UserCheck, Eye, EyeOff, Laptop, Monitor, KeyRound, Calculator, BookOpen, FileText,
  ShieldCheck, Globe, Camera, Fingerprint
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ToastProvider, useToast } from "../../questions/create/_components/Toast"; // Reuse toast
import { formatAssessmentDateTime, formatScheduleDuration, getAssessmentScheduleState } from "@/lib/assessment-schedule";

type StudentCohort = { semester: string; section: string };
type AutoSelectionCriteria = {
  topic: string;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
};
type AssessmentApiQuestion = {
  id?: string;
  _id?: string;
  question?: string;
  questionText?: string;
  questionType?: string;
  topic?: string;
  difficulty?: string;
  marks?: number;
  negativeMarks?: number;
};
type AssessmentApiQuestionConfig = AssessmentApiQuestion & {
  questionId?: string | AssessmentApiQuestion;
  order?: number;
};
type AssessmentApiSection = {
  title?: string;
  description?: string;
  order?: number;
  timeLimit?: number;
  autoSelection?: AutoSelectionCriteria;
  questions?: AssessmentApiQuestionConfig[];
};
type AssessmentApiData = {
  sections?: AssessmentApiSection[];
  questions?: Array<AssessmentApiQuestion | string>;
  title?: string;
  code?: string;
  description?: string;
  instructions?: string[];
  durationMinutes?: number;
  passingMarks?: number | null;
  negativeMarking?: boolean;
  category?: string;
  allowedAttempts?: number;
  proctoring?: Partial<ProctoringSettings>;
  status?: string;
  targetSemesters?: string[];
  targetSections?: string[];
  targetGroups?: string[];
  targetStudentIds?: string[];
  lockSectionsSequentially?: boolean;
  requireLockdown?: boolean;
  allowVirtualMachine?: boolean;
  requireCloseOtherApps?: boolean;
  allowSpellCheck?: boolean;
  allowFindOnPage?: boolean;
  allowedUrlPatterns?: string[];
  enableScreenCaptureSnapshots?: boolean;
  enableForensicWatermark?: boolean;
  securityPolicy?: any;
  showResultImmediately?: boolean;
  allowReview?: boolean;
  resultDisplaySettings?: any;
  startTime?: string | Date | null;
  endTime?: string | Date | null;
};

import { MultiSelectDropdown } from "@/components/ui/MultiSelectDropdown";
import { getStandardizedSectionOptions } from "@/lib/sections";

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function toDateTimeLocal(value?: string | Date | null) {
  if (!value) return "";
  const date = dayjs(value);
  return date.isValid() ? date.format("YYYY-MM-DDTHH:mm") : "";
}

export default function AssessmentBuilderWrapper() {
  return (
    <ToastProvider>
      <AssessmentBuilder />
    </ToastProvider>
  )
}

function AssessmentBuilder() {
  const router = useRouter();
  const store = useAssessmentStore();
  const { addToast } = useToast();

  const [activePicker, setActivePicker] = useState<string | null>(null);
  const [autoGenerateSectionId, setAutoGenerateSectionId] = useState<string | null>(null);
  const [autoSelections, setAutoSelections] = useState<Record<string, AutoSelectionCriteria>>({});
  const [isPublishing, setIsPublishing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
  const [selectedStudentsList, setSelectedStudentsList] = useState<any[]>([]);
  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [studentSearchResults, setStudentSearchResults] = useState<any[]>([]);
  const [isSearchingStudents, setIsSearchingStudents] = useState(false);
  const [audiencePreview, setAudiencePreview] = useState<{
    totalCount: number;
    accessMode: "open_access" | "specific_only" | "cohort_only" | "combined";
    sampleStudents: any[];
  } | null>(null);
  const [showSampleDrawer, setShowSampleDrawer] = useState(false);
  const [dynamicYears, setDynamicYears] = useState<string[]>(["1", "2", "3", "4"]);
  const [dynamicSemesters, setDynamicSemesters] = useState<string[]>(["1", "2", "3", "4", "5", "6", "7", "8"]);
  const [dynamicSections, setDynamicSections] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [targetSemesters, setTargetSemesters] = useState<string[]>([]);
  const [targetSections, setTargetSections] = useState<string[]>([]);
  const [targetGroup, setTargetGroup] = useState<"" | "a" | "b" | "both">("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [durationUnit, setDurationUnit] = useState<"minutes" | "hours">("minutes");
  const [previewNow, setPreviewNow] = useState(() => Date.now());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formReady, setFormReady] = useState(false);

  useEffect(() => {
    let active = true;
    const assessmentId = new URLSearchParams(window.location.search).get("id");
    const hydrateForm = async () => {
      try {
        if (!assessmentId) {
          useAssessmentStore.getState().reset();
          await Promise.resolve();
          if (active) setFormReady(true);
          return;
        }

        const response = await adminAssessmentsAPI.getById(assessmentId);
        const assessment = response.data?.assessment as AssessmentApiData | undefined;
        if (!assessment) throw new Error("Assessment details were not returned by the server.");
        const sections = (assessment.sections || []).map((section, sectionIndex) => ({
          id: `section-${sectionIndex}`,
          title: section.title || `Section ${String.fromCharCode(65 + sectionIndex)}`,
          description: section.description || "",
          order: Number(section.order) || 0,
          timeLimit: Number(section.timeLimit) || 0,
          autoSelection: section.autoSelection,
          questions: (section.questions || []).map((entry, questionIndex) => {
            const question = entry.questionId && typeof entry.questionId === "object" ? entry.questionId : undefined;
            const questionId = question?._id || question?.id || entry.questionId;
            return {
              questionId: String(questionId),
              marks: Number(entry.marks ?? question?.marks ?? 1),
              negativeMarks: Number(entry.negativeMarks ?? question?.negativeMarks ?? 0),
              order: Number(entry.order ?? questionIndex),
              topic: question?.topic,
              difficulty: question?.difficulty,
              questionText: question?.question || question?.questionText || "Question details unavailable",
              questionType: question?.questionType || "",
            };
          }),
        }));
        if (sections.length === 0 && Array.isArray(assessment.questions) && assessment.questions.length > 0) {
          sections.push({
            id: "section-0",
            title: "Section A",
            description: "",
            order: 0,
            timeLimit: 0,
            autoSelection: undefined,
            questions: assessment.questions.map((entry, questionIndex) => {
              const question = entry && typeof entry === "object" ? entry : undefined;
              const questionId = question?._id || question?.id || entry;
              return {
                questionId: String(questionId),
                marks: Number(question?.marks ?? 1),
                negativeMarks: Number(question?.negativeMarks ?? 0),
                order: questionIndex,
                topic: question?.topic,
                difficulty: question?.difficulty,
                questionText: question?.question || question?.questionText || "Question details unavailable",
                questionType: question?.questionType || "",
              };
            }),
          });
        }

        useAssessmentStore.getState().hydrate({
          title: assessment.title || "",
          code: assessment.code || "",
          description: assessment.description || "",
          instructions: Array.isArray(assessment.instructions) ? assessment.instructions : [],
          durationMinutes: Number(assessment.durationMinutes ?? 60),
          passingMarks: assessment.passingMarks == null ? "" : Number(assessment.passingMarks),
          negativeMarking: assessment.negativeMarking ?? true,
          category: assessment.category || "exam",
          allowedAttempts: Number(assessment.allowedAttempts ?? 1),
          proctoring: assessment.proctoring || {},
          sections,
          status: assessment.status === "published" ? "published" : "draft",
          targetStudentIds: Array.isArray(assessment.targetStudentIds) ? assessment.targetStudentIds : [],
          lockSectionsSequentially: Boolean(assessment.lockSectionsSequentially),
          requireLockdown: Boolean(assessment.requireLockdown ?? assessment.securityPolicy?.requireSEB),
          allowVirtualMachine: Boolean(assessment.allowVirtualMachine),
          requireCloseOtherApps: assessment.requireCloseOtherApps ?? assessment.securityPolicy?.requireCloseOtherApps ?? true,
          allowSpellCheck: assessment.allowSpellCheck ?? assessment.securityPolicy?.allowSpellCheck ?? false,
          allowFindOnPage: assessment.allowFindOnPage ?? assessment.securityPolicy?.allowFindOnPage ?? true,
          allowedUrlPatterns: assessment.allowedUrlPatterns ?? assessment.securityPolicy?.allowedUrlPatterns ?? [],
          enableScreenCaptureSnapshots: assessment.enableScreenCaptureSnapshots ?? assessment.securityPolicy?.enableScreenCaptureSnapshots ?? false,
          enableForensicWatermark: Boolean(assessment.enableForensicWatermark ?? assessment.securityPolicy?.enableForensicWatermark),
          showResultImmediately: assessment.showResultImmediately !== false,
          allowReview: assessment.allowReview !== false,
          resultDisplaySettings: assessment.resultDisplaySettings || {},
        });

        const semesters = Array.isArray(assessment.targetSemesters) ? assessment.targetSemesters.map(String) : [];
        setAutoSelections(Object.fromEntries(sections
          .filter((section) => section.autoSelection)
          .map((section) => [section.id, section.autoSelection as AutoSelectionCriteria])));
        setEditingId(assessmentId);
        setTargetSemesters(semesters);
        setSelectedYears(Array.from(new Set(semesters.map((semester: string) => String(Math.ceil(Number(semester) / 2))))));
        setTargetSections(Array.isArray(assessment.targetSections) ? assessment.targetSections : []);
        if (Array.isArray(assessment.targetStudentIds) && assessment.targetStudentIds.length) {
          setTargetStudentIds(assessment.targetStudentIds);
        }
        const groups = (assessment.targetGroups || []).map((group: string) => String(group).toLowerCase());
        setTargetGroup(groups.length > 1 ? "both" : groups[0] === "a" || groups[0] === "b" ? groups[0] : "");
        setStartTime(toDateTimeLocal(assessment.startTime));
        setEndTime(toDateTimeLocal(assessment.endTime));
        if (active) setFormReady(true);
      } catch (error) {
        if (active) {
          const message = error && typeof error === "object" && "response" in error
            ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
            : undefined;
          addToast("error", "Unable to load assessment", message || (error instanceof Error ? error.message : "Please try again."));
          router.push("/admin/assessments");
        }
      }
    };
    void hydrateForm();
    return () => { active = false; };
  }, [addToast, router]);

  useEffect(() => {
    let active = true;
    const loadDynamicOptions = async () => {
      try {
        const res = await adminAssessmentsAPI.getTargetingOptions();
        const data = res.data?.data || res.data || {};
        if (active) {
          if (Array.isArray(data.years) && data.years.length) setDynamicYears(data.years);
          if (Array.isArray(data.semesters) && data.semesters.length) setDynamicSemesters(data.semesters);
          if (Array.isArray(data.sections) && data.sections.length) setDynamicSections(data.sections);
        }
      } catch {
        // Defaults preserved
      }
    };
    void loadDynamicOptions();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!studentSearchInput.trim()) {
      setStudentSearchResults([]);
      setIsSearchingStudents(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingStudents(true);
      try {
        const res = await adminAssessmentsAPI.searchStudents({ search: studentSearchInput.trim(), limit: 10 });
        const payload = res.data?.students || res.data?.data?.students || [];
        setStudentSearchResults(payload);
      } catch {
        setStudentSearchResults([]);
      } finally {
        setIsSearchingStudents(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [studentSearchInput]);

  const years = dynamicYears;
  const allSemesters = dynamicSemesters;
  const visibleSemesters = selectedYears.length
    ? Array.from(new Set(selectedYears.flatMap((year) => {
        const firstSemester = (Number(year) - 1) * 2 + 1;
        return [String(firstSemester), String(firstSemester + 1)];
      }))).sort((a, b) => Number(a) - Number(b))
    : allSemesters;
  const sectionOptions = getStandardizedSectionOptions([
    ...targetSections,
    ...dynamicSections,
  ]);

  useEffect(() => {
    let active = true;
    const runPreview = async () => {
      try {
        const res = await adminAssessmentsAPI.previewTargetAudience({
          targetSemesters: targetSemesters.length ? targetSemesters : selectedYears.length ? visibleSemesters : [],
          targetSections,
          targetGroups: targetGroup === "both" ? ["A", "B"] : targetGroup ? [targetGroup.toUpperCase()] : [],
          targetStudentIds,
        });
        const data = res.data?.data || res.data;
        if (active && data) {
          setAudiencePreview(data);
        }
      } catch {
        if (active) setAudiencePreview(null);
      }
    };
    const t = setTimeout(runPreview, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [targetSemesters, selectedYears, visibleSemesters, targetSections, targetGroup, targetStudentIds]);

  const handleToggleStudent = (student: any) => {
    setTargetStudentIds((prev) => {
      if (prev.includes(student.id)) {
        setSelectedStudentsList((list) => list.filter((s) => s.id !== student.id));
        return prev.filter((id) => id !== student.id);
      } else {
        setSelectedStudentsList((list) => [...list.filter((s) => s.id !== student.id), student]);
        return [...prev, student.id];
      }
    });
  };

  const handleRemoveStudent = (studentId: string) => {
    setTargetStudentIds((prev) => prev.filter((id) => id !== studentId));
    setSelectedStudentsList((list) => list.filter((s) => s.id !== studentId));
  };

  useEffect(() => {
    const timer = window.setInterval(() => setPreviewNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const updateYears = (year: string) => {
    setSelectedYears((current) => toggleValue(current, year));
    setTargetSemesters([]);
  };

  const updateSemesters = (semester: string) => {
    setTargetSemesters((current) => {
      const updated = toggleValue(current, semester);
      if (updated.length && !selectedYears.length) {
        const inferredYears = Array.from(new Set(updated.map((s) => String(Math.ceil(Number(s) / 2)))));
        setSelectedYears(inferredYears);
      }
      return updated;
    });
  };

  const updateGroup = (group: "a" | "b" | "both") => {
    setTargetGroup(group);
  };

  const applySecurityProfile = (profile: "STANDARD_CLASSROOM_QUIZ" | "PROCTORED_MIDFINAL" | "PROCTORED_MIDTERM_FINAL" | "HIGH_STAKES_CERTIFICATION") => {
    store.setRequireLockdown(true);
    if (profile === "STANDARD_CLASSROOM_QUIZ") {
      store.setAllowCalculators(true);
      store.setAllowScratchpad(true);
      store.setAllowVirtualMachine(true);
      store.setRequireCloseOtherApps(true);
      store.setEnableForensicWatermark(false);
      store.setProctoring({
        useCamera: false,
        enforceFullscreen: true,
        blockCopyPaste: true,
        detectTabSwitch: true,
      });
    } else if (profile === "PROCTORED_MIDTERM_FINAL" || profile === "PROCTORED_MIDFINAL") {
      store.setAllowCalculators(true);
      store.setAllowScratchpad(true);
      store.setAllowReferenceDoc(false);
      store.setAllowVirtualMachine(false);
      store.setRequireCloseOtherApps(true);
      store.setEnableForensicWatermark(false);
      store.setProctoring({
        mode: 'fully_proctored',
        useCamera: true,
        enforceFullscreen: true,
        blockCopyPaste: true,
        detectTabSwitch: true,
      });
    } else if (profile === "HIGH_STAKES_CERTIFICATION") {
      store.setAllowCalculators(false);
      store.setAllowScratchpad(false);
      store.setAllowReferenceDoc(false);
      store.setAllowVirtualMachine(false);
      store.setRequireCloseOtherApps(true);
      store.setEnableForensicWatermark(true);
      store.setProctoring({
        mode: 'fully_proctored',
        useCamera: true,
        enforceFullscreen: true,
        blockCopyPaste: true,
        detectTabSwitch: true,
      });
    }
  };
  const clearAutoSelection = (sectionId: string) => {
    setAutoSelections((current) => {
      const next = { ...current };
      delete next[sectionId];
      return next;
    });
  };

  // Calculate totals
  const totalQuestions = store.sections.reduce((acc, sec) => acc + sec.questions.length, 0);
  const totalMarks = store.sections.reduce((acc, sec) => acc + sec.questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0), 0);

  const allSelectedQuestionIds = store.sections.flatMap((section) => section.questions.map((q) => q.questionId));
  const duplicateQuestionIds = Array.from(
    new Set(allSelectedQuestionIds.filter((questionId, index) => allSelectedQuestionIds.indexOf(questionId) !== index)),
  );
  const hasDuplicateQuestions = duplicateQuestionIds.length > 0;
  const scheduleState = getAssessmentScheduleState(startTime || null, endTime || null, previewNow);
  const scheduleIsValid = scheduleState !== "invalid";
  const scheduleStatus = scheduleState === "invalid"
    ? { title: "Schedule needs attention", detail: "Choose an end time later than the start time.", className: "border-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-300" }
    : scheduleState === "upcoming"
      ? { title: "Upcoming · Not yet available", detail: "Students can start when the scheduled window opens.", className: "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300" }
      : scheduleState === "expired"
        ? { title: "Expired · No longer available", detail: "The scheduled access window has ended.", className: "border-rose-500/25 bg-rose-500/5 text-rose-700 dark:text-rose-300" }
        : { title: "Live · Available now", detail: "Students can start now, while the schedule remains open.", className: "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300" };
  const durationInputValue = durationUnit === "hours" ? Number(store.durationMinutes) / 60 : store.durationMinutes;

  const handlePublish = async (status: 'draft' | 'published') => {
    if (hasDuplicateQuestions) {
      addToast("error", "Duplicate questions detected", "Each question can only be used once across the entire assessment.");
      return;
    }
    if (!store.title.trim() || !store.code.trim()) {
      addToast("error", "Validation Error", "Title and Code are required.");
      return;
    }
    if (store.sections.length === 0) {
      addToast("error", "Validation Error", "At least one section is required.");
      return;
    }
    if (totalQuestions === 0) {
      addToast("error", "Validation Error", "At least one question is required across sections.");
      return;
    }
    if (!Number.isFinite(Number(store.durationMinutes)) || Number(store.durationMinutes) < 5) {
      addToast("error", "Validation Error", "Assessment duration must be at least 5 minutes.");
      return;
    }
    if ((startTime && !dayjs(startTime).isValid()) || (endTime && !dayjs(endTime).isValid()) || (startTime && endTime && !dayjs(endTime).isAfter(dayjs(startTime)))) {
      addToast("error", "Validation Error", "Enter valid schedule dates and make sure the end time is later than the start time.");
      return;
    }
    if (store.passingMarks !== '' && (Number(store.passingMarks) < 0 || Number(store.passingMarks) > totalMarks)) {
      addToast("error", "Validation Error", `Passing marks must be between 0 and total marks (${totalMarks}).`);
      return;
    }
    setIsPublishing(true);
    try {
      const payload = {
        title: store.title,
        code: store.code,
        description: store.description,
        durationMinutes: store.durationMinutes,
        passingMarks: store.passingMarks !== '' ? Number(store.passingMarks) : undefined,
        category: store.category,
        allowedAttempts: store.allowedAttempts,
        targetSemesters: targetSemesters.length ? targetSemesters : selectedYears.length ? visibleSemesters : [],
        targetSections,
        targetGroups: targetGroup === "both" ? ["A", "B"] : targetGroup ? [targetGroup.toUpperCase()] : [],
        targetStudentIds,
        lockSectionsSequentially: store.lockSectionsSequentially,
        requireLockdown: store.requireLockdown,
        allowVirtualMachine: store.allowVirtualMachine,
        lockdownQuitPassword: store.lockdownQuitPassword || undefined,
        allowCalculators: store.allowCalculators,
        allowScratchpad: store.allowScratchpad,
        allowReferenceDoc: store.allowReferenceDoc,
        referencePdfUrl: store.allowReferenceDoc ? (store.referencePdfUrl || undefined) : undefined,
        requireCloseOtherApps: store.requireCloseOtherApps,
        allowSpellCheck: store.allowSpellCheck,
        allowFindOnPage: store.allowFindOnPage,
        allowedUrlPatterns: store.allowedUrlPatterns,
        enableScreenCaptureSnapshots: store.enableScreenCaptureSnapshots,
        enableForensicWatermark: store.enableForensicWatermark,
        showResultImmediately: store.showResultImmediately,
        allowReview: store.resultDisplaySettings.showQuestionReview,
        resultDisplaySettings: store.resultDisplaySettings,
        startTime: startTime ? dayjs(startTime).toISOString() : editingId ? null : undefined,
        endTime: endTime ? dayjs(endTime).toISOString() : editingId ? null : undefined,
        negativeMarking: store.negativeMarking,
        proctoring: store.proctoring,
        instructions: store.instructions,
        status,
        sections: store.sections.map(s => ({
          title: s.title,
          description: s.description,
          order: s.order,
          timeLimit: s.timeLimit,
          autoSelection: autoSelections[s.id],
          questions: s.questions.map(q => ({
            questionId: q.questionId,
            marks: Number(q.marks),
            negativeMarks: Number(q.negativeMarks),
            order: q.order
          }))
        }))
      };
      if (editingId) {
        await adminAssessmentsAPI.update(editingId, payload);
      } else {
        await adminAssessmentsAPI.create(payload);
      }

      addToast("success", "Success", `Assessment ${status === 'published' ? 'published' : 'saved as draft'}`);
      setTimeout(() => router.push("/admin/assessments"), 1000);
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      addToast("error", "Error", message || `Failed to ${editingId ? "update" : "create"} assessment.`);
      setIsPublishing(false);
      setShowConfirm(false);
    }
  };

  if (!formReady) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground"><Spinner className="w-4 h-4 animate-spin mr-2" />{editingId ? "Loading assessment..." : "Preparing assessment form..."}</div>;
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/assessments" className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-base font-bold text-foreground">{editingId ? "Edit Assessment" : "Assessment Builder"}</h1>
              <p className="text-[11px] text-muted-foreground font-medium">{editingId ? "Update the complete assessment configuration." : "Design professional evaluations."}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-muted/40 border border-border px-4 py-2 rounded-2xl">
            <div className="text-center pr-4 border-r border-border">
              <div className="text-[10px] font-bold text-muted-foreground uppercase">Questions</div>
              <div className="text-sm font-bold font-mono">{totalQuestions}</div>
            </div>
            <div className="text-center pr-4 border-r border-border">
              <div className="text-[10px] font-bold text-muted-foreground uppercase">Marks</div>
              <div className="text-sm font-bold font-mono text-emerald-500">{totalMarks}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] font-bold text-muted-foreground uppercase">Duration</div>
              <div className="text-sm font-bold font-mono text-primary">{store.durationMinutes}m</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Basic Info */}
        <section className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" /> Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Title <span className="text-rose-500">*</span></label>
              <input type="text" value={store.title} onChange={e => store.setTitle(e.target.value)} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" placeholder="e.g. Frontend Engineering Test" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Exam Code <span className="text-rose-500">*</span></label>
              <input type="text" value={store.code} onChange={e => store.setCode(e.target.value.toUpperCase())} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm font-mono focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold">Description</label>
              <textarea rows={2} value={store.description} onChange={e => store.setDescription(e.target.value)} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" placeholder="Brief context about this assessment..." />
            </div>
          </div>
        </section>

        {/* Configuration */}
        <section className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Configuration & Proctoring
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pb-5 border-b border-border">
            <div className="space-y-1.5">
              <label htmlFor="assessment-duration" className="text-xs font-semibold">Assessment duration <span className="text-muted-foreground font-normal">(per attempt)</span></label>
              <div className="flex gap-2">
                <input id="assessment-duration" type="number" min={durationUnit === "hours" ? 5 / 60 : 5} step={durationUnit === "hours" ? "any" : 1} value={durationInputValue} onChange={(event) => {
                  const value = Number(event.target.value);
                  store.setDurationMinutes(Number.isFinite(value) ? Math.round(value * (durationUnit === "hours" ? 60 : 1)) : 0);
                }} className="min-w-0 flex-1 px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" />
                <select aria-label="Duration unit" value={durationUnit} onChange={(event) => setDurationUnit(event.target.value as "minutes" | "hours")} className="w-28 px-3 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary">
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                </select>
              </div>
              <p className="text-[11px] text-muted-foreground">Saved as {formatScheduleDuration(Number(store.durationMinutes))} for each attempt.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Passing Marks</label>
              <input type="number" value={store.passingMarks} onChange={e => store.setPassingMarks(e.target.value ? Number(e.target.value) : '')} placeholder={`Auto: ${Math.ceil(totalMarks * 0.4)}`} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Attempts</label>
              <select value={store.allowedAttempts} onChange={e => store.setAllowedAttempts(Number(e.target.value))} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary">
                <option value={1}>1 Attempt</option>
                <option value={2}>2 Attempts</option>
                <option value={0}>Unlimited</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Category</label>
              <select value={store.category} onChange={e => store.setCategory(e.target.value)} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary">
                <option value="exam">Exam</option>
                <option value="quiz">Quiz</option>
                <option value="recruitment">Recruitment</option>
              </select>
            </div>
          </div>

          {/* Proctoring Policy Selection: Fully Proctored, Partial Proctored (Manual Submission), Non Proctored */}
          <div className="space-y-3 pt-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Proctoring Enforcement Mode
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Option 1: Fully Proctored */}
              <button
                type="button"
                onClick={() =>
                  store.setProctoring({
                    mode: 'fully_proctored',
                    autoSubmitOnViolation: true,
                    useCamera: true,
                    enforceFullscreen: true,
                    detectTabSwitch: true,
                    blockCopyPaste: true,
                  })
                }
                className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                  (store.proctoring.mode || 'fully_proctored') === 'fully_proctored'
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                    : 'border-border bg-background hover:border-primary/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="p-2 rounded-xl bg-primary/10 text-primary">
                      <Shield className="w-5 h-5" />
                    </span>
                    {(store.proctoring.mode || 'fully_proctored') === 'fully_proctored' && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                        Active
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Fully Proctored</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Strict anti-cheat. Exceeding warning attempts (2–3 times) triggers automatic exam submission.
                  </p>
                </div>
                <div className="mt-3 text-[11px] font-medium text-amber-500 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Auto-submits on violation limit
                </div>
              </button>

              {/* Option 2: Partial Proctored (Manual Submission) */}
              <button
                type="button"
                onClick={() =>
                  store.setProctoring({
                    mode: 'partial_proctored',
                    autoSubmitOnViolation: false,
                    useCamera: true,
                    enforceFullscreen: true,
                    detectTabSwitch: true,
                    blockCopyPaste: true,
                    violationPenaltyMarks: store.proctoring.violationPenaltyMarks || 2,
                  })
                }
                className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                  store.proctoring.mode === 'partial_proctored'
                    ? 'border-indigo-500 bg-indigo-500/5 ring-2 ring-indigo-500/20 shadow-sm'
                    : 'border-border bg-background hover:border-indigo-500/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
                      <ShieldAlert className="w-5 h-5" />
                    </span>
                    {store.proctoring.mode === 'partial_proctored' && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                        Active
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Partial Proctored</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Manual submission guaranteed. Candidate completes test, but every tab switch or violation deducts negative marks live.
                  </p>
                </div>
                <div className="mt-3 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Manual submit · Negative marks on cheat
                </div>
              </button>

              {/* Option 3: Non Proctored */}
              <button
                type="button"
                onClick={() =>
                  store.setProctoring({
                    mode: 'non_proctored',
                    autoSubmitOnViolation: false,
                    useCamera: false,
                    enforceFullscreen: false,
                    detectTabSwitch: false,
                    blockCopyPaste: false,
                    violationPenaltyMarks: 0,
                  })
                }
                className={`p-4 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                  store.proctoring.mode === 'non_proctored'
                    ? 'border-emerald-500 bg-emerald-500/5 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'border-border bg-background hover:border-emerald-500/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                      <ShieldOff className="w-5 h-5" />
                    </span>
                    {store.proctoring.mode === 'non_proctored' && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                        Active
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Non Proctored</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Standard open assessment. No camera, tab-switch restrictions, or proctoring deductions.
                  </p>
                </div>
                <div className="mt-3 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Free attempt · No restrictions
                </div>
              </button>
            </div>
          </div>

          {/* If Partial Proctored: Editable Negative Marks Config */}
          {store.proctoring.mode === 'partial_proctored' && (
            <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-indigo-600" />
                    Negative Marks per Violation (Tab switch / Cheating)
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Deducted from candidate's final score for each recorded violation. Displayed live on candidate screen during test.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">Penalty:</span>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={store.proctoring.violationPenaltyMarks ?? 2}
                      onChange={(e) =>
                        store.setProctoring({
                          violationPenaltyMarks: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-24 px-3 py-1.5 bg-background border border-indigo-300 dark:border-indigo-800 rounded-lg text-sm font-bold text-red-500 focus:ring-2 focus:ring-indigo-500 text-center"
                    />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">marks / violation</span>
                </div>
              </div>
            </div>
          )}

          {/* Fine-grained Feature Toggles */}
          {store.proctoring.mode !== 'non_proctored' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 pt-2">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  checked={store.proctoring.useCamera}
                  onChange={(e) => store.setProctoring({ useCamera: e.target.checked })}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <span className="text-sm font-semibold">Use Camera &amp; Microphone</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  checked={store.proctoring.enforceFullscreen}
                  onChange={(e) => store.setProctoring({ enforceFullscreen: e.target.checked })}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <span className="text-sm font-semibold">Enforce Fullscreen</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  checked={store.proctoring.blockCopyPaste}
                  onChange={(e) => store.setProctoring({ blockCopyPaste: e.target.checked })}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <span className="text-sm font-semibold">Block Copy/Paste</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  checked={store.proctoring.detectTabSwitch}
                  onChange={(e) => store.setProctoring({ detectTabSwitch: e.target.checked })}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <span className="text-sm font-semibold">Detect Tab Switches</span>
              </label>
            </div>
          )}
          {store.proctoring.mode !== 'non_proctored' && store.proctoring.useCamera && (
            <div className="rounded-xl border border-border bg-background p-4 space-y-2">
              <label htmlFor="assessment-camera-policy" className="block text-sm font-semibold text-foreground">
                Camera selection
              </label>
              <select
                id="assessment-camera-policy"
                value={store.proctoring.cameraSelectionPolicy || 'student_select'}
                onChange={(event) => store.setProctoring({ cameraSelectionPolicy: event.target.value as ProctoringSettings['cameraSelectionPolicy'] })}
                className="w-full max-w-xl rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary"
              >
                <option value="student_select">Allow student to choose a camera</option>
                <option value="system_default">Use only the system default camera</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {store.proctoring.cameraSelectionPolicy === 'system_default'
                  ? "The browser's default camera is used; students won't see a camera picker."
                  : 'Students can choose an available camera before starting the assessment.'}
              </p>
            </div>
          )}
        </section>

        {/* Desktop Security & LockDown Browser */}
        <section className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Desktop Security & LockDown Browser
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Configure client-side desktop kiosk protection and university lab hardware overrides.
              </p>
            </div>
            {store.requireLockdown && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                LockDown Required
              </span>
            )}
          </div>

          <div className="space-y-4">
            {/* Require CodeSkill LockDown Toggle */}
            <div className="p-4 rounded-xl border border-border bg-background flex items-center justify-between gap-4 shadow-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Laptop className="w-4 h-4 text-primary" />
                  Require CodeSkill LockDown App
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground uppercase tracking-wider">
                    Desktop Kiosk
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Students must launch this exam in the CodeSkill LockDown desktop app (Windows, macOS, Linux). Blocks screen sharing, OS shortcuts, second monitors, and unauthorized apps.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={store.requireLockdown}
                  onChange={(e) => store.setRequireLockdown(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* One-Click Security Profiles Preset Selector */}
            {store.requireLockdown && (
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    One-Click Security Profiles
                  </span>
                  <span className="text-[11px] text-muted-foreground">Select a baseline profile or customize toggles below</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => applySecurityProfile("STANDARD_CLASSROOM_QUIZ")}
                    className={`p-3 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                      store.allowCalculators && store.allowScratchpad && store.allowVirtualMachine && !store.requireCloseOtherApps
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                        : "border-border bg-background hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <div className="font-semibold text-xs mb-1">Standard Quiz</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-2">In-dock tools & whiteboard allowed, VDI enabled.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => applySecurityProfile("PROCTORED_MIDTERM_FINAL")}
                    className={`p-3 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                      store.allowCalculators && store.allowScratchpad && !store.allowVirtualMachine && store.requireCloseOtherApps
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                        : "border-border bg-background hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <div className="font-semibold text-xs mb-1">Proctored Midterm</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-2">Tools allowed, third-party apps closed, VM blocked.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => applySecurityProfile("HIGH_STAKES_CERTIFICATION")}
                    className={`p-3 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                      !store.allowCalculators && !store.allowScratchpad && !store.allowVirtualMachine && store.requireCloseOtherApps
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                        : "border-border bg-background hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <div className="font-semibold text-xs mb-1">High-Stakes Strict</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-2">Zero dock tools, VM blocked, forensic watermark.</div>
                  </button>
                </div>
              </div>
            )}

            {/* Allow Virtual Machines (University VDI Labs) Toggle - Conditionally Rendered */}
            {store.requireLockdown && (
              <div className="p-4 rounded-xl border border-border bg-background/50 flex items-center justify-between gap-4 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Monitor className="w-4 h-4 text-amber-500" />
                    Allow Virtual Machines (University VDI Labs)
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 uppercase tracking-wider">
                      Lab Override
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Enable only if students are taking this exam on university Citrix, VMware, or cloud-hosted virtual lab computers.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={store.allowVirtualMachine}
                    onChange={(e) => store.setAllowVirtualMachine(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>
            )}

            {/* Allowed In-Dock Tools & Proctor Emergency Password (When LockDown is enabled) */}
            {store.requireLockdown && (
              <>
                {/* Allow In-Dock Scientific Calculator */}
                <div className="p-4 rounded-xl border border-border bg-background/50 flex items-center justify-between gap-4 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Calculator className="w-4 h-4 text-amber-500" />
                      Allow In-Dock Scientific Calculator
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 uppercase tracking-wider">
                        Allowed Tool
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Permit candidates to open the in-app scientific calculator from the bottom utility dock without external windows.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={store.allowCalculators}
                      onChange={(e) => store.setAllowCalculators(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {/* Rough Scratchpad Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background/50 gap-4 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <FileText className="w-4 h-4 text-sky-500" />
                      Allow In-Dock Rough Scratchpad
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 uppercase tracking-wider">
                        Rough Pad
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Permit candidates to draft notes and rough work on a sandboxed whiteboard directly from the utility dock.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={store.allowScratchpad}
                      onChange={(e) => store.setAllowScratchpad(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
                  </label>
                </div>

                {/* Reference Document Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background/50 gap-4 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <BookOpen className="w-4 h-4 text-emerald-500" />
                      Allow Reference Document
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                        Reference PDF
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enable an in-dock viewer for candidates to consult approved reference literature, formula sheets, or cheat sheets.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={store.allowReferenceDoc}
                      onChange={(e) => store.setAllowReferenceDoc(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* Approved Reference Material PDF URL (shown when allowReferenceDoc is true) */}
                {store.allowReferenceDoc && (
                  <div className="p-4 rounded-xl border border-border bg-background/50 space-y-2 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <BookOpen className="w-4 h-4 text-emerald-500" />
                      Approved Reference PDF URL
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                        In-App Viewer
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      URL to an approved reference PDF document (e.g. formula sheet, code reference). Accessible in a sandboxed dock viewer.
                    </p>
                    <input
                      type="url"
                      value={store.referencePdfUrl}
                      onChange={(e) => store.setReferencePdfUrl(e.target.value)}
                      placeholder="https://.../reference-sheet.pdf"
                      className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                )}

                {/* Proctor Emergency Quit Password */}
                <div className="p-4 rounded-xl border border-border bg-background/50 space-y-2 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <KeyRound className="w-4 h-4 text-rose-500" />
                    Proctor Quit Password
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 uppercase tracking-wider">
                      Emergency Exit
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Optional password required by invigilators/proctors to unlock and exit LockDown before student submission.
                  </p>
                  <input
                    type="password"
                    value={store.lockdownQuitPassword}
                    onChange={(e) => store.setLockdownQuitPassword(e.target.value)}
                    placeholder="Enter proctor quit password (optional)"
                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-rose-500"
                  />
                </div>

                {/* Pre-Exam Close Non-Essential Apps Gate */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background/50 gap-4 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      Close Other Applications Before Exam
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                        Pre-Exam Gate
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Scans and requires students to close third-party desktop applications before fullscreen lockdown engages.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={store.requireCloseOtherApps}
                      onChange={(e) => store.setRequireCloseOtherApps(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {/* Spell Check & AI Writing Tools */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background/50 gap-4 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <FileText className="w-4 h-4 text-indigo-500" />
                      Allow Spellcheck & AI Writing Tools
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                        Input Hygiene
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      When disabled, OS dictionary lookups, spellcheck squiggles, and autocorrect are strictly suppressed.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={store.allowSpellCheck}
                      onChange={(e) => store.setAllowSpellCheck(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                  </label>
                </div>

                {/* Find on Page (Ctrl/Cmd+F) */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background/50 gap-4 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Search className="w-4 h-4 text-amber-500" />
                      Allow Find on Page (Ctrl / Cmd + F)
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 uppercase tracking-wider">
                        Search
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Allow candidates to search text in long question statements or problem descriptions.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={store.allowFindOnPage}
                      onChange={(e) => store.setAllowFindOnPage(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {/* Allowed External URLs */}
                <div className="p-4 rounded-xl border border-border bg-background/50 space-y-2 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Globe className="w-4 h-4 text-blue-500" />
                    Allowed External URL Patterns
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 uppercase tracking-wider">
                      URL Allowlist
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Comma-separated domain patterns candidates can navigate to during the exam (e.g. docs.python.org, en.cppreference.com).
                  </p>
                  <input
                    type="text"
                    value={store.allowedUrlPatterns.join(', ')}
                    onChange={(e) => {
                      const list = e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      store.setAllowedUrlPatterns(list);
                    }}
                    placeholder="docs.python.org, en.cppreference.com"
                    className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                {/* Periodic Screen Capture Snapshots */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background/50 gap-4 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Camera className="w-4 h-4 text-purple-500" />
                      Periodic Screen Capture Snapshots
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 uppercase tracking-wider">
                        Proctor Audit
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Periodically logs lightweight webview viewport captures during testing for academic integrity review.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={store.enableScreenCaptureSnapshots}
                      onChange={(e) => store.setEnableScreenCaptureSnapshots(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                  </label>
                </div>

                {/* Subtle Forensic Screen Watermark */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background/50 gap-4 shadow-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Fingerprint className="w-4 h-4 text-emerald-500" />
                      Enable Subtle Forensic Screen Watermark
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                        Anti-Leak
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Renders a high-DPI, low-opacity forensic canvas pattern encoding candidate and session identifiers to deter and trace smartphone screen photography.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={store.enableForensicWatermark}
                      onChange={(e) => store.setEnableForensicWatermark(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Audience and availability */}
        <section className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2"><Settings className="w-4 h-4 text-primary" /> Student access & timing</h2>
            <p className="text-xs text-muted-foreground mt-1">Leave a filter empty to make the assessment available to everyone in that category.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <MultiSelectDropdown id="assessment-target-year" label="Year" placeholder="Choose student year(s)" options={years} selected={selectedYears} onChange={updateYears} />
            <MultiSelectDropdown id="assessment-target-semester" label="Semester" placeholder="Choose semester(s)" options={visibleSemesters} selected={targetSemesters} onChange={updateSemesters} />
            <MultiSelectDropdown id="assessment-target-section" label="Section" placeholder="Choose section(s)" options={sectionOptions} selected={targetSections} onChange={(section) => {
              setTargetSections((current) => toggleValue(current, section));
            }} />
            <div className="space-y-1.5">
              <label htmlFor="assessment-target-group" className="text-xs font-semibold">Group</label>
              <select id="assessment-target-group" value={targetGroup} onChange={(event) => updateGroup(event.target.value as "a" | "b" | "both")} className="w-full min-h-11 px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed">
                <option value="">All Groups</option>
                <option value="a">Group A</option>
                <option value="b">Group B</option>
                <option value="both">Both</option>
              </select>
            </div>

            {/* Specific Students Search & Selection */}
            <div className="md:col-span-4 p-4 rounded-xl border border-border bg-background space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="student-search-input" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-primary" />
                    Assign Specific Students (Irrespective of Semesters)
                  </label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Search and select particular students to grant direct access regardless of their semester or section.
                  </p>
                </div>
                {targetStudentIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTargetStudentIds([]);
                      setSelectedStudentsList([]);
                    }}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 transition-colors"
                  >
                    Clear assigned ({targetStudentIds.length})
                  </button>
                )}
              </div>

              <div className="relative">
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-muted-foreground absolute left-3 pointer-events-none" />
                  <input
                    id="student-search-input"
                    type="text"
                    value={studentSearchInput}
                    onChange={(e) => setStudentSearchInput(e.target.value)}
                    placeholder="Search by student name, email, or UID..."
                    className="w-full pl-9 pr-9 py-2 bg-muted/30 border border-border rounded-xl text-xs focus:ring-1 focus:ring-primary"
                  />
                  {isSearchingStudents && <Spinner className="w-3.5 h-3.5 animate-spin text-primary absolute right-3" />}
                </div>

                {studentSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-30 max-h-48 overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-1 space-y-1">
                    {studentSearchResults.map((stu) => {
                      const isSelected = targetStudentIds.includes(stu.id);
                      return (
                        <button
                          type="button"
                          key={stu.id}
                          onClick={() => handleToggleStudent(stu)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                            isSelected
                              ? "bg-primary/10 text-primary border border-primary/20"
                              : "hover:bg-muted text-foreground"
                          }`}
                        >
                          <div>
                            <span className="font-semibold">{stu.name}</span>{" "}
                            <span className="text-[11px] text-muted-foreground font-mono">
                              ({stu.uid || stu.email})
                            </span>
                            <span className="block text-[10px] text-muted-foreground">
                              {stu.semester ? `Sem ${stu.semester}` : ""} {stu.section ? `· Sec ${stu.section}` : ""}{" "}
                              {stu.year ? `· Year ${stu.year}` : ""}
                            </span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            {isSelected ? "Selected ✓" : "+ Add"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected Students Chips */}
              {targetStudentIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {targetStudentIds.map((id) => {
                    const stu = selectedStudentsList.find((s) => s.id === id);
                    const label = stu ? `${stu.name} (${stu.uid || "ID"})` : `Student (${id.slice(0, 6)}...)`;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs font-medium text-foreground"
                      >
                        <UserCheck className="w-3 h-3 text-primary" />
                        <span>{label}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStudent(id)}
                          className="hover:text-rose-500 transition-colors ml-0.5"
                          title="Remove student"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Target Audience Live Preview Card */}
            <div className="md:col-span-4 p-4 bg-muted/30 border border-border/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-primary" />
                  Target Audience Live Preview
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    audiencePreview?.accessMode === "open_access"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : audiencePreview?.accessMode === "specific_only"
                      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20"
                      : audiencePreview?.accessMode === "combined"
                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  }`}>
                    {audiencePreview?.accessMode === "open_access" && "Open Access"}
                    {audiencePreview?.accessMode === "specific_only" && "Specific Students Only"}
                    {audiencePreview?.accessMode === "cohort_only" && "Cohort Restricted"}
                    {audiencePreview?.accessMode === "combined" && "Combined Access"}
                    {!audiencePreview && "Calculating..."}
                  </span>
                  {audiencePreview && (
                    <span className="text-xs font-bold text-foreground font-mono">
                      {audiencePreview.totalCount} {audiencePreview.totalCount === 1 ? "student" : "students"} eligible
                    </span>
                  )}
                </div>
              </div>

              <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                {targetSemesters.length || selectedYears.length || targetSections.length || targetGroup || targetStudentIds.length ? (
                  <>
                    {selectedYears.length ? <span className="bg-background px-2 py-0.5 rounded border border-border">Year {selectedYears.join(", ")}</span> : null}
                    {targetSemesters.length ? <span className="bg-background px-2 py-0.5 rounded border border-border">Sem {targetSemesters.join(", ")}</span> : null}
                    {targetSections.length ? <span className="bg-background px-2 py-0.5 rounded border border-border">Sec {targetSections.join(", ")}</span> : null}
                    {targetGroup ? <span className="bg-background px-2 py-0.5 rounded border border-border">Group {targetGroup.toUpperCase()}</span> : null}
                    {targetStudentIds.length ? <span className="bg-background px-2 py-0.5 rounded border border-border text-primary font-medium">{targetStudentIds.length} specific student(s)</span> : null}
                  </>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Open to all registered student accounts.
                  </span>
                )}
              </div>

              {audiencePreview && audiencePreview.sampleStudents.length > 0 && (
                <div className="pt-2 border-t border-border/50">
                  <button
                    type="button"
                    onClick={() => setShowSampleDrawer((v) => !v)}
                    className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                  >
                    {showSampleDrawer ? "Hide sample candidates ▲" : `Preview sample eligible candidates (${audiencePreview.sampleStudents.length}) ▼`}
                  </button>
                  {showSampleDrawer && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-2 bg-background rounded-lg border border-border text-[11px]">
                      {audiencePreview.sampleStudents.map((s) => (
                        <div key={s.id} className="truncate text-muted-foreground">
                          <strong className="text-foreground">{s.name}</strong>{" "}
                          <span className="font-mono">({s.uid || s.email})</span>
                          {s.semester && ` · Sem ${s.semester}`}
                          {s.section && ` · Sec ${s.section}`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="assessment-start-time" className="text-xs font-semibold">Available from <span className="text-muted-foreground font-normal">(optional)</span></label>
              <input id="assessment-start-time" type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="assessment-end-time" className="text-xs font-semibold">Available until <span className="text-muted-foreground font-normal">(optional)</span></label>
              <input id="assessment-end-time" type="datetime-local" min={startTime || undefined} value={endTime} onChange={(event) => setEndTime(event.target.value)} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" />
            </div>
            <div className={`md:col-span-4 overflow-hidden rounded-2xl border ${scheduleStatus.className}`}>
              <div className="flex flex-col gap-3 border-b border-current/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold">{scheduleStatus.title}</p>
                  <p className="mt-0.5 text-xs opacity-80">{scheduleStatus.detail}</p>
                </div>
                {store.title.trim() && <span className="max-w-full truncate rounded-lg bg-background/70 px-3 py-1.5 text-xs font-semibold text-foreground">{store.title}</span>}
              </div>
              <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-foreground">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Available from</p>
                  <p className="mt-1 text-sm font-semibold">{startTime ? formatAssessmentDateTime(startTime, "D MMM YYYY") : "Immediately"}</p>
                  <p className="text-xs text-muted-foreground">{startTime ? formatAssessmentDateTime(startTime, "h:mm A") : "No start restriction"}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-foreground">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Available until</p>
                  <p className="mt-1 text-sm font-semibold">{endTime ? formatAssessmentDateTime(endTime, "D MMM YYYY") : "No expiry"}</p>
                  <p className="text-xs text-muted-foreground">{endTime ? formatAssessmentDateTime(endTime, "h:mm A") : "Open schedule"}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-foreground">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Access window</p>
                  <p className="mt-1 text-sm font-semibold">{!scheduleIsValid ? "Invalid window" : startTime && endTime ? formatScheduleDuration(dayjs(endTime).diff(dayjs(startTime), "minute")) : startTime || endTime ? "Open-ended" : "Available now"}</p>
                  <p className="text-xs text-muted-foreground">Controls when attempts can begin</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-foreground">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Duration per attempt</p>
                  <p className="mt-1 text-sm font-semibold">{formatScheduleDuration(Number(store.durationMinutes))}</p>
                  <p className="text-xs text-muted-foreground">Timer submits when time runs out</p>
                </div>
              </div>
              {startTime && endTime && !scheduleIsValid && <p className="mx-3 mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-300">End time must be later than start time.</p>}
            </div>
          </div>
        </section>

        {/* Candidate Result Visibility Policy */}
        <section className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" /> Candidate Result Visibility Policy
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Control what data students can see after submitting their assessment.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-background flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-semibold text-foreground">Release results immediately upon submission</span>
              <p className="text-xs text-muted-foreground">
                When disabled, candidates see a submission acknowledgement; scores and review remain withheld until published.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={store.showResultImmediately}
                onChange={(e) => store.setShowResultImmediately(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {store.showResultImmediately ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <label className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-background cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  checked={store.resultDisplaySettings.showScore}
                  onChange={(e) => store.setResultDisplaySettings({ showScore: e.target.checked })}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <div>
                  <span className="text-sm font-semibold text-foreground">Show overall score & percentage</span>
                  <p className="text-[11px] text-muted-foreground">Display aggregate marks and pass/fail status</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-background cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  checked={store.resultDisplaySettings.showQuestionReview}
                  onChange={(e) => store.setResultDisplaySettings({ showQuestionReview: e.target.checked })}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <div>
                  <span className="text-sm font-semibold text-foreground">Show question-by-question review</span>
                  <p className="text-[11px] text-muted-foreground">List questions and student&apos;s selected answers</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-background cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  checked={store.resultDisplaySettings.showCorrectAnswers}
                  onChange={(e) => store.setResultDisplaySettings({ showCorrectAnswers: e.target.checked })}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <div>
                  <span className="text-sm font-semibold text-foreground">Reveal correct options & explanations</span>
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">Recommended OFF for multi-batch tests</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-background cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  checked={store.resultDisplaySettings.showRankAndPercentile}
                  onChange={(e) => store.setResultDisplaySettings({ showRankAndPercentile: e.target.checked })}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <div>
                  <span className="text-sm font-semibold text-foreground">Show class rank & percentile</span>
                  <p className="text-[11px] text-muted-foreground">Display leaderboard position and top % tier</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-background cursor-pointer hover:bg-muted/30 transition-colors md:col-span-2">
                <input
                  type="checkbox"
                  checked={store.resultDisplaySettings.showTopicBreakdown}
                  onChange={(e) => store.setResultDisplaySettings({ showTopicBreakdown: e.target.checked })}
                  className="rounded text-primary focus:ring-primary w-4 h-4"
                />
                <div>
                  <span className="text-sm font-semibold text-foreground">Show topic-wise performance breakdown</span>
                  <p className="text-[11px] text-muted-foreground">Display progress bars for accuracy per topic/domain</p>
                </div>
              </label>
            </div>
          ) : (
            <div className="space-y-1.5 pt-1">
              <label htmlFor="custom-submission-msg" className="text-xs font-semibold text-foreground">
                Custom Submission Confirmation Message
              </label>
              <textarea
                id="custom-submission-msg"
                rows={2}
                value={store.resultDisplaySettings.customSubmissionMessage || ""}
                onChange={(e) => store.setResultDisplaySettings({ customSubmissionMessage: e.target.value })}
                placeholder="Your assessment has been submitted. Results will be announced once all batches have concluded."
                className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
          )}
        </section>

        {/* Sections */}
        {hasDuplicateQuestions && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
            Duplicate questions detected across sections. Each question can only be used once in the assessment.
          </div>
        )}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" /> Assessment Sections
            </h2>
            <button onClick={store.addSection} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-lg text-xs font-semibold hover:bg-muted/80 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Section
            </button>
          </div>

          {/* Sequential Section Locking Toggle Card */}
          <div className="p-4 rounded-xl border border-border bg-card flex items-center justify-between shadow-xs">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Lock className="w-4 h-4 text-primary" />
                Lock Sections Sequentially
              </div>
              <p className="text-xs text-muted-foreground">
                Candidates must complete and submit each section in order before unlocking the next. Questions in completed sections become read-only.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={store.lockSectionsSequentially}
                onChange={(e) => store.setLockSectionsSequentially(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {store.sections.map((section) => {
            const secMarks = section.questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);
            return (
              <div key={section.id} className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 bg-muted/30 border-b border-border flex items-center justify-between">
                  <div className="flex-1 flex items-center gap-3">
                    <GripVertical className="w-5 h-5 text-muted-foreground cursor-grab" />
                    <input
                      type="text"
                      value={section.title}
                      onChange={e => store.updateSection(section.id, { title: e.target.value })}
                      className="bg-transparent border-none text-base font-bold text-foreground focus:ring-0 p-0 w-64"
                    />
                    <span className="px-2 py-1 bg-background border border-border rounded-md text-[10px] font-bold text-muted-foreground uppercase">
                      {section.questions.length} Qs • {secMarks} Marks
                    </span>
                  </div>
                  <button onClick={() => {
                    if (confirm("Delete this section and all its questions?")) store.removeSection(section.id);
                  }} className="p-2 text-muted-foreground hover:text-rose-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 space-y-3">
                  {section.questions.length === 0 ? (
                    <div className="p-8 text-center bg-background border border-dashed border-border rounded-xl">
                      <p className="text-sm text-muted-foreground mb-3">No questions in this section yet.</p>
                      <div className="flex flex-col sm:flex-row justify-center gap-3">
                        <button onClick={() => setAutoGenerateSectionId(section.id)} className="px-4 py-2 border border-primary/40 bg-primary/5 text-primary text-xs font-semibold rounded-lg shadow-sm hover:bg-primary/10 transition-colors">
                          Auto Generate from Bank
                        </button>
                        <button onClick={() => { clearAutoSelection(section.id); setActivePicker(section.id); }} className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm">
                          + Select Questions from Bank
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {section.questions.map((q, qIdx) => (
                        <div key={q.questionId} className="flex flex-col sm:flex-row gap-4 p-3 bg-background border border-border rounded-xl group hover:border-primary/30 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold bg-muted px-1.5 py-0.5 rounded text-foreground uppercase border border-border">
                                {q.questionType}
                              </span>
                              <span className="text-xs font-semibold text-muted-foreground">Q{qIdx + 1}</span>
                            </div>
                            <p className="text-sm font-medium text-foreground line-clamp-1">{q.questionText}</p>
                          </div>

                          <div className="flex items-center gap-3 sm:w-auto w-full border-t sm:border-t-0 pt-3 sm:pt-0 border-border">
                            <div className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded-lg border border-border">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">Marks</span>
                              <input type="number" min={1} value={q.marks} onChange={e => { clearAutoSelection(section.id); store.updateQuestionConfig(section.id, q.questionId, { marks: Number(e.target.value) }); }} className="w-12 bg-transparent border-none text-xs font-mono font-bold text-emerald-500 focus:ring-0 p-0 text-center" />
                            </div>
                            <div className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded-lg border border-border">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">Neg</span>
                              <input type="number" min={0} value={q.negativeMarks} onChange={e => { clearAutoSelection(section.id); store.updateQuestionConfig(section.id, q.questionId, { negativeMarks: Number(e.target.value) }); }} className="w-10 bg-transparent border-none text-xs font-mono font-bold text-rose-500 focus:ring-0 p-0 text-center" />
                            </div>
                            <button onClick={() => { clearAutoSelection(section.id); store.removeQuestionFromSection(section.id, q.questionId); }} className="p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 rounded-md transition-colors ml-auto sm:ml-0">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 flex flex-col sm:flex-row gap-2">
                        <button onClick={() => setAutoGenerateSectionId(section.id)} className="flex-1 py-3 border border-primary/30 bg-primary/5 text-primary rounded-xl text-xs font-semibold hover:bg-primary/10 transition-colors flex items-center justify-center gap-2">
                          <Sparkles className="w-4 h-4" /> Auto Generate from Bank
                        </button>
                        <button onClick={() => { clearAutoSelection(section.id); setActivePicker(section.id); }} className="flex-1 py-3 border border-dashed border-border rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors flex items-center justify-center gap-2">
                          <Plus className="w-4 h-4" /> Add More Questions
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border px-6 py-3 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button onClick={() => router.push("/admin/assessments")} className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <div className="flex gap-3">
            <button onClick={() => handlePublish('draft')} disabled={isPublishing} className="px-5 py-2.5 rounded-xl border border-border hover:bg-muted text-sm font-semibold flex items-center gap-2">
              <Save className="w-4 h-4" /> Save as Draft
            </button>
            <button onClick={() => setShowConfirm(true)} disabled={isPublishing} className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold flex items-center gap-2 shadow-md">
              <CheckCircle2 className="w-4 h-4" /> Publish Assessment
            </button>
          </div>
        </div>
      </div>

      {activePicker && (
        <QuestionPicker sectionId={activePicker} onClose={() => setActivePicker(null)} />
      )}

      {autoGenerateSectionId && (
        <AutoGenerateFromBank
          sectionId={autoGenerateSectionId}
          onGenerated={(criteria) => setAutoSelections((current) => ({ ...current, [autoGenerateSectionId]: criteria }))}
          onClose={() => setAutoGenerateSectionId(null)}
        />
      )}

      {/* Publish Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl animate-in zoom-in-95">
            <h2 className="text-xl font-bold mb-2 text-foreground">Confirm Publish</h2>
            <p className="text-sm text-muted-foreground mb-6">Are you sure you want to publish this assessment? It will immediately become available to assigned candidates.</p>

            <div className="space-y-3 bg-muted/40 p-4 rounded-xl border border-border mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sections</span>
                <span className="font-bold">{store.sections.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Questions</span>
                <span className="font-bold">{totalQuestions}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Marks</span>
                <span className="font-bold text-emerald-500">{totalMarks} pts</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm font-semibold">Cancel</button>
              <button onClick={() => handlePublish('published')} disabled={isPublishing} className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                {isPublishing ? <Spinner className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type BankQuestion = {
  _id: string;
  question: string;
  marks?: number;
  negativeMarks?: number;
  difficulty?: string;
  questionType?: string;
  topic?: string;
};

type TopicEntry = {
  topic?: string;
};

function AutoGenerateFromBank({ sectionId, onGenerated, onClose }: { sectionId: string; onGenerated: (criteria: AutoSelectionCriteria) => void; onClose: () => void }) {
  const store = useAssessmentStore();
  const { addToast } = useToast();
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [easyCount, setEasyCount] = useState(3);
  const [mediumCount, setMediumCount] = useState(4);
  const [hardCount, setHardCount] = useState(3);
  const [availableQuestions, setAvailableQuestions] = useState<BankQuestion[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const section = store.sections.find((s) => s.id === sectionId);
  const allSelectedQuestionIds = new Set(store.sections.flatMap((s) => s.questions.map((q) => q.questionId)));

  useEffect(() => {
    const fetchTopics = async () => {
      setLoadingTopics(true);
      try {
        const res = await adminQuestionsAPI.getTopics();
        const rows = Array.isArray(res?.data?.topics) ? (res.data.topics as TopicEntry[]) : [];
        const nextTopics = rows.map((t) => t.topic).filter((topic): topic is string => Boolean(topic)).sort();
        setTopics(nextTopics);
        if (nextTopics.length > 0) {
          setSelectedTopic((current) => current || nextTopics[0]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingTopics(false);
      }
    };

    fetchTopics();
  }, []);

  useEffect(() => {
    if (!selectedTopic) {
      return;
    }

    const fetchQuestions = async () => {
      setLoadingQuestions(true);
      try {
        const res = await adminQuestionsAPI.getAll({
          status: "approved",
          topic: selectedTopic,
          limit: 500,
        });
        const fetched = Array.isArray(res?.data?.questions) ? res.data.questions as BankQuestion[] : [];
        setAvailableQuestions(fetched);
      } catch (err) {
        console.error(err);
        setAvailableQuestions([]);
      } finally {
        setLoadingQuestions(false);
      }
    };

    fetchQuestions();
  }, [selectedTopic]);

  const counts = {
    easy: availableQuestions.filter((q) => String(q.difficulty || "").toLowerCase() === "easy").length,
    medium: availableQuestions.filter((q) => String(q.difficulty || "").toLowerCase() === "medium").length,
    hard: availableQuestions.filter((q) => String(q.difficulty || "").toLowerCase() === "hard").length,
  };

  const enteredDifficultyTotal = easyCount + mediumCount + hardCount;
  const difficultyLimitError = {
    easy: easyCount > counts.easy,
    medium: mediumCount > counts.medium,
    hard: hardCount > counts.hard,
  };
  const totalMismatchError = totalQuestions !== enteredDifficultyTotal;

  const hasInvalidDifficultyCounts =
    easyCount < 0 || mediumCount < 0 || hardCount < 0 ||
    difficultyLimitError.easy || difficultyLimitError.medium || difficultyLimitError.hard ||
    totalMismatchError;

  const validateSelection = () => {
    if (!selectedTopic) {
      addToast("error", "Select a subject", "Choose a subject before generating questions.");
      return false;
    }
    if (totalQuestions <= 0) {
      addToast("error", "Invalid total", "Total questions must be at least 1.");
      return false;
    }
    if (totalMismatchError) {
      addToast("error", "Total mismatch", "Easy + Medium + Hard must equal the total question count.");
      return false;
    }
    if (hasInvalidDifficultyCounts) {
      addToast("error", "Question limit exceeded", "One or more difficulty counts exceed the available questions in the selected subject.");
      return false;
    }
    return true;
  };

  const shuffleList = <T,>(items: T[]) => {
    const clone = [...items];
    for (let i = clone.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [clone[i], clone[j]] = [clone[j], clone[i]];
    }
    return clone;
  };

  const handleGenerate = () => {
    if (!validateSelection()) return;

    const poolByDifficulty = {
      easy: shuffleList(availableQuestions.filter((q) => String(q.difficulty || "").toLowerCase() === "easy" && !allSelectedQuestionIds.has(q._id))),
      medium: shuffleList(availableQuestions.filter((q) => String(q.difficulty || "").toLowerCase() === "medium" && !allSelectedQuestionIds.has(q._id))),
      hard: shuffleList(availableQuestions.filter((q) => String(q.difficulty || "").toLowerCase() === "hard" && !allSelectedQuestionIds.has(q._id))),
    };

    const needed = { easy: easyCount, medium: mediumCount, hard: hardCount };
    const selectedQuestions: BankQuestion[] = [];
    for (const level of ["easy", "medium", "hard"] as const) {
      selectedQuestions.push(...poolByDifficulty[level].slice(0, needed[level]));
    }

    if (selectedQuestions.length < totalQuestions) {
      addToast("error", "Insufficient pool", "The chosen topic does not contain enough unique questions after excluding existing ones.");
      return;
    }

    setIsGenerating(true);
    const finalQuestions = shuffleList(selectedQuestions).slice(0, totalQuestions);

    finalQuestions.forEach((q, idx) => {
      store.addQuestionToSection(sectionId, {
        questionId: q._id,
        marks: Number(q.marks) || 1,
        negativeMarks: Number(q.negativeMarks) || 0,
        order: (section?.questions.length || 0) + idx,
        topic: q.topic || selectedTopic,
        difficulty: q.difficulty || "medium",
        questionText: q.question,
        questionType: q.questionType,
      });
    });

    onGenerated({ topic: selectedTopic, easyCount, mediumCount, hardCount });

    setIsGenerating(false);
    addToast("success", "Questions generated", `${finalQuestions.length} questions imported into this section.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/30">
          <div>
            <h2 className="text-lg font-bold text-foreground">Auto Generate from Bank</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Create a balanced question set for {section?.title}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Subject</label>
            <select
              value={selectedTopic}
              onChange={(e) => {
                setSelectedTopic(e.target.value);
                setAvailableQuestions([]);
              }}
              className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary"
              disabled={loadingTopics}
            >
              <option value="">Select a subject</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>{topic}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Total Questions</label>
              <input
                type="number"
                min={1}
                value={totalQuestions}
                onChange={(e) => setTotalQuestions(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary"
              />
              {totalMismatchError && (
                <p className="text-[10px] text-rose-500 font-medium">Total must equal Easy + Medium + Hard.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Available</label>
              <div className="flex items-center justify-center h-[46px] bg-muted border border-border rounded-xl text-sm font-semibold text-muted-foreground">
                {loadingQuestions ? "Loading..." : (availableQuestions.length || 0)}
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-emerald-600">Easy</label>
                <input type="number" min={0} value={easyCount} onChange={(e) => setEasyCount(Math.max(0, Number(e.target.value) || 0))} className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" />
                {difficultyLimitError.easy && (
                  <p className="text-[10px] text-rose-500 font-medium">Only {counts.easy} easy questions available.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-amber-600">Medium</label>
                <input type="number" min={0} value={mediumCount} onChange={(e) => setMediumCount(Math.max(0, Number(e.target.value) || 0))} className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" />
                {difficultyLimitError.medium && (
                  <p className="text-[10px] text-rose-500 font-medium">Only {counts.medium} medium questions available.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-rose-600">Hard</label>
                <input type="number" min={0} value={hardCount} onChange={(e) => setHardCount(Math.max(0, Number(e.target.value) || 0))} className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" />
                {difficultyLimitError.hard && (
                  <p className="text-[10px] text-rose-500 font-medium">Only {counts.hard} hard questions available.</p>
                )}
              </div>
            </div>
            <div className="text-base text-muted-foreground font-medium">
              {loadingQuestions ? "Checking bank availability..." : `Available by difficulty: Easy ${counts.easy}, Medium ${counts.medium}, Hard ${counts.hard}`}
            </div>
            {totalMismatchError && (
              <p className="text-[11px] text-rose-500 font-medium">Easy + Medium + Hard must equal the total question count.</p>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-border bg-card flex justify-between items-center">
          <span className="text-sm font-semibold text-muted-foreground">
            {selectedTopic ? `Focus: ${selectedTopic}` : "Select a subject"}
          </span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-border hover:bg-muted text-sm font-semibold transition-colors">
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || loadingQuestions || !selectedTopic || hasInvalidDifficultyCounts || totalQuestions <= 0}
              className="px-6 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-semibold rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {isGenerating ? "Generating..." : "Generate Questions"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

