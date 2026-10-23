import {
  DateFilterOption,
  FilteredAnalyticsData,
  CodingActivityPoint,
  EngagementTrendPoint,
  ScoreDistributionPoint,
  LanguageUsagePoint,
  WeeklyActivityPoint,
  AnalyticsSummaryMetrics,
} from "./types";

export const CHART_COLORS = {
  emerald: "#10b981", // accepted / pass
  rose: "#f43f5e",    // failed / error
  blue: "#3b82f6",    // total submissions / primary
  purple: "#8b5cf6",  // engagement / practice
  amber: "#f59e0b",   // warnings / medium scores
  cyan: "#06b6d4",    // assessments
  indigo: "#6366f1",  // previous week / benchmark
  slate: "#64748b",   // neutral / grid
};

export const LANGUAGE_PALETTE: Record<string, string> = {
  Python: "#3b82f6",      // Blue
  "C++": "#8b5cf6",       // Purple
  Java: "#f97316",        // Orange
  JavaScript: "#eab308",  // Yellow
  TypeScript: "#06b6d4",  // Cyan
  Go: "#10b981",          // Emerald
  Rust: "#ec4899",        // Pink
  Other: "#64748b",       // Slate
};

function safeDivide(num: number, den: number): number {
  if (!den || isNaN(den) || den === 0) return 0;
  return Number(((num / den) * 100).toFixed(1));
}

export function getEmptyAnalyticsData(timeframe: DateFilterOption = "7d"): FilteredAnalyticsData {
  return {
    timeframe,
    summary: {
      totalSubmissions: 0,
      acceptedSubmissions: 0,
      failedSubmissions: 0,
      overallAcceptanceRate: 0,
      activeStudentsCount: 0,
      primaryLanguage: "None",
      weeklySolves: 0,
    },
    codingActivity: [],
    engagement: [],
    scoreDistribution: [
      { bracket: "0-20%", count: 0, percentage: 0, passStatus: "fail" },
      { bracket: "21-40%", count: 0, percentage: 0, passStatus: "fail" },
      { bracket: "41-60%", count: 0, percentage: 0, passStatus: "pass" },
      { bracket: "61-80%", count: 0, percentage: 0, passStatus: "pass" },
      { bracket: "81-100%", count: 0, percentage: 0, passStatus: "distinction" },
    ],
    languages: [],
    weeklyActivity: [
      { day: "Mon", currentWeek: 0, previousWeek: 0, avgSolves: 0 },
      { day: "Tue", currentWeek: 0, previousWeek: 0, avgSolves: 0 },
      { day: "Wed", currentWeek: 0, previousWeek: 0, avgSolves: 0 },
      { day: "Thu", currentWeek: 0, previousWeek: 0, avgSolves: 0 },
      { day: "Fri", currentWeek: 0, previousWeek: 0, avgSolves: 0 },
      { day: "Sat", currentWeek: 0, previousWeek: 0, avgSolves: 0 },
      { day: "Sun", currentWeek: 0, previousWeek: 0, avgSolves: 0 },
    ],
  };
}

