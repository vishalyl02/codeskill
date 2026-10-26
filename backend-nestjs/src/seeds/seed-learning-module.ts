import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { LearningAutoSeedService } from '../learning/services/learning-auto-seed.service';

async function bootstrap() {
  console.log('🚀 Seeding CodeSkill Rich Learning Platform Curriculum & Dummy Data...');
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const autoSeedService = app.get(LearningAutoSeedService);
    await autoSeedService.seedCurriculumIfNotExist();
    console.log('\n🎉 Comprehensive Curriculum & Dummy Data Seeding Complete!');
  } catch (err: any) {
    console.error(`\n❌ Error during curriculum seeding:`, err);
    process.exit(1);
  } finally {
    await app.close();
  }

  process.exit(0);
}

void bootstrap();
