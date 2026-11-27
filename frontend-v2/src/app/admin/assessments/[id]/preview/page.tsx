"use client";

import { useParams } from "next/navigation";
import AssessmentBriefing from "@/components/assessment/AssessmentBriefing";

export default function AdminAssessmentPreviewPage() {
  const { id } = useParams<{ id: string }>();
  return <AssessmentBriefing key={id} id={id} adminPreview />;
}
