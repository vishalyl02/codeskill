import { applyCandidateExamAccommodationsMigration } from './candidate-exam-accommodations';

describe('applyCandidateExamAccommodationsMigration', () => {
  it('executes idempotent DDL for candidate_exam_accommodations table and indexes', async () => {
    const mockQueryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await applyCandidateExamAccommodationsMigration(mockQueryRunner as any);

    expect(mockQueryRunner.query).toHaveBeenCalledTimes(1);
    const sql = mockQueryRunner.query.mock.calls[0][0];
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "candidate_exam_accommodations"');
    expect(sql).toContain('"time_multiplier" float NOT NULL DEFAULT 1.0');
    expect(sql).toContain('"extra_minutes_flat" float NOT NULL DEFAULT 0');
    expect(sql).toContain('"configured_by_role" varchar(50)');
    expect(sql).toContain('"secondary_display_allowed" boolean NOT NULL DEFAULT false');
    expect(sql).toContain('UQ_candidate_exam_accommodations_assessment_user');
  });
});
