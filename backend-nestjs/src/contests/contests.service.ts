import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { ProblemsService } from '../problems/problems.service';
import { Contest } from '../database/entities/contest.entity';
import { ContestAttempt } from '../database/entities/contest-attempt.entity';
import { SubmissionStore } from '../database/sharding/submission-store';
import { ContestReattemptGrant } from '../database/entities/contest-reattempt-grant.entity';

@Injectable()
export class ContestsService {
  private readonly logger = new Logger(ContestsService.name);
  constructor(
    @InjectRepository(Contest)
    private readonly contestRepo: Repository<Contest>,
    @InjectRepository(ContestAttempt)
    private readonly attemptRepo: Repository<ContestAttempt>,
    private readonly problemsService: ProblemsService,
    @Optional() private readonly submissions?: SubmissionStore,
    @Optional()
    @InjectRepository(ContestReattemptGrant)
    private readonly reattemptGrantRepo?: Repository<ContestReattemptGrant>,
  ) {}

  async getContests() {
    const list = await this.contestRepo.find({
      where: { isPublished: true, isPrivate: false },
      order: { startTime: 'DESC' },
    });
    return list.map((contest) => this.safeContest(contest));
  }

  async getContest(slug: string) {
    const contest = await this.contestRepo.findOne({
      where: { slug, isPublished: true },
    });
    if (!contest || !contest.isPublished)
      throw new NotFoundException('Contest not found');
    return this.safeContest(contest);
  }

  async register(contestId: string, userId: string, password?: string) {
    const contest = await this.contestRepo.findOne({
      where:
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          contestId,
        )
          ? [{ id: contestId }, { mongoId: contestId }]
          : { mongoId: contestId },
    });
    if (!contest || !contest.isPublished)
      throw new NotFoundException('Contest not found');
    if (Date.now() >= new Date(contest.endTime).getTime())
      throw new BadRequestException('Contest registration has closed');

    if (contest.isPrivate && contest.password !== password) {
      throw new ForbiddenException('Invalid contest password');
    }

    const participants = Array.isArray(contest.participants)
      ? contest.participants
      : [];
    if (!participants.includes(userId)) {
      contest.participants = [...participants, userId];
      await this.contestRepo.save(contest);
    }

    this.logger.log({
      event: 'CONTEST_REGISTERED',
      contestId: contest.id,
      userId,
    });

