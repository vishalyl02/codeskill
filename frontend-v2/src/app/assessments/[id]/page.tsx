"use client";

import { use } from "react";
import AssessmentBriefing from "@/components/assessment/AssessmentBriefing";

export default function AssessmentBriefingPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <AssessmentBriefing key={id} id={id} />;
}
