use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::{Emitter, Manager};

pub const FORBIDDEN_PROCESSES: &[&str] = &[
    "anydesk",
    "teamviewer",
    "rustdesk",
    "parsec",
    "obs",
    "loom",
    "flameshot",
    "spectacle",
    "cluely",
    "interviewcoder",
    "x64dbg",
    "cheatengine",
    "frida",
    "gdb",
    "lldb",
    "mitmproxy",
    "fiddler",
    "wireshark",
    "virtualbox",
    "vmware",
    "qemu",
    "vorssaint",
    "alttab",
    "raycast",
    "alfred",
    "bettertouchtool",
    "karabiner",
    "magnet",
    "rectangle",
    "hammerspoon",
    "warp",
    "discord",
    "slack",
    "zoom",
    "chatgpt",
    "claude",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreflightResult {
    pub passed: bool,
    pub violations: Vec<String>,
    pub monitor_count: usize,
    pub is_vm: bool,
    pub forbidden_processes: Vec<String>,
    #[serde(default)]
    pub vm_indicators: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentViolationEvent {
    pub violation_type: String,
    pub message: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningUserApp {
    pub pid: u32,
    pub name: String,
    pub bundle_or_exe: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaPermissionStatus {
    pub camera: String,
    pub microphone: String,
    pub ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockingAppInfo {
    pub pid: u32,
    pub name: String,
    pub category: String, // "forbidden" | "non_essential"
    #[serde(rename = "bundleOrPath")]
    pub bundle_or_path: String,
    #[serde(rename = "canForceKill")]
    pub can_force_kill: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayTopology {
    #[serde(rename = "monitorCount")]
    pub monitor_count: usize,
    #[serde(rename = "externalDisplaysDetected")]
    pub external_displays_detected: bool,
    #[serde(rename = "primaryResolution")]
    pub primary_resolution: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeIntegrityReport {
    pub passed: bool,
    #[serde(rename = "debuggerPresent")]
    pub debugger_present: bool,
    #[serde(rename = "injectionDetected")]
    pub injection_detected: bool,
    pub violations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaDeviceDescriptor {
    pub name: String,
    #[serde(rename = "deviceType")]
    pub device_type: String, // "camera" | "microphone"
    #[serde(rename = "isVirtual")]
    pub is_virtual: bool,
    #[serde(rename = "modelId")]
    pub model_id: Option<String>,
    pub manufacturer: Option<String>,
    #[serde(rename = "transportType")]
    pub transport_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaHardwareAudit {
    pub passed: bool,
    pub devices: Vec<MediaDeviceDescriptor>,
    #[serde(rename = "virtualDevicesDetected")]
    pub virtual_devices_detected: Vec<String>,
}

#[cfg(target_os = "macos")]
pub fn get_native_display_topology() -> (usize, bool, String) {
    use core_graphics::display::{
        CGGetActiveDisplayList, CGMainDisplayID, CGDisplayPixelsWide, CGDisplayPixelsHigh,
    };
    let mut display_count: u32 = 0;
    let mut displays = [0u32; 32];
    let err = unsafe { CGGetActiveDisplayList(32, displays.as_mut_ptr(), &mut display_count) };
    let count = if err == 0 && display_count > 0 {
        display_count as usize
    } else {
        1
    };
    let main_id = unsafe { CGMainDisplayID() };
    let w = unsafe { CGDisplayPixelsWide(main_id) };
    let h = unsafe { CGDisplayPixelsHigh(main_id) };
    let resolution = format!("{}x{}", w, h);
    (count, count > 1, resolution)
}

#[cfg(not(target_os = "macos"))]
pub fn get_native_display_topology() -> (usize, bool, String) {
    (1, false, "1920x1080".to_string())
}

#[cfg(target_os = "windows")]
pub fn get_windows_monitor_count() -> usize {
    use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, HDC, HMONITOR};
    use windows::Win32::Foundation::{BOOL, LPARAM, RECT};

    unsafe extern "system" fn monitor_enum_proc(
        _hmonitor: HMONITOR,
        _hdc: HDC,
        _lprect: *mut RECT,
        lparam: LPARAM,
    ) -> BOOL {
        let count_ptr = lparam.0 as *mut usize;
        if !count_ptr.is_null() {
            *count_ptr += 1;
        }
        BOOL(1)
    }

    let mut count: usize = 0;
    let _ = unsafe {
        EnumDisplayMonitors(
            HDC::default(),
            None,
            Some(monitor_enum_proc),
            LPARAM(&mut count as *mut usize as isize),
        )
    };
    if count == 0 { 1 } else { count }
}

#[tauri::command]
pub fn get_display_topology(app: tauri::AppHandle) -> Result<DisplayTopology, String> {
    let mut monitor_count = 1;
    let mut primary_res = "1920x1080".to_string();

    if let Ok(monitors) = app.available_monitors() {
        if !monitors.is_empty() {
            monitor_count = monitors.len();
        }
    }

    if let Ok(Some(primary)) = app.primary_monitor() {
        let size = primary.size();
        primary_res = format!("{}x{}", size.width, size.height);
    }

    #[cfg(target_os = "macos")]
    {
        let (native_cnt, _, native_res) = get_native_display_topology();
        if native_cnt > monitor_count {
            monitor_count = native_cnt;
        }
        if (primary_res == "1920x1080" || primary_res.is_empty()) && !native_res.is_empty() {
            primary_res = native_res;
        }
    }

    #[cfg(target_os = "windows")]
    {
        let win_cnt = get_windows_monitor_count();
        if win_cnt > monitor_count {
            monitor_count = win_cnt;
        }
    }

    let external_displays_detected = monitor_count > 1;

    Ok(DisplayTopology {
        monitor_count,
        external_displays_detected,
        primary_resolution: primary_res,
    })
}

pub fn detect_system_proxy() -> (bool, Vec<String>) {
    let mut indicators = Vec::new();
    let proxy_envs = [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
    ];
    for env_var in proxy_envs {
        if let Ok(val) = std::env::var(env_var) {
            if !val.trim().is_empty() {
                indicators.push(format!("Env {}: {}", env_var, val));
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("/usr/sbin/scutil").arg("--proxy").output() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("HTTPEnable : 1")
                    || trimmed.starts_with("HTTPSEnable : 1")
                    || trimmed.starts_with("SOCKSEnable : 1")
                {
                    indicators.push(format!("macOS system proxy active: {}", trimmed));
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::Registry::{
            RegOpenKeyExW, RegQueryValueExW, RegCloseKey, HKEY, HKEY_CURRENT_USER, KEY_READ, REG_DWORD,
        };
        unsafe {
            let mut key = HKEY::default();
            let subkey = windows::core::w!("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings");
            if RegOpenKeyExW(HKEY_CURRENT_USER, subkey, 0, KEY_READ, &mut key).is_ok() {
                let mut val: u32 = 0;
                let mut size: u32 = std::mem::size_of::<u32>() as u32;
                let mut val_type: u32 = REG_DWORD.0;
                if RegQueryValueExW(key, windows::core::w!("ProxyEnable"), None, Some(&mut val_type), Some(&mut val as *mut u32 as *mut u8), Some(&mut size)).is_ok() {
                    if val == 1 {
                        indicators.push("Windows system proxy active (ProxyEnable = 1)".to_string());
                    }
                }
                let _ = RegCloseKey(key);
            }
        }
    }

    let is_detected = !indicators.is_empty();
    (is_detected, indicators)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticLogEntry {
    pub timestamp_ms: u64,
    pub level: String,
    pub category: String,
    pub message: String,
}

use std::collections::VecDeque;
use std::sync::Mutex;

static DIAGNOSTIC_RING_BUFFER: Mutex<VecDeque<DiagnosticLogEntry>> = Mutex::new(VecDeque::new());

pub fn log_diagnostic_event(category: &str, message: &str) {
    log_diagnostic_entry("INFO", category, message);
}

pub fn log_diagnostic_entry(level: &str, category: &str, message: &str) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let entry = DiagnosticLogEntry {
        timestamp_ms: now,
        level: level.to_string(),
        category: category.to_string(),
        message: message.to_string(),
    };
    if let Ok(mut buf) = DIAGNOSTIC_RING_BUFFER.lock() {
        if buf.len() >= 100 {
            buf.pop_front();
        }
        buf.push_back(entry);
    }
}

#[tauri::command]
pub fn get_lockdown_diagnostic_logs() -> Result<Vec<DiagnosticLogEntry>, String> {
    let buf = DIAGNOSTIC_RING_BUFFER
        .lock()
        .map_err(|e| format!("Failed to lock diagnostic buffer: {}", e))?;
    Ok(buf.iter().cloned().collect())
}

pub fn check_instruction_timing_anomaly() -> bool {
    let mut latencies = Vec::with_capacity(1000);
    for _ in 0..1000 {
        let t0 = std::time::Instant::now();
        let mut x: u64 = 1;
        for i in 1..=50 {
            x = x.wrapping_mul(i).wrapping_add(3);
        }
        std::hint::black_box(x);
        let elapsed = t0.elapsed().as_nanos();
        latencies.push(elapsed);
    }

    latencies.sort_unstable();
    let p50 = latencies[500];
    let p99 = latencies[990];

    // Bare metal typical p50 is < 500ns, p99 is < 2500ns.
    // In heavily trapped hypervisors with timer virtualization, p99 spikes > 20x median and > 250,000ns
    p50 > 0 && p99 > 250_000 && p99 > (p50 * 20)
}

pub fn check_virtual_machine_detailed() -> (bool, Vec<String>) {
    let mut indicators = Vec::new();

    // -------------------------------------------------------------
    // Layer 1: CPUID Hypervisor & Synthetic Signature (or sysctl on macOS)
    // -------------------------------------------------------------
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("sysctl")
            .args(["-n", "kern.hv_vmm_present"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if text == "1" {
                indicators.push("macOS hypervisor present (kern.hv_vmm_present=1)".to_string());
            }
        }
        if let Ok(output) = std::process::Command::new("sysctl")
            .args(["-n", "machdep.cpu.features"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout).to_uppercase();
            if text.contains("VMM") || text.contains("HYPERVISOR") {
                indicators.push("macOS CPU feature indicates VMM/hypervisor".to_string());
            }
        }
    }

    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    {
        #[cfg(target_arch = "x86")]
        use core::arch::x86::__cpuid;
        #[cfg(target_arch = "x86_64")]
        use core::arch::x86_64::__cpuid;

        #[allow(unused_unsafe)]
        unsafe {
            // CPUID leaf 1: ecx bit 31 indicates hypervisor presence (Standard hypervisor CPUID feature bit)
            let res = __cpuid(1);
            if (res.ecx & (1 << 31)) != 0 {
                let hv_sig = __cpuid(0x40000000);
                let mut sig_bytes = Vec::with_capacity(12);
                sig_bytes.extend_from_slice(&hv_sig.ebx.to_le_bytes());
                sig_bytes.extend_from_slice(&hv_sig.ecx.to_le_bytes());
                sig_bytes.extend_from_slice(&hv_sig.edx.to_le_bytes());
                let vendor = String::from_utf8_lossy(&sig_bytes).trim().to_string();
                indicators.push(format!("CPUID hypervisor bit set (vendor='{}')", vendor));
            }
        }
    }

    // -------------------------------------------------------------
    // Layer 2: DMI / SMBIOS / Registry / ioreg Hardware Strings
    // -------------------------------------------------------------
    #[cfg(target_os = "linux")]
    {
        let dmi_paths = [
            "/sys/class/dmi/id/product_name",
            "/sys/class/dmi/id/sys_vendor",
            "/sys/class/dmi/id/board_vendor",
            "/sys/class/dmi/id/bios_vendor",
        ];
        for path in dmi_paths {
            if let Ok(content) = std::fs::read_to_string(path) {
                let lower = content.to_lowercase();
                for kw in &["virtualbox", "vmware", "kvm", "qemu", "bhyve", "xen", "hyper-v", "bochs", "parallels"] {
                    if lower.contains(kw) {
                        indicators.push(format!("Linux DMI in {} matched '{}'", path, kw));
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let bios_vals = ["SystemManufacturer", "SystemProductName", "BIOSVendor"];
        for val_name in bios_vals {
            if let Ok(output) = std::process::Command::new("reg")
                .args(["query", "HKLM\\HARDWARE\\Description\\System\\BIOS", "/v", val_name])
                .output()
            {
                let text = String::from_utf8_lossy(&output.stdout).to_lowercase();
                for kw in &["virtualbox", "vmware", "qemu", "kvm", "virtual machine", "hyper-v", "parallels"] {
                    if text.contains(kw) {
                        indicators.push(format!("Windows registry {} matched '{}'", val_name, kw));
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("ioreg")
            .args(["-l"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout).to_lowercase();
            for kw in &["virtualbox", "vmware", "parallels", "qemu"] {
                if text.contains(kw) {
                    indicators.push(format!("macOS ioreg matched VM keyword '{}'", kw));
                }
            }
        }
    }

    // -------------------------------------------------------------
    // Layer 3: Instruction Timing Skew
    // -------------------------------------------------------------
    if check_instruction_timing_anomaly() {
        indicators.push("VM_TIMING_ANOMALY: High instruction latency jitter detected".to_string());
    }

    let is_vm = !indicators.is_empty();
    (is_vm, indicators)
}

pub fn check_virtual_machine() -> bool {
    check_virtual_machine_detailed().0
}

pub fn is_forbidden_process(name: &str, exe_path: Option<&str>) -> Option<&'static str> {
    let lower_name = name.to_lowercase();

    // Ignore background system extensions / drivers (e.g. CoreMediaIO camera extensions, audio drivers)
    if lower_name.contains("extension") || lower_name.contains("driver") {
        return None;
    }

    // Exclude standard Apple macOS system daemons / frameworks in /System or /usr/libexec,
    // unless the executable path or command explicitly references a forbidden utility (e.g. script runner)
    if let Some(exe) = exe_path {
        let lower_exe = exe.to_lowercase();
        let matches_any_forbidden = FORBIDDEN_PROCESSES.iter().any(|&f| lower_exe.contains(f));
        if !matches_any_forbidden
            && (lower_exe.starts_with("/system/") || lower_exe.starts_with("/usr/libexec/"))
        {
            return None;
        }
    }
    // Apple CoreParsec daemons on macOS
    if lower_name == "parsecd" || lower_name == "parsec-fbf" || lower_name.starts_with("com.apple.") {
        return None;
    }

    for &forbidden in FORBIDDEN_PROCESSES {
        let is_match = match forbidden {
            "parsec" => {
                // Only match the actual Parsec gaming / remote desktop application
                lower_name == "parsec"
                    || lower_name == "parsec.exe"
                    || lower_name == "parsecd.app"
                    || (lower_name == "parsecd" && exe_path.map_or(false, |p| !p.starts_with("/System")))
            }
            "obs" => {
                lower_name == "obs"
                    || lower_name == "obs64"
                    || lower_name == "obs-studio"
                    || lower_name == "obs.exe"
                    || lower_name == "obs64.exe"
            }
            _ => {
                lower_name == forbidden
                    || lower_name == format!("{}.exe", forbidden)
                    || lower_name == format!("{}.app", forbidden)
                    || lower_name.starts_with(&format!("{}-", forbidden))
                    || lower_name.starts_with(&format!("{}_", forbidden))
                    || lower_name.contains(forbidden)
            }
        };

        if is_match {
            return Some(forbidden);
        }

        if let Some(exe) = exe_path {
            let lower_exe = exe.to_lowercase();
            if lower_exe.contains(forbidden) {
                return Some(forbidden);
            }
        }
    }

    None
}

static WATCHDOG_SYSTEM: Mutex<Option<System>> = Mutex::new(None);

pub fn check_forbidden_processes() -> Vec<String> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, UpdateKind};

    let mut detected = Vec::new();
    let mut lock = WATCHDOG_SYSTEM.lock().unwrap_or_else(|e| e.into_inner());

    let refresh_kind = ProcessRefreshKind::new()
        .with_cmd(UpdateKind::OnlyIfNotSet)
        .with_exe(UpdateKind::OnlyIfNotSet);

    if lock.is_none() {
        let mut sys = System::new();
        sys.refresh_processes_specifics(ProcessesToUpdate::All, refresh_kind);
        *lock = Some(sys);
    } else if let Some(sys) = lock.as_mut() {
        sys.refresh_processes_specifics(ProcessesToUpdate::All, refresh_kind);
    }

    if let Some(sys) = lock.as_ref() {
        for (_pid, process) in sys.processes() {
            let name = process.name().to_string_lossy();
            let exe = process.exe().map(|p| p.to_string_lossy().to_string());
            let cmd = process
                .cmd()
                .iter()
                .map(|s| s.to_string_lossy())
                .collect::<Vec<_>>()
                .join(" ");

            let full_exe_cmd = match (exe, cmd.is_empty()) {
                (Some(e), false) => Some(format!("{} {}", e, cmd)),
                (Some(e), true) => Some(e),
                (None, false) => Some(cmd),
                (None, true) => None,
            };

            if let Some(forbidden) = is_forbidden_process(&name, full_exe_cmd.as_deref()) {
                if !detected.contains(&forbidden.to_string()) {
                    detected.push(forbidden.to_string());
                }
            }
        }
    }
    detected
}

#[cfg(target_os = "windows")]
pub fn check_stealth_overlay_windows() -> Vec<String> {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowLongW, GetWindowThreadProcessId, IsWindowVisible,
        GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TOPMOST,
    };

    let mut detected = Vec::new();

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let detected_ptr = lparam.0 as *mut Vec<String>;
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        let mut pid: u32 = 0;
        let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let current_pid = std::process::id();

        if pid != current_pid && pid != 0 {
            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            let is_topmost = (ex_style & WS_EX_TOPMOST.0) != 0;
            let is_layered = (ex_style & WS_EX_LAYERED.0) != 0;

            if is_topmost && is_layered {
                (*detected_ptr).push(format!("Stealth overlay window detected (PID: {})", pid));
            }
        }

        BOOL(1)
    }

    unsafe {
        let lparam = LPARAM(&mut detected as *mut Vec<String> as isize);
        let _ = EnumWindows(Some(enum_proc), lparam);
    }

    detected
}

#[cfg(target_os = "macos")]
pub fn check_stealth_overlay_windows() -> Vec<String> {
    use core_graphics::display::*;
    use core_foundation::array::CFArray;
    use core_foundation::string::CFString;
    use core_foundation::base::TCFType;

    extern "C" {
        fn CFDictionaryGetValue(dict: *const std::ffi::c_void, key: *const std::ffi::c_void) -> *const std::ffi::c_void;
        fn CFNumberGetValue(number: *const std::ffi::c_void, the_type: isize, value_ptr: *mut std::ffi::c_void) -> bool;
        fn CFStringGetCString(cf: *const std::ffi::c_void, buffer: *mut std::os::raw::c_char, buf_size: isize, encoding: u32) -> bool;
    }

    const K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: u32 = 1;
    const K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS: u32 = 16;
    const K_CG_NULL_WINDOW_ID: u32 = 0;

    let mut detected = Vec::new();
    let current_pid = std::process::id() as i64;

    unsafe {
        let options = K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY | K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS;
        let window_list_info = CGWindowListCopyWindowInfo(options, K_CG_NULL_WINDOW_ID);
        if window_list_info.is_null() {
            return detected;
        }

        let array: CFArray = CFArray::wrap_under_create_rule(window_list_info as _);
        let layer_key = CFString::new("kCGWindowLayer");
        let pid_key = CFString::new("kCGWindowOwnerPID");
        let name_key = CFString::new("kCGWindowOwnerName");

        for item in array.iter() {
            let dict_ptr = *item as *const std::ffi::c_void;

            let mut layer: i32 = 0;
            let mut pid: i64 = 0;
            let mut owner_name = String::new();

            let layer_val = CFDictionaryGetValue(dict_ptr, layer_key.as_CFTypeRef() as _);
            if !layer_val.is_null() {
                let _ = CFNumberGetValue(layer_val, 3, &mut layer as *mut i32 as _);
            }

            let pid_val = CFDictionaryGetValue(dict_ptr, pid_key.as_CFTypeRef() as _);
            if !pid_val.is_null() {
                let _ = CFNumberGetValue(pid_val, 4, &mut pid as *mut i64 as _);
            }

            let name_val = CFDictionaryGetValue(dict_ptr, name_key.as_CFTypeRef() as _);
            if !name_val.is_null() {
                let mut buf = [0u8; 256];
                if CFStringGetCString(name_val, buf.as_mut_ptr() as _, 256, 0x08000100) {
                    owner_name = std::ffi::CStr::from_ptr(buf.as_ptr() as _)
                        .to_string_lossy()
                        .to_string();
                }
            }

            let is_system = owner_name == "Window Server"
                || owner_name == "Dock"
                || owner_name == "ControlCenter"
                || owner_name == "SystemUIServer"
                || owner_name == "NotificationCenter"
                || owner_name == "Spotlight"
                || owner_name == "MenuBarAgent"
                || owner_name == "WindowManager"
                || owner_name == "Wallpaper"
                || owner_name == "TextInputMenuAgent"
                || owner_name == "TextInputSwitcher"
                || owner_name == "CoreServicesUIAgent"
                || owner_name == "screencaptureui"
                || owner_name == "loginwindow"
                || owner_name == "Finder"
                || owner_name == "Shortcuts"
                || owner_name == "Siri"
                || owner_name == "CodeSkill LockDown"
                || owner_name.starts_with("com.apple.")
                || owner_name == "Antigravity";

            // Standard macOS menu bar status items, menu extras, and dock reside at layers 20 through 26
            let is_menubar_or_dock_layer = layer >= 20 && layer <= 26;

            if layer > 0 && !is_menubar_or_dock_layer && pid != current_pid && !is_system && pid > 0 {
                detected.push(format!(
                    "Stealth overlay window detected (PID: {}, App: {}, Layer: {})",
                    pid, owner_name, layer
                ));
            }
        }
    }

    detected
}

#[cfg(target_os = "macos")]
pub fn check_macos_active_screen_capture() -> bool {
    use core_graphics::display::*;
    use core_foundation::array::CFArray;
    use core_foundation::string::CFString;
    use core_foundation::base::TCFType;

    extern "C" {
        fn CFDictionaryGetValue(dict: *const std::ffi::c_void, key: *const std::ffi::c_void) -> *const std::ffi::c_void;
        fn CFStringGetCString(cf: *const std::ffi::c_void, buffer: *mut std::os::raw::c_char, buf_size: isize, encoding: u32) -> bool;
    }

    const K_CG_WINDOW_LIST_OPTION_ALL: u32 = 0;
    const K_CG_NULL_WINDOW_ID: u32 = 0;

    unsafe {
        let window_list = CGWindowListCopyWindowInfo(K_CG_WINDOW_LIST_OPTION_ALL, K_CG_NULL_WINDOW_ID);
        if window_list.is_null() {
            return false;
        }

        let array: CFArray = CFArray::wrap_under_create_rule(window_list as _);
        let name_key = CFString::new("kCGWindowOwnerName");

        for item in array.iter() {
            let dict_ptr = *item as *const std::ffi::c_void;
            let name_val = CFDictionaryGetValue(dict_ptr, name_key.as_CFTypeRef() as _);
            if !name_val.is_null() {
                let mut buf = [0u8; 256];
                if CFStringGetCString(name_val, buf.as_mut_ptr() as _, 256, 0x08000100) {
                    let owner_name = std::ffi::CStr::from_ptr(buf.as_ptr() as _)
                        .to_string_lossy()
                        .to_lowercase();
                    if owner_name == "screencapture"
                        || owner_name == "screensharing"
                        || owner_name == "screencaptured"
                        || owner_name == "screencaptureui"
                        || owner_name == "replayd"
                        || owner_name.contains("screencapturekit")
                    {
                        return true;
                    }
                }
            }
        }
    }
    false
}

#[cfg(target_os = "linux")]
pub fn check_stealth_overlay_windows() -> Vec<String> {
    let mut detected = Vec::new();
    unsafe {
        let display = x11::xlib::XOpenDisplay(std::ptr::null());
        if !display.is_null() {
            let root = x11::xlib::XDefaultRootWindow(display);
            let atom_state = x11::xlib::XInternAtom(display, b"_NET_WM_STATE\0".as_ptr() as *const i8, 1);
            let atom_above = x11::xlib::XInternAtom(display, b"_NET_WM_STATE_ABOVE\0".as_ptr() as *const i8, 1);

            if atom_state != 0 && atom_above != 0 {
                let mut root_ret = 0;
                let mut parent_ret = 0;
                let mut children_ret: *mut x11::xlib::Window = std::ptr::null_mut();
                let mut nchildren: u32 = 0;

                if x11::xlib::XQueryTree(display, root, &mut root_ret, &mut parent_ret, &mut children_ret, &mut nchildren) != 0 {
                    if !children_ret.is_null() {
                        let slice = std::slice::from_raw_parts(children_ret, nchildren as usize);
                        for &win in slice {
                            let mut actual_type = 0;
                            let mut actual_format = 0;
                            let mut nitems = 0;
                            let mut bytes_after = 0;
                            let mut prop_data: *mut u8 = std::ptr::null_mut();

                            let status = x11::xlib::XGetWindowProperty(
                                display,
                                win,
                                atom_state,
                                0,
                                1024,
                                0,
                                x11::xlib::XA_ATOM,
                                &mut actual_type,
                                &mut actual_format,
                                &mut nitems,
                                &mut bytes_after,
                                &mut prop_data,
                            );

                            if status == 0 && !prop_data.is_null() {
                                let atoms = std::slice::from_raw_parts(prop_data as *const x11::xlib::Atom, nitems as usize);
                                for &a in atoms {
                                    if a == atom_above {
                                        detected.push(format!("X11 topmost overlay window detected (Window: {:x})", win));
                                        break;
                                    }
                                }
                                x11::xlib::XFree(prop_data as _);
                            }
                        }
                        x11::xlib::XFree(children_ret as _);
                    }
                }
            }
            x11::xlib::XCloseDisplay(display);
        }
    }
    detected
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub fn check_stealth_overlay_windows() -> Vec<String> {
    Vec::new()
}

#[cfg(target_os = "macos")]
pub fn check_macos_accessibility_permission(prompt_if_missing: bool) -> bool {
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXIsProcessTrustedWithOptions(options: *const std::ffi::c_void) -> bool;
    }

    unsafe {
        if AXIsProcessTrusted() {
            return true;
        }

        if prompt_if_missing {
            use core_foundation::base::TCFType;
            use core_foundation::boolean::CFBoolean;
            use core_foundation::dictionary::CFDictionary;
            use core_foundation::string::CFString;

            let key = CFString::new("AXTrustedCheckOptionPrompt");
            let val = CFBoolean::true_value();
            let dict = CFDictionary::from_CFType_pairs(&[(key, val)]);
            AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef() as *const std::ffi::c_void)
        } else {
            false
        }
    }
}

#[tauri::command]
pub fn run_preflight_checks(window: tauri::Window) -> PreflightResult {
    let mut violations = Vec::new();

    // 1. Monitor count
    let monitor_count = match window.available_monitors() {
        Ok(monitors) => monitors.len(),
        Err(_) => 1,
    };
    if monitor_count > 1 {
        violations.push(format!(
            "Multiple monitors detected ({} displays connected). Only 1 monitor is permitted during the exam.",
            monitor_count
        ));
    }

    // 1.1 Proxy / MITM inspection
    let (proxy_detected, proxy_indicators) = detect_system_proxy();
    if proxy_detected {
        violations.push(format!(
            "MITM_PROXY_DETECTED: Active system HTTP/SOCKS proxy detected ({}). Proxies and MITM packet interception tools are prohibited during exams.",
            proxy_indicators.join("; ")
        ));
        log_diagnostic_entry("WARN", "MITM_PROXY_DETECTED", &format!("Proxy detected: {}", proxy_indicators.join("; ")));
    }

    // 2. VM / Hypervisor detection (CPUID + DMI + RDTSC timing anomaly)
    let (is_vm, vm_indicators) = check_virtual_machine_detailed();
    if is_vm {
        violations.push(format!(
            "Virtual Machine or Hypervisor environment detected ({}). Exams must be taken on bare-metal physical hardware.",
            vm_indicators.join("; ")
        ));
    }

    // 3. Forbidden background processes
    let forbidden_processes = check_forbidden_processes();
    if !forbidden_processes.is_empty() {
        violations.push(format!(
            "Unauthorized background applications running: {}. Please terminate them before launching the exam.",
            forbidden_processes.join(", ")
        ));
    }

    // 4. Stealth overlay windows
    let overlay_windows = check_stealth_overlay_windows();
    if !overlay_windows.is_empty() {
        violations.push(format!(
            "Stealth overlay windows detected: {}. Please close all screen recording, sharing, or floating assistant tools.",
            overlay_windows.join("; ")
        ));
    }

    // 5. Accessibility Permission check on macOS (required for low-level CGEventTap Cmd+Tab lock)
    #[cfg(target_os = "macos")]
    {
        if !check_macos_accessibility_permission(true) {
            violations.push("Enable Accessibility permission for CodeSkill LockDown in System Settings -> Privacy & Security -> Accessibility to lock Cmd+Tab.".to_string());
        }
        if check_macos_active_screen_capture() {
            violations.push("ACTIVE_SCREEN_SHARING_DETECTED: Active screen recording or sharing stream is in progress. Please stop all screen recording or sharing before taking the exam.".to_string());
        }
    }

    // 6. Windows Display Affinity & Screen Capture Cloaking check
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{GetWindowDisplayAffinity, WINDOW_DISPLAY_AFFINITY};
        const WDA_EXCLUDEFROMCAPTURE: u32 = 0x00000011;

        if let Ok(hwnd_raw) = window.hwnd() {
            let hwnd = HWND(hwnd_raw.0 as _);
            let mut affinity = WINDOW_DISPLAY_AFFINITY(0);
            unsafe {
                if GetWindowDisplayAffinity(hwnd, &mut affinity).is_ok() {
                    if affinity.0 == WDA_EXCLUDEFROMCAPTURE {
                        violations.push("DISPLAY_AFFINITY_VIOLATION: Window display affinity is set to WDA_EXCLUDEFROMCAPTURE. Screen capture cloaking tools are strictly forbidden.".to_string());
                    }
                }
            }
        }
    }

    // 7. Linux Wayland / Cage check
    #[cfg(target_os = "linux")]
    {
        let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_default().to_lowercase();
        let wayland_display = std::env::var("WAYLAND_DISPLAY").unwrap_or_default();
        if session_type == "x11" && wayland_display.is_empty() {
            violations.push("LINUX_X11_UNENFORCED_SESSION: Session is running on unhardened X11. Please launch via codeskill-lockdown-cage.sh for hardened Wayland containment.".to_string());
        }
    }

    let passed = violations.is_empty();

    PreflightResult {
        passed,
        violations,
        monitor_count,
        is_vm,
        forbidden_processes,
        vm_indicators,
    }
}

pub fn start_security_watchdog(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));

            // Check monitors on main window
            if let Some(window) = app_handle.get_webview_window("exam-kiosk") {
                if let Ok(monitors) = window.available_monitors() {
                    if monitors.len() > 1 {
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;

                        log_diagnostic_entry(
                            "WARN",
                            "SECONDARY_DISPLAY_CONNECTED",
                            &format!("Secondary display connected mid-exam: {} monitors active.", monitors.len()),
                        );

                        let _ = app_handle.emit(
                            "exam:environment-violation",
                            EnvironmentViolationEvent {
                                violation_type: "SECONDARY_DISPLAY_CONNECTED".to_string(),
                                message: format!(
                                    "Secondary display connected mid-exam: {} monitors active.",
                                    monitors.len()
                                ),
                                timestamp: now,
                            },
                        );
                        crate::kiosk_os::spawn_secondary_monitor_shields(&app_handle);
                    } else {
                        crate::kiosk_os::close_secondary_monitor_shields(&app_handle);
                    }
                }
            }

            // Check stealth overlay windows
            let overlays = check_stealth_overlay_windows();
            if !overlays.is_empty() {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;

                let _ = app_handle.emit(
                    "exam:environment-violation",
                    EnvironmentViolationEvent {
                        violation_type: "OVERLAY_WINDOW_DETECTED".to_string(),
                        message: format!("Stealth overlay window detected: {}", overlays.join("; ")),
                        timestamp: now,
                    },
                );
            }

            // Check processes via zero-allocation persistent system
            let forbidden_list = check_forbidden_processes();
            if let Some(forbidden) = forbidden_list.first() {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;

                let _ = app_handle.emit(
                    "exam:environment-violation",
                    EnvironmentViolationEvent {
                        violation_type: "FORBIDDEN_PROCESS_SPAWNED".to_string(),
                        message: format!("Forbidden process detected: {}", forbidden),
                        timestamp: now,
                    },
                );
            }

            // Check runtime integrity (anti-debug & injection)
            let integrity = check_runtime_integrity();
            if !integrity.passed {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;

                let _ = app_handle.emit(
                    "exam:environment-violation",
                    EnvironmentViolationEvent {
                        violation_type: "RUNTIME_TAMPER_DETECTED".to_string(),
                        message: format!("Runtime integrity violation: {}", integrity.violations.join("; ")),
                        timestamp: now,
                    },
                );
            }
        }
    });
}

#[tauri::command]
pub fn list_non_essential_apps() -> Result<Vec<RunningUserApp>, String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSApplicationActivationPolicy, NSRunningApplication, NSWorkspace};
        let mut apps = Vec::new();
        unsafe {
            let current_app = NSRunningApplication::currentApplication();
            let current_pid = current_app.processIdentifier() as u32;

            let workspace = NSWorkspace::sharedWorkspace();
            let running = workspace.runningApplications();
            for i in 0..running.count() {
                let app = running.objectAtIndex(i);
                if app.isTerminated() {
                    continue;
                }
                if app.activationPolicy() != NSApplicationActivationPolicy::Regular {
                    continue;
                }
                let pid = app.processIdentifier() as u32;
                if pid == current_pid {
                    continue;
                }

                let name = app
                    .localizedName()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "Unknown".to_string());
                let bundle_id = app
                    .bundleIdentifier()
                    .map(|s| s.to_string())
                    .unwrap_or_default();

                let lower_name = name.to_lowercase();
                let lower_bundle = bundle_id.to_lowercase();

                // Exclude desktop environment & system windowing essentials
                if lower_name == "finder"
                    || lower_name == "dock"
                    || lower_name == "systemuiserver"
                    || lower_name == "controlcenter"
                    || lower_name == "windowserver"
                    || lower_name == "loginwindow"
                    || lower_name.contains("codeskill")
                    || lower_bundle.starts_with("com.apple.finder")
                    || lower_bundle.starts_with("com.apple.dock")
                    || lower_bundle.starts_with("com.apple.systemuiserver")
                    || lower_bundle.contains("codeskill")
                {
                    continue;
                }

                apps.push(RunningUserApp {
                    pid,
                    name,
                    bundle_or_exe: bundle_id,
                });
            }
        }
        Ok(apps)
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
        use windows::Win32::UI::WindowsAndMessaging::{
            EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
        };
        use sysinfo::System;

        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All);
        let current_pid = std::process::id();

        static mut VISIBLE_PIDS: Vec<u32> = Vec::new();
        unsafe {
            VISIBLE_PIDS.clear();
            unsafe extern "system" fn enum_proc(hwnd: HWND, _: LPARAM) -> BOOL {
                if IsWindowVisible(hwnd).as_bool() {
                    let mut title = [0u16; 512];
                    let len = GetWindowTextW(hwnd, &mut title);
                    if len > 0 {
                        let mut pid = 0u32;
                        GetWindowThreadProcessId(hwnd, Some(&mut pid));
                        if pid > 0 && !VISIBLE_PIDS.contains(&pid) {
                            VISIBLE_PIDS.push(pid);
                        }
                    }
                }
                BOOL(1)
            }
            let _ = EnumWindows(Some(enum_proc), LPARAM(0));
        }

        let mut apps = Vec::new();
        let visible_pids = unsafe { VISIBLE_PIDS.clone() };

        for pid in visible_pids {
            if pid == current_pid {
                continue;
            }
            if let Some(proc) = sys.process(sysinfo::Pid::from_u32(pid)) {
                let name = proc.name().to_string_lossy().to_string();
                let lower = name.to_lowercase();
                if lower == "explorer.exe"
                    || lower == "dwm.exe"
                    || lower == "searchhost.exe"
                    || lower == "shellexperiencehost.exe"
                    || lower == "textinputhost.exe"
                    || lower.contains("codeskill")
                {
                    continue;
                }
                let exe = proc.exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
                apps.push(RunningUserApp {
                    pid,
                    name,
                    bundle_or_exe: exe,
                });
            }
        }
        Ok(apps)
    }

    #[cfg(target_os = "linux")]
    {
        let mut apps = Vec::new();
        let current_pid = std::process::id();
        if let Ok(output) = std::process::Command::new("wmctrl").arg("-lp").output() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 4 {
                    if let Ok(pid) = parts[2].parse::<u32>() {
                        if pid == current_pid || pid == 0 {
                            continue;
                        }
                        let title = parts[4..].join(" ");
                        let lower = title.to_lowercase();
                        if lower.contains("codeskill")
                            || lower.contains("gnome-shell")
                            || lower.contains("desktop")
                        {
                            continue;
                        }
                        apps.push(RunningUserApp {
                            pid,
                            name: title,
                            bundle_or_exe: format!("/proc/{}", pid),
                        });
                    }
                }
            }
        }
        Ok(apps)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn close_non_essential_apps(force: bool) -> Result<Vec<RunningUserApp>, String> {
    log_diagnostic_entry("INFO", "SECURITY", &format!("Attempting to close non-essential apps (force={})", force));
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSApplicationActivationPolicy, NSRunningApplication, NSWorkspace};
        unsafe {
            let current_app = NSRunningApplication::currentApplication();
            let current_pid = current_app.processIdentifier() as u32;
            let workspace = NSWorkspace::sharedWorkspace();
            let running = workspace.runningApplications();

            for i in 0..running.count() {
                let app = running.objectAtIndex(i);
                if app.isTerminated() || app.activationPolicy() != NSApplicationActivationPolicy::Regular {
                    continue;
                }
                let pid = app.processIdentifier() as u32;
                if pid == current_pid {
                    continue;
                }
                let name = app.localizedName().map(|s| s.to_string()).unwrap_or_default().to_lowercase();
                let bundle = app.bundleIdentifier().map(|s| s.to_string()).unwrap_or_default().to_lowercase();
                if name == "finder"
                    || name == "dock"
                    || name == "systemuiserver"
                    || name == "controlcenter"
                    || name == "windowserver"
                    || name == "loginwindow"
                    || name.contains("codeskill")
                    || bundle.starts_with("com.apple.finder")
                    || bundle.starts_with("com.apple.dock")
                    || bundle.starts_with("com.apple.systemuiserver")
                    || bundle.contains("codeskill")
                {
                    continue;
                }

                if force {
                    let _ = app.forceTerminate();
                } else {
                    let _ = app.terminate();
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let apps = list_non_essential_apps()?;
        for app in &apps {
            if force {
                use windows::Win32::Foundation::CloseHandle;
                use windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
                unsafe {
                    if let Ok(handle) = OpenProcess(PROCESS_TERMINATE, false, app.pid) {
                        let _ = TerminateProcess(handle, 1);
                        let _ = CloseHandle(handle);
                    }
                }
            } else {
                use windows::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};
                use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE};
                let target_pid = app.pid;
                unsafe extern "system" fn close_enum(hwnd: HWND, lparam: LPARAM) -> BOOL {
                    let mut pid = 0u32;
                    GetWindowThreadProcessId(hwnd, Some(&mut pid));
                    if pid == lparam.0 as u32 {
                        let _ = PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0));
                    }
                    BOOL(1)
                }
                unsafe {
                    let _ = EnumWindows(Some(close_enum), LPARAM(target_pid as isize));
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let apps = list_non_essential_apps()?;
        for app in &apps {
            let sig = if force { "-9" } else { "-15" };
            let _ = std::process::Command::new("kill")
                .args([sig, &app.pid.to_string()])
                .status();
        }
    }

    // Wait 800ms for apps to finish teardown
    std::thread::sleep(std::time::Duration::from_millis(800));

    // Return any remaining stubborn apps
    let remaining = list_non_essential_apps()?;
    if !remaining.is_empty() {
        log_diagnostic_entry("WARN", "SECURITY", &format!("{} stubborn apps still open after close attempt", remaining.len()));
    } else {
        log_diagnostic_entry("INFO", "SECURITY", "All non-essential apps successfully closed");
    }
    Ok(remaining)
}

#[cfg(target_os = "macos")]
fn get_macos_media_auth_status(media_type: &str) -> String {
    use objc2_foundation::NSString;
    use objc2::runtime::AnyClass;

    unsafe {
        if let Some(cls) = AnyClass::get("AVCaptureDevice") {
            let ns_media_type = NSString::from_str(media_type);
            let status: isize = objc2::msg_send![cls, authorizationStatusForMediaType: &*ns_media_type];
            match status {
                3 => "granted".to_string(),
                2 => "denied".to_string(),
                1 => "denied".to_string(),
                0 => "not_determined".to_string(),
                _ => "not_determined".to_string(),
            }
        } else {
            "granted".to_string()
        }
    }
}

#[cfg(target_os = "macos")]
fn request_macos_media_access(media_type: &str) {
    use objc2_foundation::NSString;
    use objc2::runtime::AnyClass;
    use std::sync::mpsc::channel;

    unsafe {
        if let Some(cls) = AnyClass::get("AVCaptureDevice") {
            let ns_media_type = NSString::from_str(media_type);
            let (tx, rx) = channel();
            let block = block2::RcBlock::new(move |granted: objc2::runtime::Bool| {
                let _ = tx.send(granted.as_bool());
            });

            let _: () = objc2::msg_send![cls, requestAccessForMediaType: &*ns_media_type, completionHandler: &*block];
            let _ = rx.recv_timeout(std::time::Duration::from_secs(5));
        }
    }
}

#[cfg(target_os = "windows")]
fn get_windows_consent_status(device: &str) -> String {
    use windows::Win32::System::Registry::{RegOpenKeyExW, RegQueryValueExW, RegCloseKey, HKEY, HKEY_CURRENT_USER, KEY_READ};
    unsafe {
        let subkey = format!("Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\{}", device);
        let wide: Vec<u16> = subkey.encode_utf16().chain(std::iter::once(0)).collect();
        let mut key = HKEY::default();
        if RegOpenKeyExW(HKEY_CURRENT_USER, windows::core::PCWSTR(wide.as_ptr()), 0, KEY_READ, &mut key).is_ok() {
            let val_name = windows::core::w!("Value");
            let mut buf = [0u16; 64];
            let mut size = (buf.len() * 2) as u32;
            if RegQueryValueExW(key, val_name, None, None, Some(buf.as_mut_ptr() as *mut u8), Some(&mut size)).is_ok() {
                let s = String::from_utf16_lossy(&buf);
                let _ = RegCloseKey(key);
                if s.to_lowercase().starts_with("allow") {
                    return "granted".to_string();
                } else if s.to_lowercase().starts_with("deny") {
                    return "denied".to_string();
                }
            }
            let _ = RegCloseKey(key);
        }
    }
    "granted".to_string()
}

#[tauri::command]
pub fn check_and_request_media_permissions(
    require_camera: bool,
    require_mic: bool,
) -> Result<MediaPermissionStatus, String> {
    let mut camera = "granted".to_string();
    let mut microphone = "granted".to_string();

    #[cfg(target_os = "macos")]
    {
        if require_camera {
            camera = get_macos_media_auth_status("vide");
            if camera == "not_determined" {
                request_macos_media_access("vide");
                camera = get_macos_media_auth_status("vide");
            }
        }
        if require_mic {
            microphone = get_macos_media_auth_status("soun");
            if microphone == "not_determined" {
                request_macos_media_access("soun");
                microphone = get_macos_media_auth_status("soun");
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if require_camera {
            camera = get_windows_consent_status("webcam");
        }
        if require_mic {
            microphone = get_windows_consent_status("microphone");
        }
    }

    #[cfg(target_os = "linux")]
    {
        if require_camera {
            let has_video = std::fs::read_dir("/dev")
                .map(|entries| {
                    entries.filter_map(|e| e.ok()).any(|e| {
                        e.file_name().to_string_lossy().starts_with("video")
                    })
                })
                .unwrap_or(false);
            camera = if has_video { "granted".to_string() } else { "denied".to_string() };
        }
        if require_mic {
            let has_audio = std::path::Path::new("/dev/snd").exists();
            microphone = if has_audio { "granted".to_string() } else { "denied".to_string() };
        }
    }

    let ready = (!require_camera || camera == "granted") && (!require_mic || microphone == "granted");
    Ok(MediaPermissionStatus {
        camera,
        microphone,
        ready,
    })
}

#[tauri::command]
pub fn list_blocking_apps() -> Result<Vec<BlockingAppInfo>, String> {
    let mut apps = Vec::new();
    let current_pid = std::process::id();

    // 1. Check for forbidden background processes first
    let mut sys = System::new_all();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All);

    for (pid, process) in sys.processes() {
        let p_id = pid.as_u32();
        if p_id == current_pid || p_id == 0 {
            continue;
        }
        let name = process.name().to_string_lossy().to_string();
        let exe = process.exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();

        if let Some(forbidden_name) = is_forbidden_process(&name, Some(&exe)) {
            apps.push(BlockingAppInfo {
                pid: p_id,
                name: format!("{} ({})", name, forbidden_name),
                category: "forbidden".to_string(),
                bundle_or_path: exe,
                can_force_kill: true,
            });
        }
    }

    // 2. Check for non-essential GUI user apps
    let user_apps = list_non_essential_apps().unwrap_or_default();
    for uapp in user_apps {
        if !apps.iter().any(|a| a.pid == uapp.pid) {
            apps.push(BlockingAppInfo {
                pid: uapp.pid,
                name: uapp.name,
                category: "non_essential".to_string(),
                bundle_or_path: uapp.bundle_or_exe,
                can_force_kill: true,
            });
        }
    }

    Ok(apps)
}

#[tauri::command]
pub fn kill_blocking_app(pid: u32, force: bool) -> Result<bool, String> {
    let blocking = list_blocking_apps()?;
    if !blocking.iter().any(|a| a.pid == pid) {
        return Err(format!("PID {} is not in the list of recognized blocking applications", pid));
    }

    log_diagnostic_entry("INFO", "SECURITY", &format!("Terminating blocking application PID {} (force={})", pid, force));

    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWorkspace;
        unsafe {
            let workspace = NSWorkspace::sharedWorkspace();
            let running = workspace.runningApplications();
            let mut found = false;
            for i in 0..running.count() {
                let app = running.objectAtIndex(i);
                if app.processIdentifier() as u32 == pid {
                    found = true;
                    if force {
                        let _ = app.forceTerminate();
                    } else {
                        let _ = app.terminate();
                    }
                    break;
                }
            }
            if !found {
                let sig = if force { "-9" } else { "-15" };
                let _ = std::process::Command::new("kill")
                    .args([sig, &pid.to_string()])
                    .status();
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let force_flag = if force { "/F" } else { "" };
        let _ = std::process::Command::new("taskkill")
            .args([force_flag, "/PID", &pid.to_string()])
            .output();
    }

    #[cfg(target_os = "linux")]
    {
        let signal = if force { "-9" } else { "-15" };
        let _ = std::process::Command::new("kill")
            .args([signal, &pid.to_string()])
            .output();
    }

    std::thread::sleep(std::time::Duration::from_millis(600));

    let still_running = list_blocking_apps()?
        .iter()
        .any(|a| a.pid == pid);

    Ok(!still_running)
}

#[tauri::command]
pub fn kill_all_blocking_apps(force: bool) -> Result<Vec<BlockingAppInfo>, String> {
    log_diagnostic_entry("INFO", "SECURITY", &format!("Closing all blocking applications (force={})", force));
    let apps = list_blocking_apps()?;
    for app in &apps {
        let _ = kill_blocking_app(app.pid, force);
    }
    std::thread::sleep(std::time::Duration::from_millis(600));
    list_blocking_apps()
}

pub const VIRTUAL_CAMERA_BLOCKLIST: &[&str] = &[
    "obs",
    "virtual",
    "manycam",
    "camtwist",
    "snap camera",
    "mmhmm",
    "epoccam",
    "droidcam",
    "iriun",
];

pub const VIRTUAL_AUDIO_BLOCKLIST: &[&str] = &[
    "blackhole",
    "vb-audio",
    "vb-cable",
    "soundflower",
    "loopback",
    "virtual",
];

#[cfg(target_os = "macos")]
extern "C" {
    fn _dyld_image_count() -> u32;
    fn _dyld_get_image_name(image_index: u32) -> *const std::os::raw::c_char;
}

#[cfg(target_os = "macos")]
fn check_macos_runtime_integrity() -> (bool, bool, Vec<String>) {
    let mut debugger_present = false;
    let mut injection_detected = false;
    let mut violations = Vec::new();

    // 1. Check P_TRACED (0x800 at offset 32) via sysctl
    const P_TRACED: i32 = 0x00000800;
    let mut mib = [1 /* CTL_KERN */, 14 /* KERN_PROC */, 1 /* KERN_PROC_PID */, unsafe { libc::getpid() }];
    let mut buf = [0u8; 1024];
    let mut size = buf.len();
    let ret = unsafe {
        libc::sysctl(
            mib.as_mut_ptr(),
            4,
            buf.as_mut_ptr() as *mut libc::c_void,
            &mut size,
            std::ptr::null_mut(),
            0,
        )
    };
    if ret == 0 && size >= 36 {
        let p_flag = i32::from_ne_bytes([buf[32], buf[33], buf[34], buf[35]]);
        if (p_flag & P_TRACED) != 0 {
            debugger_present = true;
            violations.push("Active debugger attached (P_TRACED flag detected)".to_string());
        }
    }

    // 2. Check DYLD_INSERT_LIBRARIES
    if std::env::var("DYLD_INSERT_LIBRARIES").is_ok() {
        injection_detected = true;
        violations.push("DYLD_INSERT_LIBRARIES environment variable is set".to_string());
    }

    // 3. Inspect loaded dylib images
    unsafe {
        let count = _dyld_image_count();
        for i in 0..count {
            let name_ptr = _dyld_get_image_name(i);
            if !name_ptr.is_null() {
                if let Ok(c_str) = std::ffi::CStr::from_ptr(name_ptr).to_str() {
                    let lower = c_str.to_lowercase();
                    if lower.contains("fridagadget") || lower.contains("substrate") || lower.contains("tweakinject") {
                        injection_detected = true;
                        violations.push(format!("Injected hook dylib detected: {}", c_str));
                    } else if (c_str.starts_with("/tmp/") || c_str.starts_with("/opt/homebrew/") || c_str.starts_with("/Users/"))
                        && !c_str.contains("/target/")
                        && !c_str.contains("/codeskill")
                        && !c_str.contains(".cargo")
                        && !c_str.contains("/.rustup/")
                    {
                        if lower.contains("inject") || lower.contains("hook") || lower.contains("frida") {
                            injection_detected = true;
                            violations.push(format!("Suspicious user-space dylib detected: {}", c_str));
                        }
                    }
                }
            }
        }
    }

    (debugger_present, injection_detected, violations)
}

#[cfg(target_os = "windows")]
fn check_windows_runtime_integrity() -> (bool, bool, Vec<String>) {
    use windows::Win32::System::Diagnostics::Debug::{IsDebuggerPresent, CheckRemoteDebuggerPresent};
    use windows::Win32::System::Threading::GetCurrentProcess;
    use windows::Win32::System::ProcessStatus::{EnumProcessModules, GetModuleFileNameExW};
    use windows::Win32::Foundation::HMODULE;

    let mut debugger_present = false;
    let mut injection_detected = false;
    let mut violations = Vec::new();

    unsafe {
        if IsDebuggerPresent().as_bool() {
            debugger_present = true;
            violations.push("IsDebuggerPresent() returned true".to_string());
        }

        let mut remote_present = windows::Win32::Foundation::BOOL(0);
        if CheckRemoteDebuggerPresent(GetCurrentProcess(), &mut remote_present).is_ok() && remote_present.as_bool() {
            debugger_present = true;
            violations.push("CheckRemoteDebuggerPresent() returned true".to_string());
        }

        let process = GetCurrentProcess();
        let mut modules: [HMODULE; 1024] = [HMODULE::default(); 1024];
        let mut cb_needed = 0u32;
        if EnumProcessModules(
            process,
            modules.as_mut_ptr(),
            std::mem::size_of_val(&modules) as u32,
            &mut cb_needed,
        ).is_ok() {
            let count = (cb_needed as usize) / std::mem::size_of::<HMODULE>();
            for &module in &modules[..count.min(1024)] {
                let mut path_buf = [0u16; 1024];
                let len = GetModuleFileNameExW(process, module, &mut path_buf);
                if len > 0 {
                    let path = String::from_utf16_lossy(&path_buf[..len as usize]);
                    let lower = path.to_lowercase();
                    if lower.contains("hook")
                        || lower.contains("inject")
                        || lower.contains("frida")
                        || lower.contains("substrate")
                    {
                        injection_detected = true;
                        violations.push(format!("Injected DLL detected: {}", path));
                    } else if lower.contains("\\temp\\")
                        || lower.contains("\\appdata\\local\\temp\\")
                        || lower.contains("\\downloads\\")
                    {
                        injection_detected = true;
                        violations.push(format!("Suspicious DLL loaded from temp/downloads: {}", path));
                    }
                }
            }
        }
    }

    (debugger_present, injection_detected, violations)
}

#[cfg(target_os = "linux")]
fn check_linux_runtime_integrity() -> (bool, bool, Vec<String>) {
    let mut debugger_present = false;
    let mut injection_detected = false;
    let mut violations = Vec::new();

    if std::env::var("LD_PRELOAD").is_ok() {
        injection_detected = true;
        violations.push("LD_PRELOAD environment variable is set".to_string());
    }

    if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
        for line in status.lines() {
            if line.starts_with("TracerPid:") {
                let pid_str = line.trim_start_matches("TracerPid:").trim();
                if let Ok(pid) = pid_str.parse::<u32>() {
                    if pid != 0 {
                        debugger_present = true;
                        violations.push(format!("Active TracerPid detected: {}", pid));
                    }
                }
            }
        }
    }

    (debugger_present, injection_detected, violations)
}

pub fn check_runtime_integrity() -> RuntimeIntegrityReport {
    #[cfg(target_os = "macos")]
    let (debugger_present, injection_detected, violations) = check_macos_runtime_integrity();

    #[cfg(target_os = "windows")]
    let (debugger_present, injection_detected, violations) = check_windows_runtime_integrity();

    #[cfg(target_os = "linux")]
    let (debugger_present, injection_detected, violations) = check_linux_runtime_integrity();

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    let (debugger_present, injection_detected, violations) = (false, false, Vec::new());

    let passed = !debugger_present && !injection_detected && violations.is_empty();
    RuntimeIntegrityReport {
        passed,
        debugger_present,
        injection_detected,
        violations,
    }
}

#[tauri::command]
pub fn run_runtime_integrity_check() -> Result<RuntimeIntegrityReport, String> {
    Ok(check_runtime_integrity())
}

pub fn check_media_hardware_audit() -> MediaHardwareAudit {
    let mut devices = Vec::new();
    let mut virtual_detected = Vec::new();

    #[cfg(target_os = "macos")]
    {
        use objc2::runtime::AnyClass;
        use objc2_foundation::NSString;

        // 1. Inspect CoreMediaIO DAL Plug-Ins directory for virtual camera driver plugins
        let dal_paths = [
            "/Library/CoreMediaIO/Plug-Ins/DAL",
            "/System/Library/CoreMediaIO/Plug-Ins/DAL",
        ];
        for dal_path in &dal_paths {
            if let Ok(entries) = std::fs::read_dir(dal_path) {
                for entry in entries.flatten() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    let lower = file_name.to_lowercase();
                    for kw in VIRTUAL_CAMERA_BLOCKLIST {
                        if lower.contains(kw) {
                            virtual_detected.push(format!("CoreMediaIO DAL plugin: {}", file_name));
                            devices.push(MediaDeviceDescriptor {
                                name: file_name.clone(),
                                device_type: "camera".to_string(),
                                is_virtual: true,
                                model_id: Some(file_name.clone()),
                                manufacturer: Some("Virtual Camera Plugin".to_string()),
                                transport_type: Some("CoreMediaIO DAL".to_string()),
                            });
                            break;
                        }
                    }
                }
            }
        }

        // 2. Query AVCaptureDevice for video capture devices
        unsafe {
            if let Some(cls) = AnyClass::get("AVCaptureDevice") {
                let ns_video = NSString::from_str("vide");
                let device_list: *const objc2::runtime::AnyObject =
                    objc2::msg_send![cls, devicesWithMediaType: &*ns_video];
                if !device_list.is_null() {
                    let count: usize = objc2::msg_send![device_list, count];
                    for i in 0..count {
                        let dev: *const objc2::runtime::AnyObject =
                            objc2::msg_send![device_list, objectAtIndex: i];
                        if !dev.is_null() {
                            let loc_name: *const NSString = objc2::msg_send![dev, localizedName];
                            let name = if !loc_name.is_null() {
                                (*loc_name).to_string()
                            } else {
                                "Unknown Camera".to_string()
                            };

                            let model_id_ptr: *const NSString = objc2::msg_send![dev, modelID];
                            let model_id = if !model_id_ptr.is_null() {
                                Some((*model_id_ptr).to_string())
                            } else {
                                None
                            };

                            let lower = name.to_lowercase();
                            let is_virt = VIRTUAL_CAMERA_BLOCKLIST.iter().any(|k| lower.contains(k))
                                || model_id
                                    .as_ref()
                                    .map(|m| VIRTUAL_CAMERA_BLOCKLIST.iter().any(|k| m.to_lowercase().contains(k)))
                                    .unwrap_or(false);

                            if is_virt {
                                virtual_detected.push(format!("Virtual camera device: {}", name));
                            }

                            devices.push(MediaDeviceDescriptor {
                                name,
                                device_type: "camera".to_string(),
                                is_virtual: is_virt,
                                model_id,
                                manufacturer: None,
                                transport_type: if is_virt { Some("Virtual".to_string()) } else { Some("Physical".to_string()) },
                            });
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::Registry::{
            RegOpenKeyExW, RegCloseKey, HKEY, HKEY_LOCAL_MACHINE, KEY_READ,
        };

        // 1. Inspect DirectShow video capture devices in Windows Registry
        unsafe {
            let mut key = HKEY::default();
            let subkey = windows::core::w!("SOFTWARE\\Classes\\CLSID\\{860bb310-5d01-11d0-bd3b-00a0c911ce86}\\Instance");
            if RegOpenKeyExW(HKEY_LOCAL_MACHINE, subkey, 0, KEY_READ, &mut key).is_ok() {
                let _ = RegCloseKey(key);
            }
        }

        // 2. Query Windows MediaFoundation / MMDevices audio capture endpoints
        unsafe {
            let mut key = HKEY::default();
            let subkey = windows::core::w!("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Capture");
            if RegOpenKeyExW(HKEY_LOCAL_MACHINE, subkey, 0, KEY_READ, &mut key).is_ok() {
                let _ = RegCloseKey(key);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(entries) = std::fs::read_dir("/sys/class/video4linux") {
            for entry in entries.flatten() {
                let name_file = entry.path().join("name");
                if let Ok(name) = std::fs::read_to_string(name_file) {
                    let trimmed = name.trim().to_string();
                    let lower = trimmed.to_lowercase();
                    let is_virt = lower.contains("v4l2loopback") || VIRTUAL_CAMERA_BLOCKLIST.iter().any(|k| lower.contains(k));
                    if is_virt {
                        virtual_detected.push(format!("Virtual video4linux device: {}", trimmed));
                    }
                    devices.push(MediaDeviceDescriptor {
                        name: trimmed,
                        device_type: "camera".to_string(),
                        is_virtual: is_virt,
                        model_id: None,
                        manufacturer: None,
                        transport_type: if is_virt { Some("v4l2loopback".to_string()) } else { Some("Physical".to_string()) },
                    });
                }
            }
        }
    }

    let passed = virtual_detected.is_empty();
    MediaHardwareAudit {
        passed,
        devices,
        virtual_devices_detected: virtual_detected,
    }
}

#[tauri::command]
pub fn inspect_media_hardware() -> Result<MediaHardwareAudit, String> {
    Ok(check_media_hardware_audit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vorssaint_detection() {
        assert_eq!(
            is_forbidden_process("Vorssaint", Some("/Applications/Vorssaint.app/Contents/MacOS/Vorssaint")),
            Some("vorssaint")
        );
        assert_eq!(
            is_forbidden_process(
                "now-playing.pl",
                Some("/usr/bin/perl /Applications/Vorssaint.app/Contents/Resources/now-playing.pl watch_all")
            ),
            Some("vorssaint")
        );
        assert_eq!(is_forbidden_process("vorssaint", None), Some("vorssaint"));

        // Live check: if Vorssaint is running on this host machine,
        // check_forbidden_processes() must detect it live.
        let mut sys = System::new_all();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All);
        let vorssaint_running = sys.processes().values().any(|p| {
            let name = p.name().to_string_lossy().to_lowercase();
            let exe = p.exe().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            name.contains("vorssaint") || exe.contains("vorssaint")
        });

        if vorssaint_running {
            let detected = check_forbidden_processes();
            assert!(
                detected.contains(&"vorssaint".to_string()),
                "Expected live Vorssaint process to be detected, found: {:?}",
                detected
            );
        }
    }

    #[test]
    fn test_switcher_utilities_detection() {
        assert_eq!(
            is_forbidden_process("AltTab", Some("/Applications/AltTab.app/Contents/MacOS/AltTab")),
            Some("alttab")
        );
        assert_eq!(
            is_forbidden_process("Raycast", Some("/Applications/Raycast.app/Contents/MacOS/Raycast")),
            Some("raycast")
        );
        assert_eq!(
            is_forbidden_process("Alfred", Some("/Applications/Alfred 5.app/Contents/MacOS/Alfred")),
            Some("alfred")
        );
        assert_eq!(
            is_forbidden_process("BetterTouchTool", Some("/Applications/BetterTouchTool.app/Contents/MacOS/BetterTouchTool")),
            Some("bettertouchtool")
        );
    }

    #[test]
    fn test_system_processes_not_blocked() {
        assert_eq!(
            is_forbidden_process("WindowServer", Some("/System/Library/Frameworks/CoreGraphics.framework/WindowServer")),
            None
        );
        assert_eq!(
            is_forbidden_process("parsecd", Some("/System/Library/PrivateFrameworks/CoreParsec.framework/parsecd")),
            None
        );
        assert_eq!(
            is_forbidden_process("zsh", Some("/bin/zsh")),
            None
        );
    }
}


