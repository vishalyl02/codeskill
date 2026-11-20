import {
  isLockdownClient,
  runPreflightChecks,
  getAttestationPublicKey,
  getAttestationInfo,
  setAttestedSessionId,
  syncServerTime,
  signLockdownRequest,
  enableKioskMode,
  engageOsKiosk,
  disableKioskMode,
  vaultUpsertAutosave,
  vaultReadAllAutosaves,
  vaultRemoveEntry,
  vaultPurgeAttempt,
  initializeLockdownAttestation,
  releaseLockdownKiosk,
  consumeLockdownLaunchToken,
  listenToLockdownViolation,
  listenToDeepLinkLaunch,
  getBatteryStatus,
  getSystemVolume,
  setSystemVolume,
  getKeyboardLayout,
  getSyncedTimestampMs,
  scanWifiNetworks,
  connectWifiNetwork,
  verifyQuitPassword,
  exitLockdownApp,
  logoutAndExitLockdown,
  listNonEssentialApps,
  closeNonEssentialApps,
  getLockdownDiagnosticLogs,
  setLockedAssessment,
  setClientAccommodations,
  signExamRequest,
  runRuntimeIntegrityCheck,
  inspectMediaHardware,
  computeSha256,
  runFullSystemDiagnostic,
  killBlockingApp,
  killAllBlockingApps,
} from './lockdown-bridge';
import { authStorage } from '@/lib/auth-storage';

