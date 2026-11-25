import { authStorage } from '@/lib/auth-storage';

export interface PreflightResult {
  passed: boolean;
  violations: string[];
  monitor_count: number;
  is_vm: boolean;
  forbidden_processes: string[];
  vm_indicators?: string[];
}

export interface DisplayTopology {
  monitorCount: number;
  externalDisplaysDetected: boolean;
  primaryResolution: string;
}

export interface AttestationInfo {
  public_key_pem: string;
  attestation_tier: string;
  kiosk_mode: string;
  client_binary_hash: string;
  session_hmac_key?: string;
}

export interface BatteryInfo {
  percentage: number;
  is_charging: boolean;
  has_battery: boolean;
}

export interface WifiNetworkInfo {
  ssid: string;
  signal_strength: number;
  is_connected: boolean;
  is_secured: boolean;
}

export interface RunningUserApp {
  pid: number;
  name: string;
  bundleId?: string;
  isTerminated?: boolean;
}

export interface DiagnosticLogEntry {
  timestamp: string;
  level: string;
  category: string;
  message: string;
}

export interface LockdownSignedHeaders {
  'X-CodeSkill-Session-Id': string;
  'X-CodeSkill-Timestamp': string;
  'X-CodeSkill-Nonce': string;
  'X-CodeSkill-Signature': string;
  'X-CodeSkill-Client': string;
}

export interface SignedRequestHeaders {
  'X-Lockdown-Session-Id': string;
  'X-Lockdown-Timestamp': string;
  'X-Lockdown-Nonce': string;
  'X-Lockdown-Binary-Hash': string;
  'X-Lockdown-Signature': string;
}

export interface RuntimeIntegrityReport {
  passed: boolean;
  debuggerPresent: boolean;
  injectionDetected: boolean;
  violations: string[];
}

export interface MediaDeviceDescriptor {
  name: string;
  deviceType: 'camera' | 'microphone';
  isVirtual: boolean;
  modelId?: string;
  manufacturer?: string;
  transportType?: string;
}

export interface MediaHardwareAudit {
  passed: boolean;
  devices: MediaDeviceDescriptor[];
  virtualDevicesDetected: string[];
}

export interface MediaPermissionStatus {
  camera: 'granted' | 'denied' | 'not_determined';
  microphone: 'granted' | 'denied' | 'not_determined';
  ready: boolean;
}

export interface BlockingAppInfo {
  pid: number;
  name: string;
  category: 'forbidden' | 'non_essential';
  bundleOrPath: string;
  canForceKill: boolean;
}

export interface PersistedExamSession {
  assessmentId?: string;
  candidateId?: string;
  authToken?: string;
  attestationToken?: string;
  kioskActive: boolean;
  kioskMode?: string;
  faceVerified: boolean;
  mediaPermissionsVerified: boolean;
  isSubmitted: boolean;
  submittedAtMs?: number;
  submissionReceiptId?: string;
  updatedAtMs: number;
}

export type PersistedExamSessionPatch = Partial<Omit<PersistedExamSession, 'updatedAtMs'>>;

export interface PermissionChecklistItem {
  id: string;
  name: string;
  description: string;
  status: 'granted' | 'needs_action' | 'denied';
  required: boolean;
  actionType: 'request' | 'open_settings' | 'shell_command' | 'info';
  actionPayload?: string;
  settingsTarget?: string;
}

export interface StartupPermissionChecklistState {
  platform: 'macos' | 'windows' | 'linux';
  onboardingCompleted: boolean;
  allRequiredGranted: boolean;
  items: PermissionChecklistItem[];
  verifiedAtMs: number;
  clientVersion: string;
  pendingExamUrl?: string | null;
  reinstallDetected?: boolean;
}

export interface PermissionsSetupPersistedState {
  onboardingCompleted: boolean;
  verifiedAtMs: number;
  clientVersion: string;
  platform: string;
  portalRestoreToken?: string | null;
  permissions: Record<string, string>;
}

export interface CompleteOnboardingResult {
  success: boolean;
  targetUrl?: string | null;
}

/**
 * Checks if the current browser execution context is inside the CodeSkill LockDown desktop client.
 */
export function isLockdownClient(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as any;
  const userAgent = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
  return Boolean(
    win.isTauri ||
    'isTauri' in win ||
    '__TAURI_INTERNALS__' in win ||
    '__TAURI__' in win ||
    win.__TAURI_INTERNALS__ ||
    win.__TAURI__ ||
    win.__CODESKILL_LOCKDOWN__ ||
    userAgent.includes('CodeSkillLockDown')
  );
}

/**
 * Helper to safely invoke Tauri commands from the webview runtime.
 */
export async function tauriInvoke<T>(cmd: string, args: Record<string, any> = {}): Promise<T> {
  if (typeof window === 'undefined') {
    throw new Error('Tauri commands cannot be invoked in server environments');
  }

  const win = window as any;
  console.log('[LockDown Bridge] Invoking command:', cmd, args);

  // 1. Direct Tauri v2 internals
  if (win.__TAURI_INTERNALS__ && typeof win.__TAURI_INTERNALS__.invoke === 'function') {
    return win.__TAURI_INTERNALS__.invoke(cmd, args);
  }

  // 2. Tauri v2 global namespace
  if (win.__TAURI__?.core && typeof win.__TAURI__.core.invoke === 'function') {
    return win.__TAURI__.core.invoke(cmd, args);
  }

  // 3. Fallback for Tauri v1 or legacy global invoke
  if (win.__TAURI__ && typeof win.__TAURI__.invoke === 'function') {
    return win.__TAURI__.invoke(cmd, args);
  }

  // 4. Optional dynamic module import without tsc build-time binding
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const tauriCore = await dynamicImport('@tauri-apps/api/core');
    if (tauriCore && typeof tauriCore.invoke === 'function') {
      return (tauriCore.invoke as (command: string, payload?: Record<string, any>) => Promise<T>)(cmd, args);
    }
  } catch {
    // Dynamic import unavailable
  }

  throw new Error(`CodeSkill LockDown Tauri runtime is not available for command: ${cmd}`);
}

