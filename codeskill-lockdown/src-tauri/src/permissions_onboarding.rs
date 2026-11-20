use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::security::log_diagnostic_entry;

#[derive(Default)]
pub struct StartupPermissionsState {
    pub pending_launch_url: Mutex<Option<String>>,
}

impl StartupPermissionsState {
    pub fn new() -> Self {
        Self {
            pending_launch_url: Mutex::new(None),
        }
    }
}

pub fn current_platform() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "linux")]
    {
        "linux"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "macos"
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionStatus {
    Granted,
    NeedsAction,
    Denied,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PermissionChecklistItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub status: String, // "granted" | "needs_action" | "denied"
    pub required: bool,
    pub action_type: String, // "request" | "open_settings" | "shell_command" | "info"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_payload: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settings_target: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupPermissionChecklistState {
    pub platform: String,
    pub onboarding_completed: bool,
    pub all_required_granted: bool,
    pub items: Vec<PermissionChecklistItem>,
    pub verified_at_ms: u64,
    pub client_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_exam_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PermissionsSetupPersistedState {
    pub onboarding_completed: bool,
    pub verified_at_ms: u64,
    pub client_version: String,
    pub platform: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub portal_restore_token: Option<String>,
    pub permissions: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteOnboardingResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_url: Option<String>,
}

pub fn get_permissions_state_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to locate app_data_dir: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app_data_dir: {}", e))?;
    Ok(dir.join("permissions_setup_state.json"))
}

pub fn load_persisted_permissions_state(app: &AppHandle) -> Option<PermissionsSetupPersistedState> {
    let path = get_permissions_state_file_path(app).ok()?;
    if !path.exists() {
        return None;
    }
    let data = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

pub fn save_persisted_permissions_state(
    app: &AppHandle,
    state: &PermissionsSetupPersistedState,
) -> Result<(), String> {
    let path = get_permissions_state_file_path(app)?;
    let parent = path.parent().ok_or("Invalid app data directory path")?;
    let temp_path = parent.join(format!(
        "permissions_setup_state.json.tmp.{}",
        uuid::Uuid::new_v4()
    ));

    let json = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize permissions state: {}", e))?;
    fs::write(&temp_path, json).map_err(|e| format!("Failed to write temporary state file: {}", e))?;

    fs::rename(&temp_path, &path)
        .map_err(|e| format!("Failed to atomically replace permissions_setup_state.json: {}", e))?;

    Ok(())
}

pub fn save_state_atomic_to_path(
    file_path: &Path,
    state: &PermissionsSetupPersistedState,
) -> Result<(), String> {
    let parent = file_path.parent().ok_or("Invalid path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temp_path = parent.join(format!(
        "permissions_setup_state.json.tmp.{}",
        uuid::Uuid::new_v4()
    ));

    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(&temp_path, json).map_err(|e| e.to_string())?;
    fs::rename(&temp_path, file_path).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Platform-Specific Live Check Implementations
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
mod macos_impl {
    use objc2::runtime::AnyClass;
    use objc2_foundation::NSString;
    use std::sync::mpsc::channel;

    extern "C" {
        fn AXIsProcessTrustedWithOptions(options: *const std::ffi::c_void) -> bool;
        fn CGPreflightScreenCaptureAccess() -> bool;
        fn CGRequestScreenCaptureAccess() -> bool;
    }

    pub fn check_camera_status() -> String {
        unsafe {
            if let Some(cls) = AnyClass::get("AVCaptureDevice") {
                let ns_media_type = NSString::from_str("vide");
                let status: isize =
                    objc2::msg_send![cls, authorizationStatusForMediaType: &*ns_media_type];
                match status {
                    3 => "granted".to_string(),
                    2 | 1 => "denied".to_string(),
                    0 => "needs_action".to_string(),
                    _ => "needs_action".to_string(),
                }
            } else {
                "granted".to_string()
            }
        }
    }

    pub fn request_camera_access() -> String {
        let initial_status = check_camera_status();
        if initial_status == "needs_action" {
            unsafe {
                if let Some(cls) = AnyClass::get("AVCaptureDevice") {
                    let ns_media_type = NSString::from_str("vide");
                    let (tx, rx) = channel();
                    let block = block2::RcBlock::new(move |granted: objc2::runtime::Bool| {
                        let _ = tx.send(granted.as_bool());
                    });
                    let _: () = objc2::msg_send![
                        cls,
                        requestAccessForMediaType: &*ns_media_type,
                        completionHandler: &*block
                    ];
                    let _ = rx.recv_timeout(std::time::Duration::from_millis(500));
                }
            }
        }
        let status = check_camera_status();
        if status != "granted" {
            let _ = crate::security::open_macos_privacy_pane("camera");
        }
        check_camera_status()
    }

    pub fn check_microphone_status() -> String {
        unsafe {
            if let Some(cls) = AnyClass::get("AVCaptureDevice") {
                let ns_media_type = NSString::from_str("soun");
                let status: isize =
                    objc2::msg_send![cls, authorizationStatusForMediaType: &*ns_media_type];
                match status {
                    3 => "granted".to_string(),
                    2 | 1 => "denied".to_string(),
                    0 => "needs_action".to_string(),
                    _ => "needs_action".to_string(),
                }
            } else {
                "granted".to_string()
            }
        }
    }

    pub fn request_microphone_access() -> String {
        let initial_status = check_microphone_status();
        if initial_status == "needs_action" {
            unsafe {
                if let Some(cls) = AnyClass::get("AVCaptureDevice") {
                    let ns_media_type = NSString::from_str("soun");
                    let (tx, rx) = channel();
                    let block = block2::RcBlock::new(move |granted: objc2::runtime::Bool| {
                        let _ = tx.send(granted.as_bool());
                    });
                    let _: () = objc2::msg_send![
                        cls,
                        requestAccessForMediaType: &*ns_media_type,
                        completionHandler: &*block
                    ];
                    let _ = rx.recv_timeout(std::time::Duration::from_millis(500));
                }
            }
        }
        let status = check_microphone_status();
        if status != "granted" {
            let _ = crate::security::open_macos_privacy_pane("microphone");
        }
        check_microphone_status()
    }

    pub fn check_accessibility_status() -> String {
        use core_foundation::base::TCFType;
        use core_foundation::boolean::CFBoolean;
        use core_foundation::dictionary::CFDictionary;
        use core_foundation::string::CFString;

        unsafe {
            let key = CFString::new("AXTrustedCheckOptionPrompt");
            let val = CFBoolean::false_value();
            let dict = CFDictionary::from_CFType_pairs(&[(key, val)]);
            if AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef() as *const std::ffi::c_void)
            {
                "granted".to_string()
            } else {
                "needs_action".to_string()
            }
        }
    }

    pub fn request_accessibility_access() -> String {
        use core_foundation::base::TCFType;
        use core_foundation::boolean::CFBoolean;
        use core_foundation::dictionary::CFDictionary;
        use core_foundation::string::CFString;

        unsafe {
            let key = CFString::new("AXTrustedCheckOptionPrompt");
            let val = CFBoolean::true_value();
            let dict = CFDictionary::from_CFType_pairs(&[(key, val)]);
            let _ =
                AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef() as *const std::ffi::c_void);
        }
        let _ = crate::security::open_macos_privacy_pane("accessibility");
        check_accessibility_status()
    }

    pub fn check_screen_capture_status() -> String {
        unsafe {
            if CGPreflightScreenCaptureAccess() {
                "granted".to_string()
            } else {
                "needs_action".to_string()
            }
        }
    }

    pub fn request_screen_capture_access() -> String {
        unsafe {
            let _ = CGRequestScreenCaptureAccess();
        }
        let _ = crate::security::open_macos_privacy_pane("screen_capture");
        check_screen_capture_status()
    }
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::*;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE,
        KEY_READ,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CMONITORS, SM_REMOTESESSION,
    };
    use windows::Win32::System::StationsAndDesktops::{
        OpenInputDesktop, DESKTOP_CREATEWINDOW, DESKTOP_SWITCHDESKTOP,
    };

    fn query_consent_store(device: &str) -> String {
        unsafe {
            for root_key in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
                let subkey = format!(
                    "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\{}",
                    device
                );
                let wide: Vec<u16> = subkey.encode_utf16().chain(std::iter::once(0)).collect();
                let mut key = HKEY::default();
                if RegOpenKeyExW(
                    root_key,
                    windows::core::PCWSTR(wide.as_ptr()),
                    0,
                    KEY_READ,
                    &mut key,
                )
                .is_ok()
                {
                    let val_name = windows::core::w!("Value");
                    let mut buf = [0u16; 64];
                    let mut size = (buf.len() * 2) as u32;
                    if RegQueryValueExW(
                        key,
                        val_name,
                        None,
                        None,
                        Some(buf.as_mut_ptr() as *mut u8),
                        Some(&mut size),
                    )
                    .is_ok()
                    {
                        let s = String::from_utf16_lossy(&buf);
                        let _ = RegCloseKey(key);
                        if s.to_lowercase().starts_with("allow") {
                            return "granted".to_string();
                        } else if s.to_lowercase().starts_with("deny") {
                            return "denied".to_string();
                        }
                    }
                    let _ = RegCloseKey(key);
                }
            }
        }
        "granted".to_string()
    }

    pub fn check_camera_status() -> String {
        query_consent_store("webcam")
    }

    pub fn request_camera_access() -> String {
        let _ = std::process::Command::new("cmd")
            .args(&["/c", "start", "ms-settings:privacy-webcam"])
            .spawn();
        check_camera_status()
    }

    pub fn check_microphone_status() -> String {
        query_consent_store("microphone")
    }

    pub fn request_microphone_access() -> String {
        let _ = std::process::Command::new("cmd")
            .args(&["/c", "start", "ms-settings:privacy-microphone"])
            .spawn();
        check_microphone_status()
    }

    fn check_webview2_installed() -> bool {
        unsafe {
            let subkeys = [
                "Software\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-9E4A-44AA-8236-BD1A8F34E137}",
                "Software\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-9E4A-44AA-8236-BD1A8F34E137}",
            ];
            for root_key in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
                for subkey in subkeys {
                    let wide: Vec<u16> = subkey.encode_utf16().chain(std::iter::once(0)).collect();
                    let mut key = HKEY::default();
                    if RegOpenKeyExW(
                        root_key,
                        windows::core::PCWSTR(wide.as_ptr()),
                        0,
                        KEY_READ,
                        &mut key,
                    )
                    .is_ok()
                    {
                        let val_name = windows::core::w!("pv");
                        let mut buf = [0u16; 64];
                        let mut size = (buf.len() * 2) as u32;
                        let res = RegQueryValueExW(
                            key,
                            val_name,
                            None,
                            None,
                            Some(buf.as_mut_ptr() as *mut u8),
                            Some(&mut size),
                        );
                        let _ = RegCloseKey(key);
                        if res.is_ok() && size > 0 {
                            return true;
                        }
                    }
                }
            }
        }
        true
    }

    pub fn check_kiosk_desktop_status() -> String {
        unsafe {
            if GetSystemMetrics(SM_REMOTESESSION) != 0 {
                return "needs_action".to_string();
            }
            if !check_webview2_installed() {
                return "needs_action".to_string();
            }
            if let Ok(hdesk) = OpenInputDesktop(0, false, DESKTOP_CREATEWINDOW | DESKTOP_SWITCHDESKTOP) {
                let _ = windows::Win32::System::StationsAndDesktops::CloseDesktop(hdesk);
            } else {
                return "needs_action".to_string();
            }
        }
        "granted".to_string()
    }

    pub fn request_kiosk_desktop_access() -> String {
        let _ = std::process::Command::new("cmd")
            .args(&["/c", "start", "ms-settings:appsfeatures"])
            .spawn();
        check_kiosk_desktop_status()
    }

    pub fn check_display_integrity_status(app: &AppHandle) -> String {
        let allow_secondary = app
            .try_state::<crate::attestation::AttestationState>()
            .map(|s| s.allow_secondary_display.load(std::sync::atomic::Ordering::Relaxed))
            .unwrap_or(false);

        unsafe {
            let count = GetSystemMetrics(SM_CMONITORS);
            if count <= 1 || allow_secondary {
                "granted".to_string()
            } else {
                "needs_action".to_string()
            }
        }
    }

    pub fn request_display_integrity_access(app: &AppHandle) -> String {
        let _ = std::process::Command::new("cmd")
            .args(&["/c", "start", "ms-settings:display"])
            .spawn();
        check_display_integrity_status(app)
    }
}

