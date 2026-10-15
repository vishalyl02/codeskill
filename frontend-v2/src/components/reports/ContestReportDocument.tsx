import React from "react";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { ContestReportData, ProblemStatus } from "@/types/contest-report";
import { pdfStyles, PDF_COLORS } from "./pdf-styles";

export interface ContestReportDocumentProps {
  data: ContestReportData;
  logoSrc?: string;
}

// 1. Header Component
export function ReportHeader({ data, logoSrc }: { data: ContestReportData; logoSrc?: string }) {
  return (
    <View wrap={false}>
      <View style={pdfStyles.headerWrapper}>
        <View style={pdfStyles.headerLeft}>
          {logoSrc ? <Image src={logoSrc} style={pdfStyles.logoImage} /> : (
            <View style={pdfStyles.logoBox}>
              <Text style={pdfStyles.logoText}>&lt;/&gt;</Text>
            </View>
          )}
          <View style={pdfStyles.brandBlock}>
            <Text style={pdfStyles.brandTitle}>CodeSkill</Text>
            <Text style={pdfStyles.brandUniversity}>Chandigarh University</Text>
            <Text style={pdfStyles.brandDept}>Department of Skill Development &amp; Lab</Text>
          </View>
        </View>

        <View style={pdfStyles.headerRight}>
          <View style={pdfStyles.reportBadge}>
            <Text style={pdfStyles.reportBadgeText}>OFFICIAL EVALUATION RECORD</Text>
          </View>
          <Text style={pdfStyles.reportTitle}>STUDENT CONTEST REPORT</Text>
          <Text style={pdfStyles.reportSubtitle}>Performance &amp; Algorithmic Assessment Scorecard</Text>
        </View>
      </View>

      {/* Metadata Strip */}
      <View style={pdfStyles.metaStrip}>
        <View style={pdfStyles.metaItem}>
          <Text style={pdfStyles.metaLabel}>Contest Name</Text>
          <Text style={pdfStyles.metaValue}>{data.contest.name}</Text>
        </View>
        <View style={pdfStyles.metaItem}>
          <Text style={pdfStyles.metaLabel}>Contest ID</Text>
          <Text style={pdfStyles.metaValue}>{data.contest.id}</Text>
        </View>
        <View style={pdfStyles.metaItem}>
          <Text style={pdfStyles.metaLabel}>Date</Text>
          <Text style={pdfStyles.metaValue}>{data.contest.date}</Text>
        </View>
        <View style={pdfStyles.metaItem}>
          <Text style={pdfStyles.metaLabel}>Duration</Text>
          <Text style={pdfStyles.metaValue}>{data.contest.duration}</Text>
        </View>
        <View style={pdfStyles.metaItem}>
          <Text style={pdfStyles.metaLabel}>Generated On</Text>
          <Text style={pdfStyles.metaValue}>{data.contest.generatedOn}</Text>
        </View>
      </View>
    </View>
  );
}

