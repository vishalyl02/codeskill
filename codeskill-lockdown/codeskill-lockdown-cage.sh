#!/bin/bash
# CodeSkill LockDown Cage Launcher for Wayland
# Launches CodeSkill LockDown inside an isolated Cage Wayland compositor session

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_PATH="${SCRIPT_DIR}/src-tauri/target/release/codeskill-lockdown"

if [ ! -f "$BIN_PATH" ]; then
    BIN_PATH="${SCRIPT_DIR}/src-tauri/target/debug/codeskill-lockdown"
fi

if ! command -v cage &> /dev/null; then
    echo "[CodeSkill LockDown] Cage compositor not found."
    echo "To run CodeSkill LockDown in an isolated Wayland kiosk session, install cage:"
    echo "  sudo apt install cage       # Debian/Ubuntu"
    echo "  sudo dnf install cage       # Fedora"
    echo "  sudo pacman -S cage         # Arch Linux"
    echo "Falling back to direct execution..."
    exec "$BIN_PATH" "$@"
fi

echo "[CodeSkill LockDown] Launching inside secure Cage Wayland kiosk session..."
exec cage -s -- "$BIN_PATH" "$@"
