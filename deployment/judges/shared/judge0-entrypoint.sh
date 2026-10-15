#!/bin/bash
set -euo pipefail
# Only workers need sandbox privileges. API starts without privileges.
if [[ ${1:-api} == worker ]]; then
  source /usr/local/bin/cgroup-init.sh
fi
if [[ ${1:-api} == api ]]; then
  exec su judge0 -s /bin/bash -c 'set -e; cd /api; source scripts/load-config; export | sudo tee /api/environment >/dev/null; bundle exec rails db:create db:migrate db:seed; exec bundle exec rails s -b 0.0.0.0'
else
  exec su judge0 -s /bin/bash -c 'set -e; cd /api; source scripts/load-config; export | sudo tee /api/environment >/dev/null; exec bundle exec rails resque:work'
fi
