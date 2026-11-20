import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { ExamBackpressureGuard } from './exam-backpressure.guard';

describe('ExamBackpressureGuard', () => {
  let guard: ExamBackpressureGuard;
  let mockDataSource: any;
  let mockRedisService: any;
  let mockContext: ExecutionContext;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    mockReq = {
      originalUrl: '/api/assessments/test-123/save-progress',
      url: '/api/assessments/test-123/save-progress',
      method: 'POST',
    };
    mockRes = {
      setHeader: jest.fn(),
    };
    mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockReq,
        getResponse: () => mockRes,
      }),
    } as unknown as ExecutionContext;

    mockDataSource = {
      driver: {
        master: {
          totalCount: 10,
          idleCount: 5,
          waitingCount: 0,
          options: { max: 20 },
        },
      },
    };

    mockRedisService = {
      getClient: () => ({
        llen: jest.fn().mockResolvedValue(500),
      }),
    };

    guard = new ExamBackpressureGuard(mockDataSource, mockRedisService);
  });

  it('allows requests when system load is healthy', async () => {
    const allowed = await guard.canActivate(mockContext);
    expect(allowed).toBe(true);
    expect(mockRes.setHeader).not.toHaveBeenCalled();
  });

  it('never sheds final POST /submit even under heavy saturation', async () => {
    mockReq.originalUrl = '/api/assessments/test-123/submit';
    mockReq.url = '/api/assessments/test-123/submit';
    mockReq.method = 'POST';

    // 100% pool saturation
    mockDataSource.driver.master = {
      totalCount: 20,
      idleCount: 0,
      waitingCount: 15,
      options: { max: 20 },
    };
    // Redis buffer overloaded
    mockRedisService.getClient = () => ({
      llen: jest.fn().mockResolvedValue(30000),
    });

    const allowed = await guard.canActivate(mockContext);
    expect(allowed).toBe(true);
  });

  it('returns 503 and Retry-After: 3 when DB pool saturation exceeds 85%', async () => {
    // 18 / 20 = 90% saturation
    mockDataSource.driver.master = {
      totalCount: 20,
      idleCount: 2,
      waitingCount: 1,
      options: { max: 20 },
    };

    await expect(guard.canActivate(mockContext)).rejects.toThrow();
    expect(mockRes.setHeader).toHaveBeenCalledWith('Retry-After', '3');
  });

  it('returns 503 and Retry-After: 3 when Redis buffer depth exceeds 25,000', async () => {
    mockRedisService.getClient = () => ({
      llen: jest.fn().mockResolvedValue(26000),
    });

    try {
      await guard.canActivate(mockContext);
      fail('Should have thrown HttpException');
    } catch (err: any) {
      expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Retry-After', '3');
    }
  });
});
