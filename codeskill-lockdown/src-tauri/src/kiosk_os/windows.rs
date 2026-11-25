use std::sync::Mutex;
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::HHOOK;

static KEYBOARD_HOOK: Mutex<Option<isize>> = Mutex::new(None);

use super::*;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, SetWindowsHookExW, UnhookWindowsHookEx,
    KBDLLHOOKSTRUCT, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
};
use windows::Win32::Foundation::{HINSTANCE, HWND};
use windows::Win32::System::StationsAndDesktops::{
    CreateDesktopW, SwitchDesktop, CloseDesktop, HDESK, OpenInputDesktop,
    DESKTOP_CONTROL_FLAGS, DESKTOP_ACCESS_FLAGS,
    DESKTOP_CREATEWINDOW, DESKTOP_SWITCHDESKTOP, DESKTOP_WRITEOBJECTS,
};
use std::sync::atomic::{AtomicBool, Ordering};

const VK_LWIN: u32 = 0x5B;
const VK_RWIN: u32 = 0x5C;
const VK_SNAPSHOT: u32 = 0x2C;
const VK_TAB: u32 = 0x09;
const VK_ESCAPE: u32 = 0x1B;
const VK_F4: u32 = 0x73;
const LLKHF_ALTDOWN: u32 = 0x20;

static ISOLATED_DESKTOP: Mutex<Option<isize>> = Mutex::new(None);
static PREV_DESKTOP: Mutex<Option<isize>> = Mutex::new(None);
static EXPLORER_WATCHER_STOP: AtomicBool = AtomicBool::new(false);
static CLIPBOARD_GUARD_STOP: AtomicBool = AtomicBool::new(false);

unsafe extern "system" fn low_level_keyboard_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if !KIOSK_ACTIVE.load(Ordering::SeqCst) {
        return CallNextHookEx(None, n_code, w_param, l_param);
    }

    if n_code >= 0 {
        let msg = w_param.0 as u32;
        if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
            let kbd = *(l_param.0 as *const KBDLLHOOKSTRUCT);
            let vk = kbd.vkCode;
            let is_alt = (kbd.flags.0 & LLKHF_ALTDOWN) != 0;
            use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
            let is_ctrl = (GetAsyncKeyState(0x11) as u16 & 0x8000) != 0;
            let is_shift = (GetAsyncKeyState(0x10) as u16 & 0x8000) != 0;
            let is_win = (GetAsyncKeyState(0x5B) as u16 & 0x8000) != 0 || (GetAsyncKeyState(0x5C) as u16 & 0x8000) != 0;

            // 1. Block Escape
            if vk == VK_ESCAPE {
                return LRESULT(1);
            }

            // 2. Block Windows keys
            if vk == VK_LWIN || vk == VK_RWIN {
                return LRESULT(1);
            }

            // 3. Block PrintScreen / Win+Shift+S
            if vk == VK_SNAPSHOT || (is_win && is_shift && (vk == 0x53 || vk == 0x73)) {
                return LRESULT(1);
            }

            // 4. Block Alt combinations (Alt+Tab, Alt+Esc, Alt+F4)
            if is_alt && (vk == VK_TAB || vk == VK_ESCAPE || vk == VK_F4) {
                return LRESULT(1);
            }

            // 5. Block Ctrl combinations (Ctrl+Esc, Ctrl+Shift+Esc, Ctrl+C/V/X outside editor)
            if is_ctrl {
                if vk == VK_ESCAPE || (is_shift && vk == VK_ESCAPE) {
                    return LRESULT(1);
                }
                if vk == 0x43 || vk == 0x56 || vk == 0x58 {
                    return LRESULT(1);
                }
            }
        }
    }
    CallNextHookEx(None, n_code, w_param, l_param)
}

pub fn install_keyboard_hook() -> Result<(), String> {
    remove_keyboard_hook();
    unsafe {
        let hook = SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(low_level_keyboard_proc),
            HINSTANCE::default(),
            0,
        ).map_err(|e| format!("Failed to set WH_KEYBOARD_LL hook: {}", e))?;

        let mut lock = KEYBOARD_HOOK.lock().map_err(|_| "Failed to lock KEYBOARD_HOOK")?;
        *lock = Some(hook.0 as isize);
        prevent_display_sleep();
        start_clipboard_guard();
        set_registry_policies(true);
        Ok(())
    }
}

pub fn remove_keyboard_hook() {
    allow_display_sleep();
    stop_clipboard_guard();
    set_registry_policies(false);
    if let Ok(mut lock) = KEYBOARD_HOOK.lock() {
        if let Some(h) = lock.take() {
            unsafe {
                let _ = UnhookWindowsHookEx(HHOOK(h as *mut core::ffi::c_void));
            }
        }
    }
}

