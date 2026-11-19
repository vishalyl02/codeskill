pub mod attestation;
pub mod kiosk_os;
pub mod offline_vault;
pub mod security;
pub mod system_dock;

use attestation::AttestationState;
use offline_vault::OfflineVaultState;
use tauri::{AppHandle, Emitter, Manager};

pub mod config {
    #[tauri::command]
    pub fn get_frontend_origin() -> String {
        option_env!("FRONTEND_ORIGIN")
            .map(|s| s.to_string())
            .or_else(|| std::env::var("FRONTEND_ORIGIN").ok())
            .or_else(|| std::env::var("NEXT_PUBLIC_SITE_URL").ok())
            .unwrap_or_else(|| "http://localhost:3000".to_string())
    }
}
pub use config::get_frontend_origin;

#[derive(Clone, serde::Serialize)]
struct DeepLinkPayload {
    #[serde(rename = "examId")]
    exam_id: String,
    token: Option<String>,
}

fn handle_deep_link_url(app: &AppHandle, url_str: &str) {
    let clean_url = url_str.trim().trim_matches('"').trim_matches('\'');
    // Expected format: codeskill-exam://start?examId={id}&token={token}
    if let Ok(parsed) = url::Url::parse(clean_url) {
        let mut exam_id = None;
        let mut token = None;

        for (k, v) in parsed.query_pairs() {
            if k == "examId" {
                exam_id = Some(v.to_string());
            } else if k == "token" {
                token = Some(v.to_string());
            }
        }

        if exam_id.is_none() {
            if let Some(segments) = parsed.path_segments() {
                for seg in segments {
                    if !seg.is_empty() && seg != "start" && seg != "take" {
                        exam_id = Some(seg.to_string());
                        break;
                    }
                }
            }
        }

        if let Some(id) = exam_id {
            if !id.trim().is_empty() {
                let att_state = app.state::<AttestationState>();
                if let Ok(mut locked) = att_state.locked_assessment_id.lock() {
                    *locked = Some(id.clone());
                }
                security::log_diagnostic_entry(
                    "INFO",
                    "DEEP_LINK",
                    &format!("Deep link locked assessment: {}", id),
                );

                if let Some(window) = app.get_webview_window("exam-kiosk") {
                    let _ = window.set_focus();
                    let _ = window.unminimize();

                    let frontend_origin = get_frontend_origin();

                    let base_url = format!("{}/assessments/{}/take", frontend_origin.trim_end_matches('/'), id.trim());
                    let target_url = match &token {
                        Some(tok) => {
                            let encoded: String = url::form_urlencoded::byte_serialize(tok.as_bytes()).collect();
                            format!("{}?lockdownToken={}", base_url, encoded)
                        }
                        None => base_url,
                    };

                    if let Ok(target_url_obj) = url::Url::parse(&target_url) {
                        let _ = window.navigate(target_url_obj);
                    }

                    let _ = window.emit(
                        "exam:deep-link-launch",
                        DeepLinkPayload {
                            exam_id: id,
                            token,
                        },
                    );
                }
            }
        }
    }
}

