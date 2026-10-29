import { type QuestionType } from "@/lib/question-types";
import { getAssessmentScheduleState } from "@/lib/assessment-schedule";
export interface AssignedAssessment {
  _id: string; id?: string; title: string; description?: string; code?: string;
  type?: string; questionTypes?: string[]; difficulties?: string[]; difficulty?: string;
  durationMinutes: number; totalMarks: number; questionCount: number;
  startTime?: string; endTime?: string; status: string; attemptStatus?: string;
  attemptScore?: number; attemptPassed?: boolean; canRetake?: boolean; allowedAttempts?: number;
  completedAttemptsCount?: number;
  attemptStartedAt?: string; attemptExpiresAt?: string;
  resumeAttemptsUsed?: number; resumeAttemptsRemaining?: number; maxResumeAttempts?: number;
  targetSemesters?: string[]; targetSections?: string[]; targetGroups?: string[];
  targetCourses?: string[]; targetDepartments?: string[]; targetBatches?: string[];
  proctoring?: Record<string, unknown>;
}
export function formatSemesterScope(semesters?: string[]): string {
  if (!semesters || semesters.length === 0) return "All Semesters";
  const cleaned = semesters.map(s => String(s).replace(/^(semester|sem)[\s_-]*/i, '').trim()).filter(Boolean);
  if (!cleaned.length) return "All Semesters";
  if (cleaned.length === 1) return `Semester ${cleaned[0]}`;
  const sorted = [...new Set(cleaned)].sort((a, b) => Number(a) - Number(b));
  return `Semesters: ${sorted.join(", ")}`;
}
const aliases: Record<string, QuestionType> = {
  mcq: "MCQ", single_choice: "MCQ", multiple_choice: "MULTIPLE_CHOICE", true_false: "TRUE_FALSE",
  code_output: "CODE_OUTPUT", dsa: "DSA", coding: "DSA", algorithmic: "DSA",
};
export function assessmentTypes(assessment: AssignedAssessment): QuestionType[] {
  const types = (assessment.questionTypes?.length ? assessment.questionTypes : [assessment.type || ""])
    .map(value => aliases[value.toLowerCase()]).filter((value): value is QuestionType => !!value);
  return [...new Set(types)];
}
export function assessmentCompleted(assessment: AssignedAssessment) {
  return ["submitted", "auto_submitted"].includes(assessment.attemptStatus || "");
}
export function assessmentWindow(assessment: AssignedAssessment, now = Date.now()) {
  if (!["published", "ongoing"].includes(assessment.status)) return assessment.status === "completed" ? "Completed" : "Unavailable";
  const state = getAssessmentScheduleState(assessment.startTime, assessment.endTime, now);
  if (state === "invalid") return "Unavailable";
  return state === "expired" ? "Expired" : state === "upcoming" ? "Upcoming" : "Live";
}
export function canAttemptAssessment(assessment: AssignedAssessment, now = Date.now()) {
  if (assessment.attemptStatus === "in_progress") {
    if (assessment.resumeAttemptsRemaining !== undefined && assessment.resumeAttemptsRemaining <= 0) return false;
    if (assessment.attemptExpiresAt && new Date(assessment.attemptExpiresAt).getTime() <= now) return false;
  }
  return assessmentWindow(assessment, now) === "Live" && (!assessmentCompleted(assessment) || assessment.canRetake === true);
}

export function formatAssessmentTimeLeft(expiresAt: string | undefined, now: number): string {
  if (!expiresAt) return "—";
  const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  if (seconds <= 0) return "0m 00s";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}
