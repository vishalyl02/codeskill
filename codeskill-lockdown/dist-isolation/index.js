/**
 * CodeSkill LockDown - Tauri v2 IPC Isolation Hook
 * Validates IPC payloads from the locked exam window before AES-GCM encryption to Rust.
 */
window.__TAURI_ISOLATION_HOOK__ = function (payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('[CodeSkill LockDown Isolation] Rejected invalid IPC payload: not an object');
  }

  // Validate allowed command actions
  var cmd = payload.cmd || payload.action || (payload.message && payload.message.cmd);
  if (cmd && typeof cmd === 'string') {
    var allowedCommands = [
      'get_frontend_origin',
      'get_attestation_public_key',
      'get_attestation_info',
      'set_attested_session_id',
      'sync_server_time',
      'sign_api_request',
      'set_locked_assessment',
      'run_preflight_checks',
      'list_non_essential_apps',
      'close_non_essential_apps',
      'check_and_request_media_permissions',
      'list_blocking_apps',
      'kill_blocking_app',
      'kill_all_blocking_apps',
      'get_lockdown_diagnostic_logs',
      'get_display_topology',
      'enable_kiosk_mode',
      'engage_os_kiosk',
      'disable_kiosk_mode',
      'release_os_kiosk',
      'vault_upsert_autosave',
      'vault_read_all_autosaves',
      'vault_remove_entry',
      'vault_purge_attempt',
      'get_battery_status',
      'get_system_volume',
      'set_system_volume',
      'get_keyboard_layout',
      'get_synced_timestamp_ms',
      'scan_wifi_networks',
      'connect_wifi_network',
      'get_persisted_exam_session',
      'save_persisted_exam_session',
      'clear_persisted_exam_session',
      'exit_lockdown_app',
    ];

    var isAllowed =
      cmd.indexOf('plugin:') === 0 ||
      cmd.indexOf('exam:') === 0 ||
      cmd.indexOf('security:') === 0 ||
      cmd.indexOf('tauri:') === 0 ||
      allowedCommands.indexOf(cmd) !== -1;

    if (!isAllowed) {
      console.warn('[CodeSkill LockDown Isolation] Rejected unregistered IPC command invocation:', cmd);
      throw new Error('[CodeSkill LockDown Isolation] Unauthorized IPC command: ' + cmd);
    }
  }

  return payload;
};
