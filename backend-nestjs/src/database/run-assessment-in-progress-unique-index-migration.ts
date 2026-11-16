import { DataSource } from 'typeorm';
import { practiceSubmissionMigrationOptions } from './run-practice-submission-source';
import { applyAssessmentInProgressUniqueIndexMigration } from './migrations/assessment-in-progress-unique-index';

export async function runAssessmentInProgressUniqueIndexMigration(): Promise<void> {
  const source = new DataSource(practiceSubmissionMigrationOptions());
  try {
    await source.initialize();
    const runner = source.createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      try {
        await runner.query('SELECT pg_advisory_xact_lock(1902230159)');
        await applyAssessmentInProgressUniqueIndexMigration(runner);
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
}

if (require.main === module) {
  void runAssessmentInProgressUniqueIndexMigration().then(() => {
    console.log('Assessment in_progress unique index migration completed.');
  }).catch((error: unknown) => {
    console.error('Assessment in_progress unique index migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
