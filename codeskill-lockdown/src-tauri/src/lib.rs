pub mod attestation;
pub mod kiosk_os;
pub mod offline_vault;
pub mod permissions_onboarding;
pub mod security;
pub mod state_persistence;
pub mod system_dock;

use attestation::AttestationState;
use offline_vault::OfflineVaultState;
use permissions_onboarding::StartupPermissionsState;
use tauri::{AppHandle, Emitter, Manager};

pub mod config {
    use std::sync::RwLock;

    static DYNAMIC_ORIGIN: RwLock<Option<String>> = RwLock::new(None);

    pub fn set_runtime_origin(origin: &str) {
        let trimmed = origin.trim().trim_end_matches('/');
        if !trimmed.is_empty() && (trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
            if let Ok(mut lock) = DYNAMIC_ORIGIN.write() {
                *lock = Some(trimmed.to_string());
            }
        }
    }

    #[tauri::command]
    pub fn get_frontend_origin() -> String {
        if let Ok(lock) = DYNAMIC_ORIGIN.read() {
            if let Some(ref origin) = *lock {
                return origin.clone();
            }
        }
        option_env!("FRONTEND_ORIGIN")
            .map(|s| s.to_string())
            .or_else(|| std::env::var("FRONTEND_ORIGIN").ok())
            .or_else(|| std::env::var("NEXT_PUBLIC_SITE_URL").ok())
            .unwrap_or_else(|| "http://localhost:3000".to_string())
    }
}
pub use config::{get_frontend_origin, set_runtime_origin};

#[derive(Clone, serde::Serialize)]
struct DeepLinkPayload {
    #[serde(rename = "examId")]
    exam_id: String,
    token: Option<String>,
}

#[tauri::command]
fn consume_pending_launch_url(app: AppHandle) -> Option<String> {
    let startup_state = app.state::<StartupPermissionsState>();
    let url = if let Ok(mut pending) = startup_state.pending_launch_url.lock() {
        pending.take()
    } else {
        None
    };
    if url.is_some() && permissions_onboarding::is_onboarding_needed(&app) {
        // Put the exam URL back so onboarding can consume it after permissions are granted,
        // and send the webview to the onboarding screen.
        if let Ok(mut pending) = startup_state.pending_launch_url.lock() {
            *pending = url;
        }
        let frontend_origin = get_frontend_origin();
        return Some(format!(
            "{}/lockdown-startup-permissions",
            frontend_origin.trim_end_matches('/')
        ));
    }
    url
}

