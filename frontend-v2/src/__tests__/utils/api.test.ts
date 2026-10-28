import api from '@/config/api';

describe('API Utils', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('should attach Authorization header if token exists', async () => {
    localStorage.setItem('codeskill_token', 'mock_token_123');

    // Simulate an interceptor call
    const config: any = { headers: {} };
    // @ts-ignore
    const result = await api.interceptors.request.handlers[0].fulfilled(config);

    expect(result.headers.Authorization).toBe('Bearer mock_token_123');
  });

  it('should not attach Authorization header if token does not exist', async () => {
    const config: any = { headers: {} };
    // @ts-ignore
    const result = await api.interceptors.request.handlers[0].fulfilled(config);

    expect(result.headers.Authorization).toBeUndefined();
  });

  describe('submissionAPI.awaitResult (AUD-006)', () => {
    it('polls until submission status is accepted or completed', async () => {
      const { submissionAPI } = await import('@/config/api');
      const getSpy = jest.spyOn(api, 'get');
      getSpy
        .mockResolvedValueOnce({ data: { status: 'running', submissionId: 'sub-1' } })
        .mockResolvedValueOnce({
          data: {
            status: 'accepted',
            submissionId: 'sub-1',
            testCasesPassed: 5,
            totalTestCases: 5,
            completedAt: new Date().toISOString(),
          },
        });

      const res = await submissionAPI.awaitResult('sub-1', { intervalMs: 10, timeoutMs: 500 });
      expect(res.data.status).toBe('accepted');
      expect(res.data.testCasesPassed).toBe(5);
      expect(getSpy).toHaveBeenCalledWith('/submissions/sub-1/result');
      getSpy.mockRestore();
    });

    it('throws error when submission polling times out', async () => {
      const { submissionAPI } = await import('@/config/api');
      const getSpy = jest.spyOn(api, 'get');
      getSpy.mockResolvedValue({ data: { status: 'pending', submissionId: 'sub-2' } });

      await expect(
        submissionAPI.awaitResult('sub-2', { intervalMs: 10, timeoutMs: 30 }),
      ).rejects.toThrow('Submission evaluation timed out in queue.');
      getSpy.mockRestore();
    });
  });

  describe('Token Refresh & Interceptor (AUD-016)', () => {
    it('exposes authAPI.refresh and authAPI.logout methods', async () => {
      const { authAPI } = await import('@/config/api');
      expect(typeof authAPI.refresh).toBe('function');
      expect(typeof authAPI.logout).toBe('function');
    });

    it('performs transparent token refresh on 401 and updates localStorage', async () => {
      const axios = (await import('axios')).default;
      const postSpy = jest.spyOn(axios, 'post').mockResolvedValueOnce({
        data: {
          token: 'new-rotated-access-token',
          refreshToken: 'new-rotated-refresh-token',
        },
      });

      localStorage.setItem('codeskill_token', 'old-access-token');
      localStorage.setItem('codeskill_refresh_token', 'valid-refresh-token');

      // @ts-ignore
      const errorHandler = api.interceptors.response.handlers[0].rejected;

      const mockError = {
        response: { status: 401 },
        config: {
          url: '/users/me',
          headers: { Authorization: 'Bearer old-access-token' },
          _retry: false,
        },
      };

      // Mock api instance call for the retry
      const apiSpy = jest.spyOn(api, 'request').mockResolvedValueOnce({
        data: { id: 'user-1', name: 'Verified' },
      } as any);

      // This test deliberately triggers a 401. Capture and assert its warning
      // locally so Jest does not print an expected warning as a stack trace.
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const response = await errorHandler(mockError);

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[WARN] [APIClient]: API request failed: [401] /users/me'),
          expect.objectContaining({ status: 401, url: '/users/me' }),
        );
        expect(response.data).toEqual({ id: 'user-1', name: 'Verified' });
        expect(apiSpy).toHaveBeenCalledWith(expect.objectContaining({
          url: '/users/me',
          headers: { Authorization: 'Bearer new-rotated-access-token' },
          _retry: true,
        }));
        expect(localStorage.getItem('codeskill_token')).toBe('new-rotated-access-token');
        expect(localStorage.getItem('codeskill_refresh_token')).toBe('new-rotated-refresh-token');
      } finally {
        warnSpy.mockRestore();
        postSpy.mockRestore();
        apiSpy.mockRestore();
      }
    });
  });

  describe('recoverable service failures', () => {
    it.each([
      [{ message: 'Network Error', code: 'ERR_NETWORK' }, 'API request could not reach the service'],
      [{ message: 'timeout', code: 'ECONNABORTED' }, 'API request could not reach the service'],
      [{ response: { status: 500 }, message: 'Request failed with status code 500' }, 'API service error'],
    ])('logs a safe diagnostic for the failure without swallowing it', async (failure, logMessage) => {
      const { logger } = await import('@/lib/logger');
      const errorHandler = api.interceptors.response.handlers[0].rejected;
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

      await expect(errorHandler({ config: { url: '/dashboard' }, ...failure })).rejects.toBeDefined();
      expect(warnSpy.mock.calls.some(([message]) => message === logMessage) || errorSpy.mock.calls.some(([message]) => message === logMessage)).toBe(true);

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('does not clear session data or redirect for permission and validation errors', async () => {
      localStorage.setItem('codeskill_token', 'still-valid');
      const errorHandler = api.interceptors.response.handlers[0].rejected;
      const { logger } = await import('@/lib/logger');
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

      try {
        for (const status of [400, 403, 404, 409, 422, 429]) {
          await expect(errorHandler({ response: { status }, config: { url: '/resource' } })).rejects.toBeDefined();
        }
        expect(localStorage.getItem('codeskill_token')).toBe('still-valid');
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