/**
 * Invokes a Tauri command with an explicit timeout to prevent hanging UI promises.
 */
export async function tauriInvokeWithTimeout<T>(
  cmd: string,
  args: Record<string, any> = {},
  timeoutMs = 2500,
): Promise<T> {
  let timer: NodeJS.Timeout | number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Tauri IPC command '${cmd}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([tauriInvoke<T>(cmd, args), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Detects the client operating system from the browser/webview environment.
 */
export function detectClientPlatform(): 'macos' | 'windows' | 'linux' {
  if (typeof navigator === 'undefined') return 'macos';
  const ua = (navigator.userAgent || '').toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();
  if (ua.includes('mac') || platform.includes('mac')) return 'macos';
  if (ua.includes('win') || platform.includes('win')) return 'windows';
  if (ua.includes('linux') || platform.includes('linux')) return 'linux';
  return 'macos';
}

/**
 * Constructs a deterministic fallback checklist state for the detected OS if IPC is unreachable or delayed.
 */
export function getDefaultStartupPermissionChecklist(
  platform?: 'macos' | 'windows' | 'linux',
): StartupPermissionChecklistState {
  const os = platform || detectClientPlatform();
  if (os === 'macos') {
    return {
      platform: 'macos',
      onboardingCompleted: false,
      allRequiredGranted: false,
      items: [
        {
          id: 'camera',
          name: 'Camera Access',
          description: 'Allows video proctoring and candidate identity verification during exams.',
          status: 'needs_action',
          required: true,
          actionType: 'open_settings',
          settingsTarget: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
        },
        {
          id: 'microphone',
          name: 'Microphone Access',
          description: 'Allows audio environment proctoring and ambient noise monitoring.',
          status: 'needs_action',
          required: true,
          actionType: 'open_settings',
          settingsTarget: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
        },
        {
          id: 'accessibility',
          name: 'Accessibility & Kiosk Guard',
          description: 'Enables hardware-level keyboard protection to block OS switcher escapes (Cmd+Tab, Spotlight, Mission Control).',
          status: 'needs_action',
          required: true,
          actionType: 'open_settings',
          settingsTarget: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
        },
        {
          id: 'screen_capture',
          name: 'Screen Recording & Display Integrity',
          description: 'Permits LockDown to inspect screen capture state and block unauthorized mirroring, broadcast, or stealth overlays.',
          status: 'needs_action',
          required: true,
          actionType: 'open_settings',
          settingsTarget: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
        },
      ],
      verifiedAtMs: Date.now(),
      clientVersion: '1.0.0',
      pendingExamUrl: null,
    };
  }

  if (os === 'windows') {
    return {
      platform: 'windows',
      onboardingCompleted: false,
      allRequiredGranted: false,
      items: [
        {
          id: 'camera',
          name: 'Webcam Access',
          description: 'Allows video monitoring and identity verification during exams.',
          status: 'needs_action',
          required: true,
          actionType: 'open_settings',
          settingsTarget: 'ms-settings:privacy-webcam',
        },
        {
          id: 'microphone',
          name: 'Microphone Access',
          description: 'Allows audio environment monitoring during exams.',
          status: 'needs_action',
          required: true,
          actionType: 'open_settings',
          settingsTarget: 'ms-settings:privacy-microphone',
        },
        {
          id: 'kiosk_desktop',
          name: 'WebView2 Runtime & Kiosk Desktop',
          description: 'Verifies Microsoft Edge WebView2 and secure desktop switching readiness without remote session conflicts.',
          status: 'needs_action',
          required: true,
          actionType: 'open_settings',
          settingsTarget: 'ms-settings:appsfeatures',
        },
        {
          id: 'display_integrity',
          name: 'Single Display & Capture Integrity',
          description: 'Verifies single-monitor configuration and window capture protection.',
          status: 'needs_action',
          required: true,
          actionType: 'open_settings',
          settingsTarget: 'ms-settings:display',
        },
      ],
      verifiedAtMs: Date.now(),
      clientVersion: '1.0.0',
      pendingExamUrl: null,
    };
  }

  return {
    platform: 'linux',
    onboardingCompleted: false,
    allRequiredGranted: false,
    items: [
      {
        id: 'camera',
        name: 'Camera & V4L2 Device Access',
        description: 'Grants video capture device permissions for exam proctoring.',
        status: 'needs_action',
        required: true,
        actionType: 'open_settings',
        actionPayload: 'sudo usermod -aG video $USER',
        settingsTarget: 'gnome-control-center privacy',
      },
      {
        id: 'microphone',
        name: 'Microphone & Sound Server Access',
        description: 'Grants PipeWire/PulseAudio capture access for exam proctoring.',
        status: 'needs_action',
        required: true,
        actionType: 'open_settings',
        actionPayload: 'sudo usermod -aG audio $USER',
        settingsTarget: 'gnome-control-center sound',
      },
      {
        id: 'kiosk_compositor',
        name: 'Display Server & Kiosk Compositor',
        description: 'Ensures Wayland session with Cage kiosk compositor is configured for exam lockdown.',
        status: 'needs_action',
        required: true,
        actionType: 'info',
        actionPayload: 'sudo apt install cage',
      },
      {
        id: 'portal_session',
        name: 'XDG Desktop Portal Persistence',
        description: 'Ensures persistent desktop portal session so permissions survive across app restarts.',
        status: 'needs_action',
        required: true,
        actionType: 'info',
        actionPayload: 'systemctl --user start xdg-desktop-portal',
      },
    ],
    verifiedAtMs: Date.now(),
    clientVersion: '1.0.0',
    pendingExamUrl: null,
  };
}

/**
 * Retrieves the ephemeral ECDSA P-256 public key generated by LockDown.
 */
export async function getAttestationPublicKey(): Promise<string> {
  return tauriInvoke<string>('get_attestation_public_key');
}

/**
 * Retrieves the hardware/software attestation info (keys, tier, binary hash, kiosk mode).
 */
export async function getAttestationInfo(): Promise<AttestationInfo> {
  if (!isLockdownClient()) {
    return {
      public_key_pem: '',
      attestation_tier: 'software_binary_bound',
      kiosk_mode: 'web_fallback',
      client_binary_hash: '',
    };
  }
  try {
    const res = await tauriInvoke<AttestationInfo>('get_attestation_info');
    if (res && typeof res.public_key_pem === 'string' && res.public_key_pem.length > 0) {
      return res;
    }
  } catch {
    // ignore
  }
  const pem = await getAttestationPublicKey().catch(() => '');
  return {
    public_key_pem: pem,
    attestation_tier: 'software_binary_bound',
    kiosk_mode: 'standard',
    client_binary_hash: '',
  };
}

/**
 * Registers the server-issued attested session ID and optional HMAC key inside LockDown state.
 */
export async function setAttestedSessionId(
  sessionId: string,
  sessionHmacKey?: string,
): Promise<void> {
  return tauriInvoke<void>('set_attested_session_id', {
    sessionId,
    sessionHmacKey: sessionHmacKey || null,
  });
}

/**
 * Runs client preflight checks (multiple monitors, VM/hypervisor, unauthorized processes).
 */
export async function runPreflightChecks(): Promise<PreflightResult> {
  return tauriInvoke<PreflightResult>('run_preflight_checks');
}

/**
 * Retrieves client display topology (connected monitors, external displays, primary resolution).
 */
export async function getDisplayTopology(): Promise<DisplayTopology> {
  if (!isLockdownClient()) {
    return {
      monitorCount: 1,
      externalDisplaysDetected: false,
      primaryResolution: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : '1920x1080',
    };
  }
  return tauriInvoke<DisplayTopology>('get_display_topology');
}

/**
 * Engages full OS-level kiosk lockouts (Windows hook, macOS presentation options, Linux XGrab).
 */
export async function enableKioskMode(): Promise<void> {
  return tauriInvoke<void>('enable_kiosk_mode');
}

/**
 * Alias for enableKioskMode to explicitly engage OS kiosk lockdown and wipe clipboard.
 */
export async function engageOsKiosk(): Promise<void> {
  return tauriInvoke<void>('engage_os_kiosk');
}

/**
 * Disengages OS-level kiosk lockouts.
 */
export async function disableKioskMode(): Promise<void> {
  return tauriInvoke<void>('disable_kiosk_mode');
}

/**
 * Synchronizes client timestamp offset against the authoritative server time.
 */
export async function syncServerTime(serverTimeMs: number): Promise<number> {
  return tauriInvoke<number>('sync_server_time', { serverTimeMs });
}

/**
 * Persists an encrypted autosave entry in the Rust AES-256-GCM vault.
 */
export async function vaultUpsertAutosave(
  attemptId: string,
  entryKey: string,
  plaintextJson: string,
): Promise<void> {
  return tauriInvoke<void>('vault_upsert_autosave', {
    attemptId,
    entryKey,
    plaintextJson,
  });
}

/**
 * Decrypts and reads all stored offline autosave entries for an attempt.
 */
export async function vaultReadAllAutosaves(
  attemptId: string,
): Promise<Record<string, string>> {
  return tauriInvoke<Record<string, string>>('vault_read_all_autosaves', {
    attemptId,
  });
}

/**
 * Removes a synced autosave entry from the encrypted vault.
 */
export async function vaultRemoveEntry(
  attemptId: string,
  entryKey: string,
): Promise<void> {
  return tauriInvoke<void>('vault_remove_entry', {
    attemptId,
    entryKey,
  });
}

/**
 * Overwrites the vault file with zeros and unlinks it upon final exam submission.
 */
export async function vaultPurgeAttempt(attemptId: string): Promise<void> {
  return tauriInvoke<void>('vault_purge_attempt', {
    attemptId,
  });
}

/**
 * Releases OS-level kiosk restrictions (fullscreen, always-on-top, low-level OS hooks).
 * No-op when executed outside the LockDown client.
 */
export async function releaseLockdownKiosk(): Promise<void> {
  if (!isLockdownClient()) {
    return;
  }
  try {
    await tauriInvoke<void>('release_os_kiosk');
  } catch (err) {
    console.warn('Could not release OS kiosk mode:', err);
  }
}

/**
 * Retrieves current battery information from native OS APIs.
 */
export async function getBatteryStatus(): Promise<BatteryInfo> {
  if (!isLockdownClient()) {
    return { percentage: 100, is_charging: true, has_battery: false };
  }
  return tauriInvoke<BatteryInfo>('get_battery_status');
}

/**
 * Retrieves current master output volume (0-100).
 */
export async function getSystemVolume(): Promise<number> {
  if (!isLockdownClient()) {
    return 50;
  }
  return tauriInvoke<number>('get_system_volume');
}

/**
 * Sets master output volume (0-100).
 */
export async function setSystemVolume(level: number): Promise<void> {
  if (!isLockdownClient()) {
    return;
  }
  return tauriInvoke<void>('set_system_volume', { level: Math.round(level) });
}

/**
 * Retrieves the active OS keyboard layout label (e.g. "EN-US", "EN-IN").
 */
export async function getKeyboardLayout(): Promise<string> {
  if (!isLockdownClient()) {
    return 'EN-US';
  }
  return tauriInvoke<string>('get_keyboard_layout');
}

/**
 * Retrieves local clock timestamp adjusted by server time offset.
 */
export async function getSyncedTimestampMs(): Promise<number> {
  if (!isLockdownClient()) {
    return Date.now();
  }
  return tauriInvoke<number>('get_synced_timestamp_ms');
}

/**
 * Scans available Wi-Fi networks via native OS CLI/APIs without opening settings.
 */
export async function scanWifiNetworks(): Promise<WifiNetworkInfo[]> {
  if (!isLockdownClient()) {
    return [];
  }
  return tauriInvoke<WifiNetworkInfo[]>('scan_wifi_networks');
}

/**
 * Connects to a chosen Wi-Fi network with optional WPA/WPA2/WPA3 password.
 */
export async function connectWifiNetwork(ssid: string, password?: string): Promise<void> {
  if (!isLockdownClient()) {
    return;
  }
  return tauriInvoke<void>('connect_wifi_network', { ssid, password: password || null });
}

/**
 * Verifies the proctor quit password with backend-nestjs.
 */
export async function verifyQuitPassword(
  apiClient: any,
  assessmentId: string,
  password?: string,
): Promise<{ authorized: boolean }> {
  if (apiClient && typeof apiClient.post === 'function') {
    const res = await apiClient.post('exam-security/verify-quit-password', {
      assessmentId,
      password,
    });
    return res.data?.data || res.data;
  }

  const token =
    typeof window !== 'undefined'
      ? authStorage.getAccessToken() || window.sessionStorage?.getItem('codeskill_token')
      : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch('/api/exam-security/verify-quit-password', {
    method: 'POST',
    headers,
    body: JSON.stringify({ assessmentId, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || 'Invalid proctor quit password');
  }
  const data = await res.json();
  return data?.data || data;
}

/**
 * Subscribes to live environment violations emitted by the LockDown desktop application.
 */
export async function listenToLockdownViolation(
  callback: (event: { violation_type: string; message: string; timestamp: number }) => void,
): Promise<() => void> {
  if (!isLockdownClient()) {
    return () => {};
  }
  const win = window as any;

  if (win.__TAURI__?.event && typeof win.__TAURI__.event.listen === 'function') {
    return win.__TAURI__.event.listen('exam:environment-violation', (e: any) => {
      callback(e.payload);
    });
  }

  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const tauriEvent = await dynamicImport('@tauri-apps/api/event');
    if (tauriEvent && typeof tauriEvent.listen === 'function') {
      return tauriEvent.listen('exam:environment-violation', (e: any) => {
        callback(e.payload);
      });
    }
  } catch {
    // Dynamic import unavailable
  }

  return () => {};
}

/**
 * Subscribes to warm deep link launches emitted by the LockDown desktop application.
 */
export async function listenToDeepLinkLaunch(
  callback: (payload: { examId: string; token?: string | null }) => void,
): Promise<() => void> {
  if (!isLockdownClient()) {
    return () => {};
  }
  const win = window as any;

  if (win.__TAURI__?.event && typeof win.__TAURI__.event.listen === 'function') {
    return win.__TAURI__.event.listen('exam:deep-link-launch', (e: any) => {
      callback(e.payload);
    });
  }

  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const tauriEvent = await dynamicImport('@tauri-apps/api/event');
    if (tauriEvent && typeof tauriEvent.listen === 'function') {
      return tauriEvent.listen('exam:deep-link-launch', (e: any) => {
        callback(e.payload);
      });
    }
  } catch {
    // Dynamic import unavailable
  }

  return () => {};
}

/**
 * Cryptographically signs an outbound API request using LockDown's ephemeral ECDSA key.
 */
export async function signLockdownRequest(
  method: string,
  path: string,
  body: string = '',
): Promise<LockdownSignedHeaders> {
  const raw = await tauriInvoke<any>('sign_api_request', {
    method,
    path,
    body,
  });
  return {
    'X-CodeSkill-Session-Id': raw?.['X-CodeSkill-Session-Id'] || raw?.session_id || raw?.sessionId || '',
    'X-CodeSkill-Timestamp': raw?.['X-CodeSkill-Timestamp'] || raw?.timestamp || '',
    'X-CodeSkill-Nonce': raw?.['X-CodeSkill-Nonce'] || raw?.nonce || '',
    'X-CodeSkill-Signature': raw?.['X-CodeSkill-Signature'] || raw?.signature || '',
    'X-CodeSkill-Client': raw?.['X-CodeSkill-Client'] || raw?.client || 'CodeSkill-LockDown/1.0.0',
  };
}

/**
 * Computes hexadecimal SHA-256 hash of a string using Web Crypto API.
 */
export async function computeSha256(text: string): Promise<string> {
  const subtle =
    (typeof window !== 'undefined' && window.crypto?.subtle) ||
    (typeof globalThis !== 'undefined' && (globalThis as any).crypto?.subtle);

  if (subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback for Node / Jest runtime environments
  try {
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha256').update(text).digest('hex');
  } catch {
    return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  }
}

/**
 * Signs an outbound assessment request using LockDown's continuous hardware-bound session HMAC key.
 */
export async function signExamRequest(
  method: string,
  path: string,
  bodySha256: string,
): Promise<SignedRequestHeaders> {
  const raw = await tauriInvoke<any>('sign_exam_request', {
    method,
    path,
    bodySha256,
  });
  return {
    'X-Lockdown-Session-Id': raw['X-Lockdown-Session-Id'] || raw.session_id || raw.sessionId || '',
    'X-Lockdown-Timestamp': raw['X-Lockdown-Timestamp'] || raw.timestamp || '',
    'X-Lockdown-Nonce': raw['X-Lockdown-Nonce'] || raw.nonce || '',
    'X-Lockdown-Binary-Hash': raw['X-Lockdown-Binary-Hash'] || raw.binary_hash || raw.binaryHash || '',
    'X-Lockdown-Signature': raw['X-Lockdown-Signature'] || raw.signature || '',
  };
}

/**
 * Performs local anti-debugging and dynamic library injection audits.
 */
export async function runRuntimeIntegrityCheck(): Promise<RuntimeIntegrityReport> {
  if (!isLockdownClient()) {
    return {
      passed: true,
      debuggerPresent: false,
      injectionDetected: false,
      violations: [],
    };
  }
  return tauriInvoke<RuntimeIntegrityReport>('run_runtime_integrity_check');
}

/**
 * Inspects physical vs virtual camera and audio drivers.
 */
export async function inspectMediaHardware(): Promise<MediaHardwareAudit> {
  if (!isLockdownClient()) {
    return {
      passed: true,
      devices: [],
      virtualDevicesDetected: [],
    };
  }
  return tauriInvoke<MediaHardwareAudit>('inspect_media_hardware');
}

/**
 * Initializes client attestation by performing preflight checks, submitting public key
 * to backend-nestjs, and storing the issued session ID.
 */
export async function initializeLockdownAttestation(
  apiClient?: any,
  assessmentId?: string,
  autoEngageKiosk = true,
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  if (!isLockdownClient()) {
    return { success: false, error: 'Not running inside CodeSkill LockDown' };
  }

  if (typeof window === 'undefined' || !Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)) {
    return { success: false, error: 'Native LockDown IPC bridge unavailable' };
  }

  try {
    // 1. Run local security checks
    const preflight = await runPreflightChecks();

    const normalizedViolations = (preflight.violations || []).map((v) => {
      if (v.toLowerCase().includes('virtual machine') || v.toLowerCase().includes('hypervisor')) {
        return 'VIRTUAL_MACHINE_DETECTED';
      }
      return v;
    });

    const isOnlyVm =
      normalizedViolations.length > 0 &&
      normalizedViolations.every((v) => v === 'VIRTUAL_MACHINE_DETECTED');

    // If preflight failed, but only VM was detected and an assessmentId was provided,
    // we still forward to backend so university VDI virtual-machine overrides can be applied.
    if (!preflight.passed && !(isOnlyVm && assessmentId)) {
      return {
        success: false,
        error: `Preflight checks failed: ${preflight.violations.join('; ')}`,
      };
    }

    // 2. Obtain LockDown's attestation info (keys, tier, binary hash, kiosk mode)
    const attestationInfo = await getAttestationInfo();
    const publicKeyPem = attestationInfo.public_key_pem || (await getAttestationPublicKey());

    // 3. Determine host OS name
    const platform = typeof navigator !== 'undefined' ? (navigator.platform || navigator.userAgent) : 'unknown';
    const os = /Mac/i.test(platform)
      ? 'macos'
      : /Win/i.test(platform)
      ? 'windows'
      : /Linux/i.test(platform)
      ? 'linux'
      : 'unknown';

    // 4. Send attestation request to backend
    const payload: Record<string, any> = {
      publicKeyPem,
      clientVersion: '1.0.0',
      os,
      preflightPassed: preflight.passed,
      violations: normalizedViolations,
      attestationTier: attestationInfo.attestation_tier,
      kioskMode: attestationInfo.kiosk_mode,
      clientBinaryHash: attestationInfo.client_binary_hash,
    };
    if (attestationInfo.session_hmac_key) {
      payload.sessionHmacKey = attestationInfo.session_hmac_key;
    }
    if (assessmentId) {
      payload.assessmentId = assessmentId;
    }

    let attestedSessionId: string | undefined;
    let serverTime: number | undefined;
    let returnedHmacKey: string | undefined;

    if (apiClient && typeof apiClient.post === 'function') {
      const res = await apiClient.post('exam-security/attest-client', payload);
      attestedSessionId = res.data?.data?.attestedSessionId || res.data?.attestedSessionId;
      serverTime = res.data?.data?.serverTime || res.data?.serverTime;
      returnedHmacKey = res.data?.data?.sessionHmacKey || res.data?.sessionHmacKey;
    } else {
      const token =
        typeof window !== 'undefined'
          ? authStorage.getAccessToken() || window.sessionStorage?.getItem('codeskill_token')
          : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/exam-security/attest-client', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok === false || (res.status && res.status >= 400)) {
        return {
          success: false,
          error: data?.message || `Attestation request failed with status ${res.status}`,
        };
      }
      attestedSessionId = data?.data?.attestedSessionId || data?.attestedSessionId;
      serverTime = data?.data?.serverTime || data?.serverTime;
      returnedHmacKey = data?.data?.sessionHmacKey || data?.sessionHmacKey;
    }

    if (!attestedSessionId) {
      return { success: false, error: 'Backend did not return an attestedSessionId' };
    }

    // 5. Store attested session ID and session HMAC key in LockDown state
    const effectiveHmacKey = returnedHmacKey || attestationInfo.session_hmac_key;
    await setAttestedSessionId(attestedSessionId, effectiveHmacKey);

    // 6. Synchronize authoritative server time offset if provided
    if (serverTime) {
      try {
        await syncServerTime(Number(serverTime));
      } catch (syncErr) {
        console.warn('Could not sync server time offset:', syncErr);
      }
    }

    // 7. Engage OS-level kiosk lockdowns after attestation and time sync succeed (if requested)
    if (autoEngageKiosk) {
      try {
        await engageOsKiosk();
      } catch (kioskErr: any) {
        await releaseLockdownKiosk();
        return {
          success: false,
          error: kioskErr?.message || 'Failed to engage OS kiosk mode',
        };
      }
    }

    return { success: true, sessionId: attestedSessionId };
  } catch (err: any) {
    await releaseLockdownKiosk();
    return {
      success: false,
      error: err?.response?.data?.message || err?.message || 'Attestation failed',
    };
  }
}

