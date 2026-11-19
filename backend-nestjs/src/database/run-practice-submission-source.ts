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
import { applyAssessmentProctorCapturesMigration } from './migrations/assessment-proctor-captures';
import { applyAssessmentProctoringModesMigration } from './migrations/assessment-proctoring-modes';
import { applyAssessmentResumeLimitMigration } from './migrations/assessment-resume-limit';
import { applyBugReportsMigration } from './migrations/bug-reports';
import { applyLearningModuleMigration } from './migrations/learning-module';
import { applyProblemConfigDefaultLanguageMigration } from './migrations/problem-config-default-language';
import { applyAnalyticsOptimizationIndexesMigration } from './migrations/analytics-optimization-indexes';
import { applyQuestionHideMainMethodMigration } from './migrations/question-hide-main-method';
import { applyAssessmentSequentialSectionsMigration } from './migrations/assessment-sequential-sections';
import { applyContestSubmissionScopeMigration } from './migrations/contest-submission-scope';

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
    ssl: postgres.ssl ? { rejectUnauthorized: true } : false,
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
        // Serialize schema changes when an ASG starts several instances at once.
        await queryRunner.query('SELECT pg_advisory_xact_lock(1902230159)');
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
        await applyAssessmentProctorCapturesMigration(queryRunner);
        await applyAssessmentProctoringModesMigration(queryRunner);
        await applyAssessmentResumeLimitMigration(queryRunner);
        await applyBugReportsMigration(queryRunner);
        await applyLearningModuleMigration(queryRunner);
        await applyProblemConfigDefaultLanguageMigration(queryRunner);
        await applyAnalyticsOptimizationIndexesMigration(queryRunner);
        await applyQuestionHideMainMethodMigration(queryRunner);
        await applyAssessmentSequentialSectionsMigration(queryRunner);
        if (!sharding) await applyContestSubmissionScopeMigration(queryRunner);
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

  // A partially completed deployment is safe to retry: each shard change is idempotent.
  const sharding = parseSubmissionShardingConfig();
  if (sharding) {
    for (const shard of sharding.shards) {
      const source = new DataSource({
        type: 'postgres', url: shard.url, synchronize: false, logging: false,
        ssl: shard.ssl ? { rejectUnauthorized: true } : false,
      });
      try {
        await source.initialize();
        await source.transaction(async (manager) => {
          await manager.query('SELECT pg_advisory_xact_lock(1902230159)');
          await applyContestSubmissionScopeMigration(manager);
        });
      } finally {
        if (source.isInitialized) await source.destroy();
      }
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

