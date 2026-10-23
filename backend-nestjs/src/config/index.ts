import { registerAs } from '@nestjs/config';
import { resolveJwtSettings } from './jwt.config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
}));

export const databaseConfig = registerAs('database', () => ({
  postgres: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'codeskill',
    ssl: process.env.DATABASE_SSL === 'true',
    url: process.env.DATABASE_URL,
  },
}));

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || '',
  url: process.env.REDIS_URL,
}));

// Throws at boot when JWT_SECRET is missing/weak outside development/test.
export const jwtConfig = registerAs('jwt', () => resolveJwtSettings());

export const awsConfig = registerAs('aws', () => ({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: process.env.AWS_REGION || 'ap-south-1',
  sesSender: process.env.AWS_SES_SENDER || 'noreply@cuchd.in',
}));

export const oauthConfig = registerAs('oauth', () => ({
  googleEnabled: process.env.ENABLE_GOOGLE_LOGIN === 'true',
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  linkedinClientId: process.env.LINKEDIN_CLIENT_ID,
  linkedinClientSecret: process.env.LINKEDIN_CLIENT_SECRET,
}));

// Administrators are created ONLY through the explicit bootstrap CLI
// (`npm run admin:bootstrap`). There are no default e-mails or passwords and
// nothing is promoted automatically at application start-up.
export const adminConfig = registerAs('admin', () => ({}));
