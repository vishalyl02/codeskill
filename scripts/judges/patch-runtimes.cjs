// Trusted self-hosted runtime setup, applied before sealing the packages volume.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');
const root = '/piston/packages';
const java = path.join(root, 'java/15.0.2');
if (fs.existsSync(java)) {
  // Upstream launches Java source directly, charging compilation to the run
  // budget. Match Judge0: compile first, then measure the compiled program.
  fs.writeFileSync(path.join(java, 'compile'), '#!/usr/bin/env bash\nset -euo pipefail\nexec javac -J-XX:ActiveProcessorCount=2 "$@"\n', { mode: 0o755 });
  fs.chmodSync(path.join(java, 'compile'), 0o755);
  fs.writeFileSync(path.join(java, 'run'), '#!/usr/bin/env bash\nset -euo pipefail\nCLASS="${1%.java}"\nshift\nexec java -XX:ActiveProcessorCount=2 "$CLASS" "$@"\n', { mode: 0o755 });
  fs.chmodSync(path.join(java, 'run'), 0o755);
}
const typescript = path.join(root, 'typescript/5.0.3/compile');
if (fs.existsSync(typescript)) {
  const typesRoot = path.join(path.dirname(typescript), 'codeskill-types');
  const nodeTypes = path.join(typesRoot, 'node');
  // Upstream installs tsc without Node types. Pin declarations compatible with
  // its embedded Node 18 / TypeScript 5, including fs, process and Buffer.
  const archive = '/codeskill-provision/types-node-18.15.3.tgz';
  if (fs.existsSync(archive)) {
    const digest = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    if (digest !== 'd47835aa21c896109c66e53f755b6003157ed5f028cfc7645d2c83b8e07d9c8d') throw Error('Pinned Node type archive checksum mismatch');
    fs.mkdirSync(nodeTypes, { recursive: true });
    execFileSync('tar', ['-xzf', archive, '-C', nodeTypes, '--strip-components=1']);
  }
  if (!fs.existsSync(path.join(nodeTypes, 'index.d.ts'))) throw Error('Missing pinned @types/node@18.15.3 archive for TypeScript provisioning');
  const source = fs.readFileSync(typescript, 'utf8');
  if (!/^tsc .*\*\.ts\s*$/m.test(source)) throw Error('Unrecognized TypeScript compiler script');
  // Skip checking trusted library declarations; student .ts code is still checked.
  fs.writeFileSync(typescript, source.replace(/^tsc .*\*\.ts\s*$/m, `tsc --skipLibCheck --typeRoots "${typesRoot}" *.ts`));
}
console.log('Java compile/run accounting and TypeScript Node declarations applied. Restart Piston before execution.');
