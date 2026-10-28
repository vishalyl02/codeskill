"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Award,
  Layers,
  ShieldAlert,
  BarChart3,
  Edit3,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Users,
  GraduationCap,
  Play,
  RotateCcw,
  Sparkles,
  ChevronRight,
  HelpCircle,
  FileText
} from "lucide-react";
import { adminAssessmentsAPI } from "@/config/api";
import toast from "react-hot-toast";

export default function AdminAssessmentDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [assessment, setAssessment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const fetchAssessment = async () => {
    setLoading(true);
    try {
      const res = await adminAssessmentsAPI.getById(id);
      const data = res.data?.data || res.data;
      setAssessment(data);
    } catch (err: any) {
      console.error("Failed to load assessment:", err);
      toast.error(err.response?.data?.message || "Failed to load assessment details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessment();
  }, [id]);

  const handleCopyLink = () => {
    if (!assessment) return;
    const url = `${window.location.origin}/assessments/${assessment.id || assessment._id || id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Candidate link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleStatus = async () => {
    if (!assessment) return;
    const newStatus = assessment.status === "live" ? "draft" : "live";
    setStatusUpdating(true);
    try {
      await adminAssessmentsAPI.updateStatus(id, newStatus);
      setAssessment((prev: any) => ({ ...prev, status: newStatus }));
      toast.success(`Assessment is now ${newStatus === "live" ? "Live" : "Draft"}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status");
    } finally {
      setStatusUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted animate-pulse" />
          <div className="space-y-2">
            <div className="w-64 h-6 rounded bg-muted animate-pulse" />
            <div className="w-40 h-4 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="p-12 max-w-xl mx-auto text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold">Assessment Not Found</h2>
        <p className="text-sm text-muted-foreground">
          The requested assessment ID does not exist or may have been deleted.
        </p>
        <Link
          href="/admin/assessments"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Assessments
        </Link>
      </div>
    );
  }

  const isLive = assessment.status === "live";
  const questions = assessment.questions || [];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8 font-sans">
      {/* Header Breadcrumb & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="flex items-start gap-3">
          <Link
            href="/admin/assessments"
            className="p-2.5 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-all shrink-0 mt-0.5"
            title="Back to all assessments"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                {assessment.title}
              </h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Chandigarh University
              </span>
              {assessment.code && (
                <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-muted text-foreground border border-border">
                  {assessment.code}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-3xl line-clamp-2">
              {assessment.description || "No description provided for this examination."}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleStatus}
            disabled={statusUpdating}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-xs ${
              isLive
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`} />
            <span>{isLive ? "Assessment Live" : "Draft / Disabled"}</span>
          </button>

          <button
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground transition-all shadow-xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
            <span>{copied ? "Copied" : "Candidate Link"}</span>
          </button>

          <Link
            href={`/assessments/${assessment.id || assessment._id || id}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground transition-all shadow-xs"
          >
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Candidate Preview</span>
          </Link>

          <Link
            href={`/admin/assessments/create?id=${encodeURIComponent(assessment.id || assessment._id || id)}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all shadow-sm"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit Test</span>
          </Link>
        </div>
      </div>

      {/* Module Hub Quick Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Results & Submissions */}
        <Link
          href={`/admin/assessments/${id}/results`}
          className="group p-5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all shadow-xs hover:shadow-md space-y-3 relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
              Candidate Results &amp; Attempts
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              View individual student submissions, proctoring penalties, scores, and downloadable audit reports.
            </p>
          </div>
        </Link>

        {/* Analytics & Performance */}
        <Link
          href={`/admin/assessments/${id}/analytics`}
          className="group p-5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all shadow-xs hover:shadow-md space-y-3 relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold">
              <BarChart3 className="w-5 h-5" />
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-foreground group-hover:text-purple-400 transition-colors">
              Deep Analytics &amp; Integrity
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Proctoring violations timeline, tab switches, device fingerprinting, and difficulty drop-off rates.
            </p>
          </div>
        </Link>

        {/* Exam Scheduling & Slots */}
        <Link
          href="/admin/assessments/scheduling"
          className="group p-5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all shadow-xs hover:shadow-md space-y-3 relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-foreground group-hover:text-emerald-400 transition-colors">
              Scheduling &amp; Slot Allocation
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Manage time slots, assign cohorts by batch/semester/section, and control live exam attendance.
            </p>
          </div>
        </Link>

        {/* Question Bank & Configuration */}
        <Link
          href={`/admin/assessments/create?id=${encodeURIComponent(id)}`}
          className="group p-5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all shadow-xs hover:shadow-md space-y-3 relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-foreground group-hover:text-amber-400 transition-colors">
              Edit Questions &amp; Security
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Modify question weights, test durations, allowed attempts, negative marking, and proctoring rules.
            </p>
          </div>
        </Link>
      </div>

      {/* Key Specifications Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Duration
          </p>
          <p className="font-extrabold text-xl mt-1.5">{assessment.durationMinutes || 0} mins</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Award className="w-3.5 h-3.5" /> Total Marks
          </p>
          <p className="font-extrabold text-xl mt-1.5 text-primary">{assessment.totalMarks || 100}</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Passing Marks
          </p>
          <p className="font-extrabold text-xl mt-1.5 text-emerald-500">{assessment.passingMarks || 40}</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Layers className="w-3.5 h-3.5" /> Questions
          </p>
          <p className="font-extrabold text-xl mt-1.5">{questions.length}</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> Allowed Attempts
          </p>
          <p className="font-extrabold text-xl mt-1.5">
            {assessment.allowedAttempts === 0
              ? "Unlimited"
              : assessment.allowedAttempts === 1
              ? "1 Attempt"
              : `${assessment.allowedAttempts} Attempts`}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> Anti-Cheat
          </p>
          <p className="font-bold text-sm mt-2 text-emerald-400">Strict Active</p>
        </div>
      </div>

      {/* Targeting & Eligibility */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
        <h3 className="font-bold text-base flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-primary" /> Target Audience &amp; Academic Scope
        </h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {assessment.targetSemesters && assessment.targetSemesters.length > 0 ? (
            <span className="px-3 py-1.5 rounded-xl font-bold bg-primary/10 text-primary border border-primary/20">
              Semesters: {assessment.targetSemesters.join(", ")}
            </span>
          ) : (
            <span className="px-3 py-1.5 rounded-xl font-medium bg-muted text-muted-foreground border border-border">
              All Semesters Eligible
            </span>
          )}

          {assessment.targetSections && assessment.targetSections.length > 0 && (
            <span className="px-3 py-1.5 rounded-xl font-medium bg-muted text-foreground border border-border">
              Sections: {assessment.targetSections.join(", ")}
            </span>
          )}

          {assessment.targetGroups && assessment.targetGroups.length > 0 && (
            <span className="px-3 py-1.5 rounded-xl font-medium bg-muted text-foreground border border-border">
              Groups: {assessment.targetGroups.join(", ")}
            </span>
          )}

          {assessment.targetBatches && assessment.targetBatches.length > 0 && (
            <span className="px-3 py-1.5 rounded-xl font-medium bg-muted text-foreground border border-border">
              Batches: {assessment.targetBatches.join(", ")}
            </span>
          )}
        </div>
      </div>

      {/* Questions Breakdown */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Questions In Assessment ({questions.length})
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configured questions assigned to this examination.
            </p>
          </div>
          <Link
            href={`/admin/assessments/create?id=${encodeURIComponent(id)}`}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            Manage Questions <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto border border-border rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase font-semibold">
              <tr>
                <th className="p-3 w-12">#</th>
                <th className="p-3">Question Title / Prompt</th>
                <th className="p-3 w-28">Type</th>
                <th className="p-3 w-24">Difficulty</th>
                <th className="p-3 w-20 text-right">Marks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {questions.map((q: any, idx: number) => {
                const diff = (q.difficulty || "medium").toLowerCase();
                const diffColor =
                  diff === "easy"
                    ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
                    : diff === "hard"
                    ? "text-rose-500 bg-rose-500/10 border-rose-500/20"
                    : "text-amber-500 bg-amber-500/10 border-amber-500/20";

                return (
                  <tr key={q.id || q._id || idx} className="hover:bg-muted/30">
                    <td className="p-3 font-mono font-bold text-muted-foreground">{idx + 1}</td>
                    <td className="p-3">
                      <div className="font-medium text-foreground line-clamp-1">
                        {q.title || q.prompt || "Untitled Question"}
                      </div>
                      {q.tags && q.tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {q.tags.slice(0, 3).map((t: string) => (
                            <span key={t} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-3 uppercase font-mono text-[11px] text-muted-foreground">
                      {q.type || "MCQ"}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${diffColor}`}>
                        {diff}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {q.marks || 1}
                    </td>
                  </tr>
                );
              })}
              {questions.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No questions have been added to this assessment yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
