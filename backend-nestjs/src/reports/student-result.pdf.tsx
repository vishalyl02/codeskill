import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Svg, Path, Circle, Rect, G, Line } from '@react-pdf/renderer';

export const CU_LOGO_BASE64 = "data:image/png;base64,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";

export const BRAND_COLORS = {
  cuRed: "#C8102E",
  cuDarkRed: "#991B1B",
  cuRedBg: "#FFF1F2",
  navyDark: "#0F172A",
  navyMedium: "#1E293B",
  slateText: "#334155",
  slateMuted: "#64748B",
  slateLight: "#94A3B8",
  borderLight: "#E2E8F0",
  borderDark: "#CBD5E1",
  bgSubtle: "#F8FAFC",
  bgCard: "#FFFFFF",
  successGreen: "#16A34A",
  successBg: "#F0FDF4",
  warningAmber: "#D97706",
  warningBg: "#FFFBEB",
  dangerRed: "#DC2626",
  dangerBg: "#FEF2F2",
  blueAccent: "#2563EB",
  blueBg: "#EFF6FF",
};

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
  attemptId?: string;
  attemptStatus?: string;
  verificationStatus?: string;
  questions: {
    id: string;
    title: string;
    difficulty: string;
    status: 'Passed' | 'Failed' | 'Partial';
    points: number;
    maxPoints?: number;
  }[];
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
  securityPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BRAND_COLORS.bgSubtle,
    borderWidth: 1,
    borderColor: BRAND_COLORS.borderLight,
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
  },
  securityPillText: {
    fontSize: 7,
    fontWeight: "bold",
    color: BRAND_COLORS.navyDark,
    marginLeft: 3.5,
  },
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
  section: {
    marginBottom: 9,
  },
  sectionTitleWithBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
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
  tableCard: {
    backgroundColor: BRAND_COLORS.bgCard,
    borderWidth: 1,
    borderColor: BRAND_COLORS.borderLight,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 9,
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
  tableCell: {
    fontSize: 7.5,
    color: BRAND_COLORS.slateText,
  },
  diffBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 3,
    fontSize: 6.8,
    fontWeight: "bold",
    alignSelf: "flex-start",
  },
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

