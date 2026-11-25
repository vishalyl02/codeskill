use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager};

use crate::attestation::AttestationState;
use crate::security::log_diagnostic_entry;

type HmacSha256 = Hmac<Sha256>;

const SESSION_EXPIRATION_MS: u64 = 8 * 60 * 60 * 1000; // 8 hours
const HMAC_KEY: &[u8] = b"codeskill-lockdown-secure-session-hmac-salt-v1";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PersistedExamSession {
    #[serde(rename = "assessmentId")]
    pub assessment_id: Option<String>,
    #[serde(rename = "candidateId")]
    pub candidate_id: Option<String>,
    #[serde(rename = "portalOrigin", default, skip_serializing_if = "Option::is_none")]
    pub portal_origin: Option<String>,
    #[serde(rename = "authToken")]
    pub auth_token: Option<String>,
    #[serde(rename = "attestationToken")]
    pub attestation_token: Option<String>,
    #[serde(rename = "kioskActive")]
    pub kiosk_active: bool,
    #[serde(rename = "kioskMode")]
    pub kiosk_mode: Option<String>,
    #[serde(rename = "faceVerified")]
    pub face_verified: bool,
    #[serde(rename = "mediaPermissionsVerified")]
    pub media_permissions_verified: bool,
    #[serde(rename = "isSubmitted")]
    pub is_submitted: bool,
    #[serde(rename = "submittedAtMs")]
    pub submitted_at_ms: Option<u64>,
    #[serde(rename = "submissionReceiptId")]
    pub submission_receipt_id: Option<String>,
    #[serde(rename = "updatedAtMs")]
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PersistedExamSessionPatch {
    #[serde(rename = "assessmentId")]
    pub assessment_id: Option<String>,
    #[serde(rename = "candidateId")]
    pub candidate_id: Option<String>,
    #[serde(rename = "portalOrigin", default, skip_serializing_if = "Option::is_none")]
    pub portal_origin: Option<String>,
    #[serde(rename = "authToken")]
    pub auth_token: Option<String>,
    #[serde(rename = "attestationToken")]
    pub attestation_token: Option<String>,
    #[serde(rename = "kioskActive")]
    pub kiosk_active: Option<bool>,
    #[serde(rename = "kioskMode")]
    pub kiosk_mode: Option<String>,
    #[serde(rename = "faceVerified")]
    pub face_verified: Option<bool>,
    #[serde(rename = "mediaPermissionsVerified")]
    pub media_permissions_verified: Option<bool>,
    #[serde(rename = "isSubmitted")]
    pub is_submitted: Option<bool>,
    #[serde(rename = "submittedAtMs")]
    pub submitted_at_ms: Option<u64>,
    #[serde(rename = "submissionReceiptId")]
    pub submission_receipt_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SignedSessionJournal {
    pub session: PersistedExamSession,
    pub hmac: String,
}

fn compute_hmac(session: &PersistedExamSession) -> Result<String, String> {
    let serialized = serde_json::to_string(session).map_err(|e| e.to_string())?;
    let mut mac = HmacSha256::new_from_slice(HMAC_KEY).map_err(|e| e.to_string())?;
    mac.update(serialized.as_bytes());
    let result = mac.finalize();
    Ok(hex::encode(result.into_bytes()))
}

fn verify_hmac(session: &PersistedExamSession, expected_hmac: &str) -> bool {
    if let Ok(computed) = compute_hmac(session) {
        computed == expected_hmac
    } else {
        false
    }
}

pub fn get_session_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app_data_dir: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app_data_dir: {}", e))?;
    Ok(dir.join("active_exam_session.json"))
}

pub fn read_persisted_session_raw(app: &AppHandle) -> Result<Option<PersistedExamSession>, String> {
    let path = get_session_file_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read active_exam_session.json: {}", e))?;

    let journal: SignedSessionJournal = serde_json::from_str(&contents)
        .map_err(|e| format!("Corrupted active_exam_session.json: {}", e))?;

    if !verify_hmac(&journal.session, &journal.hmac) {
        log_diagnostic_entry(
            "ERROR",
            "STATE_PERSISTENCE",
            "HMAC signature mismatch on active_exam_session.json! Session invalidated.",
        );
        let _ = fs::remove_file(&path);
        return Ok(None);
    }

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    if journal.session.updated_at_ms + SESSION_EXPIRATION_MS < now_ms {
        log_diagnostic_entry(
            "WARN",
            "STATE_PERSISTENCE",
            "Persisted exam session expired (> 8 hours old). Purging journal.",
        );
        let _ = fs::remove_file(&path);
        return Ok(None);
    }

    Ok(Some(journal.session))
}

pub fn hydrate_attestation_state_from_disk(app: &AppHandle) {
    if let Ok(Some(session)) = read_persisted_session_raw(app) {
        let att_state = app.state::<AttestationState>();
        if let Some(ref assessment_id) = session.assessment_id {
            if let Ok(mut locked) = att_state.locked_assessment_id.lock() {
                *locked = Some(assessment_id.clone());
            }
        }
        if let Some(ref origin) = session.portal_origin {
            crate::config::set_runtime_origin(origin);
        }
        if let Some(ref mode) = session.kiosk_mode {
            if let Ok(mut km) = att_state.kiosk_mode.lock() {
                *km = mode.clone();
            }
        }
        att_state.kiosk_active.store(session.kiosk_active, Ordering::SeqCst);

        log_diagnostic_entry(
            "INFO",
            "STATE_PERSISTENCE",
            &format!(
                "Hydrated AttestationState from disk: assessment={:?}, kiosk_active={}, is_submitted={}",
                session.assessment_id, session.kiosk_active, session.is_submitted
            ),
        );
    }
}

struct QueuedWrite {
    path: PathBuf,
    json: String,
}

static WRITE_QUEUE: std::sync::Mutex<Option<QueuedWrite>> = std::sync::Mutex::new(None);
static WORKER_RUNNING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn schedule_async_debounced_write(path: PathBuf, json: String, immediate: bool) {
    if immediate {
        let temp_path = path.with_extension(format!("tmp.{}", uuid::Uuid::new_v4()));
        if let Ok(_) = fs::write(&temp_path, json.as_bytes()) {
            let _ = fs::rename(&temp_path, &path);
        }
        return;
    }

    if let Ok(mut lock) = WRITE_QUEUE.lock() {
        *lock = Some(QueuedWrite {
            path: path.clone(),
            json: json.clone(),
        });
    }

    if !WORKER_RUNNING.swap(true, Ordering::SeqCst) {
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_millis(250));

                let item = {
                    let mut lock = WRITE_QUEUE.lock().unwrap_or_else(|e| e.into_inner());
                    lock.take()
                };

                if let Some(write_task) = item {
                    // Atomic write-temp-and-rename
                    let temp_path = write_task.path.with_extension(format!("tmp.{}", uuid::Uuid::new_v4()));
                    if let Ok(_) = fs::write(&temp_path, write_task.json.as_bytes()) {
                        let _ = fs::rename(&temp_path, &write_task.path);
                    }
                } else {
                    WORKER_RUNNING.store(false, Ordering::SeqCst);
                    break;
                }
            }
        });
    }
}

