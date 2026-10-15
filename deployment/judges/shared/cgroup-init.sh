#!/bin/bash
set -euo pipefail
# Private container cgroup namespace: never mount the host hierarchy.
test -f /sys/fs/cgroup/cgroup.controllers
mount -o remount,rw /sys/fs/cgroup
cd /sys/fs/cgroup
mkdir -p isolate/init
# Move entrypoint out of the parent before enabling domain controllers.
echo $$ > isolate/init/cgroup.procs
echo '+cpuset +cpu +io +memory +pids' > cgroup.subtree_control
echo '+cpuset +cpu +io +memory +pids' > isolate/cgroup.subtree_control
