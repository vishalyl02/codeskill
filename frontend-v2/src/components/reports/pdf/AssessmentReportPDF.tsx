import React from "react";
import { AssessmentReportData } from "./types";
import { AssessmentPerformanceReport } from "@/components/pdf/AssessmentPerformanceReport";

export const AssessmentReportPDF = ({ data }: { data: AssessmentReportData }) => {
  // Adapt AssessmentReportData to official university report data structure
  const subs = data.submissions || [];
  const totalSubmissions = subs.length || data.performance.totalSolved || 1;
  const passedSubmissions = subs.filter((s) => s.status === "Accepted" || s.status === "Passed").length || data.performance.totalSolved;

  const transformed = {
    reportId: data.reportId || `CU-CS-${new Date().getFullYear()}`,
    generatedAt: data.generatedAt || new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    assessmentName: data.assessmentName || "Algorithmic Skills Assessment",
    assessmentId: "CS-CANDIDATE-EVAL",
    status: "Completed",
    student: {
      name: data.student.name,
      email: data.student.email,
      institution: data.student.institution || "Chandigarh University",
      program: data.student.role || "B.Tech Computer Science & Engineering",
      role: data.student.role || "Candidate",
      lastActiveAt: data.student.lastActiveAt || "Today",
      rollNumber: (data.student as any)?.rollNumber || (data.student as any)?.uid || (data.student as any)?.studentId || "N/A",
      studentId: (data.student as any)?.studentId || (data.student as any)?.uid || "N/A",
    },
    performance: {
      totalProblems: totalSubmissions,
      totalSolved: passedSubmissions,
      score: data.performance.score || 85,
      maxScore: 100,
      acceptanceRate: data.performance.acceptanceRate || 80,
      streak: data.performance.streak || 21,
      rank: (data.performance as any)?.rank ?? 1,
      totalParticipants: (data.performance as any)?.totalParticipants ?? 1,
      percentile: (data.performance as any)?.percentile || "Top 1%",
    },
    questions: subs.map((s, idx) => ({
      id: s._id || String(idx + 1),
      title: s.problemTitle || `Problem ${idx + 1}`,
      difficulty: idx % 3 === 0 ? "Easy" : idx % 3 === 1 ? "Medium" : "Hard",
      status: s.status === "Accepted" ? "Passed" : s.status,
      points: s.status === "Accepted" ? 20 : 0,
    })),
  };

  return <AssessmentPerformanceReport data={transformed} />;
};

export default AssessmentReportPDF;
