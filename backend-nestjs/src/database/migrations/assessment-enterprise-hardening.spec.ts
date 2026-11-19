import { applyAssessmentEnterpriseHardeningMigration } from './assessment-enterprise-hardening';
import { MigrationQueryRunner } from './declarative-partitioning';

describe('applyAssessmentEnterpriseHardeningMigration', () => {
  it('should execute the ALTER TABLE statement with enterprise hardening columns', async () => {
    const querySpy = jest.fn().mockResolvedValue(undefined);
    const mockQueryRunner = {
      query: querySpy,
    } as unknown as MigrationQueryRunner;

    await applyAssessmentEnterpriseHardeningMigration(mockQueryRunner);

    expect(querySpy).toHaveBeenCalledTimes(1);
    const sql = querySpy.mock.calls[0][0];
    expect(sql).toContain('requireCloseOtherApps');
    expect(sql).toContain('allowSpellCheck');
    expect(sql).toContain('allowFindOnPage');
    expect(sql).toContain('allowedUrlPatterns');
    expect(sql).toContain('enableScreenCaptureSnapshots');
  });
});
