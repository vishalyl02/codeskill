import { OperationalHealthService } from './operational-health.service';

describe('OperationalHealthService', () => {
  let service: OperationalHealthService;
  let mockRedis: any;
  let mockQueue: any;
  let dispatchedPayloads: any[];

  beforeEach(() => {
    dispatchedPayloads = [];
    global.fetch = jest.fn().mockImplementation(async (url: string, init: any) => {
      if (init?.body) {
        dispatchedPayloads.push(JSON.parse(init.body));
      }
      return { ok: true, status: 200 } as any;
    });

    mockRedis = {
      getClient: jest.fn().mockReturnValue({
        incr: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
        get: jest.fn().mockResolvedValue(null),
        llen: jest.fn().mockResolvedValue(0),
      }),
    };

    mockQueue = {
      getWaitingCount: jest.fn().mockResolvedValue(0),
      getWaiting: jest.fn().mockResolvedValue([]),
    };

    service = new OperationalHealthService(mockRedis as any, mockQueue as any);
    service.setWebhookUrl('https://hooks.slack.com/services/mock/alert/webhook');
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('reports HEALTHY status when all metrics are within safe operational thresholds', async () => {
    const report = await service.checkHealth();

    expect(report.status).toBe('HEALTHY');
    expect(report.breaches).toHaveLength(0);
    expect(report.metrics.attestFailureRate).toBe(0);
    expect(report.metrics.telemetryLag).toBe(0);
    expect(report.metrics.queueWaitLatencySeconds).toBe(0);
    expect(dispatchedPayloads).toHaveLength(0);
  });

  it('triggers DEGRADED alert when attest-client failure rate exceeds 5% over trailing 5m', async () => {
    // Record 10 total, 2 failures (20% failure rate > 5% threshold)
    for (let i = 0; i < 8; i++) {
      await service.recordAttestation(true);
    }
    for (let i = 0; i < 2; i++) {
      await service.recordAttestation(false);
    }

    const report = await service.checkHealth();

    expect(report.status).toBe('DEGRADED');
    expect(report.metrics.attestFailureRate).toBe(20);
    expect(report.breaches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'ATTEST_FAILURE_RATE_EXCEEDED',
          threshold: 5,
        }),
      ]),
    );

    expect(dispatchedPayloads).toHaveLength(1);
    expect(dispatchedPayloads[0].event).toBe('OPERATIONAL_HEALTH_BREACH');
    expect(dispatchedPayloads[0].status).toBe('DEGRADED');
    expect(dispatchedPayloads[0].metrics.attestFailureRate).toBe(20);
  });

  it('triggers DEGRADED alert when Redis telemetry buffer exceeds 10,000 items', async () => {
    mockRedis.getClient.mockReturnValue({
      llen: jest.fn().mockResolvedValue(12_450),
      get: jest.fn().mockResolvedValue(null),
    });

    const report = await service.checkHealth();

    expect(report.status).toBe('DEGRADED');
    expect(report.metrics.telemetryLag).toBe(12_450);
    expect(report.breaches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'TELEMETRY_LAG_EXCEEDED',
          threshold: 10_000,
        }),
      ]),
    );
    expect(dispatchedPayloads).toHaveLength(1);
  });

  it('triggers DEGRADED alert when BullMQ execution queue latency exceeds 10 seconds', async () => {
    const now = Date.now();
    mockQueue.getWaitingCount.mockResolvedValue(4);
    mockQueue.getWaiting.mockResolvedValue([
      { id: 'job-1', timestamp: now - 15_000 }, // 15 seconds waiting
    ]);

    const report = await service.checkHealth();

    expect(report.status).toBe('DEGRADED');
    expect(report.metrics.queueWaitLatencySeconds).toBeGreaterThanOrEqual(14.9);
    expect(report.breaches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'QUEUE_LATENCY_EXCEEDED',
          threshold: 10,
        }),
      ]),
    );
    expect(dispatchedPayloads).toHaveLength(1);
  });

  it('deduplicates alerts while degraded and sends recovery webhook when normalized', async () => {
    mockRedis.getClient.mockReturnValue({
      llen: jest.fn().mockResolvedValue(15_000),
      get: jest.fn().mockResolvedValue(null),
    });

    // First check -> triggers breach alert
    const firstReport = await service.checkHealth();
    expect(firstReport.status).toBe('DEGRADED');
    expect(dispatchedPayloads).toHaveLength(1);
    expect(dispatchedPayloads[0].event).toBe('OPERATIONAL_HEALTH_BREACH');

    // Second check with same breach -> deduplicated (no new dispatch)
    const secondReport = await service.checkHealth();
    expect(secondReport.status).toBe('DEGRADED');
    expect(dispatchedPayloads).toHaveLength(1);

    // Third check: buffer normalizes to 500 items -> triggers RECOVERY alert
    mockRedis.getClient.mockReturnValue({
      llen: jest.fn().mockResolvedValue(500),
      get: jest.fn().mockResolvedValue(null),
    });

    const recoveredReport = await service.checkHealth();
    expect(recoveredReport.status).toBe('HEALTHY');
    expect(dispatchedPayloads).toHaveLength(2);
    expect(dispatchedPayloads[1].event).toBe('OPERATIONAL_HEALTH_RECOVERY');
    expect(dispatchedPayloads[1].status).toBe('HEALTHY');
  });
});
