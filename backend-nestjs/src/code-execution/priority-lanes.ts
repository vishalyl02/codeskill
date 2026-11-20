export const ExecutionPriority = {
  INTERACTIVE_SAMPLE: 1, // High Priority (RUN_SAMPLE_TESTS)
  FINAL_SUBMISSION: 5,   // Standard Priority (FINAL_SUBMISSION_GRADE)
} as const;

export const ExecutionJobType = {
  RUN_SAMPLE_TESTS: 'RUN_SAMPLE_TESTS',
  FINAL_SUBMISSION_GRADE: 'FINAL_SUBMISSION_GRADE',
} as const;

export type ExecutionPriorityType =
  (typeof ExecutionPriority)[keyof typeof ExecutionPriority];
export type ExecutionJobTypeValue =
  (typeof ExecutionJobType)[keyof typeof ExecutionJobType];
