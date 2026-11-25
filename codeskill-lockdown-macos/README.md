# CodeSkill LockDown

> **Official Cross-Platform Secure Examination Browser for CodeSkill**  
> Built with Tauri v2, Rust, WebKit/WebView2, and cross-platform native OS security layers.

---

## 1. Supported Operating Systems & Security Capabilities

| Platform | Kiosk Enforcement | Keyboard Interception | Hardware Probing | Anti-Cheat & Runtime Integrity |
| :--- | :--- | :--- | :--- | :--- |
| **macOS** | `NSApplicationPresentationOptions` (kioskMode, hideDock, disableProcessSwitching) | `CGEventTap` keyboard interceptor + `IOHIDManager` | AVFoundation camera & microphone, `CGDisplay` topology | Anti-debugging (`sysctl` `P_TRACED`), VM detection, ad-hoc bundle re-signing |
| **Windows** | `CreateDesktopW` + `SwitchDesktop` isolated desktop | `SetWindowsHookExW(WH_KEYBOARD_LL)` blocking Win keys, Alt+Tab, Alt+Esc, PrintScreen | Registry `CapabilityAccessManager\ConsentStore` for webcam/mic | `DisableTaskMgr` registry locks, `explorer.exe` shell suppression, DLL injection detection |
| **Linux** | Wayland `cage` kiosk compositor + cgroup v2 containment | `XGrabKeyboard` with `GrabModeAsync` | `/dev/video*` V4L2 device inspection, `/dev/snd` + PipeWire/PulseAudio | `systemd-inhibit` sleep/lid lock, `LD_PRELOAD` detection, `TracerPid` inspection |

---

## 2. Running Without Developer Certificates (Testing & Local Dev)

In development and staging environments prior to purchasing Apple Developer ID and Microsoft Authenticode/EV certificates, operating systems display security warnings for unsigned or ad-hoc signed executables. Use the following commands to run without warnings:

### macOS
Gatekeeper attaches `com.apple.quarantine` to binaries downloaded from a web browser, reporting *"CodeSkill LockDown is damaged and can't be opened"*.
- **Strip Quarantine via Terminal:**
  ```bash
  xattr -cr /Applications/"CodeSkill LockDown.app"
  # Or if downloaded to ~/Downloads:
  xattr -d com.apple.quarantine ~/Downloads/codeskill-lockdown.dmg
  ```
- **Finder Bypass:** Right-click `CodeSkill LockDown.app` $\rightarrow$ Hold `Option` and click **Open** $\rightarrow$ Click **Open**.
- **Developer Local Run:**
  ```bash
  npm run tauri:dev
  ```

### Windows
Microsoft Defender SmartScreen flags unsigned executables with *"Windows protected your PC"*.
- **SmartScreen Bypass:** Click **"More info"** on the blue dialog $\rightarrow$ Click **"Run anyway"**.
- **PowerShell Unblock Command:**
  ```powershell
  # For NSIS Setup Installer (.exe):
  Unblock-File -Path .\CodeSkill-LockDown-Setup.exe
  .\CodeSkill-LockDown-Setup.exe
  # Or for standalone executable:
  Unblock-File -Path .\codeskill-lockdown.exe
  .\codeskill-lockdown.exe
  ```
- **Developer Local Run (on Windows):**
  ```powershell
  npm install
  npm run build:windows
  npm run tauri:dev
  ```

### Linux
Linux does not require paid certificates; standard Unix executable permissions apply:
- **Debian / Ubuntu Package:**
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

---

## 3. Production Compilation & Packaging

Cross-platform packaging of native desktop installers requires running on the respective operating system or in CI:

| Target | Generated Asset | Build Requirement |
| :--- | :--- | :--- |
| **macOS** | `codeskill-lockdown.dmg` (~11 MB) | Built on macOS via `npm run tauri:build` |
| **Windows** | `CodeSkill-LockDown-Setup.exe` (~15 MB) | Built on Windows or GitHub Actions (`windows-latest`) via NSIS (`npm run build:windows`) |
| **Linux** | `codeskill-lockdown.deb` (~12 MB) / `.AppImage` | Built on Ubuntu 22.04 or GitHub Actions (`ubuntu-22.04`) via `dpkg` |

The automated release workflow in [`.github/workflows/lockdown-release.yml`](../.github/workflows/lockdown-release.yml) runs across all three platforms concurrently upon pushing any tag matching `lockdown-v*`.
