import {
  Injectable,
  Logger,
  Optional,
  BadRequestException,
} from '@nestjs/common';
import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID as uuidv4 } from 'crypto';
import { commandBasename, getLanguageAdapter } from './language-adapters';

import { PistonService } from './piston/piston.service';
import { PistonUnavailableError } from './piston/piston.types';
import { compareOutput } from './output-comparison';
import { Judge0Service } from './judge0/judge0.service';
import { canonicalLanguage } from './execution.types';

// ── Result Status Constants ──────────────────────────────────────────────────
export const Status = {
  ACCEPTED: 'accepted',
  WRONG_ANSWER: 'wrong_answer',
  COMPILATION_ERROR: 'compile_error',
  RUNTIME_ERROR: 'runtime_error',
  TIME_LIMIT_EXCEEDED: 'time_limit',
  MEMORY_LIMIT_EXCEEDED: 'memory_limit',
  SYSTEM_ERROR: 'system_error',
} as const;

export interface TestCaseInput {
  id: number | string;
  input: string;
  expected: string;
}

export interface TestCaseResult {
  id: number | string;
  passed: boolean;
  status: string;
  output: string;
  expected: string;
  error?: string;
  executionTime?: number;
  memoryUsed?: number;
}

interface RunOptions {
  timeout: number;
  memoryLimit?: number;
  cpuLimit?: number;
  language: string;
  config: any;
}

// ── Language Configurations ──────────────────────────────────────────────────
interface LanguageConfig {
  /** File extension for the source file */
  extension: string;
  /** Whether the language requires a compilation step */
  compiled: boolean;
  /** Build the compilation command. Returns null for interpreted langs. */
  compileCommand?: (
    srcPath: string,
    outPath: string,
    cwd: string,
  ) => { cmd: string; args: string[] };
  /** Build the run command */
  runCommand: (
    srcPath: string,
    outPath: string,
    cwd: string,
  ) => { cmd: string; args: string[] };
  /** Optional: Pre-process source code before writing (e.g., Java class renaming) */
  preProcess?: (
    code: string,
    cwd: string,
  ) => { code: string; filename: string };
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  // ── C ──
  c: {
    extension: '.c',
    compiled: true,
    compileCommand: (srcPath, outPath) => ({
      cmd: 'gcc',
      args: [
        '-std=c11',
        '-O2',
        '-pipe',
        '-Wall',
        '-o',
        outPath,
        srcPath,
        '-lm',
      ],
    }),
    runCommand: (_src, outPath) => ({
      cmd: outPath,
      args: [],
    }),
  },

  // ── C++ ──
  cpp: {
    extension: '.cpp',
    compiled: true,
    compileCommand: (srcPath, outPath) => ({
      cmd: 'g++',
      args: ['-std=c++17', '-O2', '-pipe', '-Wall', '-o', outPath, srcPath],
    }),
    runCommand: (_src, outPath) => ({
      cmd: outPath,
      args: [],
    }),
  },

  'c++': {
    extension: '.cpp',
    compiled: true,
    compileCommand: (srcPath, outPath) => ({
      cmd: 'g++',
      args: ['-std=c++17', '-O2', '-pipe', '-Wall', '-o', outPath, srcPath],
    }),
    runCommand: (_src, outPath) => ({
      cmd: outPath,
      args: [],
    }),
  },

  // ── Java ──
  java: {
    extension: '.java',
    compiled: true,
    preProcess: (code: string, cwd: string) => {
      // Extract the public class name from the source code
      const publicClassMatch = code.match(
        /public\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/,
      );
      const className = publicClassMatch ? publicClassMatch[1] : 'Main';

      // If no public class found, wrap the code in a Main class
      let processedCode = code;
      if (!publicClassMatch && !code.match(/class\s+[A-Za-z_][A-Za-z0-9_]*/)) {
        processedCode = `public class Main {\n${code}\n}`;
      }

      return {
        code: processedCode,
        filename: `${className}.java`,
      };
    },
    compileCommand: (srcPath, _outPath, cwd) => ({
      cmd: 'javac',
      args: ['-d', cwd, srcPath],
    }),
    runCommand: (srcPath, _outPath, cwd) => {
      // Extract class name from filename
      const basename = path.basename(srcPath, '.java');
      return {
        cmd: 'java',
        args: ['-cp', cwd, basename],
      };
    },
  },

  // ── Python ──
  python: {
    extension: '.py',
    compiled: false,
    runCommand: (srcPath) => ({
      cmd: 'python3',
      args: [srcPath],
    }),
  },

