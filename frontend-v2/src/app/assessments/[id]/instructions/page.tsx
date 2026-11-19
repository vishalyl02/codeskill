"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clock,
  Award,
  Layers,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import api, { studentAssessmentsAPI } from "@/config/api";
import { useAuth } from "@/context/AuthContext";
import { isLockdownClient, initializeLockdownAttestation } from "@/lib/lockdown-bridge";
import LockdownLaunchGate from "@/components/assessment/LockdownLaunchGate";
import { Spinner } from "@/components/ui/spinner";

export default function AssessmentInstructionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();
  const { user } = useAuth();

  const [assessment, setAssessment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    studentAssessmentsAPI
      .getOverview(id)
      .then((res) => {
        if (!cancelled) {
          setAssessment(res.data?.assessment || null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.response?.data?.message || err?.message || "Failed to load assessment instructions");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (isLockdownClient() && id) {
      void initializeLockdownAttestation(api, id);
    }
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border border-border p-6 rounded-2xl text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
          <h1 className="text-lg font-bold text-foreground">Assessment Unavailable</h1>
          <p className="text-sm text-muted-foreground">{error || "Could not find assessment details."}</p>
          <Link
            href="/assessments"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold"
          >
            Back to Assessments
          </Link>
        </div>
      </div>
    );
  }

  const security = assessment?.securityPolicy || {};
  const requiresLockdown = Boolean(
    assessment?.requireLockdown ||
    security.requireSEB ||
    security.requireLockdown ||
    security.secureExamMode === "STRICT" ||
    security.secureExamMode === "STANDARD"
  );

  // If LockDown is required and not running in LockDown client, show gate
  if (requiresLockdown && !isLockdownClient()) {
    return (
      <LockdownLaunchGate
        examId={id}
        examTitle={assessment.title}
        onClientDetected={() => router.refresh()}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2 border-b border-border pb-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <span>Assessment Instructions</span>
            {requiresLockdown && (
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                LockDown Active
              </span>
            )}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">{assessment.title}</h1>
          <p className="text-sm text-muted-foreground">{assessment.description || "Read all instructions carefully before starting."}</p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <Clock className="w-6 h-6 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-base font-bold">{assessment.durationMinutes || 60} Minutes</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <Award className="w-6 h-6 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Total Marks</p>
              <p className="text-base font-bold">{assessment.totalMarks || 100}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <Layers className="w-6 h-6 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Sections</p>
              <p className="text-base font-bold">{assessment.sections?.length || 1}</p>
            </div>
          </div>
        </section>

        <section className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            Exam Rules & Integrity Guidelines
          </h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <span>Full-screen kiosk mode is enforced throughout the examination.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <span>Switching applications, opening developer tools, or connecting secondary monitors is prohibited and flagged as an environmental violation.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <span>Your answers are automatically saved periodically during the assessment.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <span>Once started, the timer will continue running even if the window is closed.</span>
            </li>
          </ul>
        </section>

        <footer className="space-y-4 pt-4">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-sm font-medium">
              I have read, understood, and agree to abide by all the examination rules and proctoring requirements.
            </span>
          </label>

          <button
            disabled={!agreed}
            onClick={() => router.push(`/assessments/${id}/take`)}
            className="w-full py-3.5 px-6 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-all shadow-md cursor-pointer"
          >
            <span>Start Assessment</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </footer>
      </div>
    </div>
  );
}
