#!/usr/bin/env bash
# Trusted local setup only. Keep application execution disabled while provisioning.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
manifest="${1:?Pass a reviewed manifest with exact package/runtime versions}"
export DOCKER_CONFIG="$root/.local-dev/judges-docker-client"
export DOCKER_HOST="unix://$HOME/.colima/codeskill-piston/docker.sock"
base="$root/deployment/judges/piston.compose.yaml"
override="$root/deployment/judges/piston.provision.yaml"
envfile="$root/.local-dev/judges-piston/compose.env"
trusted() { docker compose --project-name codeskill-piston --env-file "$envfile" -f "$base" -f "$override" "$@"; }
sealed() { docker compose --project-name codeskill-piston --env-file "$envfile" -f "$base" "$@"; }
node "$root/scripts/judges/configure.mjs"
# Pinned public type declarations; never execute package lifecycle scripts.
npm pack @types/node@18.15.3 --ignore-scripts --loglevel=error --registry=https://registry.npmjs.org --pack-destination "$root/.local-dev/judges-piston/provision"
cmp -s "$manifest" "$root/.local-dev/judges-piston/provision/manifest.json" || cp "$manifest" "$root/.local-dev/judges-piston/provision/manifest.json"
sealed down
restore() { trusted down; sealed up -d --scale piston=2; }
trap restore EXIT
trusted up -d --scale piston=1
for attempt in $(seq 1 60); do
  if trusted exec -T piston node -e 'require("http").get("http://127.0.0.1:2000/api/v2/runtimes",r=>{r.resume();if(r.statusCode!==200)process.exit(1)}).on("error",()=>process.exit(1))'; then break; fi
  if [ "$attempt" -eq 60 ]; then echo 'Piston did not become ready' >&2; exit 1; fi
  sleep 3
done
trusted exec -T piston env PISTON_TRUSTED_PROVISIONING=yes PISTON_PROVISION_URL=http://127.0.0.1:2000/api/v2 node /codeskill-provision/provision.mjs /codeskill-provision/manifest.json /tmp/codeskill-runtime-registry.json
trusted exec -T piston cat /tmp/codeskill-runtime-registry.json > "$root/.local-dev/judges-piston/runtime-registry.json"
trusted exec -T piston node /codeskill-provision/patch-runtimes.cjs
echo 'Verified runtime versions saved; restoring the sealed network and two replicas.'
