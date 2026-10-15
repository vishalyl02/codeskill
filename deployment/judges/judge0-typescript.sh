#!/usr/bin/env bash
# Keep the pinned vendor compiler; add its matching Node runtime declarations.
set -euo pipefail
exec /usr/local/node-12.14.0/bin/node /usr/lib/node_modules/typescript/bin/tsc \
  --skipLibCheck --typeRoots /usr/share/codeskill-node-types "$@"
