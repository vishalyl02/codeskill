use std::sync::atomic::{AtomicBool, Ordering};
#[allow(unused_imports)]
use tauri::Manager;

#[cfg(target_os = "linux")]
use std::sync::Mutex;
#[cfg(target_os = "linux")]
use std::process::Child;

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
// Windows Kiosk: Low-Level Keyboard Hook
// ---------------------------------------------------------------------------
#[cfg(target_os = "windows")]
mod windows_impl {
    use super::*;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, SetWindowsHookExW, UnhookWindowsHookEx,
        KBDLLHOOKSTRUCT, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
    };
    use windows::Win32::Foundation::HINSTANCE;

    const VK_LWIN: u32 = 0x5B;
    const VK_RWIN: u32 = 0x5C;
    const VK_SNAPSHOT: u32 = 0x2C;
    const VK_TAB: u32 = 0x09;
    const VK_ESCAPE: u32 = 0x1B;
    const LLKHF_ALTDOWN: u32 = 0x20;

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

                // Block Windows key, PrintScreen, Alt+Tab, Alt+Esc
                if vk == VK_LWIN
                    || vk == VK_RWIN
                    || vk == VK_SNAPSHOT
                    || (is_alt && vk == VK_TAB)
                    || (is_alt && vk == VK_ESCAPE)
                {
                    return LRESULT(1); // Intercept and block
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
            Ok(())
        }
    }

    pub fn remove_keyboard_hook() {
        allow_display_sleep();
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
        use windows::Win32::Foundation::HWND;
        unsafe {
            if OpenClipboard(HWND::default()).is_ok() {
                let _ = EmptyClipboard();
                let _ = CloseClipboard();
            }
        }
    }
}