pub fn prevent_display_sleep() {
    use windows::Win32::System::Power::{
        SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
    };
    unsafe {
        let _ = SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
    }
}

pub fn allow_display_sleep() {
    use windows::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS};
    unsafe {
        let _ = SetThreadExecutionState(ES_CONTINUOUS);
    }
}

pub fn clear_clipboard() {
    use windows::Win32::System::DataExchange::{OpenClipboard, EmptyClipboard, CloseClipboard};
    unsafe {
        if OpenClipboard(HWND::default()).is_ok() {
            let _ = EmptyClipboard();
            let _ = CloseClipboard();
        }
    }
}

pub fn start_clipboard_guard() {
    CLIPBOARD_GUARD_STOP.store(false, Ordering::SeqCst);
    std::thread::spawn(|| {
        while !CLIPBOARD_GUARD_STOP.load(Ordering::SeqCst) {
            clear_clipboard();
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });
}

pub fn stop_clipboard_guard() {
    CLIPBOARD_GUARD_STOP.store(true, Ordering::SeqCst);
}

pub fn set_registry_policies(enable: bool) {
    use windows::Win32::System::Registry::{
        RegCreateKeyExW, RegSetValueExW, RegCloseKey, HKEY, HKEY_CURRENT_USER,
        REG_DWORD, REG_OPTION_NON_VOLATILE, KEY_WRITE,
    };
    unsafe {
        let mut key = HKEY::default();
        let subkey = windows::core::w!("Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System");
        if RegCreateKeyExW(
            HKEY_CURRENT_USER,
            subkey,
            0,
            None,
            REG_OPTION_NON_VOLATILE,
            KEY_WRITE,
            None,
            &mut key,
            None,
        ).is_ok() {
            let val: u32 = if enable { 1 } else { 0 };
            let val_bytes = val.to_ne_bytes();
            let _ = RegSetValueExW(key, windows::core::w!("DisableTaskMgr"), 0, REG_DWORD, Some(&val_bytes));
            let _ = RegSetValueExW(key, windows::core::w!("DisableLockWorkstation"), 0, REG_DWORD, Some(&val_bytes));
            let _ = RegSetValueExW(key, windows::core::w!("HideFastUserSwitching"), 0, REG_DWORD, Some(&val_bytes));
            let _ = RegCloseKey(key);
        }
    }
}

pub fn enable_isolated_desktop() -> Result<(), String> {
    unsafe {
        let prev_desk = OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_SWITCHDESKTOP);
        if let Ok(d) = prev_desk {
            if let Ok(mut lock) = PREV_DESKTOP.lock() {
                *lock = Some(d.0 as isize);
            }
        }

        let desktop_name = windows::core::w!("CodeSkillLockdownDesktop");
        let new_desk = CreateDesktopW(
            desktop_name,
            None,
            None,
            DESKTOP_CONTROL_FLAGS(0),
            DESKTOP_CREATEWINDOW.0 | DESKTOP_SWITCHDESKTOP.0 | DESKTOP_WRITEOBJECTS.0,
            None,
        ).map_err(|e| format!("CreateDesktopW failed: {}", e))?;

        let _ = SwitchDesktop(new_desk);
        if let Ok(mut lock) = ISOLATED_DESKTOP.lock() {
            *lock = Some(new_desk.0 as isize);
        }
        Ok(())
    }
}

pub fn disable_isolated_desktop() {
    unsafe {
        if let Ok(mut lock) = PREV_DESKTOP.lock() {
            if let Some(prev_val) = lock.take() {
                let prev = HDESK(prev_val as *mut core::ffi::c_void);
                let _ = SwitchDesktop(prev);
                let _ = CloseDesktop(prev);
            }
        }
        if let Ok(mut lock) = ISOLATED_DESKTOP.lock() {
            if let Some(desk_val) = lock.take() {
                let desk = HDESK(desk_val as *mut core::ffi::c_void);
                let _ = CloseDesktop(desk);
            }
        }
    }
}

pub fn enable_shell_locked_mode() -> Result<(), String> {
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/IM", "explorer.exe"])
        .output();

    EXPLORER_WATCHER_STOP.store(false, Ordering::SeqCst);
    std::thread::spawn(|| {
        while !EXPLORER_WATCHER_STOP.load(Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let mut sys = sysinfo::System::new();
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All);
            for (_pid, proc) in sys.processes() {
                if proc.name().to_string_lossy().to_lowercase() == "explorer.exe" {
                    let _ = std::process::Command::new("taskkill")
                        .args(["/F", "/IM", "explorer.exe"])
                        .output();
                }
            }
        }
    });
    Ok(())
}

pub fn disable_shell_locked_mode() {
    EXPLORER_WATCHER_STOP.store(true, Ordering::SeqCst);
    let _ = std::process::Command::new("cmd")
        .args(["/C", "start explorer.exe"])
        .spawn();
}
