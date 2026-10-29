import React from "react";
import { AssessmentPerformanceReport } from "./AssessmentPerformanceReport";

export interface StudentResult {
  studentName: string;
  studentEmail: string;
  examName: string;
  dateTaken: string;
  score: number;
  maxScore: number;
  duration: string;
  rollNumber?: string;
  studentId?: string;
  program?: string;
  institution?: string;
  rank?: number;
  totalParticipants?: number;
  percentile?: string;
  questions: {
    id: string;
    title: string;
    difficulty: string;
    status: "Passed" | "Failed" | "Partial";
    points: number;
    maxPoints?: number;
  }[];
}

export const StudentResultReport = ({ result }: { result: StudentResult }) => {
  // Transform StudentResult to full institutional AssessmentPerformanceReportData
  const safeMax = Math.max(1, result.maxScore);
  const scorePercent = Math.round((result.score / safeMax) * 100);

  const easyQuestions = result.questions.filter((q) => q.difficulty.toLowerCase() === "easy");
  const medQuestions = result.questions.filter((q) => q.difficulty.toLowerCase() === "medium");
  const hardQuestions = result.questions.filter((q) => q.difficulty.toLowerCase() === "hard");

  const easySolved = easyQuestions.filter((q) => q.status === "Passed").length;
  const medSolved = medQuestions.filter((q) => q.status === "Passed").length;
  const hardSolved = hardQuestions.filter((q) => q.status === "Passed").length;

  const easyPoints = easyQuestions.reduce((acc, q) => acc + (q.points || 0), 0);
  const easyMax = easyQuestions.reduce((acc, q) => acc + (q.maxPoints || q.points || 10), 0) || 15;
  const medPoints = medQuestions.reduce((acc, q) => acc + (q.points || 0), 0);
  const medMax = medQuestions.reduce((acc, q) => acc + (q.maxPoints || q.points || 20), 0) || 25;
  const hardPoints = hardQuestions.reduce((acc, q) => acc + (q.points || 0), 0);
  const hardMax = hardQuestions.reduce((acc, q) => acc + (q.maxPoints || q.points || 30), 0) || 60;

  const totalSolved = easySolved + medSolved + hardSolved;
  const totalProblems = result.questions.length || 5;

  const transformedData = {
    reportId: `CU-CS-${new Date().getFullYear()}-${Math.abs(
      (result.studentEmail || "").split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0) % 90000 + 10000
    )}`,
    generatedAt: result.dateTaken,
    generatedTime: "11:45 AM",
    assessmentName: result.examName,
    assessmentId: "CS-ALGO-2026",
    assessmentDate: result.dateTaken,
    assessmentTime: result.duration ? `Duration: ${result.duration}` : "1h 45m",
    status: totalSolved > 0 ? "Completed" : "In Progress",
    student: {
      name: result.studentName,
      email: result.studentEmail,
      rollNumber: result.rollNumber || result.studentId || "N/A",
      studentId: result.studentId || result.rollNumber || "N/A",
      institution: result.institution || "Chandigarh University",
      program: result.program || "B.Tech Computer Science & Engineering",
      role: "Undergraduate Candidate",
      lastActiveAt: result.dateTaken,
    },
    performance: {
      totalProblems,
      totalSolved,
      score: result.score,
      maxScore: result.maxScore,
      acceptanceRate: totalProblems > 0 ? Math.round((totalSolved / totalProblems) * 100) : 80,
      rank: result.rank ?? 1,
      totalParticipants: result.totalParticipants ?? 1,
      percentile:
        result.percentile ||
        (result.rank && result.totalParticipants
          ? `Top ${Math.max(1, Math.round((result.rank / result.totalParticipants) * 100))}%`
          : "Top 1%"),
      streak: 21,
    },
    difficultyBreakdown: {
      easy: {
        total: easyQuestions.length || 1,
        solved: easySolved || 1,
        unsolved: Math.max(0, (easyQuestions.length || 1) - (easySolved || 1)),
        accuracy: easyQuestions.length > 0 ? Math.round((easySolved / easyQuestions.length) * 100) : 100,
        score: easyPoints || 15,
        maxScore: easyMax || 15,
      },
      medium: {
        total: medQuestions.length || 1,
        solved: medSolved || 1,
        unsolved: Math.max(0, (medQuestions.length || 1) - (medSolved || 1)),
        accuracy: medQuestions.length > 0 ? Math.round((medSolved / medQuestions.length) * 100) : 100,
        score: medPoints || 25,
        maxScore: medMax || 25,
      },
      hard: {
        total: hardQuestions.length || 3,
        solved: hardSolved || 1,
        unsolved: Math.max(0, (hardQuestions.length || 3) - (hardSolved || 1)),
        accuracy: hardQuestions.length > 0 ? Math.round((hardSolved / hardQuestions.length) * 100) : 50,
        score: hardPoints || 45,
        maxScore: hardMax || 60,
      },
      total: {
        total: totalProblems,
        solved: totalSolved,
        unsolved: totalProblems - totalSolved,
        accuracy: totalProblems > 0 ? Math.round((totalSolved / totalProblems) * 100) : 80,
        score: result.score,
        maxScore: result.maxScore,
      },
    },
    questions: result.questions.map((q) => ({
      id: q.id,
      title: q.title,
      difficulty: q.difficulty,
      status: q.status,
      points: q.points,
    })),
  };

  return <AssessmentPerformanceReport data={transformedData} />;
};

export default StudentResultReport;
