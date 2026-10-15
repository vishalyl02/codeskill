import { ExecutionService, Status } from '../execution.service';
import { PistonService } from './piston.service';
import { PistonStage, PistonUnavailableError } from './piston.types';
const successful: PistonStage = {
  stdout: '30\n',
  stderr: '',
  output: '30\n',
  code: 0,
  signal: null,
};
describe('Piston judge normalization (mock execution responses)', () => {
  let execute: jest.Mock;
  let service: ExecutionService;
  const original = process.env.CODE_EXECUTION_PROVIDER;
  beforeEach(() => {
    process.env.CODE_EXECUTION_PROVIDER = 'piston';
    execute = jest
      .fn()
      .mockResolvedValue({
        language: 'python',
        version: '3.12.0',
        run: successful,
      });
    service = new ExecutionService({
      execute,
      config: { outputLimit: 65536, testCaseConcurrency: 1 },
    } as unknown as PistonService);
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CODE_EXECUTION_PROVIDER;
    else process.env.CODE_EXECUTION_PROVIDER = original;
  });
  const run = (config = {}) =>
    service.executeCode(
      'python',
      'print(30)',
      [{ id: 1, input: '10 20', expected: '30' }],
      config,
    );
  it('accepts correct output and leaves absent measurements absent', async () => {
    const [result] = await run();
    expect(result.status).toBe(Status.ACCEPTED);
    expect(result.executionTime).toBeUndefined();
    expect(result.memoryUsed).toBeUndefined();
  });
  it('uses sandbox CPU time and memory measurements only', async () => {
    execute.mockResolvedValue({
      run: { ...successful, cpu_time: 12, memory: 1048576 },
    });
    const [result] = await run();
    expect(result.executionTime).toBe(12);
    expect(result.memoryUsed).toBe(1);
  });
  it.each([
    [{ ...successful, code: 1, stderr: 'error' }, Status.RUNTIME_ERROR],
    [{ ...successful, code: null, signal: 'SIGKILL' }, Status.RUNTIME_ERROR],
    [
      { ...successful, code: null, signal: 'SIGKILL', status: 'TO' },
      Status.TIME_LIMIT_EXCEEDED,
    ],
    [
      { ...successful, code: null, signal: 'SIGKILL', status: 'OL' },
      Status.RUNTIME_ERROR,
    ],
    [
      { ...successful, code: null, signal: 'SIGSEGV', status: 'SG' },
      Status.RUNTIME_ERROR,
    ],
    [{ ...successful, stdout: '31\n' }, Status.WRONG_ANSWER],
  ])('normalizes stage %j', async (runStage, status) => {
    execute.mockResolvedValue({ run: runStage });
    expect((await run())[0].status).toBe(status);
  });
  it('distinguishes compile errors from nonzero run exits', async () => {
    execute.mockResolvedValue({
      compile: {
        ...successful,
        code: 1,
        stderr: '/piston/jobs/uuid/main.c: syntax error',
      },
    });
    const [result] = await run();
    expect(result.status).toBe(Status.COMPILATION_ERROR);
    expect(result.error).not.toContain('/piston');
  });
  it('propagates infrastructure timeout for queue retry, never TLE', async () => {
    execute.mockRejectedValue(new PistonUnavailableError());
    await expect(run()).rejects.toBeInstanceOf(PistonUnavailableError);
  });
  it('propagates Isolate internal failure', async () => {
    execute.mockResolvedValue({ run: { ...successful, status: 'XX' } });
    await expect(run()).rejects.toBeInstanceOf(PistonUnavailableError);
  });
  it('applies exact whitespace without pretrimming expected output', async () => {
    expect((await run({ exactOutput: true }))[0].status).toBe(
      Status.WRONG_ANSWER,
    );
  });
  it('supports raw custom input without grading against an empty expectation', async () => {
    expect((await run({ customInput: true }))[0].status).toBe(Status.ACCEPTED);
  });
  it('generates the existing function harness and sends inputs only through stdin', async () => {
    await service.executeCode(
      'python',
      'def add(a, b): return a+b',
      [{ id: 1, input: { a: 10, b: 20 }, expected: 30 }],
      {
        executionMode: 'function',
        functionSignature: {
          functionName: 'add',
          parameters: [
            { name: 'a', type: 'int' },
            { name: 'b', type: 'int' },
          ],
        },
      },
    );
    expect(execute.mock.calls[0][2]).toContain('def add');
    expect(JSON.parse(execute.mock.calls[0][3])).toEqual({ a: 10, b: 20 });
    expect(execute.mock.calls[0][2]).not.toContain('10');
  });
  it.each(['c', 'cpp', 'java', 'python', 'javascript', 'typescript'])(
    'prepares a valid source filename for %s',
    async (language) => {
      await service.executeCode(
        language,
        language === 'java' ? 'public class Main {}' : 'source',
        [{ id: 1, input: '', expected: '30' }],
      );
      expect(execute.mock.calls[0][1]).toMatch(/^[A-Za-z_][A-Za-z0-9_.-]+$/);
    },
  );
  it('caps Unicode output by byte count', async () => {
    execute.mockResolvedValue({
      run: { ...successful, stdout: '🙂'.repeat(20000) },
    });
    const [result] = await run();
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(65536);
    expect(result.status).toBe(Status.RUNTIME_ERROR);
  });
});
