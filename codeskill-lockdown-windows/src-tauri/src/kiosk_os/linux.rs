use std::process::Child;
use std::sync::Mutex;

static INHIBIT_CHILD: Mutex<Option<Child>> = Mutex::new(None);

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
