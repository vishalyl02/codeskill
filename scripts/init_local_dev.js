const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const localDir = path.join(root, '.local-dev');
const backendDir = path.join(root, 'backend-nestjs');
const backendEnvPath = path.join(backendDir, '.env');
const composeEnvPath = path.join(localDir, 'compose.env');
const accountsPath = path.join(localDir, 'test-accounts.json');
const dotenv = require(path.join(backendDir, 'node_modules', 'dotenv'));

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function createFileIfMissing(filePath, content) {
  try {
    const descriptor = fs.openSync(filePath, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, content, 'utf8');
    } finally {
      fs.closeSync(descriptor);
    }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

function verifyLocalEnvironment() {
  if (!fs.existsSync(backendEnvPath) || !fs.existsSync(composeEnvPath)) {
    throw new Error('Local environment files are incomplete; inspect .local-dev and backend-nestjs/.env before retrying.');
  }
  const app = dotenv.parse(fs.readFileSync(backendEnvPath));
  const database = new URL(app.DATABASE_URL || '');
  const redis = new URL(app.REDIS_URL || '');
  const compose = dotenv.parse(fs.readFileSync(composeEnvPath));

  if (
    app.NODE_ENV !== 'development' ||
    database.hostname !== '127.0.0.1' ||
    database.port !== '55432' ||
    database.pathname !== '/codeskill_local' ||
    database.password !== compose.LOCAL_POSTGRES_PASSWORD ||
    redis.hostname !== '127.0.0.1' ||
    redis.port !== '56379'
  ) {
    throw new Error('Existing local environment does not target the isolated local services; no files were changed.');
  }
}

function main() {
  fs.mkdirSync(localDir, { recursive: true, mode: 0o700 });
  const postgresPassword = fs.existsSync(composeEnvPath)
    ? dotenv.parse(fs.readFileSync(composeEnvPath)).LOCAL_POSTGRES_PASSWORD
    : randomSecret(24);
  if (!postgresPassword) throw new Error('Local Compose password file is invalid.');

  createFileIfMissing(composeEnvPath, `LOCAL_POSTGRES_PASSWORD=${postgresPassword}\n`);
  createFileIfMissing(
    backendEnvPath,
    [
      'NODE_ENV=development',
      'PORT=5001',
      `DATABASE_URL=postgres://postgres:${postgresPassword}@127.0.0.1:55432/codeskill_local`,
      'DATABASE_HOST=127.0.0.1',
      'DATABASE_PORT=55432',
      'DATABASE_USER=postgres',
      `DATABASE_PASSWORD=${postgresPassword}`,
      'DATABASE_NAME=codeskill_local',
      'DATABASE_SSL=false',
      'DB_SYNCHRONIZE=false',
      'DB_POOL_MAX=10',
      'DB_POOL_MIN=1',
      'DB_POOL_IDLE_TIMEOUT=30000',
      'DB_POOL_CONN_TIMEOUT=10000',
      `JWT_SECRET=${randomSecret(48)}`,
      'JWT_EXPIRE=1h',
      'JWT_ACCESS_TTL=1h',
      'JWT_REFRESH_TTL=30d',
      'REDIS_HOST=127.0.0.1',
      'REDIS_PORT=56379',
      'REDIS_PASSWORD=',
      'REDIS_URL=redis://127.0.0.1:56379',
      'CLIENT_URL=http://localhost:3000',
      'SANDBOX_TIMEOUT=10000',
      'SANDBOX_MEMORY_LIMIT=256',
      'OPENROUTER_API_KEY=',
      'OPENROUTER_MODEL=openrouter/free',
      '',
    ].join('\n'),
  );
  createFileIfMissing(
    accountsPath,
    `${JSON.stringify({
      admin: { email: 'admin.local@codeskill.test', password: randomSecret(24) },
      student: { email: 'student.local@codeskill.test', password: randomSecret(24) },
    }, null, 2)}\n`,
  );

  verifyLocalEnvironment();
  console.log('Local-only environment initialized. Secrets are stored in ignored local files.');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
