#!/bin/bash
set -euo pipefail
# Usage: package.sh OUTPUT.tgz [SOURCE_CACHE]. Fetch only pinned source commits.
repo_root=$(cd "$(dirname "$0")/../../.." && pwd)
output=${1:?Provide output bundle path}
cache=${2:-$repo_root/.local-dev/shared-judges-source}
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/sources"
for entry in 'judge0 https://github.com/judge0/judge0.git ffd7a48cc6da86d6ac155ef10dbd67d02736070b' 'piston https://github.com/engineer-man/piston.git de2b365ac759670a3a0d13ea208a0869a92c7e64' 'isolate https://github.com/envicutor/isolate.git af6db68042c3aa0ded80787fbb78bc0846ea2114'; do
  read -r name url revision <<< "$entry"
  if [[ ! -d "$cache/$name/.git" ]]; then git clone "$url" "$cache/$name"; fi
  [[ $(git -C "$cache/$name" rev-parse HEAD) == "$revision" ]] || git -C "$cache/$name" checkout "$revision"
  mkdir -p "$stage/sources/$name"
  git -C "$cache/$name" archive "$revision" | tar -xf - -C "$stage/sources/$name"
done
find "$repo_root/deployment/judges/shared" -maxdepth 1 -type f -exec cp {} "$stage/" \;
python3 "$stage/patch-source.py" "$stage"
tar -czf "$output" -C "$stage" .
shasum -a 256 "$output"
