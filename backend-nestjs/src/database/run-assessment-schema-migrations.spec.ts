import { DataSource } from 'typeorm';
import { runAssessmentSchemaMigrations } from './run-assessment-schema-migrations';
import { applyAssessmentResumeLimitMigration } from './migrations/assessment-resume-limit';
import { applyLearningModuleMigration } from './migrations/learning-module';

jest.mock('typeorm', () => ({ DataSource: jest.fn() }));
jest.mock('./run-practice-submission-source', () => ({
  practiceSubmissionMigrationOptions: () => ({ type: 'postgres', synchronize: false }),
}));
jest.mock('./migrations/assessment-resume-limit', () => ({
  applyAssessmentResumeLimitMigration: jest.fn(),
}));
jest.mock('./migrations/learning-module', () => ({
  applyLearningModuleMigration: jest.fn(),
}));

function setup() {
  const runner = {
    connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(), release: jest.fn(),
    query: jest.fn().mockResolvedValue([]),
  };
  const source = {
    initialize: jest.fn(), isInitialized: true, destroy: jest.fn(),
    createQueryRunner: () => runner,
  };
  jest.mocked(DataSource).mockImplementation(() => source as unknown as DataSource);
  return { runner, source };
}

beforeEach(() => jest.resetAllMocks());

it('serializes rollout migrations and adds the attempt columns before committing', async () => {
  const { runner, source } = setup();
  await runAssessmentSchemaMigrations();
  expect(runner.query.mock.calls[0][0]).toBe('SELECT pg_advisory_xact_lock(1902230159)');
  expect(runner.query).toHaveBeenCalledWith(expect.stringContaining('contestFormat'));
  expect(runner.query).toHaveBeenCalledWith(expect.stringContaining('ADD COLUMN IF NOT EXISTS "captures"'));
  expect(applyAssessmentResumeLimitMigration).toHaveBeenCalledWith(runner);
  expect(applyLearningModuleMigration).toHaveBeenCalledWith(runner);
  expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
  expect(runner.rollbackTransaction).not.toHaveBeenCalled();
  expect(runner.release).toHaveBeenCalledTimes(1);
  expect(source.destroy).toHaveBeenCalledTimes(1);
});

it('rolls back and propagates a migration failure so the API cannot start', async () => {
  const { runner, source } = setup();
  jest.mocked(applyAssessmentResumeLimitMigration).mockRejectedValueOnce(new Error('migration denied'));
  await expect(runAssessmentSchemaMigrations()).rejects.toThrow('migration denied');
  expect(runner.commitTransaction).not.toHaveBeenCalled();
  expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
  expect(runner.release).toHaveBeenCalledTimes(1);
  expect(source.destroy).toHaveBeenCalledTimes(1);
});
