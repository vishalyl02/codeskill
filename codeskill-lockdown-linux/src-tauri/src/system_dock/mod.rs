use serde::{Deserialize, Serialize};
use tauri::State;
use crate::attestation::AttestationState;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatteryInfo {
    pub percentage: u8,
    pub is_charging: bool,
    pub has_battery: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WifiNetworkInfo {
    pub ssid: String,
    pub signal_strength: u8,
    pub is_connected: bool,
    pub is_secured: bool,
}

#[tauri::command]
pub fn get_battery_status() -> Result<BatteryInfo, String> {
    os_impl::get_battery_status()
}

#[tauri::command]
pub fn get_system_volume() -> Result<u8, String> {
    os_impl::get_system_volume()
}

#[tauri::command]
pub fn set_system_volume(level: u8) -> Result<(), String> {
    os_impl::set_system_volume(level)
}

#[tauri::command]
pub fn get_keyboard_layout() -> Result<String, String> {
    os_impl::get_keyboard_layout()
}

#[tauri::command]
pub fn get_synced_timestamp_ms(state: State<'_, AttestationState>) -> i64 {
    let local_now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let offset = state.clock_offset_ms.load(std::sync::atomic::Ordering::Relaxed);
    local_now + offset
}

#[tauri::command]
pub fn scan_wifi_networks() -> Result<Vec<WifiNetworkInfo>, String> {
    os_impl::scan_wifi_networks()
}

#[tauri::command]
pub fn connect_wifi_network(ssid: String, password: Option<String>) -> Result<(), String> {
    os_impl::connect_wifi_network(ssid, password)
}
