import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { practiceSubmissionMigrationOptions } from './run-practice-submission-source';
import { migrateSubmissionShards } from './sharding/migrate-submission-shards';
import { parseSubmissionShardingConfig } from './sharding/sharding.config';

async function main() {
  const config = parseSubmissionShardingConfig();
  if (!config)
    throw new Error('Configure SUBMISSION_SHARDS before running the migration');
  if (
    !process.argv.includes('--apply') ||
    !process.argv.includes('--writers-stopped')
  ) {
    console.log(
      'Offline migration: stop all API/judge writers and back up the primary database.',
    );
    console.log(
      'Then run: npm run db:shards:migrate -- --apply --writers-stopped',
    );
    return;
  }
  const primary = new DataSource(practiceSubmissionMigrationOptions());
  try {
    await primary.initialize();
    const result = await migrateSubmissionShards(primary, config, true);
    console.log(JSON.stringify(result));
  } finally {
    if (primary.isInitialized) await primary.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    // Never print driver details or configuration objects containing credentials.
    console.error(
      error instanceof Error && error.constructor === Error
        ? error.message
        : 'Submission sharding migration failed; check the database schema and connectivity.',
    );
    process.exitCode = 1;
  });
}
