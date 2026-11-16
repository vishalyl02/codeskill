const DEFAULT_IGNORE_KEYS = new Set([
  'id',
  '_id',
  'mongoid',
  'createdat',
  'updatedat',
  'lastactive',
  'tokenversion',
  'password',
  'token',
  'refreshtoken',
  'accesstoken',
  'mfasecret',
  'secret',
  'hash',
]);

const MAX_STRING_DIFF_LENGTH = 300;

export interface FieldDiff {
  from: any;
  to: any;
  truncated?: boolean;
}

/**
 * Truncates overly large text values (e.g. 5,000-character problem statements or HTML)
 * to prevent partition bloating, while keeping exact scalars (passing marks, time limits).
 */
function truncateValue(val: any): any {
  if (typeof val === 'string' && val.length > MAX_STRING_DIFF_LENGTH) {
    const extra = val.length - MAX_STRING_DIFF_LENGTH;
    return `${val.slice(0, MAX_STRING_DIFF_LENGTH)}... [truncated, +${extra} chars]`;
  }
  return val;
}

/**
 * Deep, clean before/after state diff calculator.
 * - Caps long text fields at 300 characters
 * - Strips sensitive / internal fields
 * - Accurately compares scalars, arrays, and objects
 */
export function calculateStateDiff(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
  customIgnoreKeys: string[] = [],
): Record<string, FieldDiff> {
  const diffs: Record<string, FieldDiff> = {};
  if (!before && !after) return diffs;

  const b = before || {};
  const a = after || {};

  const ignoreSet = new Set([
    ...Array.from(DEFAULT_IGNORE_KEYS),
    ...customIgnoreKeys.map((k) => k.toLowerCase().replace(/[-_]/g, '')),
  ]);

  const allKeys = new Set([...Object.keys(b), ...Object.keys(a)]);

  for (const key of allKeys) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
    if (ignoreSet.has(normalizedKey)) {
      continue;
    }

    const valBefore = b[key];
    const valAfter = a[key];

    // Check equality
    const isBeforeEmpty = valBefore === undefined || valBefore === null;
    const isAfterEmpty = valAfter === undefined || valAfter === null;

    if (isBeforeEmpty && isAfterEmpty) {
      continue;
    }

    const strBefore = JSON.stringify(valBefore);
    const strAfter = JSON.stringify(valAfter);

    if (strBefore !== strAfter) {
      const truncatedBefore = truncateValue(valBefore);
      const truncatedAfter = truncateValue(valAfter);

      diffs[key] = {
        from: truncatedBefore,
        to: truncatedAfter,
        truncated:
          (typeof valBefore === 'string' && valBefore.length > MAX_STRING_DIFF_LENGTH) ||
          (typeof valAfter === 'string' && valAfter.length > MAX_STRING_DIFF_LENGTH),
      };
    }
  }

  return diffs;
}
