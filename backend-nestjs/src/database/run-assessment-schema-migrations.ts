import { applyPlacementsMigration } from './migrations/placements';
import { DataSource } from 'typeorm';
import { practiceSubmissionMigrationOptions } from './run-practice-submission-source';
import { applyContestSecurityReattemptMigration } from './migrations/contest-security-reattempt';
import { applyAssessmentAudienceTargetingMigration } from './migrations/assessment-audience-targeting';
import { applyAssessmentProctorCapturesMigration } from './migrations/assessment-proctor-captures';
import { applyAssessmentProctoringModesMigration } from './migrations/assessment-proctoring-modes';
import { applyAssessmentResumeLimitMigration } from './migrations/assessment-resume-limit';
import { applyLearningModuleMigration } from './migrations/learning-module';
import { applyFacultyAssignmentsMigration } from './migrations/faculty-assignments';
import { applyAssessmentVdiOverrideMigration } from './migrations/assessment-vdi-override';
import { applyContestSubmissionScopeMigration, migrateContestSubmissionShards } from './migrations/contest-submission-scope';
import { parseSubmissionShardingConfig } from './sharding/sharding.config';
import { readShardingState, validateShardingState } from './sharding/sharding-state';
import { applyAssessmentSequentialSectionsMigration } from './migrations/assessment-sequential-sections';

/** Idempotent schema additions applied on every container rollout before starting the API. */
export async function runAssessmentSchemaMigrations(): Promise<void> {
  const sharding = parseSubmissionShardingConfig();
  const source = new DataSource(practiceSubmissionMigrationOptions());
  try {
    await source.initialize();
    const runner = source.createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      try {
        // Share the rollout lock with the existing migration runner.
        await runner.query('SELECT pg_advisory_xact_lock(1902230159)');
        validateShardingState(sharding, await readShardingState(runner));
        await applyPlacementsMigration(runner);
        await applyContestSecurityReattemptMigration(runner);
        await applyAssessmentAudienceTargetingMigration(runner);
        await applyAssessmentProctorCapturesMigration(runner);
        await applyAssessmentProctoringModesMigration(runner);
        await applyAssessmentResumeLimitMigration(runner);
        await applyAssessmentSequentialSectionsMigration(runner);
        await applyLearningModuleMigration(runner);
        await applyFacultyAssignmentsMigration(runner);
        await applyAssessmentVdiOverrideMigration(runner);
        if (!sharding) await applyContestSubmissionScopeMigration(runner);
        await runner.commitTransaction();
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      }
    } finally {
      await runner.release();
    }
  } finally {
    if (source.isInitialized) await source.destroy();
  }
  if (sharding) await migrateContestSubmissionShards(sharding);
}

if (require.main === module) {
  void runAssessmentSchemaMigrations().then(() => {
    console.log('Assessment schema migrations completed.');
  }).catch((error: unknown) => {
    console.error('Assessment schema migrations failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