/**
 * Reads lockdownToken from URL search params on /assessments/[id]/take,
 * persists it via authStorage.setAccessToken(token),
 * strips lockdownToken from window.history.replaceState so tokens never linger in URL history,
 * and runs initializeLockdownAttestation(apiClient).
 */
export async function consumeLockdownLaunchToken(
  apiClient?: any,
  assessmentId?: string,
): Promise<{
  success: boolean;
  token?: string | null;
  attestation?: { success: boolean; sessionId?: string; error?: string };
}> {
  if (typeof window === 'undefined') {
    return { success: false };
  }

  let token: string | null = null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    token = urlParams.get('lockdownToken') || urlParams.get('token');

    if (token) {
      authStorage.setAccessToken(token);
      try {
        window.sessionStorage?.setItem('codeskill_token', token);
      } catch {
        // ignore sessionStorage error
      }

      // Strip lockdownToken and token from window.history.replaceState
      const url = new URL(window.location.href);
      url.searchParams.delete('lockdownToken');
      url.searchParams.delete('token');
      const cleanUrl = url.pathname + (url.search ? url.search : '') + url.hash;
      window.history.replaceState(window.history.state, '', cleanUrl);
    }
  } catch {
    // ignore URL parsing error
  }

  let targetId = assessmentId;
  if (!targetId && typeof window !== 'undefined') {
    const match = window.location.pathname.match(/\/assessments\/([^/]+)/);
    if (match && match[1] && match[1] !== 'take') {
      targetId = match[1];
    }
  }

  const attestation = await initializeLockdownAttestation(apiClient, targetId, false);

  return {
    success: attestation.success,
    token: token || authStorage.getAccessToken(),
    attestation,
  };
}

