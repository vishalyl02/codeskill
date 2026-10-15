// Local secrets are generated once and never written to tracked files.
import { mkdir, readFile, writeFile, copyFile, access, chmod } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const secret = () => randomBytes(32).toString('hex');
const exists = async (path) => access(path).then(() => true, () => false);
const judge0 = resolve(root, '.local-dev/judges-judge0');
const piston = resolve(root, '.local-dev/judges-piston');
for (const [dir, name, image] of [[judge0, 'judge0', 'judge0/judge0:1.13.1'], [piston, 'piston', 'ghcr.io/engineer-man/piston:latest']]) {
  await mkdir(dir, { recursive: true });
  await copyFile(resolve(root, `deployment/judges/${name}.nginx.conf`), resolve(dir, 'nginx.conf'));
  const env = resolve(dir, 'compose.env');
  if (!await exists(env)) await writeFile(env, `JUDGE_CONFIG_DIR=${dir}\n${name.toUpperCase()}_IMAGE=${image}\n`, { mode: 0o600 });
}
const conf = resolve(judge0, 'judge0.conf');
const nodeTypesArchive = resolve(judge0, 'types-node-12.12.25.tgz');
if (!await exists(nodeTypesArchive)) execFileSync('npm', ['pack', '@types/node@12.12.25', '--ignore-scripts', '--loglevel=error', '--pack-destination', judge0, '--registry=https://registry.npmjs.org'], { timeout: 120000, stdio: 'pipe' });
if (createHash('sha256').update(await readFile(nodeTypesArchive)).digest('hex') !== '033d75acdf8ce21ca1885a1b09824f64822854d1dd04e99eb40e4abb165d2f20') throw Error('Pinned Judge0 Node type archive checksum mismatch');
const nodeTypes = resolve(judge0, 'node-types-12.12.25/node');
if (!await exists(resolve(nodeTypes, 'index.d.ts'))) {
  await mkdir(nodeTypes, { recursive: true, mode: 0o755 });
  execFileSync('tar', ['-xzf', nodeTypesArchive, '-C', nodeTypes, '--strip-components=1']);
}
await copyFile(resolve(root, 'deployment/judges/piston-entrypoint.sh'), resolve(piston, 'entrypoint.sh'));
await mkdir(resolve(piston, 'provision'), { recursive: true });
await copyFile(resolve(root, 'scripts/piston/provision.mjs'), resolve(piston, 'provision/provision.mjs'));
await copyFile(resolve(root, 'scripts/judges/patch-runtimes.cjs'), resolve(piston, 'provision/patch-runtimes.cjs'));
if (!await exists(conf)) {
  const settings = {
    AUTHN_HEADER: 'X-Auth-Token', AUTHN_TOKEN: secret(),
    POSTGRES_HOST: 'judge0-db', POSTGRES_DB: 'judge0', POSTGRES_USER: 'judge0', POSTGRES_PASSWORD: secret(),
    REDIS_HOST: 'judge0-redis', REDIS_PASSWORD: secret(), SECRET_KEY_BASE: secret(),
    RAILS_ENV: 'production', RAILS_SERVER_PROCESSES: 1, RAILS_MAX_THREADS: 2, COUNT: 1, INTERVAL: 1,
    JUDGE0_TELEMETRY_ENABLE: 'false', ENABLE_NETWORK: 'false', ALLOW_ENABLE_NETWORK: 'false',
    ENABLE_WAIT_RESULT: 'false', ENABLE_CALLBACKS: 'false', ENABLE_ADDITIONAL_FILES: 'false',
    ENABLE_COMPILER_OPTIONS: 'false', ENABLE_COMMAND_LINE_ARGUMENTS: 'false', ENABLE_SUBMISSION_DELETE: 'false',
    MAX_QUEUE_SIZE: 32, CPU_TIME_LIMIT: 2, MAX_CPU_TIME_LIMIT: 60, WALL_TIME_LIMIT: 5, MAX_WALL_TIME_LIMIT: 60,
    MEMORY_LIMIT: 262144, MAX_MEMORY_LIMIT: 524288, MAX_PROCESSES_AND_OR_THREADS: 64,
    MAX_MAX_PROCESSES_AND_OR_THREADS: 64, MAX_FILE_SIZE: 1024, MAX_MAX_FILE_SIZE: 32768,
    NUMBER_OF_RUNS: 1, MAX_NUMBER_OF_RUNS: 1, SUBMISSION_CACHE_DURATION: 0,
  };
  await writeFile(conf, Object.entries(settings).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
}
// File bind mounts retain the old inode when a host config is replaced. Use an
// immutable content-addressed copy so Compose recreates mounts on config edits.
// The 0700 parent keeps the readable container copy private on the host.
await chmod(judge0, 0o700);
const confContents = await readFile(conf);
const confName = `judge0.container.${createHash('sha256').update(confContents).digest('hex').slice(0, 16)}.conf`;
const containerConf = resolve(judge0, confName);
if (!await exists(containerConf)) await writeFile(containerConf, confContents, { mode: 0o644 });
const composeEnv = resolve(judge0, 'compose.env');
let envContents = await readFile(composeEnv, 'utf8');
const bindings = { JUDGE0_CONTAINER_CONFIG: confName };
for (const [key, source, prefix] of [
  ['JUDGE0_WORKER_SCRIPT', 'judge0-worker.sh', 'worker'],
  ['JUDGE0_TSC_SCRIPT', 'judge0-typescript.sh', 'tsc'],
]) {
  const contents = await readFile(resolve(root, 'deployment/judges', source));
  const name = `${prefix}.${createHash('sha256').update(contents).digest('hex').slice(0, 16)}.sh`;
  if (!await exists(resolve(judge0, name))) await writeFile(resolve(judge0, name), contents, { mode: 0o644 });
  bindings[key] = name;
}
for (const key of Object.keys(bindings)) envContents = envContents.replace(new RegExp(`^${key}=.*\\n?`, 'gm'), '');
await writeFile(composeEnv, envContents.trimEnd() + '\n' + Object.entries(bindings).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
const client = resolve(root, '.local-dev/judges-docker-client');
await mkdir(client, { recursive: true });
if (!await exists(resolve(client, 'config.json'))) await writeFile(resolve(client, 'config.json'), JSON.stringify({ cliPluginsExtraDirs: ['/opt/homebrew/lib/docker/cli-plugins'] }), { mode: 0o600 });
console.log('Local judge configuration ready in .local-dev (secrets preserved on repeat runs). Pin pulled image digests before enabling execution.');