// 2. Student Information Section
export function StudentInfoCard({ student }: { student: ContestReportData["student"] }) {
  return (
    <View style={pdfStyles.infoCard} wrap={false}>
      <View style={pdfStyles.infoRow}>
        <View style={pdfStyles.infoCol}>
          <Text style={pdfStyles.infoLabel}>Student Name</Text>
          <Text style={pdfStyles.infoValue}>{student.name}</Text>
        </View>
        <View style={pdfStyles.infoCol}>
          <Text style={pdfStyles.infoLabel}>University UID</Text>
          <Text style={pdfStyles.infoValue}>{student.uid}</Text>
        </View>
      </View>

      <View style={pdfStyles.infoRow}>
        <View style={pdfStyles.infoCol}>
          <Text style={pdfStyles.infoLabel}>Program &amp; Department</Text>
          <Text style={pdfStyles.infoValue}>{student.program}</Text>
        </View>
        <View style={pdfStyles.infoCol}>
          <Text style={pdfStyles.infoLabel}>Registration / Roll ID</Text>
          <Text style={pdfStyles.infoValue}>{student.registrationId || "N/A"}</Text>
        </View>
      </View>

      <View style={[pdfStyles.infoRow, { marginBottom: 0 }]}>
        <View style={{ width: "24%" }}>
          <Text style={pdfStyles.infoLabel}>Batch</Text>
          <Text style={pdfStyles.infoValue}>{student.batch}</Text>
        </View>
        <View style={{ width: "24%" }}>
          <Text style={pdfStyles.infoLabel}>Section</Text>
          <Text style={pdfStyles.infoValue}>{student.section}</Text>
        </View>
        <View style={{ width: "24%" }}>
          <Text style={pdfStyles.infoLabel}>Semester / Group</Text>
          <Text style={pdfStyles.infoValue}>
            {student.semester || "Semester 4"} {student.group ? `(${student.group})` : ""}
          </Text>
        </View>
        <View style={{ width: "24%" }}>
          <Text style={pdfStyles.infoLabel}>Official Email</Text>
          <Text style={[pdfStyles.infoValue, { fontSize: 7.5 }]}>{student.email}</Text>
        </View>
      </View>
    </View>
  );
}

// 3. Performance Summary KPIs (6 Cards)
export function PerformanceSummaryKPIs({ summary }: { summary: ContestReportData["summary"] }) {
  return (
    <View style={pdfStyles.kpiGrid} wrap={false}>
      <View style={pdfStyles.kpiCard}>
        <Text style={pdfStyles.kpiLabel}>Problems Solved</Text>
        <Text style={pdfStyles.kpiValue}>
          {summary.problemsSolved} <Text style={{ fontSize: 9, color: PDF_COLORS.muted }}>/ {summary.problemsAttempted}</Text>
        </Text>
        <Text style={pdfStyles.kpiSubtext}>Attempted: {summary.problemsAttempted}</Text>
      </View>

      <View style={pdfStyles.kpiCard}>
        <Text style={pdfStyles.kpiLabel}>Total Score</Text>
        <Text style={pdfStyles.kpiValue}>
          {summary.totalScore} <Text style={{ fontSize: 9, color: PDF_COLORS.muted }}>/ {summary.maxScore}</Text>
        </Text>
        <Text style={pdfStyles.kpiSubtext}>Max possible points</Text>
      </View>

      <View style={pdfStyles.kpiCard}>
        <Text style={pdfStyles.kpiLabel}>Campus Rank</Text>
        <Text style={pdfStyles.kpiValue}>#{summary.rank}</Text>
        <Text style={pdfStyles.kpiSubtext}>Out of {summary.totalParticipants} contestants</Text>
      </View>

      <View style={pdfStyles.kpiCardSecondary}>
        <Text style={pdfStyles.kpiLabel}>Solution Accuracy</Text>
        <Text style={pdfStyles.kpiValue}>{summary.accuracy}%</Text>
        <Text style={pdfStyles.kpiSubtext}>Solved vs Attempted</Text>
      </View>

      <View style={pdfStyles.kpiCardSecondary}>
        <Text style={pdfStyles.kpiLabel}>Percentile Score</Text>
        <Text style={pdfStyles.kpiValue}>{summary.percentile}%</Text>
        <Text style={pdfStyles.kpiSubtext}>Top {Math.max(1, Math.round(100 - summary.percentile))}% standing</Text>
      </View>

      <View style={pdfStyles.kpiCardSecondary}>
        <Text style={pdfStyles.kpiLabel}>Evaluation Status</Text>
        <Text style={[pdfStyles.kpiValue, { fontSize: 11, color: summary.accuracy >= 60 ? PDF_COLORS.success : PDF_COLORS.warning }]}>
          {summary.accuracy >= 60 ? "Qualified" : "Completed"}
        </Text>
        <Text style={pdfStyles.kpiSubtext}>Proctored submission</Text>
      </View>
    </View>
  );
}

