import { QueryRunner } from 'typeorm';

/** Run under the schema runner's advisory transaction lock on every submission owner. */
export async function applyContestSubmissionScopeMigration(runner: Pick<QueryRunner, 'query'>): Promise<void> {
  await runner.query('ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS "contestAttemptId" uuid');
  await runner.query(
    'CREATE INDEX IF NOT EXISTS "IDX_submissions_contest_attempt_problem_status" ON public.submissions ("contestAttemptId", "problemId", status)',
  );
}
