import { DataSource } from 'typeorm';
import { applyPracticeSubmissionSourceMigration } from './migrations/practice-submission-source';
import { applyBugReportsMigration } from './migrations/bug-reports';
import { parseSubmissionShardingConfig } from './sharding/sharding.config';
import {
  practiceSubmissionMigrationOptions,
  runPracticeSubmissionSourceMigration,
} from './run-practice-submission-source';

jest.mock('typeorm', () => ({
  DataSource: jest.fn(),
}));
jest.mock('./migrations/practice-submission-source', () => ({
  applyPracticeSubmissionSourceMigration: jest.fn(),
}));
jest.mock('./migrations/bug-reports', () => ({
  applyBugReportsMigration: jest.fn(),
}));

describe('practice submission source migration runner', () => {
  const DataSourceMock = jest.mocked(DataSource);
  const applyMigration = jest.mocked(applyPracticeSubmissionSourceMigration);
  const applyBugsMigration = jest.mocked(applyBugReportsMigration);

  function setup() {
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
    };
    const dataSource = {
      isInitialized: false,
      initialize: jest.fn().mockImplementation(() => {
        dataSource.isInitialized = true;
        return Promise.resolve(dataSource);
      }),
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      transaction: jest.fn(async (work: (manager: { query: typeof queryRunner.query }) => Promise<void>) =>
        work({ query: queryRunner.query })),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    DataSourceMock.mockImplementation(
      () => dataSource as unknown as DataSource,
    );
    applyMigration.mockResolvedValue({ droppedForeignKeys: [] });
    return { queryRunner, dataSource };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('commits the targeted migration and releases both connections', async () => {
    const { queryRunner, dataSource } = setup();

    await runPracticeSubmissionSourceMigration();

    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(1902230159)',
    );
    expect(queryRunner.query.mock.invocationCallOrder[0]).toBeLessThan(
      applyMigration.mock.invocationCallOrder[0],
    );
    expect(applyMigration).toHaveBeenCalledWith(queryRunner);
    expect(applyBugsMigration).toHaveBeenCalledWith(queryRunner);
    expect(queryRunner.query).toHaveBeenCalledWith(
      'ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS "contestAttemptId" uuid',
    );
    expect(applyBugsMigration.mock.invocationCallOrder[0]).toBeLessThan(
      queryRunner.commitTransaction.mock.invocationCallOrder[0],
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
    expect(dataSource.destroy).toHaveBeenCalledTimes(1);
    expect(DataSourceMock).toHaveBeenCalledWith(
      expect.objectContaining({ synchronize: false, logging: false }),
    );
  });

  it('rolls back migration failure and propagates it after cleanup', async () => {
    const { queryRunner, dataSource } = setup();
    applyMigration.mockRejectedValueOnce(new Error('Check violation'));

    await expect(runPracticeSubmissionSourceMigration()).rejects.toThrow(
      'Check violation',
    );

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
    expect(dataSource.destroy).toHaveBeenCalledTimes(1);
  });

  it('rolls back when the bug tables cannot be migrated', async () => {
    const { queryRunner } = setup();
    applyBugsMigration.mockRejectedValueOnce(new Error('Bug schema failure'));

    await expect(runPracticeSubmissionSourceMigration()).rejects.toThrow(
      'Bug schema failure',
    );

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it('preserves the primary submission snapshot when sharding is active', async () => {
    jest.replaceProperty(process, 'env', {
      SUBMISSION_SHARDS: JSON.stringify([
        { id: 'a', url: 'postgres://localhost:5433/shards' },
        { id: 'b', url: 'postgres://localhost:5434/shards' },
      ]),
    });
    const config = parseSubmissionShardingConfig()!;
    const { queryRunner, dataSource } = setup();
    queryRunner.query.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ present: true }];
      if (sql.includes('SELECT fingerprint'))
        return [{ fingerprint: config.fingerprint, state: 'active' }];
      if (sql.includes('SELECT relkind')) return [{ relkind: 'p' }];
      return [];
    });
    await runPracticeSubmissionSourceMigration();
    expect(applyMigration).not.toHaveBeenCalled();
    expect(queryRunner.query).not.toHaveBeenCalledWith(
      'SELECT relkind FROM pg_class WHERE relname = $1',
      ['submissions'],
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(queryRunner.query).toHaveBeenCalledWith(
      'ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS "contestAttemptId" uuid',
    );
  });

  it('releases connections if starting the transaction fails', async () => {
    const { queryRunner, dataSource } = setup();
    queryRunner.startTransaction.mockRejectedValueOnce(
      new Error('Transaction failure'),
    );

    await expect(runPracticeSubmissionSourceMigration()).rejects.toThrow(
      'Transaction failure',
    );

    expect(applyMigration).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
    expect(dataSource.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not create a query runner when initialization fails', async () => {
    const { dataSource } = setup();
    dataSource.initialize.mockRejectedValueOnce(
      new Error('Connection failure'),
    );

    await expect(runPracticeSubmissionSourceMigration()).rejects.toThrow(
      'Connection failure',
    );

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(dataSource.destroy).not.toHaveBeenCalled();
  });

  it('prefers the existing DATABASE_URL and never enables synchronization', () => {
    jest.replaceProperty(process, 'env', {
      DATABASE_URL: 'postgres://localhost/migration_test',
      DATABASE_HOST: 'ignored-host',
    });

    expect(practiceSubmissionMigrationOptions()).toEqual({
      type: 'postgres',
      synchronize: false,
      logging: false,
      url: 'postgres://localhost/migration_test',
    });
  });

  it('uses the existing individual database settings including SSL', () => {
    jest.replaceProperty(process, 'env', {
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '5433',
      DATABASE_USER: 'migration_user',
      DATABASE_PASSWORD: 'test-only-password',
      DATABASE_NAME: 'migration_test',
      DATABASE_SSL: 'true',
    });

    expect(practiceSubmissionMigrationOptions()).toEqual({
      type: 'postgres',
      synchronize: false,
      logging: false,
      host: 'localhost',
      port: 5433,
      username: 'migration_user',
      password: 'test-only-password',
      database: 'migration_test',
      ssl: { rejectUnauthorized: true },
    });
  });
});
