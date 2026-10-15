#!/usr/bin/env bash
set -euo pipefail
[[ ${PISTON_DEDICATED_HOST:-} == yes ]] || { echo 'Set PISTON_DEDICATED_HOST=yes only on a dedicated, secret-free execution host' >&2; exit 1; }
[[ $(uname -s) == Linux ]] || { echo 'Linux execution host required' >&2; exit 1; }
[[ $(stat -fc %T /sys/fs/cgroup) == cgroup2fs ]] || { echo 'cgroup v2 required; do not disable sandboxing' >&2; exit 1; }
[[ ${PISTON_IMAGE:-} =~ ^[^[:space:]]+@sha256:[a-f0-9]{64}$ ]] || { echo 'PISTON_IMAGE must be an audited immutable image digest' >&2; exit 1; }
docker info --format '{{json .SecurityOptions}}'
# Deliberately inspect names only, never process environments or credentials.
if docker ps --format '{{.Names}}' | rg -qi 'postgres|redis|codeskill-backend|codeskill-worker'; then
  echo 'Application/database containers detected: refuse shared-host deployment' >&2; exit 1
fi
[[ $(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo) -ge 7500 ]] || { echo 'Baseline requires at least 8 GiB; tune lower concurrency on a separate reviewed profile' >&2; exit 1; }
echo 'Host prerequisites passed. Still required: kernel/Isolate compatibility, SG policy, metadata disabled, no IAM role, and live negative tests.'
