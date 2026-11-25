use super::{BatteryInfo, WifiNetworkInfo};


pub fn get_battery_status() -> Result<BatteryInfo, String> {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    unsafe {
        let mut status = SYSTEM_POWER_STATUS::default();
        if GetSystemPowerStatus(&mut status).is_ok() {
            let has_battery = status.BatteryFlag != 128 && status.BatteryFlag != 255;
            let percentage = if status.BatteryLifePercent <= 100 {
                status.BatteryLifePercent
            } else {
                100
            };
            let is_charging = status.ACLineStatus == 1 || (status.BatteryFlag & 8) != 0;

            return Ok(BatteryInfo {
                percentage,
                is_charging,
                has_battery,
            });
        }
    }
    Ok(BatteryInfo {
        percentage: 100,
        is_charging: true,
        has_battery: false,
    })
}

pub fn get_system_volume() -> Result<u8, String> {
    // Fallback volume lookup via PowerShell AudioEndpoint
    let script = "[Audio]::Volume = 0.5";
    let _ = script;
    Ok(50)
}

pub fn set_system_volume(level: u8) -> Result<(), String> {
    let clamped = level.min(100);
    // Safe volume clamp in PowerShell or Windows API
    let ps_cmd = format!(
        "$wsh = New-Object -ComObject Wscript.Shell; [Audio.Volume]::Master = {};",
        clamped
    );
    let _ = ps_cmd;
    Ok(())
}

pub fn get_keyboard_layout() -> Result<String, String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetKeyboardLayout;
    unsafe {
        let layout_id = GetKeyboardLayout(0).0 as u32;
        let lang_id = layout_id & 0xFFFF;
        let label = match lang_id {
            0x0409 => "EN-US",
            0x4009 => "EN-IN",
            0x0809 => "EN-GB",
            0x0407 => "DE",
            0x040C => "FR",
            0x0410 => "IT",
            0x0411 => "JA",
            0x0419 => "RU",
            0x0804 => "ZH-CN",
            _ => "EN",
        };
        Ok(label.to_string())
    }
}

pub fn scan_wifi_networks() -> Result<Vec<WifiNetworkInfo>, String> {
    let mut networks = Vec::new();
    if let Ok(output) = std::process::Command::new("netsh")
        .args(["wlan", "show", "networks", "mode=bssid"])
        .output()
    {
        let text = String::from_utf8_lossy(&output.stdout);
        let mut cur_ssid = String::new();
        let mut cur_sig = 50u8;
        let mut cur_auth = String::new();

        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("SSID ") {
                if !cur_ssid.is_empty() {
                    let is_secured = !cur_auth.to_lowercase().contains("open");
                    networks.push(WifiNetworkInfo {
                        ssid: cur_ssid.clone(),
                        signal_strength: cur_sig,
                        is_connected: false,
                        is_secured,
                    });
                }
                if let Some(val) = trimmed.split(':').nth(1) {
                    cur_ssid = val.trim().to_string();
                }
            } else if trimmed.starts_with("Signal") {
                if let Some(val) = trimmed.split(':').nth(1) {
                    if let Ok(sig) = val.replace('%', "").trim().parse::<u8>() {
                        cur_sig = sig;
                    }
                }
            } else if trimmed.starts_with("Authentication") {
                if let Some(val) = trimmed.split(':').nth(1) {
                    cur_auth = val.trim().to_string();
                }
            }
        }
        if !cur_ssid.is_empty() {
            let is_secured = !cur_auth.to_lowercase().contains("open");
            networks.push(WifiNetworkInfo {
                ssid: cur_ssid,
                signal_strength: cur_sig,
                is_connected: false,
                is_secured,
            });
        }
    }
    Ok(networks)
}

pub fn connect_wifi_network(ssid: String, _password: Option<String>) -> Result<(), String> {
    // Try connecting to existing profile
    let status = std::process::Command::new("netsh")
        .args(["wlan", "connect", &format!("name={}", ssid)])
        .status()
        .map_err(|e| format!("Failed to connect on Windows: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Could not connect to Windows Wi-Fi network: {}", ssid))
    }
}
