import { StyleSheet } from "@react-pdf/renderer";

export const PDF_COLORS = {
  primary: "#111111",
  secondary: "#444444",
  muted: "#777777",
  border: "#E5E5E5",
  borderDark: "#D1D5DB",
  yellow: "#111111",
  yellowBg: "#F3F4F6",
  yellowBorder: "#E5E7EB",
  bg: "#FFFFFF",
  bgCard: "#F9FAFB",
  bgSubtle: "#F3F4F6",
  success: "#15803D",
  successBg: "#F0FDF4",
  successBorder: "#BBF7D0",
  warning: "#B45309",
  warningBg: "#FFFBEB",
  warningBorder: "#FDE68A",
  danger: "#B91C1C",
  dangerBg: "#FEF2F2",
  dangerBorder: "#FECACA",
  blue: "#1D4ED8",
  blueBg: "#EFF6FF",
};

export const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: PDF_COLORS.primary,
    backgroundColor: PDF_COLORS.bg,
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 36,
    lineHeight: 1.35,
  },

  // Header Section
  headerWrapper: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: PDF_COLORS.primary,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoBox: {
    width: 32,
    height: 32,
    backgroundColor: "#0A0A0A",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: PDF_COLORS.yellow,
    justifyContent: "center",
    alignItems: "center",
  },
  logoImage: {
    width: 46,
    height: 46,
    objectFit: "contain",
  },
  logoText: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.yellow,
  },
  brandBlock: {
    flexDirection: "column",
  },
  brandTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.primary,
    letterSpacing: -0.3,
  },
  brandUniversity: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.secondary,
    marginTop: 1,
  },
  brandDept: {
    fontSize: 7.5,
    color: PDF_COLORS.muted,
    marginTop: 0.5,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  reportBadge: {
    backgroundColor: PDF_COLORS.yellowBg,
    borderWidth: 1,
    borderColor: PDF_COLORS.yellowBorder,
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginBottom: 3,
  },
  reportBadgeText: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#B45309",
    letterSpacing: 0.5,
  },
  reportTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.primary,
  },
  reportSubtitle: {
    fontSize: 7.5,
    color: PDF_COLORS.muted,
    marginTop: 1,
  },

  // Metadata Strip
  metaStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: PDF_COLORS.bgCard,
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginVertical: 10,
  },
  metaItem: {
    flexDirection: "column",
  },
  metaLabel: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.muted,
    textTransform: "uppercase",
  },
  metaValue: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.primary,
    marginTop: 1,
  },

  // Section Heading
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionSubtitle: {
    fontSize: 7.5,
    color: PDF_COLORS.muted,
  },

  // Student Info Card (Two Columns)
  infoCard: {
    backgroundColor: PDF_COLORS.bgCard,
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  infoCol: {
    width: "48%",
  },
  infoLabel: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.muted,
    textTransform: "uppercase",
  },
  infoValue: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.primary,
    marginTop: 1,
  },

  // KPI Summary Grid (4–6 Cards)
  kpiGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  kpiCard: {
    width: "31.5%",
    backgroundColor: PDF_COLORS.bg,
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderRadius: 4,
    padding: 7,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.yellow,
  },
  kpiCardSecondary: {
    width: "31.5%",
    backgroundColor: PDF_COLORS.bg,
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderRadius: 4,
    padding: 7,
    borderLeftWidth: 3,
    borderLeftColor: PDF_COLORS.primary,
  },
  kpiLabel: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.muted,
    textTransform: "uppercase",
  },
  kpiValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.primary,
    marginVertical: 2,
  },
  kpiSubtext: {
    fontSize: 6.5,
    color: PDF_COLORS.muted,
  },

  // Table Styles
  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: PDF_COLORS.bgSubtle,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.secondary,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.border,
    paddingVertical: 5,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  tableRowAlt: {
    backgroundColor: "#FCFCFC",
  },
  tableCell: {
    fontSize: 7.5,
    color: PDF_COLORS.primary,
  },
  tableCellBold: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.primary,
  },
  tableCellMuted: {
    fontSize: 7,
    color: PDF_COLORS.muted,
  },

  // Status Badges
  statusSolved: {
    backgroundColor: PDF_COLORS.successBg,
    borderColor: PDF_COLORS.successBorder,
    borderWidth: 0.5,
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    color: PDF_COLORS.success,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  statusPartial: {
    backgroundColor: PDF_COLORS.warningBg,
    borderColor: PDF_COLORS.warningBorder,
    borderWidth: 0.5,
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    color: PDF_COLORS.warning,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  statusFailed: {
    backgroundColor: PDF_COLORS.dangerBg,
    borderColor: PDF_COLORS.dangerBorder,
    borderWidth: 0.5,
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    color: PDF_COLORS.danger,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  statusUnattempted: {
    backgroundColor: PDF_COLORS.bgSubtle,
    borderColor: PDF_COLORS.border,
    borderWidth: 0.5,
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    color: PDF_COLORS.muted,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },

  // Two Column Grid for Side-by-Side Sections
  twoColGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  colHalf: {
    width: "48.5%",
  },

  // Progress Bar for Topics
  topicRow: {
    marginBottom: 5,
  },
  topicHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  topicName: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.primary,
  },
  topicScore: {
    fontSize: 7,
    color: PDF_COLORS.muted,
  },
  progressBarBg: {
    width: "100%",
    height: 4,
    backgroundColor: PDF_COLORS.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: PDF_COLORS.yellow,
    borderRadius: 2,
  },

  // Evaluator & Summary Boxes
  summaryBox: {
    backgroundColor: PDF_COLORS.bgCard,
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    borderRadius: 4,
    padding: 8,
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 8,
    color: PDF_COLORS.secondary,
    lineHeight: 1.4,
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.border,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerLeft: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.muted,
  },
  footerCenter: {
    fontSize: 7,
    color: PDF_COLORS.muted,
  },
  footerRight: {
    fontSize: 7,
    color: PDF_COLORS.muted,
    fontFamily: "Helvetica-Bold",
  },
});