fn handle_deep_link_url(app: &AppHandle, url_str: &str) {
    let clean_url = url_str.trim().trim_matches('"').trim_matches('\'');
    // Expected format: codeskill-exam://start?examId={id}&token={token}&origin={origin} or codeskill-lockdown://system-check?origin={origin}
    if let Ok(parsed) = url::Url::parse(clean_url) {
        // Extract origin from query parameters if present
        for (k, v) in parsed.query_pairs() {
            if k == "origin" || k == "frontendOrigin" || k == "baseUrl" {
                config::set_runtime_origin(&v);
            }
        }

        let is_system_check = parsed.host_str() == Some("system-check")
            || parsed.path() == "/system-check"
            || parsed.path() == "system-check"
            || parsed.query_pairs().any(|(k, v)| k == "mode" && v == "system-check");

        if is_system_check {
            security::log_diagnostic_entry(
                "INFO",
                "DEEP_LINK",
                "Launched in Non-Trapping System Diagnostic Check Mode",
            );

            if let Some(window) = app.get_webview_window("exam-kiosk") {
                let _ = window.set_focus();
                let _ = window.unminimize();

                let frontend_origin = get_frontend_origin();
                let target_url = format!("{}/lockdown-system-check", frontend_origin.trim_end_matches('/'));

                {
                    let startup_state = app.state::<StartupPermissionsState>();
                    if let Ok(mut pending) = startup_state.pending_launch_url.lock() {
                        *pending = Some(target_url.clone());
                    };
                }

                if let Ok(target_url_obj) = url::Url::parse(&target_url) {
                    let _ = window.navigate(target_url_obj);
                }

                let _ = window.emit("exam:system-check-launch", ());
            }
            return;
        }

        let mut exam_id = None;
        let mut token = None;
        let mut use_camera = true;  // safe default: assume camera needed
        let mut use_mic = false;    // safe default: microphone off unless explicit

        for (k, v) in parsed.query_pairs() {
            match k.as_ref() {
                "examId" | "assessmentId" => exam_id = Some(v.to_string()),
                "token" | "lockdownToken" => token = Some(v.to_string()),
                "useCamera" => use_camera = v != "0",
                "useMic" => use_mic = v == "1",
                _ => {}
            }
        }

        if exam_id.is_none() {
            if let Some(segments) = parsed.path_segments() {
                for seg in segments {
                    if !seg.is_empty() && seg != "start" && seg != "take" && seg != "launch" {
                        exam_id = Some(seg.to_string());
                        break;
                    }
                }
            }
        }

        if let Some(id) = exam_id {
            if !id.trim().is_empty() {
                let frontend_origin = get_frontend_origin();
                let base_url = format!("{}/assessments/{}/take", frontend_origin.trim_end_matches('/'), id.trim());
                let target_url = match &token {
                    Some(tok) => {
                        let encoded: String = url::form_urlencoded::byte_serialize(tok.as_bytes()).collect();
                        format!("{}?lockdownToken={}", base_url, encoded)
                    }
                    None => base_url,
                };

                // Store camera/mic requirements in shared state so the permissions
                // checklist only asks for what this assessment actually needs.
                {
                    let startup_state = app.state::<StartupPermissionsState>();
                    startup_state.set_media_requirements(use_camera, use_mic);
                    security::log_diagnostic_entry(
                        "INFO",
                        "DEEP_LINK",
                        &format!(
                            "Media requirements from deep link: useCamera={}, useMic={}",
                            use_camera, use_mic
                        ),
                    );
                }

                // Check if one-time permissions onboarding is needed
                if permissions_onboarding::is_onboarding_needed(app) {
                    let startup_state = app.state::<StartupPermissionsState>();
                    if let Ok(mut pending) = startup_state.pending_launch_url.lock() {
                        *pending = Some(target_url);
                    }

                    security::log_diagnostic_entry(
                        "INFO",
                        "PERMISSIONS_ONBOARDING",
                        &format!("Deferring deep-link launch for assessment {} until startup permissions onboarding completes", id),
                    );

                    let onboarding_url = format!("{}/lockdown-startup-permissions", frontend_origin.trim_end_matches('/'));
                    if let Some(window) = app.get_webview_window("exam-kiosk") {
                        let _ = window.set_focus();
                        let _ = window.unminimize();
                        if let Ok(onboarding_url_obj) = url::Url::parse(&onboarding_url) {
                            let _ = window.navigate(onboarding_url_obj);
                        }
                    }
                    return;
                }

                // If onboarding already complete, lock assessment and proceed immediately
                let att_state = app.state::<AttestationState>();
                if let Ok(mut locked) = att_state.locked_assessment_id.lock() {
                    *locked = Some(id.clone());
                }

                // Persist locked assessment id and portal origin into state persistence journal
                let _ = state_persistence::save_persisted_exam_session(
                    app.clone(),
                    state_persistence::PersistedExamSessionPatch {
                        assessment_id: Some(id.clone()),
                        auth_token: token.clone(),
                        portal_origin: Some(frontend_origin),
                        ..Default::default()
                    },
                );

                security::log_diagnostic_entry(
                    "INFO",
                    "DEEP_LINK",
                    &format!("Deep link locked assessment: {}", id),
                );

                // Store pending launch URL so cold-start WebView can pull it deterministically
                // if window.navigate / window.emit fired before index.html finished initializing.
                {
                    let startup_state = app.state::<StartupPermissionsState>();
                    if let Ok(mut pending) = startup_state.pending_launch_url.lock() {
                        *pending = Some(target_url.clone());
                    };
                }

                if let Some(window) = app.get_webview_window("exam-kiosk") {
                    let _ = window.set_focus();
                    let _ = window.unminimize();

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
    // Helper to detect non-trapping onboarding & permissions screens
    function isChecklistOrOnboarding() {
        try {
            var path = window.location.pathname || '';
            if (path === '/lockdown-startup-permissions' || path.startsWith('/lockdown-startup-permissions/')) {
                return true;
            }
            if (document.querySelector('[data-lockdown-checklist="true"]') !== null) {
                return true;
            }
        } catch (_) {}
        return false;
    }

    // 1. Suppress context menu globally in capture phase (except during onboarding checklist)
    window.addEventListener('contextmenu', function(e) {
        if (isChecklistOrOnboarding()) return;
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, true);

    // 2. Suppress drag-and-drop file navigation
    window.addEventListener('dragstart', function(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, true);
    window.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'none';
            e.dataTransfer.dropEffect = 'none';
        }
    }, true);
    window.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
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
        return false;
    };

    // 4.1 Intercept native file picker dialogs unless explicitly allowed by question
    document.addEventListener('click', function(e) {
        var target = e.target;
        if (target && (target.matches('input[type="file"]') || (target.closest && target.closest('input[type="file"]')))) {
            var allowUpload = target.getAttribute('data-allow-file-upload') === 'true' ||
                              (target.closest && target.closest('[data-allow-file-upload="true"]'));
            if (!allowUpload) {
                e.preventDefault();
                e.stopPropagation();
                console.warn('[CodeSkill LockDown] File chooser dialog blocked: file upload not permitted for this question.');
                return false;
            }
        }
    }, true);

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

    // 6. Capture-phase Keyboard and Clipboard Lock
    window.addEventListener('keydown', function(e) {
        if (isChecklistOrOnboarding()) return;
        var key = e.key;
        var code = e.keyCode || e.which;
        var isCtrl = e.ctrlKey;
        var isMeta = e.metaKey;
        var isAlt = e.altKey;

        // Block Escape
        if (key === 'Escape' || code === 27) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        // Block PrintScreen
        if (key === 'PrintScreen' || code === 44) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        // Block Function keys F1 - F12
        if ((code >= 112 && code <= 123) || /^F(1[0-2]|[1-9])$/.test(key)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        // Check target element for editor allowlist
        var target = e.target;
        var isInsideEditor = target && (
            target.closest('.monaco-editor') ||
            target.closest('.scratchpad-editor') ||
            target.getAttribute('data-allow-local-clipboard') === 'true'
        );

        // Block Ctrl/Cmd combinations
        if (isCtrl || isMeta) {
            var lowerKey = key.toLowerCase();
            if (['u', 's', 'p', 'r', 'w', 't', 'n', 'i', 'j'].indexOf(lowerKey) !== -1) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            // Outside Monaco editor or scratchpad, block C, V, X
            if (!isInsideEditor && (lowerKey === 'c' || lowerKey === 'v' || lowerKey === 'x' || code === 67 || code === 86 || code === 88)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }

        // Block Alt+Tab, Alt+Esc, Alt+F4
        if (isAlt && (key === 'Tab' || key === 'Escape' || key === 'F4' || code === 9 || code === 27 || code === 115)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, true);

    // Block copy, cut, paste outside allowed editor components
    ['copy', 'cut', 'paste'].forEach(function(eventName) {
        window.addEventListener(eventName, function(e) {
            if (isChecklistOrOnboarding()) return;
            var target = e.target;
            var isInsideEditor = target && (
                target.closest('.monaco-editor') ||
                target.closest('.scratchpad-editor') ||
                target.getAttribute('data-allow-local-clipboard') === 'true'
            );
            if (!isInsideEditor) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, true);
    });

    // 6. Integral LockDown Frame Controls (Shadow-DOM floating control bar on every page)
    function mountIntegralFrameControls() {
        try {
            if (!document.documentElement) return;
            if (document.getElementById('codeskill-lockdown-frame-controls')) return;

            var invoker = (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function')
                ? function(cmd, args) { return window.__TAURI_INTERNALS__.invoke(cmd, args || {}); }
                : (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function')
                    ? function(cmd, args) { return window.__TAURI__.core.invoke(cmd, args || {}); }
                    : null;
            if (!invoker) return;

            var host = document.createElement('div');
            host.id = 'codeskill-lockdown-frame-controls';
            host.setAttribute('data-lockdown-frame-controls', 'true');
            host.style.cssText = 'position:fixed;bottom:14px;right:16px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;user-select:none;';

            var shadow = host.attachShadow({ mode: 'open' });
            shadow.innerHTML = '\
<style>\
  .bar{display:flex;align-items:center;gap:8px;background:rgba(15,23,42,0.94);backdrop-filter:blur(10px);border:1px solid rgba(51,65,85,0.85);border-radius:9999px;padding:6px 12px;color:#e2e8f0;font-size:12px;box-shadow:0 10px 30px rgba(0,0,0,0.45);cursor:grab;}\
  .bar:active{cursor:grabbing;}\
  .pill{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:9999px;background:rgba(30,41,59,0.9);border:1px solid rgba(71,85,105,0.6);color:#cbd5e1;font-size:11px;font-weight:500;white-space:nowrap;}\
  .dot{width:7px;height:7px;border-radius:9999px;background:#10b981;box-shadow:0 0 6px #10b981;}\
  .btn{display:inline-flex;align-items:center;gap:4px;background:rgba(30,41,59,0.9);border:1px solid rgba(71,85,105,0.7);color:#e2e8f0;padding:4px 9px;border-radius:9999px;font-size:11px;font-weight:600;cursor:pointer;transition:background .15s;}\
  .btn:hover{background:rgba(51,65,85,0.95);}\
  .exit{background:rgba(220,38,38,0.18);border-color:rgba(239,68,68,0.45);color:#fca5a5;}\
  .exit:hover{background:rgba(220,38,38,0.35);color:#fff;}\
  .panel{position:absolute;bottom:48px;right:0;width:250px;background:rgba(15,23,42,0.98);border:1px solid rgba(71,85,105,0.85);border-radius:12px;padding:12px;color:#e2e8f0;box-shadow:0 16px 40px rgba(0,0,0,0.6);display:none;}\
  .panel.open{display:block;}\
  .modal-bg{position:fixed;inset:0;background:rgba(2,6,23,0.75);display:none;align-items:center;justify-content:center;z-index:2147483647;}\
  .modal-bg.open{display:flex;}\
  .modal{background:#0f172a;border:1px solid #334155;border-radius:14px;padding:18px 20px;max-width:340px;width:90%;color:#f1f5f9;box-shadow:0 20px 50px rgba(0,0,0,0.65);}\
  .row{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:11px;color:#94a3b8;}\
  .wifi-item{display:flex;justify-content:space-between;align-items:center;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:11px;}\
  .wifi-item:hover{background:rgba(51,65,85,0.5);}\
</style>\
<div class="bar" id="bar">\
  <span class="pill" title="CodeSkill LockDown Active"><span class="dot"></span>LockDown</span>\
  <span class="pill" id="clock">--:--</span>\
  <span class="pill" id="bat">--%</span>\
  <button class="btn" id="volBtn" type="button" title="Volume">Vol</button>\
  <button class="btn" id="wifiBtn" type="button" title="Wi-Fi">Wi-Fi</button>\
  <button class="btn exit" id="exitBtn" type="button" title="Exit CodeSkill LockDown">Exit</button>\
</div>\
<div class="panel" id="volPanel">\
  <div style="font-weight:600;font-size:12px;margin-bottom:8px;">System Audio</div>\
  <input id="volRange" type="range" min="0" max="100" value="50" style="width:100%;cursor:pointer;" />\
  <div class="row"><span>Level</span><span id="volVal">50%</span></div>\
</div>\
<div class="panel" id="wifiPanel">\
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">\
    <span style="font-weight:600;font-size:12px;">Wi-Fi Networks</span>\
    <button class="btn" id="wifiScanBtn" type="button" style="padding:2px 7px;font-size:10px;">Scan</button>\
  </div>\
  <div id="wifiList" style="max-height:140px;overflow-y:auto;font-size:11px;color:#94a3b8;">Click Scan to list networks</div>\
</div>\
<div class="modal-bg" id="exitModal">\
  <div class="modal">\
    <div style="font-weight:700;font-size:14px;margin-bottom:6px;">Exit CodeSkill LockDown?</div>\
    <div style="font-size:12px;color:#94a3b8;line-height:1.45;margin-bottom:14px;">This will release kiosk mode and close the CodeSkill LockDown browser.</div>\
    <div style="display:flex;justify-content:flex-end;gap:8px;">\
      <button class="btn" id="cancelExit" type="button">Cancel</button>\
      <button class="btn exit" id="confirmExit" type="button" style="background:#dc2626;color:#fff;border-color:#dc2626;">Exit LockDown</button>\
    </div>\
  </div>\
</div>';

            document.documentElement.appendChild(host);

            // Auto-hide only when the full assessment exam dock is mounted on /take
            function syncVisibility() {
                var examDock = document.querySelector('[data-lockdown-utility-dock="true"]');
                host.style.display = examDock ? 'none' : 'block';
            }
            syncVisibility();
            var obs = new MutationObserver(syncVisibility);
            obs.observe(document.documentElement, { childList: true, subtree: true });

            var bar = shadow.getElementById('bar');
            var clockEl = shadow.getElementById('clock');
            var batEl = shadow.getElementById('bat');
            var volBtn = shadow.getElementById('volBtn');
            var volPanel = shadow.getElementById('volPanel');
            var volRange = shadow.getElementById('volRange');
            var volVal = shadow.getElementById('volVal');
            var wifiBtn = shadow.getElementById('wifiBtn');
            var wifiPanel = shadow.getElementById('wifiPanel');
            var wifiScanBtn = shadow.getElementById('wifiScanBtn');
            var wifiList = shadow.getElementById('wifiList');
            var exitBtn = shadow.getElementById('exitBtn');
            var exitModal = shadow.getElementById('exitModal');
            var cancelExit = shadow.getElementById('cancelExit');
            var confirmExit = shadow.getElementById('confirmExit');

            // Drag support
            var dragging = false, sx = 0, sy = 0, startRight = 16, startBottom = 14;
            bar.addEventListener('mousedown', function(e) {
                if (e.target && e.target.tagName === 'BUTTON') return;
                dragging = true; sx = e.clientX; sy = e.clientY;
                startRight = parseInt(host.style.right || '16', 10);
                startBottom = parseInt(host.style.bottom || '14', 10);
            });
            window.addEventListener('mousemove', function(e) {
                if (!dragging) return;
                var nr = Math.max(8, startRight - (e.clientX - sx));
                var nb = Math.max(8, startBottom - (e.clientY - sy));
                host.style.right = nr + 'px';
                host.style.bottom = nb + 'px';
            });
            window.addEventListener('mouseup', function() { dragging = false; });

            function refreshClock() {
                invoker('get_synced_timestamp_ms').then(function(ms) {
                    var d = new Date(ms || Date.now());
                    clockEl.textContent = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
                }).catch(function() {
                    var d = new Date();
                    clockEl.textContent = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
                });
            }
            function refreshBat() {
                invoker('get_battery_status').then(function(b) {
                    if (b && typeof b.percentage === 'number') {
                        batEl.textContent = b.percentage + '%' + (b.is_charging ? ' +' : '');
                    }
                }).catch(function() {});
            }
            refreshClock(); refreshBat();
            setInterval(refreshClock, 15000);
            setInterval(refreshBat, 30000);

            volBtn.addEventListener('click', function() {
                wifiPanel.classList.remove('open');
                volPanel.classList.toggle('open');
                invoker('get_system_volume').then(function(v) {
                    if (typeof v === 'number') { volRange.value = v; volVal.textContent = v + '%'; }
                }).catch(function() {});
            });
            volRange.addEventListener('input', function() {
                var lvl = parseInt(volRange.value, 10);
                volVal.textContent = lvl + '%';
                invoker('set_system_volume', { level: lvl }).catch(function() {});
            });

            function scanWifi() {
                wifiList.textContent = 'Scanning...';
                invoker('scan_wifi_networks').then(function(nets) {
                    wifiList.innerHTML = '';
                    if (!nets || !nets.length) { wifiList.textContent = 'No networks found'; return; }
                    nets.slice(0, 6).forEach(function(n) {
                        var row = document.createElement('div');
                        row.className = 'wifi-item';
                        row.textContent = (n.is_connected ? '* ' : '') + n.ssid + ' (' + n.signal_strength + '%)';
                        row.addEventListener('click', function() {
                            invoker('connect_wifi_network', { ssid: n.ssid, password: null }).catch(function() {});
                        });
                        wifiList.appendChild(row);
                    });
                }).catch(function() { wifiList.textContent = 'Scan unavailable'; });
            }
            wifiBtn.addEventListener('click', function() {
                volPanel.classList.remove('open');
                wifiPanel.classList.toggle('open');
                if (wifiPanel.classList.contains('open')) scanWifi();
            });
            wifiScanBtn.addEventListener('click', scanWifi);

            exitBtn.addEventListener('click', function() {
                volPanel.classList.remove('open');
                wifiPanel.classList.remove('open');
                exitModal.classList.add('open');
            });
            cancelExit.addEventListener('click', function() { exitModal.classList.remove('open'); });
            confirmExit.addEventListener('click', function() {
                invoker('exit_lockdown_app').catch(function() {});
            });
        } catch (_) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountIntegralFrameControls);
    } else {
        mountIntegralFrameControls();
    }
})();
"#;

    tauri::plugin::Builder::new("lockdown-hardening")
        .js_init_script(hardening_js.to_string())
        .on_navigation(|webview, url| {
            let state = webview.state::<AttestationState>();
            let url_str = url.as_str();

            // 0. Intercept native OS system settings / privacy deep links
            if url.scheme() == "x-apple.systempreferences"
                || url.scheme() == "ms-settings"
                || url_str.starts_with("x-apple.systempreferences:")
                || url_str.starts_with("ms-settings:")
            {
                security::log_diagnostic_entry(
                    "INFO",
                    "SYSTEM_SETTINGS",
                    &format!("Native OS settings protocol intercepted: {}", url_str),
                );

                #[cfg(target_os = "macos")]
                {
                    let _ = security::open_macos_privacy_pane(url_str);
                }

                #[cfg(target_os = "windows")]
                {
                    let _ = std::process::Command::new("cmd")
                        .args(&["/c", "start", url_str])
                        .spawn();
                }

                return false;
            }

            // 1. Allow local / tauri internal resources and splash screen
            if url.scheme() == "tauri" || url.scheme() == "about" || url_str.starts_with("data:") {
                return true;
            }

            if let Some(host) = url.host_str() {
                if host == "tauri.localhost" || host.ends_with(".localhost") {
                    return true;
                }
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

                // Allow exam-taking route and its subpaths for this assessment, or onboarding/diagnostic
                let assessment_prefix = format!("/assessments/{}", assessment_id);
                if path.starts_with(&assessment_prefix)
                    || path == "/login"
                    || path.starts_with("/auth/")
                    || path.starts_with("/(auth)/")
                    || path == "/lockdown-startup-permissions"
                    || path == "/lockdown-system-check"
                    || path.starts_with("/_next/")
                    || path.starts_with("/api/")
                {
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

            // If no assessment locked yet, enforce allowed LockDown path boundary
            let path = url.path();

            // CodeSkill LockDown must NEVER allow browsing the general website (homepage, dashboard, problem catalog, etc.)
            let is_general_website_path = path == "/"
                || path == "/dashboard"
                || path.starts_with("/problems")
                || path.starts_with("/learning")
                || path.starts_with("/contests")
                || path.starts_with("/leaderboard");

            if is_general_website_path {
                security::log_diagnostic_entry(
                    "WARN",
                    "SECURITY",
                    &format!("General website navigation blocked inside CodeSkill LockDown: {}", path),
                );
                kiosk_os::exit_lockdown_app(webview.app_handle().clone());
                return false;
            }

            // Only allow designated LockDown paths
            let is_allowed_lockdown_path = path.starts_with("/assessments")
                || path == "/login"
                || path.starts_with("/auth/")
                || path.starts_with("/(auth)/")
                || path == "/lockdown-startup-permissions"
                || path == "/lockdown-system-check"
                || path.starts_with("/_next/")
                || path.starts_with("/api/");

            if is_allowed_lockdown_path {
                let frontend = config::get_frontend_origin();
                if let Ok(frontend_url) = url::Url::parse(&frontend) {
                    if url.host_str() == frontend_url.host_str() {
                        return true;
                    }
                }

                if let Some(host) = url.host_str() {
                    if host == "localhost"
                        || host == "127.0.0.1"
                        || host == "tauri.localhost"
                        || host.ends_with(".localhost")
                        || host == "codeskill.novaserve.cloud"
                        || host.ends_with(".novaserve.cloud")
                        || host.ends_with(".codeskill.com")
                        || host == "codeskill.com"
                    {
                        return true;
                    }
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
                let lower = trimmed.to_lowercase();
                if lower.starts_with("codeskill-exam://")
                    || lower.starts_with("codeskill-exam:")
                    || lower.starts_with("codeskill-lockdown://")
                    || lower.starts_with("codeskill-lockdown:")
                {
                    handle_deep_link_url(app, trimmed);
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(lockdown_hardening_plugin())
        .manage(AttestationState::new())
        .manage(OfflineVaultState::new())
        .manage(StartupPermissionsState::new())
        .setup(|app| {
            // Panic safety hook: ensure OS kiosk mode & presentation options are completely released on panic
            let orig_hook = std::panic::take_hook();
            std::panic::set_hook(Box::new(move |info| {
                kiosk_os::release_os_kiosk_system();
                orig_hook(info);
            }));

            // Startup crash-recovery cleaner: recover dirty kiosk state if abnormal power loss/crash occurred
            kiosk_os::recover_dirty_kiosk_state(app.handle());

            // Detect app binary replacement (e.g. macOS Finder "Replace") before hydrating session state
            permissions_onboarding::handle_binary_replacement_if_needed(app.handle());

            // Initialize offline vault from local app data dir
            app.state::<OfflineVaultState>().init_from_app(app.handle());

            // Hydrate AttestationState and active exam session from persistent disk journal
            state_persistence::hydrate_attestation_state_from_disk(app.handle());

            // Start background watchdog for multi-monitor, stealth overlays, and forbidden processes
            security::start_security_watchdog(app.handle().clone());

            // Listen for deep link events in Tauri v2
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                #[cfg(any(target_os = "windows", target_os = "linux"))]
                {
                    if let Err(e) = app.deep_link().register_all() {
                        eprintln!("[LockDown] Warning: failed to register deep-link schemes at runtime: {e}");
                    }
                }
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
            attestation::get_attestation_info,
            attestation::set_attested_session_id,
            attestation::sync_server_time,
            attestation::sign_api_request,
            attestation::sign_exam_request,
            attestation::set_locked_assessment,
            attestation::set_client_accommodations,
            security::run_preflight_checks,
            security::run_runtime_integrity_check,
            security::inspect_media_hardware,
            security::list_non_essential_apps,
            security::close_non_essential_apps,
            security::check_and_request_media_permissions,
            security::open_system_privacy_settings,
            security::list_blocking_apps,
            security::kill_blocking_app,
            security::kill_all_blocking_apps,
            security::run_full_system_diagnostic,
            security::get_lockdown_diagnostic_logs,
            security::get_display_topology,
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
            state_persistence::get_persisted_exam_session,
            state_persistence::save_persisted_exam_session,
            state_persistence::clear_persisted_exam_session,
            permissions_onboarding::get_startup_permission_checklist,
            permissions_onboarding::request_os_permission,
            permissions_onboarding::complete_permission_onboarding,
            consume_pending_launch_url,
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
