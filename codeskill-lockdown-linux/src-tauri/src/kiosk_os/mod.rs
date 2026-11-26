use std::sync::atomic::{AtomicBool, Ordering};
#[allow(unused_imports)]
use tauri::Manager;

use crate::attestation::AttestationState;
use crate::security::log_diagnostic_entry;
use crate::state_persistence::{save_persisted_exam_session, PersistedExamSessionPatch};

pub(crate) static KIOSK_ACTIVE: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
use windows as windows_impl;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as macos_impl;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux as linux_impl;

// ---------------------------------------------------------------------------
// Cross-Platform Commands & Cleanup
// ---------------------------------------------------------------------------
pub fn clear_os_clipboard() {
    #[cfg(target_os = "windows")]
    {
        windows_impl::clear_clipboard();
    }

    #[cfg(target_os = "macos")]
    {
        macos_impl::clear_clipboard();
    }

    #[cfg(target_os = "linux")]
    {
        linux_impl::clear_clipboard();
    }
}

pub fn release_os_kiosk_system() {
    crate::flight_recorder::record_event(
        "INFO",
        "KIOSK",
        "SCENARIO_D_KIOSK",
        "release_os_kiosk_system",
        "started",
        serde_json::json!({ "wasActive": KIOSK_ACTIVE.load(Ordering::SeqCst) }),
    );
    KIOSK_ACTIVE.store(false, Ordering::SeqCst);

    #[cfg(target_os = "windows")]
    {
        windows_impl::remove_keyboard_hook();
        windows_impl::disable_isolated_desktop();
        windows_impl::disable_shell_locked_mode();
    }

    #[cfg(target_os = "macos")]
    {
        macos_impl::stop_clipboard_guard();
        macos_impl::disable_macos_kiosk(None);
    }

    #[cfg(target_os = "linux")]
    {
        linux_impl::ungrab_x11_keyboard();
        linux_impl::stop_systemd_inhibit();
    }
}

#[tauri::command]
pub fn release_os_kiosk(window: tauri::WebviewWindow) -> Result<(), String> {
    let app = window.app_handle().clone();

    // Update in-memory state
    let att_state = app.state::<AttestationState>();
    att_state.kiosk_active.store(false, Ordering::SeqCst);

    // Update persisted session snapshot
    let _ = save_persisted_exam_session(
        app.clone(),
        PersistedExamSessionPatch {
            kiosk_active: Some(false),
            ..Default::default()
        },
    );

    #[cfg(target_os = "macos")]
    {
        let win_clone = window.clone();
        let _ = window.run_on_main_thread(move || {
            let window_ptr = win_clone.ns_window().ok();
            macos_impl::disable_macos_kiosk(window_ptr);
            let _ = win_clone.set_decorations(true);
            let _ = win_clone.set_always_on_top(false);
            let _ = win_clone.set_content_protected(false);
            let _ = win_clone.set_resizable(true);
            release_os_kiosk_system();
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.set_always_on_top(false);
        let _ = window.set_fullscreen(false);
        let _ = window.set_content_protected(false);
        let _ = window.set_resizable(true);

        let _ = app.run_on_main_thread(move || {
            release_os_kiosk_system();
        });
    }

    clear_kiosk_dirty(&app);
    close_secondary_monitor_shields(&app);
    log_diagnostic_entry("INFO", "KIOSK", "OS Kiosk mode released");
    Ok(())
}

fn get_kiosk_dirty_lock_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        dir.join("kiosk_dirty.lock")
    } else {
        std::env::temp_dir().join("codeskill_kiosk_dirty.lock")
    }
}

pub fn mark_kiosk_dirty(app: &tauri::AppHandle) {
    let path = get_kiosk_dirty_lock_path(app);
    let pid = std::process::id();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let content = format!("pid={}\ntimestamp={}\n", pid, now);
    let _ = std::fs::write(path, content);
}

pub fn clear_kiosk_dirty(app: &tauri::AppHandle) {
    let path = get_kiosk_dirty_lock_path(app);
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}

pub fn recover_dirty_kiosk_state(app: &tauri::AppHandle) {
    let path = get_kiosk_dirty_lock_path(app);
    if path.exists() {
        log_diagnostic_entry(
            "WARN",
            "CRASH_RECOVERY",
            "Found kiosk_dirty.lock from previous crash/abrupt exit. Recovering dirty kiosk state...",
        );
        release_os_kiosk_system();
        clear_kiosk_dirty(app);
        log_diagnostic_entry(
            "INFO",
            "CRASH_RECOVERY",
            "Dirty kiosk state recovered successfully.",
        );
    }
}

pub fn spawn_secondary_monitor_shields(app: &tauri::AppHandle) {
    if let Ok(monitors) = app.available_monitors() {
        if monitors.len() <= 1 {
            return;
        }
        let primary_name = app.primary_monitor().ok().flatten().and_then(|m| m.name().map(|s| s.to_string()));
        for (i, monitor) in monitors.iter().enumerate() {
            let is_primary = match &primary_name {
                Some(name) => monitor.name() == Some(name),
                None => i == 0,
            };
            if is_primary {
                continue;
            }
            let label = format!("shield-window-{}", i);
            if app.get_webview_window(&label).is_some() {
                continue;
            }
            let pos = *monitor.position();
            let size = *monitor.size();
            let _ = tauri::WebviewWindowBuilder::new(
                app,
                &label,
                tauri::WebviewUrl::App("data:text/html,<body style='background-color:black;margin:0;overflow:hidden;'></body>".into()),
            )
            .title("CodeSkill LockDown Shield")
            .always_on_top(true)
            .decorations(false)
            .fullscreen(true)
            .position(pos.x as f64, pos.y as f64)
            .inner_size(size.width as f64, size.height as f64)
            .build();
        }
    }
}

