use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::EnvFilter;

const MAX_LOG_FILE_BYTES: u64 = 25 * 1024 * 1024; // 25 MB
const RETENTION_DAYS: u64 = 14;

static BOOT_ID: OnceLock<String> = OnceLock::new();
static WORKER_GUARD: OnceLock<WorkerGuard> = OnceLock::new();
static INITIALIZED: OnceLock<bool> = OnceLock::new();
static CORRELATION_CTX: Mutex<Option<CorrelationContext>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CorrelationContext {
    pub assessment_id: Option<String>,
    pub candidate_id: Option<String>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightRecorderContext {
    pub boot_id: String,
    pub platform: String,
    pub os_version: String,
    pub arch: String,
    pub log_dir: String,
    pub client_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticBundleResult {
    pub success: bool,
    pub bundle_path: String,
    pub file_count: usize,
    pub total_bytes: u64,
    pub boot_id: String,
}

pub fn get_boot_id() -> &'static str {
    BOOT_ID.get_or_init(|| uuid::Uuid::new_v4().to_string())
}

pub fn set_correlation_context(
    assessment_id: Option<String>,
    candidate_id: Option<String>,
    session_id: Option<String>,
) {
    if let Ok(mut lock) = CORRELATION_CTX.lock() {
        let current = lock.get_or_insert_with(CorrelationContext::default);
        if assessment_id.is_some() {
            current.assessment_id = assessment_id;
        }
        if candidate_id.is_some() {
            current.candidate_id = candidate_id;
        }
        if session_id.is_some() {
            current.session_id = session_id;
        }
    }
}

pub fn get_correlation_context() -> CorrelationContext {
    CORRELATION_CTX
        .lock()
        .ok()
        .and_then(|l| l.clone())
        .unwrap_or_default()
}

/// Returns the platform-standard log directory:
/// - macOS: `~/Library/Logs/com.codeskill.lockdown/`
/// - Windows: `%LOCALAPPDATA%\com.codeskill.lockdown\logs\`
/// - Linux: `~/.local/share/com.codeskill.lockdown/logs/` (or `$XDG_DATA_HOME/...`)
pub fn get_platform_log_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Logs")
                .join("com.codeskill.lockdown");
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            return PathBuf::from(local_app_data)
                .join("com.codeskill.lockdown")
                .join("logs");
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(xdg_data) = std::env::var("XDG_DATA_HOME") {
            if !xdg_data.trim().is_empty() {
                return PathBuf::from(xdg_data)
                    .join("com.codeskill.lockdown")
                    .join("logs");
            }
        }
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("com.codeskill.lockdown")
                .join("logs");
        }
    }
    std::env::temp_dir()
        .join("com.codeskill.lockdown")
        .join("logs")
}

/// Prunes log files older than `retention_days` and rotates any log exceeding `MAX_LOG_FILE_BYTES`.
pub fn prune_old_logs(log_dir: &Path, retention_days: u64) {
    let Ok(entries) = fs::read_dir(log_dir) else {
        return;
    };
    let cutoff = SystemTime::now()
        .checked_sub(Duration::from_secs(retention_days * 24 * 60 * 60))
        .unwrap_or(UNIX_EPOCH);

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            if let Ok(modified) = meta.modified() {
                if modified < cutoff {
                    let _ = fs::remove_file(&path);
                    continue;
                }
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("flight.jsonl");
            if !name.ends_with(".bak") && meta.len() > MAX_LOG_FILE_BYTES {
                let rotated = log_dir.join(format!("{}.oversize.bak", name));
                let _ = fs::rename(&path, rotated);
            }
        }
    }
}

/// Redacts sensitive keys (`authorization`, `token`, `secret`, `signature`, `password`, `pin`, `code`, `answer`, `cookie`)
/// recursively, preserving only byte-length metadata (`[REDACTED:<len>B]`).
pub fn redact_json_value(value: &mut Value) {
    match value {
        Value::Object(map) => {
            for (k, v) in map.iter_mut() {
                let lower = k.to_lowercase();
                let is_sensitive = lower.contains("authorization")
                    || lower.contains("signature")
                    || lower.contains("secret")
                    || lower.contains("token")
                    || lower.contains("password")
                    || lower.contains("pin")
                    || lower.contains("cookie")
                    || lower == "code"
                    || lower == "answer"
                    || lower == "answers"
                    || lower.contains("rawcode");

                if is_sensitive {
                    let byte_len = match *v {
                        Value::String(ref s) => s.len(),
                        ref other => other.to_string().len(),
                    };
                    *v = Value::String(format!("[REDACTED:{}B]", byte_len));
                } else {
                    redact_json_value(v);
                }
            }
        }
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                redact_json_value(item);
            }
        }
        _ => {}
    }
}

