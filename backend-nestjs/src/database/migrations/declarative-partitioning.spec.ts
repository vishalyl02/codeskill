import {
  applyDeclarativePartitioningMigration,
  partitionTableIfRegular,
  MigrationQueryRunner,
} from './declarative-partitioning';

describe('applyDeclarativePartitioningMigration', () => {
  let mockQueryRunner: jest.Mocked<MigrationQueryRunner>;

  beforeEach(() => {
    mockQueryRunner = {
      query: jest.fn(),
    };
  });

  it('should skip migration if the table is already partitioned', async () => {
    mockQueryRunner.query.mockResolvedValueOnce([{ relkind: 'p' }]);

    await partitionTableIfRegular(
      mockQueryRunner,
      'submissions',
      'CREATE TABLE submissions (...)',
      'CREATE TABLE submissions_part (...)',
      'CREATE INDEX ...',
    );

    expect(mockQueryRunner.query).toHaveBeenCalledTimes(1);
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      'SELECT relkind FROM pg_class WHERE relname = $1',
      ['submissions'],
    );
  });

  it('should partition table if it is a regular table (relkind = r)', async () => {
    mockQueryRunner.query
      .mockResolvedValueOnce([{ relkind: 'r' }]) // check relkind
      .mockResolvedValueOnce([]) // DROP legacy
      .mockResolvedValueOnce([]) // RENAME
      .mockResolvedValueOnce([]) // CREATE PARTITIONED
      .mockResolvedValueOnce([]) // CREATE PARTITIONS
      .mockResolvedValueOnce([]) // CREATE INDEXES
      .mockResolvedValueOnce([{ column_name: 'id' }, { column_name: 'createdAt' }]) // commonCols
      .mockResolvedValueOnce([]) // INSERT
      .mockResolvedValueOnce([]); // DROP legacy

    await partitionTableIfRegular(
      mockQueryRunner,
      'submissions',
      'CREATE TABLE submissions (...)',
      'CREATE TABLE submissions_part (...)',
      'CREATE INDEX ...',
    );

    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      'ALTER TABLE "submissions" RENAME TO "submissions_legacy"',
    );
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      'INSERT INTO "submissions" ("id", "createdAt") SELECT "id", "createdAt" FROM "submissions_legacy"',
    );
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      'DROP TABLE "submissions_legacy" CASCADE',
    );
  });

  it('should create partitioned table directly if table does not exist', async () => {
    mockQueryRunner.query.mockResolvedValueOnce([]); // table does not exist

    await partitionTableIfRegular(
      mockQueryRunner,
      'submissions',
      'CREATE TABLE submissions (...)',
      'CREATE TABLE submissions_part (...)',
      'CREATE INDEX ...',
    );

    expect(mockQueryRunner.query).toHaveBeenCalledWith('CREATE TABLE submissions (...)');
    expect(mockQueryRunner.query).toHaveBeenCalledWith('CREATE TABLE submissions_part (...)');
    expect(mockQueryRunner.query).toHaveBeenCalledWith('CREATE INDEX ...');
  });

  it('should apply declarative partitioning for submissions, exam_security_events, and audit_logs', async () => {
    mockQueryRunner.query.mockResolvedValue([{ relkind: 'p' }]);

    await applyDeclarativePartitioningMigration(mockQueryRunner);

    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
    );
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      'SELECT relkind FROM pg_class WHERE relname = $1',
      ['submissions'],
    );
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      'SELECT relkind FROM pg_class WHERE relname = $1',
      ['exam_security_events'],
    );
    expect(mockQueryRunner.query).toHaveBeenCalledWith(
      'SELECT relkind FROM pg_class WHERE relname = $1',
      ['audit_logs'],
    );
  });
});