// Helper: Status badge renderer for react-pdf
function renderStatusBadge(status: ProblemStatus) {
  switch (status) {
    case "Solved":
      return <Text style={pdfStyles.statusSolved}>Solved</Text>;
    case "Partially Solved":
      return <Text style={pdfStyles.statusPartial}>Partially Solved</Text>;
    case "Wrong Answer":
      return <Text style={pdfStyles.statusFailed}>Wrong Answer</Text>;
    case "Time Limit Exceeded":
      return <Text style={pdfStyles.statusFailed}>TLE</Text>;
    case "Runtime Error":
      return <Text style={pdfStyles.statusFailed}>Runtime Error</Text>;
    default:
      return <Text style={pdfStyles.statusUnattempted}>Not Attempted</Text>;
  }
}

// 4. Problem-Wise Performance Table
export function ProblemPerformanceTable({ problems }: { problems: ContestReportData["problems"] }) {
  return (
    <View style={pdfStyles.table}>
      {/* Table Header */}
      <View style={pdfStyles.tableHeader} fixed>
        <Text style={[pdfStyles.tableHeaderCell, { width: "5%" }]}>#</Text>
        <Text style={[pdfStyles.tableHeaderCell, { width: "35%" }]}>Problem Title</Text>
        <Text style={[pdfStyles.tableHeaderCell, { width: "12%" }]}>Difficulty</Text>
        <Text style={[pdfStyles.tableHeaderCell, { width: "18%", textAlign: "center" }]}>Status</Text>
        <Text style={[pdfStyles.tableHeaderCell, { width: "10%", textAlign: "right" }]}>Score</Text>
        <Text style={[pdfStyles.tableHeaderCell, { width: "10%", textAlign: "right" }]}>Time</Text>
        <Text style={[pdfStyles.tableHeaderCell, { width: "10%", textAlign: "right" }]}>Attempts</Text>
      </View>

      {/* Table Rows */}
      {problems.map((p, idx) => {
        const timeFormatted = p.timeTakenSeconds ? `${Math.round(p.timeTakenSeconds / 60)}m` : "—";
        const isAlt = idx % 2 === 1;
        return (
          <View key={p.index || idx} style={[pdfStyles.tableRow, isAlt ? pdfStyles.tableRowAlt : {}]} wrap={false}>
            <Text style={[pdfStyles.tableCellBold, { width: "5%" }]}>{p.index || idx + 1}</Text>
            <View style={{ width: "35%" }}>
              <Text style={pdfStyles.tableCellBold}>{p.title}</Text>
              {p.language && <Text style={pdfStyles.tableCellMuted}>{p.language}</Text>}
            </View>
            <Text style={[pdfStyles.tableCell, { width: "12%", color: p.difficulty === "Easy" ? PDF_COLORS.success : p.difficulty === "Medium" ? PDF_COLORS.warning : PDF_COLORS.danger }]}>
              {p.difficulty}
            </Text>
            <View style={{ width: "18%", alignItems: "center" }}>
              {renderStatusBadge(p.status)}
            </View>
            <Text style={[pdfStyles.tableCellBold, { width: "10%", textAlign: "right" }]}>
              {p.score} <Text style={pdfStyles.tableCellMuted}>/ {p.maxScore}</Text>
            </Text>
            <Text style={[pdfStyles.tableCell, { width: "10%", textAlign: "right" }]}>{timeFormatted}</Text>
            <Text style={[pdfStyles.tableCell, { width: "10%", textAlign: "right" }]}>{p.attempts || 1}</Text>
          </View>
        );
      })}
    </View>
  );
}

