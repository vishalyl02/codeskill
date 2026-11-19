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
}

impl AttestationState {
    pub fn new() -> Self {
        let signing_key = SigningKey::random(&mut OsRng);
        Self {
            signing_key,
            session_id: Mutex::new(None),
            clock_offset_ms: AtomicI64::new(0),
            locked_assessment_id: Mutex::new(None),
            allowed_external_urls: Mutex::new(Vec::new()),
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
