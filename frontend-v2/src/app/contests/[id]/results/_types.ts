export interface ProblemResultCell {
  status: 'accepted' | 'failed' | 'attempted' | 'unattempted';
  score: number;
  attempts: number;
  timeInMinutes?: number;
  isFirstSolve?: boolean;
  savedCode?: string;
  language?: string;
}

export interface ProblemSummary {
  id: string;
  index: string; // 'A', 'B', 'C'
  title: string;
  slug: string;
  maxPoints: number;
  difficulty: string;
  totalSolved: number;
  firstSolver?: {
    name: string;
    username: string;
    timeInMinutes: number;
  };
}

export interface StandingRow {
  userId: string;
  name: string;
  username: string;
  avatar?: string;
  department: string;
  batch: string;
  status: string;
  warnings: number;
  violationsCount: number;
  problemsSolved: number;
  totalScore: number;
  totalPenaltyMinutes: number;
  problemResults: Record<string, ProblemResultCell>;
  rank: number; // Global rank
  departmentRank?: number; // Filtered rank
  isCurrentUser: boolean;
}

export interface MyResult {
  rank: number | null;
  departmentRank: number | null;
  percentile: number;
  totalScore: number;
  totalPenaltyMinutes: number;
  problemsSolved: number;
  totalProblems: number;
  status: string;
  reason?: string;
  warnings: number;
  proctoringVerified: boolean;
  page: number;
  problemResults: Record<string, ProblemResultCell>;
}

export interface DisqualifiedCandidate {
  userId: string;
  name: string;
  username: string;
  avatar?: string;
  department?: string;
  batch?: string;
  reason: string;
  warnings: number;
  violationsCount: number;
  submittedAt: string | null;
  activityJourneyUrl: string;
}

export interface ContestResultsResponse {
  contest: {
    id: string;
    slug: string;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    contestFormat: string;
    resultsPublished: boolean;
    isPrivate: boolean;
  };
  problems: ProblemSummary[];
  standings: StandingRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  myResult: MyResult | null;
  departments: string[];
  batches: string[];
  disqualified: DisqualifiedCandidate[];
}

export interface EditorialItem {
  problemId: string;
  index: string;
  title: string;
  slug: string;
  difficulty: string;
  editorial: string;
  referenceSolutions: Array<{ language: string; sourceCode: string }>;
}
