jest.mock('@nestjs/typeorm', () => ({ InjectRepository: () => () => {}, InjectDataSource: () => () => {} }));
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AdminService } from './admin.service';

const id = '00000000-0000-4000-8000-000000000001';
const payload = {
  title: 'Updated Contest',
  slug: 'updated-contest',
  description: 'Updated details',
  startTime: '2026-11-01T04:30:00Z',
  endTime: '2026-11-01T06:30:00Z',
  problems: ['p1', 'p2'],
  isPrivate: true,
  password: 'access-code',
  isPublished: true,
};

describe('Admin contest editing', () => {
  let service: AdminService;
  type ContestRecord = {
    id: string;
    title: string;
    slug: string;
    [key: string]: unknown;
  };
  type Lookup = {
    where: { id?: string; mongoId?: string }[] | { slug: string };
  };
  let stored: ContestRecord;
  const makeRepository = () => ({
    findOne: jest.fn(({ where }: Lookup) =>
      Promise.resolve(Array.isArray(where) ? { ...stored } : null),
    ),
    save: jest.fn((contest: ContestRecord) => {
      stored = { ...contest };
      return Promise.resolve(contest);
    }),
    create: jest.fn(
      (data: { title: string; slug: string; [key: string]: unknown }) => ({
        id,
        ...data,
      }),
    ),
    remove: jest.fn().mockResolvedValue(undefined),
  });
  let repo: ReturnType<typeof makeRepository>;

  beforeEach(() => {
    stored = {
      id,
      title: 'Original',
      slug: 'original',
      participants: ['candidate'],
      antiCheatConfig: { warningLimit: 3 },
    };
    repo = makeRepository();
    service = new AdminService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('persists the selected contest and reloads fields while retaining participants and security configuration', async () => {
    await service.updateContest(id, {
      ...payload,
      id: 'another-id',
      participants: [],
    });
    const reloaded = await service.getContestById(id);
    expect(reloaded).toEqual(
      expect.objectContaining({
        id,
        title: payload.title,
        slug: payload.slug,
        problems: ['p1', 'p2'],
        isPrivate: true,
        password: 'access-code',
        isPublished: true,
        participants: ['candidate'],
        antiCheatConfig: { warningLimit: 3 },
      }),
    );
    expect(reloaded.startTime).toEqual(new Date(payload.startTime));
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: [{ id }, { mongoId: id }],
    });
  });

  it('rejects a conflicting slug without saving', async () => {
    repo.findOne.mockResolvedValueOnce({ ...stored }).mockResolvedValueOnce({
      id: 'other-id',
      title: 'Other',
      slug: payload.slug,
    });
    await expect(service.updateContest(id, payload)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects invalid dates and missing problems without saving', async () => {
    await expect(
      service.updateContest(id, { ...payload, endTime: payload.startTime }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateContest(id, { ...payload, problems: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('handles missing and malformed IDs without updating another contest', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    await expect(service.updateContest(id, payload)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.getContestById('undefined')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('looks up legacy Mongo IDs without querying the PostgreSQL UUID column', async () => {
    const legacyId = '507f1f77bcf86cd799439011';
    await service.getContestById(legacyId);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: [{ mongoId: legacyId }],
    });
  });

  it('keeps create and delete persistence intact', async () => {
    await service.createContest(payload);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: payload.slug,
        antiCheatConfig: expect.objectContaining({
          maxTabSwitchViolations: 3,
          actionOnMaxViolations: 'auto_submit',
        }),
      }),
    );
    expect(repo.save).toHaveBeenCalled();
    await service.deleteContest(id);
    expect(repo.remove).toHaveBeenCalledWith(expect.objectContaining({ id }));
  });

  it('updates security settings and resultsPublished status when provided', async () => {
    await service.updateContest(id, {
      ...payload,
      antiCheatConfig: {
        maxTabSwitchViolations: 5,
        actionOnMaxViolations: 'lock_attempt',
        enableFullscreenCheck: true,
      },
      resultsPublished: true,
    });
    const updated = await service.getContestById(id);
    expect(updated.antiCheatConfig).toEqual({
      enableTabSwitchDetection: true,
      enableFullscreenCheck: true,
      maxTabSwitchViolations: 5,
      warningLimit: 5,
      actionOnMaxViolations: 'lock_attempt',
    });
    expect(updated.resultsPublished).toBe(true);
  });

  it('toggles contest results publication', async () => {
    const result = await service.toggleContestResultsPublish(id, true);
    expect(result).toEqual({
      success: true,
      message: 'Contest results published successfully',
      resultsPublished: true,
    });
    const toggledOff = await service.toggleContestResultsPublish(id);
    expect(toggledOff.resultsPublished).toBe(false);
  });

  it('grants and revokes student reattempts with auditable fields', async () => {
    const mockGrants: any[] = [];
    let idCounter = 1;
    const grantRepo = {
      find: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          mockGrants.filter(
            (g) =>
              g.contest_id === where.contest_id &&
              g.user_id === where.user_id &&
              g.status === where.status,
          ),
        );
      }),
      findOne: jest.fn().mockImplementation(({ where }) => {
        const item = mockGrants.find(
          (g) =>
            (g.id === where[0]?.id || g.user_id === where[1]?.user_id) &&
            g.status === 'ACTIVE',
        );
        return Promise.resolve(item || null);
      }),
      create: jest.fn((data) => ({ id: `grant-${idCounter++}`, ...data })),
      save: jest.fn((grant) => {
        const idx = mockGrants.findIndex((g) => g.id === grant.id);
        if (idx >= 0) mockGrants[idx] = grant;
        else mockGrants.push(grant);
        return Promise.resolve(grant);
      }),
    };

    const serviceWithGrants = new AdminService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      grantRepo as never,
    );

    const grantResult = await serviceWithGrants.grantContestReattempts(
      id,
      { id: 'admin-1', email: 'admin@cu.edu' },
      {
        studentIds: ['student-1', 'student-2'],
        reason: 'Network disconnect during exam',
        allowedAttempts: 2,
      },
    );

    expect(grantResult.success).toBe(true);
    expect(grantResult.count).toBe(2);
    expect(mockGrants).toHaveLength(2);
    expect(mockGrants[0]).toMatchObject({
      contest_id: id,
      user_id: 'student-1',
      grantedByEmail: 'admin@cu.edu',
      reason: 'Network disconnect during exam',
      allowedAttempts: 2,
      status: 'ACTIVE',
    });

    // Revoke reattempt
    const revokeResult = await serviceWithGrants.revokeContestReattempt(
      id,
      'student-1',
    );
    expect(revokeResult.success).toBe(true);
    expect(revokeResult.grant.status).toBe('REVOKED');
  });

  it('exports contest results as CSV with audit trail columns', async () => {
    const attemptRepo = {
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'attempt-1',
            attemptNumber: 1,
            user_id: 'user-1',
            user: { name: 'Student One', email: 's1@cu.edu' },
            score: 200,
            problemsSolved: 2,
            status: 'Completed',
            startedAt: new Date('2026-11-01T04:30:00Z'),
            submittedAt: new Date('2026-11-01T05:30:00Z'),
            warnings: 1,
            violations: [{ type: 'tab_switch', timestamp: '2026-11-01T04:45:00Z' }],
          },
        ]),
      })),
    };

    const serviceWithAttempts = new AdminService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      attemptRepo as never,
      undefined,
    );

    const csv = await serviceWithAttempts.exportContestResultsCsv(id);
    expect(csv).toContain('Student Name,Email,Attempt Number,Score');
    expect(csv).toContain('"Student One","s1@cu.edu",1,200,2,"Completed"');
    expect(csv).toContain('tab_switch');
  });
});

