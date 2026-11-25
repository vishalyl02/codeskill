use super::PermissionChecklistItem;
use tauri::AppHandle;

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


pub fn inspect_live_permissions(
    _app: &AppHandle,
    require_camera: bool,
    require_microphone: bool,
) -> Vec<PermissionChecklistItem> {
    let mut items: Vec<PermissionChecklistItem> = vec![];

    // Camera — only if assessment needs it
    if require_camera {
        items.push(PermissionChecklistItem {
            id: "camera".to_string(),
            name: "Camera Access".to_string(),
            description: "Allows video proctoring and candidate identity verification during exams.".to_string(),
            status: check_camera_status(),
            required: true,
            action_type: "open_settings".to_string(),
            action_payload: None,
            settings_target: Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera".to_string()),
        });
    }

    // Microphone — only if assessment needs it
    if require_microphone {
        items.push(PermissionChecklistItem {
            id: "microphone".to_string(),
            name: "Microphone Access".to_string(),
            description: "Allows audio environment proctoring and ambient noise monitoring.".to_string(),
            status: check_microphone_status(),
            required: true,
            action_type: "open_settings".to_string(),
            action_payload: None,
            settings_target: Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone".to_string()),
        });
    }

    // Accessibility — always required (kiosk keyboard guard)
    items.push(PermissionChecklistItem {
        id: "accessibility".to_string(),
        name: "Accessibility & Kiosk Guard".to_string(),
        description: "Enables hardware-level keyboard protection to block OS switcher escapes (Cmd+Tab, Spotlight, Mission Control).".to_string(),
        status: check_accessibility_status(),
        required: true,
        action_type: "open_settings".to_string(),
        action_payload: None,
        settings_target: Some("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility".to_string()),
    });

    // Screen capture — always required (anti-cheat overlay detection)
    items.push(PermissionChecklistItem {
        id: "screen_capture".to_string(),
        name: "Screen Recording & Display Integrity".to_string(),
        description: "Permits LockDown to inspect screen capture state and block unauthorized mirroring, broadcast, or stealth overlays.".to_string(),
        status: check_screen_capture_status(),
        required: true,
        action_type: "open_settings".to_string(),
        action_payload: None,
        settings_target: Some("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture".to_string()),
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
            let status = request_microphone_access();
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
            let status = request_accessibility_access();
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
            let status = request_screen_capture_access();
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
