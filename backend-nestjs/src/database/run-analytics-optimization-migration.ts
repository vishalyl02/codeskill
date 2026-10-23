import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { practiceSubmissionMigrationOptions } from './run-practice-submission-source';
import { applyAnalyticsOptimizationIndexesMigration } from './migrations/analytics-optimization-indexes';

async function run(): Promise<void> {
  const dataSource = new DataSource(practiceSubmissionMigrationOptions());
  try {
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        await applyAnalyticsOptimizationIndexesMigration(queryRunner);
        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

void run()
  .then(() => console.log('Analytics optimization indexes migration completed successfully.'))
  .catch((error) => {
    console.error(
      'Analytics optimization indexes migration failed:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });
