# CodeSkill LockDown — macOS

> **Official macOS Secure Examination Browser for CodeSkill**  
> Built with Tauri v2, Rust, WKWebView, and native macOS AppKit / CoreGraphics / AVFoundation security layers (`codeskill-lockdown-macos/`).

---

## 1. macOS Security & Kiosk Architecture

- **Kiosk Containment (`src-tauri/src/kiosk_os/macos.rs`):**
  - Attempts `AEAssessmentSession` (Automatic Assessment Configuration) when entitled, with hardened Cocoa fallback (`NSApplicationPresentationOptions` hiding Dock/menu bar/process switching, `NSStatusWindowLevel`, `set_content_protected(true)`).
  - Low-level `CGEventTap` keyboard interception + `EnableSecureEventInput()` blocking `Cmd+Tab`, `Cmd+Space`, Mission Control, and app switching.
  - Continuous `NSPasteboard` guard polling `changeCount()` and `com.apple.is-remote-clipboard` every 250 ms to block **Universal Clipboard** (iPhone/iPad Handoff) pastes while allowing authorized in-editor copy/paste (`.monaco-editor`, `.scratchpad-editor`).
- **Permissions & Reinstall Recovery (`src-tauri/src/permissions_onboarding/macos.rs`):**
  - Live checks for **Accessibility** (`AXIsProcessTrusted`), **Screen Recording** (`CGPreflightScreenCaptureAccess`), **Camera**, and **Microphone** (`AVAuthorizationStatus`).
  - Binary fingerprint tracking detects Finder **"Replace"** reinstalls, clears stale session state, and re-registers `codeskill-exam://` / `codeskill-lockdown://` via `lsregister -f`.
- **Preflight & Watchdog (`src-tauri/src/security.rs`):**
  - Checks display topology (single monitor unless accommodated), active screen capture, forbidden processes, stealth overlay windows, VM/hypervisor indicators, proxy/MITM settings, and `sysctl` `P_TRACED` anti-debugging.
- **Native Shell & Crypto (`src-tauri/src/lib.rs`, `attestation.rs`, `offline_vault.rs`):**
  - Injects Shadow-DOM frame controls (`#codeskill-lockdown-frame-controls`: LockDown status, clock, battery, volume, Wi-Fi, Exit) outside `/take`, auto-hiding when `LockdownUtilityDock` mounts.
  - Ed25519 + per-session HMAC-SHA256 request signing (`X-CodeSkill-*`, `X-Lockdown-*`) and AES-256-GCM encrypted offline autosave vault.

---

## 2. Flight-Recorder Logs & Diagnostics

- **Structured JSONL Logs:** `~/Library/Logs/com.codeskill.lockdown/flight-recorder.jsonl.YYYY-MM-DD` (14-day retention, 25 MB size rotation)
- **Crash / Panic Log:** `~/Library/Logs/com.codeskill.lockdown/panic-crash.jsonl`
- **Legacy Plain-Text Log:** `~/Library/Application Support/com.codeskill.lockdown/lockdown.log`
- **Diagnostic Export:** Click **Save Diagnostic Log Bundle (.zip)** on `/lockdown-system-check` (or open in Finder via `open ~/Library/Logs/com.codeskill.lockdown`).

---

## 3. Running Locally & Unsigned Builds

For unsigned/ad-hoc `.dmg` or `.app` builds, strip Gatekeeper's quarantine attribute:
```bash
xattr -cr /Applications/"CodeSkill LockDown.app"
# Or on the downloaded DMG:
xattr -d com.apple.quarantine ~/Downloads/codeskill-lockdown.dmg
```

**Local Development & Verification:**
```bash
cd codeskill-lockdown-macos
npm install
npm run tauri:dev
```
```bash
cargo check --manifest-path codeskill-lockdown-macos/src-tauri/Cargo.toml
cargo test --manifest-path codeskill-lockdown-macos/src-tauri/Cargo.toml
node --check codeskill-lockdown-macos/dist-isolation/index.js
```

---

## 4. Packaging & CI/CD Release

- **Local macOS Build:**
  ```bash
  cd codeskill-lockdown-macos
  npm install
  npm run build:mac
  ```
  Outputs `.app` and `.dmg` under `codeskill-lockdown-macos/src-tauri/target/release/bundle/`.
- **Automated CI:** [`.github/workflows/lockdown-release.yml`](../.github/workflows/lockdown-release.yml) builds `build-macos` only when `codeskill-lockdown-macos/**` (excluding `*.md`) changes, and publishes `codeskill-lockdown.dmg`, `CodeSkill-LockDown-<version>.dmg`, `SHA256SUMS-macos.txt`, and `release-manifest-macos.json` on merges to `main` or `lockdown-v*` tags.
