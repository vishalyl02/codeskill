export interface ComparisonPolicy {
  exactOutput?: boolean;
  trimTrailingWhitespace?: boolean;
  floatTolerance?: number;
  floatRelativeTolerance?: number;
}
export function compareOutput(
  actual: string,
  expected: string,
  policy: ComparisonPolicy = {},
): boolean {
  if (policy.exactOutput) return actual === expected;
  const normalize = (value: string) => {
    if (policy.trimTrailingWhitespace === false) return value;
    return value
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[\t ]+$/, ''))
      .join('\n')
      .replace(/\n+$/, '');
  };
  actual = normalize(actual);
  expected = normalize(expected);
  if (actual === expected) return true;
  if (!Number.isFinite(policy.floatTolerance) || policy.floatTolerance! < 0)
    return false;
  // Preserve separators and nonnumeric tokens: tolerance does not waive whitespace policy.
  const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const left = actual.split(/(\s+)/),
    right = expected.split(/(\s+)/);
  if (left.length !== right.length) return false;
  return left.every((token, index) => {
    const target = right[index];
    if (token === target) return true;
    if (!number.test(token) || !number.test(target)) return false;
    const a = Number(token),
      b = Number(target);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    const relative = Number.isFinite(policy.floatRelativeTolerance)
      ? Math.max(0, policy.floatRelativeTolerance!)
      : 0;
    return (
      Math.abs(a - b) <=
      Math.max(policy.floatTolerance!, relative * Math.abs(b))
    );
  });
}
