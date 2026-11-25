use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::security::log_diagnostic_entry;

/// Runtime state shared across the permissions-onboarding flow.
/// `require_camera` and `require_microphone` are written by the deep-link
/// handler (from URL query params) and read by `inspect_live_permissions` so
/// that the checklist only shows permissions the assessment actually needs.
#[derive(Default)]
pub struct StartupPermissionsState {
    pub pending_launch_url: Mutex<Option<String>>,
    /// Whether the current assessment requires camera access (default: true – safe).
    pub require_camera: AtomicBool,
    /// Whether the current assessment requires microphone access (default: false).
    pub require_microphone: AtomicBool,
}

impl StartupPermissionsState {
    pub fn new() -> Self {
        Self {
            pending_launch_url: Mutex::new(None),
            require_camera: AtomicBool::new(true),
            require_microphone: AtomicBool::new(false),
        }
    }

    /// Called by the deep-link handler after parsing `useCamera` / `useMic` query params.
    pub fn set_media_requirements(&self, camera: bool, mic: bool) {
        self.require_camera.store(camera, Ordering::Relaxed);
        self.require_microphone.store(mic, Ordering::Relaxed);
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
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as os_impl;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
use windows as os_impl;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux as os_impl;

/// Inspect live OS permissions for the startup checklist.
///
/// Only includes `camera` if `require_camera` is true and only includes
/// `microphone` if `require_microphone` is true. OS-level kiosk/security
/// permissions (Accessibility, Screen Recording, Isolated Desktop, etc.) are
/// always checked independently of whether a camera or microphone is present.
pub fn inspect_live_permissions(app: &AppHandle) -> Vec<PermissionChecklistItem> {
    let startup_state = app.try_state::<StartupPermissionsState>();
    let require_camera = startup_state
        .as_ref()
        .map(|s| s.require_camera.load(Ordering::Relaxed))
        .unwrap_or(true);
    let require_microphone = startup_state
        .as_ref()
        .map(|s| s.require_microphone.load(Ordering::Relaxed))
        .unwrap_or(false);

    log_diagnostic_entry(
        "INFO",
        "PERMISSIONS_ONBOARDING",
        &format!(
            "inspect_live_permissions: require_camera={}, require_microphone={}",
            require_camera, require_microphone
        ),
    );

    os_impl::inspect_live_permissions(app, require_camera, require_microphone)
}

pub fn request_permission_by_id(app: &AppHandle, permission_id: &str) -> PermissionChecklistItem {
    os_impl::request_permission_by_id(app, permission_id)
}

pub fn is_onboarding_needed(app: &AppHandle) -> bool {
    let persisted = load_persisted_permissions_state(app);
    match persisted {
        Some(state) if state.onboarding_completed => {
            let items = inspect_live_permissions(app);
            let failing: Vec<_> = items
                .iter()
                .filter(|i| i.required && i.status != "granted")
                .collect();

            if failing.is_empty() {
                return false; // All good — skip the permissions screen ✅
            }

            // Grace mode (macOS only): `CGPreflightScreenCaptureAccess` can return
            // false for ~100ms after app launch even when the user has already granted
            // the permission. If the ONLY failing item is `screen_capture` with status
            // `needs_action` (not denied), wait 200 ms and re-check once before
            // deciding to show the full permissions screen.
            #[cfg(target_os = "macos")]
            {
                let only_screen_capture_flicker = failing.len() == 1
                    && failing[0].id == "screen_capture"
                    && failing[0].status == "needs_action";

                if only_screen_capture_flicker {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    let retry_status = os_impl::check_screen_capture_status();
                    if retry_status == "granted" {
                        log_diagnostic_entry(
                            "INFO",
                            "PERMISSIONS_ONBOARDING",
                            "screen_capture recovered after 200 ms startup delay — skipping permissions screen",
                        );
                        return false; // Transient startup flicker resolved ✅
                    }
                }
            }

            // Real failure: log which permission(s) are missing then show screen
            for item in &failing {
                log_diagnostic_entry(
                    "WARN",
                    "PERMISSIONS_ONBOARDING",
                    &format!(
                        "Permission not granted at startup: id={}, status={}",
                        item.id, item.status
                    ),
                );
            }
            true
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
        let cam = os_impl::check_camera_status();
        println!("Camera status: {}", cam);
        assert!(["granted", "needs_action", "denied"].contains(&cam.as_str()));

        let mic = os_impl::check_microphone_status();
        println!("Microphone status: {}", mic);
        assert!(["granted", "needs_action", "denied"].contains(&mic.as_str()));

        let ax = os_impl::check_accessibility_status();
        println!("Accessibility status: {}", ax);
        assert!(["granted", "needs_action", "denied"].contains(&ax.as_str()));

        let sc = os_impl::check_screen_capture_status();
        println!("Screen capture status: {}", sc);
        assert!(["granted", "needs_action", "denied"].contains(&sc.as_str()));
    }
}
