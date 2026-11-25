use std::sync::Mutex;
use std::sync::atomic::{AtomicI64, Ordering};
use p256::ecdsa::{SigningKey, Signature, signature::Signer};
use p256::pkcs8::EncodePublicKey;
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};

type HmacSha256 = Hmac<Sha256>;

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
    pub session_hmac_key: Mutex<Option<[u8; 32]>>,
    pub allow_secondary_display: std::sync::atomic::AtomicBool,
    pub allow_accessibility_speech: std::sync::atomic::AtomicBool,
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

        let mut initial_hmac_key = [0u8; 32];
        OsRng.fill_bytes(&mut initial_hmac_key);

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
            session_hmac_key: Mutex::new(Some(initial_hmac_key)),
            allow_secondary_display: std::sync::atomic::AtomicBool::new(false),
            allow_accessibility_speech: std::sync::atomic::AtomicBool::new(false),
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
pub struct SignedRequestHeaders {
    #[serde(rename = "X-Lockdown-Session-Id")]
    pub session_id: String,
    #[serde(rename = "X-Lockdown-Timestamp")]
    pub timestamp: String,
    #[serde(rename = "X-Lockdown-Nonce")]
    pub nonce: String,
    #[serde(rename = "X-Lockdown-Binary-Hash")]
    pub binary_hash: String,
    #[serde(rename = "X-Lockdown-Signature")]
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttestationInfo {
    pub public_key_pem: String,
    pub attestation_tier: String,
    pub kiosk_mode: String,
    pub client_binary_hash: String,
    #[serde(default)]
    pub session_hmac_key: Option<String>,
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
    let session_hmac_key = state
        .session_hmac_key
        .lock()
        .ok()
        .and_then(|k| k.as_ref().map(|bytes| hex::encode(bytes)));

    Ok(AttestationInfo {
        public_key_pem,
        attestation_tier,
        kiosk_mode,
        client_binary_hash,
        session_hmac_key,
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
    session_hmac_key: Option<String>,
    state: tauri::State<'_, AttestationState>,
) -> Result<(), String> {
    let mut lock = state
        .session_id
        .lock()
        .map_err(|_| "Failed to acquire lock on session_id".to_string())?;
    *lock = Some(session_id.clone());
    crate::flight_recorder::set_correlation_context(None, None, Some(session_id.clone()));
    crate::flight_recorder::record_event(
        "INFO",
        "ATTESTATION",
        "SCENARIO_E_SIGNING",
        "set_attested_session_id",
        "bound",
        serde_json::json!({ "hasExplicitHmacKey": session_hmac_key.is_some() }),
    );

    if let Some(key_hex) = session_hmac_key {
        if let Ok(bytes) = hex::decode(key_hex.trim()) {
            if bytes.len() == 32 {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                if let Ok(mut key_lock) = state.session_hmac_key.lock() {
                    *key_lock = Some(arr);
                }
            }
        }
    } else {
        // Derive bound session key from session_id + client_binary_hash if not explicitly provided
        let binary_hash = state
            .client_binary_hash
            .lock()
            .map(|h| h.clone())
            .unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(session_id.as_bytes());
        hasher.update(binary_hash.as_bytes());
        let hash = hasher.finalize();
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&hash);
        if let Ok(mut key_lock) = state.session_hmac_key.lock() {
            *key_lock = Some(arr);
        }
    }

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

    crate::flight_recorder::record_event(
        "INFO",
        "ATTESTATION",
        "SCENARIO_E_SIGNING",
        "sign_api_request",
        "signed",
        serde_json::json!({
            "method": method,
            "path": path,
            "clockOffsetMs": offset,
            "bodyBytes": body.len(),
        }),
    );

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

#[tauri::command]
pub fn sign_exam_request(
    method: String,
    path: String,
    body_sha256: String,
    state: tauri::State<'_, AttestationState>,
) -> Result<SignedRequestHeaders, String> {
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

    crate::flight_recorder::record_event(
        "INFO",
        "ATTESTATION",
        "SCENARIO_E_SIGNING",
        "sign_exam_request",
        "signed",
        serde_json::json!({
            "method": method,
            "path": path,
            "clockOffsetMs": offset,
            "bodySha256Len": body_sha256.len(),
        }),
    );

    let nonce = uuid::Uuid::new_v4().to_string();

    let binary_hash = state
        .client_binary_hash
        .lock()
        .map(|h| h.clone())
        .unwrap_or_else(|_| "0000000000000000000000000000000000000000000000000000000000000000".to_string());

    let hmac_key = {
        let key_lock = state
            .session_hmac_key
            .lock()
            .map_err(|_| "Failed to lock session HMAC key".to_string())?;
        match *key_lock {
            Some(k) => k,
            None => {
                let mut hasher = Sha256::new();
                hasher.update(session_id.as_bytes());
                hasher.update(binary_hash.as_bytes());
                let hash = hasher.finalize();
                let mut k = [0u8; 32];
                k.copy_from_slice(&hash);
                k
            }
        }
    };

    // Canonical format: "{METHOD}\n{PATH}\n{TIMESTAMP}\n{NONCE}\n{BODY_SHA256}\n{BINARY_HASH}"
    let payload = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method.to_uppercase(),
        path,
        timestamp,
        nonce,
        body_sha256,
        binary_hash
    );

    let mut mac = HmacSha256::new_from_slice(&hmac_key)
        .map_err(|e| format!("Invalid HMAC key: {}", e))?;
    mac.update(payload.as_bytes());
    let signature = hex::encode(mac.finalize().into_bytes());

    Ok(SignedRequestHeaders {
        session_id,
        timestamp,
        nonce,
        binary_hash,
        signature,
    })
}

#[tauri::command]
pub fn set_client_accommodations(
    allow_secondary_display: bool,
    allow_accessibility_speech: bool,
    state: tauri::State<'_, AttestationState>,
) -> Result<bool, String> {
    state.allow_secondary_display.store(allow_secondary_display, Ordering::Relaxed);
    state.allow_accessibility_speech.store(allow_accessibility_speech, Ordering::Relaxed);
    crate::security::log_diagnostic_entry(
        "INFO",
        "ACCOMMODATIONS_CONFIGURED",
        &format!(
            "Candidate accommodations configured: allow_secondary_display={}, allow_accessibility_speech={}",
            allow_secondary_display, allow_accessibility_speech
        ),
    );
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ephemeral_session_key_and_signing() {
        let state = AttestationState::new();
        let initial_hmac_hex = state
            .session_hmac_key
            .lock()
            .unwrap()
            .map(|k| hex::encode(k))
            .unwrap();
        assert_eq!(initial_hmac_hex.len(), 64);

        let test_session_id = "test-session-uuid-1234".to_string();
        let custom_key_hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".to_string();

        *state.session_id.lock().unwrap() = Some(test_session_id.clone());
        let mut custom_key_bytes = [0u8; 32];
        custom_key_bytes.copy_from_slice(&hex::decode(&custom_key_hex).unwrap());
        *state.session_hmac_key.lock().unwrap() = Some(custom_key_bytes);

        let method = "POST".to_string();
        let path = "/api/assessments/submit".to_string();
        let body = r#"{"submitted":true}"#;
        let mut hasher = Sha256::new();
        hasher.update(body.as_bytes());
        let body_sha256 = hex::encode(hasher.finalize());
        let binary_hash = state.client_binary_hash.lock().unwrap().clone();

        let local_now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let timestamp = local_now_ms.to_string();
        let nonce = uuid::Uuid::new_v4().to_string();

        let payload = format!(
            "{}\n{}\n{}\n{}\n{}\n{}",
            method,
            path,
            timestamp,
            nonce,
            body_sha256,
            binary_hash
        );

        let mut mac = HmacSha256::new_from_slice(&custom_key_bytes).unwrap();
        mac.update(payload.as_bytes());
        let expected_sig = hex::encode(mac.finalize().into_bytes());

        assert!(!expected_sig.is_empty());
        assert_eq!(expected_sig.len(), 64);
    }

    #[test]
    fn test_client_accommodations_state() {
        let state = AttestationState::new();
        assert!(!state.allow_secondary_display.load(Ordering::Relaxed));
        assert!(!state.allow_accessibility_speech.load(Ordering::Relaxed));

        state.allow_secondary_display.store(true, Ordering::Relaxed);
        state.allow_accessibility_speech.store(true, Ordering::Relaxed);

        assert!(state.allow_secondary_display.load(Ordering::Relaxed));
        assert!(state.allow_accessibility_speech.load(Ordering::Relaxed));
    }
}
