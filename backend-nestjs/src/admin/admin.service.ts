import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';

import { User } from '../database/entities/user.entity';
import { ProblemMetadata } from '../database/entities/problem-metadata.entity';
import { ProblemStatement } from '../database/entities/problem-statement.entity';
import { ProblemConfig } from '../database/entities/problem-config.entity';
import { ProblemTestCase } from '../database/entities/problem-testcase.entity';
import { Contest } from '../database/entities/contest.entity';
import { ContestAttempt } from '../database/entities/contest-attempt.entity';
import { ContestReattemptGrant } from '../database/entities/contest-reattempt-grant.entity';
import { Company } from '../database/entities/company.entity';
import { University } from '../database/entities/university.entity';
import { SubmissionStore } from '../database/sharding/submission-store';
import { Assessment } from '../database/entities/assessment.entity';
import { Question } from '../database/entities/question.entity';
import { CacheService } from '../redis/cache.service';
import { TokenService } from '../auth/token.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ProblemMetadata)
    private readonly problemModel: Repository<ProblemMetadata>,
    @InjectRepository(ProblemStatement)
    private readonly statementModel: Repository<ProblemStatement>,
    @InjectRepository(ProblemConfig)
    private readonly configModel: Repository<ProblemConfig>,
    @InjectRepository(ProblemTestCase)
    private readonly testCaseModel: Repository<ProblemTestCase>,
    @InjectRepository(Contest)
    private readonly contestModel: Repository<Contest>,
    @InjectRepository(Company)
    private readonly companyModel: Repository<Company>,
    @InjectRepository(University)
    private readonly universityModel: Repository<University>,
    private readonly submissionModel: SubmissionStore,
    @InjectRepository(Assessment)
    private readonly assessmentModel: Repository<Assessment>,
    @InjectRepository(Question)
    private readonly questionModel: Repository<Question>,
    private readonly cacheService: CacheService,
    @Optional()
    private readonly tokenService?: TokenService,
    @Optional()
    @InjectRepository(ContestAttempt)
    private readonly attemptModel?: Repository<ContestAttempt>,
    @Optional()
    @InjectRepository(ContestReattemptGrant)
    private readonly reattemptGrantModel?: Repository<ContestReattemptGrant>,
  ) {}

  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalProblems,
      totalContests,
      totalSubmissions,
      totalAssessments,
      totalQuestions,
      activeToday,
      recentUsers,
      recentSubmissions,
      recentAssessments,
    ] = await Promise.all([
      this.userRepo.count(),
      this.problemModel.count(),
      this.contestModel.count(),
      this.submissionModel.count(),
      this.assessmentModel.count().catch(() => 0),
      this.questionModel.count().catch(() => 0),
      this.userRepo
        .count({ where: { updatedAt: MoreThanOrEqual(today) } })
        .catch(() => 0),
      this.userRepo.find({
        order: { createdAt: 'DESC' },
        take: 6,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          authProvider: true,
        },
      }),
      this.submissionModel.find({
        order: { createdAt: 'DESC' },
        take: 6,
        relations: { user: true },
      }),
      this.assessmentModel
        .find({
          order: { createdAt: 'DESC' },
          take: 6,
          select: {
            id: true,
            title: true,
            status: true,
            durationMinutes: true,
            allowedAttempts: true,
            createdAt: true,
          },
        })
        .catch(() => []),
    ]);

    return {
      stats: {
        totalUsers,
        totalProblems,
        totalContests,
        totalSubmissions,
        totalAssessments,
        totalQuestions,
        activeToday: Math.max(activeToday, 1),
      },
      recentActivity: {
        users: recentUsers.map((u) => ({ ...u, _id: u.id })),
        submissions: recentSubmissions.map((s) => ({
          ...s,
          _id: s.id,
          user: s.user ? { ...s.user, _id: s.user.id } : null,
        })),
        assessments: recentAssessments.map((a) => ({ ...a, _id: a.id })),
      },
    };
  }

  // Common user management for admin
  async getUsers(page = 1, limit = 50, search = '', adminsOnly = false) {
    const skip = (page - 1) * limit;
    const qb = this.userRepo.createQueryBuilder('user');

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      qb.where('(user.name ILIKE :s OR user.email ILIKE :s)', { s });
    }

    if (adminsOnly) {
      qb.andWhere('(user.isAdmin = true OR user.role = :adminRole)', {
        adminRole: 'ADMIN',
      });
    }

    qb.orderBy('user.createdAt', 'DESC').skip(skip).take(limit);

    const [rawUsers, total] = await qb.getManyAndCount();
    const users = rawUsers.map((u) => {
      const { password, ...rest } = u;
      return { ...rest, _id: u.id };
    });

    return {
      success: true,
      users,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async updateUserRole(
    id: string,
    roleData: UpdateUserRoleDto,
    actor?: { id?: string; role?: string; isAdmin?: boolean },
  ) {
    const user = await this.userRepo.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!user) throw new NotFoundException('User not found');

    const targetRole = roleData.role !== undefined ? roleData.role : user.role;
    const targetIsAdmin =
      roleData.isAdmin !== undefined
        ? roleData.isAdmin
        : roleData.role !== undefined
          ? ['admin', 'super_admin', 'student_admin', 'assessment_admin'].includes(roleData.role)
          : user.isAdmin;

    const isElevatingToAdmin =
      (targetIsAdmin && !user.isAdmin) ||
      (targetRole === 'super_admin' && user.role !== 'super_admin') ||
      (targetRole === 'admin' && user.role !== 'admin');

    const isActorSuperAdmin = actor && actor.role === 'super_admin';

    // Only super_admin can grant administrative privileges
    if (isElevatingToAdmin && actor && !isActorSuperAdmin) {
      throw new ForbiddenException(
        'Only super_admin can grant administrative privileges',
      );
    }

    // Only super_admin can modify an existing super_admin account
    if (user.role === 'super_admin' && actor && !isActorSuperAdmin) {
      throw new ForbiddenException(
        'Only super_admin can modify an existing super_admin account',
      );
    }

    // Guard against demoting or removing the last super_admin in the system
    if (
      user.role === 'super_admin' &&
      (targetRole !== 'super_admin' || targetIsAdmin === false)
    ) {
      const superAdminCount = await this.userRepo.count({
        where: { role: 'super_admin' },
      });
      if (superAdminCount <= 1) {
        throw new BadRequestException(
          'Cannot demote or remove the last super_admin in the system',
        );
      }
    }

    // Apply strict field updates only (no mass assignment)
    user.role = targetRole;
    user.isAdmin = targetIsAdmin;
    if (user.profile) {
      user.profile = { ...user.profile, role: targetRole };
    }

    await this.userRepo.save(user);

    // Invalidate user sessions immediately upon role change
    if (this.tokenService) {
      await this.tokenService.invalidateUserSessions(user.id);
    }

    const { password, mfaSecret, ...rest } = user;
    return { ...rest, _id: user.id };
  }

  async promoteUser(
    id: string,
    actor?: { id?: string; role?: string; isAdmin?: boolean },
  ) {
    const user = await this.updateUserRole(
      id,
      { role: 'admin', isAdmin: true },
      actor,
    );
    return {
      success: true,
      message: `${user.email} is now an admin`,
      user,
    };
  }

  async demoteUser(
    id: string,
    actor?: { id?: string; role?: string; isAdmin?: boolean },
  ) {
    const user = await this.updateUserRole(
      id,
      { role: 'student', isAdmin: false },
      actor,
    );
    return {
      success: true,
      message: `${user.email} is no longer an admin`,
      user,
    };
  }

  async getReport(userId: string) {
    const user = await this.userRepo.findOne({
      where: [{ id: userId }, { mongoId: userId }],
    });
    if (!user) throw new NotFoundException('User not found');

    const submissions = await this.submissionModel.find({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    const stats = {
      totalSubmissions: submissions.length,
      accepted: submissions.filter((s) => s.status === 'Accepted').length,
    };

    const { password, ...userWithoutPassword } = user;

    return {
      report: {
        user: { ...userWithoutPassword, _id: user.id },
        stats,
        recentSubmissions: submissions.slice(0, 10).map((s) => ({
          ...s,
          _id: s.id,
        })),
      },
    };
  }

  // --- Contests ---
  async getContests(page = 1, limit = 20, search = '') {
    const skip = (page - 1) * limit;
    const qb = this.contestModel.createQueryBuilder('contest');

    if (search && search.trim()) {
      qb.where('contest.title ILIKE :s', { s: `%${search.trim()}%` });
    }

    qb.orderBy('contest.createdAt', 'DESC').skip(skip).take(limit);

    const [contests, total] = await qb.getManyAndCount();

    let participantCounts: Record<string, number> = {};
    if (this.attemptModel && contests.length > 0) {
      try {
        const contestIds = contests.map((c) => c.id);
        const counts = await this.attemptModel
          .createQueryBuilder('attempt')
          .select('attempt.contest_id', 'contestId')
          .addSelect('COUNT(DISTINCT attempt.user_id)', 'count')
          .where('attempt.contest_id IN (:...contestIds)', { contestIds })
          .groupBy('attempt.contest_id')
          .getRawMany();
        for (const row of counts) {
          participantCounts[row.contestId] = parseInt(row.count, 10) || 0;
        }
      } catch {
        // Fallback gracefully if query fails
      }
    }

    return {
      contests: contests.map((c) => ({
        ...c,
        _id: c.id,
        participantCount: participantCounts[c.id] || (Array.isArray(c.participants) ? c.participants.length : 0),
        resultsPublished: c.resultsPublished === true,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  private contestLookup(id: string) {
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      return [{ id }, { mongoId: id }];
    }
    // Legacy Mongo IDs must not be compared with PostgreSQL's UUID column.
    if (/^[0-9a-f]{24}$/i.test(id)) return [{ mongoId: id }];
    throw new BadRequestException('Invalid contest ID');
  }

  async getContestById(id: string) {
    const contest = await this.contestModel.findOne({
      where: this.contestLookup(id),
    });
    if (!contest) throw new NotFoundException('Contest not found');
    return { ...contest, _id: contest.id };
  }

  async deleteContest(id: string) {
    const contest = await this.contestModel.findOne({
      where: this.contestLookup(id),
    });
    if (!contest) throw new NotFoundException('Contest not found');
    await this.contestModel.remove(contest);
    return { success: true, message: 'Contest deleted' };
  }

  private validateContestPayload(body: any) {
    const title = String(body?.title || '').trim();
    const slug = String(body?.slug || '')
      .trim()
      .toLowerCase();
    const description = String(body?.description || '').trim();
    if (!title) throw new BadRequestException('Contest title is required');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException(
        'Slug may only contain lowercase letters, numbers and hyphens',
      );
    }
    if (!description) {
      throw new BadRequestException('Contest description is required');
    }
    const startTime = new Date(body?.startTime);
    const endTime = new Date(body?.endTime);
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      throw new BadRequestException('Valid start and end times are required');
    }
    if (endTime <= startTime) {
      throw new BadRequestException('End time must be after start time');
    }
    const problems = Array.isArray(body?.problems) ? body.problems : [];
    if (problems.length === 0) {
      throw new BadRequestException('Select at least one problem');
    }
    if (body?.isPrivate && !String(body?.password || '').trim()) {
      throw new BadRequestException('Private contests require a password');
    }

    const payload: any = {
      title,
      slug,
      description,
      startTime,
      endTime,
      problems,
      isPrivate: !!body?.isPrivate,
      password: body?.isPrivate ? String(body.password).trim() : undefined,
      isPublished: !!body?.isPublished,
    };

    if (body?.antiCheatConfig) {
      const rawAntiCheat = body.antiCheatConfig;
      const maxTabSwitch = Number.isInteger(Number(rawAntiCheat.maxTabSwitchViolations))
        ? Math.max(1, Number(rawAntiCheat.maxTabSwitchViolations))
        : Number.isInteger(Number(rawAntiCheat.warningLimit))
          ? Math.max(1, Number(rawAntiCheat.warningLimit))
          : 3;
      const action = ['auto_submit', 'lock_attempt', 'flag_review'].includes(rawAntiCheat.actionOnMaxViolations)
        ? rawAntiCheat.actionOnMaxViolations
        : 'auto_submit';
      payload.antiCheatConfig = {
        enableTabSwitchDetection: rawAntiCheat.enableTabSwitchDetection !== false,
        enableFullscreenCheck: rawAntiCheat.enableFullscreenCheck !== false,
        maxTabSwitchViolations: maxTabSwitch,
        warningLimit: maxTabSwitch,
        actionOnMaxViolations: action,
      };
    }

    if (typeof body?.resultsPublished === 'boolean') {
      payload.resultsPublished = body.resultsPublished;
    }

    return payload;
  }

  async createContest(body: any) {
    const data = this.validateContestPayload(body);
    if (!data.antiCheatConfig) {
      data.antiCheatConfig = {
        enableTabSwitchDetection: true,
        enableFullscreenCheck: true,
        maxTabSwitchViolations: 3,
        warningLimit: 3,
        actionOnMaxViolations: 'auto_submit',
      };
    }
    const existing = await this.contestModel.findOne({
      where: { slug: data.slug },
    });
    if (existing) {
      throw new ConflictException(`Slug '${data.slug}' is already in use`);
    }
    const contest = this.contestModel.create(data as Partial<Contest>) as Contest;
    await this.contestModel.save(contest);
    return {
      success: true,
      message: 'Contest created',
      contest: { ...contest, _id: contest.id },
      shareUrl: `/contests/${contest.slug}`,
    };
  }

  async updateContest(id: string, body: any) {
    const data = this.validateContestPayload(body);
    const contest = await this.contestModel.findOne({
      where: this.contestLookup(id),
    });
    if (!contest) throw new NotFoundException('Contest not found');

    const clash = await this.contestModel.findOne({
      where: { slug: data.slug },
    });
    if (clash && clash.id !== contest.id) {
      throw new ConflictException(`Slug '${data.slug}' is already in use`);
    }

    Object.assign(contest, data);
    await this.contestModel.save(contest);
    return {
      success: true,
      message: 'Contest updated',
      contest: { ...contest, _id: contest.id },
    };
  }

  async getContestResults(
    id: string,
    query: {
      search?: string;
      status?: string;
      minScore?: string | number;
      maxScore?: string | number;
      page?: string | number;
      limit?: string | number;
    } = {},
  ) {
    const contest = await this.contestModel.findOne({
      where: this.contestLookup(id),
    });
    if (!contest) throw new NotFoundException('Contest not found');

    if (!this.attemptModel) {
      return {
        contest: { ...contest, _id: contest.id },
        results: [],
        total: 0,
        page: 1,
        pages: 0,
        stats: { totalAttempts: 0, completedCount: 0, avgScore: 0, maxScore: 0 },
      };
    }

    const qb = this.attemptModel
      .createQueryBuilder('attempt')
      .leftJoinAndSelect('attempt.user', 'user')
      .where('attempt.contest_id = :contestId', { contestId: contest.id });

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        '(user.name ILIKE :term OR user.email ILIKE :term OR user.username ILIKE :term)',
        { term },
      );
    }

    if (query.status && query.status.trim()) {
      qb.andWhere('attempt.status = :status', { status: query.status.trim() });
    }

    if (query.minScore !== undefined && query.minScore !== '') {
      qb.andWhere('attempt.score >= :minScore', {
        minScore: Number(query.minScore),
      });
    }

    if (query.maxScore !== undefined && query.maxScore !== '') {
      qb.andWhere('attempt.score <= :maxScore', {
        maxScore: Number(query.maxScore),
      });
    }

    qb.orderBy('attempt.score', 'DESC')
      .addOrderBy('attempt.submittedAt', 'ASC')
      .addOrderBy('attempt.startedAt', 'ASC');

    const allMatching = await qb.getMany();

    const grantsMap = new Map<string, ContestReattemptGrant[]>();
    if (this.reattemptGrantModel) {
      try {
        const grants = await this.reattemptGrantModel.find({
          where: { contest_id: contest.id },
          order: { createdAt: 'DESC' },
        });
        for (const g of grants) {
          const list = grantsMap.get(g.user_id) || [];
          list.push(g);
          grantsMap.set(g.user_id, list);
        }
      } catch {
        // Fallback gracefully
      }
    }

    const page = Math.max(1, parseInt(String(query.page || 1), 10));
    const limit = Math.max(1, parseInt(String(query.limit || 50), 10));
    const skip = (page - 1) * limit;

    const total = allMatching.length;
    const paginated = allMatching.slice(skip, skip + limit);

    const completedAttempts = allMatching.filter(
      (a) => a.status === 'Completed' || a.submittedAt,
    );
    const avgScore = completedAttempts.length
      ? Math.round(
          (completedAttempts.reduce((sum, a) => sum + (Number(a.score) || 0), 0) /
            completedAttempts.length) *
            100,
        ) / 100
      : 0;
    const maxScore = allMatching.reduce(
      (max, a) => Math.max(max, Number(a.score) || 0),
      0,
    );

    const results = paginated.map((attempt) => {
      const studentGrants = grantsMap.get(attempt.user_id) || [];
      const activeGrant = studentGrants.find(
        (g) =>
          g.status === 'ACTIVE' &&
          (!g.expiresAt || new Date(g.expiresAt) > new Date()),
      );

      const durationSeconds =
        attempt.submittedAt && attempt.startedAt
          ? Math.max(
              0,
              Math.round(
                (new Date(attempt.submittedAt).getTime() -
                  new Date(attempt.startedAt).getTime()) /
                  1000,
              ),
            )
          : null;

      return {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber || 1,
        user: {
          id: attempt.user?.id || attempt.user_id,
          name: attempt.user?.name || 'Unknown',
          email: attempt.user?.email || '',
          username: attempt.user?.username || '',
        },
        score: Number(attempt.score) || 0,
        problemsSolved: attempt.problemsSolved || 0,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        durationSeconds,
        warnings: attempt.warnings || (attempt.violations || []).length || 0,
        violations: attempt.violations || [],
        reattemptGrant: activeGrant
          ? {
              id: activeGrant.id,
              allowedAttempts: activeGrant.allowedAttempts,
              usedAttempts: activeGrant.usedAttempts,
              expiresAt: activeGrant.expiresAt,
              grantedBy: activeGrant.grantedByEmail || activeGrant.grantedBy,
              reason: activeGrant.reason,
              createdAt: activeGrant.createdAt,
            }
          : null,
        grantHistory: studentGrants,
      };
    });

    return {
      contest: {
        id: contest.id,
        _id: contest.id,
        title: contest.title,
        slug: contest.slug,
        startTime: contest.startTime,
        endTime: contest.endTime,
        isPublished: contest.isPublished,
        resultsPublished: contest.resultsPublished === true,
        antiCheatConfig: contest.antiCheatConfig,
        problemsCount: (contest.problems || []).length,
      },
      results,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      stats: {
        totalAttempts: total,
        completedCount: completedAttempts.length,
        avgScore,
        maxScore,
      },
    };
  }

  async toggleContestResultsPublish(id: string, publish?: boolean) {
    const contest = await this.contestModel.findOne({
      where: this.contestLookup(id),
    });
    if (!contest) throw new NotFoundException('Contest not found');

    contest.resultsPublished =
      publish !== undefined ? Boolean(publish) : !contest.resultsPublished;
    await this.contestModel.save(contest);

    return {
      success: true,
      message: `Contest results ${contest.resultsPublished ? 'published' : 'unpublished'} successfully`,
      resultsPublished: contest.resultsPublished,
    };
  }

  async grantContestReattempts(
    id: string,
    adminUser: any,
    payload: {
      studentIds: string[];
      reason?: string;
      allowedAttempts?: number;
      expiresAt?: string | Date;
    },
  ) {
    const contest = await this.contestModel.findOne({
      where: this.contestLookup(id),
    });
    if (!contest) throw new NotFoundException('Contest not found');

    if (!this.reattemptGrantModel) {
      throw new BadRequestException('Reattempt grant module not configured');
    }

    const studentIds = Array.isArray(payload.studentIds)
      ? payload.studentIds.filter(Boolean)
      : [];
    if (studentIds.length === 0) {
      throw new BadRequestException('At least one student ID must be provided');
    }

    const grantedBy = adminUser?.id || adminUser?._id || 'admin';
    const grantedByEmail = adminUser?.email || 'admin@codeskill.edu';
    const reason =
      String(payload.reason || '').trim() || 'Admin authorized reattempt';
    const allowedAttempts =
      Number(payload.allowedAttempts) > 0 ? Number(payload.allowedAttempts) : 1;
    const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;

    const createdGrants = [];
    for (const studentId of studentIds) {
      const existing = await this.reattemptGrantModel.find({
        where: { contest_id: contest.id, user_id: studentId, status: 'ACTIVE' },
      });
      for (const eg of existing) {
        eg.status = 'REVOKED';
        await this.reattemptGrantModel.save(eg);
      }

      const grant = this.reattemptGrantModel.create({
        contest_id: contest.id,
        user_id: studentId,
        grantedBy,
        grantedByEmail,
        reason,
        allowedAttempts,
        usedAttempts: 0,
        expiresAt: expiresAt || undefined,
        status: 'ACTIVE',
      });
      const saved = await this.reattemptGrantModel.save(grant);
      createdGrants.push(saved);
    }

    return {
      success: true,
      message: `Granted reattempt for ${createdGrants.length} student(s)`,
      count: createdGrants.length,
      grants: createdGrants,
    };
  }

  async revokeContestReattempt(id: string, targetId: string) {
    const contest = await this.contestModel.findOne({
      where: this.contestLookup(id),
    });
    if (!contest) throw new NotFoundException('Contest not found');

    if (!this.reattemptGrantModel) {
      throw new BadRequestException('Reattempt grant module not configured');
    }

    const grant = await this.reattemptGrantModel.findOne({
      where: [
        { id: targetId, contest_id: contest.id, status: 'ACTIVE' },
        { user_id: targetId, contest_id: contest.id, status: 'ACTIVE' },
      ],
    });

    if (!grant) {
      throw new NotFoundException('Active reattempt grant not found');
    }

    grant.status = 'REVOKED';
    await this.reattemptGrantModel.save(grant);

    return {
      success: true,
      message: 'Reattempt grant revoked',
      grant,
    };
  }

  async exportContestResultsCsv(id: string): Promise<string> {
    const resultsData = await this.getContestResults(id, { limit: 10000 });
    const escapeCsv = (str: any) => `"${String(str ?? '').replace(/"/g, '""')}"`;

    const headers = [
      'Student Name',
      'Email',
      'Attempt Number',
      'Score',
      'Problems Solved',
      'Status',
      'Started At',
      'Submitted At',
      'Duration (seconds)',
      'Violation Count',
      'Violations Timeline',
      'Reattempt Authorized',
      'Reattempt Granted By',
      'Reattempt Reason',
    ];

    const rows = (resultsData.results || []).map((r: any) => {
      const violationsDesc = (r.violations || [])
        .map((v: any) => `[${v.type} at ${v.timestamp || ''}]`)
        .join('; ');
      return [
        escapeCsv(r.user?.name),
        escapeCsv(r.user?.email),
        r.attemptNumber,
        r.score,
        r.problemsSolved,
        escapeCsv(r.status),
        escapeCsv(r.startedAt ? new Date(r.startedAt).toISOString() : ''),
        escapeCsv(r.submittedAt ? new Date(r.submittedAt).toISOString() : ''),
        r.durationSeconds ?? '',
        r.warnings,
        escapeCsv(violationsDesc),
        r.reattemptGrant ? 'Yes' : 'No',
        escapeCsv(r.reattemptGrant?.grantedBy || ''),
        escapeCsv(r.reattemptGrant?.reason || ''),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  // --- Problems ---
  async getProblems(page = 1, limit = 20, search = '') {
    const skip = (page - 1) * limit;
    const qb = this.problemModel.createQueryBuilder('p');

    if (search && search.trim()) {
      qb.where('p.title ILIKE :s', { s: `%${search.trim()}%` });
    }

    qb.orderBy('p.createdAt', 'DESC').skip(skip).take(limit);

    const [problems, total] = await qb.getManyAndCount();
    return {
      problems: problems.map((p) => ({ ...p, _id: p.id })),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async getProblemById(id: string) {
    const problem = await this.problemModel.findOne({
      where: [{ id }, { mongoId: id }],
      relations: { statement: true, config: true, testCases: true },
    });
    if (!problem) throw new NotFoundException('Problem not found');
    return { ...problem, _id: problem.id };
  }

  async deleteProblem(id: string) {
    const problem = await this.problemModel.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!problem) throw new NotFoundException('Problem not found');
    await this.problemModel.remove(problem);
    await this.cacheService.invalidatePrefix('problems:');
    if (problem.slug) {
      await this.cacheService.invalidatePrefix(`problem:${problem.slug}`);
    }
    return { success: true, message: 'Problem deleted' };
  }

  async createProblem(payload: any, userId?: string) {
    const {
      metadata,
      languages,
      execution,
      statement,
      sampleExamples,
      starterCode,
      referenceSolution,
      testCases,
      customChecker,
      publishing,
    } = payload;

    const visibility =
      publishing?.visibility ||
      metadata?.visibility ||
      (publishing?.publishImmediately
        ? 'Published'
        : publishing?.saveAsDraft
          ? 'Draft'
          : 'Draft');

    const newProblem = this.problemModel.create({
      ...metadata,
      visibility,
      author_id: userId || null,
    } as any) as unknown as ProblemMetadata;
    await this.problemModel.save(newProblem);

    const newStatement = this.statementModel.create({
      metadata_id: newProblem.id,
      ...statement,
      samples: sampleExamples || [],
    } as any) as unknown as ProblemStatement;

    const newConfig = this.configModel.create({
      metadata_id: newProblem.id,
      supportedLanguages: languages || [],
      timeLimit: execution?.timeLimit || 2000,
      memoryLimit: execution?.memoryLimit || 256,
      cpuLimit: execution?.cpuLimit || 1,
      executionMode: execution?.executionMode || 'standard',
      functionSignature: execution?.functionSignature,
      exactOutput: execution?.exactOutput === true,
      starterCode: starterCode || {},
      referenceSolution: referenceSolution || {},
      hasCustomChecker: customChecker?.hasCustomChecker || false,
      customCheckerCode: customChecker?.customCheckerCode || {},
    } as any) as unknown as ProblemConfig;

    const newTestCase = this.testCaseModel.create({
      metadata_id: newProblem.id,
      cases: testCases?.cases || [],
    } as any) as unknown as ProblemTestCase;

    await Promise.all([
      this.statementModel.save(newStatement),
      this.configModel.save(newConfig),
      this.testCaseModel.save(newTestCase),
    ]);

    await this.cacheService.invalidatePrefix('problems:');

    return {
      success: true,
      problem: {
        ...newProblem,
        _id: newProblem.id,
        statement: newStatement,
        config: newConfig,
        testCases: newTestCase,
      },
    };
  }

  async updateProblem(id: string, payload: any) {
    const {
      metadata,
      languages,
      execution,
      statement,
      sampleExamples,
      starterCode,
      referenceSolution,
      testCases,
      customChecker,
      publishing,
    } = payload;

    const problem = await this.problemModel.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!problem) throw new NotFoundException('Problem not found');

    const visibility =
      publishing?.visibility ||
      metadata?.visibility ||
      (publishing?.publishImmediately
        ? 'Published'
        : publishing?.saveAsDraft
          ? 'Draft'
          : undefined);

    if (metadata) {
      Object.assign(problem, metadata);
    }
    if (visibility) {
      problem.visibility = visibility;
    }
    await this.problemModel.save(problem);

    if (statement || sampleExamples) {
      let stmt = await this.statementModel.findOne({
        where: [{ metadata_id: problem.id }, { metadata_id: id }],
      });
      if (!stmt) {
        stmt = this.statementModel.create({ metadata_id: problem.id });
      }
      Object.assign(stmt, statement || {}, {
        samples: sampleExamples || [],
      });
      await this.statementModel.save(stmt);
    }

    if (
      languages ||
      execution ||
      starterCode ||
      referenceSolution ||
      customChecker
    ) {
      let conf = await this.configModel.findOne({
        where: [{ metadata_id: problem.id }, { metadata_id: id }],
      });
      if (!conf) {
        conf = this.configModel.create({ metadata_id: problem.id });
      }
      if (languages) conf.supportedLanguages = languages;
      if (execution?.timeLimit) conf.timeLimit = execution.timeLimit;
      if (execution?.memoryLimit) conf.memoryLimit = execution.memoryLimit;
      if (execution?.cpuLimit) conf.cpuLimit = execution.cpuLimit;
      if (execution?.executionMode) conf.executionMode = execution.executionMode;
      if (execution?.functionSignature !== undefined)
        conf.functionSignature = execution.functionSignature;
      if (execution?.exactOutput !== undefined)
        conf.exactOutput = execution.exactOutput;
      if (starterCode) conf.starterCode = starterCode;
      if (referenceSolution) conf.referenceSolution = referenceSolution;
      if (customChecker?.hasCustomChecker !== undefined)
        conf.hasCustomChecker = customChecker.hasCustomChecker;
      if (customChecker?.customCheckerCode)
        conf.customCheckerCode = customChecker.customCheckerCode;
      await this.configModel.save(conf);
    }

    if (testCases?.cases) {
      let tc = await this.testCaseModel.findOne({
        where: [{ metadata_id: problem.id }, { metadata_id: id }],
      });
      if (!tc) {
        tc = this.testCaseModel.create({ metadata_id: problem.id });
      }
      tc.cases = testCases.cases;
      await this.testCaseModel.save(tc);
    }

    await this.cacheService.invalidatePrefix('problems:');
    if (problem.slug) {
      await this.cacheService.invalidatePrefix(`problem:${problem.slug}`);
    }

    return { success: true, problem: { ...problem, _id: problem.id } };
  }

  // --- Companies ---
  async getCompanies(page = 1, limit = 20, search = '') {
    const skip = (page - 1) * limit;
    const qb = this.companyModel.createQueryBuilder('c');

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      qb.where('(c.name ILIKE :s OR c.domain ILIKE :s)', { s });
    }

    qb.orderBy('c.createdAt', 'DESC').skip(skip).take(limit);

    const [companies, total] = await qb.getManyAndCount();
    return {
      companies: companies.map((c) => ({ ...c, _id: c.id })),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async toggleCompanyVerification(id: string) {
    const company = await this.companyModel.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!company) throw new NotFoundException('Company not found');

    company.isVerified = !company.isVerified;
    await this.companyModel.save(company);
    return { success: true, isVerified: company.isVerified };
  }

  async deleteCompany(id: string) {
    const company = await this.companyModel.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!company) throw new NotFoundException('Company not found');
    await this.companyModel.remove(company);
    return { success: true, message: 'Company deleted' };
  }

  // --- Universities ---
  async getUniversities(page = 1, limit = 20, search = '') {
    const skip = (page - 1) * limit;
    const qb = this.universityModel.createQueryBuilder('u');

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      qb.where('(u.name ILIKE :s OR u.domain ILIKE :s)', { s });
    }

    qb.orderBy('u.createdAt', 'DESC').skip(skip).take(limit);

    const [universities, total] = await qb.getManyAndCount();
    return {
      universities: universities.map((u) => ({ ...u, _id: u.id })),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async createUniversity(data: {
    name: string;
    domain?: string;
    website?: string;
    location?: string;
    contactEmail?: string;
  }) {
    const existing = await this.universityModel.findOne({
      where: { name: data.name },
    });
    if (existing) {
      return {
        success: false,
        message: 'A university with this name already exists',
      };
    }
    const university = this.universityModel.create({
      name: data.name,
      domain: data.domain || '',
      website: data.website || '',
      location: data.location || '',
      contactEmail: data.contactEmail || '',
      isVerified: true,
    });
    await this.universityModel.save(university);
    return {
      success: true,
      university: { ...university, _id: university.id },
    };
  }

  async toggleUniversityVerification(id: string) {
    const university = await this.universityModel.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!university) throw new NotFoundException('University not found');

    university.isVerified = !university.isVerified;
    await this.universityModel.save(university);
    return { success: true, isVerified: university.isVerified };
  }

  async deleteUniversity(id: string) {
    const university = await this.universityModel.findOne({
      where: [{ id }, { mongoId: id }],
    });
    if (!university) throw new NotFoundException('University not found');
    await this.universityModel.remove(university);
    return { success: true, message: 'University deleted' };
  }
}
