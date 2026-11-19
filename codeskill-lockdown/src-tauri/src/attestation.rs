use std::sync::Mutex;
use std::sync::atomic::{AtomicI64, Ordering};
use p256::ecdsa::{SigningKey, Signature, signature::Signer};
use p256::pkcs8::EncodePublicKey;
use rand_core::OsRng;
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};

pub struct AttestationState {
    pub signing_key: SigningKey,
    pub session_id: Mutex<Option<String>>,
    pub clock_offset_ms: AtomicI64,
    pub locked_assessment_id: Mutex<Option<String>>,
    pub allowed_external_urls: Mutex<Vec<String>>,
    pub kiosk_mode: Mutex<String>,
    pub attestation_tier: Mutex<String>,
    pub kiosk_active: std::sync::atomic::AtomicBool,
    pub client_binary_hash: Mutex<String>,
}

impl AttestationState {
    pub fn detect_attestation_tier() -> String {
        #[cfg(target_os = "macos")]
        {
            if let Ok(output) = std::process::Command::new("sysctl")
                .args(["-n", "hw.optional.arm64"])
                .output()
            {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if text == "1" {
                    return "hardware_tpm_enclave".to_string();
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            if std::path::Path::new("C:\\Windows\\System32\\tpm.msc").exists() {
                return "hardware_tpm_enclave".to_string();
            }
        }

        #[cfg(target_os = "linux")]
        {
            if std::path::Path::new("/dev/tpmrm0").exists() || std::path::Path::new("/dev/tpm0").exists() {
                return "hardware_tpm_enclave".to_string();
            }
        }

        "software_binary_bound".to_string()
    }

    pub fn new() -> Self {
        let signing_key = SigningKey::random(&mut OsRng);

        // Compute SHA-256 hash of the running executable
        let binary_hash = std::env::current_exe()
            .ok()
            .and_then(|p| std::fs::read(p).ok())
            .map(|bytes| {
                let mut hasher = Sha256::new();
                hasher.update(&bytes);
                hex::encode(hasher.finalize())
            })
            .unwrap_or_else(|| "0000000000000000000000000000000000000000000000000000000000000000".to_string());

        let attestation_tier = Self::detect_attestation_tier();

        Self {
            signing_key,
            session_id: Mutex::new(None),
            clock_offset_ms: AtomicI64::new(0),
            locked_assessment_id: Mutex::new(None),
            allowed_external_urls: Mutex::new(Vec::new()),
            kiosk_mode: Mutex::new("standard".to_string()),
            attestation_tier: Mutex::new(attestation_tier),
            kiosk_active: std::sync::atomic::AtomicBool::new(false),
            client_binary_hash: Mutex::new(binary_hash),
        }
    }
}

impl Default for AttestationState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AttestationHeaders {
    #[serde(rename = "X-CodeSkill-Session-Id")]
    pub session_id: String,
    #[serde(rename = "X-CodeSkill-Timestamp")]
    pub timestamp: String,
    #[serde(rename = "X-CodeSkill-Nonce")]
    pub nonce: String,
    #[serde(rename = "X-CodeSkill-Signature")]
    pub signature: String,
    #[serde(rename = "X-CodeSkill-Client")]
    pub client: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationInfo {
    pub public_key_pem: String,
    pub attestation_tier: String,
    pub kiosk_mode: String,
    pub client_binary_hash: String,
}

#[tauri::command]
pub fn get_attestation_info(
    state: tauri::State<'_, AttestationState>,
) -> Result<AttestationInfo, String> {
    let verifying_key = state.signing_key.verifying_key();
    let public_key_pem = verifying_key
        .to_public_key_pem(p256::pkcs8::LineEnding::LF)
        .map_err(|e| format!("Failed to encode public key to PEM: {}", e))?;
    let attestation_tier = state
        .attestation_tier
        .lock()
        .map(|l| l.clone())
        .unwrap_or_else(|_| "software_binary_bound".to_string());
    let kiosk_mode = state
        .kiosk_mode
        .lock()
        .map(|l| l.clone())
        .unwrap_or_else(|_| "standard".to_string());
    let client_binary_hash = state
        .client_binary_hash
        .lock()
        .map(|l| l.clone())
        .unwrap_or_default();

    Ok(AttestationInfo {
        public_key_pem,
        attestation_tier,
        kiosk_mode,
        client_binary_hash,
    })
}

#[tauri::command]
pub fn get_attestation_public_key(state: tauri::State<'_, AttestationState>) -> Result<String, String> {
    let verifying_key = state.signing_key.verifying_key();
    verifying_key
        .to_public_key_pem(p256::pkcs8::LineEnding::LF)
        .map_err(|e| format!("Failed to encode public key to PEM: {}", e))
}

#[tauri::command]
pub fn set_attested_session_id(
    session_id: String,
    state: tauri::State<'_, AttestationState>,
) -> Result<(), String> {
    let mut lock = state
        .session_id
        .lock()
        .map_err(|_| "Failed to acquire lock on session_id".to_string())?;
    *lock = Some(session_id);
    Ok(())
}

#[tauri::command]
pub fn set_locked_assessment(
    app: tauri::AppHandle,
    assessment_id: String,
    allowed_urls: Option<Vec<String>>,
    state: tauri::State<'_, AttestationState>,
) -> Result<(), String> {
    if let Ok(mut lock) = state.locked_assessment_id.lock() {
        *lock = Some(assessment_id.clone());
    }
    if let Some(urls) = allowed_urls {
        if let Ok(mut lock) = state.allowed_external_urls.lock() {
            *lock = urls;
        }
    }
    let _ = crate::state_persistence::save_persisted_exam_session(
        app,
        crate::state_persistence::PersistedExamSessionPatch {
            assessment_id: Some(assessment_id.clone()),
            ..Default::default()
        },
    );
    crate::security::log_diagnostic_event(
        "SECURITY",
        &format!("Assessment session locked to {}", assessment_id),
    );
    Ok(())
}

#[tauri::command]
pub fn sync_server_time(
    server_time_ms: i64,
    state: tauri::State<'_, AttestationState>,
) -> Result<i64, String> {
    let local_now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Clock error: {}", e))?
        .as_millis() as i64;
    let offset = server_time_ms - local_now_ms;
    state.clock_offset_ms.store(offset, Ordering::SeqCst);
    Ok(offset)
}

#[tauri::command]
pub fn sign_api_request(
    method: String,
    path: String,
    body: String,
    state: tauri::State<'_, AttestationState>,
) -> Result<AttestationHeaders, String> {
    let session_id = state
        .session_id
        .lock()
        .map_err(|_| "Failed to lock attestation state".to_string())?
        .clone()
        .unwrap_or_default();

    let local_now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Clock drift error: {}", e))?
        .as_millis() as i64;

    let offset = state.clock_offset_ms.load(Ordering::SeqCst);
    let synced_timestamp_ms = local_now_ms + offset;
    let timestamp = synced_timestamp_ms.to_string();

    let nonce = uuid::Uuid::new_v4().to_string();

    // Compute SHA256 of the body
    let mut hasher = Sha256::new();
    hasher.update(body.as_bytes());
    let body_hash_hex = hex::encode(hasher.finalize());

    // Canonical payload format: METHOD:PATH:TIMESTAMP:NONCE:SHA256(BODY)
    let payload = format!(
        "{}:{}:{}:{}:{}",
        method.to_uppercase(),
        path,
        timestamp,
        nonce,
        body_hash_hex
    );

    // ECDSA sign with SHA-256 and encode signature in ASN.1 DER format
    let signature: Signature = state.signing_key.sign(payload.as_bytes());
    let der_signature = signature.to_der();
    let signature_hex = hex::encode(der_signature.as_bytes());

    Ok(AttestationHeaders {
        session_id,
        timestamp,
        nonce,
        signature: signature_hex,
        client: "CodeSkill-LockDown/1.0.0".to_string(),
    })
}