  python3: {
    extension: '.py',
    compiled: false,
    runCommand: (srcPath) => ({
      cmd: 'python3',
      args: [srcPath],
    }),
  },

  py: {
    extension: '.py',
    compiled: false,
    runCommand: (srcPath) => ({
      cmd: 'python3',
      args: [srcPath],
    }),
  },

  // ── JavaScript ──
  javascript: {
    extension: '.js',
    compiled: false,
    runCommand: (srcPath) => ({
      cmd: 'node',
      args: [srcPath],
    }),
  },

  js: {
    extension: '.js',
    compiled: false,
    runCommand: (srcPath) => ({
      cmd: 'node',
      args: [srcPath],
    }),
  },

  node: {
    extension: '.js',
    compiled: false,
    runCommand: (srcPath) => ({
      cmd: 'node',
      args: [srcPath],
    }),
  },

  // ── TypeScript ──
  typescript: {
    extension: '.ts',
    compiled: false,
    runCommand: (srcPath) => ({
      cmd: 'npx',
      args: ['--yes', 'tsx', srcPath],
    }),
  },

  ts: {
    extension: '.ts',
    compiled: false,
    runCommand: (srcPath) => ({
      cmd: 'npx',
      args: ['--yes', 'tsx', srcPath],
    }),
  },
};

