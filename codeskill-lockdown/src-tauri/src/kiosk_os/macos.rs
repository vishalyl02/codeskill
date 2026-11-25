use super::*;
use objc2_app_kit::{
    NSApplication, NSApplicationActivationPolicy, NSApplicationPresentationOptions,
    NSNormalWindowLevel, NSStatusWindowLevel, NSWindow,
    NSEvent, NSEventMask, NSEventModifierFlags, NSPasteboard,
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

static CLIPBOARD_GUARD_STOP: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(true);
static CLIPBOARD_GUARD_RUNNING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static EXPECTED_PASTEBOARD_CHANGE_COUNT: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(-1);
static LOCAL_COPY_DEADLINE_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn now_epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

unsafe fn pasteboard_has_remote_marker(pb: &NSPasteboard) -> bool {
    let remote_type = objc2_foundation::NSString::from_str("com.apple.is-remote-clipboard");
    if let Some(types) = pb.types() {
        for i in 0..types.count() {
            if types.objectAtIndex(i).isEqualToString(&remote_type) {
                return true;
            }
        }
    }
    false
}

pub fn clear_clipboard() {
    unsafe {
        let pb = NSPasteboard::generalPasteboard();
        let new_cc = pb.clearContents();
        EXPECTED_PASTEBOARD_CHANGE_COUNT.store(new_cc, std::sync::atomic::Ordering::SeqCst);
    }
}

pub fn authorize_local_clipboard_copy() {
    LOCAL_COPY_DEADLINE_MS.store(now_epoch_ms().saturating_add(1500), std::sync::atomic::Ordering::SeqCst);
    unsafe {
        let pb = NSPasteboard::generalPasteboard();
        EXPECTED_PASTEBOARD_CHANGE_COUNT.store(pb.changeCount(), std::sync::atomic::Ordering::SeqCst);
    }
}

pub fn start_clipboard_guard(app: tauri::AppHandle) {
    use tauri::Emitter;
    clear_clipboard();
    CLIPBOARD_GUARD_STOP.store(false, std::sync::atomic::Ordering::SeqCst);
    if CLIPBOARD_GUARD_RUNNING.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(move || {
        let mut last_violation_ms: u64 = 0;
        while !CLIPBOARD_GUARD_STOP.load(std::sync::atomic::Ordering::SeqCst) {
            let (is_remote, changed_externally, current_cc) = unsafe {
                let pb = NSPasteboard::generalPasteboard();
                let cc = pb.changeCount();
                let expected = EXPECTED_PASTEBOARD_CHANGE_COUNT.load(std::sync::atomic::Ordering::SeqCst);
                let remote = pasteboard_has_remote_marker(&pb);
                let now = now_epoch_ms();
                let deadline = LOCAL_COPY_DEADLINE_MS.load(std::sync::atomic::Ordering::SeqCst);

                if cc != expected && now <= deadline && !remote {
                    // Authorized in-editor copy/cut completed; lock in the new changeCount.
                    EXPECTED_PASTEBOARD_CHANGE_COUNT.store(cc, std::sync::atomic::Ordering::SeqCst);
                    (false, false, cc)
                } else {
                    (remote, expected >= 0 && cc != expected, cc)
                }
            };

            if is_remote || changed_externally {
                clear_clipboard();
                let now = now_epoch_ms();
                let reason = if is_remote {
                    "universal_clipboard_remote_marker"
                } else {
                    "external_pasteboard_change"
                };
                crate::flight_recorder::record_event(
                    "WARN",
                    "SECURITY",
                    "SCENARIO_D_CLIPBOARD",
                    "EXTERNAL_CLIPBOARD_DETECTED",
                    "cleared",
                    serde_json::json!({ "reason": reason, "changeCount": current_cc }),
                );
                if now.saturating_sub(last_violation_ms) >= 2000 {
                    last_violation_ms = now;
                    let _ = app.emit(
                        "exam:environment-violation",
                        crate::security::EnvironmentViolationEvent {
                            violation_type: "EXTERNAL_CLIPBOARD_DETECTED".to_string(),
                            message: "External or Universal Clipboard content detected and cleared.".to_string(),
                            timestamp: now,
                        },
                    );
                }
            }

            std::thread::sleep(std::time::Duration::from_millis(250));
        }
        CLIPBOARD_GUARD_RUNNING.store(false, std::sync::atomic::Ordering::SeqCst);
    });
}

pub fn stop_clipboard_guard() {
    CLIPBOARD_GUARD_STOP.store(true, std::sync::atomic::Ordering::SeqCst);
}
