use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct OfflineVaultState {
    pub cipher: Mutex<Aes256Gcm>,
    pub key_bytes: Mutex<[u8; 32]>,
}

impl OfflineVaultState {
    pub fn new() -> Self {
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);
        let cipher = Aes256Gcm::new((&key).into());
        Self {
            cipher: Mutex::new(cipher),
            key_bytes: Mutex::new(key),
        }
    }

    pub fn init_from_app(&self, app: &AppHandle) {
        if let Ok(vault_dir) = get_vault_dir(app) {
            let key_path = vault_dir.join(".vault.key");
            if key_path.exists() {
                if let Ok(bytes) = fs::read(&key_path) {
                    if bytes.len() == 32 {
                        let mut arr = [0u8; 32];
                        arr.copy_from_slice(&bytes);
                        let cipher = Aes256Gcm::new((&arr).into());
                        if let Ok(mut c_lock) = self.cipher.lock() {
                            *c_lock = cipher;
                        }
                        if let Ok(mut k_lock) = self.key_bytes.lock() {
                            *k_lock = arr;
                        }
                        return;
                    }
                }
            }
            if let Ok(k_lock) = self.key_bytes.lock() {
                let _ = fs::write(&key_path, *k_lock);
            }
        }
    }
}

impl Default for OfflineVaultState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct VaultRecord {
    nonce: String,
    ciphertext: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct VaultFile {
    entries: HashMap<String, VaultRecord>,
}

fn get_vault_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Failed to locate app local data dir: {}", e))?;
    let vault_dir = base.join("exam-vault");
    if !vault_dir.exists() {
        fs::create_dir_all(&vault_dir)
            .map_err(|e| format!("Failed to create vault dir: {}", e))?;
    }
    Ok(vault_dir)
}

#[allow(deprecated)]
#[tauri::command]
pub fn vault_upsert_autosave(
    app: AppHandle,
    attempt_id: String,
    entry_key: String,
    plaintext_json: String,
    state: tauri::State<'_, OfflineVaultState>,
) -> Result<(), String> {
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let cipher = state
        .cipher
        .lock()
        .map_err(|_| "Failed to lock cipher".to_string())?;

    let ciphertext = cipher
        .encrypt(nonce, plaintext_json.as_bytes())
        .map_err(|e| format!("Encryption error: {}", e))?;

    let vault_dir = get_vault_dir(&app)?;
    let file_path = vault_dir.join(format!("{}.vault", attempt_id));

    let mut vault_file: VaultFile = if file_path.exists() {
        fs::read_to_string(&file_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        VaultFile::default()
    };

    vault_file.entries.insert(
        entry_key,
        VaultRecord {
            nonce: hex::encode(nonce_bytes),
            ciphertext: hex::encode(ciphertext),
        },
    );

    let json = serde_json::to_string(&vault_file)
        .map_err(|e| format!("Failed to serialize vault file: {}", e))?;
    fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write vault file: {}", e))?;

    Ok(())
}

#[allow(deprecated)]
#[tauri::command]
pub fn vault_read_all_autosaves(
    app: AppHandle,
    attempt_id: String,
    state: tauri::State<'_, OfflineVaultState>,
) -> Result<HashMap<String, String>, String> {
    let vault_dir = get_vault_dir(&app)?;
    let file_path = vault_dir.join(format!("{}.vault", attempt_id));

    if !file_path.exists() {
        return Ok(HashMap::new());
    }

    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read vault file: {}", e))?;
    let vault_file: VaultFile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse vault file: {}", e))?;

    let cipher = state
        .cipher
        .lock()
        .map_err(|_| "Failed to lock cipher".to_string())?;

    let mut result = HashMap::new();
    for (key, record) in vault_file.entries {
        let nonce_bytes = hex::decode(&record.nonce)
            .map_err(|e| format!("Invalid nonce hex: {}", e))?;
        let ct_bytes = hex::decode(&record.ciphertext)
            .map_err(|e| format!("Invalid ciphertext hex: {}", e))?;
        let nonce = Nonce::from_slice(&nonce_bytes);

        if let Ok(plaintext_bytes) = cipher.decrypt(nonce, ct_bytes.as_ref()) {
            if let Ok(plaintext) = String::from_utf8(plaintext_bytes) {
                result.insert(key, plaintext);
            }
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn vault_remove_entry(
    app: AppHandle,
    attempt_id: String,
    entry_key: String,
    _state: tauri::State<'_, OfflineVaultState>,
) -> Result<(), String> {
    let vault_dir = get_vault_dir(&app)?;
    let file_path = vault_dir.join(format!("{}.vault", attempt_id));

    if !file_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read vault file: {}", e))?;
    let mut vault_file: VaultFile = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse vault file: {}", e))?;

    vault_file.entries.remove(&entry_key);

    let json = serde_json::to_string(&vault_file)
        .map_err(|e| format!("Failed to serialize vault file: {}", e))?;
    fs::write(&file_path, json)
        .map_err(|e| format!("Failed to write vault file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn vault_purge_attempt(
    app: AppHandle,
    attempt_id: String,
    _state: tauri::State<'_, OfflineVaultState>,
) -> Result<(), String> {
    let vault_dir = get_vault_dir(&app)?;
    let file_path = vault_dir.join(format!("{}.vault", attempt_id));

    if file_path.exists() {
        if let Ok(metadata) = fs::metadata(&file_path) {
            let len = metadata.len() as usize;
            if len > 0 {
                let zeros = vec![0u8; len];
                if let Ok(mut f) = fs::OpenOptions::new().write(true).open(&file_path) {
                    let _ = f.write_all(&zeros);
                    let _ = f.flush();
                    let _ = f.sync_all();
                }
            }
        }
        let _ = fs::remove_file(&file_path);
    }

    Ok(())
}
