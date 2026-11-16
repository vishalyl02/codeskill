import {
  parseCliOptions,
  ensureHistoricalPartitions,
  bulkInsertAuditLogs,
  backfillUsersStream,
  backfillAssessmentsStream,
  backfillSubmissionsStream,
  backfillSecurityEventsStream,
  generateDeterministicUuid,
  AUDIT_BACKFILL_NAMESPACE,
} from './run-audit-milestones-backfill';

describe('runAuditMilestonesBackfill', () => {
  let mockQueryRunner: any;

  beforeEach(() => {
    mockQueryRunner = {
      query: jest.fn(),
    };
  });

  describe('parseCliOptions', () => {
    const originalArgv = process.argv;

    afterEach(() => {
      process.argv = originalArgv;
    });

    it('should parse dry-run and batch options correctly', () => {
      process.argv = ['node', 'script.js', '--dry-run', '--batch-size=300', '--throttle-ms=10'];
      const opts = parseCliOptions();
      expect(opts.dryRun).toBe(true);
      expect(opts.batchSize).toBe(300);
      expect(opts.throttleMs).toBe(10);
    });

    it('should default to live execution with batch size 500', () => {
      process.argv = ['node', 'script.js'];
      const opts = parseCliOptions();
      expect(opts.dryRun).toBe(false);
      expect(opts.batchSize).toBe(500);
      expect(opts.throttleMs).toBe(25);
    });
  });

  describe('ensureHistoricalPartitions', () => {
    it('should query earliest historical date and create monthly partitions', async () => {
      mockQueryRunner.query.mockResolvedValueOnce([
        { min_date: '2025-02-15T00:00:00.000Z' },
      ]);
      mockQueryRunner.query.mockResolvedValue([]);

      const result = await ensureHistoricalPartitions(mockQueryRunner);
      expect(result.minDate.getFullYear()).toBe(2025);
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT LEAST'),
      );
      // Check partition table creation query executed
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS "audit_logs_y2025m02"'),
      );
    });
  });

  describe('Deterministic ID Idempotency', () => {
    it('should generate consistent UUIDv5 across multiple calls for the same entity', () => {
      const userId = '11111111-2222-3333-4444-555555555555';
      const id1 = generateDeterministicUuid(`USER_REGISTERED:${userId}`);
      const id2 = generateDeterministicUuid(`USER_REGISTERED:${userId}`);
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('bulkInsertAuditLogs', () => {
    it('should return 0 when rows array is empty', async () => {
      const res = await bulkInsertAuditLogs(mockQueryRunner, []);
      expect(res.inserted).toBe(0);
      expect(mockQueryRunner.query).not.toHaveBeenCalled();
    });

    it('should execute ON CONFLICT ("id", "timestamp") DO NOTHING query', async () => {
      mockQueryRunner.query.mockResolvedValueOnce({ rowCount: 1 });

      const sampleRows = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          actorId: 'user-1',
          actorEmail: 'test@example.com',
          action: 'TEST',
          target: 'target-1',
          targetType: 'User',
          riskWeight: 0,
          metadata: { test: true },
          timestamp: new Date('2025-01-01'),
        },
      ];

      const res = await bulkInsertAuditLogs(mockQueryRunner, sampleRows, false);
      expect(res.inserted).toBe(1);
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT ("id", "timestamp") DO NOTHING'),
        expect.any(Array),
      );
    });

    it('should return simulated counts in dryRun mode without executing SQL', async () => {
      const sampleRows = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          actorEmail: 'test@example.com',
          action: 'TEST',
          target: 'target-1',
          targetType: 'User',
          riskWeight: 0,
          metadata: {},
          timestamp: new Date(),
        },
      ];

      const res = await bulkInsertAuditLogs(mockQueryRunner, sampleRows, true);
      expect(res.inserted).toBe(1);
      expect(res.skipped).toBe(0);
      expect(mockQueryRunner.query).not.toHaveBeenCalled();
    });
  });

  describe('Streams', () => {
    it('should backfill users stream and map human-readable labels', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([
          {
            id: 'u-1',
            name: 'John Doe',
            email: 'john@example.com',
            role: 'student',
            uid: '21BCS1001',
            authProvider: 'local',
            createdAt: '2025-01-01T10:00:00.000Z',
          },
        ])
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce([]); // end of stream

      const stats = await backfillUsersStream(mockQueryRunner, { batchSize: 10, throttleMs: 0 });
      expect(stats.scanned).toBe(1);
      expect(stats.inserted).toBe(1);
    });

    it('should backfill assessment attempts and join titles', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([
          {
            id: 'att-1',
            assessment_id: 'ass-1',
            student_id: 'stu-1',
            status: 'submitted',
            score: 85,
            marksObtained: 85,
            percentage: 85,
            tabSwitchCount: 1,
            violationsCount: 0,
            completed_at: '2025-01-02T12:00:00.000Z',
            assessment_title: 'Midterm DSA',
            student_name: 'Jane Doe',
            student_email: 'jane@example.com',
            student_uid: '21BCS1002',
          },
        ])
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce([]);

      const stats = await backfillAssessmentsStream(mockQueryRunner, { batchSize: 10, throttleMs: 0 });
      expect(stats.scanned).toBe(1);
      expect(stats.inserted).toBe(1);
    });

    it('should backfill only first accepted code solves', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([
          {
            id: 'sub-1',
            userId: 'stu-1',
            problemId: 'prob-1',
            language: 'python',
            runtime: 14,
            memory: 2048,
            createdAt: '2025-01-03T15:00:00.000Z',
            problem_title: 'Two Sum',
            student_name: 'Jane Doe',
            student_email: 'jane@example.com',
            student_uid: '21BCS1002',
            student_role: 'student',
          },
        ])
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce([]);

      const stats = await backfillSubmissionsStream(mockQueryRunner, { batchSize: 10, throttleMs: 0 });
      expect(stats.scanned).toBe(1);
      expect(stats.inserted).toBe(1);
    });

    it('should backfill exam security incidents', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([
          {
            id: 'sec-1',
            session_id: 'sess-1',
            candidate_id: 'stu-1',
            assessment_id: 'ass-1',
            eventType: 'tab_switch',
            severity: 'WARNING',
            metadata: { count: 1 },
            createdAt: '2025-01-02T11:30:00.000Z',
            candidate_name: 'Jane Doe',
            candidate_email: 'jane@example.com',
            candidate_uid: '21BCS1002',
          },
        ])
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce([]);

      const stats = await backfillSecurityEventsStream(mockQueryRunner, { batchSize: 10, throttleMs: 0 });
      expect(stats.scanned).toBe(1);
      expect(stats.inserted).toBe(1);
    });
  });
});