// ── Default Limits ───────────────────────────────────────────────────────────
const DEFAULT_TIMEOUT_MS = 5000; // 5 seconds per test case
const DEFAULT_COMPILE_TIMEOUT_MS = 15000; // 15 seconds for compilation
const MAX_OUTPUT_BYTES = 256 * 1024; // 256 KB max output

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  private failovers = 0;
  constructor(
    @Optional() private readonly piston?: PistonService,
    @Optional() private readonly judge0?: Judge0Service,
  ) {}

  get provider(): string {
    const provider = process.env.CODE_EXECUTION_PROVIDER || 'judge0';
    if (!['legacy', 'piston', 'judge0'].includes(provider))
      throw new Error('Invalid CODE_EXECUTION_PROVIDER');
    return provider;
  }

  executionMetrics() {
    return {
      primary: this.provider,
      fallback: this.provider === 'judge0' ? 'piston' : undefined,
      failovers: this.failovers,
      judge0: this.judge0?.metrics(),
      piston: this.piston?.metrics(),
    };
  }

  async availableLanguages() {
    if (this.provider === 'judge0') {
      const [primary, fallback] = await Promise.allSettled([
        this.judge0?.availableLanguages() ??
          Promise.reject(new PistonUnavailableError()),
        this.piston?.availableLanguages() ??
          Promise.reject(new PistonUnavailableError()),
      ]);
      if (primary.status === 'rejected' && fallback.status === 'rejected')
        throw new PistonUnavailableError();
      return ['c', 'cpp', 'java', 'python', 'javascript', 'typescript'].map(
        (language) => {
          const preferred =
            primary.status === 'fulfilled'
              ? primary.value.find(
                  (entry) => entry.language === language && entry.enabled,
                )
              : undefined;
          const secondary =
            fallback.status === 'fulfilled'
              ? fallback.value.find(
                  (entry) => entry.language === language && entry.enabled,
                )
              : undefined;
          return {
            language,
            enabled: !!(preferred || secondary),
            version: preferred?.version || secondary?.version,
            provider: preferred ? 'judge0' : secondary ? 'piston' : undefined,
          };
        },
      );
    }
    if (this.provider === 'piston') {
      if (!this.piston) throw new PistonUnavailableError();
      return this.piston.availableLanguages();
    }
    return ['c', 'cpp', 'java', 'python', 'javascript', 'typescript'].map(
      (language) => ({ language, enabled: true }),
    );
  }

  validateRequest(code: unknown, testCases: unknown): void {
    if (
      typeof code !== 'string' ||
      !code.trim() ||
      Buffer.byteLength(code) > 1_000_000
    )
      throw new BadRequestException(
        'Source code must be nonempty and at most 1MB',
      );
    if (
      !Array.isArray(testCases) ||
      testCases.length === 0 ||
      testCases.length > 100
    )
      throw new BadRequestException('Provide between 1 and 100 test cases');
    if (
      testCases.some(
        (tc) =>
          !tc ||
          typeof tc !== 'object' ||
          Buffer.byteLength(
            typeof tc.input === 'string'
              ? tc.input
              : JSON.stringify(tc.input ?? ''),
          ) > 262144 ||
          Buffer.byteLength(JSON.stringify(tc.expected ?? tc.output ?? '')) >
            262144,
      )
    )
      throw new BadRequestException('Invalid or oversized test input/output');
  }

  /**
   * Main entry point — Execute user code against test cases.
   * Supports both stdin/stdout mode (competitive programming) and
   * function-call mode (LeetCode-style) based on test case format.
   */
  async runCode(
    code: string,
    language: string,
    testCases: any[],
    config: any = {},
  ): Promise<TestCaseResult[]> {
    return this.executeCode(language, code, testCases, config);
  }

  async executeCode(
    language: string,
    code: string,
    testCases: any[],
    config: any = {},
  ): Promise<TestCaseResult[]> {
    this.validateRequest(code, testCases);
    const langConfig = LANGUAGE_CONFIGS[language.toLowerCase()];
    if (!langConfig) {
      return testCases.map((tc) => ({
        id: tc.id,
        passed: false,
        status: Status.SYSTEM_ERROR,
        output: '',
        expected: String(tc.expected ?? tc.output ?? ''),
        error: `Unsupported language: ${language}`,
      }));
    }

    if (typeof code !== 'string' || !code.trim()) {
      return testCases.map((tc) => ({
        id: tc.id,
        passed: false,
        status: Status.SYSTEM_ERROR,
        output: '',
        expected: String(tc.expected ?? tc.output ?? ''),
        error: 'Source code is required',
      }));
    }
    if (Buffer.byteLength(code, 'utf8') > 1_000_000) {
      return testCases.map((tc) => ({
        id: tc.id,
        passed: false,
        status: Status.SYSTEM_ERROR,
        output: '',
        expected: String(tc.expected ?? tc.output ?? ''),
        error: 'Source code exceeds the 1000000 byte limit',
      }));
    }

    const functionMode = config.executionMode === 'function';
    let sourceCode = code;
    if (functionMode) {
      const adapter = getLanguageAdapter(language);
      if (!adapter) {
        return testCases.map((tc) => ({
          id: tc.id,
          passed: false,
          status: Status.SYSTEM_ERROR,
          output: '',
          expected: String(tc.expected ?? tc.output ?? ''),
          error: `Unsupported language: ${language}`,
        }));
      }
      try {
        sourceCode = adapter.prepare(
          code,
          'function',
          config.functionSignature,
        ).source;
      } catch (error: any) {
        return testCases.map((tc) => ({
          id: tc.id,
          passed: false,
          status: Status.SYSTEM_ERROR,
          output: '',
          expected: String(tc.expected ?? tc.output ?? ''),
          error: error?.message || 'Unable to generate function-mode wrapper',
        }));
      }
    }

    // Compute per-test-case timeout
    let timeout = DEFAULT_TIMEOUT_MS;
    if (config.executionProfiles?.[language]) {
      timeout *= config.executionProfiles[language].timeLimitMultiplier || 1;
    }
    if (config.timeLimit) {
      timeout = config.timeLimit;
    }

    const runOpts: RunOptions = {
      timeout: Math.max(
        100,
        Math.min(60_000, Number(timeout) || DEFAULT_TIMEOUT_MS),
      ),
      memoryLimit: Math.max(
        32,
        Math.min(1_024, Number(config.memoryLimit) || 256),
      ),
      cpuLimit: Math.max(0.25, Math.min(2, Number(config.cpuLimit) || 1)),
      language,
      config,
    };

    // Normalize test cases — support both formats:
    //   { input: "5\n1 2 3 4 5", expected: "15" }       — stdin/stdout
    //   { input: { nums: [2,7,11,15], target: 9 }, expected: [0,1] }  — structured
    const normalizedTestCases: TestCaseInput[] = testCases.map((tc, i) => ({
      id: tc.id ?? i + 1,
      input: this.normalizeInput(tc.input, functionMode),
      expected:
        (config.exactOutput || this.provider !== 'legacy') &&
        typeof (tc.expected ?? tc.output) === 'string'
          ? (tc.expected ?? tc.output)
          : this.normalizeExpected(tc.expected ?? tc.output),
    }));

    if (this.provider !== 'legacy') {
      if (config.hasCustomChecker) throw new PistonUnavailableError();
      const prepared = getLanguageAdapter(language)!.prepare(
        code,
        functionMode ? 'function' : 'standard',
        config.functionSignature,
      );
      // Piston isolates every test in a new job, including its compilation stage.
      // Bound the fan-out per submission so one submission cannot monopolise the
      // global semaphore; every test case still flows through the semaphore + breaker.
      return this.runTestCasesConcurrently(
        normalizedTestCases,
        this.provider === 'judge0'
          ? this.judge0?.config.testCaseConcurrency || 2
          : this.piston?.config.testCaseConcurrency || 2,
        (tc) => this.executeRemoteTestCase(language, prepared, tc, config),
      );
    }

    // For compiled languages, compile once and run against all test cases
    if (langConfig.compiled) {
      return this.executeCompiled(
        langConfig,
        language,
        sourceCode,
        normalizedTestCases,
        runOpts,
      );
    }

    // For interpreted languages, run each test case independently
    return this.executeInterpreted(
      langConfig,
      language,
      sourceCode,
      normalizedTestCases,
      runOpts,
    );
  }

  private async executeRemoteTestCase(
    language: string,
    prepared: { source: string; filename: string },
    tc: TestCaseInput,
    config: any,
  ): Promise<TestCaseResult> {
    if (this.provider === 'piston') {
      if (!this.piston) throw new PistonUnavailableError();
      return this.executePistonTestCase(language, prepared, tc, config);
    }
    try {
      if (!this.judge0) throw new PistonUnavailableError();
      // Judge0's Java runtime always compiles Main.java and launches Main.
      // Keep the student's class name/constructors intact and delegate its entry point.
      let primarySource = prepared.source;
      if (
        canonicalLanguage(language) === 'java' &&
        prepared.filename !== 'Main.java'
      ) {
        const entry = prepared.filename.replace(/\.java$/, '');
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry))
          throw new BadRequestException('Invalid Java entry point');
        primarySource =
          prepared.source.replace(
            new RegExp(`\\bpublic\\s+((?:final\\s+)?class\\s+${entry}\\b)`),
            '$1',
          ) +
          `\nclass Main { public static void main(String[] args) throws Exception { ${entry}.main(args); } }\n`;
      }
      const response = await this.judge0.execute(
        language,
        primarySource,
        tc.input,
        { timeLimit: config.timeLimit, memoryLimit: config.memoryLimit },
      );
      const id = response.status.id;
      const limit = this.judge0.config.outputLimit;
      const output = Buffer.from(response.stdout || '')
        .subarray(0, limit)
        .toString('utf8');
      let status: string =
        id === 3
          ? Status.ACCEPTED
          : id === 4
            ? Status.WRONG_ANSWER
            : id === 5
              ? Status.TIME_LIMIT_EXCEEDED
              : id === 6
                ? Status.COMPILATION_ERROR
                : Status.RUNTIME_ERROR;
      if (Buffer.byteLength(response.stdout || '') > limit && id === 3)
        status = Status.RUNTIME_ERROR;
      const passed =
        status === Status.ACCEPTED &&
        (config.customInput === true ||
          compareOutput(output, tc.expected, config));
      if (status === Status.ACCEPTED && !passed) status = Status.WRONG_ANSWER;
      return {
        id: tc.id,
        passed,
        status,
        output,
        expected: tc.expected,
        error:
          this.redactDiagnostic(
            response.compile_output || response.stderr || '',
            limit,
          ) || undefined,
        executionTime:
          response.time == null ? undefined : Number(response.time) * 1000,
        memoryUsed:
          response.memory == null ? undefined : response.memory / 1024,
      };
    } catch (error) {
      if (!(error instanceof PistonUnavailableError) || !this.piston)
        throw error;
      this.failovers++;
      this.logger.warn('Judge0 unavailable; executing the test case on Piston');
      return this.executePistonTestCase(language, prepared, tc, config);
    }
  }

  private redactDiagnostic(value: string, limit: number): string {
    return Buffer.from(value)
      .subarray(0, limit)
      .toString('utf8')
      .replace(
        /\/(?:piston|box|tmp|usr|opt|home|var)\/[^\s:'"<>]+/g,
        '[sandbox]',
      );
  }

  private async executePistonTestCase(
    language: string,
    prepared: { source: string; filename: string },
    tc: TestCaseInput,
    config: any,
  ): Promise<TestCaseResult> {
    const piston = this.piston!;
    const response = await piston.execute(
      language,
      prepared.filename,
      prepared.source,
      tc.input,
      { timeLimit: config.timeLimit, memoryLimit: config.memoryLimit },
    );
    const compileFailed =
      response.compile &&
      (response.compile.code !== 0 ||
        response.compile.signal ||
        response.compile.status);
    const stage = compileFailed ? response.compile! : response.run!;
    if (stage.status === 'XX') throw new PistonUnavailableError();
    // SIGKILL is ambiguous (timeout, output, memory, host kill). Use Isolate TO only.
    let status: string = compileFailed
      ? Status.COMPILATION_ERROR
      : stage.status === 'TO'
        ? Status.TIME_LIMIT_EXCEEDED
        : stage.code !== 0 || stage.signal || stage.status
          ? Status.RUNTIME_ERROR
          : Status.ACCEPTED;
    const limit = piston.config.outputLimit;
    const oversized =
      Buffer.byteLength(stage.stdout) > limit ||
      Buffer.byteLength(stage.stderr) > limit;
    if (!compileFailed && oversized) status = Status.RUNTIME_ERROR;
    const output = Buffer.from(stage.stdout)
      .subarray(0, limit)
      .toString('utf8');
    const passed =
      status === Status.ACCEPTED &&
      (config.customInput === true ||
        compareOutput(output, tc.expected, config));
    if (status === Status.ACCEPTED && !passed) status = Status.WRONG_ANSWER;
    const diagnostic =
      oversized || ['OL', 'EL'].includes(stage.status || '')
        ? 'Output limit exceeded'
        : stage.status === 'TO'
          ? 'Execution time limit exceeded'
          : this.redactDiagnostic(stage.stderr, limit);
    return {
      id: tc.id,
      passed,
      status,
      output,
      expected: tc.expected,
      error: diagnostic || undefined,
      executionTime: stage.cpu_time ?? undefined,
      memoryUsed: stage.memory == null ? undefined : stage.memory / 1048576,
    };
  }

  // ── Concurrency Helper ───────────────────────────────────────────────────
  private async runTestCasesConcurrently(
    testCases: TestCaseInput[],
    concurrencyLimit: number,
    runFn: (tc: TestCaseInput) => Promise<TestCaseResult>,
  ): Promise<TestCaseResult[]> {
    const results: TestCaseResult[] = new Array(testCases.length);
    let index = 0;
    let failure: unknown;
    const workerCount = Math.min(concurrencyLimit, testCases.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (index < testCases.length && !failure) {
        const currentIndex = index++;
        try {
          results[currentIndex] = await runFn(testCases[currentIndex]);
        } catch (error) {
          failure = error;
          return;
        }
      }
    });
    await Promise.all(workers);
    if (failure) throw failure;
    return results;
  }

  // ── Compiled Language Execution ──────────────────────────────────────────

  private async executeCompiled(
    langConfig: LanguageConfig,
    language: string,
    code: string,
    testCases: TestCaseInput[],
    opts: RunOptions,
  ): Promise<TestCaseResult[]> {
    const submissionId = uuidv4();
    const tmpDir = path.join(os.tmpdir(), `codeskill_${submissionId}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      // 1. Pre-process source code (e.g., Java class name extraction)
      let processedCode = code;
      let filename = `solution${langConfig.extension}`;
      if (langConfig.preProcess) {
        const result = langConfig.preProcess(code, tmpDir);
        processedCode = result.code;
        filename = result.filename;
      }

      // 2. Write source file
      const srcPath = path.join(tmpDir, filename);
      fs.writeFileSync(srcPath, processedCode, 'utf-8');

      // 3. Compile
      const outPath = path.join(tmpDir, 'solution');
      const compileResult = await this.compile(
        langConfig,
        srcPath,
        outPath,
        tmpDir,
        opts,
      );
      if (compileResult.error) {
        // Return COMPILATION_ERROR for all test cases
        return testCases.map((tc) => ({
          id: tc.id,
          passed: false,
          status: Status.COMPILATION_ERROR,
          output: '',
          expected: tc.expected,
          error: compileResult.error,
        }));
      }

      // 4. Execute test cases in parallel (up to 8 concurrent test cases)
      return await this.runTestCasesConcurrently(testCases, 8, (tc) =>
        this.runProcess(langConfig, srcPath, outPath, tmpDir, tc, opts),
      );
    } finally {
      this.cleanup(tmpDir);
    }
  }

  // ── Interpreted Language Execution ────────────────────────────────────────

  private async executeInterpreted(
    langConfig: LanguageConfig,
    language: string,
    code: string,
    testCases: TestCaseInput[],
    opts: RunOptions,
  ): Promise<TestCaseResult[]> {
    const submissionId = uuidv4();
    const tmpDir = path.join(os.tmpdir(), `codeskill_${submissionId}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      let processedCode = code;
      let filename = `solution${langConfig.extension}`;
      if (langConfig.preProcess) {
        const result = langConfig.preProcess(code, tmpDir);
        processedCode = result.code;
        filename = result.filename;
      }

      const srcPath = path.join(tmpDir, filename);
      fs.writeFileSync(srcPath, processedCode, 'utf-8');
      const outPath = path.join(tmpDir, 'solution');

      // Execute all test cases concurrently against the written source file
      return await this.runTestCasesConcurrently(testCases, 8, (tc) =>
        this.runProcess(langConfig, srcPath, outPath, tmpDir, tc, opts),
      );
    } finally {
      this.cleanup(tmpDir);
    }
  }

  // ── Compilation ──────────────────────────────────────────────────────────

  private compile(
    langConfig: LanguageConfig,
    srcPath: string,
    outPath: string,
    cwd: string,
    opts: RunOptions,
  ): Promise<{ success: boolean; error?: string }> {
    if (!langConfig.compileCommand) {
      return Promise.resolve({ success: true });
    }

    const { cmd, args } = langConfig.compileCommand(srcPath, outPath, cwd);
    const securedCommand = this.sandboxCommand(cmd, args, cwd, opts);

    return new Promise((resolve) => {
      const child = execFile(
        securedCommand.cmd,
        securedCommand.args,
        {
          timeout: DEFAULT_COMPILE_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
          cwd,
          env: this.getSafeEnv(),
        },
        (error, stdout, stderr) => {
          if (error) {
            const errorOutput = (
              stderr ||
              stdout ||
              error.message ||
              ''
            ).substring(0, 2000);
            // Strip absolute temp paths from error messages for security
            const sanitized = this.sanitizeCompilerOutput(errorOutput, cwd);
            resolve({ success: false, error: sanitized });
          } else {
            resolve({ success: true });
          }
        },
      );
    });
  }

  // ── Process Execution ────────────────────────────────────────────────────

  // Production uses a container per compile/run. The bind mount contains only
  // the generated submission directory; networking, capabilities, process
  // count, CPU and memory are constrained by Docker.
  private sandboxCommand(
    cmd: string,
    args: string[],
    cwd: string,
    opts: RunOptions,
  ): { cmd: string; args: string[] } {
    const sandbox = (
      process.env.JUDGE_SANDBOX ||
      (process.env.NODE_ENV === 'production' ? 'docker' : 'local')
    ).toLowerCase();

    if (process.env.NODE_ENV === 'production' && sandbox === 'local') {
      throw new Error(
        'Local sandbox execution is strictly forbidden in production (AUD-005)',
      );
    }

    if (sandbox === 'local') return { cmd, args };
    if (sandbox !== 'docker') {
      throw new Error(`Unsupported JUDGE_SANDBOX value: ${sandbox}`);
    }

    const adapter = getLanguageAdapter(opts.language);
    const image = opts.config?.sandboxImage || adapter?.sandboxImage;
    if (!image) {
      throw new Error(
        `No approved sandbox image configured for ${opts.language}`,
      );
    }
    const command = commandBasename({ cmd, args }, cwd);
    const memory = Math.max(
      32,
      Math.min(1_024, Number(opts.memoryLimit) || 256),
    );
    const cpu = Math.max(0.25, Math.min(2, Number(opts.cpuLimit) || 1));
    const dockerCmd =
      process.env.DOCKER_PATH ||
      (fs.existsSync('/usr/local/bin/docker')
        ? '/usr/local/bin/docker'
        : fs.existsSync('/opt/homebrew/bin/docker')
          ? '/opt/homebrew/bin/docker'
          : fs.existsSync('/usr/bin/docker')
            ? '/usr/bin/docker'
            : 'docker');
    return {
      cmd: dockerCmd,
      args: [
        'run',
        '--rm',
        '--user',
        '1000:1000',
        '--network',
        'none',
        '--read-only',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=64m',
        '--pids-limit',
        '64',
        '--memory',
        `${memory}m`,
        '--memory-swap',
        `${memory}m`,
        '--cpus',
        String(cpu),
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--mount',
        `type=bind,src=${cwd},dst=/workspace`,
        '--workdir',
        '/workspace',
        image,
        command.cmd,
        ...command.args,
      ],
    };
  }

  private runProcess(
    langConfig: LanguageConfig,
    srcPath: string,
    outPath: string,
    cwd: string,
    tc: TestCaseInput,
    opts: RunOptions,
  ): Promise<TestCaseResult> {
    const { cmd, args } = langConfig.runCommand(srcPath, outPath, cwd);
    const securedCommand = this.sandboxCommand(cmd, args, cwd, opts);

    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let killed = false;
      let finished = false;

      const child = spawn(securedCommand.cmd, securedCommand.args, {
        cwd,
        env: this.getSafeEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
        // A separate process group lets timeout cleanup kill descendants too.
        detached: process.platform !== 'win32',
      });

      // Set up output size limits
      let outputSize = 0;

      child.stdout.on('data', (data: Buffer) => {
        outputSize += data.length;
        if (outputSize <= MAX_OUTPUT_BYTES) {
          stdout += data.toString();
        } else if (!killed) {
          killed = true;
          this.killProcessTree(child.pid);
        }
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        if (stderr.length > MAX_OUTPUT_BYTES) {
          stderr = stderr.substring(0, MAX_OUTPUT_BYTES);
        }
      });

      // Pipe stdin
      if (tc.input) {
        try {
          child.stdin.write(tc.input);
          if (!tc.input.endsWith('\n')) {
            child.stdin.write('\n');
          }
        } catch {
          // stdin write can fail if process already exited
        }
      }
      try {
        child.stdin.end();
      } catch {
        // Ignore
      }

      // Timeout handler
      const timer = setTimeout(() => {
        if (!finished) {
          killed = true;
          this.killProcessTree(child.pid);
        }
      }, opts.timeout);

      child.on('close', (exitCode, signal) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);

        const executionTime = Date.now() - startTime;

        // Determine result
        if (killed && outputSize > MAX_OUTPUT_BYTES) {
          resolve({
            id: tc.id,
            passed: false,
            status: Status.RUNTIME_ERROR,
            output: stdout.substring(0, 500),
            expected: tc.expected,
            error: 'Output limit exceeded',
            executionTime,
          });
          return;
        }

        if (killed || signal === 'SIGKILL' || signal === 'SIGTERM') {
          resolve({
            id: tc.id,
            passed: false,
            status: Status.TIME_LIMIT_EXCEEDED,
            output: '',
            expected: tc.expected,
            error: `Time Limit Exceeded (${opts.timeout / 1000}s)`,
            executionTime,
          });
          return;
        }

        if (
          (exitCode !== 0 && exitCode !== null) ||
          (signal &&
            (signal as string) !== 'SIGKILL' &&
            (signal as string) !== 'SIGTERM')
        ) {
          // Detect specific runtime errors
          const errorMsg = this.classifyRuntimeError(stderr, exitCode, signal);
          resolve({
            id: tc.id,
            passed: false,
            status: Status.RUNTIME_ERROR,
            output: stdout.trim().substring(0, 500),
            expected: tc.expected,
            error: errorMsg,
            executionTime,
          });
          return;
        }

        // Compare output
        const actualOutput = stdout.trim();
        const passed = this.compareOutput(actualOutput, tc.expected);

        resolve({
          id: tc.id,
          passed,
          status: passed ? Status.ACCEPTED : Status.WRONG_ANSWER,
          output: actualOutput.substring(0, 5000),
          expected: tc.expected,
          executionTime,
        });
      });

      child.on('error', (err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);

        resolve({
          id: tc.id,
          passed: false,
          status: Status.SYSTEM_ERROR,
          output: '',
          expected: tc.expected,
          error: `Failed to start process: ${err.message}`,
        });
      });
    });
  }

  // ── Output Comparison ────────────────────────────────────────────────────

  /**
   * Standard competitive programming comparison:
   * 1. Trim both strings
   * 2. Compare line-by-line with trailing whitespace trimmed
   * 3. Ignore trailing empty lines
   */
  private compareOutput(actual: string, expected: string): boolean {
    if (actual === expected) return true;

    const actualLines = actual.split('\n').map((l) => l.trimEnd());
    const expectedLines = expected.split('\n').map((l) => l.trimEnd());

    // Remove trailing empty lines
    while (
      actualLines.length > 0 &&
      actualLines[actualLines.length - 1] === ''
    ) {
      actualLines.pop();
    }
    while (
      expectedLines.length > 0 &&
      expectedLines[expectedLines.length - 1] === ''
    ) {
      expectedLines.pop();
    }

    if (actualLines.length !== expectedLines.length) return false;

    for (let i = 0; i < actualLines.length; i++) {
      if (actualLines[i] !== expectedLines[i]) return false;
    }

    return true;
  }

  // ── Input/Output Normalization ───────────────────────────────────────────

  /**
   * Normalize test case input to a plain string for stdin.
   * Handles both string inputs and structured JSON inputs.
   */
  private normalizeInput(input: any, functionMode = false): string {
    if (input === null || input === undefined) return '';
    if (functionMode) {
      if (typeof input === 'string') {
        try {
          JSON.parse(input);
          return input;
        } catch {
          return JSON.stringify(input);
        }
      }
      return JSON.stringify(input);
    }
    if (typeof input === 'string') return input;

    // Structured input (e.g., { nums: [2,7,11,15], target: 9 })
    // Convert each value to a line of stdin
    if (typeof input === 'object' && !Array.isArray(input)) {
      const values = Object.values(input);
      return values
        .map((v) => {
          if (Array.isArray(v)) return v.join(' ');
          return String(v);
        })
        .join('\n');
    }

    if (Array.isArray(input)) {
      return input.map((v) => String(v)).join('\n');
    }

    return String(input);
  }

  /**
   * Normalize expected output to a plain string for comparison.
   */
  private normalizeExpected(expected: any): string {
    if (expected === null || expected === undefined) return '';
    if (typeof expected === 'string') return expected.trim();

    // JSON array or object — convert to string representation
    if (Array.isArray(expected)) {
      return JSON.stringify(expected);
    }

    if (typeof expected === 'object') {
      return JSON.stringify(expected);
    }

    return String(expected).trim();
  }

  // ── Security ─────────────────────────────────────────────────────────────

  /**
   * Returns a sanitized environment for child processes.
   * Prevents user code from accessing server secrets.
   */
  private getSafeEnv(): Record<string, string> {
    const standardPaths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
      `${process.env.HOME || ''}/.docker/bin`,
      '/Applications/Docker.app/Contents/Resources/bin',
    ].filter(Boolean);
    const existingPaths = (process.env.PATH || '').split(':').filter(Boolean);
    const combinedPath = Array.from(
      new Set([...existingPaths, ...standardPaths]),
    ).join(':');

    // Only pass PATH and essential runtime variables
    return {
      PATH: combinedPath,
      HOME: os.tmpdir(),
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      // Java needs JAVA_HOME
      ...(process.env.JAVA_HOME ? { JAVA_HOME: process.env.JAVA_HOME } : {}),
    };
  }

  // ── Process Cleanup ──────────────────────────────────────────────────────

  /**
   * Kill an entire process tree.
   */
  private killProcessTree(pid: number | undefined): void {
    if (!pid) return;
    try {
      // Try to kill the process group first
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        // Fallback to killing just the process
        process.kill(pid, 'SIGKILL');
      } catch {
        // Process already exited
      }
    }
  }

  /**
   * Classify runtime errors from stderr and exit codes.
   */
  private classifyRuntimeError(
    stderr: string,
    exitCode: number | null,
    signal: string | null,
  ): string {
    const lower = stderr.toLowerCase();

    if (signal === 'SIGSEGV' || lower.includes('segmentation fault')) {
      return 'Segmentation Fault (SIGSEGV)';
    }
    if (signal === 'SIGFPE' || lower.includes('floating point exception')) {
      return 'Floating Point Exception (SIGFPE)';
    }
    if (signal === 'SIGABRT' || lower.includes('abort')) {
      return 'Aborted (SIGABRT)';
    }
    if (
      lower.includes('out of memory') ||
      lower.includes('java.lang.outofmemoryerror')
    ) {
      return 'Memory Limit Exceeded';
    }
    if (
      lower.includes('stack overflow') ||
      lower.includes('stackoverflowerror')
    ) {
      return 'Stack Overflow';
    }
    if (
      lower.includes('exception') ||
      lower.includes('error') ||
      lower.includes('traceback')
    ) {
      // Return sanitized stderr (first 500 chars)
      return stderr.substring(0, 500);
    }

    return `Runtime Error (exit code ${exitCode})`;
  }

  /**
   * Strip absolute temp paths from compiler output for security.
   */
  private sanitizeCompilerOutput(output: string, tmpDir: string): string {
    // Replace absolute temp directory paths with relative references
    const escaped = tmpDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return output.replace(new RegExp(escaped + '/?', 'g'), '');
  }

  /**
   * Remove temporary directory and all its contents.
   */
  private cleanup(dir: string): void {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (err) {
      this.logger.warn(`Failed to cleanup temp directory ${dir}: ${err}`);
    }
  }
}
