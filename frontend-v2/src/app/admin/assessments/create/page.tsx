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
  ShieldOff, AlertTriangle, GripVertical, Settings, Save, Sparkles, X, GraduationCap
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
  const [cohorts, setCohorts] = useState<StudentCohort[]>([]);
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
        });

        const semesters = Array.isArray(assessment.targetSemesters) ? assessment.targetSemesters.map(String) : [];
        setAutoSelections(Object.fromEntries(sections
          .filter((section) => section.autoSelection)
          .map((section) => [section.id, section.autoSelection as AutoSelectionCriteria])));
        setEditingId(assessmentId);
        setTargetSemesters(semesters);
        setSelectedYears(Array.from(new Set(semesters.map((semester: string) => String(Math.ceil(Number(semester) / 2))))));
        setTargetSections(Array.isArray(assessment.targetSections) ? assessment.targetSections : []);
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
    const loadCohorts = async () => {
      try {
        const firstPage = await adminUsersAPI.getAll("", false, 1, 100);
        const payload = firstPage.data?.users ? firstPage.data : firstPage.data?.data || {};
        const users = [...(payload.users || [])];
        const pageCount = Number(payload.pages) || 1;
        const remainingPages = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
          adminUsersAPI.getAll("", false, index + 2, 100),
        ));
        remainingPages.forEach((response: any) => {
          const pagePayload = response.data?.users ? response.data : response.data?.data || {};
          users.push(...(pagePayload.users || []));
        });
        const rows = users
          .filter((user: any) => user.role === "student" || user.isAssessmentStudent)
          .map((user: any) => {
            const profile = user.studentProfile || {};
            const semester = profile.semester == null ? "" : String(profile.semester);
            return { semester, section: profile.section == null ? "" : String(profile.section).trim() };
          })
          .filter((row: StudentCohort) => /^\d+$/.test(row.semester));
        if (active) setCohorts(rows);
      } catch {
        if (active) setCohorts([]);
      }
    };
    void loadCohorts();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setPreviewNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const years = ["1", "2", "3", "4"];
  const allSemesters = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const visibleSemesters = selectedYears.length
    ? Array.from(new Set(selectedYears.flatMap((year) => {
        const firstSemester = (Number(year) - 1) * 2 + 1;
        return [String(firstSemester), String(firstSemester + 1)];
      }))).sort((a, b) => Number(a) - Number(b))
    : allSemesters;
  const sectionOptions = getStandardizedSectionOptions([
    ...targetSections,
    ...cohorts
      .filter((cohort) => !targetSemesters.length || targetSemesters.includes(cohort.semester))
      .map((cohort) => cohort.section)
      .filter(Boolean),
  ]);

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
            <div className="md:col-span-4 p-3.5 bg-muted/30 border border-border/70 rounded-xl text-xs space-y-1">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-primary" />
                Target Audience Cohort Preview:
              </span>
              <p className="text-muted-foreground">
                {targetSemesters.length || selectedYears.length || targetSections.length || targetGroup ? (
                  <span>
                    {selectedYears.length ? <strong className="text-foreground">Year {selectedYears.join(", ")}</strong> : null}
                    {selectedYears.length && (targetSemesters.length || visibleSemesters.length) ? " • " : ""}
                    {targetSemesters.length ? <strong className="text-foreground">Semester {targetSemesters.join(", ")}</strong> : selectedYears.length ? <strong className="text-foreground">Semesters {visibleSemesters.join(", ")}</strong> : null}
                    {" • "}
                    {targetSections.length ? <span className="text-foreground font-medium">Sections: {targetSections.join(", ")}</span> : "All Sections"}
                    {" • "}
                    {targetGroup ? <span className="text-foreground font-medium">Group: {targetGroup.toUpperCase()}</span> : "All Groups"}
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Open Access (available to all registered students)</span>
                )}
              </p>
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

