"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminAssessmentsAPI, adminQuestionsAPI } from "@/config/api";
import { useAssessmentStore } from "./_store/useAssessmentStore";
import QuestionPicker from "./_components/QuestionPicker";
import {
  ArrowLeft, CheckCircle2, Clock, Plus, Trash2, ShieldAlert,
  GripVertical, Settings, Save, Sparkles, X
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ToastProvider, useToast } from "../../questions/create/_components/Toast"; // Reuse toast

type StudentCohort = { semester: string; section: string };

function yearLabel(year: string) {
  const suffix = Number(year) % 10 === 1 && Number(year) !== 11 ? "st"
    : Number(year) % 10 === 2 && Number(year) !== 12 ? "nd"
      : Number(year) % 10 === 3 && Number(year) !== 13 ? "rd" : "th";
  return `${year}${suffix} Year`;
}

function optionLabel(label: string, value: string) {
  if (label === "Year") return yearLabel(value);
  if (label === "Semester") return `Semester ${value}`;
  return value;
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function MultiSelectDropdown({
  label,
  placeholder,
  options,
  selected,
  onChange,
  disabled = false,
}: {
  label: string;
  placeholder: string;
  options: string[];
  selected: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative space-y-1.5">
      <label className="text-xs font-semibold">{label}</label>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-label={`Choose ${label.toLowerCase()}`}
        onClick={() => setOpen((value) => !value)}
        className="w-full min-h-11 px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm text-left flex items-center justify-between gap-3 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-1 focus:ring-primary"
      >
        <span className={selected.length ? "text-foreground truncate" : "text-muted-foreground truncate"}>
          {selected.length ? selected.map((value) => optionLabel(label, value)).join(", ") : placeholder}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">{open ? "▴" : "▾"}</span>
      </button>
      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-lg">
          {options.length ? options.map((option) => (
            <label key={option} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-muted/60">
              <input type="checkbox" checked={selected.includes(option)} onChange={() => onChange(option)} className="rounded text-primary focus:ring-primary" />
              <span>{optionLabel(label, option)}</span>
            </label>
          )) : <p className="px-2.5 py-2 text-xs text-muted-foreground">No {label.toLowerCase()} options found in student profiles.</p>}
        </div>
      )}
    </div>
  );
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
  const [isPublishing, setIsPublishing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [cohorts, setCohorts] = useState<StudentCohort[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [targetSemesters, setTargetSemesters] = useState<string[]>([]);
  const [targetSections, setTargetSections] = useState<string[]>([]);
  const [targetGroup, setTargetGroup] = useState<"" | "a" | "b" | "both">("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

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
        remainingPages.forEach((response) => {
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

  const years = ["1", "2", "3", "4"];
  const visibleSemesters = Array.from(new Set(selectedYears.flatMap((year) => {
    const firstSemester = (Number(year) - 1) * 2 + 1;
    return [String(firstSemester), String(firstSemester + 1)];
  }))).sort((a, b) => Number(a) - Number(b));
  const visibleSections = Array.from(new Set(cohorts
    .filter((cohort) => targetSemesters.includes(cohort.semester))
    .map((cohort) => cohort.section).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const sectionOptions = visibleSections;

  const updateYears = (year: string) => {
    setSelectedYears((current) => toggleValue(current, year));
    setTargetSemesters([]);
    setTargetSections([]);
    setTargetGroup("");
  };

  const updateSemesters = (semester: string) => {
    setTargetSemesters((current) => toggleValue(current, semester));
    setTargetSections([]);
    setTargetGroup("");
  };

  const updateGroup = (group: "a" | "b" | "both") => {
    setTargetGroup(group);
  };

  // Calculate totals
  const totalQuestions = store.sections.reduce((acc, sec) => acc + sec.questions.length, 0);
  const totalMarks = store.sections.reduce((acc, sec) => acc + sec.questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0), 0);

  const allSelectedQuestionIds = store.sections.flatMap((section) => section.questions.map((q) => q.questionId));
  const duplicateQuestionIds = Array.from(
    new Set(allSelectedQuestionIds.filter((questionId, index) => allSelectedQuestionIds.indexOf(questionId) !== index)),
  );
  const hasDuplicateQuestions = duplicateQuestionIds.length > 0;

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
    if (!(Number(store.durationMinutes) > 0)) {
      addToast("error", "Validation Error", "Duration must be at least 1 minute.");
      return;
    }
    if (store.passingMarks !== '' && (Number(store.passingMarks) < 0 || Number(store.passingMarks) > totalMarks)) {
      addToast("error", "Validation Error", `Passing marks must be between 0 and total marks (${totalMarks}).`);
      return;
    }

    setIsPublishing(true);
    try {
      await adminAssessmentsAPI.create({
        title: store.title,
        code: store.code,
        description: store.description,
        durationMinutes: store.durationMinutes,
        passingMarks: store.passingMarks ? Number(store.passingMarks) : Math.ceil(totalMarks * 0.4),
        category: store.category,
        allowedAttempts: store.allowedAttempts,
        targetSemesters: targetSemesters.length ? targetSemesters : selectedYears.length ? visibleSemesters : [],
        targetSections,
        targetGroups: targetGroup === "both" ? ["A", "B"] : targetGroup ? [targetGroup.toUpperCase()] : [],
        startTime: startTime ? new Date(startTime).toISOString() : undefined,
        endTime: endTime ? new Date(endTime).toISOString() : undefined,
        negativeMarking: store.negativeMarking,
        proctoring: store.proctoring,
        instructions: store.instructions,
        status,
        sections: store.sections.map(s => ({
          title: s.title,
          description: s.description,
          order: s.order,
          timeLimit: s.timeLimit,
          questions: s.questions.map(q => ({
            questionId: q.questionId,
            marks: Number(q.marks),
            negativeMarks: Number(q.negativeMarks),
            order: q.order
          }))
        }))
      });

      addToast("success", "Success", `Assessment ${status === 'published' ? 'published' : 'saved as draft'}`);
      setTimeout(() => router.push("/admin/assessments"), 1000);
    } catch (err: unknown) {
      const message = err && typeof err === "object" && "response" in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      addToast("error", "Error", message || "Failed to create assessment.");
      setIsPublishing(false);
      setShowConfirm(false);
    }
  };

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
              <h1 className="text-base font-bold text-foreground">Assessment Builder</h1>
              <p className="text-[11px] text-muted-foreground font-medium">Design professional evaluations.</p>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 pb-5 border-b border-border">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Duration (min)</label>
              <input type="number" value={store.durationMinutes} onChange={e => store.setDurationMinutes(Number(e.target.value))} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" />
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background cursor-pointer">
              <input type="checkbox" checked={store.proctoring.enforceFullscreen} onChange={e => store.setProctoring({ enforceFullscreen: e.target.checked })} className="rounded text-primary focus:ring-primary w-4 h-4" />
              <span className="text-sm font-semibold">Enforce Fullscreen</span>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background cursor-pointer">
              <input type="checkbox" checked={store.proctoring.blockCopyPaste} onChange={e => store.setProctoring({ blockCopyPaste: e.target.checked })} className="rounded text-primary focus:ring-primary w-4 h-4" />
              <span className="text-sm font-semibold">Block Copy/Paste</span>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background cursor-pointer">
              <input type="checkbox" checked={store.proctoring.detectTabSwitch} onChange={e => store.setProctoring({ detectTabSwitch: e.target.checked })} className="rounded text-primary focus:ring-primary w-4 h-4" />
              <span className="text-sm font-semibold">Detect Tab Switches</span>
            </label>
          </div>
        </section>

        {/* Audience and availability */}
        <section className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2"><Settings className="w-4 h-4 text-primary" /> Student access & timing</h2>
            <p className="text-xs text-muted-foreground mt-1">Leave a filter empty to make the assessment available to everyone in that category.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <MultiSelectDropdown label="Year" placeholder="Choose student year(s)" options={years} selected={selectedYears} onChange={updateYears} />
            <MultiSelectDropdown label="Semester" placeholder={selectedYears.length ? "Choose semester(s)" : "Choose year first"} options={visibleSemesters} selected={targetSemesters} onChange={updateSemesters} disabled={!visibleSemesters.length} />
            <MultiSelectDropdown label="Section" placeholder={targetSemesters.length ? "Choose section(s)" : "Choose semester first"} options={sectionOptions} selected={targetSections} onChange={(section) => {
              setTargetSections((current) => toggleValue(current, section));
              setTargetGroup("");
            }} disabled={!targetSemesters.length} />
            <div className="space-y-1.5">
              <label htmlFor="assessment-target-group" className="text-xs font-semibold">Group</label>
              <select id="assessment-target-group" value={targetGroup} onChange={(event) => updateGroup(event.target.value as "a" | "b" | "both")} disabled={!targetSections.length} className="w-full min-h-11 px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed">
                <option value="" disabled>Choose section first</option>
                <option value="a">Group A</option>
                <option value="b">Group B</option>
                <option value="both">Both</option>
              </select>
            </div>
            <p className="md:col-span-4 -mt-2 text-[11px] text-muted-foreground">Choose year, semester, section, then group. Section options come from matching student profiles.</p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Available from</label>
              <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Available until</label>
              <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:ring-1 focus:ring-primary" />
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
                        <button onClick={() => setActivePicker(section.id)} className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm">
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
                              <input type="number" min={1} value={q.marks} onChange={e => store.updateQuestionConfig(section.id, q.questionId, { marks: Number(e.target.value) })} className="w-12 bg-transparent border-none text-xs font-mono font-bold text-emerald-500 focus:ring-0 p-0 text-center" />
                            </div>
                            <div className="flex items-center gap-2 bg-muted/50 px-2 py-1 rounded-lg border border-border">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase">Neg</span>
                              <input type="number" min={0} value={q.negativeMarks} onChange={e => store.updateQuestionConfig(section.id, q.questionId, { negativeMarks: Number(e.target.value) })} className="w-10 bg-transparent border-none text-xs font-mono font-bold text-rose-500 focus:ring-0 p-0 text-center" />
                            </div>
                            <button onClick={() => store.removeQuestionFromSection(section.id, q.questionId)} className="p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 rounded-md transition-colors ml-auto sm:ml-0">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 flex flex-col sm:flex-row gap-2">
                        <button onClick={() => setAutoGenerateSectionId(section.id)} className="flex-1 py-3 border border-primary/30 bg-primary/5 text-primary rounded-xl text-xs font-semibold hover:bg-primary/10 transition-colors flex items-center justify-center gap-2">
                          <Sparkles className="w-4 h-4" /> Auto Generate from Bank
                        </button>
                        <button onClick={() => setActivePicker(section.id)} className="flex-1 py-3 border border-dashed border-border rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors flex items-center justify-center gap-2">
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
        <AutoGenerateFromBank sectionId={autoGenerateSectionId} onClose={() => setAutoGenerateSectionId(null)} />
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

function AutoGenerateFromBank({ sectionId, onClose }: { sectionId: string; onClose: () => void }) {
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

