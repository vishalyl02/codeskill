#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_URL="${1:-https://codeskill.novaserve.cloud}"
CONCURRENCY="${2:-100}"

echo "=========================================================="
echo " CodeSkill Concurrency Load Test Runner                   "
echo " Target Endpoint:    ${TARGET_URL}                        "
echo " Concurrent Students: ${CONCURRENCY}                       "
echo "=========================================================="

if ! command -v k6 &> /dev/null; then
    echo "k6 is not currently installed. To install:"
    echo "  macOS:  brew install k6"
    echo "  Linux:  sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69"
    echo "          echo \"deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main\" | sudo tee /etc/apt/sources.list.d/k6.list"
    echo "          sudo apt-get update && sudo apt-get install k6"
    echo "  Docker: docker run --rm -i -e TARGET_URL=\"${TARGET_URL}\" -e CONCURRENT_STUDENTS=\"${CONCURRENCY}\" grafana/k6 run - < \"${SCRIPT_DIR}/codeskill-k6-load-test.js\""
    exit 1
fi

export TARGET_URL="${TARGET_URL}"
export CONCURRENT_STUDENTS="${CONCURRENCY}"

echo "Starting k6 test run..."
k6 run "${SCRIPT_DIR}/codeskill-k6-load-test.js"
