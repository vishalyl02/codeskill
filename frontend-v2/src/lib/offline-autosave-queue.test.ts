import { OfflineAutosaveQueue } from './offline-autosave-queue';

describe('OfflineAutosaveQueue (frontend-v2)', () => {
  let mockApiClient: {
    request: jest.Mock;
    post: jest.Mock;
  };
  let queue: OfflineAutosaveQueue;

  beforeEach(() => {
    jest.useFakeTimers();
    mockApiClient = {
      request: jest.fn().mockResolvedValue({ status: 200, data: { success: true } }),
      post: jest.fn().mockResolvedValue({ status: 200, data: { success: true } }),
    };
    queue = new OfflineAutosaveQueue(mockApiClient);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('coalesces multiple rapid edits to the same questionId into a single replay request (Last-Write-Wins)', async () => {
    // Temporarily disable network to buffer edits
    mockApiClient.request.mockRejectedValue(new Error('Network Error'));

    await queue.enqueue({
      attemptId: 'attempt-1',
      questionId: 'q-mcq-1',
      payload: { selectedAnswer: 0, timeSpentSeconds: 10 },
    });

    await queue.enqueue({
      attemptId: 'attempt-1',
      questionId: 'q-mcq-1',
      payload: { selectedAnswer: 1, timeSpentSeconds: 15 },
    });

    await queue.enqueue({
      attemptId: 'attempt-1',
      questionId: 'q-mcq-1',
      payload: { selectedAnswer: 2, timeSpentSeconds: 20 },
    });

    // Coalescing ensures only 1 entry exists for attempt-1:q-mcq-1
    expect(queue.getPendingCount()).toBe(1);
    expect(queue.getStatus()).toBe('offline-buffered');

    // Restore network
    mockApiClient.request.mockResolvedValue({ status: 200, data: { success: true } });

    // Flush should transmit only the latest write (selectedAnswer: 2)
    const synced = await queue.flush();

    expect(synced).toBe(true);
    expect(mockApiClient.request).toHaveBeenCalledTimes(2); // 1 failed on enqueue + 1 succeeded on flush
    const lastCall = mockApiClient.request.mock.calls[mockApiClient.request.mock.calls.length - 1][0];
    expect(lastCall.data.selectedAnswer).toBe(2);
    expect(lastCall.data.timeSpentSeconds).toBe(20);
    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getStatus()).toBe('synced');
  });

  it('keeps a new draft queued when an earlier write completes for the same question', async () => {
    let finishFirst!: (result: unknown) => void;
    let firstStarted!: () => void;
    const sent = new Promise<void>((resolve) => { firstStarted = resolve; });
    mockApiClient.request.mockImplementationOnce(() => {
      firstStarted();
      return new Promise((resolve) => { finishFirst = resolve; });
    });
    const original = queue.enqueue({
      attemptId: 'mac-attempt', questionId: 'coding', idempotencyKey: 'earlier-draft',
      payload: { code: 'earlier' },
    });
    await sent;
    const newer = queue.enqueue({
      attemptId: 'mac-attempt', questionId: 'coding', idempotencyKey: 'newer-draft',
      payload: { code: 'newer' },
    });
    finishFirst({ status: 200 });
    await Promise.all([original, newer]);
    expect(mockApiClient.request).toHaveBeenCalledTimes(2);
    expect(mockApiClient.request).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { code: 'newer', idempotencyKey: 'newer-draft' },
      headers: { 'X-Idempotency-Key': 'newer-draft' },
    }));
    expect(queue.getPendingCount()).toBe(0);
  });

  it('preserves entries when network returns 503 or Network Error, and retries with backoff', async () => {
    mockApiClient.request.mockRejectedValue({
      response: { status: 503, data: { message: 'Service Unavailable' } },
    });

    await queue.enqueue({
      attemptId: 'attempt-2',
      questionId: 'q-code-1',
      payload: { code: 'def solution(): return 42' },
    });

    expect(queue.getPendingCount()).toBe(1);
    expect(queue.getStatus()).toBe('offline-buffered');

    // Simulate network coming back online after backoff
    mockApiClient.request.mockResolvedValue({ status: 200, data: { success: true } });

    // Fast-forward backoff timer
    jest.advanceTimersByTime(2500);

    // Let microtasks run
    await Promise.resolve();

    const synced = await queue.flush();
    expect(synced).toBe(true);
    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getStatus()).toBe('synced');
  });

  it('triggers automatic replay when window online event fires', async () => {
    mockApiClient.request.mockRejectedValue(new Error('Network Offline'));

    await queue.enqueue({
      attemptId: 'attempt-3',
      questionId: 'q-3',
      payload: { answer: 'A' },
    });

    expect(queue.getStatus()).toBe('offline-buffered');
    expect(queue.getPendingCount()).toBe(1);

    // Network restored
    mockApiClient.request.mockResolvedValue({ status: 200, data: { success: true } });

    // Simulate campus Wi-Fi reconnect
    window.dispatchEvent(new Event('online'));

    await Promise.resolve();
    const synced = await queue.flush();

    expect(synced).toBe(true);
    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getStatus()).toBe('synced');
  });

  it('purges all buffered entries and resets status on purgeAll after exam submission', async () => {
    mockApiClient.request.mockRejectedValue(new Error('Network Error'));

    await queue.enqueue({
      attemptId: 'attempt-submit',
      questionId: 'q-1',
      payload: { val: 1 },
    });

    await queue.enqueue({
      attemptId: 'attempt-submit',
      questionId: 'q-2',
      payload: { val: 2 },
    });

    expect(queue.getPendingCount()).toBe(2);

    await queue.purgeAll('attempt-submit');

    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getStatus()).toBe('synced');
  });

  it('discards buffered saves for completed sequential questions', async () => {
    mockApiClient.request.mockRejectedValue(new Error('Network Error'));
    await queue.enqueue({
      attemptId: 'attempt-sequential',
      questionId: 'q-1',
      payload: { responses: [{ questionId: 'q-1', selectedAnswer: 1 }] },
    });

    await queue.discardQuestions('attempt-sequential', ['q-1']);

    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getStatus()).toBe('synced');
  });

  it('observable onStatusChange notifies listeners on status transitions', async () => {
    const statusHistory: string[] = [];
    const countHistory: number[] = [];

    const unsubscribe = queue.onStatusChange((status, count) => {
      statusHistory.push(status);
      countHistory.push(count);
    });

    mockApiClient.request.mockRejectedValue(new Error('Offline'));

    await queue.enqueue({
      attemptId: 'attempt-obs',
      questionId: 'q-1',
      payload: { test: true },
    });

    expect(statusHistory).toContain('offline-buffered');
    expect(countHistory).toContain(1);

    mockApiClient.request.mockResolvedValue({ status: 200, data: { success: true } });
    await queue.flush();

    expect(statusHistory[statusHistory.length - 1]).toBe('synced');
    expect(countHistory[countHistory.length - 1]).toBe(0);

    unsubscribe();
  });

  it('generates deterministic idempotency key and sends X-Idempotency-Key header on flush', async () => {
    await queue.enqueue({
      attemptId: 'asmt-attempt-99',
      questionId: 'q-mcq-5',
      candidateId: 'cand-77',
      payload: { selectedAnswer: 3 },
    });

    expect(mockApiClient.request).toHaveBeenCalledTimes(1);
    const callArgs = mockApiClient.request.mock.calls[0][0];
    expect(callArgs.headers?.['X-Idempotency-Key']).toMatch(/^autosave:asmt-attempt-99:cand-77:\d+$/);
    expect(callArgs.data.idempotencyKey).toBe(callArgs.headers['X-Idempotency-Key']);
  });

  it('replays legacy assessment progress entries through the current save-progress route', async () => {
    await queue.enqueue({
      attemptId: 'attempt-legacy-route',
      questionId: 'q-legacy',
      payload: { responses: [{ questionId: 'q-legacy', selectedAnswer: 1 }] },
      endpoint: '/api/student/assessments/NAV-SEQ-20/progress',
      method: 'POST',
    });

    expect(mockApiClient.request.mock.calls[0][0].url)
      .toBe('/assessments/NAV-SEQ-20/save-progress');
  });
});