/**
 * Closes the native CodeSkill LockDown application process cleanly.
 */
export async function exitLockdownApp(): Promise<void> {
  if (!isLockdownClient()) return;
  try {
    await releaseLockdownKiosk();
  } catch {
    // ignore
  }
  try {
    await tauriInvoke<void>('exit_lockdown_app');
  } catch (err) {
    console.error('Failed to exit CodeSkill LockDown app:', err);
  }
}

/**
 * Performs a complete student logout and exits CodeSkill LockDown.
 * Wipes auth tokens from memory, sessionStorage, localStorage, and browser cookies,
 * releases kiosk locks, and terminates the native application window.
 */
export async function logoutAndExitLockdown(): Promise<void> {
  // 1. Wipe all authentication state
  try {
    authStorage.clearTokens();
  } catch {
    // ignore
  }
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.clear();
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('codeskill_token');
      localStorage.removeItem('codeskill_auth');
      // Expire auth cookies
      document.cookie = 'codeskill_token=; Max-Age=0; path=/;';
      document.cookie = 'token=; Max-Age=0; path=/;';
    }
  } catch {
    // ignore storage errors
  }

  // 2. Release OS kiosk and exit desktop app
  await exitLockdownApp();

  // 3. Browser fallback only (if not running inside desktop client)
  if (typeof window !== 'undefined' && !isLockdownClient()) {
    try {
      window.close();
    } catch {
      // ignore
    }
    window.location.href = '/login';
  }
}