pub fn write_persisted_session_raw(
    app: &AppHandle,
    session: &PersistedExamSession,
) -> Result<(), String> {
    let path = get_session_file_path(app)?;
    let hmac = compute_hmac(session)?;
    let journal = SignedSessionJournal {
        session: session.clone(),
        hmac,
    };
    let json = serde_json::to_string_pretty(&journal)
        .map_err(|e| format!("Failed to serialize session journal: {}", e))?;
    schedule_async_debounced_write(path, json, session.is_submitted);
    Ok(())
}

#[tauri::command]
pub fn get_persisted_exam_session(
    app: AppHandle,
) -> Result<Option<PersistedExamSession>, String> {
    read_persisted_session_raw(&app)
}

#[tauri::command]
pub fn save_persisted_exam_session(
    app: AppHandle,
    patch: PersistedExamSessionPatch,
) -> Result<PersistedExamSession, String> {
    let mut current = read_persisted_session_raw(&app)?.unwrap_or_default();

    if let Some(aid) = patch.assessment_id {
        current.assessment_id = Some(aid);
    }
    if let Some(cid) = patch.candidate_id {
        current.candidate_id = Some(cid);
    }
    if let Some(orig) = patch.portal_origin {
        current.portal_origin = Some(orig);
    }
    if let Some(tok) = patch.auth_token {
        current.auth_token = Some(tok);
    }
    if let Some(atok) = patch.attestation_token {
        current.attestation_token = Some(atok);
    }
    if let Some(active) = patch.kiosk_active {
        current.kiosk_active = active;
    }
    if let Some(mode) = patch.kiosk_mode {
        current.kiosk_mode = Some(mode);
    }
    if let Some(face) = patch.face_verified {
        current.face_verified = face;
    }
    if let Some(media) = patch.media_permissions_verified {
        current.media_permissions_verified = media;
    }
    if let Some(submitted) = patch.is_submitted {
        current.is_submitted = submitted;
    }
    if let Some(at) = patch.submitted_at_ms {
        current.submitted_at_ms = Some(at);
    }
    if let Some(rec) = patch.submission_receipt_id {
        current.submission_receipt_id = Some(rec);
    }

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    current.updated_at_ms = now_ms;

    write_persisted_session_raw(&app, &current)?;

    // Synchronize Rust in-memory state
    let att_state = app.state::<AttestationState>();
    if let Some(ref aid) = current.assessment_id {
        if let Ok(mut locked) = att_state.locked_assessment_id.lock() {
            *locked = Some(aid.clone());
        }
    }
    if let Some(ref mode) = current.kiosk_mode {
        if let Ok(mut km) = att_state.kiosk_mode.lock() {
            *km = mode.clone();
        }
    }
    att_state.kiosk_active.store(current.kiosk_active, Ordering::SeqCst);

    Ok(current)
}

#[tauri::command]
pub fn clear_persisted_exam_session(app: AppHandle) -> Result<(), String> {
    let path = get_session_file_path(&app)?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete active_exam_session.json: {}", e))?;
    }
    log_diagnostic_entry(
        "INFO",
        "STATE_PERSISTENCE",
        "Cleared active_exam_session.json on exam exit or proctor reset.",
    );
    Ok(())
}
