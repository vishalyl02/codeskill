import React from "react";
import { AssessmentReportData } from "./types";
import { AssessmentPerformanceReport } from "@/components/pdf/AssessmentPerformanceReport";

export const AssessmentReportPDF = ({ data }: { data: AssessmentReportData }) => {
  // Adapt AssessmentReportData to official university report data structure
  const subs = data?.submissions || [];
  const student = (data?.student || {}) as any;
  const performance = (data?.performance || {}) as any;

  const totalSubmissions = subs.length || performance.totalSolved || 1;
  const passedSubmissions =
    subs.filter((s) => s.status === "Accepted" || s.status === "Passed").length ||
    performance.totalSolved ||
    0;

  const transformed = {
    reportId: data?.reportId || `CU-CS-${new Date().getFullYear()}`,
    generatedAt:
      data?.generatedAt ||
      new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    assessmentName: data?.assessmentName || "Algorithmic Skills Assessment",
    assessmentId: "CS-CANDIDATE-EVAL",
    status: "Completed",
    student: {
      name: student.name || "Candidate",
      email: student.email || "N/A",
      institution: student.institution || "Chandigarh University",
      program: student.program || student.role || "B.Tech Computer Science & Engineering",
      role: student.role || "Candidate",
      lastActiveAt: student.lastActiveAt || "Today",
      rollNumber: student.rollNumber || student.uid || student.studentId || "N/A",
      studentId: student.studentId || student.uid || "N/A",
    },
    performance: {
      totalProblems: totalSubmissions,
      totalSolved: passedSubmissions,
      score: performance.score ?? (passedSubmissions * 20),
      maxScore: performance.maxScore || 100,
      acceptanceRate:
        performance.acceptanceRate ??
        (totalSubmissions > 0 ? Math.round((passedSubmissions / totalSubmissions) * 100) : 0),
      streak: performance.streak || 0,
      rank: performance.rank ?? 1,
      totalParticipants: performance.totalParticipants ?? 1,
      percentile: performance.percentile || "Top 1%",
    },
    questions: subs.map((s, idx) => ({
      id: s._id || String(idx + 1),
      title: s.problemTitle || `Problem ${idx + 1}`,
      difficulty: idx % 3 === 0 ? "Easy" : idx % 3 === 1 ? "Medium" : "Hard",
      status: s.status === "Accepted" ? "Passed" : (s.status || "Pending"),
      points: s.status === "Accepted" ? 20 : 0,
    })),
  };

  return <AssessmentPerformanceReport data={transformed} />;
};

export default AssessmentReportPDF;