pub fn lockdown_hardening_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    let hardening_js = r#"
(function() {
    'use strict';
    // 1. Suppress context menu
    window.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    }, true);

    // 2. Suppress drag-and-drop file navigation
    window.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'none';
            e.dataTransfer.dropEffect = 'none';
        }
    }, true);
    window.addEventListener('drop', function(e) {
        e.preventDefault();
        return false;
    }, true);

    // 3. Stub window.open to prevent rogue secondary popups/windows
    window.open = function(url, _target, _features) {
        console.warn('[CodeSkill LockDown] Secondary window popup suppressed:', url);
        return null;
    };

    // 4. Suppress window.print
    window.print = function() {
        console.warn('[CodeSkill LockDown] Printing is disabled during examination');
    };

    // 5. Suppress default spellcheck / autocorrect / predictive text on DOM elements
    function enforceInputHygiene() {
        var elements = document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]');
        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            if (!el.hasAttribute('data-lockdown-sanitized')) {
                el.setAttribute('spellcheck', 'false');
                el.setAttribute('autocorrect', 'off');
                el.setAttribute('autocapitalize', 'off');
                el.setAttribute('autocomplete', 'off');
                el.setAttribute('data-lockdown-sanitized', 'true');
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enforceInputHygiene);
    } else {
        enforceInputHygiene();
    }

    var observer = new MutationObserver(function() {
        enforceInputHygiene();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
"#;

    tauri::plugin::Builder::new("lockdown-hardening")
        .js_init_script(hardening_js.to_string())
        .on_navigation(|webview, url| {
            let state = webview.state::<AttestationState>();
            let url_str = url.as_str();

            // 1. Allow local / tauri internal resources and splash screen
            if url.scheme() == "tauri" || url.scheme() == "about" || url_str.starts_with("data:") {
                return true;
            }

            // 2. Check if locked assessment is set
            let (locked_id, allowed_urls) = {
                let locked = state.locked_assessment_id.lock().unwrap();
                let allowed = state.allowed_external_urls.lock().unwrap();
                (locked.clone(), allowed.clone())
            };

            // If an assessment is locked, enforce single-assessment navigation boundary
            if let Some(ref assessment_id) = locked_id {
                let path = url.path();

                // Allow exam-taking route and its subpaths for this assessment
                let assessment_prefix = format!("/assessments/{}", assessment_id);
                if path.starts_with(&assessment_prefix) || path == "/login" || path.starts_with("/auth/") {
                    return true;
                }

                // Check allowed external URLs
                let host = url.host_str().unwrap_or_default();
                for pattern in &allowed_urls {
                    let pat = pattern.trim();
                    if pat.is_empty() {
                        continue;
                    }
                    if url_str.starts_with(pat) || host == pat || host.ends_with(&format!(".{}", pat)) {
                        return true;
                    }
                }

                // Block any other assessment or unwhitelisted route
                if path.starts_with("/assessments/") {
                    security::log_diagnostic_entry(
                        "WARN",
                        "SECURITY",
                        &format!("Single-assessment violation blocked: navigation to {} while locked to {}", path, assessment_id),
                    );
                    return false;
                }

                // If host is the configured frontend origin, allow if it's the current assessment
                let frontend = config::get_frontend_origin();
                if let Ok(frontend_url) = url::Url::parse(&frontend) {
                    if url.host_str() == frontend_url.host_str() && url.port() == frontend_url.port() {
                        security::log_diagnostic_entry(
                            "WARN",
                            "SECURITY",
                            &format!("Navigation on frontend origin blocked outside locked exam: {}", path),
                        );
                        return false;
                    }
                }

                security::log_diagnostic_entry(
                    "WARN",
                    "SECURITY",
                    &format!("External URL navigation blocked by URL filter: {}", url_str),
                );
                return false;
            }

            // If no assessment locked yet, allow navigation to frontend origin and localhost
            let frontend = config::get_frontend_origin();
            if let Ok(frontend_url) = url::Url::parse(&frontend) {
                if url.host_str() == frontend_url.host_str() && url.port() == frontend_url.port() {
                    return true;
                }
            }

            if let Some(host) = url.host_str() {
                if host == "localhost" || host == "127.0.0.1" || host.ends_with(".codeskill.com") || host == "codeskill.com" {
                    return true;
                }
            }

            security::log_diagnostic_entry(
                "WARN",
                "SECURITY",
                &format!("Unrecognized navigation blocked: {}", url_str),
            );
            false
        })
        .build()
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("exam-kiosk") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
            for arg in argv {
                let trimmed = arg.trim().trim_matches('"').trim_matches('\'');
                if trimmed.to_lowercase().starts_with("codeskill-exam://")
                    || trimmed.to_lowercase().starts_with("codeskill-exam:")
                {
                    handle_deep_link_url(app, trimmed);
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(lockdown_hardening_plugin())
        .manage(AttestationState::new())
        .manage(OfflineVaultState::new())
        .setup(|app| {
            // Panic safety hook: ensure OS kiosk mode & presentation options are completely released on panic
            let orig_hook = std::panic::take_hook();
            std::panic::set_hook(Box::new(move |info| {
                kiosk_os::release_os_kiosk_system();
                orig_hook(info);
            }));

            // Initialize offline vault from local app data dir
            app.state::<OfflineVaultState>().init_from_app(app.handle());

            // Start background watchdog for multi-monitor, stealth overlays, and forbidden processes
            security::start_security_watchdog(app.handle().clone());

            // Listen for deep link events in Tauri v2
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let app_handle = app.handle().clone();
                let _ = app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        handle_deep_link_url(&app_handle, url.as_str());
                    }
                });

                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    for url in urls {
                        handle_deep_link_url(app.handle(), url.as_str());
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Focused(true) = event {
                kiosk_os::reassert_os_kiosk();
            }
        })
        .invoke_handler(tauri::generate_handler![
            config::get_frontend_origin,
            attestation::get_attestation_public_key,
            attestation::set_attested_session_id,
            attestation::sync_server_time,
            attestation::sign_api_request,
            attestation::set_locked_assessment,
            security::run_preflight_checks,
            security::list_non_essential_apps,
            security::close_non_essential_apps,
            security::get_lockdown_diagnostic_logs,
            kiosk_os::enable_kiosk_mode,
            kiosk_os::engage_os_kiosk,
            kiosk_os::disable_kiosk_mode,
            kiosk_os::release_os_kiosk,
            offline_vault::vault_upsert_autosave,
            offline_vault::vault_read_all_autosaves,
            offline_vault::vault_remove_entry,
            offline_vault::vault_purge_attempt,
            system_dock::get_battery_status,
            system_dock::get_system_volume,
            system_dock::set_system_volume,
            system_dock::get_keyboard_layout,
            system_dock::get_synced_timestamp_ms,
            system_dock::scan_wifi_networks,
            system_dock::connect_wifi_network,
            kiosk_os::exit_lockdown_app,
        ])
        .build(tauri::generate_context!())
        .expect("error while building CodeSkill LockDown application");

    app.run(|_app_handle, event| {
        match event {
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. } => {
                kiosk_os::release_os_kiosk_system();
            }
            _ => {}
        }
    });
}
