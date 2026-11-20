import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis, Cluster } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis | Cluster;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('redis.url');
    const options: any = {
      host: this.configService.get<string>('redis.host') || '127.0.0.1',
      port: this.configService.get<number>('redis.port') || 6379,
      password: this.configService.get<string>('redis.password'),
      enableOfflineQueue: false,
      connectTimeout: 2000,
      commandTimeout: 1000,
      maxRetriesPerRequest: 1,
      retryStrategy(times: number) {
        // Continuous exponential backoff with jitter, capped at 3000ms. Never return null to avoid permanent client death (ISSUE-RES-001).
        const jitter = Math.floor(Math.random() * 200);
        const delay = Math.min(Math.pow(2, Math.min(times, 8)) * 50 + jitter, 3000);
        return delay;
      },
    };

    const isCluster =
      process.env.REDIS_CLUSTER_MODE === 'true' ||
      process.env.REDIS_ENABLE_CLUSTER === 'true';

    const useTls =
      process.env.REDIS_TLS === 'true' ||
      Boolean(url && url.startsWith('rediss://'));

    if (useTls) {
      options.tls = {};
    }

    if (isCluster) {
      const clusterHosts = process.env.REDIS_CLUSTER_NODES
        ? process.env.REDIS_CLUSTER_NODES.split(',').map((node) => {
            const [h, p] = node.trim().split(':');
            return { host: h, port: parseInt(p, 10) || 6379 };
          })
        : [{ host: options.host, port: options.port }];

      this.client = new Redis.Cluster(clusterHosts, {
        enableOfflineQueue: false,
        redisOptions: {
          password: options.password || undefined,
          tls: useTls ? {} : undefined,
          maxRetriesPerRequest: 1,
        },
        clusterRetryStrategy(times: number) {
          const jitter = Math.floor(Math.random() * 200);
          return Math.min(Math.pow(2, Math.min(times, 8)) * 50 + jitter, 3000);
        },
      });
    } else if (url) {
      this.client = new Redis(url, options);
    } else {
      this.client = new Redis(options);
    }

    this.client.on('connect', () =>
      this.logger.log('Redis successfully connected'),
    );
    this.client.on('error', (err: any) => {
      if (err.code !== 'ECONNREFUSED') {
        this.logger.warn(`Redis notice: ${err.message}`);
      }
    });
  }

  getClient(): Redis | Cluster {
    return this.client;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      const stringValue =
        typeof value === 'string' ? value : JSON.stringify(value);
      if (ttlSeconds) {
        await Promise.race([
          this.client.set(key, stringValue, 'EX', ttlSeconds),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 500),
          ),
        ]);
      } else {
        await Promise.race([
          this.client.set(key, stringValue),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 500),
          ),
        ]);
      }
    } catch {
      // Non-blocking fallback
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await Promise.race([
        this.client.get(key),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 500),
        ),
      ]);
      if (!value) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch {
      return null;
    }
  }

  async del(key: string | string[]): Promise<void> {
    try {
      const keys = Array.isArray(key) ? key : [key];
      if (keys.length > 0) {
        await Promise.race([
          this.client.del(...keys),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 500),
          ),
        ]);
      }
    } catch {
      // Non-blocking fallback
    }
  }

  async publish(channel: string, message: string): Promise<number> {
    try {
      return await this.client.publish(channel, message);
    } catch (err: any) {
      this.logger.warn(`Failed to publish to channel ${channel}: ${err?.message || err}`);
      return 0;
    }
  }

  async rpush(key: string, value: string): Promise<number> {
    try {
      return await (this.client as any).rpush(key, value);
    } catch {
      return 0;
    }
  }

  async lpop(key: string): Promise<string | null> {
    try {
      return await (this.client as any).lpop(key);
    } catch {
      return null;
    }
  }

  createSubscriberClient(): Redis | Cluster {
    if (typeof (this.client as any).duplicate === 'function') {
      return (this.client as any).duplicate();
    }
    return this.client;
  }

  async onModuleDestroy() {
    try {
      this.logger.log('Closing Redis connection...');
      await this.client.quit();
    } catch {
      // Ignore on destroy
    }
  }
}
