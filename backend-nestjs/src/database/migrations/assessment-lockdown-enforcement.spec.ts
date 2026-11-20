import { applyAssessmentLockdownEnforcementMigration } from './assessment-lockdown-enforcement';

describe('applyAssessmentLockdownEnforcementMigration', () => {
  it('adds requireLockdown column to assessments table idempotently', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await applyAssessmentLockdownEnforcementMigration({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE "assessments"'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ADD COLUMN IF NOT EXISTS "requireLockdown" boolean NOT NULL DEFAULT false'),
    );
  });
});
