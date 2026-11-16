import { applyAssessmentInProgressUniqueIndexMigration } from './assessment-in-progress-unique-index';

describe('applyAssessmentInProgressUniqueIndexMigration (AUD-CON-008)', () => {
  it('deduplicates legacy in_progress attempts and creates partial unique index', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await applyAssessmentInProgressUniqueIndexMigration({ query });

    expect(query).toHaveBeenCalledTimes(2);
    // Step 1: Deduplication query
    expect(query.mock.calls[0][0]).toContain('DELETE FROM "assessment_attempts" a');
    expect(query.mock.calls[0][0]).toContain('WHERE a.status = \'in_progress\'');
    // Step 2: Partial unique index
    expect(query.mock.calls[1][0]).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_in_progress_assessment_attempt"');
    expect(query.mock.calls[1][0]).toContain('ON "assessment_attempts" ("assessment_id", "student_id")');
    expect(query.mock.calls[1][0]).toContain('WHERE "status" = \'in_progress\'');
  });
});