// 5. Performance Analysis & Topics
export function CodingAnalysisSection({ analysis }: { analysis?: ContestReportData["analysis"] }) {
  if (!analysis) return null;
  return (
    <View style={pdfStyles.infoCard} wrap={false}>
      <View style={pdfStyles.infoRow}>
        <View style={{ width: "24%" }}>
          <Text style={pdfStyles.infoLabel}>Total Submissions</Text>
          <Text style={pdfStyles.infoValue}>{analysis.totalAttempts}</Text>
        </View>
        <View style={{ width: "24%" }}>
          <Text style={pdfStyles.infoLabel}>Accepted Runs</Text>
          <Text style={[pdfStyles.infoValue, { color: PDF_COLORS.success }]}>{analysis.acceptedSubmissions}</Text>
        </View>
        <View style={{ width: "24%" }}>
          <Text style={pdfStyles.infoLabel}>Rejected Runs</Text>
          <Text style={[pdfStyles.infoValue, { color: PDF_COLORS.danger }]}>{analysis.rejectedSubmissions}</Text>
        </View>
        <View style={{ width: "24%" }}>
          <Text style={pdfStyles.infoLabel}>Submission Rate</Text>
          <Text style={pdfStyles.infoValue}>{analysis.acceptanceRate}%</Text>
        </View>
      </View>

      <View style={[pdfStyles.infoRow, { marginTop: 4, marginBottom: 0 }]}>
        <View style={{ width: "48%" }}>
          <Text style={pdfStyles.infoLabel}>Average Solution Time</Text>
          <Text style={pdfStyles.infoValue}>
            {analysis.avgTimePerSolvedProblemSeconds > 0
              ? `${Math.round(analysis.avgTimePerSolvedProblemSeconds / 60)} mins / problem`
              : "N/A"}
          </Text>
        </View>
        <View style={{ width: "48%" }}>
          <Text style={pdfStyles.infoLabel}>Fastest Solved Problem</Text>
          <Text style={pdfStyles.infoValue}>
            {analysis.fastestSolutionProblem
              ? `${analysis.fastestSolutionProblem} (${Math.round((analysis.fastestSolutionSeconds || 0) / 60)} mins)`
              : "N/A"}
          </Text>
        </View>
      </View>
    </View>
  );
}

