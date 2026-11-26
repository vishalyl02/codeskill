# CodeSkill LockDown — Windows

> **Official Windows Secure Examination Browser for CodeSkill**  
> Built with Tauri v2, Rust, Microsoft Edge WebView2, and native Win32 security layers (`codeskill-lockdown-windows/`).

---

## 1. Windows Security & Kiosk Architecture

- **Kiosk Containment (`src-tauri/src/kiosk_os/windows.rs`):**
  - Isolated desktop (`CreateDesktopW` + `SwitchDesktop`) and shell suppression (`DisableTaskMgr` registry policies, `explorer.exe` lock handling).
  - Low-level keyboard hook (`SetWindowsHookExW(WH_KEYBOARD_LL)`) blocking Windows keys, `Alt+Tab`, `Alt+Esc`, `Alt+F4`, and `PrintScreen`.
  - Continuous clipboard guard (`start_clipboard_guard` polling every 500 ms with `OpenClipboard` / `EmptyClipboard`) during active kiosk mode.
  - Display sleep prevention (`SetThreadExecutionState`).
- **Permissions & Hardware (`src-tauri/src/permissions_onboarding/windows.rs`):**
  - Inspects Windows `CapabilityAccessManager\ConsentStore` registry keys for webcam and microphone permissions and provides deep links to `ms-settings:privacy-webcam` / `ms-settings:privacy-microphone`.
- **Preflight & Watchdog (`src-tauri/src/security.rs`):**
  - Checks `GetWindowDisplayAffinity` (`WDA_EXCLUDEFROMCAPTURE` screen-capture cloaking detection), multi-monitor topology, visible windows via `EnumWindows`, forbidden background processes, stealth overlay windows, VM/hypervisor indicators, proxy/MITM settings, and runtime integrity.
- **Native Shell & Crypto (`src-tauri/src/lib.rs`, `attestation.rs`, `offline_vault.rs`):**
  - Deep-link scheme registration (`codeskill-exam://`, `codeskill-lockdown://`), Shadow-DOM frame controls (`#codeskill-lockdown-frame-controls`), Ed25519 + HMAC-SHA256 request signing, and AES-256-GCM encrypted offline autosave vault.

---

## 2. Flight-Recorder Logs & Diagnostics

- **Structured JSONL Logs:** `%LOCALAPPDATA%\com.codeskill.lockdown\logs\flight-recorder.jsonl.YYYY-MM-DD` (14-day retention, 25 MB size rotation)
- **Crash / Panic Log:** `%LOCALAPPDATA%\com.codeskill.lockdown\logs\panic-crash.jsonl`
- **Legacy Plain-Text Log:** `%APPDATA%\com.codeskill.lockdown\lockdown.log`
- **Diagnostic Export:** Click **Save Diagnostic Log Bundle (.zip)** on `/lockdown-system-check`.

---

## 3. Running Locally & Unsigned Builds

If Windows Defender SmartScreen prompts *"Windows protected your PC"* on an unsigned installer, click **More info → Run anyway**, or unblock via PowerShell:
```powershell
Unblock-File -Path .\CodeSkill-LockDown-Setup.exe
.\CodeSkill-LockDown-Setup.exe
```

**Local Development & Verification (on Windows):**
```powershell
cd codeskill-lockdown-windows
npm install
npm run tauri:dev
```
```powershell
cargo check --manifest-path codeskill-lockdown-windows/src-tauri/Cargo.toml
cargo test --manifest-path codeskill-lockdown-windows/src-tauri/Cargo.toml
node --check codeskill-lockdown-windows/dist-isolation/index.js
```

---

## 4. Packaging & CI/CD Release

- **Local Windows NSIS Build:**
  ```powershell
  cd codeskill-lockdown-windows
  npm install
  npm run build:windows
  ```
  Outputs the NSIS installer (`.exe`) under `codeskill-lockdown-windows\src-tauri\target\release\bundle\nsis\`.
- **Automated CI:** [`.github/workflows/lockdown-release.yml`](../.github/workflows/lockdown-release.yml) builds `build-windows` (`windows-latest`, `--bundles nsis`) only when `codeskill-lockdown-windows/**` (excluding `*.md`) changes, and publishes `CodeSkill-LockDown-Setup.exe`, `CodeSkill-LockDown-<version>-Setup.exe`, `SHA256SUMS-windows.txt`, and `release-manifest-windows.json` on merges to `main` or `lockdown-v*` tags.
