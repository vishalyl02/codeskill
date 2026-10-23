export type DateFilterOption = "7d" | "30d" | "90d" | "1y" | "all";

export interface CodingActivityPoint {
  date: string;
  timestamp: string;
  total: number;
  accepted: number;
  failed: number;
  acceptanceRate: number; // 0 to 100 percentage
}

export interface EngagementTrendPoint {
  date: string;
  activeStudents: number;
  assessmentsTaken: number;
  practiceSolves: number;
}

export interface ScoreDistributionPoint {
  bracket: string;
  count: number;
  percentage: number;
  passStatus: "fail" | "pass" | "distinction";
}

export interface LanguageUsagePoint {
  name: string;
  submissions: number;
  percentage: number;
  color: string;
}

export interface WeeklyActivityPoint {
  day: string;
  currentWeek: number;
  previousWeek: number;
  avgSolves: number;
}

export interface AnalyticsSummaryMetrics {
  totalSubmissions: number;
  acceptedSubmissions: number;
  failedSubmissions: number;
  overallAcceptanceRate: number;
  activeStudentsCount: number;
  primaryLanguage: string;
  weeklySolves: number;
}

export interface FilteredAnalyticsData {
  timeframe: DateFilterOption;
  summary: AnalyticsSummaryMetrics;
  codingActivity: CodingActivityPoint[];
  engagement: EngagementTrendPoint[];
  scoreDistribution: ScoreDistributionPoint[];
  languages: LanguageUsagePoint[];
  weeklyActivity: WeeklyActivityPoint[];
}