#[cfg(target_os = "linux")]
mod linux_impl {
    pub fn check_camera_status() -> String {
        let mut has_readable_video = false;
        let mut has_any_video = false;
        if let Ok(entries) = std::fs::read_dir("/dev") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("video") {
                    has_any_video = true;
                    if std::fs::OpenOptions::new().read(true).open(entry.path()).is_ok() {
                        has_readable_video = true;
                        break;
                    }
                }
            }
        }
        if has_readable_video {
            "granted".to_string()
        } else if has_any_video {
            "needs_action".to_string()
        } else {
            "needs_action".to_string()
        }
    }

    pub fn request_camera_access() -> String {
        let _ = std::process::Command::new("gnome-control-center")
            .arg("privacy")
            .spawn()
            .or_else(|_| {
                std::process::Command::new("systemsettings")
                    .arg("kcm_permissions")
                    .spawn()
            });
        check_camera_status()
    }

    pub fn check_microphone_status() -> String {
        let has_snd = std::path::Path::new("/dev/snd").exists();
        let readable_snd = std::fs::read_dir("/dev/snd").map(|mut e| e.next().is_some()).unwrap_or(false);
        let pulse_or_pipewire = std::process::Command::new("wpctl")
            .arg("status")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
            || std::process::Command::new("pactl")
                .arg("info")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
        if (has_snd && readable_snd) || pulse_or_pipewire {
            "granted".to_string()
        } else {
            "needs_action".to_string()
        }
    }

    pub fn request_microphone_access() -> String {
        let _ = std::process::Command::new("gnome-control-center")
            .arg("sound")
            .spawn()
            .or_else(|_| std::process::Command::new("pavucontrol").spawn());
        check_microphone_status()
    }

    pub fn check_kiosk_compositor_status() -> String {
        let session_type = std::env::var("XDG_SESSION_TYPE")
            .unwrap_or_default()
            .to_lowercase();
        if session_type == "wayland" {
            let has_cage = std::process::Command::new("which")
                .arg("cage")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
            if has_cage {
                "granted".to_string()
            } else {
                "needs_action".to_string()
            }
        } else {
            "needs_action".to_string()
        }
    }

    pub fn request_kiosk_compositor_access() -> String {
        check_kiosk_compositor_status()
    }

    pub fn check_portal_session_status() -> String {
        let has_portal_process = std::process::Command::new("pgrep")
            .arg("-f")
            .arg("xdg-desktop-portal")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        let has_portal_systemd = std::process::Command::new("systemctl")
            .args(&["--user", "is-active", "xdg-desktop-portal"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if has_portal_process || has_portal_systemd {
            "granted".to_string()
        } else {
            "needs_action".to_string()
        }
    }

    pub fn request_portal_session_access() -> String {
        let _ = std::process::Command::new("systemctl")
            .args(&["--user", "start", "xdg-desktop-portal"])
            .spawn();
        check_portal_session_status()
    }
}

// ---------------------------------------------------------------------------
// Permission Inspection & Dispatch
// ---------------------------------------------------------------------------

pub fn inspect_live_permissions(_app: &AppHandle) -> Vec<PermissionChecklistItem> {
    let platform = current_platform();
    match platform {
        "macos" => {
            #[cfg(target_os = "macos")]
            {
                vec![
                    PermissionChecklistItem {
                        id: "camera".to_string(),
                        name: "Camera Access".to_string(),
                        description: "Allows video proctoring and candidate identity verification during exams.".to_string(),
                        status: macos_impl::check_camera_status(),
                        required: true,
                        action_type: "open_settings".to_string(),
                        action_payload: None,
                        settings_target: Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera".to_string()),
                    },
                    PermissionChecklistItem {
                        id: "microphone".to_string(),
                        name: "Microphone Access".to_string(),
                        description: "Allows audio environment proctoring and ambient noise monitoring.".to_string(),
                        status: macos_impl::check_microphone_status(),
                        required: true,
                        action_type: "open_settings".to_string(),
                        action_payload: None,
                        settings_target: Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone".to_string()),
                    },
                    PermissionChecklistItem {
                        id: "accessibility".to_string(),
                        name: "Accessibility & Kiosk Guard".to_string(),
                        description: "Enables hardware-level keyboard protection to block OS switcher escapes (Cmd+Tab, Spotlight, Mission Control).".to_string(),
                        status: macos_impl::check_accessibility_status(),
                        required: true,
                        action_type: "open_settings".to_string(),
                        action_payload: None,
                        settings_target: Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility".to_string()),
                    },
                    PermissionChecklistItem {
                        id: "screen_capture".to_string(),
                        name: "Screen Recording & Display Integrity".to_string(),
                        description: "Permits LockDown to inspect screen capture state and block unauthorized mirroring, broadcast, or stealth overlays.".to_string(),
                        status: macos_impl::check_screen_capture_status(),
                        required: true,
                        action_type: "open_settings".to_string(),
                        action_payload: None,
                        settings_target: Some("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture".to_string()),
                    },
                ]
            }
            #[cfg(not(target_os = "macos"))]
            {
                vec![]
            }
        }
        "windows" => {
            #[cfg(target_os = "windows")]
            {
                vec![
                    PermissionChecklistItem {
                        id: "camera".to_string(),
                        name: "Webcam Access".to_string(),
                        description: "Allows video monitoring and identity verification during exams.".to_string(),
                        status: windows_impl::check_camera_status(),
                        required: true,
                        action_type: "open_settings".to_string(),
                        action_payload: None,
                        settings_target: Some("ms-settings:privacy-webcam".to_string()),
                    },
                    PermissionChecklistItem {
                        id: "microphone".to_string(),
                        name: "Microphone Access".to_string(),
                        description: "Allows audio environment monitoring during exams.".to_string(),
                        status: windows_impl::check_microphone_status(),
                        required: true,
                        action_type: "open_settings".to_string(),
                        action_payload: None,
                        settings_target: Some("ms-settings:privacy-microphone".to_string()),
                    },
                    PermissionChecklistItem {
                        id: "kiosk_desktop".to_string(),
                        name: "WebView2 Runtime & Kiosk Desktop".to_string(),
                        description: "Verifies Microsoft Edge WebView2 and secure desktop switching readiness without remote session conflicts.".to_string(),
                        status: windows_impl::check_kiosk_desktop_status(),
                        required: true,
                        action_type: "open_settings".to_string(),
                        action_payload: None,
                        settings_target: Some("ms-settings:appsfeatures".to_string()),
                    },
                    PermissionChecklistItem {
                        id: "display_integrity".to_string(),
                        name: "Single Display & Capture Integrity".to_string(),
                        description: "Verifies single-monitor configuration and window capture protection.".to_string(),
                        status: windows_impl::check_display_integrity_status(_app),
                        required: true,
                        action_type: "open_settings".to_string(),
                        action_payload: None,
                        settings_target: Some("ms-settings:display".to_string()),
                    },
                ]
            }
            #[cfg(not(target_os = "windows"))]
            {
                vec![]
            }
        }
        "linux" => {
            #[cfg(target_os = "linux")]
            {
                let is_wayland = std::env::var("XDG_SESSION_TYPE")
                    .unwrap_or_default()
                    .to_lowercase() == "wayland";
                let compositor_desc = if is_wayland {
                    "Ensures Wayland session with Cage kiosk compositor is configured for exam lockdown.".to_string()
                } else {
                    "X11 detected — switch to a Wayland session at login or ask your instructor/admin for an X11 waiver.".to_string()
                };
                let compositor_payload = if is_wayland {
                    Some("sudo apt install cage".to_string())
                } else {
                    None
                };

                let portal_status = linux_impl::check_portal_session_status();
                let portal_payload = if portal_status != "granted" {
                    Some("systemctl --user start xdg-desktop-portal".to_string())
                } else {
                    None
                };

                vec![
                    PermissionChecklistItem {
                        id: "camera".to_string(),
                        name: "Camera & V4L2 Device Access".to_string(),
                        description: "Grants video capture device permissions for exam proctoring.".to_string(),
                        status: linux_impl::check_camera_status(),
                        required: true,
                        action_type: "open_settings".to_string(),
                        action_payload: Some("sudo usermod -aG video $USER".to_string()),
                        settings_target: Some("gnome-control-center privacy".to_string()),
                    },
                    PermissionChecklistItem {
                        id: "microphone".to_string(),
                        name: "Microphone & Sound Server Access".to_string(),
                        description: "Grants PipeWire/PulseAudio capture access for exam proctoring.".to_string(),
                        status: linux_impl::check_microphone_status(),
                        required: true,
                        action_type: "open_settings".to_string(),
                        action_payload: Some("sudo usermod -aG audio $USER".to_string()),
                        settings_target: Some("gnome-control-center sound".to_string()),
                    },
                    PermissionChecklistItem {
                        id: "kiosk_compositor".to_string(),
                        name: "Display Server & Kiosk Compositor".to_string(),
                        description: compositor_desc,
                        status: linux_impl::check_kiosk_compositor_status(),
                        required: true,
                        action_type: "info".to_string(),
                        action_payload: compositor_payload,
                        settings_target: None,
                    },
                    PermissionChecklistItem {
                        id: "portal_session".to_string(),
                        name: "XDG Desktop Portal Persistence".to_string(),
                        description: "Ensures persistent desktop portal session so permissions survive across app restarts.".to_string(),
                        status: portal_status,
                        required: true,
                        action_type: "info".to_string(),
                        action_payload: portal_payload,
                        settings_target: None,
                    },
                ]
            }
            #[cfg(not(target_os = "linux"))]
            {
                vec![]
            }
        }
        _ => vec![],
    }
}

pub fn request_permission_by_id(_app: &AppHandle, permission_id: &str) -> PermissionChecklistItem {
    let platform = current_platform();
    match platform {
        "macos" => {
            #[cfg(target_os = "macos")]
            {
                match permission_id {
                    "camera" => {
                        let status = macos_impl::request_camera_access();
                        PermissionChecklistItem {
                            id: "camera".to_string(),
                            name: "Camera Access".to_string(),
                            description: "Allows video proctoring and candidate identity verification during exams.".to_string(),
                            status,
                            required: true,
                            action_type: "open_settings".to_string(),
                            action_payload: None,
                            settings_target: Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera".to_string()),
                        }
                    }
                    "microphone" => {
                        let status = macos_impl::request_microphone_access();
                        PermissionChecklistItem {
                            id: "microphone".to_string(),
                            name: "Microphone Access".to_string(),
                            description: "Allows audio environment proctoring and ambient noise monitoring.".to_string(),
                            status,
                            required: true,
                            action_type: "open_settings".to_string(),
                            action_payload: None,
                            settings_target: Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone".to_string()),
                        }
                    }
                    "accessibility" => {
                        let status = macos_impl::request_accessibility_access();
                        PermissionChecklistItem {
                            id: "accessibility".to_string(),
                            name: "Accessibility & Kiosk Guard".to_string(),
                            description: "Enables hardware-level keyboard protection to block OS switcher escapes (Cmd+Tab, Spotlight, Mission Control).".to_string(),
                            status,
                            required: true,
                            action_type: "open_settings".to_string(),
                            action_payload: None,
                            settings_target: Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility".to_string()),
                        }
                    }
                    "screen_capture" => {
                        let status = macos_impl::request_screen_capture_access();
                        PermissionChecklistItem {
                            id: "screen_capture".to_string(),
                            name: "Screen Recording & Display Integrity".to_string(),
                            description: "Permits LockDown to inspect screen capture state and block unauthorized mirroring, broadcast, or stealth overlays.".to_string(),
                            status,
                            required: true,
                            action_type: "open_settings".to_string(),
                            action_payload: None,
                            settings_target: Some("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture".to_string()),
                        }
                    }
                    _ => PermissionChecklistItem {
                        id: permission_id.to_string(),
                        name: permission_id.to_string(),
                        description: "Unknown permission".to_string(),
                        status: "needs_action".to_string(),
                        required: false,
                        action_type: "info".to_string(),
                        action_payload: None,
                        settings_target: None,
                    },
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                PermissionChecklistItem {
                    id: permission_id.to_string(),
                    name: permission_id.to_string(),
                    description: "Fallback".to_string(),
                    status: "granted".to_string(),
                    required: true,
                    action_type: "info".to_string(),
                    action_payload: None,
                    settings_target: None,
                }
            }
        }
        "windows" => {
            #[cfg(target_os = "windows")]
            {
                match permission_id {
                    "camera" => {
                        let status = windows_impl::request_camera_access();
                        PermissionChecklistItem {
                            id: "camera".to_string(),
                            name: "Webcam Access".to_string(),
                            description: "Allows video monitoring and identity verification during exams.".to_string(),
                            status,
                            required: true,
                            action_type: "open_settings".to_string(),
                            action_payload: None,
                            settings_target: Some("ms-settings:privacy-webcam".to_string()),
                        }
                    }
                    "microphone" => {
                        let status = windows_impl::request_microphone_access();
                        PermissionChecklistItem {
                            id: "microphone".to_string(),
                            name: "Microphone Access".to_string(),
                            description: "Allows audio environment monitoring during exams.".to_string(),
                            status,
                            required: true,
                            action_type: "open_settings".to_string(),
                            action_payload: None,
                            settings_target: Some("ms-settings:privacy-microphone".to_string()),
                        }
                    }
                    "kiosk_desktop" => {
                        let status = windows_impl::request_kiosk_desktop_access();
                        PermissionChecklistItem {
                            id: "kiosk_desktop".to_string(),
                            name: "WebView2 Runtime & Kiosk Desktop".to_string(),
                            description: "Verifies Microsoft Edge WebView2 and secure desktop switching readiness without remote session conflicts.".to_string(),
                            status,
                            required: true,
                            action_type: "open_settings".to_string(),
                            action_payload: None,
                            settings_target: Some("ms-settings:appsfeatures".to_string()),
                        }
                    }
                    "display_integrity" => {
                        let status = windows_impl::request_display_integrity_access(_app);
                        PermissionChecklistItem {
                            id: "display_integrity".to_string(),
                            name: "Single Display & Capture Integrity".to_string(),
                            description: "Verifies single-monitor configuration and window capture protection.".to_string(),
                            status,
                            required: true,
                            action_type: "open_settings".to_string(),
                            action_payload: None,
                            settings_target: Some("ms-settings:display".to_string()),
                        }
                    }
                    _ => PermissionChecklistItem {
                        id: permission_id.to_string(),
                        name: permission_id.to_string(),
                        description: "Unknown permission".to_string(),
                        status: "needs_action".to_string(),
                        required: false,
                        action_type: "info".to_string(),
                        action_payload: None,
                        settings_target: None,
                    },
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                PermissionChecklistItem {
                    id: permission_id.to_string(),
                    name: permission_id.to_string(),
                    description: "Fallback".to_string(),
                    status: "granted".to_string(),
                    required: true,
                    action_type: "info".to_string(),
                    action_payload: None,
                    settings_target: None,
                }
            }
        }
        "linux" => {
            #[cfg(target_os = "linux")]
            {
                match permission_id {
                    "camera" => {
                        let status = linux_impl::request_camera_access();
                        PermissionChecklistItem {
                            id: "camera".to_string(),
                            name: "Camera & V4L2 Device Access".to_string(),
                            description: "Grants video capture device permissions for exam proctoring.".to_string(),
                            status,
                            required: true,
                            action_type: "open_settings".to_string(),
                            action_payload: Some("sudo usermod -aG video $USER".to_string()),
                            settings_target: Some("gnome-control-center privacy".to_string()),
                        }
                    }
                    "microphone" => {
                        let status = linux_impl::request_microphone_access();
                        PermissionChecklistItem {
                            id: "microphone".to_string(),
                            name: "Microphone & Sound Server Access".to_string(),
                            description: "Grants PipeWire/PulseAudio capture access for exam proctoring.".to_string(),
                            status,
                            required: true,
                            action_type: "open_settings".to_string(),
                            action_payload: Some("sudo usermod -aG audio $USER".to_string()),
                            settings_target: Some("gnome-control-center sound".to_string()),
                        }
                    }
                    "kiosk_compositor" => {
                        let status = linux_impl::request_kiosk_compositor_access();
                        PermissionChecklistItem {
                            id: "kiosk_compositor".to_string(),
                            name: "Display Server & Kiosk Compositor".to_string(),
                            description: "Ensures Wayland session with Cage kiosk compositor is configured for exam lockdown.".to_string(),
                            status,
                            required: true,
                            action_type: "info".to_string(),
                            action_payload: Some("sudo apt install cage".to_string()),
                            settings_target: None,
                        }
                    }
                    "portal_session" => {
                        let status = linux_impl::request_portal_session_access();
                        PermissionChecklistItem {
                            id: "portal_session".to_string(),
                            name: "XDG Desktop Portal Persistence".to_string(),
                            description: "Ensures persistent desktop portal session so permissions survive across app restarts.".to_string(),
                            status,
                            required: true,
                            action_type: "info".to_string(),
                            action_payload: None,
                            settings_target: None,
                        }
                    }
                    _ => PermissionChecklistItem {
                        id: permission_id.to_string(),
                        name: permission_id.to_string(),
                        description: "Unknown permission".to_string(),
                        status: "needs_action".to_string(),
                        required: false,
                        action_type: "info".to_string(),
                        action_payload: None,
                        settings_target: None,
                    },
                }
            }
            #[cfg(not(target_os = "linux"))]
            {
                PermissionChecklistItem {
                    id: permission_id.to_string(),
                    name: permission_id.to_string(),
                    description: "Fallback".to_string(),
                    status: "granted".to_string(),
                    required: true,
                    action_type: "info".to_string(),
                    action_payload: None,
                    settings_target: None,
                }
            }
        }
        _ => PermissionChecklistItem {
            id: permission_id.to_string(),
            name: permission_id.to_string(),
            description: "Fallback".to_string(),
            status: "granted".to_string(),
            required: true,
            action_type: "info".to_string(),
            action_payload: None,
            settings_target: None,
        },
    }
}

pub fn is_onboarding_needed(app: &AppHandle) -> bool {
    let persisted = load_persisted_permissions_state(app);
    match persisted {
        Some(state) if state.onboarding_completed => {
            // Live permission verification in < 50ms
            let items = inspect_live_permissions(app);
            let all_granted = items
                .iter()
                .filter(|i| i.required)
                .all(|i| i.status == "granted");
            !all_granted
        }
        _ => true,
    }
}

// ---------------------------------------------------------------------------
// Exposed Tauri Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_startup_permission_checklist(
    app: AppHandle,
) -> Result<StartupPermissionChecklistState, String> {
    eprintln!("[CodeSkill LockDown IPC] get_startup_permission_checklist invoked");
    let items = inspect_live_permissions(&app);
    let all_required_granted = items
        .iter()
        .filter(|i| i.required)
        .all(|i| i.status == "granted");

    let persisted = load_persisted_permissions_state(&app);
    let onboarding_completed = match persisted {
        Some(ref p) => p.onboarding_completed && all_required_granted,
        None => false,
    };

    let pending_exam_url = {
        let state = app.state::<StartupPermissionsState>();
        let lock = state.pending_launch_url.lock().unwrap();
        lock.clone()
    };

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    Ok(StartupPermissionChecklistState {
        platform: current_platform().to_string(),
        onboarding_completed,
        all_required_granted,
        items,
        verified_at_ms: now_ms,
        client_version: "1.0.0".to_string(),
        pending_exam_url,
    })
}

#[tauri::command]
pub fn request_os_permission(
    app: AppHandle,
    permission_id: String,
) -> Result<PermissionChecklistItem, String> {
    eprintln!("[CodeSkill LockDown IPC] request_os_permission invoked for: {}", permission_id);
    let item = request_permission_by_id(&app, &permission_id);
    Ok(item)
}

#[tauri::command]
pub fn complete_permission_onboarding(
    app: AppHandle,
) -> Result<CompleteOnboardingResult, String> {
    eprintln!("[CodeSkill LockDown IPC] complete_permission_onboarding invoked");
    let items = inspect_live_permissions(&app);
    let mut map = HashMap::new();
    for item in &items {
        map.insert(item.id.clone(), item.status.clone());
    }

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let existing_portal_token = load_persisted_permissions_state(&app).and_then(|p| p.portal_restore_token);

    let persisted = PermissionsSetupPersistedState {
        onboarding_completed: true,
        verified_at_ms: now_ms,
        client_version: "1.0.0".to_string(),
        platform: current_platform().to_string(),
        portal_restore_token: existing_portal_token,
        permissions: map,
    };

    save_persisted_permissions_state(&app, &persisted)?;

    log_diagnostic_entry(
        "INFO",
        "PERMISSIONS_ONBOARDING",
        "Permissions onboarding successfully completed and persisted to permissions_setup_state.json",
    );

    let target_url = {
        let state = app.state::<StartupPermissionsState>();
        let mut pending = state.pending_launch_url.lock().unwrap();
        pending.take()
    };

    if let Some(ref url_str) = target_url {
        // Lock assessment and persist session now that onboarding completed
        if let Ok(parsed) = url::Url::parse(url_str) {
            let mut exam_id = None;
            let mut token = None;
            for (k, v) in parsed.query_pairs() {
                if k == "examId" || k == "assessmentId" {
                    exam_id = Some(v.to_string());
                } else if k == "token" || k == "lockdownToken" {
                    token = Some(v.to_string());
                }
            }
            if exam_id.is_none() {
                if let Some(segments) = parsed.path_segments() {
                    for seg in segments {
                        if !seg.is_empty() && seg != "assessments" && seg != "start" && seg != "take" && seg != "launch" {
                            exam_id = Some(seg.to_string());
                            break;
                        }
                    }
                }
            }
            if let Some(id) = exam_id {
                let att_state = app.state::<crate::attestation::AttestationState>();
                if let Ok(mut locked) = att_state.locked_assessment_id.lock() {
                    *locked = Some(id.clone());
                }
                let _ = crate::state_persistence::save_persisted_exam_session(
                    app.clone(),
                    crate::state_persistence::PersistedExamSessionPatch {
                        assessment_id: Some(id.clone()),
                        auth_token: token.clone(),
                        ..Default::default()
                    },
                );
            }
        }

        if let Some(window) = app.get_webview_window("exam-kiosk") {
            let _ = window.set_focus();
            let _ = window.unminimize();
            if let Ok(target_url_obj) = url::Url::parse(url_str) {
                let _ = window.navigate(target_url_obj);
            }
        }
    }

    Ok(CompleteOnboardingResult {
        success: true,
        target_url,
    })
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permissions_persisted_state_serialization() {
        let mut map = HashMap::new();
        map.insert("camera".to_string(), "granted".to_string());
        map.insert("microphone".to_string(), "granted".to_string());
        map.insert("accessibility".to_string(), "granted".to_string());
        map.insert("screen_capture".to_string(), "granted".to_string());

        let state = PermissionsSetupPersistedState {
            onboarding_completed: true,
            verified_at_ms: 1732089600000,
            client_version: "1.0.0".to_string(),
            platform: "macos".to_string(),
            portal_restore_token: Some("sample-wayland-portal-token".to_string()),
            permissions: map,
        };

        let json = serde_json::to_string_pretty(&state).expect("Failed to serialize");
        assert!(json.contains("\"onboardingCompleted\": true"));
        assert!(json.contains("\"verifiedAtMs\": 1732089600000"));
        assert!(json.contains("\"portalRestoreToken\": \"sample-wayland-portal-token\""));
        assert!(json.contains("\"platform\": \"macos\""));

        let deserialized: PermissionsSetupPersistedState =
            serde_json::from_str(&json).expect("Failed to deserialize");
        assert_eq!(deserialized, state);
    }

    #[test]
    fn test_startup_permission_checklist_state_serialization() {
        let items = vec![
            PermissionChecklistItem {
                id: "camera".to_string(),
                name: "Camera Access".to_string(),
                description: "Proctoring camera access".to_string(),
                status: "granted".to_string(),
                required: true,
                action_type: "open_settings".to_string(),
                action_payload: None,
                settings_target: Some("x-apple.systempreferences:...".to_string()),
            },
            PermissionChecklistItem {
                id: "accessibility".to_string(),
                name: "Accessibility".to_string(),
                description: "Input guard".to_string(),
                status: "needs_action".to_string(),
                required: true,
                action_type: "open_settings".to_string(),
                action_payload: None,
                settings_target: None,
            },
        ];

        let state = StartupPermissionChecklistState {
            platform: "macos".to_string(),
            onboarding_completed: false,
            all_required_granted: false,
            items,
            verified_at_ms: 1732089600000,
            client_version: "1.0.0".to_string(),
            pending_exam_url: Some("http://localhost:3000/assessments/test-123/take".to_string()),
        };

        let json = serde_json::to_string(&state).expect("serialize checklist state");
        assert!(json.contains("\"allRequiredGranted\":false"));
        assert!(json.contains("\"pendingExamUrl\":\"http://localhost:3000/assessments/test-123/take\""));

        let deserialized: StartupPermissionChecklistState =
            serde_json::from_str(&json).expect("deserialize checklist state");
        assert_eq!(deserialized.items.len(), 2);
        assert_eq!(deserialized.platform, "macos");
    }

    #[test]
    fn test_atomic_save_and_load_state() {
        let temp_dir = std::env::temp_dir().join(format!("lockdown_test_{}", uuid::Uuid::new_v4()));
        let file_path = temp_dir.join("permissions_setup_state.json");

        let mut map = HashMap::new();
        map.insert("camera".to_string(), "granted".to_string());
        map.insert("microphone".to_string(), "granted".to_string());

        let state = PermissionsSetupPersistedState {
            onboarding_completed: true,
            verified_at_ms: 1000,
            client_version: "1.0.0".to_string(),
            platform: "windows".to_string(),
            portal_restore_token: None,
            permissions: map,
        };

        save_state_atomic_to_path(&file_path, &state).expect("atomic save");
        assert!(file_path.exists());

        let content = fs::read_to_string(&file_path).expect("read file");
        let loaded: PermissionsSetupPersistedState =
            serde_json::from_str(&content).expect("parse file");
        assert_eq!(loaded, state);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_revocation_logic_evaluation() {
        let items_all_granted = vec![
            PermissionChecklistItem {
                id: "camera".to_string(),
                name: "Camera".to_string(),
                description: "".to_string(),
                status: "granted".to_string(),
                required: true,
                action_type: "open_settings".to_string(),
                action_payload: None,
                settings_target: None,
            },
            PermissionChecklistItem {
                id: "microphone".to_string(),
                name: "Microphone".to_string(),
                description: "".to_string(),
                status: "granted".to_string(),
                required: true,
                action_type: "open_settings".to_string(),
                action_payload: None,
                settings_target: None,
            },
        ];

        let all_granted = items_all_granted.iter().filter(|i| i.required).all(|i| i.status == "granted");
        assert!(all_granted);

        let items_revoked = vec![
            PermissionChecklistItem {
                id: "camera".to_string(),
                name: "Camera".to_string(),
                description: "".to_string(),
                status: "denied".to_string(), // Revoked!
                required: true,
                action_type: "open_settings".to_string(),
                action_payload: None,
                settings_target: None,
            },
            PermissionChecklistItem {
                id: "microphone".to_string(),
                name: "Microphone".to_string(),
                description: "".to_string(),
                status: "granted".to_string(),
                required: true,
                action_type: "open_settings".to_string(),
                action_payload: None,
                settings_target: None,
            },
        ];

        let not_all_granted = items_revoked.iter().filter(|i| i.required).all(|i| i.status == "granted");
        assert!(!not_all_granted);
    }

    #[test]
    fn test_portal_token_preservation_in_persisted_state() {
        let temp_dir = std::env::temp_dir().join(format!("lockdown_portal_test_{}", uuid::Uuid::new_v4()));
        let file_path = temp_dir.join("permissions_setup_state.json");

        let mut map = HashMap::new();
        map.insert("camera".to_string(), "granted".to_string());
        map.insert("portal_session".to_string(), "granted".to_string());

        let state = PermissionsSetupPersistedState {
            onboarding_completed: true,
            verified_at_ms: 1732000000000,
            client_version: "1.0.0".to_string(),
            platform: "linux".to_string(),
            portal_restore_token: Some("xdg-desktop-portal-token-9988".to_string()),
            permissions: map,
        };

        save_state_atomic_to_path(&file_path, &state).expect("save state with portal token");
        let content = fs::read_to_string(&file_path).expect("read file");
        let loaded: PermissionsSetupPersistedState = serde_json::from_str(&content).expect("parse file");
        assert_eq!(loaded.portal_restore_token, Some("xdg-desktop-portal-token-9988".to_string()));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_startup_permissions_state_pending_url() {
        let state = StartupPermissionsState::new();
        {
            let mut lock = state.pending_launch_url.lock().unwrap();
            *lock = Some("http://localhost:3000/assessments/test-123/take".to_string());
        }

        let retrieved = {
            let mut lock = state.pending_launch_url.lock().unwrap();
            lock.take()
        };
        assert_eq!(retrieved, Some("http://localhost:3000/assessments/test-123/take".to_string()));

        let empty_now = {
            let lock = state.pending_launch_url.lock().unwrap();
            lock.clone()
        };
        assert!(empty_now.is_none());
    }

    #[test]
    fn test_corrupt_file_handling() {
        let temp_dir = std::env::temp_dir().join(format!("lockdown_corrupt_test_{}", uuid::Uuid::new_v4()));
        let file_path = temp_dir.join("permissions_setup_state.json");
        fs::create_dir_all(&temp_dir).unwrap();
        fs::write(&file_path, "INVALID_CORRUPTED_JSON{{{{").unwrap();

        let content = fs::read_to_string(&file_path).unwrap();
        let parsed: Result<PermissionsSetupPersistedState, _> = serde_json::from_str(&content);
        assert!(parsed.is_err());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_macos_live_permission_inspection() {
        let cam = macos_impl::check_camera_status();
        println!("Camera status: {}", cam);
        assert!(["granted", "needs_action", "denied"].contains(&cam.as_str()));

        let mic = macos_impl::check_microphone_status();
        println!("Microphone status: {}", mic);
        assert!(["granted", "needs_action", "denied"].contains(&mic.as_str()));

        let ax = macos_impl::check_accessibility_status();
        println!("Accessibility status: {}", ax);
        assert!(["granted", "needs_action", "denied"].contains(&ax.as_str()));

        let sc = macos_impl::check_screen_capture_status();
        println!("Screen capture status: {}", sc);
        assert!(["granted", "needs_action", "denied"].contains(&sc.as_str()));
    }
}
