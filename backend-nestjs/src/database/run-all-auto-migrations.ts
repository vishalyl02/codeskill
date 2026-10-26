import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseAutoMigrationService } from './database-auto-migration.service';

async function bootstrap() {
  console.log('🚀 Running CodeSkill Full Database Migration & Auto-Seeding Suite...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const migrationService = app.get(DatabaseAutoMigrationService);

  try {
    await migrationService.runAllMigrations();
    await migrationService.runAutoSeeding();
    console.log('✅ All migrations and auto-seeding completed successfully.');
  } catch (error: any) {
    console.error('❌ Migration failed:', error?.message || error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  bootstrap();
}
