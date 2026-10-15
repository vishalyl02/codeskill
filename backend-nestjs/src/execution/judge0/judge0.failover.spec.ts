import { ExecutionService, Status } from '../execution.service';
import { PistonUnavailableError } from '../piston/piston.types';

describe('Judge0 primary and Piston fallback', () => {
  const original = process.env.CODE_EXECUTION_PROVIDER;
  const primary = {
    execute: jest.fn(),
    config: { outputLimit: 65536, testCaseConcurrency: 2 },
    metrics: jest.fn(),
  };
  const secondary = {
    execute: jest.fn(),
    config: { outputLimit: 65536, testCaseConcurrency: 2 },
    metrics: jest.fn(),
  };
  let service: ExecutionService;
  const run = () =>
    service.executeCode('python', 'print(5)', [
      { id: 1, input: '2 3', expected: '5' },
    ]);
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CODE_EXECUTION_PROVIDER = 'judge0';
    primary.execute.mockResolvedValue({
      status: { id: 3 },
      stdout: '5\n',
      stderr: null,
      compile_output: null,
      time: '0.002',
      memory: 1024,
    });
    secondary.execute.mockResolvedValue({
      run: { stdout: '5\n', stderr: '', output: '5\n', code: 0, signal: null },
    });
    service = new ExecutionService(secondary as never, primary as never);
  });
  afterAll(() => {
    if (original === undefined) delete process.env.CODE_EXECUTION_PROVIDER;
    else process.env.CODE_EXECUTION_PROVIDER = original;
  });
  it('uses Judge0 first and converts seconds/KiB to milliseconds/MiB', async () => {
    const [result] = await run();
    expect(result).toEqual(
      expect.objectContaining({
        passed: true,
        status: Status.ACCEPTED,
        executionTime: 2,
        memoryUsed: 1,
      }),
    );
    expect(secondary.execute).not.toHaveBeenCalled();
    expect(primary.execute).toHaveBeenCalledWith(
      'python',
      'print(5)',
      '2 3',
      expect.any(Object),
    );
  });
  it('falls back when the primary transport, capacity, or sandbox is unavailable', async () => {
    primary.execute.mockRejectedValue(new PistonUnavailableError());
    expect((await run())[0].status).toBe(Status.ACCEPTED);
    expect(secondary.execute).toHaveBeenCalledTimes(1);
    expect(service.executionMetrics().failovers).toBe(1);
  });
  it('adapts named Java entry classes for Judge0 without renaming constructors or string literals', async () => {
    await service.executeCode(
      'java',
      'public class Solution { Solution() {} public static void main(String[] args) { System.out.println("Solution"); } }',
      [{ id: 1, input: '', expected: 'Solution' }],
    );
    const source = primary.execute.mock.calls[0][1];
    expect(source).toContain('class Solution { Solution() {}');
    expect(source).toContain('System.out.println("Solution")');
    expect(source).toContain('Solution.main(args)');
    expect(source).not.toContain('public class Solution');
  });
  it.each([
    [4, Status.WRONG_ANSWER],
    [5, Status.TIME_LIMIT_EXCEEDED],
    [6, Status.COMPILATION_ERROR],
    [7, Status.RUNTIME_ERROR],
  ])(
    'does not retry student verdict %s on another judge',
    async (id, status) => {
      primary.execute.mockResolvedValue({
        status: { id },
        stdout: '',
        stderr: 'student error',
        compile_output: null,
        time: null,
        memory: null,
      });
      expect((await run())[0].status).toBe(status);
      expect(secondary.execute).not.toHaveBeenCalled();
    },
  );
  it('fails as infrastructure failure if both providers are unavailable', async () => {
    primary.execute.mockRejectedValue(new PistonUnavailableError());
    secondary.execute.mockRejectedValue(new PistonUnavailableError());
    await expect(run()).rejects.toBeInstanceOf(PistonUnavailableError);
  });
  it('drains in-flight cases before reporting failure and freeing a user reservation', async () => {
    let finish!: (value: unknown) => void;
    primary.execute.mockImplementation((_language, _source, stdin: string) =>
      stdin === 'first'
        ? Promise.reject(new PistonUnavailableError())
        : new Promise((resolve) => {
            finish = resolve;
          }),
    );
    secondary.execute.mockRejectedValue(new PistonUnavailableError());
    let settled = false;
    const execution = service
      .executeCode('python', 'print(5)', [
        { input: 'first', expected: '5' },
        { input: 'second', expected: '5' },
      ])
      .catch(() => {
        settled = true;
      });
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    finish({
      status: { id: 3 },
      stdout: '5',
      stderr: null,
      compile_output: null,
      time: null,
      memory: null,
    });
    await execution;
    expect(settled).toBe(true);
  });
});