/// Initializes the global JSONL flight recorder and panic crash hook early on startup.
pub fn init_flight_recorder() {
    let _boot_id = get_boot_id();
    if INITIALIZED.set(true).is_err() {
        return;
    }

    let log_dir = get_platform_log_dir();
    let _ = fs::create_dir_all(&log_dir);
    prune_old_logs(&log_dir, RETENTION_DAYS);

    let file_appender = tracing_appender::rolling::daily(&log_dir, "flight-recorder.jsonl");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
    let _ = WORKER_GUARD.set(guard);

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,codeskill_lockdown=debug"));

    let subscriber = tracing_subscriber::fmt()
        .json()
        .flatten_event(true)
        .with_current_span(false)
        .with_span_list(false)
        .with_env_filter(filter)
        .with_writer(non_blocking)
        .finish();

    let _ = tracing::subscriber::set_global_default(subscriber);

    install_panic_crash_hook();

    record_event(
        "INFO",
        "BOOT",
        "SCENARIO_A_BOOT",
        "init_flight_recorder",
        "success",
        json!({
            "logDir": log_dir.to_string_lossy(),
            "clientVersion": env!("CARGO_PKG_VERSION"),
        }),
    );
}

fn install_panic_crash_hook() {
    let orig_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let log_dir = get_platform_log_dir();
        let _ = fs::create_dir_all(&log_dir);
        let panic_file = log_dir.join("panic-crash.jsonl");

        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "non-string panic payload".to_string()
        };

        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());

        let bt = std::backtrace::Backtrace::force_capture().to_string();
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let corr = get_correlation_context();

        let entry = json!({
            "timestampMs": now_ms,
            "level": "FATAL",
            "category": "PANIC",
            "bootId": get_boot_id(),
            "platform": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
            "assessmentId": corr.assessment_id,
            "candidateId": corr.candidate_id,
            "sessionId": corr.session_id,
            "location": location,
            "payload": payload,
            "backtrace": bt,
        });

        if let Ok(mut f) = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&panic_file)
        {
            let _ = writeln!(f, "{}", entry);
            let _ = f.flush();
        }

        // Release OS kiosk mode & clean up dirty lock if panic occurs during an exam
        crate::kiosk_os::release_os_kiosk_system();
        orig_hook(info);
    }));
}

pub fn record_event(
    level: &str,
    category: &str,
    scenario: &str,
    step: &str,
    outcome: &str,
    mut fields: Value,
) {
    redact_json_value(&mut fields);
    let corr = get_correlation_context();
    let boot_id = get_boot_id();
    let platform = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let fields_str = fields.to_string();

    match level.to_uppercase().as_str() {
        "ERROR" | "FATAL" => {
            tracing::error!(
                bootId = boot_id,
                platform = platform,
                arch = arch,
                category = category,
                scenario = scenario,
                step = step,
                outcome = outcome,
                assessmentId = ?corr.assessment_id,
                candidateId = ?corr.candidate_id,
                sessionId = ?corr.session_id,
                details = %fields_str,
                "flight_recorder_event"
            );
        }
        "WARN" => {
            tracing::warn!(
                bootId = boot_id,
                platform = platform,
                arch = arch,
                category = category,
                scenario = scenario,
                step = step,
                outcome = outcome,
                assessmentId = ?corr.assessment_id,
                candidateId = ?corr.candidate_id,
                sessionId = ?corr.session_id,
                details = %fields_str,
                "flight_recorder_event"
            );
        }
        _ => {
            tracing::info!(
                bootId = boot_id,
                platform = platform,
                arch = arch,
                category = category,
                scenario = scenario,
                step = step,
                outcome = outcome,
                assessmentId = ?corr.assessment_id,
                candidateId = ?corr.candidate_id,
                sessionId = ?corr.session_id,
                details = %fields_str,
                "flight_recorder_event"
            );
        }
    }

    crate::security::log_diagnostic_entry(
        level,
        category,
        &format!("[{}::{}] outcome={} {}", scenario, step, outcome, fields_str),
    );
}

