import { applyAssessmentVdiOverrideMigration } from './assessment-vdi-override';

describe('applyAssessmentVdiOverrideMigration', () => {
  it('adds allowVirtualMachine column to assessments table idempotently', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await applyAssessmentVdiOverrideMigration({ query });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE "assessments"'),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ADD COLUMN IF NOT EXISTS "allowVirtualMachine" boolean NOT NULL DEFAULT false'),
    );
  });
});
