import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

async function bootstrapWorker() {
  if (process.env.PROCESS_ROLE !== 'judge') {
    throw new Error('The judge worker must start with PROCESS_ROLE=judge');
  }

  const logger = WinstonModule.createLogger({
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.ms(),
          winston.format.errors({ stack: true }),
          winston.format.json(),
        ),
      }),
    ],
  });

  const app = await NestFactory.createApplicationContext(AppModule, { logger });
  app.enableShutdownHooks();
  Logger.log('CodeSkill judge worker is ready', 'JudgeWorker');
}

bootstrapWorker().catch((error) => {
  Logger.error(error, 'JudgeWorker');
  process.exitCode = 1;
});
