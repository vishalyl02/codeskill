#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(all(target_os = "macos", not(debug_assertions)))]
    unsafe {
        // PT_DENY_ATTACH = 31 on Darwin/macOS kernel
        libc::ptrace(31, 0, std::ptr::null_mut::<libc::c_char>(), 0);
    }

    codeskill_lockdown_lib::run();
}
