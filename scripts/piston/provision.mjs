// Trusted execution-host provisioning. No packages are installed by student APIs.
import { readFile, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
const [manifestPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !outputPath || process.env.PISTON_TRUSTED_PROVISIONING !== 'yes') throw new Error('Usage: PISTON_TRUSTED_PROVISIONING=yes node scripts/piston/provision.mjs reviewed-manifest.json output.json');
const base = process.env.PISTON_PROVISION_URL || 'http://127.0.0.1:2001/api/v2';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) throw new Error('Trusted provisioning must run on the execution host');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
// Manifest format: [{ frontendLanguage, package, version, runtimeLanguage }].
// The pinned Piston API image uses Node 16, which has no built-in fetch.
const request = (path, options = {}) => new Promise((resolve, reject) => {
  const url = new URL(`${base}${path}`);
  const body = options.body || '';
  const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
    method: options.method || 'GET', headers: { ...options.headers, ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) },
  }, response => {
    let length = 0; const chunks = [];
    response.on('data', chunk => { length += chunk.length; if (length > 1000000) req.destroy(new Error('Provisioning response exceeds limit')); else chunks.push(chunk); });
    response.on('error', reject);
    response.on('end', () => {
      if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`Provisioning request failed (${response.statusCode})`));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Invalid provisioning response')); }
    });
  });
  req.setTimeout(900000, () => req.destroy(new Error('Provisioning timed out')));
  req.on('error', reject); req.end(body);
});
if (!Array.isArray(manifest) || !manifest.length || manifest.some(m => !['c','cpp','java','python','javascript','typescript'].includes(m.frontendLanguage) || typeof m.package !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(m.version) || typeof m.runtimeLanguage !== 'string') || new Set(manifest.map(m => m.frontendLanguage)).size !== manifest.length) throw new Error('Review manifest with unique language mappings and exact versions first');
const packages = await request('/packages');
const installed = new Set(packages.filter(p => p.installed).map(p => `${p.language}:${p.language_version}`));
for (const item of manifest) {
  const pkg = packages.find(p => p.language === item.package && p.language_version === item.version);
  if (!pkg) throw new Error(`Requested package is unavailable: ${item.package} ${item.version}`);
  if (!installed.has(`${item.package}:${item.version}`)) {
    await request('/packages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: item.package, version: item.version }) });
    installed.add(`${item.package}:${item.version}`);
  }
}
const runtimes = await request('/runtimes');
const versions = {};
for (const item of manifest) {
  if (!runtimes.some(r => r.language === item.runtimeLanguage && r.version === item.version)) throw new Error(`Installed runtime mismatch for ${item.frontendLanguage}`);
  versions[item.frontendLanguage] = item.version;
}
await writeFile(outputPath, JSON.stringify({ verifiedAt: new Date().toISOString(), versions, runtimes }, null, 2));
console.log('Installed registry verified. Run smoke/security tests before enabling versions on the API and workers.');
