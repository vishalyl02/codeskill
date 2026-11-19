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
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreflightResult {
    pub passed: bool,
    pub violations: Vec<String>,
    pub monitor_count: usize,
    pub is_vm: bool,
    pub forbidden_processes: Vec<String>,
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

pub fn check_virtual_machine() -> bool {
    // 1. macOS detection via sysctl kern.hv_vmm_present
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("sysctl")
            .args(["-n", "kern.hv_vmm_present"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if text == "1" {
                return true;
            }
        }
        // Fallback check for known hypervisor features
        if let Ok(output) = std::process::Command::new("sysctl")
            .args(["-n", "machdep.cpu.features"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout).to_uppercase();
            if text.contains("VMM") || text.contains("HYPERVISOR") {
                return true;
            }
        }
    }

    // 2. Linux DMI / sysfs detection
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
                if lower.contains("virtualbox")
                    || lower.contains("vmware")
                    || lower.contains("kvm")
                    || lower.contains("qemu")
                    || lower.contains("bhyve")
                    || lower.contains("xen")
                    || lower.contains("hyper-v")
                {
                    return true;
                }
            }
        }
    }

    // 3. x86 / x86_64 CPUID bit 31 check (Windows & Linux x86_64)
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
                return true;
            }
        }
    }

    false
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

pub fn check_forbidden_processes() -> Vec<String> {
    let mut detected = Vec::new();
    let mut sys = System::new_all();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All);

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

    // 2. VM / Hypervisor detection
    let is_vm = check_virtual_machine();
    if is_vm {
        violations.push("Virtual Machine or Hypervisor environment detected. Exams must be taken on bare-metal physical hardware.".to_string());
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
    }

    let passed = violations.is_empty();

    PreflightResult {
        passed,
        violations,
        monitor_count,
        is_vm,
        forbidden_processes,
    }
}

pub fn start_security_watchdog(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut sys = System::new();
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

                        let _ = app_handle.emit(
                            "exam:environment-violation",
                            EnvironmentViolationEvent {
                                violation_type: "MULTIPLE_MONITORS_CONNECTED".to_string(),
                                message: format!(
                                    "Secondary display connected mid-exam: {} monitors active.",
                                    monitors.len()
                                ),
                                timestamp: now,
                            },
                        );
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

            // Check processes
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All);
            for (_pid, process) in sys.processes() {
                let name = process.name().to_string_lossy();
                let exe = process.exe().map(|p| p.to_string_lossy().to_string());
                let cmd = process
                    .cmd()
                    .iter()
                    .map(|s| s.to_string_lossy())
                    .collect::<Vec<_>>()
                    .join(" ");
                let full_path = match (exe, cmd.is_empty()) {
                    (Some(e), false) => Some(format!("{} {}", e, cmd)),
                    (Some(e), true) => Some(e),
                    (None, false) => Some(cmd),
                    (None, true) => None,
                };

                if let Some(forbidden) = is_forbidden_process(&name, full_path.as_deref()) {
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
                    break;
                }
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


