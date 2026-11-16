import { ActivityLogService } from './activity-log.service';

describe('ActivityLogService', () => {
  let service: ActivityLogService;
  let mockAuditLogRepo: any;

  beforeEach(() => {
    mockAuditLogRepo = {
      insert: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(100),
      createQueryBuilder: jest.fn(),
    };
    service = new ActivityLogService(mockAuditLogRepo as any);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should buffer log entries and flush via bulk insert', async () => {
    service.log({
      action: 'TEST_ACTION',
      actorEmail: 'test@example.com',
      metadata: { sample: 'value' },
    });

    expect(mockAuditLogRepo.insert).not.toHaveBeenCalled();

    await service.flush();

    expect(mockAuditLogRepo.insert).toHaveBeenCalledTimes(1);
    const inserted = mockAuditLogRepo.insert.mock.calls[0][0];
    expect(inserted).toHaveLength(1);
    expect(inserted[0].action).toBe('TEST_ACTION');
    expect(inserted[0].actorEmail).toBe('test@example.com');
  });

  it('should deeply redact sensitive keys from metadata', async () => {
    service.log({
      action: 'AUTH_LOGIN',
      actorEmail: 'user@example.com',
      metadata: {
        password: 'PlainTextPassword123!',
        token: 'secret-token-xyz',
        authHeader: 'Bearer token',
        nested: {
          refreshToken: 'deep-secret',
          safeField: 'visible-data',
        },
      },
    });

    await service.flush();

    const inserted = mockAuditLogRepo.insert.mock.calls[0][0];
    const meta = inserted[0].metadata;

    expect(meta.password).toBe('[REDACTED]');
    expect(meta.token).toBe('[REDACTED]');
    expect(meta.nested.refreshToken).toBe('[REDACTED]');
    expect(meta.nested.safeField).toBe('visible-data');
  });

  it('should enforce MAX_BUFFER_SIZE cap to avoid memory leaks', async () => {
    // Fill up to max buffer size
    const MAX = (service as any).MAX_BUFFER_SIZE;
    for (let i = 0; i < MAX + 50; i++) {
      service.log({
        action: `ACTION_${i}`,
        actorEmail: `user${i}@example.com`,
      });
    }

    const currentBufferSize = (service as any).buffer.length;
    expect(currentBufferSize).toBeLessThanOrEqual(MAX);
  });

  it('should prevent race conditions using the isFlushing mutex', async () => {
    let resolveInsert: any;
    const delayedInsert = new Promise((resolve) => {
      resolveInsert = resolve;
    });

    mockAuditLogRepo.insert = jest.fn().mockReturnValue(delayedInsert);

    service.log({ action: 'FIRST' });
    service.log({ action: 'SECOND' });

    // First flush starts
    const p1 = service.flush();
    // Second flush called while first is in progress
    const p2 = service.flush();

    resolveInsert({});
    await Promise.all([p1, p2]);

    // Should only have called insert once for the first batch
    expect(mockAuditLogRepo.insert).toHaveBeenCalledTimes(1);
  });

  it('should drain remaining buffer items on onModuleDestroy', async () => {
    service.log({ action: 'REMAINING_1' });
    service.log({ action: 'REMAINING_2' });

    await service.onModuleDestroy();

    expect(mockAuditLogRepo.insert).toHaveBeenCalledTimes(1);
    const inserted = mockAuditLogRepo.insert.mock.calls[0][0];
    expect(inserted).toHaveLength(2);
  });
});
