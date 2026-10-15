#!/bin/bash
set -euo pipefail
source /usr/local/bin/cgroup-init.sh
mkdir -p /piston/jobs
chown piston:piston /piston/jobs
exec su piston -s /bin/bash -c 'exec node /piston_api/src'
