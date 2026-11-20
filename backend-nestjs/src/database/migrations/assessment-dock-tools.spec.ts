import { applyAssessmentDockToolsMigration } from './assessment-dock-tools';
import { MigrationQueryRunner } from './declarative-partitioning';

describe('Assessment Dock Tools Migration', () => {
  it('should execute idempotent ALTER TABLE query for lockdown dock tools', async () => {
    const executedSql: string[] = [];
    const mockQueryRunner: MigrationQueryRunner = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        executedSql.push(sql);
        return [];
      }),
      release: jest.fn().mockResolvedValue(undefined),
    };

    await applyAssessmentDockToolsMigration(mockQueryRunner);

    expect(mockQueryRunner.query).toHaveBeenCalledTimes(1);
    const sql = executedSql[0];
    expect(sql).toContain('ALTER TABLE "assessments"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "lockdownQuitPassword" text NULL');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "allowCalculators" boolean NOT NULL DEFAULT false');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "allowScratchpad" boolean NOT NULL DEFAULT true');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "allowReferenceDoc" boolean NOT NULL DEFAULT false');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "referencePdfUrl" text NULL');
  });
});
