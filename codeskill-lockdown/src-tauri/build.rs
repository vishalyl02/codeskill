fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-lib=framework=Carbon");
        println!("cargo:rustc-link-lib=framework=AutomaticAssessmentConfiguration");
        println!("cargo:rustc-link-lib=framework=AVFoundation");
        println!("cargo:rustc-link-lib=framework=ScreenCaptureKit");
    }

    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_frontend_origin",
            "get_attestation_public_key",
            "get_attestation_info",
            "set_attested_session_id",
            "sync_server_time",
            "sign_api_request",
            "sign_exam_request",
            "run_preflight_checks",
            "run_runtime_integrity_check",
            "inspect_media_hardware",
            "enable_kiosk_mode",
            "engage_os_kiosk",
            "disable_kiosk_mode",
            "release_os_kiosk",
            "vault_upsert_autosave",
            "vault_read_all_autosaves",
            "vault_remove_entry",
            "vault_purge_attempt",
            "get_battery_status",
            "get_system_volume",
            "set_system_volume",
            "get_keyboard_layout",
            "get_synced_timestamp_ms",
            "scan_wifi_networks",
            "connect_wifi_network",
            "exit_lockdown_app",
            "set_locked_assessment",
            "list_non_essential_apps",
            "close_non_essential_apps",
            "get_lockdown_diagnostic_logs",
            "get_display_topology",
            "get_persisted_exam_session",
            "save_persisted_exam_session",
            "clear_persisted_exam_session",
            "check_and_request_media_permissions",
            "list_blocking_apps",
            "kill_blocking_app",
            "kill_all_blocking_apps",
            "run_full_system_diagnostic",
        ]),
    );
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}

