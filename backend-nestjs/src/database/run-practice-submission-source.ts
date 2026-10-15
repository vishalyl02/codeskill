import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource, DataSourceOptions } from 'typeorm';
import { databaseConfig } from '../config';
import { applyPracticeSubmissionSourceMigration } from './migrations/practice-submission-source';
import { applyAuthTokensSchemaMigration } from './migrations/auth-tokens-schema';
import { applyDeclarativePartitioningMigration } from './migrations/declarative-partitioning';
import { readShardingState } from './sharding/sharding-state';
import { parseSubmissionShardingConfig } from './sharding/sharding.config';
import { validateShardingState } from './sharding/sharding-state';
import { applyContestSecurityReattemptMigration } from './migrations/contest-security-reattempt';
import { applyAssessmentAudienceTargetingMigration } from './migrations/assessment-audience-targeting';

export function practiceSubmissionMigrationOptions(): DataSourceOptions {
  const postgres = databaseConfig().postgres;
  const common = {
    type: 'postgres' as const,
    synchronize: false,
    logging: false,
  };

  if (postgres.url) {
    return { ...common, url: postgres.url };
  }

  return {
    ...common,
    host: postgres.host,
    port: postgres.port,
    username: postgres.username,
    password: postgres.password,
    database: postgres.database,
    ssl: postgres.ssl ? { rejectUnauthorized: false } : false,
  };
}

export async function runPracticeSubmissionSourceMigration(): Promise<void> {
  const dataSource = new DataSource(practiceSubmissionMigrationOptions());

  try {
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const sharding = await readShardingState(queryRunner);
        if (sharding)
          validateShardingState(parseSubmissionShardingConfig(), sharding);
        if (!sharding)
          await applyPracticeSubmissionSourceMigration(queryRunner);
        await applyAuthTokensSchemaMigration(queryRunner);
        await applyDeclarativePartitioningMigration(queryRunner, {
          skipSubmissions: !!sharding,
        });
        await applyContestSecurityReattemptMigration(queryRunner);
        await applyAssessmentAudienceTargetingMigration(queryRunner);
        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

if (require.main === module) {
  void runPracticeSubmissionSourceMigration()
    .then(() => {
      console.log('Practice submission source migration completed.');
    })
    .catch((error) => {
      console.error(
        'Practice submission source migration failed:',
        error instanceof Error ? error.message : error,
      );
      process.exitCode = 1;
    });
}

