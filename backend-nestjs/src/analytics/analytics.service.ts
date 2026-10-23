import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { AssessmentAttempt } from '../database/entities/assessment-attempt.entity';
import { Assessment } from '../database/entities/assessment.entity';
import { Question } from '../database/entities/question.entity';
import { ExamSecurityEvent } from '../database/entities/exam-security-event.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
import { User } from '../database/entities/user.entity';
import { Submission } from '../database/entities/submission.entity';
import { RedisService } from '../redis/redis.service';
import {
  AnalyticsActivityQueryDto,
  AnalyticsLeaderboardQueryDto,
} from './dto/analytics-query.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor(
    @InjectRepository(AssessmentAttempt)
    private readonly attemptRepo: Repository<AssessmentAttempt>,
    @InjectRepository(Assessment)
    private readonly assessmentRepo: Repository<Assessment>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(ExamSecurityEvent)
    private readonly securityEventRepo: Repository<ExamSecurityEvent>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Submission)
    private readonly submissionRepo: Repository<Submission>,
    @Optional()
    private readonly redisService?: RedisService,
  ) {}

  /**
   * Helper to safely execute a query with Redis caching fallback and latency tracking
   */
  private async getOrSetCache<T>(
    key: string,
    ttlSeconds: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const start = Date.now();
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<T>(key);
        if (cached !== null && cached !== undefined) {
          this.logger.debug(`[Cache HIT] key="${key}" latency=${Date.now() - start}ms`);
          return cached;
        }
      } catch (err: any) {
        this.logger.warn(`[Redis ERROR] Cache read failed for ${key}: ${err?.message}`);
      }
    }

    const queryStart = Date.now();
    const result = await factory();
    const duration = Date.now() - queryStart;
    this.logger.log(`[DB Aggregation] key="${key}" duration=${duration}ms ttl=${ttlSeconds}s`);

    if (this.redisService && result !== undefined && result !== null) {
      try {
        await this.redisService.set(key, result, ttlSeconds);
      } catch (err: any) {
        this.logger.warn(`[Redis ERROR] Cache write failed for ${key}: ${err?.message}`);
      }
    }
    return result;
  }

  private formatLanguageName(raw: string): string {
    const lower = String(raw || '').toLowerCase().trim();
    if (lower.includes('python') || lower === 'py') return 'Python';
    if (lower.includes('c++') || lower.includes('cpp')) return 'C++';
    if (lower.includes('java') && !lower.includes('script')) return 'Java';
    if (lower.includes('javascript') || lower === 'js' || lower === 'nodejs')
      return 'JavaScript';
    if (lower.includes('typescript') || lower === 'ts') return 'TypeScript';
    if (lower === 'go' || lower === 'golang') return 'Go';
    if (lower === 'rust' || lower === 'rs') return 'Rust';
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Unknown';
  }

  /**
   * Platform-wide high level KPI overview
   */
  async getPlatformOverview() {
    return this.getOrSetCache('analytics:platform:overview', 60, async () => {
      // Total students
      const totalStudents = await this.userRepo.count({
        where: [{ role: 'student' }],
      });
      const totalUsers = await this.userRepo.count();

      // Total submissions & accepted submissions
      const subStats = await this.submissionRepo
        .createQueryBuilder('s')
        .select('COUNT(*)::int', 'total')
        .addSelect(
          `COUNT(*) FILTER (WHERE LOWER(s.status) = 'accepted')::int`,
          'accepted',
        )
        .addSelect(
          `COUNT(*) FILTER (WHERE LOWER(s.status) <> 'accepted')::int`,
          'failed',
        )
        .getRawOne();

      const totalSubmissions = Number(subStats?.total || 0);
      const acceptedSubmissions = Number(subStats?.accepted || 0);
      const failedSubmissions = Number(subStats?.failed || 0);
      const overallAcceptanceRate =
        totalSubmissions > 0
          ? Number(((acceptedSubmissions / totalSubmissions) * 100).toFixed(1))
          : 0;

      // Active users (distinct students active in last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const activeUsersRaw = await this.userRepo.query(
        `SELECT COUNT(DISTINCT uid)::int AS count FROM (
          SELECT "userId" AS uid FROM submissions WHERE "createdAt" >= $1
          UNION
          SELECT "student_id" AS uid FROM assessment_attempts WHERE "startedAt" >= $1 OR "submittedAt" >= $1
        ) active_set WHERE uid IS NOT NULL`,
        [sevenDaysAgo],
      );
      const activeUsersCount = Number(activeUsersRaw?.[0]?.count || 0);

      // Total assessments and attempts
      const totalAssessments = await this.assessmentRepo.count();
      const completedStatuses = ['submitted', 'auto_submitted', 'timed_out'];
      const attemptStats = await this.attemptRepo
        .createQueryBuilder('a')
        .select('COUNT(*)::int', 'total')
        .addSelect(
          `COUNT(*) FILTER (WHERE a.status IN (:...statuses))::int`,
          'completed',
        )
        .addSelect('COALESCE(AVG(a.score), 0)', 'avgScore')
        .addSelect(
          `COUNT(*) FILTER (WHERE a.passed = true)::int`,
          'totalPassed',
        )
        .setParameter('statuses', completedStatuses)
        .getRawOne();

      const totalAttempts = Number(attemptStats?.total || 0);
      const completedAttempts = Number(attemptStats?.completed || 0);
      const totalPassed = Number(attemptStats?.totalPassed || 0);
      const avgScore = Number(Number(attemptStats?.avgScore || 0).toFixed(1));
      const passRate =
        completedAttempts > 0
          ? Number(((totalPassed / completedAttempts) * 100).toFixed(1))
          : 0;

      // Primary language
      const topLangRaw = await this.submissionRepo.query(
        `SELECT LOWER(language) as lang, COUNT(*)::int as count 
         FROM submissions 
         WHERE language IS NOT NULL AND language <> '' 
         GROUP BY LOWER(language) 
         ORDER BY count DESC LIMIT 1`,
      );
      const primaryLanguage = topLangRaw?.[0]?.lang
        ? this.formatLanguageName(topLangRaw[0].lang)
        : 'Python';

      return {
        totalStudents: totalStudents > 0 ? totalStudents : totalUsers,
        totalUsers,
        activeUsers:
          activeUsersCount > 0
            ? activeUsersCount
            : totalStudents > 0
              ? totalStudents
              : totalUsers,
        totalSubmissions,
        acceptedSubmissions,
        failedSubmissions,
        overallAcceptanceRate,
        totalAssessments,
        totalAttempts,
        completedAttempts,
        averageScore: avgScore,
        passRate,
        primaryLanguage,
      };
    });
  }

  /**
   * Activity timeline: submissions, engagement, and weekly rhythm
   */
  async getActivity(query: AnalyticsActivityQueryDto) {
    const period = query.period || '7d';
    return this.getOrSetCache(
      `analytics:platform:activity:${period}`,
      60,
      async () => {
        let days = 7;
        if (period === '30d') days = 30;
        else if (period === '90d') days = 90;
        else if (period === '1y') days = 365;
        else if (period === 'all') days = 730;

        const startDate = query.startDate
          ? new Date(query.startDate)
          : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const endDate = query.endDate ? new Date(query.endDate) : new Date();

        // Parameterized daily submissions
        const dailySubmissions = await this.submissionRepo.query(
          `SELECT 
             TO_CHAR(DATE(s."createdAt"), 'YYYY-MM-DD') AS "dateKey",
             COUNT(*)::int AS "total",
             COUNT(*) FILTER (WHERE LOWER(s.status) = 'accepted')::int AS "accepted",
             COUNT(*) FILTER (WHERE LOWER(s.status) <> 'accepted')::int AS "failed"
           FROM submissions s
           WHERE s."createdAt" >= $1 AND s."createdAt" <= $2
           GROUP BY DATE(s."createdAt")
           ORDER BY DATE(s."createdAt") ASC`,
          [startDate, endDate],
        );

        // Parameterized daily engagement
        const dailyEngagement = await this.attemptRepo.query(
          `SELECT 
             TO_CHAR(DATE(COALESCE(a."submittedAt", a."startedAt")), 'YYYY-MM-DD') AS "dateKey",
             COUNT(DISTINCT a."student_id")::int AS "activeStudents",
             COUNT(*)::int AS "assessmentsTaken"
           FROM assessment_attempts a
           WHERE (a."startedAt" >= $1 OR a."submittedAt" >= $1)
           GROUP BY DATE(COALESCE(a."submittedAt", a."startedAt"))
           ORDER BY DATE(COALESCE(a."submittedAt", a."startedAt")) ASC`,
          [startDate],
        );

        const subMap = new Map<string, any>(
          dailySubmissions.map((r: any) => [r.dateKey, r]),
        );
        const engMap = new Map<string, any>(
          dailyEngagement.map((r: any) => [r.dateKey, r]),
        );

        const codingActivity = [];
        const engagement = [];

        const curr = new Date(startDate);
        curr.setHours(0, 0, 0, 0);
        const endMs = endDate.getTime();

        while (curr.getTime() <= endMs) {
          const dateKey = curr.toISOString().slice(0, 10);
          const dateLabel = curr.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });

          const sub = subMap.get(dateKey) || {
            total: 0,
            accepted: 0,
            failed: 0,
          };
          const total = Number(sub.total || 0);
          const accepted = Number(sub.accepted || 0);
          const failed = Number(sub.failed || 0);
          const acceptanceRate =
            total > 0 ? Number(((accepted / total) * 100).toFixed(1)) : 0;

          codingActivity.push({
            date: dateLabel,
            timestamp: dateKey,
            total,
            accepted,
            failed,
            acceptanceRate,
          });

          const eng = engMap.get(dateKey) || {
            activeStudents: 0,
            assessmentsTaken: 0,
          };
          engagement.push({
            date: dateLabel,
            activeStudents: Number(eng.activeStudents || 0),
            assessmentsTaken: Number(eng.assessmentsTaken || 0),
            practiceSolves: accepted,
          });

          curr.setDate(curr.getDate() + 1);
        }

        // Weekly problem-solving rhythm (Mon - Sun, comparing Current Week vs Previous Week)
        const now = new Date();
        const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
        const currentMonday = new Date(now);
        currentMonday.setDate(now.getDate() - dayOfWeek);
        currentMonday.setHours(0, 0, 0, 0);

        const previousMonday = new Date(currentMonday);
        previousMonday.setDate(currentMonday.getDate() - 7);

        const weeklyRows = await this.submissionRepo.query(
          `SELECT 
             EXTRACT(ISODOW FROM "createdAt")::int AS "dayNum",
             COUNT(*) FILTER (WHERE "createdAt" >= $1)::int AS "currentWeek",
             COUNT(*) FILTER (WHERE "createdAt" >= $2 AND "createdAt" < $1)::int AS "previousWeek"
           FROM submissions
           WHERE "createdAt" >= $2 AND LOWER(status) = 'accepted'
           GROUP BY "dayNum"
           ORDER BY "dayNum" ASC`,
          [currentMonday, previousMonday],
        );

        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const weekMap = new Map<number, any>(
          weeklyRows.map((r: any) => [r.dayNum, r]),
        );

        const weeklyActivity = dayNames.map((day, idx) => {
          const row = weekMap.get(idx + 1) || {
            currentWeek: 0,
            previousWeek: 0,
          };
          return {
            day,
            currentWeek: Number(row.currentWeek || 0),
            previousWeek: Number(row.previousWeek || 0),
            avgSolves: Math.round(
              (Number(row.currentWeek || 0) + Number(row.previousWeek || 0)) / 2,
            ),
          };
        });

        return {
          period,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          codingActivity,
          engagement,
          weeklyActivity,
        };
      },
    );
  }

  /**
   * Programming language breakdown
   */
  async getLanguages() {
    return this.getOrSetCache('analytics:platform:languages', 60, async () => {
      const rows = await this.submissionRepo.query(
        `SELECT 
           LOWER(language) AS "name",
           COUNT(*)::int AS "submissions"
         FROM submissions
         WHERE language IS NOT NULL AND language <> ''
         GROUP BY LOWER(language)
         ORDER BY COUNT(*) DESC`,
      );

      const total = rows.reduce(
        (sum: number, r: any) => sum + Number(r.submissions || 0),
        0,
      );
      const palette: Record<string, string> = {
        Python: '#3b82f6',
        'C++': '#8b5cf6',
        Java: '#f97316',
        JavaScript: '#eab308',
        TypeScript: '#06b6d4',
        Go: '#10b981',
        Rust: '#ec4899',
        Other: '#64748b',
      };

      const languages = rows.map((r: any) => {
        const formatted = this.formatLanguageName(r.name);
        const count = Number(r.submissions || 0);
        const percentage =
          total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;
        return {
          name: formatted,
          submissions: count,
          percentage,
          color: palette[formatted] || palette.Other,
        };
      });

      return {
        totalSubmissions: total,
        languages,
      };
    });
  }

  /**
   * Paginated student leaderboards
   */
  async getLeaderboard(query: AnalyticsLeaderboardQueryDto) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const offset = (page - 1) * limit;
    const type = query.type || 'overall';

    let rawQuery = '';
    if (type === 'assessments') {
      rawQuery = `
        SELECT 
          u.id AS "userId",
          u.name AS "name",
          u.uid AS "uid",
          COALESCE(SUM(a.score), 0)::float AS "totalScore",
          COUNT(a.id)::int AS "assessmentsCompleted",
          COALESCE(AVG(a."timeSpentSeconds"), 0)::int AS "avgTimeSpent"
        FROM users u
        INNER JOIN assessment_attempts a ON a.student_id = u.id AND a.status IN ('submitted', 'auto_submitted', 'timed_out')
        GROUP BY u.id, u.name, u.uid
        ORDER BY "totalScore" DESC, "assessmentsCompleted" DESC, "avgTimeSpent" ASC
        LIMIT $1 OFFSET $2
      `;
    } else if (type === 'practice') {
      rawQuery = `
        SELECT 
          u.id AS "userId",
          u.name AS "name",
          u.uid AS "uid",
          COUNT(DISTINCT s."problemId")::int AS "problemsSolved",
          COUNT(s.id)::int AS "acceptedSubmissions"
        FROM users u
        INNER JOIN submissions s ON s."userId" = u.id AND LOWER(s.status) = 'accepted'
        GROUP BY u.id, u.name, u.uid
        ORDER BY "problemsSolved" DESC, "acceptedSubmissions" DESC
        LIMIT $1 OFFSET $2
      `;
    } else {
      rawQuery = `
        SELECT 
          u.id AS "userId",
          u.name AS "name",
          u.uid AS "uid",
          (COALESCE(att_stats.total_score, 0) + COALESCE(sub_stats.solved_count * 10, 0))::float AS "points",
          COALESCE(att_stats.total_score, 0)::float AS "assessmentScore",
          COALESCE(sub_stats.solved_count, 0)::int AS "problemsSolved",
          COALESCE(att_stats.completed_count, 0)::int AS "assessmentsCompleted"
        FROM users u
        LEFT JOIN (
          SELECT 
            student_id, 
            SUM(score) AS total_score, 
            COUNT(id) AS completed_count 
          FROM assessment_attempts 
          WHERE status IN ('submitted', 'auto_submitted', 'timed_out') 
          GROUP BY student_id
        ) att_stats ON att_stats.student_id = u.id
        LEFT JOIN (
          SELECT 
            "userId", 
            COUNT(DISTINCT "problemId") AS solved_count 
          FROM submissions 
          WHERE LOWER(status) = 'accepted' 
          GROUP BY "userId"
        ) sub_stats ON sub_stats."userId" = u.id
        WHERE u.role = 'student' OR att_stats.student_id IS NOT NULL OR sub_stats."userId" IS NOT NULL
        ORDER BY "points" DESC, "problemsSolved" DESC
        LIMIT $1 OFFSET $2
      `;
    }

    const rows = await this.userRepo.query(rawQuery, [limit, offset]);
    const totalCountRaw = await this.userRepo.query(
      `SELECT COUNT(DISTINCT u.id)::int AS count FROM users u WHERE u.role = 'student'`,
    );
    const total = Number(totalCountRaw?.[0]?.count || rows.length);

    const rankedData = rows.map((r: any, idx: number) => ({
      rank: offset + idx + 1,
      userId: r.userId,
      name: r.name || 'Candidate',
      uid: r.uid || 'N/A',
      points: Number(r.points || r.totalScore || 0),
      assessmentScore: Number(r.assessmentScore || r.totalScore || 0),
      problemsSolved: Number(r.problemsSolved || 0),
      assessmentsCompleted: Number(r.assessmentsCompleted || 0),
    }));

    return {
      type,
      data: rankedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Assessment participation, pass rate, and score distributions
   */
  async getAssessmentsOverview() {
    return this.getOrSetCache('analytics:platform:assessments', 60, async () => {
      const totalAssessments = await this.assessmentRepo.count();
      const activeAssessments = await this.assessmentRepo.count({
        where: [{ status: In(['published', 'ongoing']) }],
      });

      const completedStatuses = ['submitted', 'auto_submitted', 'timed_out'];

      const scoreDistRows = await this.attemptRepo.query(
        `SELECT
           CASE 
             WHEN (a.score / NULLIF(a."maxScore", 0)) * 100 <= 20 THEN '0-20%'
             WHEN (a.score / NULLIF(a."maxScore", 0)) * 100 <= 40 THEN '21-40%'
             WHEN (a.score / NULLIF(a."maxScore", 0)) * 100 <= 60 THEN '41-60%'
             WHEN (a.score / NULLIF(a."maxScore", 0)) * 100 <= 80 THEN '61-80%'
             ELSE '81-100%'
           END AS "bracket",
           COUNT(*)::int AS "count"
         FROM assessment_attempts a
         WHERE a.status IN ('submitted', 'auto_submitted', 'timed_out')
           AND a."maxScore" > 0
         GROUP BY 1`,
      );

      const bracketOrder = ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'];
      const distMap = new Map<string, number>(
        scoreDistRows.map((r: any) => [r.bracket, Number(r.count || 0)]),
      );
      const totalEvaluated = Array.from(distMap.values()).reduce(
        (a, b) => a + b,
        0,
      );

      const scoreDistribution = bracketOrder.map((bracket) => {
        const count = distMap.get(bracket) || 0;
        const percentage =
          totalEvaluated > 0
            ? Number(((count / totalEvaluated) * 100).toFixed(1))
            : 0;
        const passStatus: 'fail' | 'pass' | 'distinction' =
          bracket === '0-20%' || bracket === '21-40%'
            ? 'fail'
            : bracket === '81-100%'
              ? 'distinction'
              : 'pass';
        return {
          bracket,
          count,
          percentage,
          passStatus,
        };
      });

      const assessments = await this.assessmentRepo.find({
        order: { createdAt: 'DESC' },
        take: 10,
        select: {
          id: true,
          title: true,
          code: true,
          status: true,
          totalMarks: true,
          passingMarks: true,
          durationMinutes: true,
          createdAt: true,
        },
      });

      const assessmentStats = await Promise.all(
        assessments.map(async (asmt) => {
          const stats = await this.attemptRepo
            .createQueryBuilder('a')
            .select('COUNT(*)::int', 'totalAttempts')
            .addSelect(
              `COUNT(*) FILTER (WHERE a.status IN (:...statuses))::int`,
              'completedAttempts',
            )
            .addSelect('COALESCE(AVG(a.score), 0)', 'avgScore')
            .addSelect(
              `COUNT(*) FILTER (WHERE a.passed = true)::int`,
              'passedCount',
            )
            .where('a.assessmentId = :id', { id: asmt.id })
            .setParameter('statuses', completedStatuses)
            .getRawOne();

          const totalAttempts = Number(stats?.totalAttempts || 0);
          const completed = Number(stats?.completedAttempts || 0);
          const passed = Number(stats?.passedCount || 0);
          const passRate =
            completed > 0 ? Number(((passed / completed) * 100).toFixed(1)) : 0;

          return {
            id: asmt.id,
            title: asmt.title,
            code: asmt.code,
            status: asmt.status,
            totalMarks: asmt.totalMarks,
            passingMarks: asmt.passingMarks,
            totalAttempts,
            completedAttempts: completed,
            avgScore: Number(Number(stats?.avgScore || 0).toFixed(1)),
            passRate,
          };
        }),
      );

      return {
        totalAssessments,
        activeAssessments,
        scoreDistribution,
        assessments: assessmentStats,
      };
    });
  }

  /**
   * Active users retention (DAU, WAU, MAU, stickiness ratio, frequency)
   */
  async getRetention() {
    return this.getOrSetCache('analytics:platform:retention', 60, async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [dauRaw, wauRaw, mauRaw] = await Promise.all([
        this.userRepo.query(
          `SELECT COUNT(DISTINCT uid)::int AS count FROM (
            SELECT "userId" AS uid FROM submissions WHERE "createdAt" >= $1
            UNION
            SELECT "student_id" AS uid FROM assessment_attempts WHERE "startedAt" >= $1 OR "submittedAt" >= $1
          ) s WHERE uid IS NOT NULL`,
          [oneDayAgo],
        ),
        this.userRepo.query(
          `SELECT COUNT(DISTINCT uid)::int AS count FROM (
            SELECT "userId" AS uid FROM submissions WHERE "createdAt" >= $1
            UNION
            SELECT "student_id" AS uid FROM assessment_attempts WHERE "startedAt" >= $1 OR "submittedAt" >= $1
          ) s WHERE uid IS NOT NULL`,
          [sevenDaysAgo],
        ),
        this.userRepo.query(
          `SELECT COUNT(DISTINCT uid)::int AS count FROM (
            SELECT "userId" AS uid FROM submissions WHERE "createdAt" >= $1
            UNION
            SELECT "student_id" AS uid FROM assessment_attempts WHERE "startedAt" >= $1 OR "submittedAt" >= $1
          ) s WHERE uid IS NOT NULL`,
          [thirtyDaysAgo],
        ),
      ]);

      const dau = Number(dauRaw?.[0]?.count || 0);
      const wau = Number(wauRaw?.[0]?.count || 0);
      const mau = Number(mauRaw?.[0]?.count || 0);
      const stickinessRatio =
        mau > 0 ? Number(((dau / mau) * 100).toFixed(1)) : 0;

      const freqRaw = await this.userRepo.query(
        `SELECT 
           active_days,
           COUNT(*)::int AS users_count
         FROM (
           SELECT 
             uid,
             COUNT(DISTINCT activity_date)::int AS active_days
           FROM (
             SELECT "userId" AS uid, DATE("createdAt") AS activity_date FROM submissions WHERE "createdAt" >= $1
             UNION
             SELECT "student_id" AS uid, DATE(COALESCE("submittedAt", "startedAt")) AS activity_date FROM assessment_attempts WHERE "startedAt" >= $1
           ) combined
           WHERE uid IS NOT NULL
           GROUP BY uid
         ) user_days
         GROUP BY active_days
         ORDER BY active_days ASC`,
        [thirtyDaysAgo],
      );

      let day1 = 0;
      let day2To3 = 0;
      let day4To5 = 0;
      let day6Plus = 0;

      for (const row of freqRaw) {
        const days = Number(row.active_days || 0);
        const count = Number(row.users_count || 0);
        if (days === 1) day1 += count;
        else if (days <= 3) day2To3 += count;
        else if (days <= 5) day4To5 += count;
        else day6Plus += count;
      }

      return {
        metrics: {
          dau,
          wau,
          mau,
          stickinessRatio,
        },
        frequencyDistribution: [
          { bracket: '1 Day', count: day1 },
          { bracket: '2-3 Days', count: day2To3 },
          { bracket: '4-5 Days', count: day4To5 },
          { bracket: '6+ Days', count: day6Plus },
        ],
      };
    });
  }

  /**
   * Safely resolves an assessment by UUID id, unique code, or mongoId without
   * triggering PostgreSQL UUID syntax errors.
   */
  async resolveAssessment(identifier: string): Promise<Assessment> {
    if (!identifier || typeof identifier !== 'string') {
      throw new NotFoundException('Assessment not found');
    }
    const trimmed = identifier.trim();

    let assessment: Assessment | null = null;
    if (this.UUID_REGEX.test(trimmed)) {
      assessment = await this.assessmentRepo.findOne({
        where: [{ id: trimmed }, { mongoId: trimmed }],
      });
    } else {
      assessment = await this.assessmentRepo.findOne({
        where: [{ code: trimmed }, { mongoId: trimmed }],
      });
      if (!assessment) {
        assessment = await this.assessmentRepo
          .createQueryBuilder('a')
          .where('LOWER(a.code) = LOWER(:code)', { code: trimmed })
          .orWhere('a.mongoId = :code', { code: trimmed })
          .getOne();
      }
    }

    if (!assessment) {
      throw new NotFoundException(`Assessment '${identifier}' not found`);
    }
    return assessment;
  }

  async getAssessmentOverview(identifier: string) {
    const assessment = await this.resolveAssessment(identifier);
    const targetId = assessment.id;
    const completedStatuses = ['submitted', 'auto_submitted', 'timed_out'];

    const totalAttempts = await this.attemptRepo.count({
      where: [{ assessmentId: targetId }],
    });

    const completedAttempts = await this.attemptRepo.count({
      where: [{ assessmentId: targetId, status: In(completedStatuses) }],
    });

    const stats = await this.attemptRepo
      .createQueryBuilder('a')
      .select('COALESCE(AVG(a.score), 0)', 'avgScore')
      .addSelect('COALESCE(MAX(a.score), 0)', 'maxScore')
      .addSelect('COALESCE(MIN(a.score), 0)', 'minScore')
      .addSelect('COALESCE(AVG(a.timeSpentSeconds), 0)', 'avgTimeSpent')
      .addSelect('COUNT(CASE WHEN a.passed = true THEN 1 END)', 'totalPassed')
      .addSelect('COALESCE(SUM(a.tabSwitchCount), 0)', 'totalTabSwitches')
      .addSelect(
        'COALESCE(SUM(a.fullscreenExitCount), 0)',
        'totalFullscreenExits',
      )
      .where('a.assessmentId = :targetId', { targetId })
      .andWhere('a.status IN (:...statuses)', { statuses: completedStatuses })
      .getRawOne();

    const candidateStats = await this.attemptRepo
      .createQueryBuilder('a')
      .select('COUNT(DISTINCT a.student_id)', 'totalCandidates')
      .addSelect(
        'COUNT(DISTINCT CASE WHEN a.status IN (:...statuses) THEN a.student_id END)',
        'completedCandidates',
      )
      .where('a.assessmentId = :targetId', { targetId })
      .setParameter('statuses', completedStatuses)
      .getRawOne();

    let securityEvents: ExamSecurityEvent[] = [];
    let securityEventsCount = 0;
    try {
      const res = await this.securityEventRepo.findAndCount({
        where: { assessmentId: targetId },
        order: { createdAt: 'DESC' },
        take: 10,
        relations: { candidate: true },
      });
      securityEvents = res[0];
      securityEventsCount = res[1];
    } catch {
      securityEvents = [];
      securityEventsCount = 0;
    }

    const auditLogs = await this.auditLogRepo
      .find({
        where: { assessmentId: targetId },
        order: { timestamp: 'DESC' },
        take: 10,
      })
      .catch(() => []);

    const totalPassed = Number(stats?.totalPassed || 0);
    const passRate =
      completedAttempts > 0
        ? Number(((totalPassed / completedAttempts) * 100).toFixed(1))
        : 0;

    return {
      assessment: {
        id: assessment.id,
        title: assessment.title,
        code: assessment.code,
        status: assessment.status,
        type: assessment.type,
        durationMinutes: assessment.durationMinutes,
        totalMarks: assessment.totalMarks || 100,
        passingMarks: assessment.passingMarks || 40,
      },
      participation: {
        total: totalAttempts,
        completed: completedAttempts,
        totalCandidates: Number(
          candidateStats?.totalCandidates || totalAttempts,
        ),
        completedCandidates: Number(
          candidateStats?.completedCandidates || completedAttempts,
        ),
      },
      metrics: {
        avgScore: Number(Number(stats?.avgScore || 0).toFixed(1)),
        maxScore: Number(stats?.maxScore || 0),
        minScore: Number(stats?.minScore || 0),
        avgTimeSpent: Math.round(Number(stats?.avgTimeSpent || 0)),
        totalPassed,
        passRate,
      },
      proctoring: {
        totalViolations:
          Number(stats?.totalTabSwitches || 0) +
          Number(stats?.totalFullscreenExits || 0),
        totalTabSwitches: Number(stats?.totalTabSwitches || 0),
        totalFullscreenExits: Number(stats?.totalFullscreenExits || 0),
        securityEventsCount,
        recentEvents: securityEvents.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          severity: e.severity,
          candidateName: e.candidate?.name || 'Candidate',
          candidateEmail: e.candidate?.email || '',
          createdAt: e.createdAt,
          metadata: e.metadata,
        })),
      },
      auditLogs: auditLogs.map((a) => ({
        id: a.id,
        action: a.action,
        actorEmail: a.actorEmail,
        timestamp: a.timestamp,
        event: a.event,
        riskWeight: a.riskWeight,
      })),
    };
  }

  async getAssessmentLeaderboard(identifier: string, page = 1, limit = 20) {
    const assessment = await this.resolveAssessment(identifier);
    const targetId = assessment.id;
    const skip = (page - 1) * limit;
    const completedStatuses = ['submitted', 'auto_submitted', 'timed_out'];

    const [data, total] = await this.attemptRepo.findAndCount({
      where: [{ assessmentId: targetId, status: In(completedStatuses) }],
      order: { score: 'DESC', timeSpentSeconds: 'ASC' },
      skip,
      take: limit,
      select: {
        id: true,
        studentName: true,
        studentEmail: true,
        studentUid: true,
        score: true,
        maxScore: true,
        percentage: true,
        passed: true,
        timeSpentSeconds: true,
        startedAt: true,
        submittedAt: true,
        violations: true,
        tabSwitchCount: true,
        fullscreenExitCount: true,
      },
    });

    return {
      data: data.map((d) => ({ ...d, _id: d.id })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getQuestionAnalytics(identifier: string) {
    const assessment = await this.resolveAssessment(identifier);
    const targetId = assessment.id;
    const completedStatuses = ['submitted', 'auto_submitted', 'timed_out'];

    const attempts = await this.attemptRepo.find({
      where: [{ assessmentId: targetId, status: In(completedStatuses) }],
      select: { id: true, responses: true },
    });

    const definedQuestionIds = new Set<string>();
    if (Array.isArray(assessment.questions)) {
      for (const q of assessment.questions) {
        if (q) definedQuestionIds.add(String(q));
      }
    }
    if (Array.isArray(assessment.sections)) {
      for (const s of assessment.sections) {
        if (Array.isArray(s?.questions)) {
          for (const q of s.questions) {
            const qId = (q as any)?.questionId || (q as any)?.id;
            if (qId) definedQuestionIds.add(String(qId));
          }
        }
      }
    }

    const questionMap = new Map<
      string,
      {
        totalAttempts: number;
        correctCount: number;
        totalTime: number;
        totalMarks: number;
      }
    >();

    for (const qId of definedQuestionIds) {
      questionMap.set(qId, {
        totalAttempts: 0,
        correctCount: 0,
        totalTime: 0,
        totalMarks: 0,
      });
    }

    for (const att of attempts) {
      const responses = Array.isArray(att.responses) ? att.responses : [];
      for (const resp of responses) {
        if (!resp.questionId) continue;
        const qId = String(resp.questionId);
        const cur = questionMap.get(qId) || {
          totalAttempts: 0,
          correctCount: 0,
          totalTime: 0,
          totalMarks: 0,
        };
        cur.totalAttempts += 1;
        if (resp.isCorrect) cur.correctCount += 1;
        cur.totalTime += Number(resp.timeSpentSeconds || 0);
        cur.totalMarks += Number(resp.marksAwarded || 0);
        questionMap.set(qId, cur);
      }
    }

    const allQuestionIds = Array.from(questionMap.keys());
    const validUuids = allQuestionIds.filter((id) => this.UUID_REGEX.test(id));

    const questions =
      validUuids.length > 0
        ? await this.questionRepo.find({
            where: [{ id: In(validUuids) }],
          })
        : [];

    const detailsMap = new Map<string, Question>();
    for (const q of questions) {
      detailsMap.set(q.id, q);
    }

    const questionStats = [];
    for (const [qId, stat] of questionMap.entries()) {
      const q = detailsMap.get(qId);
      const successRate =
        stat.totalAttempts > 0
          ? (stat.correctCount / stat.totalAttempts) * 100
          : 0;
      questionStats.push({
        questionId: qId,
        title: q?.title || 'Question ' + qId,
        type: q?.questionType || 'mcq',
        difficulty: q?.difficulty || 'Medium',
        totalAttempts: stat.totalAttempts,
        correctCount: stat.correctCount,
        successRate: Math.round(successRate * 10) / 10,
        avgTimeSpent:
          stat.totalAttempts > 0
            ? Math.round(stat.totalTime / stat.totalAttempts)
            : 0,
        avgMarksAwarded:
          stat.totalAttempts > 0
            ? Math.round((stat.totalMarks / stat.totalAttempts) * 10) / 10
            : 0,
      });
    }

    questionStats.sort((a, b) => a.successRate - b.successRate);
    return questionStats;
  }
}
