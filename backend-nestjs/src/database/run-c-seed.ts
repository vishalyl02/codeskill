import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AdminLearningService } from '../learning/services/admin-learning.service';
import { seedCProgrammingCurriculum } from '../learning/services/c-programming-curriculum.seed';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  console.log('🚀 Running C Programming Fundamentals Curriculum Seeder...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const adminService = app.get(AdminLearningService);
  const logger = new Logger('CSeedRunner');

  try {
    await seedCProgrammingCurriculum(adminService, logger);
    console.log('✅ C Programming course & learning path successfully seeded!');
  } catch (error: any) {
    console.error('❌ C seed failed:', error?.message || error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  bootstrap();
}
