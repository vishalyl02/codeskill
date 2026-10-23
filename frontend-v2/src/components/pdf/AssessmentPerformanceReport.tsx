import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { CU_LOGO_BASE64, BRAND_COLORS } from "./cu-assets";
import {
  ShieldCheckIcon,
  TrophyIcon,
  TargetIcon,
  CheckCircleIcon,
  AwardIcon,
  ClockIcon,
  CalendarIcon,
  DepartmentSeal,
} from "./cu-icons";
import { ScoreDonutChart } from "./ScoreDonutChart";

export interface AssessmentPerformanceReportProps {
  data: {
    reportId?: string;
    generatedAt?: string;
    generatedTime?: string;
    assessmentName?: string;
    assessmentId?: string;
    assessmentDate?: string;
    assessmentTime?: string;
    status?: "Completed" | "Pending" | "In Progress" | string;
    student: {
      name: string;
      email: string;
      rollNumber?: string;
      studentId?: string;
      institution?: string;
      program?: string;
      role?: string;
      joinedAt?: string;
      lastActiveAt?: string;
      avatarUrl?: string;
    };
    performance: {
      totalProblems?: number;
      totalSolved: number;
      score: number;
      maxScore?: number;
      acceptanceRate?: number;
      rank?: number | string;
      totalParticipants?: number;
      percentile?: number | string;
      streak?: number;
    };
    difficultyBreakdown?: {
      easy: { total: number; solved: number; unsolved: number; accuracy: number; score?: number; maxScore?: number };
      medium: { total: number; solved: number; unsolved: number; accuracy: number; score?: number; maxScore?: number };
      hard: { total: number; solved: number; unsolved: number; accuracy: number; score?: number; maxScore?: number };
      total: { total: number; solved: number; unsolved: number; accuracy: number; score?: number; maxScore?: number };
    };
    questions?: Array<{
      id: string;
      title: string;
      difficulty: "Easy" | "Medium" | "Hard" | string;
      status: "Passed" | "Failed" | "Partial" | string;
      points: number;
      maxPoints?: number;
    }>;
    verificationUrl?: string;
  };
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 26,
    backgroundColor: "#FFFFFF",
    fontFamily: "Helvetica",
    color: BRAND_COLORS.navyDark,
    fontSize: 9,
    lineHeight: 1.35,
  },
  
  // 1. Institutional Branding Top Bar
  brandingBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: BRAND_COLORS.borderLight,
    marginBottom: 10,
  },
  brandingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  cuLogo: {
    width: 44,
    height: 44,
    objectFit: "contain",
    marginRight: 10,
  },
  brandTextColumn: {
    flex: 1,
  },
  codeSkillTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
  },
  codeSkillMain: {
    fontSize: 13,
    fontWeight: "bold",
    color: BRAND_COLORS.navyDark,
    letterSpacing: -0.3,
  },
  codeSkillByCu: {
    fontSize: 9,
    fontWeight: "bold",
    color: BRAND_COLORS.cuRed,
    marginLeft: 4,
  },
  departmentSubtitle: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: BRAND_COLORS.slateText,
    marginTop: 1,
  },
  platformDescription: {
    fontSize: 6.8,
    color: BRAND_COLORS.slateMuted,
    marginTop: 2,
    maxWidth: 320,
    lineHeight: 1.25,
  },
  brandingRight: {
    flexDirection: "column",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  sealAndBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  securityPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BRAND_COLORS.bgSubtle,
    borderWidth: 1,
    borderColor: BRAND_COLORS.borderLight,
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    marginRight: 8,
  },
  securityPillText: {
    fontSize: 7,
    fontWeight: "bold",
    color: BRAND_COLORS.navyDark,
    marginLeft: 3.5,
  },

  // 2. Report Title & Metadata Strip
  reportHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: BRAND_COLORS.cuRed,
  },
  reportTitleBlock: {
    flex: 1,
  },
  mainReportTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: BRAND_COLORS.navyDark,
    letterSpacing: 0.3,
  },
  reportSubtitle: {
    fontSize: 8.5,
    color: BRAND_COLORS.slateMuted,
    marginTop: 1.5,
  },
  metaPanel: {
    flexDirection: "row",
    backgroundColor: BRAND_COLORS.bgSubtle,
    borderWidth: 1,
    borderColor: BRAND_COLORS.borderLight,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaColumn: {
    marginHorizontal: 5,
  },
  metaLabel: {
    fontSize: 6.5,
    fontWeight: "bold",
    color: BRAND_COLORS.slateMuted,
    textTransform: "uppercase",
  },
  metaValue: {
    fontSize: 7.5,
    fontWeight: "bold",
    color: BRAND_COLORS.navyDark,
    marginTop: 1,
  },

  // 3. Section Containers & Headings
  section: {
    marginBottom: 9,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  sectionTitleWithBar: {
    flexDirection: "row",
    alignItems: "center",
  },
  redAccentBar: {
    width: 3,
    height: 10,
    backgroundColor: BRAND_COLORS.cuRed,
    borderRadius: 1.5,
    marginRight: 5,
  },
  sectionTitleText: {
    fontSize: 9,
    fontWeight: "bold",
    color: BRAND_COLORS.navyDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },

  // 4. Student Information Card
  studentCard: {
    backgroundColor: BRAND_COLORS.bgCard,
    borderWidth: 1,
    borderColor: BRAND_COLORS.borderLight,
    borderRadius: 6,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  studentDetailsCol1: {
    flex: 1.2,
    paddingRight: 8,
    borderRightWidth: 1,
    borderRightColor: BRAND_COLORS.borderLight,
  },
  studentDetailsCol2: {
    flex: 1.2,
    paddingHorizontal: 8,
  },
  studentAvatarCol: {
    width: 60,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: BRAND_COLORS.borderLight,
    paddingLeft: 6,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BRAND_COLORS.bgSubtle,
    borderWidth: 1.5,
    borderColor: BRAND_COLORS.borderDark,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "bold",
    color: BRAND_COLORS.cuRed,
  },
  infoField: {
    flexDirection: "row",
    marginBottom: 3.5,
    alignItems: "baseline",
  },
  fieldLabel: {
    width: 78,
    fontSize: 7.5,
    fontWeight: "bold",
    color: BRAND_COLORS.slateMuted,
  },
  fieldValue: {
    flex: 1,
    fontSize: 7.8,
    color: BRAND_COLORS.navyDark,
    fontWeight: "bold",
  },
  fieldValueRegular: {
    flex: 1,
    fontSize: 7.5,
    color: BRAND_COLORS.slateText,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    fontSize: 6.8,
    fontWeight: "bold",
    textTransform: "uppercase",
  },

  // 5. Performance Overview Metric Cards
  kpiCardsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  kpiCard: {
    width: "23.8%",
    backgroundColor: BRAND_COLORS.bgCard,
    borderWidth: 1,
    borderColor: BRAND_COLORS.borderLight,
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 8,
    position: "relative",
  },
  kpiHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  kpiLabel: {
    fontSize: 7,
    fontWeight: "bold",
    color: BRAND_COLORS.slateMuted,
    textTransform: "uppercase",
  },
  kpiValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: BRAND_COLORS.navyDark,
    marginVertical: 1,
  },
  kpiSubLabel: {
    fontSize: 6.8,
    color: BRAND_COLORS.slateMuted,
  },

  // 6. Two-Column Analytics Section (Table + Donut)
  analyticsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  analyticsColLeft: {
    width: "50%",
  },
  analyticsColRight: {
    width: "48%",
  },

  // 7. Detailed Performance Table
  tableCard: {
    backgroundColor: BRAND_COLORS.bgCard,
    borderWidth: 1,
    borderColor: BRAND_COLORS.borderLight,
    borderRadius: 6,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BRAND_COLORS.bgSubtle,
    borderBottomWidth: 1,
    borderBottomColor: BRAND_COLORS.borderDark,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontWeight: "bold",
    color: BRAND_COLORS.navyMedium,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BRAND_COLORS.borderLight,
    paddingVertical: 4.5,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  tableRowTotal: {
    flexDirection: "row",
    backgroundColor: BRAND_COLORS.bgSubtle,
    paddingVertical: 4.5,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  tableCell: {
    fontSize: 7.5,
    color: BRAND_COLORS.slateText,
  },
  colDifficulty: { width: "26%" },
  colTotal: { width: "18%", textAlign: "center" },
  colSolved: { width: "18%", textAlign: "center" },
  colUnsolved: { width: "18%", textAlign: "center" },
  colAccuracy: { width: "20%", textAlign: "right" },
  
  diffBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 3,
    fontSize: 6.8,
    fontWeight: "bold",
    alignSelf: "flex-start",
  },

  // 8. Question History Table
  questionTable: {
    backgroundColor: BRAND_COLORS.bgCard,
    borderWidth: 1,
    borderColor: BRAND_COLORS.borderLight,
    borderRadius: 6,
    overflow: "hidden",
  },
  qColIndex: { width: "7%", textAlign: "center" },
  qColTitle: { width: "45%" },
  qColDiff: { width: "18%" },
  qColStatus: { width: "18%" },
  qColPoints: { width: "12%", textAlign: "right" },

  // 9. Verification Footer
  footerSeparator: {
    borderTopWidth: 1.5,
    borderTopColor: BRAND_COLORS.cuRed,
    paddingTop: 8,
    marginTop: "auto",
  },
  footerSecurityText: {
    fontSize: 7.2,
    color: BRAND_COLORS.slateText,
    textAlign: "center",
    fontWeight: "bold",
  },
  footerOrgRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  footerOrgText: {
    fontSize: 6.8,
    color: BRAND_COLORS.slateMuted,
  },
  pageNumberText: {
    fontSize: 6.8,
    color: BRAND_COLORS.slateMuted,
    fontWeight: "bold",
  },
});

export const AssessmentPerformanceReport = ({ data }: AssessmentPerformanceReportProps) => {
  // Extract or default fields
  const student = data.student;
  const perf = data.performance;
  const questions = data.questions || [];

  // Compute breakdown dynamically if not explicitly provided
  const easyQuestions = questions.filter((q) => q.difficulty.toLowerCase() === "easy");
  const medQuestions = questions.filter((q) => q.difficulty.toLowerCase() === "medium");
  const hardQuestions = questions.filter((q) => q.difficulty.toLowerCase() === "hard");

  const easySolved = easyQuestions.filter((q) => q.status.toLowerCase() === "passed").length;
  const medSolved = medQuestions.filter((q) => q.status.toLowerCase() === "passed").length;
  const hardSolved = hardQuestions.filter((q) => q.status.toLowerCase() === "passed").length;

  const easyPoints = easyQuestions.reduce((acc, q) => acc + (q.points || 0), 0);
  const easyMax = easyQuestions.reduce((acc, q) => acc + (q.maxPoints || q.points || 10), 0) || (data.difficultyBreakdown?.easy?.maxScore ?? 15);
  const medPoints = medQuestions.reduce((acc, q) => acc + (q.points || 0), 0);
  const medMax = medQuestions.reduce((acc, q) => acc + (q.maxPoints || q.points || 20), 0) || (data.difficultyBreakdown?.medium?.maxScore ?? 25);
  const hardPoints = hardQuestions.reduce((acc, q) => acc + (q.points || 0), 0);
  const hardMax = hardQuestions.reduce((acc, q) => acc + (q.maxPoints || q.points || 30), 0) || (data.difficultyBreakdown?.hard?.maxScore ?? 60);

  const computedEasyScore = easyQuestions.length > 0 ? easyPoints : (data.difficultyBreakdown?.easy?.score ?? 15);
  const computedEasyMax = easyQuestions.length > 0 ? easyMax : (data.difficultyBreakdown?.easy?.maxScore ?? 15);
  const computedMedScore = medQuestions.length > 0 ? medPoints : (data.difficultyBreakdown?.medium?.score ?? 25);
  const computedMedMax = medQuestions.length > 0 ? medMax : (data.difficultyBreakdown?.medium?.maxScore ?? 25);
  const computedHardScore = hardQuestions.length > 0 ? hardPoints : (data.difficultyBreakdown?.hard?.score ?? 45);
  const computedHardMax = hardQuestions.length > 0 ? hardMax : (data.difficultyBreakdown?.hard?.maxScore ?? 60);

  const totalProblemsCount = perf.totalProblems || questions.length || 5;
  const totalSolvedCount = perf.totalSolved ?? (easySolved + medSolved + hardSolved);
  const maxScore = perf.maxScore || (easyMax + medMax + hardMax) || 100;
  const score = perf.score ?? (easyPoints + medPoints + hardPoints);

  const easyAccuracy = easyQuestions.length > 0 ? Math.round((easySolved / easyQuestions.length) * 100) : 100;
  const medAccuracy = medQuestions.length > 0 ? Math.round((medSolved / medQuestions.length) * 100) : 100;
  const hardAccuracy = hardQuestions.length > 0 ? Math.round((hardSolved / hardQuestions.length) * 100) : (hardQuestions.length ? 50 : 0);
  const totalAccuracy = totalProblemsCount > 0 ? Math.round((totalSolvedCount / totalProblemsCount) * 100) : 80;

  const status = data.status || (totalSolvedCount > 0 ? "Completed" : "In Progress");
  const rank = perf.rank ?? 1;
  const totalParticipants = perf.totalParticipants ?? 1;
  const percentile =
    perf.percentile ||
    (perf.rank && perf.totalParticipants
      ? `Top ${Math.max(1, Math.round((Number(perf.rank) / Number(perf.totalParticipants)) * 100))}%`
      : "Top 1%");

  // Initials for avatar
  const initials = student.name
    ? student.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "CU";

  const assessmentDate = data.assessmentDate || new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const reportDate = data.generatedAt || new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const reportTime = data.generatedTime || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const reportId = data.reportId || `CU-CS-${new Date().getFullYear()}-${(student.studentId || "2026").slice(-5)}`;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* 1. Official Branding & Header */}
        <View style={styles.brandingBar} wrap={false}>
          <View style={styles.brandingLeft}>
            <Image src={CU_LOGO_BASE64} style={styles.cuLogo} />
            <View style={styles.brandTextColumn}>
              <View style={styles.codeSkillTitleRow}>
                <Text style={styles.codeSkillMain}>CodeSkill</Text>
                <Text style={styles.codeSkillByCu}>by Chandigarh University</Text>
              </View>
              <Text style={styles.departmentSubtitle}>Department of Skill Development &amp; Lab</Text>
              <Text style={styles.platformDescription}>
                Standardized examination portal and algorithmic skill-building platform engineered for developers, students, and technical evaluations.
              </Text>
            </View>
          </View>

          <View style={styles.brandingRight}>
            <View style={styles.sealAndBadgeRow}>
              <View style={styles.securityPill}>
                <ShieldCheckIcon size={10} color={BRAND_COLORS.cuRed} />
                <Text style={styles.securityPillText}>Proctored &amp; Verified Infrastructure</Text>
              </View>
              <DepartmentSeal size={38} />
            </View>
          </View>
        </View>

        {/* 2. Report Header & Compact Metadata Strip */}
        <View style={styles.reportHeaderRow} wrap={false}>
          <View style={styles.reportTitleBlock}>
            <Text style={styles.mainReportTitle}>ASSESSMENT PERFORMANCE REPORT</Text>
            <Text style={styles.reportSubtitle}>Algorithmic Skills Assessment • Detailed Performance Analysis</Text>
          </View>

          <View style={styles.metaPanel}>
            <View style={styles.metaColumn}>
              <Text style={styles.metaLabel}>Assessment Date</Text>
              <Text style={styles.metaValue}>{assessmentDate}</Text>
            </View>
            <View style={styles.metaColumn}>
              <Text style={styles.metaLabel}>Report Generated</Text>
              <Text style={styles.metaValue}>{reportDate} • {reportTime}</Text>
            </View>
            <View style={styles.metaColumn}>
              <Text style={styles.metaLabel}>Report ID</Text>
              <Text style={[styles.metaValue, { color: BRAND_COLORS.cuRed }]}>{reportId}</Text>
            </View>
          </View>
        </View>

        {/* 3. Student Information Card */}
        <View style={styles.section} wrap={false}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWithBar}>
              <View style={styles.redAccentBar} />
              <Text style={styles.sectionTitleText}>Candidate Information</Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                status.toLowerCase() === "completed"
                  ? { backgroundColor: BRAND_COLORS.successBg, color: BRAND_COLORS.successGreen }
                  : { backgroundColor: BRAND_COLORS.blueBg, color: BRAND_COLORS.blueAccent },
              ]}
            >
              <Text>{status}</Text>
            </View>
          </View>

          <View style={styles.studentCard}>
            {/* Column 1 */}
            <View style={styles.studentDetailsCol1}>
              <View style={styles.infoField}>
                <Text style={styles.fieldLabel}>Student Name:</Text>
                <Text style={styles.fieldValue}>{student.name || "N/A"}</Text>
              </View>
              <View style={styles.infoField}>
                <Text style={styles.fieldLabel}>Official Email:</Text>
                <Text style={styles.fieldValueRegular}>{student.email || "N/A"}</Text>
              </View>
              <View style={styles.infoField}>
                <Text style={styles.fieldLabel}>Roll / UID:</Text>
                <Text style={[styles.fieldValue, { color: BRAND_COLORS.navyDark }]}>
                  {student.rollNumber || student.studentId || "N/A"}
                </Text>
              </View>
              <View style={styles.infoField}>
                <Text style={styles.fieldLabel}>Institution:</Text>
                <Text style={styles.fieldValueRegular}>{student.institution || "Chandigarh University"}</Text>
              </View>
              <View style={[styles.infoField, { marginBottom: 0 }]}>
                <Text style={styles.fieldLabel}>Program / Role:</Text>
                <Text style={styles.fieldValueRegular}>{student.program || student.role || "B.Tech CSE"}</Text>
              </View>
            </View>

            {/* Column 2 */}
            <View style={styles.studentDetailsCol2}>
              <View style={styles.infoField}>
                <Text style={styles.fieldLabel}>Assessment:</Text>
                <Text style={styles.fieldValue}>{data.assessmentName || "Advanced Algorithms & Data Structures"}</Text>
              </View>
              <View style={styles.infoField}>
                <Text style={styles.fieldLabel}>Assessment ID:</Text>
                <Text style={[styles.fieldValue, { color: BRAND_COLORS.slateMuted }]}>{data.assessmentId || "CS-DS-2026-A1"}</Text>
              </View>
              <View style={styles.infoField}>
                <Text style={styles.fieldLabel}>Date &amp; Time:</Text>
                <Text style={styles.fieldValueRegular}>{assessmentDate} {data.assessmentTime ? `• ${data.assessmentTime}` : ""}</Text>
              </View>
              <View style={[styles.infoField, { marginBottom: 0 }]}>
                <Text style={styles.fieldLabel}>Last Active:</Text>
                <Text style={styles.fieldValueRegular}>{student.lastActiveAt || reportDate}</Text>
              </View>
            </View>

            {/* Avatar Column */}
            <View style={styles.studentAvatarCol}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={{ fontSize: 6, color: BRAND_COLORS.slateMuted, marginTop: 3 }}>VERIFIED</Text>
            </View>
          </View>
        </View>

        {/* 4. Performance Overview KPIs */}
        <View style={styles.kpiCardsGrid} wrap={false}>
          {/* Card 1: Total Problems */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>Total Problems</Text>
              <TargetIcon size={12} color={BRAND_COLORS.blueAccent} />
            </View>
            <Text style={styles.kpiValue}>{totalProblemsCount}</Text>
            <Text style={styles.kpiSubLabel}>Questions Evaluated</Text>
          </View>

          {/* Card 2: Solved Correctly */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>Solved Correctly</Text>
              <CheckCircleIcon size={12} color={BRAND_COLORS.successGreen} />
            </View>
            <Text style={[styles.kpiValue, { color: BRAND_COLORS.successGreen }]}>{totalSolvedCount}</Text>
            <Text style={styles.kpiSubLabel}>{totalAccuracy}% Solved Rate</Text>
          </View>

          {/* Card 3: Score Obtained */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>Score Obtained</Text>
              <TrophyIcon size={12} color={BRAND_COLORS.warningAmber} />
            </View>
            <Text style={[styles.kpiValue, { color: BRAND_COLORS.navyDark }]}>
              {score} <Text style={{ fontSize: 9, color: BRAND_COLORS.slateMuted }}>/ {maxScore}</Text>
            </Text>
            <Text style={styles.kpiSubLabel}>{Math.round((score / Math.max(1, maxScore)) * 100)}% Overall Score</Text>
          </View>

          {/* Card 4: Rank / Percentile */}
          <View style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <Text style={styles.kpiLabel}>Rank / Percentile</Text>
              <AwardIcon size={12} color={BRAND_COLORS.cuRed} />
            </View>
            <Text style={[styles.kpiValue, { color: BRAND_COLORS.cuRed }]}>{percentile}</Text>
            <Text style={styles.kpiSubLabel}>Rank {rank} of {totalParticipants}</Text>
          </View>
        </View>

        {/* 5. Detailed Analytics Row: Difficulty Table + Donut Chart */}
        <View style={styles.analyticsRow} wrap={false}>
          {/* Left Column: Difficulty Table */}
          <View style={styles.analyticsColLeft}>
            <View style={styles.sectionTitleWithBar}>
              <View style={styles.redAccentBar} />
              <Text style={styles.sectionTitleText}>Difficulty Performance</Text>
            </View>

            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, styles.colDifficulty]}>Difficulty</Text>
                <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total</Text>
                <Text style={[styles.tableHeaderCell, styles.colSolved]}>Solved</Text>
                <Text style={[styles.tableHeaderCell, styles.colUnsolved]}>Unsolved</Text>
                <Text style={[styles.tableHeaderCell, styles.colAccuracy]}>Accuracy</Text>
              </View>

              {/* Easy Row */}
              <View style={styles.tableRow}>
                <View style={styles.colDifficulty}>
                  <Text style={[styles.diffBadge, { backgroundColor: BRAND_COLORS.successBg, color: BRAND_COLORS.successGreen }]}>
                    Easy
                  </Text>
                </View>
                <Text style={[styles.tableCell, styles.colTotal]}>{easyQuestions.length || 1}</Text>
                <Text style={[styles.tableCell, styles.colSolved, { fontWeight: "bold", color: BRAND_COLORS.successGreen }]}>
                  {easySolved || 1}
                </Text>
                <Text style={[styles.tableCell, styles.colUnsolved]}>{Math.max(0, (easyQuestions.length || 1) - (easySolved || 1))}</Text>
                <Text style={[styles.tableCell, styles.colAccuracy, { fontWeight: "bold" }]}>{easyAccuracy}%</Text>
              </View>

              {/* Medium Row */}
              <View style={styles.tableRow}>
                <View style={styles.colDifficulty}>
                  <Text style={[styles.diffBadge, { backgroundColor: BRAND_COLORS.warningBg, color: BRAND_COLORS.warningAmber }]}>
                    Medium
                  </Text>
                </View>
                <Text style={[styles.tableCell, styles.colTotal]}>{medQuestions.length || 1}</Text>
                <Text style={[styles.tableCell, styles.colSolved, { fontWeight: "bold", color: BRAND_COLORS.warningAmber }]}>
                  {medSolved || 1}
                </Text>
                <Text style={[styles.tableCell, styles.colUnsolved]}>{Math.max(0, (medQuestions.length || 1) - (medSolved || 1))}</Text>
                <Text style={[styles.tableCell, styles.colAccuracy, { fontWeight: "bold" }]}>{medAccuracy}%</Text>
              </View>

              {/* Hard Row */}
              <View style={styles.tableRow}>
                <View style={styles.colDifficulty}>
                  <Text style={[styles.diffBadge, { backgroundColor: BRAND_COLORS.dangerBg, color: BRAND_COLORS.dangerRed }]}>
                    Hard
                  </Text>
                </View>
                <Text style={[styles.tableCell, styles.colTotal]}>{hardQuestions.length || 3}</Text>
                <Text style={[styles.tableCell, styles.colSolved, { fontWeight: "bold", color: BRAND_COLORS.dangerRed }]}>
                  {hardSolved || 1}
                </Text>
                <Text style={[styles.tableCell, styles.colUnsolved]}>{Math.max(0, (hardQuestions.length || 3) - (hardSolved || 1))}</Text>
                <Text style={[styles.tableCell, styles.colAccuracy, { fontWeight: "bold" }]}>{hardAccuracy}%</Text>
              </View>

              {/* Total Aggregate Row */}
              <View style={styles.tableRowTotal}>
                <View style={styles.colDifficulty}>
                  <Text style={{ fontSize: 7.5, fontWeight: "bold", color: BRAND_COLORS.navyDark }}>Total / Avg</Text>
                </View>
                <Text style={[styles.tableCell, styles.colTotal, { fontWeight: "bold" }]}>{totalProblemsCount}</Text>
                <Text style={[styles.tableCell, styles.colSolved, { fontWeight: "bold", color: BRAND_COLORS.successGreen }]}>
                  {totalSolvedCount}
                </Text>
                <Text style={[styles.tableCell, styles.colUnsolved, { fontWeight: "bold" }]}>
                  {Math.max(0, totalProblemsCount - totalSolvedCount)}
                </Text>
                <Text style={[styles.tableCell, styles.colAccuracy, { fontWeight: "bold", color: BRAND_COLORS.cuRed }]}>
                  {totalAccuracy}%
                </Text>
              </View>
            </View>
          </View>

          {/* Right Column: Score Donut Chart */}
          <View style={styles.analyticsColRight}>
            <View style={styles.sectionTitleWithBar}>
              <View style={styles.redAccentBar} />
              <Text style={styles.sectionTitleText}>Score Distribution</Text>
            </View>

            <ScoreDonutChart
              score={score}
              maxScore={maxScore}
              easyScore={computedEasyScore}
              easyMax={computedEasyMax}
              medScore={computedMedScore}
              medMax={computedMedMax}
              hardScore={computedHardScore}
              hardMax={computedHardMax}
            />
          </View>
        </View>

        {/* 6. Question Details Table */}
        {questions.length > 0 && (
          <View style={styles.section} wrap={false}>
            <View style={styles.sectionTitleWithBar}>
              <View style={styles.redAccentBar} />
              <Text style={styles.sectionTitleText}>Problem-Level Assessment Breakdown</Text>
            </View>

            <View style={styles.questionTable}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, styles.qColIndex]}>#</Text>
                <Text style={[styles.tableHeaderCell, styles.qColTitle]}>Problem Title</Text>
                <Text style={[styles.tableHeaderCell, styles.qColDiff]}>Difficulty</Text>
                <Text style={[styles.tableHeaderCell, styles.qColStatus]}>Evaluation</Text>
                <Text style={[styles.tableHeaderCell, styles.qColPoints]}>Score</Text>
              </View>

              {questions.map((q, idx) => (
                <View
                  key={q.id || idx}
                  style={[
                    styles.tableRow,
                    idx === questions.length - 1 ? { borderBottomWidth: 0 } : {},
                  ]}
                  wrap={false}
                >
                  <Text style={[styles.tableCell, styles.qColIndex, { color: BRAND_COLORS.slateMuted }]}>{idx + 1}</Text>
                  <Text style={[styles.tableCell, styles.qColTitle, { fontWeight: "bold", color: BRAND_COLORS.navyDark }]}>
                    {q.title.length > 40 ? `${q.title.substring(0, 38)}...` : q.title}
                  </Text>
                  <View style={styles.qColDiff}>
                    <Text
                      style={[
                        styles.diffBadge,
                        q.difficulty.toLowerCase() === "easy"
                          ? { backgroundColor: BRAND_COLORS.successBg, color: BRAND_COLORS.successGreen }
                          : q.difficulty.toLowerCase() === "medium"
                          ? { backgroundColor: BRAND_COLORS.warningBg, color: BRAND_COLORS.warningAmber }
                          : { backgroundColor: BRAND_COLORS.dangerBg, color: BRAND_COLORS.dangerRed },
                      ]}
                    >
                      {q.difficulty}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.tableCell,
                      styles.qColStatus,
                      {
                        fontWeight: "bold",
                        color:
                          q.status === "Passed"
                            ? BRAND_COLORS.successGreen
                            : q.status === "Failed"
                            ? BRAND_COLORS.dangerRed
                            : BRAND_COLORS.warningAmber,
                      },
                    ]}
                  >
                    {q.status}
                  </Text>
                  <Text style={[styles.tableCell, styles.qColPoints, { fontWeight: "bold" }]}>
                    {q.points} pts
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 7. Official Verification Footer */}
        <View style={styles.footerSeparator} fixed>
          <Text style={styles.footerSecurityText}>
            This assessment was conducted using a secure, proctored, and verified examination infrastructure.
          </Text>
          <View style={styles.footerOrgRow}>
            <Text style={styles.footerOrgText}>
              CodeSkill by Chandigarh University | Department of Skill Development &amp; Lab
            </Text>
            <Text
              style={styles.pageNumberText}
              render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
            />
          </View>
        </View>

      </Page>
    </Document>
  );
};

export default AssessmentPerformanceReport;
