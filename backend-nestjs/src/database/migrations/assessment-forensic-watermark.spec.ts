import { applyAssessmentForensicWatermarkMigration } from './assessment-forensic-watermark';

describe('applyAssessmentForensicWatermarkMigration', () => {
  it('executes idempotent ALTER TABLE to add enableForensicWatermark column', async () => {
    const mockQueryRunner = {
      query: jest.fn().mockResolvedValue([]),
    };

    await applyAssessmentForensicWatermarkMigration(mockQueryRunner as any);

    expect(mockQueryRunner.query).toHaveBeenCalledTimes(1);
    const sql = mockQueryRunner.query.mock.calls[0][0];
    expect(sql).toContain('ALTER TABLE "assessments"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "enableForensicWatermark" boolean NOT NULL DEFAULT false');
  });
});
