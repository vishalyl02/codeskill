import { DataSource } from 'typeorm';
import { applyPracticeSubmissionSourceMigration } from './migrations/practice-submission-source';
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

describe('practice submission source migration runner', () => {
  const DataSourceMock = jest.mocked(DataSource);
  const applyMigration = jest.mocked(applyPracticeSubmissionSourceMigration);

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
    expect(applyMigration).toHaveBeenCalledWith(queryRunner);
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

  it('preserves the primary submission snapshot when sharding is active', async () => {
    jest.replaceProperty(process, 'env', {
      SUBMISSION_SHARDS: JSON.stringify([
        { id: 'a', url: 'postgres://localhost:5433/shards' },
        { id: 'b', url: 'postgres://localhost:5434/shards' },
      ]),
    });
    const config = parseSubmissionShardingConfig()!;
    const { queryRunner } = setup();
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
      ssl: { rejectUnauthorized: false },
    });
  });
});
