use super::{BatteryInfo, WifiNetworkInfo};


pub fn get_battery_status() -> Result<BatteryInfo, String> {
    // Read /sys/class/power_supply/BAT*
    if let Ok(entries) = std::fs::read_dir("/sys/class/power_supply") {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("BAT") {
                let cap_path = entry.path().join("capacity");
                let status_path = entry.path().join("status");

                let percentage = std::fs::read_to_string(cap_path)
                    .ok()
                    .and_then(|s| s.trim().parse::<u8>().ok())
                    .unwrap_or(100);

                let status = std::fs::read_to_string(status_path)
                    .unwrap_or_default()
                    .to_lowercase();
                let is_charging = status.contains("charging");

                return Ok(BatteryInfo {
                    percentage,
                    is_charging,
                    has_battery: true,
                });
            }
        }
    }
    Ok(BatteryInfo {
        percentage: 100,
        is_charging: true,
        has_battery: false,
    })
}

pub fn get_system_volume() -> Result<u8, String> {
    if let Ok(output) = std::process::Command::new("pactl")
        .args(["get-sink-volume", "@DEFAULT_SINK@"])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        if let Some(idx) = text.find('%') {
            let slice = &text[..idx];
            if let Some(start) = slice.rfind(|c: char| !c.is_ascii_digit()) {
                if let Ok(val) = slice[start + 1..].parse::<u8>() {
                    return Ok(val);
                }
            }
        }
    }
    Ok(50)
}

pub fn set_system_volume(level: u8) -> Result<(), String> {
    let clamped = level.min(100);
    let pct = format!("{}%", clamped);
    let _ = std::process::Command::new("pactl")
        .args(["set-sink-volume", "@DEFAULT_SINK@", &pct])
        .status();
    Ok(())
}

pub fn get_keyboard_layout() -> Result<String, String> {
    if let Ok(output) = std::process::Command::new("setxkbmap")
        .args(["-query"])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if line.starts_with("layout:") {
                if let Some(layout) = line.split(':').nth(1) {
                    return Ok(layout.trim().to_uppercase());
                }
            }
        }
    }
    Ok("EN-US".to_string())
}

pub fn scan_wifi_networks() -> Result<Vec<WifiNetworkInfo>, String> {
    let mut networks = Vec::new();
    if let Ok(output) = std::process::Command::new("nmcli")
        .args(["-t", "-f", "SSID,SIGNAL,ACTIVE,SECURITY", "dev", "wifi"])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() >= 4 {
                let ssid = parts[0].trim().to_string();
                if ssid.is_empty() {
                    continue;
                }
                let signal = parts[1].trim().parse::<u8>().unwrap_or(50);
                let is_connected = parts[2].trim().to_lowercase() == "yes";
                let is_secured = !parts[3].trim().is_empty() && parts[3].trim() != "--";

                if !networks.iter().any(|n: &WifiNetworkInfo| n.ssid == ssid) {
                    networks.push(WifiNetworkInfo {
                        ssid,
                        signal_strength: signal,
                        is_connected,
                        is_secured,
                    });
                }
            }
        }
    }
    Ok(networks)
}

pub fn connect_wifi_network(ssid: String, password: Option<String>) -> Result<(), String> {
    let mut cmd = std::process::Command::new("nmcli");
    cmd.args(["dev", "wifi", "connect", &ssid]);

    if let Some(pass) = password {
        if !pass.trim().is_empty() {
            cmd.args(["password", &pass]);
        }
    }

    let status = cmd
        .status()
        .map_err(|e| format!("Failed to execute nmcli connect: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Could not connect to Linux Wi-Fi network: {}", ssid))
    }
}
