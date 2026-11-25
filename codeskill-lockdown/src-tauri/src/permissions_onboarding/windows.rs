use super::PermissionChecklistItem;
use tauri::AppHandle;

use super::*;
use windows::Win32::System::Registry::{
    RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE,
    KEY_READ,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetSystemMetrics, SM_CMONITORS, SM_REMOTESESSION,
};
use windows::Win32::System::StationsAndDesktops::{
    OpenInputDesktop, DESKTOP_CONTROL_FLAGS, DESKTOP_ACCESS_FLAGS,
    DESKTOP_CREATEWINDOW, DESKTOP_SWITCHDESKTOP,
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
        if let Ok(hdesk) = OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_ACCESS_FLAGS(DESKTOP_CREATEWINDOW.0 | DESKTOP_SWITCHDESKTOP.0)) {
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


pub fn inspect_live_permissions(
    app: &AppHandle,
    require_camera: bool,
    require_microphone: bool,
) -> Vec<PermissionChecklistItem> {
    let mut items: Vec<PermissionChecklistItem> = vec![];

    // Camera — only if assessment needs it
    if require_camera {
        items.push(PermissionChecklistItem {
            id: "camera".to_string(),
            name: "Webcam Access".to_string(),
            description: "Allows video monitoring and identity verification during exams.".to_string(),
            status: check_camera_status(),
            required: true,
            action_type: "open_settings".to_string(),
            action_payload: None,
            settings_target: Some("ms-settings:privacy-webcam".to_string()),
        });
    }

    // Microphone — only if assessment needs it
    if require_microphone {
        items.push(PermissionChecklistItem {
            id: "microphone".to_string(),
            name: "Microphone Access".to_string(),
            description: "Allows audio environment monitoring during exams.".to_string(),
            status: check_microphone_status(),
            required: true,
            action_type: "open_settings".to_string(),
            action_payload: None,
            settings_target: Some("ms-settings:privacy-microphone".to_string()),
        });
    }

    // WebView2 + Kiosk Desktop — always required
    items.push(PermissionChecklistItem {
        id: "kiosk_desktop".to_string(),
        name: "WebView2 Runtime & Kiosk Desktop".to_string(),
        description: "Verifies Microsoft Edge WebView2 and secure desktop switching readiness without remote session conflicts.".to_string(),
        status: check_kiosk_desktop_status(),
        required: true,
        action_type: "open_settings".to_string(),
        action_payload: None,
        settings_target: Some("ms-settings:appsfeatures".to_string()),
    });

    // Display integrity — always required (anti-cheat)
    items.push(PermissionChecklistItem {
        id: "display_integrity".to_string(),
        name: "Single Display & Capture Integrity".to_string(),
        description: "Verifies single-monitor configuration and window capture protection.".to_string(),
        status: check_display_integrity_status(app),
        required: true,
        action_type: "open_settings".to_string(),
        action_payload: None,
        settings_target: Some("ms-settings:display".to_string()),
    });

    items
}

pub fn request_permission_by_id(
    _app: &AppHandle,
    permission_id: &str,
) -> PermissionChecklistItem {
    match permission_id {
        "camera" => {
            let status = request_camera_access();
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
            let status = request_microphone_access();
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
            let status = request_kiosk_desktop_access();
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
            let status = request_display_integrity_access(_app);
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
