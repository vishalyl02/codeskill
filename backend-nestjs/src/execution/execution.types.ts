export const Status = {
  ACCEPTED: 'accepted',
  WRONG_ANSWER: 'wrong_answer',
  COMPILATION_ERROR: 'compile_error',
  RUNTIME_ERROR: 'runtime_error',
  TIME_LIMIT_EXCEEDED: 'time_limit',
  MEMORY_LIMIT_EXCEEDED: 'memory_limit',
  SYSTEM_ERROR: 'system_error',
} as const;

export type ExecutionStatus = (typeof Status)[keyof typeof Status];

export type ExecutionMode = 'standard' | 'function';

export interface FunctionParameter {
  name: string;
  /** Problem-language-neutral type, e.g. `int`, `string`, `int[]`, `vector<int>`. */
  type: string;
}

export interface FunctionSignature {
  className?: string;
  functionName: string;
  returnType?: string;
  parameters?: FunctionParameter[];
}

export interface ExecutionConfig {
  /** Milliseconds. Values are bounded by the judge before use. */
  timeLimit?: number;
  /** MiB. Bounded and enforced by the selected judge sandbox. */
  memoryLimit?: number;
  cpuLimit?: number;
  executionMode?: ExecutionMode;
  functionSignature?: FunctionSignature;
  /** Set only for problems whose output whitespace is significant. */
  exactOutput?: boolean;
  trimTrailingWhitespace?: boolean;
  floatTolerance?: number;
  floatRelativeTolerance?: number;
  /** Per-problem image override for a pre-approved judge image. */
  sandboxImage?: string;
  executionProfiles?: Record<string, { timeLimitMultiplier?: number }>;
}

export interface TestCaseInput {
  id: number | string;
  input: string;
  expected: string;
}

export interface TestCaseResult {
  id: number | string;
  passed: boolean;
  status: ExecutionStatus | string;
  output: string;
  expected: string;
  error?: string;
  executionTime?: number;
  memoryUsed?: number;
}

export const SUPPORTED_LANGUAGES = [
  'c',
  'cpp',
  'c++',
  'java',
  'python',
  'python3',
  'py',
  'javascript',
  'js',
  'node',
  'typescript',
  'ts',
] as const;

export function canonicalLanguage(
  language: string,
): 'c' | 'cpp' | 'java' | 'python' | 'javascript' | 'typescript' | undefined {
  switch (language.toLowerCase()) {
    case 'c':
      return 'c';
    case 'cpp':
    case 'c++':
      return 'cpp';
    case 'java':
      return 'java';
    case 'python':
    case 'python3':
    case 'py':
      return 'python';
    case 'javascript':
    case 'js':
    case 'node':
      return 'javascript';
    case 'typescript':
    case 'ts':
      return 'typescript';
    default:
      return undefined;
  }
}
