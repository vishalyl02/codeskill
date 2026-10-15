import axios from 'axios';
import { PistonService } from './piston.service';
import { PistonUnavailableError } from './piston.types';
import { RedisService } from '../../redis/redis.service';
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

// Pool capacity itself is tested against real Redis in the judge integration test.
function makeRedis() {
  let count = 0;
  const client = {
    eval(script: string) {
      if (script.includes("redis.call('ZREM',")) {
        count = Math.max(0, count - 1);
        return Promise.resolve(1);
      }
      if (count >= 1) return Promise.resolve(0);
      count++;
      return Promise.resolve(1);
    },
  };
  return { getClient: () => client, count: () => count };
}

describe('Piston load-shedding controls', () => {
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
  });
  afterEach(() => {
    process.env = { ...original };
    jest.restoreAllMocks();
  });

  it('enforces a Redis-backed global in-flight cap shared across workers', async () => {
    process.env.PISTON_GLOBAL_MAX_CONCURRENT = '1';
    const redis = makeRedis();
    service = new PistonService(redis as unknown as RedisService);
    let finish!: (value: unknown) => void;
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = service.execute('py', 'main.py', 'print(30)', '');
    await new Promise((resolve) => setImmediate(resolve));
    // The per-process cap (10) would allow this; only the global cap (1) stops it.
    await expect(
      service.execute('py', 'main.py', 'print(30)', ''),
    ).rejects.toBeInstanceOf(PistonUnavailableError);
    expect(redis.count()).toBe(1);
    finish({ data: { language: 'python', version: '3.12.0', run: stage } });
    await first;
    expect(redis.count()).toBe(0);
  });

  it('closes after a successful execution probe, never a metadata health check', async () => {
    service = new PistonService({
      getClient: () => ({ eval: jest.fn().mockResolvedValue(1) }),
    } as never);
    post.mockRejectedValue(new Error('network'));
    for (let i = 0; i < 3; i++)
      await expect(
        service.execute('py', 'main.py', 'print(30)', ''),
      ).rejects.toBeInstanceOf(PistonUnavailableError);
    expect(service.metrics().circuitOpen).toBe(true);

    const advanced = Date.now() + 60_000;
    jest.spyOn(Date, 'now').mockReturnValue(advanced);
    await service.availableLanguages();
    expect(service.metrics().circuitOpen).toBe(true);
    post.mockResolvedValue({
      data: { language: 'python', version: '3.12.0', run: stage },
    });
    await expect(
      service.execute('py', 'main.py', 'print(30)', ''),
    ).resolves.toBeDefined();
    expect(service.metrics().circuitState).toBe('closed');
    expect(service.metrics().circuitOpen).toBe(false);
  });
});
