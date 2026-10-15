#!/usr/bin/env python3
"""Create Piston packages from installed native tools; never fetch AMD64 packages."""
import json, os, pathlib, subprocess, re
root = pathlib.Path('/piston/packages')
os.makedirs('/piston/jobs', exist_ok=True)
def version(command):
    return subprocess.check_output(command, shell=True, text=True).strip()
packages = [
 ('c', version('gcc -dumpfullversion'), ['gcc'], 'exec /usr/bin/gcc -O2 -std=c11 "$@" -o main', 'exec ./main'),
 ('c++', version('g++ -dumpfullversion'), ['cpp','g++'], 'exec /usr/bin/g++ -O2 -std=c++17 "$@" -o main', 'exec ./main'),
 ('python', version("python3 --version | cut -d' ' -f2"), ['py','python3'], None, 'exec /usr/bin/python3 "$@"'),
 ('javascript', version('node -p process.versions.node'), ['js','node'], None, 'exec /usr/local/bin/node --max-old-space-size=96 "$@"'),
 ('java', version("javac -version 2>&1 | cut -d' ' -f2"), [], 'exec /usr/bin/javac -J-Xms16m -J-Xmx128m "$@"', 'entry=${1%.java}; shift; exec /usr/bin/java -Xms16m -Xmx96m -XX:ActiveProcessorCount=1 -XX:MaxMetaspaceSize=64m -XX:ReservedCodeCacheSize=32m "$entry" "$@"'),
 ('typescript', version("tsc --version | cut -d' ' -f2"), ['ts'], 'exec /usr/local/bin/tsc --target es2020 --skipLibCheck --typeRoots /usr/local/lib/node_modules/@types "$@"', 'entry=${1%.ts}.js; shift; exec /usr/local/bin/node --max-old-space-size=96 "$entry" "$@"')]
for language, ver, aliases, compile_cmd, run in packages:
    tool_version=ver
    parts=re.findall(r'\d+',ver)
    assert len(parts)>=2
    ver='.'.join((parts+['0'])[:3])
    if len(parts)>3:ver+='-patch.'+'.'.join(parts[3:])
    pkg = root / language / ver
    pkg.mkdir(parents=True, exist_ok=True)
    (pkg/'pkg-info.json').write_text(json.dumps(dict(language=language,version=ver,aliases=aliases,build_platform='docker-debian',architecture='arm64',tool_version=tool_version)))
    (pkg/'.env').write_text('PATH=/usr/local/bin:/usr/bin:/bin\nHOME=/tmp\nLANG=C.UTF-8\n')
    (pkg/'.ppman-installed').touch()
    for name, cmd in [('run',run),('compile',compile_cmd)]:
        if cmd:
            (pkg/name).write_text('#!/bin/bash\nset -e\n'+cmd+'\n')
            (pkg/name).chmod(0o755)
