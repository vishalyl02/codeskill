import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { practiceSubmissionMigrationOptions } from './run-practice-submission-source';
import { applyLearningModuleMigration } from './migrations/learning-module';

export async function runLearningModuleMigration(): Promise<void> {
  const dataSource = new DataSource(practiceSubmissionMigrationOptions());
  try {
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        await applyLearningModuleMigration(queryRunner);
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

if (require.main === module) {
  void runLearningModuleMigration()
    .then(() => console.log('Learning module migration completed successfully.'))
    .catch((error) => {
      console.error(
        'Learning module migration failed:',
        error instanceof Error ? error.message : error,
      );
      process.exitCode = 1;
    });
}
