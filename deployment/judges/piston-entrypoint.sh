#!/usr/bin/env bash
set -euo pipefail
# Each replica has its own Isolate hierarchy inside Docker's CPU/memory limits.
cd /sys/fs/cgroup
test -e cgroup.subtree_control || { echo 'Piston requires cgroup v2' >&2; exit 1; }
if [ ! -w cgroup.procs ]; then mount -o remount,rw /sys/fs/cgroup; fi
mkdir -p isolate/init
echo 1 > isolate/init/cgroup.procs
echo '+cpuset +cpu +io +memory +pids' > cgroup.subtree_control
echo '+cpuset +memory' > isolate/cgroup.subtree_control
mkdir -p /piston/jobs /piston/packages
chown piston:piston /piston /piston/jobs
# Provisioning uses a writable volume; student execution mounts it read-only.
if [ -w /piston/packages ]; then chown -R piston:piston /piston/packages; fi
exec su -- piston -c 'ulimit -n 65536 && exec node /piston_api/src'