describe('LockDown Desktop Bridge (frontend-v2)', () => {
  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__TAURI__;
  });

  describe('isLockdownClient', () => {
    it('returns false in a standard browser environment', () => {
      expect(isLockdownClient()).toBe(false);
    });

    it('returns true when __TAURI_INTERNALS__ is present', () => {
      (window as any).__TAURI_INTERNALS__ = { invoke: jest.fn() };
      expect(isLockdownClient()).toBe(true);
    });

    it('returns true when __TAURI__ global is present', () => {
      (window as any).__TAURI__ = { core: { invoke: jest.fn() } };
      expect(isLockdownClient()).toBe(true);
    });
  });

  describe('Tauri command wrappers', () => {
    let mockInvoke: jest.Mock;

    beforeEach(() => {
      mockInvoke = jest.fn();
      (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };
    });

    it('getAttestationPublicKey invokes get_attestation_public_key', async () => {
      mockInvoke.mockResolvedValue('-----BEGIN PUBLIC KEY-----\n...');
      const key = await getAttestationPublicKey();
      expect(mockInvoke).toHaveBeenCalledWith('get_attestation_public_key', {});
      expect(key).toContain('BEGIN PUBLIC KEY');
    });

    it('setAttestedSessionId invokes set_attested_session_id with sessionId', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await setAttestedSessionId('sess-xyz');
      expect(mockInvoke).toHaveBeenCalledWith('set_attested_session_id', {
        sessionId: 'sess-xyz',
        sessionHmacKey: null,
      });

      await setAttestedSessionId('sess-xyz', 'hmac-key-abc');
      expect(mockInvoke).toHaveBeenCalledWith('set_attested_session_id', {
        sessionId: 'sess-xyz',
        sessionHmacKey: 'hmac-key-abc',
      });
    });

    it('runPreflightChecks invokes run_preflight_checks', async () => {
      const mockResult = {
        passed: true,
        violations: [],
        monitor_count: 1,
        is_vm: false,
        forbidden_processes: [],
      };
      mockInvoke.mockResolvedValue(mockResult);

      const result = await runPreflightChecks();
      expect(mockInvoke).toHaveBeenCalledWith('run_preflight_checks', {});
      expect(result.passed).toBe(true);
    });

    it('signLockdownRequest invokes sign_api_request with method, path, body', async () => {
      const mockHeaders = {
        'X-CodeSkill-Session-Id': 'sess-123',
        'X-CodeSkill-Timestamp': '1700000000000',
        'X-CodeSkill-Nonce': 'nonce-abc',
        'X-CodeSkill-Signature': '3045...',
        'X-CodeSkill-Client': 'CodeSkill-LockDown/1.0.0',
      };
      mockInvoke.mockResolvedValue(mockHeaders);

      const headers = await signLockdownRequest('POST', '/api/test', '{"foo":"bar"}');
      expect(mockInvoke).toHaveBeenCalledWith('sign_api_request', {
        method: 'POST',
        path: '/api/test',
        body: '{"foo":"bar"}',
      });
      expect(headers['X-CodeSkill-Signature']).toBe('3045...');
    });

    it('enableKioskMode, engageOsKiosk, and disableKioskMode invoke correct commands', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await enableKioskMode();
      expect(mockInvoke).toHaveBeenCalledWith('enable_kiosk_mode', {});

      await engageOsKiosk();
      expect(mockInvoke).toHaveBeenCalledWith('engage_os_kiosk', {});

      await disableKioskMode();
      expect(mockInvoke).toHaveBeenCalledWith('disable_kiosk_mode', {});
    });

    it('syncServerTime invokes sync_server_time with serverTimeMs', async () => {
      mockInvoke.mockResolvedValue(150);
      const offset = await syncServerTime(1700000000000);
      expect(mockInvoke).toHaveBeenCalledWith('sync_server_time', {
        serverTimeMs: 1700000000000,
      });
      expect(offset).toBe(150);
    });

    it('vault commands invoke corresponding offline_vault Tauri handlers', async () => {
      mockInvoke.mockResolvedValue(undefined);

      await vaultUpsertAutosave('att-1', 'q-1', '{"answer":1}');
      expect(mockInvoke).toHaveBeenCalledWith('vault_upsert_autosave', {
        attemptId: 'att-1',
        entryKey: 'q-1',
        plaintextJson: '{"answer":1}',
      });

      mockInvoke.mockResolvedValue({ 'q-1': '{"answer":1}' });
      const all = await vaultReadAllAutosaves('att-1');
      expect(mockInvoke).toHaveBeenCalledWith('vault_read_all_autosaves', {
        attemptId: 'att-1',
      });
      expect(all['q-1']).toBe('{"answer":1}');

      mockInvoke.mockResolvedValue(undefined);
      await vaultRemoveEntry('att-1', 'q-1');
      expect(mockInvoke).toHaveBeenCalledWith('vault_remove_entry', {
        attemptId: 'att-1',
        entryKey: 'q-1',
      });

      await vaultPurgeAttempt('att-1');
      expect(mockInvoke).toHaveBeenCalledWith('vault_purge_attempt', {
        attemptId: 'att-1',
      });
    });

    it('system dock telemetry commands invoke corresponding handlers', async () => {
      mockInvoke.mockResolvedValueOnce({ percentage: 88, is_charging: true, has_battery: true });
      const battery = await getBatteryStatus();
      expect(battery.percentage).toBe(88);
      expect(mockInvoke).toHaveBeenCalledWith('get_battery_status', {});

      mockInvoke.mockResolvedValueOnce(75);
      const vol = await getSystemVolume();
      expect(vol).toBe(75);
      expect(mockInvoke).toHaveBeenCalledWith('get_system_volume', {});

      mockInvoke.mockResolvedValueOnce(undefined);
      await setSystemVolume(60);
      expect(mockInvoke).toHaveBeenCalledWith('set_system_volume', { level: 60 });

      mockInvoke.mockResolvedValueOnce('EN-US');
      const layout = await getKeyboardLayout();
      expect(layout).toBe('EN-US');
      expect(mockInvoke).toHaveBeenCalledWith('get_keyboard_layout', {});

      mockInvoke.mockResolvedValueOnce(1795090000000);
      const syncedMs = await getSyncedTimestampMs();
      expect(syncedMs).toBe(1795090000000);
      expect(mockInvoke).toHaveBeenCalledWith('get_synced_timestamp_ms', {});

      mockInvoke.mockResolvedValueOnce([
        { ssid: 'Campus-WiFi', signal_strength: 90, is_connected: true, is_secured: true },
      ]);
      const nets = await scanWifiNetworks();
      expect(nets).toHaveLength(1);
      expect(nets[0].ssid).toBe('Campus-WiFi');
      expect(mockInvoke).toHaveBeenCalledWith('scan_wifi_networks', {});

      mockInvoke.mockResolvedValueOnce(undefined);
      await connectWifiNetwork('BackupHotspot', 'pass123');
      expect(mockInvoke).toHaveBeenCalledWith('connect_wifi_network', {
        ssid: 'BackupHotspot',
        password: 'pass123',
      });
    });

    it('verifyQuitPassword posts to exam-security and returns authorization result', async () => {
      const mockApi = {
        post: jest.fn().mockResolvedValue({
          data: { success: true, data: { authorized: true } },
        }),
      };

      const res = await verifyQuitPassword(mockApi, 'asmt-1', 'proctor-pwd');
      expect(res.authorized).toBe(true);
      expect(mockApi.post).toHaveBeenCalledWith('exam-security/verify-quit-password', {
        assessmentId: 'asmt-1',
        password: 'proctor-pwd',
      });
    });

    it('initializeLockdownAttestation performs end-to-end attestation handshake', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'run_preflight_checks') {
          return Promise.resolve({
            passed: true,
            violations: [],
            monitor_count: 1,
            is_vm: false,
            forbidden_processes: [],
          });
        }
        if (cmd === 'get_attestation_public_key') {
          return Promise.resolve('-----BEGIN PUBLIC KEY-----\nKEY123');
        }
        if (cmd === 'set_attested_session_id') {
          return Promise.resolve(undefined);
        }
        if (cmd === 'enable_kiosk_mode' || cmd === 'engage_os_kiosk') {
          return Promise.resolve(undefined);
        }
        return Promise.resolve(null);
      });

      const mockApiClient = {
        post: jest.fn().mockResolvedValue({
          data: {
            success: true,
            data: { attestedSessionId: 'server-issued-session-456', sessionHmacKey: 'mock-hmac-key-123' },
          },
        }),
      };

      const result = await initializeLockdownAttestation(mockApiClient);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('server-issued-session-456');
      expect(mockApiClient.post).toHaveBeenCalledWith(
        'exam-security/attest-client',
        expect.objectContaining({
          publicKeyPem: '-----BEGIN PUBLIC KEY-----\nKEY123',
          clientVersion: '1.0.0',
          preflightPassed: true,
        }),
      );
      expect(mockInvoke).toHaveBeenCalledWith('set_attested_session_id', {
        sessionId: 'server-issued-session-456',
        sessionHmacKey: 'mock-hmac-key-123',
      });
      expect(mockInvoke).toHaveBeenCalledWith('engage_os_kiosk', {});
    });

    it('initializeLockdownAttestation aborts if preflight checks fail', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'run_preflight_checks') {
          return Promise.resolve({
            passed: false,
            violations: ['Multiple monitors detected (2 displays)'],
            monitor_count: 2,
            is_vm: false,
            forbidden_processes: [],
          });
        }
        return Promise.resolve(null);
      });

      const mockApiClient = { post: jest.fn() };
      const result = await initializeLockdownAttestation(mockApiClient);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Preflight checks failed');
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });

    it('initializeLockdownAttestation fails closed if native IPC bridge is missing', async () => {
      delete (window as any).__TAURI_INTERNALS__;
      delete (window as any).__TAURI__;
      (window as any).__CODESKILL_LOCKDOWN__ = true;

      const result = await initializeLockdownAttestation();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Native LockDown IPC bridge unavailable');
      delete (window as any).__CODESKILL_LOCKDOWN__;
    });

    it('initializeLockdownAttestation catches engageOsKiosk failure, releases kiosk, and surfaces error', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'run_preflight_checks') {
          return Promise.resolve({
            passed: true,
            violations: [],
            monitor_count: 1,
            is_vm: false,
            forbidden_processes: [],
          });
        }
        if (cmd === 'get_attestation_public_key') {
          return Promise.resolve('-----BEGIN PUBLIC KEY-----\nKEY123');
        }
        if (cmd === 'set_attested_session_id') return Promise.resolve(undefined);
        if (cmd === 'engage_os_kiosk') {
          return Promise.reject(new Error('Kiosk hook permission denied'));
        }
        if (cmd === 'release_os_kiosk') return Promise.resolve(undefined);
        return Promise.resolve(null);
      });

      const mockApiClient = {
        post: jest.fn().mockResolvedValue({
          data: {
            success: true,
            data: { attestedSessionId: 'test-session-kiosk-fail' },
          },
        }),
      };

      const result = await initializeLockdownAttestation(mockApiClient);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Kiosk hook permission denied');
      expect(mockInvoke).toHaveBeenCalledWith('release_os_kiosk', {});
    });

    it('initializeLockdownAttestation falls back to fetch with Authorization header when apiClient is omitted', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'run_preflight_checks') {
          return Promise.resolve({
            passed: true,
            violations: [],
            monitor_count: 1,
            is_vm: false,
            forbidden_processes: [],
          });
        }
        if (cmd === 'get_attestation_public_key') {
          return Promise.resolve('-----BEGIN PUBLIC KEY-----\nKEY123');
        }
        if (cmd === 'set_attested_session_id') {
          return Promise.resolve(undefined);
        }
        if (cmd === 'enable_kiosk_mode' || cmd === 'engage_os_kiosk') {
          return Promise.resolve(undefined);
        }
        return Promise.resolve(null);
      });

      window.sessionStorage.setItem('codeskill_token', 'test-auth-token-123');
      const originalFetch = global.fetch;
      const mockFetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, attestedSessionId: 'fetch-session-789' }),
      });
      global.fetch = mockFetch as any;

      try {
        const result = await initializeLockdownAttestation();
        expect(result.success).toBe(true);
        expect(result.sessionId).toBe('fetch-session-789');
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/exam-security/attest-client',
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer test-auth-token-123',
            }),
          }),
        );
      } finally {
        global.fetch = originalFetch;
        window.sessionStorage.removeItem('codeskill_token');
      }
    });

    it('forwards to backend with assessmentId when only VM violation is present', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'run_preflight_checks') {
          return Promise.resolve({
            passed: false,
            violations: ['Virtual Machine or Hypervisor environment detected.'],
            monitor_count: 1,
            is_vm: true,
            forbidden_processes: [],
          });
        }
        if (cmd === 'get_attestation_public_key') {
          return Promise.resolve('-----BEGIN PUBLIC KEY-----\nKEY123');
        }
        if (cmd === 'set_attested_session_id') return Promise.resolve(undefined);
        if (cmd === 'enable_kiosk_mode' || cmd === 'engage_os_kiosk') return Promise.resolve(undefined);
        return Promise.resolve(null);
      });

      const mockApiClient = {
        post: jest.fn().mockResolvedValue({
          data: {
            success: true,
            data: { attestedSessionId: 'vdi-attested-session', vdiOverride: true },
          },
        }),
      };

      const result = await initializeLockdownAttestation(mockApiClient, 'asmt-vdi-1');
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('vdi-attested-session');
      expect(mockApiClient.post).toHaveBeenCalledWith(
        'exam-security/attest-client',
        expect.objectContaining({
          assessmentId: 'asmt-vdi-1',
          violations: ['VIRTUAL_MACHINE_DETECTED'],
        }),
      );
    });

    it('releaseLockdownKiosk invokes release_os_kiosk command', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await releaseLockdownKiosk();
      expect(mockInvoke).toHaveBeenCalledWith('release_os_kiosk', {});
    });

    it('releaseLockdownKiosk is a no-op when outside Tauri', async () => {
      delete (window as any).__TAURI_INTERNALS__;
      delete (window as any).__TAURI__;
      await releaseLockdownKiosk();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('consumeLockdownLaunchToken extracts token from URL, stores it, strips it, and attest', async () => {
      window.history.pushState({}, '', '/assessments/asmt-abc/take?lockdownToken=jwt-secret-token-xyz');
      const replaceStateSpy = jest.spyOn(window.history, 'replaceState');
      const setTokenSpy = jest.spyOn(authStorage, 'setAccessToken').mockImplementation();

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'run_preflight_checks') {
          return Promise.resolve({
            passed: true,
            violations: [],
            monitor_count: 1,
            is_vm: false,
            forbidden_processes: [],
          });
        }
        if (cmd === 'get_attestation_public_key') {
          return Promise.resolve('-----BEGIN PUBLIC KEY-----\nKEY123');
        }
        if (cmd === 'set_attested_session_id') return Promise.resolve(undefined);
        if (cmd === 'enable_kiosk_mode' || cmd === 'engage_os_kiosk') return Promise.resolve(undefined);
        return Promise.resolve(null);
      });

      const mockApiClient = {
        post: jest.fn().mockResolvedValue({
          data: {
            success: true,
            data: { attestedSessionId: 'bootstrapped-session-id' },
          },
        }),
      };

      const res = await consumeLockdownLaunchToken(mockApiClient, 'asmt-abc');
      expect(res.success).toBe(true);
      expect(res.token).toBe('jwt-secret-token-xyz');
      expect(setTokenSpy).toHaveBeenCalledWith('jwt-secret-token-xyz');
      expect(replaceStateSpy).toHaveBeenCalledWith(
        window.history.state,
        '',
        '/assessments/asmt-abc/take',
      );
      expect(res.attestation?.sessionId).toBe('bootstrapped-session-id');

      replaceStateSpy.mockRestore();
      setTokenSpy.mockRestore();
    });

    it('listenToLockdownViolation registers listener on __TAURI__.event', async () => {
      const mockListen = jest.fn().mockResolvedValue(() => {});
      (window as any).__TAURI__ = {
        event: { listen: mockListen },
      };

      const callback = jest.fn();
      await listenToLockdownViolation(callback);
      expect(mockListen).toHaveBeenCalledWith('exam:environment-violation', expect.any(Function));
    });

    it('listenToDeepLinkLaunch registers listener on __TAURI__.event', async () => {
      const mockListen = jest.fn().mockResolvedValue(() => {});
      (window as any).__TAURI__ = {
        event: { listen: mockListen },
      };

      const callback = jest.fn();
      await listenToDeepLinkLaunch(callback);
      expect(mockListen).toHaveBeenCalledWith('exam:deep-link-launch', expect.any(Function));
    });

    it('initializeLockdownAttestation returns error message when fetch returns non-ok status', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'run_preflight_checks') {
          return Promise.resolve({
            passed: true,
            violations: [],
            monitor_count: 1,
            is_vm: false,
            forbidden_processes: [],
          });
        }
        if (cmd === 'get_attestation_public_key') {
          return Promise.resolve('-----BEGIN PUBLIC KEY-----\nKEY123');
        }
        return Promise.resolve(null);
      });

      const originalFetch = global.fetch;
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ statusCode: 403, message: 'Attestation rejected: unauthorized client version' }),
      });
      global.fetch = mockFetch as any;

      try {
        const result = await initializeLockdownAttestation();
        expect(result.success).toBe(false);
        expect(result.error).toBe('Attestation rejected: unauthorized client version');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('exitLockdownApp invokes exit_lockdown_app and releaseLockdownKiosk', async () => {
      await exitLockdownApp();
      expect(mockInvoke).toHaveBeenCalledWith('release_os_kiosk', {});
      expect(mockInvoke).toHaveBeenCalledWith('exit_lockdown_app', {});
    });

    it('logoutAndExitLockdown clears tokens, storage, and calls exit_lockdown_app', async () => {
      authStorage.setAccessToken('student-session-jwt');
      sessionStorage.setItem('codeskill_token', 'student-session-jwt');
      localStorage.setItem('codeskill_token', 'student-session-jwt');

      await logoutAndExitLockdown();

      expect(authStorage.getAccessToken()).toBeNull();
      expect(sessionStorage.getItem('codeskill_token')).toBeNull();
      expect(localStorage.getItem('codeskill_token')).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('exit_lockdown_app', {});
    });

    it('listNonEssentialApps invokes list_non_essential_apps', async () => {
      mockInvoke.mockResolvedValue([
        { pid: 1234, name: 'Discord', bundleId: 'com.hhammer.discord' },
      ]);
      const apps = await listNonEssentialApps();
      expect(mockInvoke).toHaveBeenCalledWith('list_non_essential_apps', {});
      expect(apps).toHaveLength(1);
      expect(apps[0].name).toBe('Discord');
    });

    it('closeNonEssentialApps invokes close_non_essential_apps with force flag', async () => {
      mockInvoke.mockResolvedValue([]);
      const remaining = await closeNonEssentialApps(true);
      expect(mockInvoke).toHaveBeenCalledWith('close_non_essential_apps', { force: true });
      expect(remaining).toEqual([]);
    });

    it('getLockdownDiagnosticLogs invokes get_lockdown_diagnostic_logs', async () => {
      mockInvoke.mockResolvedValue([
        { timestamp: '2026-11-19T10:00:00Z', level: 'INFO', category: 'SYSTEM', message: 'Ready' },
      ]);
      const logs = await getLockdownDiagnosticLogs();
      expect(mockInvoke).toHaveBeenCalledWith('get_lockdown_diagnostic_logs', {});
      expect(logs).toHaveLength(1);
      expect(logs[0].category).toBe('SYSTEM');
    });

    it('setLockedAssessment invokes set_locked_assessment with assessmentId and allowedUrls', async () => {
      mockInvoke.mockResolvedValue(undefined);
      await setLockedAssessment('exam-uuid', ['docs.python.org']);
      expect(mockInvoke).toHaveBeenCalledWith('set_locked_assessment', {
        assessmentId: 'exam-uuid',
        allowedUrls: ['docs.python.org'],
      });
    });

    it('setClientAccommodations invokes set_client_accommodations with boolean flags', async () => {
      mockInvoke.mockResolvedValue(true);
      const res = await setClientAccommodations(true, false);
      expect(mockInvoke).toHaveBeenCalledWith('set_client_accommodations', {
        allowSecondaryDisplay: true,
        allowAccessibilitySpeech: false,
      });
      expect(res).toBe(true);
    });

    it('getAttestationInfo invokes get_attestation_info and returns attestation tier and binary hash', async () => {
      mockInvoke.mockResolvedValue({
        public_key_pem: '-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----',
        attestation_tier: 'hardware_tpm_enclave',
        kiosk_mode: 'macos_cocoa_kiosk',
        client_binary_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });

      const info = await getAttestationInfo();
      expect(mockInvoke).toHaveBeenCalledWith('get_attestation_info', {});
      expect(info.attestation_tier).toBe('hardware_tpm_enclave');
      expect(info.kiosk_mode).toBe('macos_cocoa_kiosk');
      expect(info.client_binary_hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('signExamRequest invokes sign_exam_request and returns 5 headers', async () => {
      mockInvoke.mockResolvedValue({
        'X-Lockdown-Session-Id': 'session-xyz',
        'X-Lockdown-Timestamp': '1700000000000',
        'X-Lockdown-Nonce': 'nonce-123-uuid',
        'X-Lockdown-Binary-Hash': 'binary-hash-sha256',
        'X-Lockdown-Signature': 'signature-hmac-sha256',
      });

      const headers = await signExamRequest('POST', '/api/assessments/submit', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      expect(mockInvoke).toHaveBeenCalledWith('sign_exam_request', {
        method: 'POST',
        path: '/api/assessments/submit',
        bodySha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });
      expect(headers['X-Lockdown-Session-Id']).toBe('session-xyz');
      expect(headers['X-Lockdown-Signature']).toBe('signature-hmac-sha256');
    });

    it('runRuntimeIntegrityCheck invokes run_runtime_integrity_check', async () => {
      mockInvoke.mockResolvedValue({
        passed: true,
        debugger_attached: false,
        injection_detected: false,
        violations: [],
      });

      const report = await runRuntimeIntegrityCheck();
      expect(mockInvoke).toHaveBeenCalledWith('run_runtime_integrity_check', {});
      expect(report.passed).toBe(true);
      expect(report.debugger_attached).toBe(false);
    });

    it('inspectMediaHardware invokes inspect_media_hardware', async () => {
      mockInvoke.mockResolvedValue({
        passed: true,
        virtual_camera_detected: false,
        virtual_mic_detected: false,
        devices: [
          {
            name: 'FaceTime HD Camera',
            device_type: 'video',
            is_virtual: false,
            driver_info: 'Apple built-in',
          },
        ],
        violations: [],
      });

      const audit = await inspectMediaHardware();
      expect(mockInvoke).toHaveBeenCalledWith('inspect_media_hardware', {});
      expect(audit.passed).toBe(true);
      expect(audit.devices).toHaveLength(1);
    });

    it('computeSha256 computes expected SHA-256 hex digest for empty string and payload', async () => {
      const emptyHash = await computeSha256('');
      expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

      const textHash = await computeSha256('hello world');
      expect(textHash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });

    it('runFullSystemDiagnostic invokes run_full_system_diagnostic in Tauri environment', async () => {
      mockInvoke.mockResolvedValue({
        osName: 'macOS',
        osVersion: '15.1.0',
        architecture: 'aarch64',
        monitorCount: 1,
        isVm: false,
        kioskReadiness: true,
        overallReadiness: true,
        readinessScore: 95,
        virtualCameraDetected: false,
        virtualMicDetected: false,
        displays: {
          monitorCount: 1,
          primaryResolution: '2560x1440',
          externalDisplaysDetected: false,
        },
        backgroundApps: [],
        recommendations: [],
      });

      const diag = await runFullSystemDiagnostic();
      expect(mockInvoke).toHaveBeenCalledWith('run_full_system_diagnostic', {});
      expect(diag.osName).toBe('macOS');
      expect(diag.monitorCount).toBe(1);
      expect(diag.overallReadiness).toBe(true);
      expect(diag.readinessScore).toBe(95);
    });

    it('killBlockingApp invokes kill_blocking_app with pid and force', async () => {
      mockInvoke.mockResolvedValue(true);
      const res = await killBlockingApp(12345, true);
      expect(mockInvoke).toHaveBeenCalledWith('kill_blocking_app', { pid: 12345, force: true });
      expect(res).toBe(true);
    });

    it('killAllBlockingApps invokes kill_all_blocking_apps with force', async () => {
      mockInvoke.mockResolvedValue([
        { name: 'Discord', pid: 1234, category: 'COMMUNICATION', bundleOrPath: '/Applications/Discord.app' },
      ]);
      const res = await killAllBlockingApps(true);
      expect(mockInvoke).toHaveBeenCalledWith('kill_all_blocking_apps', { force: true });
      expect(res).toHaveLength(1);
      expect(res[0].name).toBe('Discord');
    });
  });

  describe('runFullSystemDiagnostic browser fallback', () => {
    it('returns mock diagnostic report when not running inside Tauri', async () => {
      delete (window as any).__TAURI_INTERNALS__;
      delete (window as any).__TAURI__;

      const diag = await runFullSystemDiagnostic();
      expect(diag.overallReadiness).toBe(true);
      expect(diag.readinessScore).toBe(100);
      expect(diag.displays.monitorCount).toBe(1);
    });
  });
});