export const StudentResultReport = ({ result }: { result: StudentResult }) => {
  const safeMax = Math.max(1, result.maxScore);
  const scorePercent = Math.round((result.score / safeMax) * 100);

  const easyQuestions = result.questions.filter((q) => q.difficulty.toLowerCase() === "easy");
  const medQuestions = result.questions.filter((q) => q.difficulty.toLowerCase() === "medium");
  const hardQuestions = result.questions.filter((q) => q.difficulty.toLowerCase() === "hard");

  const easySolved = easyQuestions.filter((q) => q.status === "Passed").length;
  const medSolved = medQuestions.filter((q) => q.status === "Passed").length;
  const hardSolved = hardQuestions.filter((q) => q.status === "Passed").length;

  const totalSolved = easySolved + medSolved + hardSolved;
  const totalProblems = result.questions.length || 5;

  const initials = result.studentName
    ? result.studentName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : "CU";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Header */}
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
            <View style={styles.securityPill}>
              <Text style={styles.securityPillText}>Proctored &amp; Verified Infrastructure</Text>
            </View>
          </View>
        </View>

        {/* Title */}
        <View style={styles.reportHeaderRow} wrap={false}>
          <View style={styles.reportTitleBlock}>
            <Text style={styles.mainReportTitle}>ASSESSMENT PERFORMANCE REPORT</Text>
            <Text style={styles.reportSubtitle}>Algorithmic Skills Assessment • Detailed Performance Analysis</Text>
          </View>
          <View style={styles.metaPanel}>
            <View style={styles.metaColumn}>
              <Text style={styles.metaLabel}>Date</Text>
              <Text style={styles.metaValue}>{result.dateTaken}</Text>
            </View>
            <View style={styles.metaColumn}>
              <Text style={styles.metaLabel}>Score</Text>
              <Text style={[styles.metaValue, { color: BRAND_COLORS.cuRed }]}>{result.score} / {result.maxScore} Pts</Text>
            </View>
          </View>
        </View>

        {/* Student Info Card */}
        <View style={styles.section} wrap={false}>
          <View style={styles.sectionTitleWithBar}>
            <View style={styles.redAccentBar} />
            <Text style={styles.sectionTitleText}>Candidate Information</Text>
          </View>
          <View style={styles.studentCard}>
            <View style={styles.studentDetailsCol1}>
              <View style={styles.infoField}>
                <Text style={styles.fieldLabel}>Student Name:</Text>
                <Text style={styles.fieldValue}>{result.studentName}</Text>
              </View>
              <View style={styles.infoField}>
                <Text style={styles.fieldLabel}>Official Email:</Text>
                <Text style={styles.fieldValueRegular}>{result.studentEmail}</Text>
              </View>
              <View style={[styles.infoField, { marginBottom: 0 }]}>
                <Text style={styles.fieldLabel}>Roll / UID:</Text>
                <Text style={styles.fieldValue}>{result.rollNumber || result.studentId || "N/A"}</Text>
              </View>
            </View>
            <View style={styles.studentDetailsCol2}>
              <View style={styles.infoField}>
                <Text style={styles.fieldLabel}>Assessment:</Text>
                <Text style={styles.fieldValue}>{result.examName}</Text>
              </View>
              <View style={styles.infoField}>
                <Text style={styles.fieldLabel}>Duration:</Text>
                <Text style={styles.fieldValueRegular}>{result.duration || "1h 45m"}</Text>
              </View>
              <View style={[styles.infoField, { marginBottom: 0 }]}>
                <Text style={styles.fieldLabel}>Institution:</Text>
                <Text style={styles.fieldValueRegular}>{result.institution || "Chandigarh University"}</Text>
              </View>
            </View>
            <View style={styles.studentAvatarCol}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={{ fontSize: 6, color: BRAND_COLORS.slateMuted, marginTop: 3 }}>
                {result.verificationStatus || "VERIFIED"}
              </Text>
            </View>
          </View>
        </View>

        {/* 4 KPIs */}
        <View style={styles.kpiCardsGrid} wrap={false}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total Problems</Text>
            <Text style={styles.kpiValue}>{totalProblems}</Text>
            <Text style={styles.kpiSubLabel}>Questions Evaluated</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Solved Correctly</Text>
            <Text style={[styles.kpiValue, { color: BRAND_COLORS.successGreen }]}>{totalSolved}</Text>
            <Text style={styles.kpiSubLabel}>{Math.round((totalSolved / totalProblems) * 100)}% Pass Rate</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Score Obtained</Text>
            <Text style={styles.kpiValue}>{result.score} / {result.maxScore}</Text>
            <Text style={styles.kpiSubLabel}>{scorePercent}% Total Score</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Rank / Percentile</Text>
            <Text style={[styles.kpiValue, { color: BRAND_COLORS.cuRed }]}>
              {result.percentile || (result.rank && result.totalParticipants ? `Top ${Math.max(1, Math.round((result.rank / result.totalParticipants) * 100))}%` : 'N/A')}
            </Text>
            <Text style={styles.kpiSubLabel}>
              {result.rank && result.totalParticipants ? `Rank ${result.rank} of ${result.totalParticipants}` : (result.rank ? `Rank ${result.rank}` : 'Rank N/A')}
            </Text>
          </View>
        </View>

        {/* Questions Table */}
        <View style={styles.section} wrap={false}>
          <View style={styles.sectionTitleWithBar}>
            <View style={styles.redAccentBar} />
            <Text style={styles.sectionTitleText}>Problem-Level Assessment Breakdown</Text>
          </View>
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { width: "8%", textAlign: "center" }]}>#</Text>
              <Text style={[styles.tableHeaderCell, { width: "47%" }]}>Problem Title</Text>
              <Text style={[styles.tableHeaderCell, { width: "17%" }]}>Difficulty</Text>
              <Text style={[styles.tableHeaderCell, { width: "16%" }]}>Status</Text>
              <Text style={[styles.tableHeaderCell, { width: "12%", textAlign: "right" }]}>Points</Text>
            </View>
            {result.questions.map((q, idx) => (
              <View
                key={q.id || idx}
                style={[styles.tableRow, idx === result.questions.length - 1 ? { borderBottomWidth: 0 } : {}]}
                wrap={false}
              >
                <Text style={[styles.tableCell, { width: "8%", textAlign: "center", color: BRAND_COLORS.slateMuted }]}>{idx + 1}</Text>
                <Text style={[styles.tableCell, { width: "47%", fontWeight: "bold" }]}>{q.title}</Text>
                <View style={{ width: "17%" }}>
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
                    {
                      width: "16%",
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
                <Text style={[styles.tableCell, { width: "12%", textAlign: "right", fontWeight: "bold" }]}>{q.points} pts</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Verification Footer */}
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

export default StudentResultReport;
