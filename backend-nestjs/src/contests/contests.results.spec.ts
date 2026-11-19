jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
  InjectDataSource: () => () => undefined,
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ContestsService } from './contests.service';

const contestId = '00000000-0000-4000-8000-000000000001';
const probAId = '00000000-0000-4000-8000-000000000010';
const probBId = '00000000-0000-4000-8000-000000000020';

const userAliceId = '00000000-0000-4000-8000-000000000101';
const userBobId = '00000000-0000-4000-8000-000000000102';
const userCharlieId = '00000000-0000-4000-8000-000000000103';

const now = Date.now();
const pastContest = {
  id: contestId,
  title: 'ACM ICPC Regional Qualifier',
  slug: 'acm-icpc-regional',
  description: 'Annual contest qualifier',
  isPublished: true,
  isPrivate: false,
  resultsPublished: true,
  contestFormat: 'icpc',
  problems: [probAId, probBId],
  startTime: new Date(now - 7200000), // 2 hours ago
  endTime: new Date(now - 3600000), // 1 hour ago
  participants: [userAliceId, userBobId, userCharlieId],
  antiCheatConfig: {
    warningLimit: 3,
    autoSubmitOnViolation: true,
    actionOnMaxViolations: 'auto_submit',
  },
};

describe('ContestsService - Results & Editorials', () => {
  function setupService(customContest = pastContest) {
    const userAlice = {
      id: userAliceId,
      name: 'Alice Smith',
      username: 'alice',
      role: 'student',
      studentProfile: { department: 'CSE', batch: '2025' },
    };
    const userBob = {
      id: userBobId,
      name: 'Bob Jones',
      username: 'bob',
      role: 'student',
      studentProfile: { department: 'ECE', batch: '2025' },
    };
    const userCharlie = {
      id: userCharlieId,
      name: 'Charlie Brown',
      username: 'charlie',
      role: 'student',
      studentProfile: { department: 'CSE', batch: '2026' },
    };

    const usersMap: Record<string, any> = {
      [userAliceId]: userAlice,
      [userBobId]: userBob,
      [userCharlieId]: userCharlie,
    };

    const attempts = [
      {
        id: 'att-1',
        contest_id: contestId,
        user_id: userAliceId,
        status: 'Submitted',
        startedAt: new Date(customContest.startTime.getTime() + 60000),
        submittedAt: new Date(customContest.startTime.getTime() + 3000000),
        warnings: 0,
        violations: [],
      },
      {
        id: 'att-2',
        contest_id: contestId,
        user_id: userBobId,
        status: 'Submitted',
        startedAt: new Date(customContest.startTime.getTime() + 120000),
        submittedAt: new Date(customContest.startTime.getTime() + 3500000),
        warnings: 1,
        violations: [{ type: 'tab_switch', timestamp: new Date() }],
      },
      {
        id: 'att-3',
        contest_id: contestId,
        user_id: userCharlieId,
        status: 'Terminated', // Disqualified candidate
        startedAt: new Date(customContest.startTime.getTime() + 60000),
        submittedAt: new Date(customContest.startTime.getTime() + 600000),
        warnings: 3,
        violations: [
          { type: 'tab_switch', timestamp: new Date() },
          { type: 'tab_switch', timestamp: new Date() },
          { type: 'tab_switch', timestamp: new Date() },
        ],
      },
    ];

    // Submissions:
    // Alice solved probA at 10m (1 failed before) -> 1 solve, penalty = 10 + 20 = 30
    // Alice solved probB at 25m (0 failed) -> 2 solves, penalty = 30 + 25 = 55
    // Bob solved probA at 8m (0 failed) -> first solver on A! 1 solve, penalty = 8
    // Charlie (disqualified) solved probA at 5m
    const submissions = [
      {
        id: 'sub-1',
        contestAttemptId: 'att-1',
        userId: userAliceId,
        problemId: probAId,
        status: 'wrong answer',
        createdAt: new Date(customContest.startTime.getTime() + 300000), // 5 min
        code: 'def solve(): return False',
        language: 'python',
      },
      {
        id: 'sub-2',
        contestAttemptId: 'att-1',
        userId: userAliceId,
        problemId: probAId,
        status: 'accepted',
        createdAt: new Date(customContest.startTime.getTime() + 600000), // 10 min
        code: 'def solve(): return True',
        language: 'python',
      },
      {
        id: 'sub-3',
        contestAttemptId: 'att-1',
        userId: userAliceId,
        problemId: probBId,
        status: 'accepted',
        createdAt: new Date(customContest.startTime.getTime() + 1500000), // 25 min
        code: 'def solveB(): return 42',
        language: 'python',
      },
      {
        id: 'sub-4',
        contestAttemptId: 'att-2',
        userId: userBobId,
        problemId: probAId,
        status: 'accepted',
        createdAt: new Date(customContest.startTime.getTime() + 480000), // 8 min (First solver!)
        code: 'def solve(): return True',
        language: 'python',
      },
      {
        id: 'sub-5',
        contestAttemptId: 'att-3',
        userId: userCharlieId,
        problemId: probAId,
        status: 'accepted',
        createdAt: new Date(customContest.startTime.getTime() + 300000),
        code: 'def solve(): return True',
        language: 'python',
      },
      {
        id: 'other-contest-solve', contestAttemptId: 'other-attempt',
        userId: userBobId, problemId: probBId, status: 'accepted',
        createdAt: new Date(customContest.startTime.getTime() + 500000),
        code: 'unrelated contest answer', language: 'python',
      },
    ];

    const contestRepo = {
      findOne: jest.fn().mockImplementation(({ where }) => {
        const idQuery = Array.isArray(where) ? where[0].id || where[0].slug : where.slug || where.id;
        if (idQuery === customContest.id || idQuery === customContest.slug) {
          return Promise.resolve(customContest);
        }
        return Promise.resolve(null);
      }),
      manager: {
        getRepository: jest.fn((entity) => {
          if (entity.name === 'User' || typeof entity === 'function') {
            return {
              find: jest.fn().mockImplementation(({ where }) => {
                const ids = where?.id?._value || Object.keys(usersMap);
                return Promise.resolve(ids.map((uid: string) => usersMap[uid]).filter(Boolean));
              }),
              findOne: jest.fn().mockImplementation(({ where }) => {
                return Promise.resolve(usersMap[where.id] || null);
              }),
            };
          }
          return {
            findOne: jest.fn().mockResolvedValue(null),
          };
        }),
      },
    };

    const attemptRepo = {
      find: jest.fn().mockResolvedValue(attempts),
      query: jest.fn().mockResolvedValue(submissions),
    };

    const problemsService = {
      getExecutionProblem: jest.fn().mockImplementation((id: string) => {
        if (id === probAId) {
          return Promise.resolve({ id: probAId, title: 'Two Sum', slug: 'two-sum' });
        }
        if (id === probBId) {
          return Promise.resolve({ id: probBId, title: 'Binary Search', slug: 'binary-search' });
        }
        return Promise.reject(new NotFoundException());
      }),
    };

    const questionRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const metadataRepo = {
      findOne: jest.fn().mockImplementation(({ where }) => {
        if (where.id === probAId) {
          return Promise.resolve({
            id: probAId,
            title: 'Two Sum',
            slug: 'two-sum',
            difficulty: 'Easy',
            statement: { description: 'Find two indices that sum to target' },
            config: { referenceSolution: { python: 'def twoSum(nums, target): return [0, 1]' } },
          });
        }
        return Promise.resolve(null);
      }),
    };

    const service = new ContestsService(
      contestRepo as any,
      attemptRepo as any,
      problemsService as any,
      undefined,
      undefined,
      questionRepo as any,
      metadataRepo as any,
    );

    return { service, contestRepo, attemptRepo, problemsService, metadataRepo };
  }

  describe('getResults', () => {
    it('throws NotFoundException if contest does not exist', async () => {
      const { service } = setupService();
      await expect(service.getResults('non-existent-contest', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('correctly ranks competitive candidates using ICPC rules', async () => {
      const { service, attemptRepo } = setupService();
      const res = await service.getResults(contestId, {});

      expect(attemptRepo.query.mock.calls[0][0]).toContain('s."contestAttemptId" = ANY');

      expect(res.contest.id).toBe(contestId);
      expect(res.problems).toHaveLength(2);
      expect(res.problems[0].title).toBe('Two Sum');
      expect(res.problems[1].title).toBe('Binary Search');

      // Standings should ONLY have legitimate candidates (Alice and Bob)
      // Charlie is Terminated so he must be segregated to disqualified
      expect(res.standings).toHaveLength(2);

      // Rank 1: Alice (2 problems solved, 55 penalty min)
      expect(res.standings[0].userId).toBe(userAliceId);
      expect(res.standings[0].rank).toBe(1);
      expect(res.standings[0].problemsSolved).toBe(2);
      expect(res.standings[0].totalPenaltyMinutes).toBe(55);

      // Rank 2: Bob (1 problem solved, 8 penalty min)
      expect(res.standings[1].userId).toBe(userBobId);
      expect(res.standings[1].rank).toBe(2);
      expect(res.standings[1].problemsSolved).toBe(1);
      expect(res.standings[1].totalPenaltyMinutes).toBe(8);

      // First solver on Problem A: Bob (solved at 8 min vs Alice at 10 min)
      expect(res.problems[0].firstSolver?.username).toBe('bob');
      expect(res.problems[0].firstSolver?.timeInMinutes).toBe(8);
      expect(res.standings[1].problemResults[probAId].isFirstSolve).toBe(true);

      // Disqualified candidate verification
      expect(res.disqualified).toHaveLength(1);
      expect(res.disqualified[0].userId).toBe(userCharlieId);
      expect(res.disqualified[0].reason).toContain('Session terminated');
      expect(res.disqualified[0].activityJourneyUrl).toBe(`/admin/activity?actorId=${userCharlieId}`);
    });

    it('computes dual ranks correctly when filtering by department', async () => {
      const { service } = setupService();
      // Filter by Department: ECE (only Bob belongs to ECE)
      const res = await service.getResults(contestId, { department: 'ECE' });

      expect(res.standings).toHaveLength(1);
      const bobRow = res.standings[0];
      expect(bobRow.userId).toBe(userBobId);
      // Bob is #1 in ECE Department, but #2 Overall!
      expect(bobRow.departmentRank).toBe(1);
      expect(bobRow.rank).toBe(2);
    });

    it('returns myResult for the authenticated user with page index', async () => {
      const { service } = setupService();
      const res = await service.getResults(contestId, { limit: '1' }, userBobId);

      expect(res.myResult).toBeDefined();
      expect(res.myResult.rank).toBe(2);
      // Bob is on page 2 since limit is 1 and he is at rank 2
      expect(res.myResult.page).toBe(2);
      expect(res.myResult.problemsSolved).toBe(1);
      expect(res.myResult.percentile).toBe(0); // 2nd of 2
      expect(res.myResult.proctoringVerified).toBe(false); // Bob had 1 warning
    });

    it('returns disqualified status in myResult if current user was terminated', async () => {
      const { service } = setupService();
      const res = await service.getResults(contestId, {}, userCharlieId);

      expect(res.myResult).toBeDefined();
      expect(res.myResult.status).toBe('Disqualified');
      expect(res.myResult.proctoringVerified).toBe(false);
      expect(res.myResult.warnings).toBe(3);
    });
  });

  describe('getEditorials', () => {
    it('throws ForbiddenException if contest is ongoing and user is a student', async () => {
      const ongoingContest = {
        ...pastContest,
        endTime: new Date(Date.now() + 3600000), // ends in 1 hour
      };
      const { service } = setupService(ongoingContest);

      await expect(
        service.getEditorials(contestId, { id: userAliceId, role: 'student' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if contest ended but results are unpublished', async () => {
      const unpublishedContest = {
        ...pastContest,
        resultsPublished: false,
      };
      const { service } = setupService(unpublishedContest);

      await expect(
        service.getEditorials(contestId, { id: userAliceId, role: 'student' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns editorials if contest ended and results are published', async () => {
      const { service } = setupService();
      const res = await service.getEditorials(contestId, { id: userAliceId, role: 'student' });

      expect(res.editorials).toHaveLength(2);
      expect(res.editorials[0].title).toBe('Two Sum');
      expect(res.editorials[0].editorial).toContain('Find two indices');
      expect(res.editorials[0].referenceSolutions).toHaveLength(1);
      expect(res.editorials[0].referenceSolutions[0].language).toBe('python');
    });

    it('allows admin access to editorials even if contest is active', async () => {
      const activeContest = {
        ...pastContest,
        endTime: new Date(Date.now() + 3600000),
        resultsPublished: false,
      };
      const { service } = setupService(activeContest);

      const res = await service.getEditorials(contestId, { id: 'admin-id', role: 'admin' });
      expect(res.editorials).toHaveLength(2);
      expect(res.editorials[0].title).toBe('Two Sum');
    });
  });
});
