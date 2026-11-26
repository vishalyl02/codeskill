# CodeSkill LockDown — Linux

> **Official Linux Secure Examination Browser for CodeSkill**  
> Built with Tauri v2, Rust, WebKitGTK 4.1, and Linux Wayland/X11 security layers (`codeskill-lockdown-linux/`).

---

## 1. Linux Security & Kiosk Architecture

- **Kiosk Containment (`src-tauri/src/kiosk_os/linux.rs`, `codeskill-lockdown-cage.sh`):**
  - Supports hardened Wayland `cage` kiosk compositor containment via `./codeskill-lockdown-cage.sh`.
  - `XGrabKeyboard` grab/ungrab on X11, `systemd-inhibit` sleep/lid-switch lock during active exams, and clipboard clearing via `xclip` / `xsel`.
- **Permissions & Hardware (`src-tauri/src/permissions_onboarding/linux.rs`):**
  - Inspects V4L2 camera devices (`/dev/video*`), audio stack (`/dev/snd`, PipeWire/PulseAudio), Wayland/Cage compositor status, and XDG portal session state.
- **Preflight & Watchdog (`src-tauri/src/security.rs`):**
  - Enforces hardened Wayland/Cage session check (`LINUX_X11_UNENFORCED_SESSION` when `XDG_SESSION_TYPE=x11` and `WAYLAND_DISPLAY` is empty).
  - Checks multi-monitor topology, open windows via `wmctrl -lp`, forbidden background processes, stealth overlays, VM/hypervisor indicators, proxy/MITM settings, `LD_PRELOAD` injection, and `/proc/self/status` `TracerPid` anti-debugging.
- **Native Shell & Crypto (`src-tauri/src/lib.rs`, `attestation.rs`, `offline_vault.rs`):**
  - Deep-link scheme registration (`codeskill-exam://`, `codeskill-lockdown://`), Shadow-DOM frame controls (`#codeskill-lockdown-frame-controls`), Ed25519 + HMAC-SHA256 request signing, and AES-256-GCM encrypted offline autosave vault.

---

## 2. Flight-Recorder Logs & Diagnostics

- **Structured JSONL Logs:** `~/.local/share/com.codeskill.lockdown/logs/flight-recorder.jsonl.YYYY-MM-DD` (or `$XDG_DATA_HOME/com.codeskill.lockdown/logs/`, 14-day retention, 25 MB size rotation)
- **Crash / Panic Log:** `~/.local/share/com.codeskill.lockdown/logs/panic-crash.jsonl`
- **Legacy Plain-Text Log:** `~/.local/share/com.codeskill.lockdown/lockdown.log`
- **Diagnostic Export:** Click **Save Diagnostic Log Bundle (.zip)** on `/lockdown-system-check`, or inspect locally:
  ```bash
  tail -f "${XDG_DATA_HOME:-$HOME/.local/share}/com.codeskill.lockdown/logs"/flight-recorder.jsonl.*
  ```

---

## 3. Running Locally & Installing

- **Debian / Ubuntu (`.deb`):**
  ```bash
  sudo dpkg -i codeskill-lockdown.deb || sudo apt-get install -f -y
  codeskill-lockdown
  ```
- **Portable AppImage:**
  ```bash
  chmod +x codeskill-lockdown.AppImage
  ./codeskill-lockdown.AppImage
  ```
- **Wayland Cage Kiosk Launcher:**
  ```bash
  ./codeskill-lockdown-cage.sh
  ```

**System Build Dependencies (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libx11-dev libayatana-appindicator3-dev librsvg2-dev
```

**Local Development & Verification:**
```bash
cd codeskill-lockdown-linux
npm install
npm run tauri:dev
```
```bash
cargo check --manifest-path codeskill-lockdown-linux/src-tauri/Cargo.toml
cargo test --manifest-path codeskill-lockdown-linux/src-tauri/Cargo.toml
node --check codeskill-lockdown-linux/dist-isolation/index.js
```

---

## 4. Packaging & CI/CD Release

- **Local Linux Build:**
  ```bash
  cd codeskill-lockdown-linux
  npm install
  npm run build:linux
  ```
  Outputs `.deb` and `.AppImage` under `codeskill-lockdown-linux/src-tauri/target/release/bundle/`.
- **Automated CI:** [`.github/workflows/lockdown-release.yml`](../.github/workflows/lockdown-release.yml) builds `build-linux` (`ubuntu-22.04`) only when `codeskill-lockdown-linux/**` (excluding `*.md`) changes, and publishes `codeskill-lockdown.deb`, `CodeSkill-LockDown-<version>.deb`, `codeskill-lockdown.AppImage`, `CodeSkill-LockDown-<version>.AppImage`, `SHA256SUMS-linux.txt`, and `release-manifest-linux.json` on merges to `main` or `lockdown-v*` tags.
