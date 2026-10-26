import { normalizeVerdict, type ExecutionFeedbackResult } from "./submission-feedback";

export const normalizePracticeOutput = (text: string) => text.replace(/\r\n/g, "\n").split("\n").map(line => line.trimEnd()).join("\n").trim();

/** Display-only comparisons for user inputs. Never used to grade a submission. */
export function withCustomExpectations(result: ExecutionFeedbackResult, cases: readonly { expected: string }[]): ExecutionFeedbackResult {
  if (!result.results.length) return result;
  const results = result.results.map((test, index) => {
    const expected = cases[index]?.expected ?? "";
    const status = normalizeVerdict(test.status ?? "accepted");
    const executionError = Boolean(test.error || test.stderr) || !["accepted", "wrong_answer"].includes(status);
    if (executionError) return { ...test, passed: false, status: ["accepted", "wrong_answer"].includes(status) ? "runtime_error" : status };
    const passed = !expected.trim() || normalizePracticeOutput(test.output ?? test.stdout ?? "") === normalizePracticeOutput(expected);
    return { ...test, expected, passed, status: passed ? "accepted" : "wrong_answer" };
  });
  const failed = results.find(test => !test.passed);
  return {
    ...result, results,
    status: failed ? failed.status || result.status : results.length === cases.length ? "accepted" : "error",
    passedCount: results.filter(test => test.passed).length, totalCount: cases.length,
    message: "Custom expectations are checked for this run only. A blank expectation checks execution without comparing output.",
  };
}