/**
 * Scans user-facing non-essential applications currently running on the operating system.
 */
export async function listNonEssentialApps(): Promise<RunningUserApp[]> {
  if (!isLockdownClient()) return [];
  try {
    return await tauriInvoke<RunningUserApp[]>('list_non_essential_apps');
  } catch (err) {
    console.warn('Failed to list non-essential apps:', err);
    return [];
  }
}

/**
 * Requests that running non-essential applications be closed gracefully or forcefully.
 */
export async function closeNonEssentialApps(force = false): Promise<RunningUserApp[]> {
  if (!isLockdownClient()) return [];
  try {
    return await tauriInvoke<RunningUserApp[]>('close_non_essential_apps', { force });
  } catch (err) {
    console.warn('Failed to close non-essential apps:', err);
    return [];
  }
}

/**
 * Retrieves the diagnostic log ring buffer (last 100 entries) from the LockDown runtime.
 */
export async function getLockdownDiagnosticLogs(): Promise<DiagnosticLogEntry[]> {
  if (!isLockdownClient()) return [];
  try {
    return await tauriInvoke<DiagnosticLogEntry[]>('get_lockdown_diagnostic_logs');
  } catch (err) {
    console.warn('Failed to fetch LockDown diagnostic logs:', err);
    return [];
  }
}

