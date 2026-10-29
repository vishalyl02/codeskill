import { S3Module } from './s3/s3.module';
import { ReportsModule } from './reports/reports.module';
import { PetModule } from './pet/pet.module';
import { Cluster } from 'ioredis';
import { AnalyticsModule } from './analytics/analytics.module';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { SmartThrottlerGuard } from './common/guards/smart-throttler.guard';
import { ThrottlerRedisStorageService } from './redis/throttler-redis-storage.service';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import {
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  awsConfig,
  oauthConfig,
  adminConfig,
} from './config';

import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { EmailModule } from './emails/email.module';
import { AuthModule } from './auth/auth.module';
import { ProblemsModule } from './problems/problems.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { ExecutionModule } from './execution/execution.module';
import { UsersModule } from './users/users.module';
import { ContestsModule } from './contests/contests.module';
import { AdminModule } from './admin/admin.module';
import { CompaniesModule } from './companies/companies.module';
import { CampusModule } from './campus/campus.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';
import { DiscussionsModule } from './discussions/discussions.module';
import { StudentsModule } from './students/students.module';
import { QuestionsModule } from './questions/questions.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ExamSecurityModule } from './exam-security/exam-security.module';
import { ObservabilityModule } from './observability/observability.module';
import { BugsModule } from './bugs/bugs.module';
import { LearningModule } from './learning/learning.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        redisConfig,
        jwtConfig,
        awsConfig,
        oauthConfig,
        adminConfig,
      ],
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: false,
    }),
    DatabaseModule,
    EmailModule,
    RedisModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const isCluster =
          process.env.REDIS_CLUSTER_MODE === 'true' ||
          process.env.REDIS_ENABLE_CLUSTER === 'true';
        const host = configService.get<string>('redis.host') || '127.0.0.1';
        const port = Number(configService.get<number>('redis.port')) || 6379;
        const password = configService.get<string>('redis.password') || undefined;
        const useTls = process.env.REDIS_TLS === 'true';

        if (isCluster) {
          const clusterHosts = process.env.REDIS_CLUSTER_NODES
            ? process.env.REDIS_CLUSTER_NODES.split(',').map((node) => {
                const [h, p] = node.trim().split(':');
                return { host: h, port: parseInt(p, 10) || 6379 };
              })
            : [{ host, port }];

          return {
            prefix: '{bull}',
            connection: new Cluster(clusterHosts, {
              redisOptions: {
                password,
                tls: useTls ? {} : undefined,
              },
            }) as any,
          };
        }

        return {
          prefix: '{bull}',
          connection: {
            host,
            port,
            password,
            tls: useTls ? {} : undefined,
            maxRetriesPerRequest: null,
            connectTimeout: 5000,
          },
        };
      },
      inject: [ConfigService],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    AuthModule,
    ProblemsModule,
    SubmissionsModule,
    ExecutionModule,
    UsersModule,
    ContestsModule,
    AdminModule,
    CompaniesModule,
    CampusModule,
    GatewayModule,
    HealthModule,
    DiscussionsModule,
    S3Module,
    StudentsModule,
    QuestionsModule,
    AssessmentsModule,
    ExamSecurityModule,
    ObservabilityModule,
    AnalyticsModule,
    ReportsModule,
    BugsModule,
    PetModule,
    LearningModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, RedisModule],
      inject: [ThrottlerRedisStorageService],
      useFactory: (storage: ThrottlerRedisStorageService) => ({
        throttlers: [
          {
            name: 'short',
            ttl: 1000,
            limit: 30, // 30 req/sec burst per identity
          },
          {
            name: 'medium',
            ttl: 10000,
            limit: 150, // 150 req/10s per identity
          },
          {
            name: 'long',
            ttl: 60000,
            limit: 600, // 600 req/min per identity
          },
        ],
        storage,
      }),
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: SmartThrottlerGuard,
    },

    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