export function getAnalyticsDataset(timeframe: DateFilterOption): FilteredAnalyticsData {
  let codingActivity: CodingActivityPoint[] = [];
  let engagement: EngagementTrendPoint[] = [];

  if (timeframe === "7d") {
    codingActivity = [
      { date: "Day 1 (Mon)", timestamp: "2026-10-17", total: 420, accepted: 295, failed: 125, acceptanceRate: 70.2 },
      { date: "Day 2 (Tue)", timestamp: "2026-10-18", total: 510, accepted: 372, failed: 138, acceptanceRate: 72.9 },
      { date: "Day 3 (Wed)", timestamp: "2026-10-19", total: 680, accepted: 510, failed: 170, acceptanceRate: 75.0 },
      { date: "Day 4 (Thu)", timestamp: "2026-10-20", total: 640, accepted: 467, failed: 173, acceptanceRate: 73.0 },
      { date: "Day 5 (Fri)", timestamp: "2026-10-21", total: 820, accepted: 615, failed: 205, acceptanceRate: 75.0 },
      { date: "Day 6 (Sat)", timestamp: "2026-10-22", total: 950, accepted: 741, failed: 209, acceptanceRate: 78.0 },
      { date: "Day 7 (Sun)", timestamp: "2026-10-23", total: 790, accepted: 592, failed: 198, acceptanceRate: 74.9 },
    ];

    engagement = [
      { date: "Mon", activeStudents: 185, assessmentsTaken: 95, practiceSolves: 240 },
      { date: "Tue", activeStudents: 220, assessmentsTaken: 110, practiceSolves: 290 },
      { date: "Wed", activeStudents: 295, assessmentsTaken: 180, practiceSolves: 375 },
      { date: "Thu", activeStudents: 270, assessmentsTaken: 160, practiceSolves: 340 },
      { date: "Fri", activeStudents: 360, assessmentsTaken: 220, practiceSolves: 460 },
      { date: "Sat", activeStudents: 410, assessmentsTaken: 265, practiceSolves: 520 },
      { date: "Sun", activeStudents: 345, assessmentsTaken: 190, practiceSolves: 440 },
    ];
  } else if (timeframe === "30d") {
    // 6 weekly/5-day aggregated intervals
    codingActivity = [
      { date: "Oct 1 - Oct 5", timestamp: "2026-10-01", total: 2400, accepted: 1680, failed: 720, acceptanceRate: 70.0 },
      { date: "Oct 6 - Oct 10", timestamp: "2026-10-06", total: 2950, accepted: 2124, failed: 826, acceptanceRate: 72.0 },
      { date: "Oct 11 - Oct 15", timestamp: "2026-10-11", total: 3400, accepted: 2516, failed: 884, acceptanceRate: 74.0 },
      { date: "Oct 16 - Oct 20", timestamp: "2026-10-16", total: 3820, accepted: 2903, failed: 917, acceptanceRate: 76.0 },
      { date: "Oct 21 - Oct 25", timestamp: "2026-10-21", total: 4250, accepted: 3315, failed: 935, acceptanceRate: 78.0 },
      { date: "Oct 26 - Oct 30", timestamp: "2026-10-26", total: 3900, accepted: 2964, failed: 936, acceptanceRate: 76.0 },
    ];

    engagement = [
      { date: "Week 1", activeStudents: 620, assessmentsTaken: 380, practiceSolves: 1250 },
      { date: "Week 2", activeStudents: 740, assessmentsTaken: 490, practiceSolves: 1540 },
      { date: "Week 3", activeStudents: 890, assessmentsTaken: 620, practiceSolves: 1890 },
      { date: "Week 4", activeStudents: 1040, assessmentsTaken: 780, practiceSolves: 2210 },
    ];
  } else if (timeframe === "90d") {
    // Quarterly data by month/bi-week
    codingActivity = [
      { date: "Aug (W1-2)", timestamp: "2026-08-01", total: 5200, accepted: 3536, failed: 1664, acceptanceRate: 68.0 },
      { date: "Aug (W3-4)", timestamp: "2026-08-15", total: 6100, accepted: 4270, failed: 1830, acceptanceRate: 70.0 },
      { date: "Sep (W1-2)", timestamp: "2026-09-01", total: 7400, accepted: 5328, failed: 2072, acceptanceRate: 72.0 },
      { date: "Sep (W3-4)", timestamp: "2026-09-15", total: 8900, accepted: 6675, failed: 2225, acceptanceRate: 75.0 },
      { date: "Oct (W1-2)", timestamp: "2026-10-01", total: 9800, accepted: 7448, failed: 2352, acceptanceRate: 76.0 },
      { date: "Oct (W3-4)", timestamp: "2026-10-15", total: 11200, accepted: 8736, failed: 2464, acceptanceRate: 78.0 },
    ];

    engagement = [
      { date: "Aug Month", activeStudents: 1450, assessmentsTaken: 890, practiceSolves: 3400 },
      { date: "Sep Month", activeStudents: 2100, assessmentsTaken: 1420, practiceSolves: 5200 },
      { date: "Oct Month", activeStudents: 2850, assessmentsTaken: 1980, practiceSolves: 7100 },
    ];
  } else {
    // 1y or all
    codingActivity = [
      { date: "Nov", timestamp: "2025-11-01", total: 8200, accepted: 5412, failed: 2788, acceptanceRate: 66.0 },
      { date: "Dec", timestamp: "2025-12-01", total: 9400, accepted: 6392, failed: 3008, acceptanceRate: 68.0 },
      { date: "Jan", timestamp: "2026-01-01", total: 11200, accepted: 7840, failed: 3360, acceptanceRate: 70.0 },
      { date: "Feb", timestamp: "2026-02-01", total: 12800, accepted: 9216, failed: 3584, acceptanceRate: 72.0 },
      { date: "Mar", timestamp: "2026-03-01", total: 14500, accepted: 10730, failed: 3770, acceptanceRate: 74.0 },
      { date: "Apr", timestamp: "2026-04-01", total: 13900, accepted: 10286, failed: 3614, acceptanceRate: 74.0 },
      { date: "May", timestamp: "2026-05-01", total: 15400, accepted: 11550, failed: 3850, acceptanceRate: 75.0 },
      { date: "Jun", timestamp: "2026-06-01", total: 16800, accepted: 12768, failed: 4032, acceptanceRate: 76.0 },
      { date: "Jul", timestamp: "2026-07-01", total: 18200, accepted: 14014, failed: 4186, acceptanceRate: 77.0 },
      { date: "Aug", timestamp: "2026-08-01", total: 19900, accepted: 15522, failed: 4378, acceptanceRate: 78.0 },
      { date: "Sep", timestamp: "2026-09-01", total: 22400, accepted: 17696, failed: 4704, acceptanceRate: 79.0 },
      { date: "Oct", timestamp: "2026-10-01", total: 24800, accepted: 19840, failed: 4960, acceptanceRate: 80.0 },
    ];

    engagement = [
      { date: "Q4 '25", activeStudents: 2200, assessmentsTaken: 1250, practiceSolves: 5400 },
      { date: "Q1 '26", activeStudents: 3600, assessmentsTaken: 2100, practiceSolves: 8900 },
      { date: "Q2 '26", activeStudents: 4900, assessmentsTaken: 3200, practiceSolves: 12400 },
      { date: "Q3 '26", activeStudents: 6800, assessmentsTaken: 4500, practiceSolves: 16800 },
    ];
  }

  // Score distribution scaling based on timeframe
  const scoreMultiplier = timeframe === "7d" ? 1 : timeframe === "30d" ? 4.5 : timeframe === "90d" ? 12 : 30;
  const rawDistCounts = [
    Math.round(48 * scoreMultiplier),   // 0-20%
    Math.round(112 * scoreMultiplier),  // 21-40%
    Math.round(230 * scoreMultiplier),  // 41-60%
    Math.round(380 * scoreMultiplier),  // 61-80%
    Math.round(190 * scoreMultiplier),  // 81-100%
  ];
  const totalScoreAttempts = rawDistCounts.reduce((a, b) => a + b, 0);

  const scoreDistribution: ScoreDistributionPoint[] = [
    { bracket: "0-20%", count: rawDistCounts[0], percentage: safeDivide(rawDistCounts[0], totalScoreAttempts), passStatus: "fail" },
    { bracket: "21-40%", count: rawDistCounts[1], percentage: safeDivide(rawDistCounts[1], totalScoreAttempts), passStatus: "fail" },
    { bracket: "41-60%", count: rawDistCounts[2], percentage: safeDivide(rawDistCounts[2], totalScoreAttempts), passStatus: "pass" },
    { bracket: "61-80%", count: rawDistCounts[3], percentage: safeDivide(rawDistCounts[3], totalScoreAttempts), passStatus: "pass" },
    { bracket: "81-100%", count: rawDistCounts[4], percentage: safeDivide(rawDistCounts[4], totalScoreAttempts), passStatus: "distinction" },
  ];

  // Language usage breakdown
  const langSubmissionsBase = timeframe === "7d" ? 4810 : timeframe === "30d" ? 20720 : timeframe === "90d" ? 48600 : 187500;
  const languages: LanguageUsagePoint[] = [
    { name: "Python", submissions: Math.round(langSubmissionsBase * 0.42), percentage: 42.0, color: LANGUAGE_PALETTE.Python },
    { name: "C++", submissions: Math.round(langSubmissionsBase * 0.28), percentage: 28.0, color: LANGUAGE_PALETTE["C++"] },
    { name: "Java", submissions: Math.round(langSubmissionsBase * 0.16), percentage: 16.0, color: LANGUAGE_PALETTE.Java },
    { name: "JavaScript", submissions: Math.round(langSubmissionsBase * 0.08), percentage: 8.0, color: LANGUAGE_PALETTE.JavaScript },
    { name: "TypeScript", submissions: Math.round(langSubmissionsBase * 0.04), percentage: 4.0, color: LANGUAGE_PALETTE.TypeScript },
    { name: "Go", submissions: Math.round(langSubmissionsBase * 0.02), percentage: 2.0, color: LANGUAGE_PALETTE.Go },
  ];

  // Weekly problem-solving activity
  const weeklyActivity: WeeklyActivityPoint[] = [
    { day: "Mon", currentWeek: 420, previousWeek: 380, avgSolves: 310 },
    { day: "Tue", currentWeek: 510, previousWeek: 460, avgSolves: 380 },
    { day: "Wed", currentWeek: 680, previousWeek: 590, avgSolves: 460 },
    { day: "Thu", currentWeek: 640, previousWeek: 610, avgSolves: 430 },
    { day: "Fri", currentWeek: 820, previousWeek: 740, avgSolves: 540 },
    { day: "Sat", currentWeek: 950, previousWeek: 860, avgSolves: 620 },
    { day: "Sun", currentWeek: 790, previousWeek: 710, avgSolves: 510 },
  ];

  // Compute aggregated summary
  const totalSubmissions = codingActivity.reduce((acc, curr) => acc + curr.total, 0);
  const acceptedSubmissions = codingActivity.reduce((acc, curr) => acc + curr.accepted, 0);
  const failedSubmissions = codingActivity.reduce((acc, curr) => acc + curr.failed, 0);
  const overallAcceptanceRate = safeDivide(acceptedSubmissions, totalSubmissions);

  const activeStudentsCount = engagement.length > 0
    ? engagement[engagement.length - 1].activeStudents
    : 0;

  const weeklySolves = weeklyActivity.reduce((acc, curr) => acc + curr.currentWeek, 0);

  const summary: AnalyticsSummaryMetrics = {
    totalSubmissions,
    acceptedSubmissions,
    failedSubmissions,
    overallAcceptanceRate,
    activeStudentsCount,
    primaryLanguage: "Python",
    weeklySolves,
  };

  return {
    timeframe,
    summary,
    codingActivity,
    engagement,
    scoreDistribution,
    languages,
    weeklyActivity,
  };
}