// 6. Topic Performance Progress Bars
export function TopicAnalysisSection({ topics }: { topics?: ContestReportData["topics"] }) {
  if (!topics || topics.length === 0) return null;
  return (
    <View style={pdfStyles.infoCard} wrap={false}>
      {topics.map((t, idx) => (
        <View key={t.topic || idx} style={pdfStyles.topicRow}>
          <View style={pdfStyles.topicHeader}>
            <Text style={pdfStyles.topicName}>{t.topic}</Text>
            <Text style={pdfStyles.topicScore}>
              {t.solved} / {t.total} Solved ({t.percentage}%)
            </Text>
          </View>
          <View style={pdfStyles.progressBarBg}>
            <View style={[pdfStyles.progressBarFill, { width: `${Math.min(100, Math.max(0, t.percentage))}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

// 7. Difficulty Analysis Breakdown
export function DifficultyAnalysisSection({ difficulty }: { difficulty?: ContestReportData["difficulty"] }) {
  if (!difficulty) return null;
  return (
    <View style={pdfStyles.kpiGrid} wrap={false}>
      <View style={[pdfStyles.kpiCard, { width: "31.5%", borderLeftColor: PDF_COLORS.success }]}>
        <Text style={pdfStyles.kpiLabel}>Easy Tier</Text>
        <Text style={pdfStyles.kpiValue}>
          {difficulty.easy.solved} <Text style={{ fontSize: 9, color: PDF_COLORS.muted }}>/ {difficulty.easy.total}</Text>
        </Text>
        <Text style={pdfStyles.kpiSubtext}>
          {difficulty.easy.total > 0 ? `${Math.round((difficulty.easy.solved / difficulty.easy.total) * 100)}% clearance` : "N/A"}
        </Text>
      </View>

      <View style={[pdfStyles.kpiCard, { width: "31.5%", borderLeftColor: PDF_COLORS.warning }]}>
        <Text style={pdfStyles.kpiLabel}>Medium Tier</Text>
        <Text style={pdfStyles.kpiValue}>
          {difficulty.medium.solved} <Text style={{ fontSize: 9, color: PDF_COLORS.muted }}>/ {difficulty.medium.total}</Text>
        </Text>
        <Text style={pdfStyles.kpiSubtext}>
          {difficulty.medium.total > 0 ? `${Math.round((difficulty.medium.solved / difficulty.medium.total) * 100)}% clearance` : "N/A"}
        </Text>
      </View>

      <View style={[pdfStyles.kpiCard, { width: "31.5%", borderLeftColor: PDF_COLORS.danger }]}>
        <Text style={pdfStyles.kpiLabel}>Hard Tier</Text>
        <Text style={pdfStyles.kpiValue}>
          {difficulty.hard.solved} <Text style={{ fontSize: 9, color: PDF_COLORS.muted }}>/ {difficulty.hard.total}</Text>
        </Text>
        <Text style={pdfStyles.kpiSubtext}>
          {difficulty.hard.total > 0 ? `${Math.round((difficulty.hard.solved / difficulty.hard.total) * 100)}% clearance` : "N/A"}
        </Text>
      </View>
    </View>
  );
}

// 8. Submission Activity Timeline
export function SubmissionTimelineSection({ submissions }: { submissions?: ContestReportData["submissions"] }) {
  if (!submissions || submissions.length === 0) return null;
  return (
    <View style={pdfStyles.table} wrap={false}>
      <View style={pdfStyles.tableHeader}>
        <Text style={[pdfStyles.tableHeaderCell, { width: "18%" }]}>Timestamp</Text>
        <Text style={[pdfStyles.tableHeaderCell, { width: "42%" }]}>Problem</Text>
        <Text style={[pdfStyles.tableHeaderCell, { width: "25%" }]}>Evaluation Verdict</Text>
        <Text style={[pdfStyles.tableHeaderCell, { width: "15%", textAlign: "right" }]}>Score delta</Text>
      </View>
      {submissions.slice(0, 8).map((sub, i) => (
        <View key={i} style={[pdfStyles.tableRow, i % 2 === 1 ? pdfStyles.tableRowAlt : {}]}>
          <Text style={[pdfStyles.tableCellBold, { width: "18%" }]}>{sub.time}</Text>
          <Text style={[pdfStyles.tableCell, { width: "42%" }]}>{sub.problem}</Text>
          <Text
            style={[
              pdfStyles.tableCellBold,
              {
                width: "25%",
                color: sub.verdict === "Accepted" ? PDF_COLORS.success : sub.verdict === "Partial" ? PDF_COLORS.warning : PDF_COLORS.danger,
              },
            ]}
          >
            {sub.verdict}
          </Text>
          <Text style={[pdfStyles.tableCellBold, { width: "15%", textAlign: "right" }]}>{sub.scoreChange || "—"}</Text>
        </View>
      ))}
    </View>
  );
}

// 9. Faculty & Evaluator Remarks Section
export function EvaluatorRemarksSection({ evaluator }: { evaluator?: ContestReportData["evaluator"] }) {
  if (!evaluator) return null;
  return (
    <View style={pdfStyles.infoCard} wrap={false}>
      <Text style={pdfStyles.infoLabel}>Evaluator &amp; Faculty Assessment</Text>
      <Text style={[pdfStyles.summaryText, { marginVertical: 3 }]}>
        &quot;{evaluator.remarks || "Performance verified and standardized by automated sandbox judge and department evaluation committee."}&quot;
      </Text>
      <View style={[pdfStyles.infoRow, { marginTop: 4, marginBottom: 0 }]}>
        <View style={{ width: "50%" }}>
          <Text style={pdfStyles.infoLabel}>Evaluator / Reviewer</Text>
          <Text style={pdfStyles.infoValue}>{evaluator.facultyName}</Text>
          <Text style={[pdfStyles.infoValue, { fontSize: 7, color: PDF_COLORS.muted }]}>
            {[evaluator.designation, evaluator.department].filter(Boolean).join(" – ")}
          </Text>
        </View>
        <View style={{ width: "50%", alignItems: "flex-end" }}>
          <Text style={pdfStyles.infoLabel}>Verification Status</Text>
          <Text style={[pdfStyles.infoValue, { color: PDF_COLORS.success, fontSize: 8 }]}>
            {evaluator.signatureStatus || "Digitally Certified by Chandigarh University"}
          </Text>
          <Text style={[pdfStyles.infoValue, { fontSize: 7, color: PDF_COLORS.muted }]}>Date: {evaluator.evaluationDate}</Text>
        </View>
      </View>
    </View>
  );
}

// 10. Student Feedback Section
export function StudentFeedbackSection({ feedback }: { feedback?: ContestReportData["feedback"] }) {
  if (!feedback) return null;
  return (
    <View style={pdfStyles.twoColGrid} wrap={false}>
      <View style={[pdfStyles.colHalf, pdfStyles.infoCard]}>
        <Text style={[pdfStyles.infoLabel, { color: PDF_COLORS.success }]}>Key Strengths</Text>
        {feedback.strengths.map((item, idx) => (
          <Text key={idx} style={[pdfStyles.summaryText, { fontSize: 7.5, marginTop: 2 }]}>
            • {item}
          </Text>
        ))}
      </View>
      <View style={[pdfStyles.colHalf, pdfStyles.infoCard]}>
        <Text style={[pdfStyles.infoLabel, { color: PDF_COLORS.warning }]}>Recommended Focus Areas</Text>
        {feedback.recommendedTopics.map((item, idx) => (
          <Text key={idx} style={[pdfStyles.summaryText, { fontSize: 7.5, marginTop: 2 }]}>
            • {item}
          </Text>
        ))}
      </View>
    </View>
  );
}

// 11. Final Overall Summary Section
export function OverallSummarySection({ overall }: { overall?: ContestReportData["overall"] }) {
  if (!overall) return null;
  return (
    <View style={pdfStyles.summaryBox} wrap={false}>
      <Text style={[pdfStyles.infoLabel, { marginBottom: 2 }]}>Executive Performance Summary</Text>
      <Text style={pdfStyles.summaryText}>{overall.summaryText}</Text>
      {overall.recommendationText && (
        <Text style={[pdfStyles.summaryText, { marginTop: 4, fontFamily: "Helvetica-Bold", color: PDF_COLORS.primary }]}>
          Recommendation: {overall.recommendationText}
        </Text>
      )}
    </View>
  );
}

// 12. Universal Dynamic Footer
export function ReportFooter() {
  return (
    <View style={pdfStyles.footer} fixed>
      <Text style={pdfStyles.footerLeft}>CodeSkill • Chandigarh University (Department of Skill Development &amp; Lab)</Text>
      <Text style={pdfStyles.footerCenter}>Official Contest Performance Report</Text>
      <Text
        style={pdfStyles.footerRight}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

// Full A4 Multi-Page Contest Report Document
export function ContestReportDocument({ data, logoSrc }: ContestReportDocumentProps) {
  return (
    <Document
      title={`CodeSkill Contest Performance Report - ${data.student.name} (${data.student.uid})`}
      author="CodeSkill - Chandigarh University"
      subject="Student Contest Performance Report"
      keywords="CodeSkill, Coding Contest, Student Performance, Chandigarh University, Assessment"
    >
      <Page size="A4" orientation="portrait" style={pdfStyles.page}>
        {/* 1. Header with University Branding */}
        <ReportHeader data={data} logoSrc={logoSrc} />

        {/* 2. Student Credentials Card */}
        <View style={pdfStyles.sectionHeader}>
          <Text style={pdfStyles.sectionTitle}>Student Information</Text>
          <Text style={pdfStyles.sectionSubtitle}>Official Academic Profile</Text>
        </View>
        <StudentInfoCard student={data.student} />

        {/* 3. Performance Summary KPI Metrics */}
        <View style={pdfStyles.sectionHeader}>
          <Text style={pdfStyles.sectionTitle}>Performance Summary</Text>
          <Text style={pdfStyles.sectionSubtitle}>Contest Result Overview</Text>
        </View>
        <PerformanceSummaryKPIs summary={data.summary} />

        {/* 4. Problem-Wise Performance Table */}
        <View style={pdfStyles.sectionHeader}>
          <Text style={pdfStyles.sectionTitle}>Problem-Wise Evaluation</Text>
          <Text style={pdfStyles.sectionSubtitle}>{data.problems.length} Test Specifications</Text>
        </View>
        <ProblemPerformanceTable problems={data.problems} />

        {/* 5. Coding Performance Metrics Analysis */}
        {data.analysis && (
          <>
            <View style={pdfStyles.sectionHeader}>
              <Text style={pdfStyles.sectionTitle}>Coding Performance Analysis</Text>
              <Text style={pdfStyles.sectionSubtitle}>Submission &amp; Runtime Metrics</Text>
            </View>
            <CodingAnalysisSection analysis={data.analysis} />
          </>
        )}

        {/* 6. Topic Mastery & Difficulty Breakdown */}
        <View style={pdfStyles.twoColGrid} wrap={false}>
          <View style={pdfStyles.colHalf}>
            <View style={pdfStyles.sectionHeader}>
              <Text style={pdfStyles.sectionTitle}>Topic Analysis</Text>
            </View>
            <TopicAnalysisSection topics={data.topics} />
          </View>
          <View style={pdfStyles.colHalf}>
            <View style={pdfStyles.sectionHeader}>
              <Text style={pdfStyles.sectionTitle}>Difficulty Breakdown</Text>
            </View>
            <DifficultyAnalysisSection difficulty={data.difficulty} />
          </View>
        </View>

        {/* 7. Submission Timeline */}
        {data.submissions && data.submissions.length > 0 && (
          <>
            <View style={pdfStyles.sectionHeader}>
              <Text style={pdfStyles.sectionTitle}>Submission Activity Timeline</Text>
              <Text style={pdfStyles.sectionSubtitle}>Chronological Attempts</Text>
            </View>
            <SubmissionTimelineSection submissions={data.submissions} />
          </>
        )}

        {/* 8. Student Feedback & Focus Areas */}
        {data.feedback && (
          <>
            <View style={pdfStyles.sectionHeader}>
              <Text style={pdfStyles.sectionTitle}>Evaluator Feedback &amp; Development</Text>
              <Text style={pdfStyles.sectionSubtitle}>Targeted Skill Recommendations</Text>
            </View>
            <StudentFeedbackSection feedback={data.feedback} />
          </>
        )}

        {/* 9. Overall Summary */}
        {data.overall && (
          <>
            <View style={pdfStyles.sectionHeader}>
              <Text style={pdfStyles.sectionTitle}>Overall Assessment</Text>
            </View>
            <OverallSummarySection overall={data.overall} />
          </>
        )}

        {/* 10. Evaluator Remarks & Official Certification */}
        {data.evaluator && (
          <>
            <View style={pdfStyles.sectionHeader}>
              <Text style={pdfStyles.sectionTitle}>Department Verification</Text>
            </View>
            <EvaluatorRemarksSection evaluator={data.evaluator} />
          </>
        )}

        {/* Universal Footer with Page Numbers on all pages */}
        <ReportFooter />
      </Page>
    </Document>
  );
}

export default ContestReportDocument;
