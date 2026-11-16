import { calculateStateDiff } from './object-diff.util';

describe('calculateStateDiff', () => {
  it('should compute scalar field changes correctly', () => {
    const before = { passingMarks: 40, durationMinutes: 60, title: 'DSA Exam' };
    const after = { passingMarks: 35, durationMinutes: 90, title: 'DSA Exam' };

    const diff = calculateStateDiff(before, after);
    expect(diff.passingMarks).toEqual({ from: 40, to: 35, truncated: false });
    expect(diff.durationMinutes).toEqual({ from: 60, to: 90, truncated: false });
    expect(diff.title).toBeUndefined(); // unchanged
  });

  it('should ignore sensitive fields like password, token, secret', () => {
    const before = { password: 'old-hash', token: 'old-tok', status: 'ACTIVE' };
    const after = { password: 'new-hash', token: 'new-tok', status: 'INACTIVE' };

    const diff = calculateStateDiff(before, after);
    expect(diff.password).toBeUndefined();
    expect(diff.token).toBeUndefined();
    expect(diff.status).toEqual({ from: 'ACTIVE', to: 'INACTIVE', truncated: false });
  });

  it('should truncate strings exceeding 300 characters to avoid partition bloat', () => {
    const longText1 = 'A'.repeat(500);
    const longText2 = 'B'.repeat(600);

    const before = { statement: longText1 };
    const after = { statement: longText2 };

    const diff = calculateStateDiff(before, after);
    expect(diff.statement.truncated).toBe(true);
    expect(diff.statement.from).toContain('... [truncated, +200 chars]');
    expect(diff.statement.to).toContain('... [truncated, +300 chars]');
    expect(diff.statement.from.length).toBeLessThan(350);
  });
});