// ---------------------------------------------------------------------------
// macOS Kiosk: NSApplicationPresentationOptions
// ---------------------------------------------------------------------------
#[cfg(target_os = "macos")]
mod macos_impl {
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
    }

    struct RawMonitor(*mut AnyObject);
    unsafe impl Send for RawMonitor {}
    unsafe impl Sync for RawMonitor {}

    static MACOS_KEY_MONITOR: std::sync::Mutex<Option<RawMonitor>> = std::sync::Mutex::new(None);

    struct EventTapHandle {
        run_loop: CFRunLoop,
        thread_handle: std::thread::JoinHandle<()>,
    }
    unsafe impl Send for EventTapHandle {}
    unsafe impl Sync for EventTapHandle {}

    static EVENT_TAP_HANDLE: std::sync::Mutex<Option<EventTapHandle>> = std::sync::Mutex::new(None);
    static CAFFEINATE_CHILD: std::sync::Mutex<Option<std::process::Child>> = std::sync::Mutex::new(None);

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

        // 2. Install dedicated low-level CGEventTap thread for system-wide Cmd+Tab interception
        let (tx, rx) = std::sync::mpsc::channel();
        let thread_handle = std::thread::spawn(move || {
            let current_run_loop = CFRunLoop::get_current();

            let tap_res = CGEventTap::new(
                CGEventTapLocation::Session,
                CGEventTapPlacement::HeadInsertEventTap,
                CGEventTapOptions::Default,
                vec![CGEventType::KeyDown, CGEventType::KeyUp],
                |_proxy, _type, event| {
                    let key_code = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
                    let flags = event.get_flags();
                    let is_cmd = flags.contains(CGEventFlags::CGEventFlagCommand);
                    let is_ctrl = flags.contains(CGEventFlags::CGEventFlagControl);
                    let is_alt = flags.contains(CGEventFlags::CGEventFlagAlternate);
                    let is_shift = flags.contains(CGEventFlags::CGEventFlagShift);

                    // Block Command shortcuts:
                    // Tab (0x30), Space (0x31), H (0x04), M (0x2E), Q (0x0C), W (0x0D), Esc (0x35), ~ (0x32), Shift+3/4/5/6
                    if is_cmd {
                        if key_code == 0x30
                            || key_code == 0x31
                            || key_code == 0x04
                            || key_code == 0x2E
                            || key_code == 0x0C
                            || key_code == 0x0D
                            || key_code == 0x35
                            || key_code == 0x32
                            || (is_shift && (key_code == 0x14 || key_code == 0x15 || key_code == 0x17 || key_code == 0x16))
                        {
                            return CallbackResult::Drop;
                        }
                    }

                    // Block Control shortcuts:
                    // Tab (0x30), Space (0x31), Arrows (0x7B..=0x7E), F3 (0x63), F11 (0x67)
                    if is_ctrl {
                        if key_code == 0x30
                            || key_code == 0x31
                            || (key_code >= 0x7B && key_code <= 0x7E)
                            || key_code == 0x63
                            || key_code == 0x67
                        {
                            return CallbackResult::Drop;
                        }
                    }

                    // Block Option/Alt shortcuts:
                    // Tab (0x30) or Space (0x31)
                    if is_alt && (key_code == 0x30 || key_code == 0x31) {
                        return CallbackResult::Drop;
                    }

                    // Block macOS Dictionary Lookup & Writing Tools popup: Ctrl+Cmd+D (0x02)
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

            // 1. Tab (0x30 / 48): Cmd+Tab (App switcher), Ctrl+Tab (Tab switch), Alt+Tab (Vorssaint / AltTab)
            if (is_cmd || is_ctrl || is_opt) && key_code == 48 {
                block_key = true;
            }

            // 2. Space (0x31 / 49): Cmd+Space (Spotlight), Cmd+Opt+Space (Finder Search), Ctrl+Space (Input switcher)
            if (is_cmd || is_ctrl) && key_code == 49 {
                block_key = true;
            }

            // 3. Escape (0x35 / 53): Cmd+Opt+Esc (Force Quit menu), Cmd+Esc (Launchpad/Front Row)
            if (is_cmd || is_opt) && key_code == 53 {
                block_key = true;
            }

            // 4. Q (0x0C / 12): Cmd+Q (Quit Application)
            if is_cmd && key_code == 12 {
                block_key = true;
            }

            // 5. W (0x0D / 13): Cmd+W (Close Window / Tab)
            if is_cmd && key_code == 13 {
                block_key = true;
            }

            // 6. T (0x11 / 17): Cmd+T (New Tab)
            if is_cmd && key_code == 17 {
                block_key = true;
            }

            // 7. N (0x2D / 45): Cmd+N (New Window)
            if is_cmd && key_code == 45 {
                block_key = true;
            }

            // 8. H (0x04 / 4): Cmd+H (Hide application), Cmd+Opt+H (Hide others)
            if is_cmd && key_code == 4 {
                block_key = true;
            }

            // 9. M (0x2E / 46): Cmd+M (Minimize window)
            if is_cmd && key_code == 46 {
                block_key = true;
            }

            // 10. ` / ~ (0x32 / 50): Cmd+~ (Cycle windows in application)
            if is_cmd && key_code == 50 {
                block_key = true;
            }

            // 11. [ (0x21 / 33) and ] (0x1E / 30): Cmd+[ / Cmd+] (Back/Forward), Cmd+Shift+[ / Cmd+Shift+] (Tab cycling)
            if is_cmd && (key_code == 33 || key_code == 30) {
                block_key = true;
            }

            // 12. Arrow keys (123 Left, 124 Right, 125 Down, 126 Up):
            // Ctrl + Arrows (Mission Control / Spaces switching), Cmd + Left/Right (History navigation)
            if is_ctrl && (key_code >= 123 && key_code <= 126) {
                block_key = true;
            }
            if is_cmd && (key_code == 123 || key_code == 124) {
                block_key = true;
            }

            // 13. Function keys: F3 (160 / 99 - Mission Control), F11 (103 - Show Desktop), F12 (111 - DevTools)
            if key_code == 160 || key_code == 99 || key_code == 103 || key_code == 111 {
                block_key = true;
            }

            // 14. DevTools / View Source / Inspection: Cmd+Opt+I (34), Cmd+Opt+J (38), Cmd+Opt+U (32)
            if is_cmd && is_opt && (key_code == 34 || key_code == 38 || key_code == 32) {
                block_key = true;
            }

            // 15. Reload: Cmd+R (15)
            if is_cmd && key_code == 15 {
                block_key = true;
            }

            // 16. Print: Cmd+P (35)
            if is_cmd && key_code == 35 {
                block_key = true;
            }

            // 17. Save / Open / Location: Cmd+S (1), Cmd+O (31), Cmd+L (37)
            if is_cmd && (key_code == 1 || key_code == 31 || key_code == 37) {
                block_key = true;
            }

            // 18. Dictionary Lookup & macOS Writing Tools: Ctrl+Cmd+D (2)
            if is_cmd && is_ctrl && key_code == 2 {
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

        let options = NSApplicationPresentationOptions::NSApplicationPresentationHideDock
            | NSApplicationPresentationOptions::NSApplicationPresentationHideMenuBar
            | NSApplicationPresentationOptions::NSApplicationPresentationDisableProcessSwitching
            | NSApplicationPresentationOptions::NSApplicationPresentationDisableForceQuit
            | NSApplicationPresentationOptions::NSApplicationPresentationDisableSessionTermination
            | NSApplicationPresentationOptions::NSApplicationPresentationDisableHideApplication;

        app.setPresentationOptions(options);

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
// Linux Kiosk: Wayland rejection, XGrabKeyboard, systemd-inhibit
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

    pub fn check_wayland_session() -> Result<(), String> {
        if let Ok(session_type) = std::env::var("XDG_SESSION_TYPE") {
            if session_type.to_lowercase() == "wayland" {
                return Err("Wayland sessions are not supported for secure exam kiosk mode. Please log out and choose X11/Xorg from your display manager to take this assessment.".to_string());
            }
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

        let app = window.app_handle().clone();
        let _ = app.run_on_main_thread(move || {
            release_os_kiosk_system();
        });
    }

    Ok(())
}

#[tauri::command]
pub fn enable_kiosk_mode(window: tauri::WebviewWindow) -> Result<(), String> {
    // Immediately clear OS clipboard so students cannot paste pre-copied code
    clear_os_clipboard();

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
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.set_always_on_top(true);
        let _ = window.set_fullscreen(true);
        let _ = window.set_content_protected(true);
        let _ = window.set_resizable(false);
    }

    #[cfg(target_os = "windows")]
    {
        windows_impl::install_keyboard_hook()?;
    }

    #[cfg(target_os = "linux")]
    {
        linux_impl::check_wayland_session()?;
        let _ = linux_impl::grab_x11_keyboard();
        linux_impl::start_systemd_inhibit();
    }

    KIOSK_ACTIVE.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn engage_os_kiosk(window: tauri::WebviewWindow) -> Result<(), String> {
    enable_kiosk_mode(window)
}

#[tauri::command]
pub fn disable_kiosk_mode(window: tauri::WebviewWindow) -> Result<(), String> {
    release_os_kiosk(window)
}

#[tauri::command]
pub fn exit_lockdown_app(app: tauri::AppHandle) {
    release_os_kiosk_system();
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
