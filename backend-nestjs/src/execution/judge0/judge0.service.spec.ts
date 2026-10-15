import axios from 'axios';
import { Judge0Service } from './judge0.service';
import { PistonUnavailableError } from '../piston/piston.types';
jest.mock('axios');
const get = jest.fn(),
  post = jest.fn();
const registry = [{ id: 71, name: 'Python (3.8.1)' }];
describe('Judge0 asynchronous API contract', () => {
  let service: Judge0Service;
  const original = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JUDGE0_AUTH_TOKEN = 'test-token';
    process.env.JUDGE0_POLL_INTERVAL_MS = '25';
    (axios.create as jest.Mock).mockReturnValue({
      get,
      post,
      defaults: {
        httpAgent: { destroy: jest.fn() },
        httpsAgent: { destroy: jest.fn() },
      },
    });
    get.mockResolvedValueOnce({ data: registry }).mockResolvedValue({
      data: {
        status: { id: 3 },
        stdout: 'MzAK\n',
        stderr: null,
        compile_output: null,
        time: '0.01',
        memory: 1024,
      },
    });
    post.mockResolvedValue({
      data: { token: '12345678-1234-1234-1234-123456789012' },
    });
    service = new Judge0Service({
      getClient: () => ({ eval: jest.fn().mockResolvedValue(1) }),
    } as never);
  });
  afterEach(() => {
    service.onModuleDestroy();
    process.env = { ...original };
  });
  const run = () => service.execute('py', 'print(30)', '10 20');
  it('sends bounded base64 code/input and polls the token without disclosing an expected answer', async () => {
    expect(await run()).toMatchObject({
      stdout: '30\n',
      time: '0.01',
      memory: 1024,
    });
    expect(post).toHaveBeenCalledWith(
      '/submissions',
      expect.objectContaining({
        language_id: 71,
        source_code: Buffer.from('print(30)').toString('base64'),
        stdin: Buffer.from('10 20').toString('base64'),
        enable_network: false,
        cpu_time_limit: 2,
        memory_limit: 262144,
      }),
      expect.objectContaining({
        params: { base64_encoded: true, wait: false },
      }),
    );
    expect(post.mock.calls[0][1]).not.toHaveProperty('expected_output');
    expect(get.mock.calls[1][0]).toBe(
      '/submissions/12345678-1234-1234-1234-123456789012',
    );
    expect((axios.create as jest.Mock).mock.calls[0][0].headers).toEqual({
      'X-Auth-Token': 'test-token',
    });
  });
  it('waits through queued and processing states', async () => {
    get
      .mockReset()
      .mockResolvedValueOnce({ data: registry })
      .mockResolvedValueOnce({ data: { status: { id: 1 } } })
      .mockResolvedValueOnce({ data: { status: { id: 2 } } })
      .mockResolvedValue({
        data: { status: { id: 3 }, stdout: '', time: null, memory: null },
      });
    expect((await run()).status.id).toBe(3);
    expect(get).toHaveBeenCalledTimes(4);
  });
  it.each([13, 14])(
    'treats internal status %s as provider failure',
    async (id) => {
      get
        .mockReset()
        .mockResolvedValueOnce({ data: registry })
        .mockResolvedValue({ data: { status: { id } } });
      await expect(run()).rejects.toBeInstanceOf(PistonUnavailableError);
    },
  );
  it.each([4, 5, 6, 7, 11, 12])(
    'returns student verdict %s without provider failure',
    async (id) => {
      get
        .mockReset()
        .mockResolvedValueOnce({ data: registry })
        .mockResolvedValue({
          data: { status: { id }, time: null, memory: null },
        });
      expect((await run()).status.id).toBe(id);
      expect(service.metrics().failures).toBe(0);
    },
  );
  it('fails closed on malformed output', async () => {
    get
      .mockReset()
      .mockResolvedValueOnce({ data: registry })
      .mockResolvedValue({
        data: { status: { id: 3 }, stdout: 'not-base64!!' },
      });
    await expect(run()).rejects.toBeInstanceOf(PistonUnavailableError);
  });
  it('clamps custom resource limits', async () => {
    await service.execute('python', 'x', '', {
      timeLimit: 999999,
      memoryLimit: 999999,
    });
    expect(post.mock.calls[0][1]).toMatchObject({
      cpu_time_limit: 10,
      wall_time_limit: 15,
      memory_limit: 524288,
    });
  });
  it('supports local emulation allowance while retaining the hard run cap', async () => {
    process.env.JUDGE_TIME_LIMIT_MULTIPLIER = '5';
    service = new Judge0Service({
      getClient: () => ({ eval: jest.fn().mockResolvedValue(1) }),
    } as never);
    await service.execute('python', 'x', '', { timeLimit: 1000 });
    expect(post.mock.calls[0][1].cpu_time_limit).toBe(5);
    await service.execute('python', 'x', '', { timeLimit: 5000 });
    expect(post.mock.calls[1][1].cpu_time_limit).toBe(10);
  });
});
