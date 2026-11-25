use super::{BatteryInfo, WifiNetworkInfo};

fn get_macos_wifi_device() -> String {
    if let Ok(output) = std::process::Command::new("networksetup")
        .args(["-listallhardwareports"])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        let mut is_wifi = false;
        for line in text.lines() {
            if line.contains("Hardware Port: Wi-Fi") || line.contains("Hardware Port: AirPort") {
                is_wifi = true;
                continue;
            }
            if is_wifi && line.starts_with("Device:") {
                if let Some(dev) = line.split(':').nth(1) {
                    return dev.trim().to_string();
                }
            }
        }
    }
    "en0".to_string()
}


pub fn get_battery_status() -> Result<BatteryInfo, String> {
    // Read battery status on macOS via pmset -g batt
    if let Ok(output) = std::process::Command::new("pmset")
        .args(["-g", "batt"])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        if text.contains("InternalBattery") {
            let mut percentage = 100u8;
            let mut is_charging = text.to_lowercase().contains("charging")
                || text.to_lowercase().contains("ac power");

            // Parse percentage (e.g., "38%;")
            for part in text.split(';') {
                let trimmed = part.trim();
                if let Some(idx) = trimmed.rfind('%') {
                    let num_slice = &trimmed[..idx];
                    if let Some(start_idx) = num_slice.rfind(|c: char| !c.is_ascii_digit()) {
                        if let Ok(val) = num_slice[start_idx + 1..].parse::<u8>() {
                            percentage = val;
                        }
                    } else if let Ok(val) = num_slice.parse::<u8>() {
                        percentage = val;
                    }
                }
                if trimmed.contains("discharging") {
                    is_charging = false;
                }
            }

            return Ok(BatteryInfo {
                percentage,
                is_charging,
                has_battery: true,
            });
        }
    }
    // Fallback or desktop Mac without battery
    return Ok(BatteryInfo {
        percentage: 100,
        is_charging: true,
        has_battery: false,
    });
}

pub fn get_system_volume() -> Result<u8, String> {
    if let Ok(output) = std::process::Command::new("osascript")
        .args(["-e", "output volume of (get volume settings)"])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if let Ok(vol) = text.parse::<u8>() {
            return Ok(vol);
        }
    }
    Ok(50)
}

pub fn set_system_volume(level: u8) -> Result<(), String> {
    let clamped = level.min(100);
    let script = format!("set volume output volume {}", clamped);
    let status = std::process::Command::new("osascript")
        .args(["-e", &script])
        .status()
        .map_err(|e| format!("Failed to set volume on macOS: {}", e))?;
    if status.success() {
        Ok(())
    } else {
        Err("osascript exited with non-zero status".to_string())
    }
}

pub fn get_keyboard_layout() -> Result<String, String> {
    if let Ok(output) = std::process::Command::new("defaults")
        .args([
            "read",
            &format!("{}/Library/Preferences/com.apple.HIToolbox.plist", std::env::var("HOME").unwrap_or_default()),
            "AppleSelectedInputSources",
        ])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if line.contains("KeyboardLayout Name") {
                if let Some(val) = line.split('=').nth(1) {
                    let cleaned = val.trim().trim_matches('"').trim_matches(';').trim();
                    if !cleaned.is_empty() {
                        return Ok(cleaned.to_string());
                    }
                }
            }
        }
    }
    Ok("EN-US".to_string())
}