/**
 * Enforces single-assessment isolation and configures allowed external URL patterns in LockDown.
 */
export async function setLockedAssessment(
  assessmentId: string,
  allowedUrls: string[] = [],
): Promise<void> {
  if (!isLockdownClient()) return;
  try {
    await tauriInvoke<void>('set_locked_assessment', {
      assessmentId,
      allowedUrls,
    });
  } catch (err) {
    console.warn('Failed to set locked assessment in LockDown:', err);
  }
}

/**
 * Synchronizes approved candidate accommodations (secondary display, screen reader speech) with the desktop kiosk.
 */
export async function setClientAccommodations(
  allowSecondaryDisplay: boolean = false,
  allowAccessibilitySpeech: boolean = false,
): Promise<boolean> {
  if (!isLockdownClient()) return true;
  try {
    return await tauriInvoke<boolean>('set_client_accommodations', {
      allowSecondaryDisplay,
      allowAccessibilitySpeech,
    });
  } catch (err) {
    console.warn('Failed to set candidate accommodations in LockDown:', err);
    return false;
  }
}

/**
 * Retrieves the persisted exam session journal snapshot from Rust disk storage.
 */
export async function getPersistedExamSession(): Promise<PersistedExamSession | null> {
  if (!isLockdownClient()) return null;
  try {
    return await tauriInvoke<PersistedExamSession | null>('get_persisted_exam_session');
  } catch (err) {
    console.warn('Failed to get persisted exam session:', err);
    return null;
  }
}

