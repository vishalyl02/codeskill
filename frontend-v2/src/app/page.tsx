"use client";

import { Hero } from "@/components/landing/Hero";
import { TrustBar } from "@/components/landing/TrustBar";
import { ProblemTablePreview } from "@/components/landing/ProblemTablePreview";
import { CodingExperience } from "@/components/landing/CodingExperience";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { AssessmentPreview } from "@/components/landing/AssessmentPreview";
import { StudentAnalyticsPreview } from "@/components/landing/StudentAnalyticsPreview";
import { InstitutionalSection } from "@/components/landing/InstitutionalSection";
import { SupportedLanguages } from "@/components/landing/SupportedLanguages";
import { LeaderboardPreview } from "@/components/landing/LeaderboardPreview";
import { InteractiveListSection } from "@/components/landing/InteractiveListSection";
import { TopicsPreview } from "@/components/landing/TopicsPreview";
import { FinalCTA } from "@/components/landing/FinalCTA";

export default function Home() {
  return (
    <div className="codeskill-home flex w-full flex-1 flex-col bg-background font-sans text-foreground selection:bg-emerald-600 selection:text-white dark:selection:bg-emerald-400 dark:selection:text-slate-950">
      <Hero />
      <TrustBar />
      <ProblemTablePreview />
      <TopicsPreview />
      <CodingExperience />
      <FeatureGrid />
      <AssessmentPreview />
      <StudentAnalyticsPreview />
      <InstitutionalSection />
      <SupportedLanguages />
      <LeaderboardPreview />
      <InteractiveListSection />
      <FinalCTA />
    </div>
  );
}