#[tauri::command]
pub fn get_flight_recorder_context() -> FlightRecorderContext {
    FlightRecorderContext {
        boot_id: get_boot_id().to_string(),
        platform: std::env::consts::OS.to_string(),
        os_version: std::env::consts::FAMILY.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        log_dir: get_platform_log_dir().to_string_lossy().to_string(),
        client_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
pub fn log_frontend_event(
    level: String,
    category: String,
    event: String,
    context: Value,
) -> Result<(), String> {
    let scenario = context
        .get("scenario")
        .and_then(|v| v.as_str())
        .unwrap_or("FRONTEND_WEBVIEW")
        .to_string();
    let outcome = context
        .get("outcome")
        .and_then(|v| v.as_str())
        .unwrap_or("recorded")
        .to_string();

    if let Some(aid) = context.get("assessmentId").and_then(|v| v.as_str()) {
        let cid = context
            .get("candidateId")
            .and_then(|v| v.as_str())
            .map(String::from);
        let sid = context
            .get("sessionId")
            .and_then(|v| v.as_str())
            .map(String::from);
        set_correlation_context(Some(aid.to_string()), cid, sid);
    }

    record_event(&level, &category, &scenario, &event, &outcome, context);
    Ok(())
}

#[tauri::command]
pub fn export_diagnostic_log_bundle(app: AppHandle) -> Result<DiagnosticBundleResult, String> {
    let log_dir = get_platform_log_dir();
    let _ = fs::create_dir_all(&log_dir);

    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let export_dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().desktop_dir())
        .unwrap_or_else(|_| std::env::temp_dir());
    let _ = fs::create_dir_all(&export_dir);

    let bundle_name = format!("codeskill-lockdown-diagnostics-{}.zip", now_secs);
    let bundle_path = export_dir.join(&bundle_name);

    let file = fs::File::create(&bundle_path)
        .map_err(|e| format!("Failed to create diagnostic zip bundle: {}", e))?;
    let mut zip_writer = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let mut file_count: usize = 0;
    let mut total_bytes: u64 = 0;

    // 1. Include OS & Hardware summary JSON
    let summary = json!({
        "bootId": get_boot_id(),
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "clientVersion": env!("CARGO_PKG_VERSION"),
        "exportedAtEpochSec": now_secs,
        "correlation": get_correlation_context(),
    });
    if let Ok(summary_bytes) = serde_json::to_vec_pretty(&summary) {
        if zip_writer.start_file("system-summary.json", options).is_ok()
            && zip_writer.write_all(&summary_bytes).is_ok()
        {
            file_count += 1;
            total_bytes += summary_bytes.len() as u64;
        }
    }

    // 2. Include last 48h of JSONL flight-recorder & panic logs
    let cutoff_48h = SystemTime::now()
        .checked_sub(Duration::from_secs(48 * 60 * 60))
        .unwrap_or(UNIX_EPOCH);

    if let Ok(entries) = fs::read_dir(&log_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let recent = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| t >= cutoff_48h)
                .unwrap_or(true);
            if !recent {
                continue;
            }
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if let Ok(bytes) = fs::read(&path) {
                    if zip_writer
                        .start_file(format!("logs/{}", name), options)
                        .is_ok()
                        && zip_writer.write_all(&bytes).is_ok()
                    {
                        file_count += 1;
                        total_bytes += bytes.len() as u64;
                    }
                }
            }
        }
    }

    // 3. Include sanitized permissions_setup_state.json (strip portalRestoreToken)
    if let Some(mut perm_state) =
        crate::permissions_onboarding::load_persisted_permissions_state(&app)
    {
        perm_state.portal_restore_token = perm_state
            .portal_restore_token
            .as_ref()
            .map(|t| format!("[REDACTED:{}B]", t.len()));
        if let Ok(perm_bytes) = serde_json::to_vec_pretty(&perm_state) {
            if zip_writer
                .start_file("permissions_setup_state.sanitized.json", options)
                .is_ok()
                && zip_writer.write_all(&perm_bytes).is_ok()
            {
                file_count += 1;
                total_bytes += perm_bytes.len() as u64;
            }
        }
    }

    zip_writer
        .finish()
        .map_err(|e| format!("Failed to finalize diagnostic zip: {}", e))?;

    record_event(
        "INFO",
        "DIAGNOSTICS",
        "SCENARIO_E_EXPORT",
        "export_diagnostic_log_bundle",
        "success",
        json!({
            "bundlePath": bundle_path.to_string_lossy(),
            "fileCount": file_count,
            "totalBytes": total_bytes,
        }),
    );

    Ok(DiagnosticBundleResult {
        success: true,
        bundle_path: bundle_path.to_string_lossy().to_string(),
        file_count,
        total_bytes,
        boot_id: get_boot_id().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redact_json_value_masks_secrets_and_answers() {
        let mut val = json!({
            "authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.secret",
            "xLockdownSignature": "deadbeef1234",
            "quitPin": "998877",
            "code": "print('hello')",
            "nested": {
                "password": "my-password",
                "durationMs": 42
            },
            "platform": "macos"
        });

        redact_json_value(&mut val);

        assert!(val["authorization"]
            .as_str()
            .unwrap()
            .starts_with("[REDACTED:"));
        assert!(val["xLockdownSignature"]
            .as_str()
            .unwrap()
            .starts_with("[REDACTED:"));
        assert!(val["quitPin"].as_str().unwrap().starts_with("[REDACTED:"));
        assert!(val["code"].as_str().unwrap().starts_with("[REDACTED:"));
        assert!(val["nested"]["password"]
            .as_str()
            .unwrap()
            .starts_with("[REDACTED:"));
        assert_eq!(val["nested"]["durationMs"], 42);
        assert_eq!(val["platform"], "macos");
    }

    #[test]
    fn test_platform_log_dir_is_non_empty() {
        let dir = get_platform_log_dir();
        let s = dir.to_string_lossy();
        assert!(!s.is_empty());
        assert!(s.contains("com.codeskill.lockdown"));
    }

    #[test]
    fn test_prune_old_logs_keeps_recent_files() {
        let tmp = std::env::temp_dir().join(format!("fr_prune_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&tmp).unwrap();
        let recent = tmp.join("flight-recorder.jsonl");
        fs::write(&recent, b"{\"ok\":true}\n").unwrap();

        prune_old_logs(&tmp, 14);
        assert!(recent.exists());
        let _ = fs::remove_dir_all(&tmp);
    }
}
