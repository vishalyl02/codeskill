#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
provider="${1:-}"
case "$provider" in judge0|piston) ;; *) echo 'Usage: bash scripts/judges/local.sh judge0|piston <compose arguments>' >&2; exit 1 ;; esac
shift
export DOCKER_CONFIG="$root/.local-dev/judges-docker-client"
export DOCKER_HOST="unix://$HOME/.colima/codeskill-$provider/docker.sock"
exec docker compose --project-name "codeskill-$provider" --env-file "$root/.local-dev/judges-$provider/compose.env" -f "$root/deployment/judges/$provider.compose.yaml" "$@"