/**
 * Updates the persisted exam session journal snapshot in Rust disk storage.
 */
export async function savePersistedExamSession(patch: PersistedExamSessionPatch): Promise<PersistedExamSession | null> {
  if (!isLockdownClient()) return null;
  try {
    return await tauriInvoke<PersistedExamSession>('save_persisted_exam_session', { patch });
  } catch (err) {
    console.warn('Failed to save persisted exam session:', err);
    return null;
  }
}

/**
 * Clears the persisted exam session journal file upon successful submission exit or reset.
 */
export async function clearPersistedExamSession(): Promise<void> {
  if (!isLockdownClient()) return;
  try {
    await tauriInvoke<void>('clear_persisted_exam_session');
  } catch (err) {
    console.warn('Failed to clear persisted exam session:', err);
  }
}

/**
 * Checks and requests OS-level and hardware media permissions for camera and microphone.
 */
export async function checkAndRequestMediaPermissions(
  requireCamera = true,
  requireMic = true,
): Promise<MediaPermissionStatus> {
  if (!isLockdownClient()) {
    return { camera: 'granted', microphone: 'granted', ready: true };
  }
  try {
    return await tauriInvoke<MediaPermissionStatus>('check_and_request_media_permissions', {
      requireCamera,
      requireMic,
    });
  } catch (err) {
    console.warn('Failed to check/request media permissions in LockDown:', err);
    return { camera: 'not_determined', microphone: 'not_determined', ready: false };
  }
}

/**
 * Opens the operating system's native Privacy & Security settings page for Camera, Microphone,
 * Accessibility, Screen Recording, Display, or Kiosk permissions.
 * - macOS: x-apple.systempreferences:com.apple.preference.security?Privacy_...
 * - Windows: ms-settings:privacy-...
 * In CodeSkill LockDown kiosk, invokes the native Tauri command.
 * In a standard browser, performs a protocol redirection attempt or returns false.
 */
export async function openSystemPrivacySettings(target: string): Promise<boolean> {
  if (isLockdownClient()) {
    try {
      return await tauriInvoke<boolean>('open_system_privacy_settings', { target });
    } catch (err) {
      console.warn('Failed to open system privacy settings via LockDown IPC:', err);
    }
  }

  if (typeof window !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase();
    const isMac = ua.includes('mac');
    const isWin = ua.includes('win');
    const t = target.toLowerCase();
    try {
      if (isMac) {
        let uri = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera';
        if (target.startsWith('x-apple.systempreferences:')) {
          uri = target;
        } else if (t.includes('micro') || t.includes('audio')) {
          uri = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone';
        } else if (t.includes('access') || t.includes('kiosk')) {
          uri = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
        } else if (t.includes('screen') || t.includes('display')) {
          uri = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
        }
        window.location.href = uri;
        return true;
      } else if (isWin) {
        let uri = 'ms-settings:privacy-webcam';
        if (target.startsWith('ms-settings:')) {
          uri = target;
        } else if (t.includes('micro') || t.includes('audio')) {
          uri = 'ms-settings:privacy-microphone';
        } else if (t.includes('display')) {
          uri = 'ms-settings:display';
        } else if (t.includes('kiosk') || t.includes('app')) {
          uri = 'ms-settings:appsfeatures';
        }
        window.location.href = uri;
        return true;
      }
    } catch (e) {
      console.warn('Browser prevented direct protocol navigation:', e);
    }
  }

  return false;
}

/**
 * Lists all blocking applications (forbidden utilities + non-essential apps).
 */
export async function listBlockingApps(): Promise<BlockingAppInfo[]> {
  if (!isLockdownClient()) return [];
  try {
    return await tauriInvoke<BlockingAppInfo[]>('list_blocking_apps');
  } catch (err) {
    console.warn('Failed to list blocking apps:', err);
    return [];
  }
}

/**
 * Terminates a single blocking application by PID.
 */
export async function killBlockingApp(pid: number, force = false): Promise<boolean> {
  if (!isLockdownClient()) return true;
  try {
    return await tauriInvoke<boolean>('kill_blocking_app', { pid, force });
  } catch (err) {
    console.warn(`Failed to kill blocking app PID ${pid}:`, err);
    return false;
  }
}

/**
 * Terminates all running blocking applications.
 */
export async function killAllBlockingApps(force = false): Promise<BlockingAppInfo[]> {
  if (!isLockdownClient()) return [];
  try {
    return await tauriInvoke<BlockingAppInfo[]>('kill_all_blocking_apps', { force });
  } catch (err) {
    console.warn('Failed to kill all blocking apps:', err);
    return [];
  }
}

export interface SystemDiagnosticResult {
  osName: string;
  osVersion: string;
  architecture: string;
  monitorCount: number;
  displays: DisplayTopology;
  cameraPermission: string;
  microphonePermission: string;
  screenPermission: string;
  mediaHardware: MediaHardwareAudit;
  backgroundApps: BlockingAppInfo[];
  networkLatencyMs?: number;
  overallReadiness: boolean;
  readinessScore: number;
  recommendations: string[];
}

/**
 * Runs complete pre-exam system diagnostic suite.
 */