pub fn close_secondary_monitor_shields(app: &tauri::AppHandle) {
    for i in 0..16 {
        let label = format!("shield-window-{}", i);
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.close();
        }
    }
}

#[tauri::command]
pub fn enable_kiosk_mode(
    window: tauri::WebviewWindow,
    #[allow(unused_variables)]
    proctoring_enabled: Option<bool>,
) -> Result<(), String> {
    clear_os_clipboard();

    let app = window.app_handle().clone();
    mark_kiosk_dirty(&app);
    let att_state = app.state::<AttestationState>();

    #[cfg(target_os = "macos")]
    {
        let win_clone = window.clone();
        let _ = window.run_on_main_thread(move || {
            let _ = win_clone.set_decorations(false);
            let _ = win_clone.set_always_on_top(true);
            let _ = win_clone.set_content_protected(true);
            let _ = win_clone.set_resizable(false);

            if let Ok(Some(monitor)) = win_clone.primary_monitor() {
                let _ = win_clone.set_position(*monitor.position());
                let _ = win_clone.set_size(*monitor.size());
            }

            let window_ptr = win_clone.ns_window().ok();
            macos_impl::enable_macos_kiosk(window_ptr);
        });

        // Try AAC first; fallback to Cocoa kiosk
        macos_impl::start_clipboard_guard(app.clone());
        let allow_speech = att_state.allow_accessibility_speech.load(std::sync::atomic::Ordering::Relaxed);
        let aac_result = macos_impl::try_start_aac_session(allow_speech);
        let mode = if aac_result.is_ok() {
            log_diagnostic_entry("INFO", "KIOSK", "macOS AEAssessmentSession started successfully");
            "macos_aac_enforced"
        } else {
            log_diagnostic_entry("INFO", "KIOSK", "AEAssessmentSession unavailable/dev build; using hardened macos_cocoa_kiosk");
            "macos_cocoa_kiosk"
        };

        if let Ok(mut km) = att_state.kiosk_mode.lock() {
            *km = mode.to_string();
        }
    }

    #[cfg(target_os = "windows")]
    {
        let _ = window.set_always_on_top(true);
        let _ = window.set_fullscreen(true);
        let _ = window.set_content_protected(true);
        let _ = window.set_resizable(false);

        windows_impl::install_keyboard_hook()?;

        let is_proctoring = proctoring_enabled.unwrap_or(true);
        let mode = if is_proctoring {
            windows_impl::enable_shell_locked_mode()?;
            "windows_shell_locked"
        } else {
            windows_impl::enable_isolated_desktop()?;
            "windows_isolated_desktop"
        };

        if let Ok(mut km) = att_state.kiosk_mode.lock() {
            *km = mode.to_string();
        }
    }

    #[cfg(target_os = "linux")]
    {
        let _ = window.set_always_on_top(true);
        let _ = window.set_fullscreen(true);
        let _ = window.set_content_protected(true);
        let _ = window.set_resizable(false);

        linux_impl::check_wayland_session()?;
        linux_impl::setup_cgroup_containment();
        let _ = linux_impl::grab_x11_keyboard();
        linux_impl::start_systemd_inhibit();

        let mode = linux_impl::detect_kiosk_mode();
        if let Ok(mut km) = att_state.kiosk_mode.lock() {
            *km = mode;
        }
    }

    KIOSK_ACTIVE.store(true, Ordering::SeqCst);
    att_state.kiosk_active.store(true, Ordering::SeqCst);

    let active_mode = att_state.kiosk_mode.lock().map(|m| m.clone()).unwrap_or_default();
    let _ = save_persisted_exam_session(
        app,
        PersistedExamSessionPatch {
            kiosk_active: Some(true),
            kiosk_mode: Some(active_mode.clone()),
            ..Default::default()
        },
    );

    log_diagnostic_entry(
        "INFO",
        "KIOSK",
        &format!("OS Kiosk mode engaged with mode: {}", active_mode),
    );
    Ok(())
}

#[tauri::command]
pub fn engage_os_kiosk(
    window: tauri::WebviewWindow,
    proctoring_enabled: Option<bool>,
) -> Result<(), String> {
    enable_kiosk_mode(window, proctoring_enabled)
}

#[tauri::command]
pub fn disable_kiosk_mode(window: tauri::WebviewWindow) -> Result<(), String> {
    release_os_kiosk(window)
}

#[tauri::command]
pub fn exit_lockdown_app(app: tauri::AppHandle) {
    eprintln!("[CodeSkill LockDown IPC] exit_lockdown_app invoked - terminating platform process");
    release_os_kiosk_system();
    close_secondary_monitor_shields(&app);
    clear_kiosk_dirty(&app);
    let _ = crate::state_persistence::clear_persisted_exam_session(app.clone());
    // TEMP TESTING: do not destroy window or clear browsing data
    // if let Some(window) = app.get_webview_window("exam-kiosk") {
    //     let _ = window.clear_all_browsing_data();
    //     let _ = window.destroy();
    // }
    if let Ok(dir) = app.path().app_data_dir() {
        let scoped = dir.join("scoped_webview_data");
        if scoped.exists() {
            let _ = std::fs::remove_dir_all(scoped);
        }
    }
    // app.exit(0);
    // std::process::exit(0);
}

#[tauri::command]
pub fn authorize_local_clipboard_copy() {
    #[cfg(target_os = "macos")]
    {
        macos_impl::authorize_local_clipboard_copy();
    }
}

pub fn reassert_os_kiosk() {
    if !KIOSK_ACTIVE.load(Ordering::SeqCst) {
        return;
    }
    #[cfg(target_os = "macos")]
    {
        macos_impl::reassert_presentation_options();
    }
}