pub fn scan_wifi_networks() -> Result<Vec<WifiNetworkInfo>, String> {
    let mut networks: Vec<WifiNetworkInfo> = Vec::new();
    let wifi_dev = get_macos_wifi_device();

    // 1. Identify current connected SSID
    let mut current_connected_ssid = String::new();
    if let Ok(output) = std::process::Command::new("networksetup")
        .args(["-getairportnetwork", &wifi_dev])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        if let Some(idx) = text.find(':') {
            let candidate = text[idx + 1..].trim();
            if !candidate.to_lowercase().contains("not associated")
                && !candidate.contains("<redacted>")
            {
                current_connected_ssid = candidate.to_string();
            }
        }
    }

    // Check if Wi-Fi interface currently has an active assigned IP
    let has_active_ip = std::process::Command::new("ipconfig")
        .args(["getifaddr", &wifi_dev])
        .output()
        .map(|o| !String::from_utf8_lossy(&o.stdout).trim().is_empty())
        .unwrap_or(false);

    // 2. Query preferred/saved networks via networksetup (instantaneous & unredacted)
    if let Ok(output) = std::process::Command::new("networksetup")
        .args(["-listpreferredwirelessnetworks", &wifi_dev])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        let mut is_first_pref = true;
        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("Preferred networks") || trimmed.is_empty() {
                continue;
            }
            if trimmed.contains("<redacted>") {
                continue;
            }

            let is_connected = (!current_connected_ssid.is_empty() && trimmed == current_connected_ssid)
                || (current_connected_ssid.is_empty() && has_active_ip && is_first_pref);

            let signal = if is_connected { 90 } else { 75 };
            networks.push(WifiNetworkInfo {
                ssid: trimmed.to_string(),
                signal_strength: signal,
                is_connected,
                is_secured: true,
            });
            if is_connected {
                if current_connected_ssid.is_empty() {
                    current_connected_ssid = trimmed.to_string();
                }
            }
            is_first_pref = false;
        }
    }

    // 3. Query system_profiler SPAirPortDataType for nearby broadcast networks
    if let Ok(output) = std::process::Command::new("system_profiler")
        .args(["SPAirPortDataType"])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        let mut current_block_ssid = String::new();
        let mut current_block_signal: u8 = 70;
        let mut current_block_secured = true;
        let mut in_other_networks = false;
        let mut in_current_network = false;

        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("Current Network Information:") {
                in_current_network = true;
                in_other_networks = false;
                continue;
            }
            if trimmed.starts_with("Other Local Wi-Fi Networks:") {
                in_other_networks = true;
                in_current_network = false;
                continue;
            }

            if in_current_network || in_other_networks {
                if trimmed.ends_with(':') && !trimmed.contains("PHY Mode") && !trimmed.contains("Security") {
                    let is_valid = !current_block_ssid.is_empty()
                        && current_block_ssid != "<redacted>"
                        && !current_block_ssid.contains("<redacted>");
                    if is_valid {
                        let is_connected = !current_connected_ssid.is_empty() && current_block_ssid == current_connected_ssid;
                        networks.push(WifiNetworkInfo {
                            ssid: current_block_ssid.clone(),
                            signal_strength: current_block_signal,
                            is_connected,
                            is_secured: current_block_secured,
                        });
                    }
                    current_block_ssid = trimmed.trim_end_matches(':').trim().to_string();
                    current_block_signal = if in_current_network { 90 } else { 65 };
                    current_block_secured = true;
                } else if trimmed.starts_with("Security:") {
                    let sec = trimmed.to_lowercase();
                    current_block_secured = !sec.contains("none") && !sec.contains("open");
                } else if trimmed.starts_with("Signal / Noise:") {
                    if let Some(sig_part) = trimmed.split('/').next() {
                        if let Some(dbm_str) = sig_part.split(':').nth(1) {
                            if let Ok(dbm) = dbm_str.replace("dBm", "").trim().parse::<i32>() {
                                // Map -100 dBm..-30 dBm to 10..100%
                                let clamped = (dbm.clamp(-100, -30) + 100) as f32 * (100.0 / 70.0);
                                current_block_signal = clamped.clamp(10.0, 100.0) as u8;
                            }
                        }
                    }
                }
            }
        }

        let is_valid = !current_block_ssid.is_empty()
            && current_block_ssid != "<redacted>"
            && !current_block_ssid.contains("<redacted>");
        if is_valid {
            let is_connected = !current_connected_ssid.is_empty() && current_block_ssid == current_connected_ssid;
            networks.push(WifiNetworkInfo {
                ssid: current_block_ssid,
                signal_strength: current_block_signal,
                is_connected,
                is_secured: current_block_secured,
            });
        }
    }

    // 4. Deduplicate by SSID, prioritizing connected status and higher signal
    let mut deduped: Vec<WifiNetworkInfo> = Vec::new();
    for net in networks {
        if let Some(existing) = deduped.iter_mut().find(|e| e.ssid == net.ssid) {
            if net.is_connected {
                existing.is_connected = true;
            }
            if net.signal_strength > existing.signal_strength {
                existing.signal_strength = net.signal_strength;
            }
        } else {
            deduped.push(net);
        }
    }

    // 5. If current connected network was identified but not yet in list, insert it
    let is_valid_connected = !current_connected_ssid.is_empty()
        && current_connected_ssid != "<redacted>"
        && !current_connected_ssid.contains("<redacted>");
    if is_valid_connected && !deduped.iter().any(|n| n.ssid == current_connected_ssid) {
        deduped.insert(
            0,
            WifiNetworkInfo {
                ssid: current_connected_ssid.clone(),
                signal_strength: 90,
                is_connected: true,
                is_secured: true,
            },
        );
    }

    // 6. Fallback: if list is still empty but active IP exists, provide generic connected entry
    if deduped.is_empty() && has_active_ip {
        deduped.push(WifiNetworkInfo {
            ssid: "Connected Wi-Fi Network".to_string(),
            signal_strength: 85,
            is_connected: true,
            is_secured: true,
        });
    }

    // Sort: connected networks first, then descending signal strength
    deduped.sort_by(|a, b| {
        b.is_connected
            .cmp(&a.is_connected)
            .then_with(|| b.signal_strength.cmp(&a.signal_strength))
    });

    Ok(deduped)
}

pub fn connect_wifi_network(ssid: String, password: Option<String>) -> Result<(), String> {
    let wifi_dev = get_macos_wifi_device();
    let mut cmd = std::process::Command::new("networksetup");
    cmd.arg("-setairportnetwork").arg(&wifi_dev).arg(&ssid);

    if let Some(pass) = password {
        if !pass.trim().is_empty() {
            cmd.arg(pass);
        }
    }

    let status = cmd
        .status()
        .map_err(|e| format!("Failed to execute networksetup: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Could not connect to Wi-Fi network: {}", ssid))
    }
}
