use super::PermissionChecklistItem;
use tauri::AppHandle;

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


pub fn inspect_live_permissions(
    _app: &AppHandle,
    require_camera: bool,
    require_microphone: bool,
) -> Vec<PermissionChecklistItem> {
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

    let portal_status = check_portal_session_status();
    let portal_payload = if portal_status != "granted" {
        Some("systemctl --user start xdg-desktop-portal".to_string())
    } else {
        None
    };

    let mut items: Vec<PermissionChecklistItem> = vec![];

    // Camera — only if assessment needs it
    if require_camera {
        items.push(PermissionChecklistItem {
            id: "camera".to_string(),
            name: "Camera & V4L2 Device Access".to_string(),
            description: "Grants video capture device permissions for exam proctoring.".to_string(),
            status: check_camera_status(),
            required: true,
            action_type: "open_settings".to_string(),
            action_payload: Some("sudo usermod -aG video $USER".to_string()),
            settings_target: Some("gnome-control-center privacy".to_string()),
        });
    }

    // Microphone — only if assessment needs it
    if require_microphone {
        items.push(PermissionChecklistItem {
            id: "microphone".to_string(),
            name: "Microphone & Sound Server Access".to_string(),
            description: "Grants PipeWire/PulseAudio capture access for exam proctoring.".to_string(),
            status: check_microphone_status(),
            required: true,
            action_type: "open_settings".to_string(),
            action_payload: Some("sudo usermod -aG audio $USER".to_string()),
            settings_target: Some("gnome-control-center sound".to_string()),
        });
    }

    // Kiosk compositor — always required
    items.push(PermissionChecklistItem {
        id: "kiosk_compositor".to_string(),
        name: "Display Server & Kiosk Compositor".to_string(),
        description: compositor_desc,
        status: check_kiosk_compositor_status(),
        required: true,
        action_type: "info".to_string(),
        action_payload: compositor_payload,
        settings_target: None,
    });

    // XDG portal — always required (permission persistence)
    items.push(PermissionChecklistItem {
        id: "portal_session".to_string(),
        name: "XDG Desktop Portal Persistence".to_string(),
        description: "Ensures persistent desktop portal session so permissions survive across app restarts.".to_string(),
        status: portal_status,
        required: true,
        action_type: "info".to_string(),
        action_payload: portal_payload,
        settings_target: None,
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
            let status = request_microphone_access();
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
            let status = request_kiosk_compositor_access();
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
            let status = request_portal_session_access();
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
