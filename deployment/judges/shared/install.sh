#!/bin/bash
set -euo pipefail
umask 077
exec 9>/var/lock/codeskill-judges-install.lock
flock -n 9 || { echo "Judge installer already active"; exit 0; }
cd /opt/codeskill-judges
[[ $(uname -m) == aarch64 ]]
test -f /sys/fs/cgroup/cgroup.controllers
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg python3 python3-yaml jq awscli
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
printf 'deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' "$VERSION_CODENAME" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker
# Build-only safety margin on the encrypted root disk; jobs have memswap=memory.
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon /swapfile 2>/dev/null || true
sysctl -w vm.swappiness=10
# No container may reach metadata, including when namespace isolation regresses.
iptables -C DOCKER-USER -d 169.254.0.0/16 -j REJECT 2>/dev/null || iptables -I DOCKER-USER 1 -d 169.254.0.0/16 -j REJECT
providers=${CODESKILL_JUDGE_PROVIDERS:-$(cat config/providers 2>/dev/null || printf 'judge0,piston')}
# Build sequentially to fit a 2 GiB host. No AMD64 image or QEMU is involved.
runtime_fingerprint=$(cat runtime.Dockerfile manifest.json | sha256sum | awk '{print $1}')
installed_fingerprint=$(docker image inspect --format '{{index .Config.Labels "codeskill.runtime.source"}}' codeskill-native-runtime:arm64 2>/dev/null || true)
if [[ $runtime_fingerprint != "$installed_fingerprint" || ${CODESKILL_REBUILD_RUNTIME:-false} == true ]]; then
  docker build --platform linux/arm64 --label "codeskill.runtime.source=$runtime_fingerprint" -f runtime.Dockerfile -t codeskill-native-runtime:arm64 .
fi
if [[ ,$providers, == *,judge0,* ]]; then docker build --platform linux/arm64 -f judge0.Dockerfile -t codeskill-judge0:arm64 .; fi
if [[ ,$providers, == *,piston,* ]]; then docker build --platform linux/arm64 -f piston.Dockerfile -t codeskill-piston:arm64 .; fi
python3 configure.py
CODESKILL_JUDGE_PROVIDERS="$providers" python3 select-providers.py
# Start only after all builds succeeded. Existing config and volume are retained.
docker compose up -d --remove-orphans
cat > /etc/systemd/system/codeskill-judges.service <<'UNIT'
[Unit]
Description=CodeSkill native ARM shared judges
After=docker.service network-online.target
Requires=docker.service
[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/codeskill-judges
ExecStartPre=/bin/sh -c 'iptables -C DOCKER-USER -d 169.254.0.0/16 -j REJECT 2>/dev/null || iptables -I DOCKER-USER 1 -d 169.254.0.0/16 -j REJECT'
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose stop --timeout 60
TimeoutStopSec=180
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable codeskill-judges.service
python3 verify.py
# Publish only after smoke/isolation tests pass. Never print the token.
aws ssm put-parameter --name "$CODESKILL_JUDGE_PARAMETER_PREFIX/auth-token" --type SecureString --value "$(cat config/auth-token)" --overwrite --region "$AWS_DEFAULT_REGION" >/dev/null
aws ssm put-parameter --name "$CODESKILL_JUDGE_PARAMETER_PREFIX/status" --type String --value verified --overwrite --region "$AWS_DEFAULT_REGION" >/dev/null
touch initialized
