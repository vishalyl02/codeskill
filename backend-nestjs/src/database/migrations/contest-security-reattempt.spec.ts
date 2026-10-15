import { applyContestSecurityReattemptMigration } from './contest-security-reattempt';
import { MigrationQueryRunner } from './declarative-partitioning';

describe('contest security and reattempts schema migration', () => {
  it('executes idempotent DDL for contests, contest_attempts and contest_reattempt_grants', async () => {
    const executedQueries: string[] = [];
    const queryRunner: MigrationQueryRunner = {
      query: jest.fn().mockImplementation((sql: string) => {
        executedQueries.push(sql);
        return Promise.resolve([]);
      }),
    };

    await applyContestSecurityReattemptMigration(queryRunner);

    expect(executedQueries.length).toBe(4);
    // 1. resultsPublished
    expect(executedQueries[0]).toContain('resultsPublished');
    expect(executedQueries[0]).toContain('ALTER TABLE "contests" ADD COLUMN "resultsPublished"');
    // 2. attemptNumber, score, problemsSolved
    expect(executedQueries[1]).toContain('attemptNumber');
    expect(executedQueries[1]).toContain('score');
    expect(executedQueries[1]).toContain('problemsSolved');
    // 3. Composite unique index
    expect(executedQueries[2]).toContain('IDX_contest_attempts_contest_user_attempt');
    expect(executedQueries[2]).toContain('("contest_id", "user_id", "attemptNumber")');
    // 4. contest_reattempt_grants table
    expect(executedQueries[3]).toContain('CREATE TABLE IF NOT EXISTS "contest_reattempt_grants"');
    expect(executedQueries[3]).toContain('"allowedAttempts"');
    expect(executedQueries[3]).toContain('"usedAttempts"');
  });
});
