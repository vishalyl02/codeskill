import { LockdownSessionStore } from './lockdown-session-store';

describe('LockdownSessionStore', () => {
  const assessmentId = 'test-asmt-123';

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('saves and reads local state correctly', () => {
    const state = {
      assessmentId,
      kioskActive: true,
      faceVerified: true,
      mediaPermissionsVerified: true,
      isSubmitted: false,
      updatedAtMs: Date.now(),
    };

    LockdownSessionStore.saveLocalState(assessmentId, state);
    const retrieved = LockdownSessionStore.getLocalState(assessmentId);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.assessmentId).toBe(assessmentId);
    expect(retrieved?.kioskActive).toBe(true);
    expect(retrieved?.faceVerified).toBe(true);
  });

  it('syncs patches and returns merged state via saveState / syncState', async () => {
    await LockdownSessionStore.saveState(assessmentId, {
      kioskActive: true,
      faceVerified: false,
    });

    const updated = await LockdownSessionStore.saveState(assessmentId, {
      faceVerified: true,
      isSubmitted: true,
      submissionReceiptId: 'REC-XYZ-123',
    });

    expect(updated.kioskActive).toBe(true);
    expect(updated.faceVerified).toBe(true);
    expect(updated.isSubmitted).toBe(true);
    expect(updated.submissionReceiptId).toBe('REC-XYZ-123');

    const loaded = await LockdownSessionStore.loadState(assessmentId);
    expect(loaded?.submissionReceiptId).toBe('REC-XYZ-123');
    expect(loaded?.isSubmitted).toBe(true);
  });

  it('clears state in sessionStorage and localStorage', async () => {
    await LockdownSessionStore.saveState(assessmentId, { isSubmitted: true });
    expect(LockdownSessionStore.getLocalState(assessmentId)).not.toBeNull();

    await LockdownSessionStore.clearState(assessmentId);
    expect(LockdownSessionStore.getLocalState(assessmentId)).toBeNull();
  });

  it('hydrates from Tauri persisted session when in LockDown client', async () => {
    const invokeMock = jest.fn().mockImplementation((cmd: string) => {
      if (cmd === 'get_persisted_exam_session') {
        return Promise.resolve({
          assessmentId,
          kioskActive: true,
          kioskMode: 'macos_cocoa_kiosk',
          faceVerified: true,
          mediaPermissionsVerified: true,
          isSubmitted: true,
          submissionReceiptId: 'REC-RUST-456',
          updatedAtMs: 123456,
        });
      }
      return Promise.resolve(null);
    });

    (window as any).__TAURI_INTERNALS__ = { invoke: invokeMock };

    const state = await LockdownSessionStore.hydrateState(assessmentId);
    expect(state).not.toBeNull();
    expect(state?.submissionReceiptId).toBe('REC-RUST-456');
    expect(state?.kioskMode).toBe('macos_cocoa_kiosk');
    expect(state?.isSubmitted).toBe(true);
  });
});