    return { success: true };
  }
  private safeContest(contest: Contest) {
    return {
      id: contest.id,
      _id: contest.id,
      title: contest.title,
      slug: contest.slug,
      description: contest.description,
      startTime: contest.startTime,
      endTime: contest.endTime,
      problems: contest.problems || [],
      isPrivate: contest.isPrivate,
    };
  }

  async registration(contestId: string, userId: string) {
    const validId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        contestId,
      );
    const contest = await this.contestRepo.findOne({
      where: validId
        ? [{ id: contestId }, { mongoId: contestId }]
        : { mongoId: contestId },
    });
    if (!contest || !contest.isPublished)
      throw new NotFoundException('Contest not found');
    const registered = !!contest.participants?.includes(userId);

    const latestAttempt = registered
      ? await this.attemptRepo.findOne({
          where: { contest_id: contest.id, user_id: userId },
          order: { attemptNumber: 'DESC', createdAt: 'DESC' },
        })
      : null;

    const res: any = { registered };
    if (latestAttempt) {
      res.attemptStatus = latestAttempt.status;
      if (latestAttempt.attemptNumber !== undefined) {
        res.attemptNumber = latestAttempt.attemptNumber;
      }
    }

    if (this.reattemptGrantRepo && registered) {
      const activeGrant = await this.reattemptGrantRepo.findOne({
        where: { contest_id: contest.id, user_id: userId, status: 'ACTIVE' },
      });
      const isGrantValid =
        activeGrant &&
        (!activeGrant.expiresAt || new Date() < new Date(activeGrant.expiresAt)) &&
        activeGrant.usedAttempts < activeGrant.allowedAttempts;

      if (isGrantValid) {
        res.canReattempt = true;
        res.reattemptDetails = {
          allowedAttempts: activeGrant.allowedAttempts,
          usedAttempts: activeGrant.usedAttempts,
          expiresAt: activeGrant.expiresAt,
          reason: activeGrant.reason,
        };
      }
    }

    return res;
  }


  async leaderboard(slug: string, userId?: string) {
    const contest = await this.contestRepo.findOne({
      where: {
        slug,
        isPublished: true,
        ...(userId ? {} : { isPrivate: false }),
      },
    });
    if (
      !contest ||
      !contest.isPublished ||
      (contest.isPrivate && !contest.participants?.includes(userId || ''))
    )
      throw new NotFoundException('Contest leaderboard not found');
    const problemIds = (contest.problems || []).filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      ),
    );
    if (this.submissions?.isSharded) {
      return this.shardedLeaderboard(contest, problemIds);
    }
    const rows: Array<{ name: string; username: string; solved: string }> =
      await this.attemptRepo.query(
        `WITH accepted AS (
          SELECT a.user_id, s."problemId", min(s."createdAt") AS solved_at
          FROM contest_attempts a JOIN submissions s ON s."userId"::text = a.user_id::text
          WHERE a.contest_id = $5 AND s."problemId" = ANY($1::uuid[]) AND lower(s.status) = 'accepted'
            AND s."createdAt" >= greatest(a."startedAt", $2::timestamp)
            AND s."createdAt" <= least(coalesce(a."submittedAt", $3::timestamp), $3::timestamp)
          GROUP BY a.user_id, s."problemId"
        )
        SELECT u.name, u.username, count(accepted."problemId") AS solved
        FROM users u LEFT JOIN accepted ON accepted.user_id::text = u.id::text
        WHERE u.id::text = ANY($4::text[])
        GROUP BY u.id, u.name, u.username
        ORDER BY count(accepted."problemId") DESC, max(accepted.solved_at) ASC NULLS LAST, u.id ASC
        LIMIT 100`,
        [
          problemIds,
          contest.startTime,
          contest.endTime,
          contest.participants || [],
          contest.id,
        ],
      );
    return {
      contest: this.safeContest(contest),
      resultsPublished: !!contest.resultsPublished,
      leaderboard: rows.map((row, index) => ({
        rank: index + 1,
        name: row.name,
        username: row.username,
        solved: Number(row.solved),
        totalProblems: problemIds.length,
      })),
    };
  }

  private async shardedLeaderboard(contest: Contest, problemIds: string[]) {
    const participants: Array<{
      id: string;
      name: string;
      username: string;
      start: string | null;
      end: string | null;
    }> = await this.attemptRepo.query(
      `SELECT u.id, u.name, u.username,
              CASE WHEN a.id IS NOT NULL THEN to_char(greatest(a."startedAt", $2::timestamp), 'YYYY-MM-DD"T"HH24:MI:SS.US') END AS start,
              CASE WHEN a.id IS NOT NULL THEN to_char(least(coalesce(a."submittedAt", $3::timestamp), $3::timestamp), 'YYYY-MM-DD"T"HH24:MI:SS.US') END AS "end"
       FROM users u LEFT JOIN contest_attempts a ON a.user_id::text = u.id::text AND a.contest_id = $1
       WHERE u.id::text = ANY($4::text[])`,
      [
        contest.id,
        contest.startTime,
        contest.endTime,
        contest.participants || [],
      ],
    );
    const windows = participants
      .filter((row) => row.start && row.end)
      .map((row) => ({ userId: row.id, start: row.start!, end: row.end! }));
    const solved = await this.submissions!.contestSolvedProblems(
      problemIds,
      windows,
    );
    const scores = new Map<
      string,
      {
        id: string;
        name: string;
        username: string;
        problems: Set<string>;
        lastSolve: number | null;
      }
    >();
    for (const participant of participants)
      scores.set(participant.id, {
        ...participant,
        problems: new Set(),
        lastSolve: null,
      });
    for (const row of solved) {
      const score = scores.get(row.userId);
      if (!score) continue;
      score.problems.add(row.problemId);
      score.lastSolve = Math.max(
        score.lastSolve ?? -Infinity,
        new Date(row.solvedAt).getTime(),
      );
    }
    const ordered = [...scores.values()]
      .sort(
        (a, b) =>
          b.problems.size - a.problems.size ||
          (a.lastSolve ?? Infinity) - (b.lastSolve ?? Infinity) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 100);
    return {
      contest: this.safeContest(contest),
      leaderboard: ordered.map((row, index) => ({
        rank: index + 1,
        name: row.name,
        username: row.username,
        solved: row.problems.size,
        totalProblems: problemIds.length,
      })),
    };
  }

  private async eligibleContest(id: string, userId: string) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new NotFoundException('Contest not found');
    const contest = await this.contestRepo.findOne({
      where: { id, isPublished: true },
    });
    if (!contest || !contest.isPublished)
      throw new NotFoundException('Contest not found');
    if (!contest.participants?.includes(userId))
      throw new ForbiddenException('Register for this contest first');
    return contest;
  }

  async getStartContext(id: string, userId: string) {
    const contest = await this.eligibleContest(id, userId);
    return {
      contest: this.safeContest(contest),
      antiCheatConfig: (contest.antiCheatConfig || {
        enableFullscreen: true,
        enableCopyProtect: true,
        enablePasteProtect: true,
        enableDevToolsDetect: true,
        enableTabSwitchDetect: true,
        warningLimit: 3,
      }) as Record<string, unknown>,
    };
  }

  async startAttempt(id: string, userId: string) {
    const contest = await this.eligibleContest(id, userId);
    const now = Date.now();
    if (
      now < new Date(contest.startTime).getTime() ||
      now >= new Date(contest.endTime).getTime()
    )
      throw new BadRequestException(
        'Contest is outside its participation window',
      );
    const problems = await Promise.all(
      (contest.problems || []).map(async (problemId) => {
        const problem =
          await this.problemsService.getExecutionProblem(problemId);
        return { id: problem.id, title: problem.title, slug: problem.slug };
      }),
    );

    // Create first attempt or ignore if row exists
    await this.attemptRepo
      .createQueryBuilder()
      .insert()
      .values({
        contest_id: contest.id,
        user_id: userId,
        sessionId: randomUUID(),
        attemptNumber: 1,
      })
      .orIgnore()
      .execute();

    let attempt = await this.attemptRepo.findOne({
      where: { contest_id: contest.id, user_id: userId },
      order: { attemptNumber: 'DESC', createdAt: 'DESC' },
    });

    if (!attempt) {
      throw new BadRequestException('Your contest attempt has ended');
    }

    if (attempt.status !== 'InProgress') {
      // Completed or ended attempt. Check if student has active reattempt grant.
      const grant = this.reattemptGrantRepo
        ? await this.reattemptGrantRepo.findOne({
            where: { contest_id: contest.id, user_id: userId, status: 'ACTIVE' },
          })
        : null;

      const isValid =
        grant &&
        (!grant.expiresAt || new Date() < new Date(grant.expiresAt)) &&
        grant.usedAttempts < grant.allowedAttempts;

      if (!isValid) {
        throw new BadRequestException('Your contest attempt has ended');
      }

      // Consume one attempt from the authorized grant
      grant.usedAttempts += 1;
      if (grant.usedAttempts >= grant.allowedAttempts) {
        grant.status = 'USED';
      }
      await this.reattemptGrantRepo?.save(grant);

      // Create new reattempt
      const nextAttemptNumber = (attempt.attemptNumber || 1) + 1;
      const newAttempt = this.attemptRepo.create({
        contest_id: contest.id,
        user_id: userId,
        sessionId: randomUUID(),
        attemptNumber: nextAttemptNumber,
        status: 'InProgress',
        startedAt: new Date(),
        warnings: 0,
        violations: [],
        score: 0,
        problemsSolved: 0,
      });
      attempt = await this.attemptRepo.save(newAttempt);
    }

    this.logger.log({
      event: 'CONTEST_ATTEMPT_STARTED',
      contestId: contest.id,
      userId,
      sessionId: attempt.sessionId,
      attemptNumber: attempt.attemptNumber || 1,
    });

    return {
      contest: this.safeContest(contest),
      problems,
      sessionId: attempt.sessionId,
      startedAt: attempt.startedAt,
      antiCheatConfig: contest.antiCheatConfig as Record<string, unknown>,
      attemptNumber: attempt.attemptNumber || 1,
    };
  }

  async submitAttempt(id: string, userId: string, sessionId: string) {
    const contest = await this.eligibleContest(id, userId);
    const attempt = await this.attemptRepo.findOne({
      where: { contest_id: contest.id, user_id: userId, sessionId },
    });
    if (!attempt || attempt.sessionId !== sessionId)
      throw new ForbiddenException('Invalid contest session');

    // Calculate score & problemsSolved from submissions
    const problemIds = (contest.problems || []).filter((pid) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pid),
    );
    let problemsSolved = 0;
    if (problemIds.length > 0) {
      try {
        if (this.submissions?.isSharded) {
          const solved = await this.submissions.contestSolvedProblems(problemIds, [
            { userId, start: attempt.startedAt, end: new Date() },
          ]);
          problemsSolved = new Set(solved.map((row) => row.problemId)).size;
        } else {
          const solved = await this.attemptRepo.query(
            `SELECT count(DISTINCT "problemId") as count 
             FROM submissions 
             WHERE "userId"::text = $1 AND "problemId" = ANY($2::uuid[]) AND lower(status) = 'accepted'
               AND "createdAt" >= $3`,
            [userId, problemIds, attempt.startedAt],
          );
          problemsSolved = Number(solved[0]?.count || 0);
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to calculate contest attempt score for user ${userId} in contest ${contest.id}: ${err?.message || err}`,
          err?.stack,
        );
        throw err;
      }
    }

    const score = problemsSolved * 100;

    await this.attemptRepo
      .createQueryBuilder()
      .update()
      .set({
        status: 'Submitted',
        submittedAt: new Date(),
        problemsSolved,
        score,
      })
      .where('id = :id AND status = :status', {
        id: attempt.id,
        status: 'InProgress',
      })
      .execute();

    this.logger.log({
      event: 'CONTEST_ATTEMPT_SUBMITTED',
      contestId: contest.id,
      attemptId: attempt.id,
      userId,
      sessionId,
      score,
      problemsSolved,
    });

    return { success: true, slug: contest.slug, score, problemsSolved };
  }

  async recordViolation(
    id: string,
    userId: string,
    sessionId: string,
    type: string,
    metadata?: any,
  ) {
    const contest = await this.eligibleContest(id, userId);
    if (typeof type !== 'string' || !type || type.length > 100)
      throw new BadRequestException('Invalid violation');

    const config = (contest.antiCheatConfig || {}) as Record<string, unknown>;
    const limit = Math.max(1, Number(config.maxTabSwitchViolations ?? config.warningLimit ?? 3));
    const action =
      (config.actionOnMaxViolations as string) ||
      (config.autoSubmitOnViolation !== false ? 'auto_submit' : 'flag_review');

    const nextStatus =
      action === 'auto_submit'
        ? 'Terminated'
        : action === 'lock_attempt'
          ? 'Locked'
          : 'InProgress';

    const autoSubmit =
      action !== 'flag_review' && config?.autoSubmitOnViolation !== false;

    const rows: Array<{ warnings: number; status: string }> =
      await this.attemptRepo.query(
        `UPDATE contest_attempts SET warnings = warnings + 1,
        violations = violations || jsonb_build_array(jsonb_build_object('type', $4::text, 'timestamp', now())),
        status = CASE WHEN $5::boolean AND warnings + 1 >= $6 THEN 'Terminated' ELSE status END,
        "submittedAt" = CASE WHEN $5::boolean AND warnings + 1 >= $6 THEN now() ELSE "submittedAt" END
       WHERE contest_id = $1 AND user_id = $2 AND "sessionId" = $3 AND status = 'InProgress'
       RETURNING warnings, status`,
        [
          contest.id,
          userId,
          sessionId,
          type,
          autoSubmit,
          limit,
        ],
      );

    if (!rows[0])
      throw new ForbiddenException('Invalid or ended contest session');

    const currentWarnings = rows[0].warnings;
    const forceSubmit = rows[0].status === 'Terminated' || rows[0].status === 'Locked';

    this.logger.warn({
      event: 'CONTEST_VIOLATION_RECORDED',
      contestId: contest.id,
      userId,
      sessionId,
      violationType: type,
      warnings: currentWarnings,
      forceSubmit,
      status: rows[0].status,
    });

    const result: any = {
      success: true,
      warnings: currentWarnings,
      forceSubmit,
    };

    if (config.maxTabSwitchViolations !== undefined || metadata !== undefined) {
      result.warningLimit = limit;
      result.remaining = Math.max(0, limit - currentWarnings);
      result.status = rows[0].status;
      result.actionApplied = currentWarnings >= limit ? action : undefined;
    }

    return result;
  }
}
