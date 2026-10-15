import axios from 'axios';
import { BadRequestException } from '@nestjs/common';
import { PistonService } from './piston.service';
import { PistonUnavailableError } from './piston.types';
jest.mock('axios');
const get = jest.fn(),
  post = jest.fn();
const registry = [{ language: 'python', version: '3.12.0', aliases: ['py'] }];
const stage = {
  stdout: '30\n',
  stderr: '',
  output: '30\n',
  code: 0,
  signal: null,
  cpu_time: 2,
  memory: 1000000,
};
describe('Piston contract client (mock transport, not sandbox verification)', () => {
  let service: PistonService;
  const original = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PISTON_RUNTIME_VERSIONS = JSON.stringify({ python: '3.12.0' });
    (axios.create as jest.Mock).mockReturnValue({ get, post, defaults: {} });
    get.mockResolvedValue({ data: registry });
    post.mockResolvedValue({
      data: { language: 'python', version: '3.12.0', run: stage },
    });
    service = new PistonService({
      getClient: () => ({ eval: jest.fn().mockResolvedValue(1) }),
    } as never);
  });
  afterEach(() => {
    process.env = { ...original };
  });
  const run = () => service.execute('py', 'main.py', 'print(30)', '10 20');
  it('uses a discovered exact runtime, bounded API limits, correlation ID and no expected answer', async () => {
    await run();
    expect(post.mock.calls[0][0]).toBe('/execute');
    expect(post.mock.calls[0][1]).toEqual({
      language: 'python',
      version: '3.12.0',
      files: [{ name: 'main.py', content: 'print(30)' }],
      stdin: '10 20',
      run_timeout: 3000,
      compile_timeout: 10000,
      run_memory_limit: 268435456,
      compile_memory_limit: 536870912,
    });
    expect(post.mock.calls[0][2].headers['X-Correlation-ID']).toMatch(
      /^[a-f0-9-]{36}$/,
    );
  });
  it('caches runtime discovery and refreshes on invalidation', async () => {
    await run();
    await run();
    expect(get).toHaveBeenCalledTimes(1);
    service.invalidateRuntimes();
    await run();
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('deduplicates concurrent registry refresh', async () => {
    await Promise.all([service.runtimes(), service.runtimes()]);
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('disables unconfigured versions even if installed', async () => {
    delete service.config.versions.python;
    await expect(run()).rejects.toBeInstanceOf(PistonUnavailableError);
    expect(post).not.toHaveBeenCalled();
  });
  it('disables a missing runtime', async () => {
    get.mockResolvedValue({ data: [] });
    await expect(run()).rejects.toBeInstanceOf(PistonUnavailableError);
  });
  it('rejects an unsupported language', async () => {
    await expect(
      service.execute('go', 'main.go', 'x', ''),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(['../main.py', '/tmp/main.py'])(
    'rejects filename %s',
    async (filename) => {
      await expect(
        service.execute('python', filename, 'x', ''),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it.each(['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'])(
    'translates %s into infrastructure failure',
    async (code) => {
      post.mockRejectedValue({ code, message: 'secret host /piston/jobs' });
      await expect(run()).rejects.toThrow('temporarily unavailable');
    },
  );
  it('opens its circuit after bounded failures', async () => {
    post.mockRejectedValue(new Error('network'));
    for (let i = 0; i < 4; i++)
      await expect(run()).rejects.toBeInstanceOf(PistonUnavailableError);
    expect(post).toHaveBeenCalledTimes(3);
    expect(service.metrics().circuitOpen).toBe(true);
  });
  it('bounds active HTTP executions without an unbounded in-process queue', async () => {
    process.env.PISTON_MAX_CONCURRENT_EXECUTIONS = '1';
    service = new PistonService({
      getClient: () => ({ eval: jest.fn().mockResolvedValue(1) }),
    } as never);
    let finish!: (value: unknown) => void;
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = run();
    await new Promise((resolve) => setImmediate(resolve));
    await expect(run()).rejects.toBeInstanceOf(PistonUnavailableError);
    finish({ data: { language: 'python', version: '3.12.0', run: stage } });
    await first;
    expect(service.metrics().active).toBe(0);
  });
  it('bounds problem time and memory limits', async () => {
    await service.execute('python', 'main.py', 'x', '', {
      timeLimit: 999999,
      memoryLimit: 999999,
    });
    expect(post.mock.calls[0][1].run_timeout).toBe(3000);
    expect(post.mock.calls[0][1].run_memory_limit).toBe(268435456);
  });
  it.each([
    null,
    {},
    { language: 'python', version: '3.12.0', run: { ...stage, stdout: 10 } },
    { language: 'python', version: '3.12.0', run: { ...stage, memory: -1 } },
  ])('rejects malformed execution response %j', async (data) => {
    post.mockResolvedValue({ data });
    await expect(run()).rejects.toBeInstanceOf(PistonUnavailableError);
  });
  it('accepts a compilation failure without run', async () => {
    post.mockResolvedValue({
      data: {
        language: 'python',
        version: '3.12.0',
        compile: { ...stage, code: 1 },
      },
    });
    expect((await run()).compile?.code).toBe(1);
  });
  it('rejects new requests after shutdown', async () => {
    service.onModuleDestroy();
    await expect(run()).rejects.toBeInstanceOf(PistonUnavailableError);
  });
  it('rejects oversized source and stdin', async () => {
    await expect(
      service.execute('python', 'main.py', 'x'.repeat(1000001), ''),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.execute('python', 'main.py', 'x', 'x'.repeat(262145)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
