#!/usr/bin/env bash
# One sandbox worker per replica. CodeSkill enqueues immediate Judge0 jobs;
# BullMQ owns delays/retries, so no scheduler or nested worker manager is needed.
set -euo pipefail
cd /api
source ./scripts/load-config
export | sudo tee /api/environment >/dev/null
# Replace only the public CLI symlink, preserving the vendor compiler target.
test -f /usr/lib/node_modules/typescript/bin/tsc
test -f /usr/share/codeskill-node-types/node/index.d.ts
if [[ -L /usr/bin/tsc ]]; then sudo rm /usr/bin/tsc; fi
sudo install -m 0755 /codeskill-tsc.sh /usr/bin/tsc
exec rails resque:work
