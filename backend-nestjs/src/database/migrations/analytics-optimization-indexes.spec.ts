import { applyAnalyticsOptimizationIndexesMigration } from './analytics-optimization-indexes';

describe('analytics optimization indexes migration', () => {
  it('creates the composite and time-series indexes idempotently', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await applyAnalyticsOptimizationIndexesMigration({ query });

    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('IDX_assessment_attempts_startedAt');
    expect(sql).toContain('IDX_assessment_attempts_submittedAt');
    expect(sql).toContain('IDX_assessment_attempts_status');
    expect(sql).toContain('IDX_assessment_attempts_asmt_status');
    expect(sql).toContain('IDX_submissions_created_status');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS');
  });
});
