use std::sync::atomic::{AtomicBool, Ordering};
#[allow(unused_imports)]
use tauri::Manager;

#[cfg(target_os = "linux")]
use std::sync::Mutex;
#[cfg(target_os = "linux")]
use std::process::Child;

use crate::attestation::AttestationState;
use crate::security::log_diagnostic_entry;
use crate::state_persistence::{save_persisted_exam_session, PersistedExamSessionPatch};

static KIOSK_ACTIVE: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "linux")]
static INHIBIT_CHILD: Mutex<Option<Child>> = Mutex::new(None);

#[cfg(target_os = "windows")]
use std::sync::Mutex;
#[cfg(target_os = "windows")]
use windows::Win32::Foundation::{HHOOK, LPARAM, LRESULT, WPARAM};

#[cfg(target_os = "windows")]
static KEYBOARD_HOOK: Mutex<Option<HHOOK>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Windows Kiosk: Low-Level Keyboard Hook, Desktop Isolation, Shell Lock & Clipboard
// ---------------------------------------------------------------------------
#[cfg(target_os = "windows")]
mod windows_impl {
    use super::*;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, SetWindowsHookExW, UnhookWindowsHookEx,
        KBDLLHOOKSTRUCT, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
    };
    use windows::Win32::Foundation::{HINSTANCE, HWND};
    use windows::Win32::System::StationsAndDesktops::{
        CreateDesktopW, SwitchDesktop, CloseDesktop, HDESK, OpenInputDesktop,
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

    static ISOLATED_DESKTOP: Mutex<Option<HDESK>> = Mutex::new(None);
    static PREV_DESKTOP: Mutex<Option<HDESK>> = Mutex::new(None);
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
            *lock = Some(hook);
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
            if let Some(hook) = lock.take() {
                unsafe {
                    let _ = UnhookWindowsHookEx(hook);
                }
            }
        }
    }

    pub fn prevent_display_sleep() {
        use windows::Win32::System::Threading::{
            SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
        };
        unsafe {
            let _ = SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
        }
    }

    pub fn allow_display_sleep() {
        use windows::Win32::System::Threading::{SetThreadExecutionState, ES_CONTINUOUS};
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
            let prev_desk = OpenInputDesktop(0, false, DESKTOP_SWITCHDESKTOP);
            if let Ok(d) = prev_desk {
                if let Ok(mut lock) = PREV_DESKTOP.lock() {
                    *lock = Some(d);
                }
            }

            let desktop_name = windows::core::w!("CodeSkillLockdownDesktop");
            let new_desk = CreateDesktopW(
                desktop_name,
                None,
                None,
                0,
                DESKTOP_CREATEWINDOW | DESKTOP_SWITCHDESKTOP | DESKTOP_WRITEOBJECTS,
                None,
            ).map_err(|e| format!("CreateDesktopW failed: {}", e))?;

            let _ = SwitchDesktop(new_desk);
            if let Ok(mut lock) = ISOLATED_DESKTOP.lock() {
                *lock = Some(new_desk);
            }
            Ok(())
        }
    }

    pub fn disable_isolated_desktop() {
        unsafe {
            if let Ok(mut lock) = PREV_DESKTOP.lock() {
                if let Some(prev) = lock.take() {
                    let _ = SwitchDesktop(prev);
                    let _ = CloseDesktop(prev);
                }
            }
            if let Ok(mut lock) = ISOLATED_DESKTOP.lock() {
                if let Some(desk) = lock.take() {
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
}

// ---------------------------------------------------------------------------
// macOS Kiosk: Automatic Assessment Configuration (AEAssessmentSession) & Cocoa Fallback
// ---------------------------------------------------------------------------
#[cfg(target_os = "macos")]
mod macos_impl {
    use super::*;
    use objc2_app_kit::{
        NSApplication, NSApplicationActivationPolicy, NSApplicationPresentationOptions,
        NSNormalWindowLevel, NSStatusWindowLevel, NSWindow,
        NSEvent, NSEventMask, NSEventModifierFlags,
    };
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_foundation::MainThreadMarker;
    use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
    use core_graphics::event::{
        CallbackResult, CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions,
        CGEventTapPlacement, CGEventType, EventField,
    };

    extern "C" {
        fn EnableSecureEventInput() -> i32;
        fn DisableSecureEventInput() -> i32;
        fn objc_getClass(name: *const std::ffi::c_char) -> *mut std::ffi::c_void;
        fn class_getInstanceMethod(cls: *mut std::ffi::c_void, name: *const std::ffi::c_void) -> *mut std::ffi::c_void;
        fn method_setImplementation(
            method: *mut std::ffi::c_void,
            imp: unsafe extern "C" fn(*mut std::ffi::c_void, *const std::ffi::c_void, *mut std::ffi::c_void),
        ) -> *mut std::ffi::c_void;
        fn sel_registerName(name: *const std::ffi::c_char) -> *const std::ffi::c_void;
    }

    struct RawMonitor(*mut AnyObject);
    unsafe impl Send for RawMonitor {}
    unsafe impl Sync for RawMonitor {}

    struct RawSession(*mut AnyObject);
    unsafe impl Send for RawSession {}
    unsafe impl Sync for RawSession {}

    static MACOS_KEY_MONITOR: std::sync::Mutex<Option<RawMonitor>> = std::sync::Mutex::new(None);
    static AAC_SESSION: std::sync::Mutex<Option<RawSession>> = std::sync::Mutex::new(None);
    static SWIZZLED_NSWINDOW: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

    struct EventTapHandle {
        run_loop: CFRunLoop,
        thread_handle: std::thread::JoinHandle<()>,
    }
    unsafe impl Send for EventTapHandle {}
    unsafe impl Sync for EventTapHandle {}

    static EVENT_TAP_HANDLE: std::sync::Mutex<Option<EventTapHandle>> = std::sync::Mutex::new(None);
    static CAFFEINATE_CHILD: std::sync::Mutex<Option<std::process::Child>> = std::sync::Mutex::new(None);

    unsafe extern "C" fn swallow_cancel_operation(
        _this: *mut std::ffi::c_void,
        _cmd: *const std::ffi::c_void,
        _sender: *mut std::ffi::c_void,
    ) {
        // Esc / cancelOperation is intercepted and swallowed so macOS never exits fullscreen
    }

    pub fn swizzle_nswindow_cancel_operation() {
        if SWIZZLED_NSWINDOW.swap(true, Ordering::SeqCst) {
            return;
        }
        unsafe {
            let cls = objc_getClass(b"NSWindow\0".as_ptr() as *const std::ffi::c_char);
            if !cls.is_null() {
                let sel = sel_registerName(b"cancelOperation:\0".as_ptr() as *const std::ffi::c_char);
                let method = class_getInstanceMethod(cls, sel);
                if !method.is_null() {
                    let _ = method_setImplementation(method, swallow_cancel_operation);
                }
            }
        }
    }

    pub fn try_start_aac_session(allow_accessibility_speech: bool) -> Result<(), String> {
        unsafe {
            let config_cls = objc2::runtime::AnyClass::get("AEAssessmentConfiguration")
                .ok_or_else(|| "AEAssessmentConfiguration class not found".to_string())?;

            let session_cls = objc2::runtime::AnyClass::get("AEAssessmentSession")
                .ok_or_else(|| "AEAssessmentSession class not found".to_string())?;

            let config: *mut AnyObject = objc2::msg_send![config_cls, new];
            if config.is_null() {
                return Err("Failed to allocate AEAssessmentConfiguration".to_string());
            }

            let no_val = objc2::runtime::Bool::NO;
            let speech_val = if allow_accessibility_speech {
                objc2::runtime::Bool::YES
            } else {
                objc2::runtime::Bool::NO
            };
            let _: () = objc2::msg_send![config, setAllowsSpellCheck: no_val];
            let _: () = objc2::msg_send![config, setAllowsPredictiveKeyboard: no_val];
            let _: () = objc2::msg_send![config, setAllowsKeyboardShortcuts: no_val];
            let _: () = objc2::msg_send![config, setAllowsActivityContinuation: no_val];
            let _: () = objc2::msg_send![config, setAllowsDictation: no_val];
            let _: () = objc2::msg_send![config, setAllowsAccessibilitySpeech: speech_val];
            let _: () = objc2::msg_send![config, setAllowsPasswordAutoFill: no_val];
            let _: () = objc2::msg_send![config, setAllowsContinuousPathKeyboard: no_val];

            let session_alloc: *mut AnyObject = objc2::msg_send![session_cls, alloc];
            if session_alloc.is_null() {
                return Err("Failed to alloc AEAssessmentSession".to_string());
            }
            let session: *mut AnyObject = objc2::msg_send![session_alloc, initWithConfiguration: config];
            if session.is_null() {
                return Err("Failed to init AEAssessmentSession with configuration".to_string());
            }

            let _: () = objc2::msg_send![session, begin];

            if let Ok(mut lock) = AAC_SESSION.lock() {
                *lock = Some(RawSession(session));
            }
            Ok(())
        }
    }

    pub fn stop_aac_session() {
        if let Ok(mut lock) = AAC_SESSION.lock() {
            if let Some(raw) = lock.take() {
                unsafe {
                    let _: () = objc2::msg_send![raw.0, end];
                }
            }
        }
    }

    pub fn reassert_presentation_options() {
        let mtm = unsafe { MainThreadMarker::new_unchecked() };
        let app = NSApplication::sharedApplication(mtm);
        let options = NSApplicationPresentationOptions::NSApplicationPresentationHideDock
            | NSApplicationPresentationOptions::NSApplicationPresentationHideMenuBar
            | NSApplicationPresentationOptions::NSApplicationPresentationDisableProcessSwitching
            | NSApplicationPresentationOptions::NSApplicationPresentationDisableForceQuit
            | NSApplicationPresentationOptions::NSApplicationPresentationDisableSessionTermination
            | NSApplicationPresentationOptions::NSApplicationPresentationDisableHideApplication;
        app.setPresentationOptions(options);
    }

    pub fn enable_macos_kiosk(window_ptr: Option<*mut std::ffi::c_void>) {
        unsafe {
            let _ = EnableSecureEventInput();
        }

        swizzle_nswindow_cancel_operation();

        // Inhibit system and display sleep while kiosk is active
        let pid = std::process::id().to_string();
        if let Ok(child) = std::process::Command::new("caffeinate")
            .args(["-d", "-i", "-w", &pid])
            .spawn()
        {
            if let Ok(mut lock) = CAFFEINATE_CHILD.lock() {
                if let Some(mut old) = lock.take() {
                    let _ = old.kill();
                }
                *lock = Some(child);
            }
        }

        // 1. Terminate any previous event tap thread
        if let Ok(mut lock) = EVENT_TAP_HANDLE.lock() {
            if let Some(handle) = lock.take() {
                handle.run_loop.stop();
                let _ = handle.thread_handle.join();
            }
        }

        // 2. Install dedicated low-level CGEventTap thread for system-wide Cmd+Tab and Esc interception
        let (tx, rx) = std::sync::mpsc::channel();
        let thread_handle = std::thread::spawn(move || {
            let current_run_loop = CFRunLoop::get_current();

            let tap_res = CGEventTap::new(
                CGEventTapLocation::Session,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::Default,
                vec![CGEventType::KeyDown, CGEventType::KeyUp, CGEventType::FlagsChanged],
                |_proxy, _type, event| {
                    let key_code = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
                    let flags = event.get_flags();
                    let is_cmd = flags.contains(CGEventFlags::CGEventFlagCommand);
                    let is_ctrl = flags.contains(CGEventFlags::CGEventFlagControl);
                    let is_alt = flags.contains(CGEventFlags::CGEventFlagAlternate);
                    let is_shift = flags.contains(CGEventFlags::CGEventFlagShift);

                    // 1. Esc (0x35) MUST NOT exit fullscreen or dismiss the window
                    if key_code == 0x35 {
                        return CallbackResult::Drop;
                    }

                    // 2. Tab (0x30) with Cmd, Ctrl, or Alt/Option
                    if (is_cmd || is_ctrl || is_alt) && key_code == 0x30 {
                        return CallbackResult::Drop;
                    }

                    // 3. Space (0x31) with Cmd, Ctrl, or Alt/Option (Spotlight/Raycast/Alfred)
                    if (is_cmd || is_ctrl || is_alt) && key_code == 0x31 {
                        return CallbackResult::Drop;
                    }

                    // 4. Cmd combinations: Q, W, H, M, N, T, R, P, S, O, L, C, V, X, A, ~, [, ], or Shift+3/4/5/6
                    if is_cmd {
                        if key_code == 0x0C // Q
                            || key_code == 0x0D // W
                            || key_code == 0x04 // H
                            || key_code == 0x2E // M
                            || key_code == 0x2D // N
                            || key_code == 0x11 // T
                            || key_code == 0x0F // R
                            || key_code == 0x23 // P
                            || key_code == 0x01 // S
                            || key_code == 0x1F // O
                            || key_code == 0x25 // L
                            || key_code == 0x08 // C
                            || key_code == 0x09 // V
                            || key_code == 0x07 // X
                            || key_code == 0x00 // A
                            || key_code == 0x32 // ~
                            || key_code == 0x21 // [
                            || key_code == 0x1E // ]
                            || (is_shift && (key_code == 0x14 || key_code == 0x15 || key_code == 0x17 || key_code == 0x16))
                        {
                            return CallbackResult::Drop;
                        }
                    }

                    // 5. Ctrl with Arrows (0x7B..=0x7E), F3 (0x63), F11 (0x67), F12 (0x6F)
                    if is_ctrl {
                        if (key_code >= 0x7B && key_code <= 0x7E)
                            || key_code == 0x63
                            || key_code == 0x67
                            || key_code == 0x6F
                        {
                            return CallbackResult::Drop;
                        }
                    }

                    // 6. Block Option/Alt shortcuts: Tab (0x30), Space (0x31), Esc (0x35)
                    if is_alt && (key_code == 0x30 || key_code == 0x31 || key_code == 0x35) {
                        return CallbackResult::Drop;
                    }

                    // 7. Block macOS Dictionary Lookup & Writing Tools popup: Ctrl+Cmd+D (0x02)
                    if is_cmd && is_ctrl && key_code == 0x02 {
                        return CallbackResult::Drop;
                    }

                    CallbackResult::Keep
                },
            );

            match tap_res {
                Ok(tap) => {
                    if let Ok(source) = tap.mach_port().create_runloop_source(0) {
                        current_run_loop.add_source(&source, unsafe { kCFRunLoopCommonModes });
                        tap.enable();
                        let _ = tx.send(Some(current_run_loop.clone()));
                        CFRunLoop::run_current();
                    } else {
                        let _ = tx.send(None);
                    }
                }
                Err(_) => {
                    let _ = tx.send(None);
                }
            }
        });

        if let Ok(Some(run_loop)) = rx.recv() {
            if let Ok(mut lock) = EVENT_TAP_HANDLE.lock() {
                *lock = Some(EventTapHandle {
                    run_loop,
                    thread_handle,
                });
            }
        }

        let block = block2::RcBlock::new(|event: std::ptr::NonNull<NSEvent>| -> *mut NSEvent {
            let (key_code, flags) = unsafe {
                let event_ref = event.as_ref();
                (event_ref.keyCode(), event_ref.modifierFlags())
            };
            let is_cmd = flags.contains(NSEventModifierFlags::NSEventModifierFlagCommand);
            let is_ctrl = flags.contains(NSEventModifierFlags::NSEventModifierFlagControl);
            let is_opt = flags.contains(NSEventModifierFlags::NSEventModifierFlagOption);

            let mut block_key = false;

            // Esc (53 / 0x35) MUST NEVER dismiss window or leave fullscreen
            if key_code == 53 {
                block_key = true;
            }

            // Tab (48 / 0x30)
            if (is_cmd || is_ctrl || is_opt) && key_code == 48 {
                block_key = true;
            }

            // Space (49 / 0x31)
            if (is_cmd || is_ctrl || is_opt) && key_code == 49 {
                block_key = true;
            }

            // Q (12), W (13), T (17), N (45), H (4), M (46), ~ (50), [ (33), ] (30)
            if is_cmd && (key_code == 12 || key_code == 13 || key_code == 17 || key_code == 45 || key_code == 4 || key_code == 46 || key_code == 50 || key_code == 33 || key_code == 30) {
                block_key = true;
            }

            // Arrow keys: Ctrl + Arrows, Cmd + Left/Right
            if is_ctrl && (key_code >= 123 && key_code <= 126) {
                block_key = true;
            }
            if is_cmd && (key_code == 123 || key_code == 124) {
                block_key = true;
            }

            // Function keys
            if key_code == 160 || key_code == 99 || key_code == 103 || key_code == 111 {
                block_key = true;
            }

            // DevTools / View Source
            if is_cmd && is_opt && (key_code == 34 || key_code == 38 || key_code == 32) {
                block_key = true;
            }

            // Reload Cmd+R (15), Print Cmd+P (35), Save Cmd+S (1)
            if is_cmd && (key_code == 15 || key_code == 35 || key_code == 1 || key_code == 31 || key_code == 37) {
                block_key = true;
            }

            if block_key {
                return std::ptr::null_mut();
            }

            event.as_ptr()
        });

        let monitor = unsafe {
            NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &block)
        };
        if let Some(mon) = monitor {
            let raw = Retained::into_raw(mon);
            if let Ok(mut lock) = MACOS_KEY_MONITOR.lock() {
                *lock = Some(RawMonitor(raw));
            }
        }
        let mtm = unsafe { MainThreadMarker::new_unchecked() };
        let app = NSApplication::sharedApplication(mtm);

        let _ = app.setActivationPolicy(NSApplicationActivationPolicy::Regular);
        #[allow(deprecated)]
        app.activateIgnoringOtherApps(true);

        reassert_presentation_options();

        if let Some(ptr) = window_ptr {
            if !ptr.is_null() {
                unsafe {
                    let ns_win: &NSWindow = &*(ptr as *const NSWindow);
                    ns_win.setLevel(NSStatusWindowLevel + 1);
                }
            }
        }
    }

    pub fn disable_macos_kiosk(window_ptr: Option<*mut std::ffi::c_void>) {
        stop_aac_session();

        unsafe {
            let _ = DisableSecureEventInput();
        }

        // Release system sleep inhibitor
        if let Ok(mut lock) = CAFFEINATE_CHILD.lock() {
            if let Some(mut child) = lock.take() {
                let _ = child.kill();
            }
        }
        if let Ok(mut lock) = EVENT_TAP_HANDLE.lock() {
            if let Some(handle) = lock.take() {
                handle.run_loop.stop();
                let _ = handle.thread_handle.join();
            }
        }
        if let Ok(mut lock) = MACOS_KEY_MONITOR.lock() {
            if let Some(raw_mon) = lock.take() {
                unsafe {
                    if let Some(m) = Retained::from_raw(raw_mon.0) {
                        NSEvent::removeMonitor(&m);
                    }
                }
            }
        }

        let mtm = unsafe { MainThreadMarker::new_unchecked() };
        let app = NSApplication::sharedApplication(mtm);

        app.setPresentationOptions(NSApplicationPresentationOptions::NSApplicationPresentationDefault);

        if let Some(ptr) = window_ptr {
            if !ptr.is_null() {
                unsafe {
                    let ns_win: &NSWindow = &*(ptr as *const NSWindow);
                    ns_win.setLevel(NSNormalWindowLevel);
                }
            }
        }
    }

    pub fn clear_clipboard() {
        use std::io::Write;
        if let Ok(mut child) = std::process::Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()
        {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(b"");
            }
            let _ = child.wait();
        }
    }
}

// ---------------------------------------------------------------------------
// Linux Kiosk: Wayland + Cage Detection, Cgroup Containment, XGrabKeyboard, systemd-inhibit
// ---------------------------------------------------------------------------
#[cfg(target_os = "linux")]
mod linux_impl {
    use super::*;
    use std::process::Command;

    pub fn clear_clipboard() {
        let _ = Command::new("xclip")
            .args(["-selection", "clipboard", "/dev/null"])
            .status();
        let _ = Command::new("xsel")
            .args(["--clipboard", "--clear"])
            .status();
    }

    struct X11DisplayHandle(*mut x11::xlib::Display);
    unsafe impl Send for X11DisplayHandle {}

    static X11_DISPLAY: Mutex<Option<X11DisplayHandle>> = Mutex::new(None);

    pub fn detect_kiosk_mode() -> String {
        let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_default().to_lowercase();
        let wayland_display = std::env::var("WAYLAND_DISPLAY").unwrap_or_default();
        if session_type == "wayland" || !wayland_display.is_empty() {
            "linux_wayland_cage".to_string()
        } else {
            "linux_x11_degraded".to_string()
        }
    }

    pub fn setup_cgroup_containment() {
        let pid = std::process::id();
        let cgroup_paths = [
            format!("/sys/fs/cgroup/user.slice/codeskill-lockdown.scope/cgroup.procs"),
            "/sys/fs/cgroup/codeskill-lockdown.scope/cgroup.procs".to_string(),
        ];
        for path in &cgroup_paths {
            if let Some(parent) = std::path::Path::new(path).parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if std::fs::write(path, pid.to_string()).is_ok() {
                break;
            }
        }
    }

    pub fn check_wayland_session() -> Result<(), String> {
        let session_type = std::env::var("XDG_SESSION_TYPE").unwrap_or_default().to_lowercase();
        let wayland_display = std::env::var("WAYLAND_DISPLAY").unwrap_or_default();
        if session_type == "x11" && wayland_display.is_empty() {
            log_diagnostic_entry(
                "WARN",
                "SECURITY",
                "Running under unhardened X11 session. Launching via codeskill-lockdown-cage.sh is strongly recommended.",
            );
        }
        Ok(())
    }

    pub fn grab_x11_keyboard() -> Result<(), String> {
        unsafe {
            let display = x11::xlib::XOpenDisplay(std::ptr::null());
            if display.is_null() {
                return Err("Failed to open X11 Display for keyboard grab.".to_string());
            }
            let root = x11::xlib::XDefaultRootWindow(display);
            let status = x11::xlib::XGrabKeyboard(
                display,
                root,
                1, // OwnerEvents = True
                x11::xlib::GrabModeAsync,
                x11::xlib::GrabModeAsync,
                x11::xlib::CurrentTime,
            );
            if status != x11::xlib::GrabSuccess {
                x11::xlib::XCloseDisplay(display);
                return Err(format!("XGrabKeyboard failed with status code {}", status));
            }
            x11::xlib::XFlush(display);
            if let Ok(mut lock) = X11_DISPLAY.lock() {
                *lock = Some(X11DisplayHandle(display));
            }
            Ok(())
        }
    }

    pub fn ungrab_x11_keyboard() {
        if let Ok(mut lock) = X11_DISPLAY.lock() {
            if let Some(handle) = lock.take() {
                unsafe {
                    let display = handle.0;
                    if !display.is_null() {
                        x11::xlib::XUngrabKeyboard(display, x11::xlib::CurrentTime);
                        x11::xlib::XFlush(display);
                        x11::xlib::XCloseDisplay(display);
                    }
                }
            }
        }
    }

    pub fn start_systemd_inhibit() {
        let _ = Command::new("xdg-screensaver").arg("suspend").spawn();
        if let Ok(child) = Command::new("systemd-inhibit")
            .args([
                "--what=idle:sleep:handle-lid-switch",
                "--who=CodeSkill-LockDown",
                "--why=Active Exam In Progress",
                "sleep",
                "infinity",
            ])
            .spawn()
        {
            if let Ok(mut lock) = INHIBIT_CHILD.lock() {
                *lock = Some(child);
            }
        }
    }

    pub fn stop_systemd_inhibit() {
        let _ = Command::new("xdg-screensaver").arg("resume").spawn();
        if let Ok(mut lock) = INHIBIT_CHILD.lock() {
            if let Some(mut child) = lock.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Cross-Platform Commands & Cleanup
// ---------------------------------------------------------------------------
pub fn clear_os_clipboard() {
    #[cfg(target_os = "windows")]
    {
        windows_impl::clear_clipboard();
    }

    #[cfg(target_os = "macos")]
    {
        macos_impl::clear_clipboard();
    }

    #[cfg(target_os = "linux")]
    {
        linux_impl::clear_clipboard();
    }
}

pub fn release_os_kiosk_system() {
    KIOSK_ACTIVE.store(false, Ordering::SeqCst);

    #[cfg(target_os = "windows")]
    {
        windows_impl::remove_keyboard_hook();
        windows_impl::disable_isolated_desktop();
        windows_impl::disable_shell_locked_mode();
    }

    #[cfg(target_os = "macos")]
    {
        macos_impl::disable_macos_kiosk(None);
    }

    #[cfg(target_os = "linux")]
    {
        linux_impl::ungrab_x11_keyboard();
        linux_impl::stop_systemd_inhibit();
    }
}

#[tauri::command]
pub fn release_os_kiosk(window: tauri::WebviewWindow) -> Result<(), String> {
    let app = window.app_handle().clone();

    // Update in-memory state
    let att_state = app.state::<AttestationState>();
    att_state.kiosk_active.store(false, Ordering::SeqCst);

    // Update persisted session snapshot
    let _ = save_persisted_exam_session(
        app.clone(),
        PersistedExamSessionPatch {
            kiosk_active: Some(false),
            ..Default::default()
        },
    );

    #[cfg(target_os = "macos")]
    {
        let win_clone = window.clone();
        let _ = window.run_on_main_thread(move || {
            let window_ptr = win_clone.ns_window().ok();
            macos_impl::disable_macos_kiosk(window_ptr);
            let _ = win_clone.set_decorations(true);
            let _ = win_clone.set_always_on_top(false);
            let _ = win_clone.set_content_protected(false);
            let _ = win_clone.set_resizable(true);
            release_os_kiosk_system();
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.set_always_on_top(false);
        let _ = window.set_fullscreen(false);
        let _ = window.set_content_protected(false);
        let _ = window.set_resizable(true);

        let _ = app.run_on_main_thread(move || {
            release_os_kiosk_system();
        });
    }

    clear_kiosk_dirty(&app);
    close_secondary_monitor_shields(&app);
    log_diagnostic_entry("INFO", "KIOSK", "OS Kiosk mode released");
    Ok(())
}

fn get_kiosk_dirty_lock_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        dir.join("kiosk_dirty.lock")
    } else {
        std::env::temp_dir().join("codeskill_kiosk_dirty.lock")
    }
}

pub fn mark_kiosk_dirty(app: &tauri::AppHandle) {
    let path = get_kiosk_dirty_lock_path(app);
    let pid = std::process::id();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let content = format!("pid={}\ntimestamp={}\n", pid, now);
    let _ = std::fs::write(path, content);
}

pub fn clear_kiosk_dirty(app: &tauri::AppHandle) {
    let path = get_kiosk_dirty_lock_path(app);
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}

pub fn recover_dirty_kiosk_state(app: &tauri::AppHandle) {
    let path = get_kiosk_dirty_lock_path(app);
    if path.exists() {
        log_diagnostic_entry(
            "WARN",
            "CRASH_RECOVERY",
            "Found kiosk_dirty.lock from previous crash/abrupt exit. Recovering dirty kiosk state...",
        );
        release_os_kiosk_system();
        clear_kiosk_dirty(app);
        log_diagnostic_entry(
            "INFO",
            "CRASH_RECOVERY",
            "Dirty kiosk state recovered successfully.",
        );
    }
}

pub fn spawn_secondary_monitor_shields(app: &tauri::AppHandle) {
    if let Ok(monitors) = app.available_monitors() {
        if monitors.len() <= 1 {
            return;
        }
        let primary_name = app.primary_monitor().ok().flatten().and_then(|m| m.name().map(|s| s.to_string()));
        for (i, monitor) in monitors.iter().enumerate() {
            let is_primary = match &primary_name {
                Some(name) => monitor.name() == Some(name),
                None => i == 0,
            };
            if is_primary {
                continue;
            }
            let label = format!("shield-window-{}", i);
            if app.get_webview_window(&label).is_some() {
                continue;
            }
            let pos = *monitor.position();
            let size = *monitor.size();
            let _ = tauri::WebviewWindowBuilder::new(
                app,
                &label,
                tauri::WebviewUrl::App("data:text/html,<body style='background-color:black;margin:0;overflow:hidden;'></body>".into()),
            )
            .title("CodeSkill LockDown Shield")
            .always_on_top(true)
            .decorations(false)
            .fullscreen(true)
            .position(pos.x as f64, pos.y as f64)
            .inner_size(size.width as f64, size.height as f64)
            .build();
        }
    }
}

pub fn close_secondary_monitor_shields(app: &tauri::AppHandle) {
    for i in 0..16 {
        let label = format!("shield-window-{}", i);
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.close();
        }
    }
}

#[tauri::command]
pub fn enable_kiosk_mode(
    window: tauri::WebviewWindow,
    _proctoring_enabled: Option<bool>,
) -> Result<(), String> {
    clear_os_clipboard();

    let app = window.app_handle().clone();
    mark_kiosk_dirty(&app);
    let att_state = app.state::<AttestationState>();

    #[cfg(target_os = "macos")]
    {
        let win_clone = window.clone();
        let _ = window.run_on_main_thread(move || {
            let _ = win_clone.set_decorations(false);
            let _ = win_clone.set_always_on_top(true);
            let _ = win_clone.set_content_protected(true);
            let _ = win_clone.set_resizable(false);

            if let Ok(Some(monitor)) = win_clone.primary_monitor() {
                let _ = win_clone.set_position(*monitor.position());
                let _ = win_clone.set_size(*monitor.size());
            }

            let window_ptr = win_clone.ns_window().ok();
            macos_impl::enable_macos_kiosk(window_ptr);
        });

        // Try AAC first; fallback to Cocoa kiosk
        let allow_speech = att_state.allow_accessibility_speech.load(std::sync::atomic::Ordering::Relaxed);
        let aac_result = macos_impl::try_start_aac_session(allow_speech);
        let mode = if aac_result.is_ok() {
            log_diagnostic_entry("INFO", "KIOSK", "macOS AEAssessmentSession started successfully");
            "macos_aac_enforced"
        } else {
            log_diagnostic_entry("INFO", "KIOSK", "AEAssessmentSession unavailable/dev build; using hardened macos_cocoa_kiosk");
            "macos_cocoa_kiosk"
        };

        if let Ok(mut km) = att_state.kiosk_mode.lock() {
            *km = mode.to_string();
        }
    }

    #[cfg(target_os = "windows")]
    {
        let _ = window.set_always_on_top(true);
        let _ = window.set_fullscreen(true);
        let _ = window.set_content_protected(true);
        let _ = window.set_resizable(false);

        windows_impl::install_keyboard_hook()?;

        let is_proctoring = proctoring_enabled.unwrap_or(true);
        let mode = if is_proctoring {
            windows_impl::enable_shell_locked_mode()?;
            "windows_shell_locked"
        } else {
            windows_impl::enable_isolated_desktop()?;
            "windows_isolated_desktop"
        };

        if let Ok(mut km) = att_state.kiosk_mode.lock() {
            *km = mode.to_string();
        }
    }

    #[cfg(target_os = "linux")]
    {
        let _ = window.set_always_on_top(true);
        let _ = window.set_fullscreen(true);
        let _ = window.set_content_protected(true);
        let _ = window.set_resizable(false);

        linux_impl::check_wayland_session()?;
        linux_impl::setup_cgroup_containment();
        let _ = linux_impl::grab_x11_keyboard();
        linux_impl::start_systemd_inhibit();

        let mode = linux_impl::detect_kiosk_mode();
        if let Ok(mut km) = att_state.kiosk_mode.lock() {
            *km = mode;
        }
    }

    KIOSK_ACTIVE.store(true, Ordering::SeqCst);
    att_state.kiosk_active.store(true, Ordering::SeqCst);

    let active_mode = att_state.kiosk_mode.lock().map(|m| m.clone()).unwrap_or_default();
    let _ = save_persisted_exam_session(
        app,
        PersistedExamSessionPatch {
            kiosk_active: Some(true),
            kiosk_mode: Some(active_mode.clone()),
            ..Default::default()
        },
    );

    log_diagnostic_entry(
        "INFO",
        "KIOSK",
        &format!("OS Kiosk mode engaged with mode: {}", active_mode),
    );
    Ok(())
}

#[tauri::command]
pub fn engage_os_kiosk(
    window: tauri::WebviewWindow,
    proctoring_enabled: Option<bool>,
) -> Result<(), String> {
    enable_kiosk_mode(window, proctoring_enabled)
}

#[tauri::command]
pub fn disable_kiosk_mode(window: tauri::WebviewWindow) -> Result<(), String> {
    release_os_kiosk(window)
}

#[tauri::command]
pub fn exit_lockdown_app(app: tauri::AppHandle) {
    eprintln!("[CodeSkill LockDown IPC] exit_lockdown_app invoked");
    release_os_kiosk_system();
    close_secondary_monitor_shields(&app);
    clear_kiosk_dirty(&app);
    let _ = crate::state_persistence::clear_persisted_exam_session(app.clone());
    if let Some(window) = app.get_webview_window("exam-kiosk") {
        let _ = window.clear_all_browsing_data();
    }
    if let Ok(dir) = app.path().app_data_dir() {
        let scoped = dir.join("scoped_webview_data");
        if scoped.exists() {
            let _ = std::fs::remove_dir_all(scoped);
        }
    }
    app.exit(0);
}

pub fn reassert_os_kiosk() {
    if !KIOSK_ACTIVE.load(Ordering::SeqCst) {
        return;
    }
    #[cfg(target_os = "macos")]
    {
        macos_impl::reassert_presentation_options();
    }
}