export async function runFullSystemDiagnostic(): Promise<SystemDiagnosticResult> {
  if (!isLockdownClient()) {
    return {
      osName: typeof navigator !== 'undefined' ? navigator.platform : 'Web Browser',
      osVersion: 'Standard Browser',
      architecture: 'x86_64',
      monitorCount: 1,
      displays: {
        monitorCount: 1,
        externalDisplaysDetected: false,
        primaryResolution: typeof window !== 'undefined' ? `${window.screen?.width || 1920}x${window.screen?.height || 1080}` : '1920x1080',
      },
      cameraPermission: 'granted',
      microphonePermission: 'granted',
      screenPermission: 'granted',
      mediaHardware: { passed: true, devices: [], virtualDevicesDetected: [] },
      backgroundApps: [],
      networkLatencyMs: 15,
      overallReadiness: true,
      readinessScore: 100,
      recommendations: [],
    };
  }
  try {
    return await tauriInvoke<SystemDiagnosticResult>('run_full_system_diagnostic');
  } catch (err) {
    console.warn('Failed to run full system diagnostic in LockDown:', err);
    throw err;
  }
}

/**
 * Retrieves the unified first-launch startup OS permissions checklist.
 */
export async function getStartupPermissionChecklist(
  timeoutMs = 2500,
): Promise<StartupPermissionChecklistState> {
  const platform = detectClientPlatform();
  if (!isLockdownClient()) {
    return {
      platform,
      onboardingCompleted: true,
      allRequiredGranted: true,
      items: [
        {
          id: 'camera',
          name: 'Camera Access',
          description: 'Standard browser web camera access',
          status: 'granted',
          required: true,
          actionType: 'request',
        },
        {
          id: 'microphone',
          name: 'Microphone Access',
          description: 'Standard browser microphone access',
          status: 'granted',
          required: true,
          actionType: 'request',
        },
      ],
      verifiedAtMs: Date.now(),
      clientVersion: '1.0.0',
      pendingExamUrl: null,
    };
  }
  try {
    const res = await tauriInvokeWithTimeout<StartupPermissionChecklistState>(
      'get_startup_permission_checklist',
      {},
      timeoutMs,
    );
    if (res && Array.isArray(res.items) && res.items.length > 0) {
      return res;
    }
  } catch (err) {
    console.warn('Failed to get startup permission checklist from native IPC, using resilient platform fallback:', err);
  }

  return getDefaultStartupPermissionChecklist(platform);
}

/**
 * Requests an OS permission or opens the appropriate system privacy panel.
 */
export async function requestOsPermission(permissionId: string): Promise<PermissionChecklistItem> {
  const platform = detectClientPlatform();
  if (!isLockdownClient()) {
    return {
      id: permissionId,
      name: permissionId,
      description: 'Web fallback',
      status: 'granted',
      required: true,
      actionType: 'request',
    };
  }
  try {
    return await tauriInvokeWithTimeout<PermissionChecklistItem>(
      'request_os_permission',
      {
        permissionId,
        permission_id: permissionId,
      },
      3000,
    );
  } catch (err) {
    console.warn(`Failed to request OS permission for ${permissionId} via IPC, attempting direct system open:`, err);
    await openSystemPrivacySettings(permissionId);

    const fallbackItems = getDefaultStartupPermissionChecklist(platform).items;
    return fallbackItems.find((i) => i.id === permissionId) || {
      id: permissionId,
      name: permissionId,
      description: 'System Permission',
      status: 'needs_action',
      required: true,
      actionType: 'open_settings',
    };
  }
}

/**
 * Completes the one-time OS permission onboarding flow and writes the state to persistent cache.
 */
export async function completePermissionOnboarding(): Promise<CompleteOnboardingResult> {
  if (!isLockdownClient()) {
    return { success: true, targetUrl: null };
  }
  try {
    return await tauriInvokeWithTimeout<CompleteOnboardingResult>(
      'complete_permission_onboarding',
      {},
      3000,
    );
  } catch (err) {
    console.warn('Failed to complete permission onboarding via IPC:', err);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('codeskill_lockdown_onboarding_completed', 'true');
      } catch {
        // ignore
      }
    }
    return { success: true, targetUrl: null };
  }
}

export interface FlightRecorderContext {
  bootId: string;
  platform: string;
  osVersion: string;
  arch: string;
  logDir: string;
  clientVersion: string;
}

export interface DiagnosticBundleResult {
  success: boolean;
  bundlePath: string;
  fileCount: number;
  totalBytes: number;
  bootId: string;
}

/**
 * Returns the native Rust flight-recorder correlation context (`bootId`, platform, log directory).
 */
export async function getFlightRecorderContext(): Promise<FlightRecorderContext | null> {
  if (!isLockdownClient()) return null;
  try {
    return await tauriInvokeWithTimeout<FlightRecorderContext>('get_flight_recorder_context', {}, 1500);
  } catch {
    return null;
  }
}

/**
 * Bridges a structured frontend WebView event into the Rust JSONL flight recorder.
 */
export async function logFrontendEvent(
  level: string,
  category: string,
  event: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  if (!isLockdownClient()) return;
  try {
    await tauriInvokeWithTimeout<void>(
      'log_frontend_event',
      { level, category, event, context },
      1500,
    );
  } catch {
    // Non-fatal
  }
}

/**
 * Exports a sanitized `.zip` bundle of the last 48h of native JSONL logs, panic logs, and system summary.
 */
export async function exportDiagnosticLogBundle(): Promise<DiagnosticBundleResult> {
  if (!isLockdownClient()) {
    throw new Error('Diagnostic log bundle export is only available inside CodeSkill LockDown.');
  }
  return await tauriInvokeWithTimeout<DiagnosticBundleResult>('export_diagnostic_log_bundle', {}, 8000);
}
