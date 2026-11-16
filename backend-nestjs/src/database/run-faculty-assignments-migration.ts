import { DataSource } from 'typeorm';
import { practiceSubmissionMigrationOptions } from './run-practice-submission-source';
import { applyFacultyAssignmentsMigration } from './migrations/faculty-assignments';

export async function runFacultyAssignmentsMigration(): Promise<void> {
  const source = new DataSource(practiceSubmissionMigrationOptions());
  try {
    await source.initialize();
    const runner = source.createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      try {
        await runner.query('SELECT pg_advisory_xact_lock(1902230159)');
        await applyFacultyAssignmentsMigration(runner);
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
  void runFacultyAssignmentsMigration().then(() => {
    console.log('Faculty assignments migration completed.');
  }).catch((error: unknown) => {
    console.error('Faculty assignments migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
