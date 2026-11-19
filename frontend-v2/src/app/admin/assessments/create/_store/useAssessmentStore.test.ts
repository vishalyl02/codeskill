import { useAssessmentStore } from './useAssessmentStore';

describe('useAssessmentStore - LockDown and VDI Lab Overrides', () => {
  beforeEach(() => {
    useAssessmentStore.getState().reset();
  });

  it('initializes requireLockdown, allowVirtualMachine, and dock tools with defaults', () => {
    const state = useAssessmentStore.getState();
    expect(state.requireLockdown).toBe(false);
    expect(state.allowVirtualMachine).toBe(false);
    expect(state.lockdownQuitPassword).toBe('');
    expect(state.allowCalculators).toBe(false);
    expect(state.allowScratchpad).toBe(true);
    expect(state.allowReferenceDoc).toBe(false);
    expect(state.referencePdfUrl).toBe('');
    expect(state.requireCloseOtherApps).toBe(true);
    expect(state.allowSpellCheck).toBe(false);
    expect(state.allowFindOnPage).toBe(true);
    expect(state.allowedUrlPatterns).toEqual([]);
    expect(state.enableScreenCaptureSnapshots).toBe(false);
  });

  it('updates lockdownQuitPassword, allowCalculators, and referencePdfUrl via setters', () => {
    const store = useAssessmentStore.getState();
    store.setLockdownQuitPassword('proctor-pass-123');
    store.setAllowCalculators(true);
    store.setAllowScratchpad(false);
    store.setAllowReferenceDoc(true);
    store.setReferencePdfUrl('https://example.com/sheet.pdf');

    const updated = useAssessmentStore.getState();
    expect(updated.lockdownQuitPassword).toBe('proctor-pass-123');
    expect(updated.allowCalculators).toBe(true);
    expect(updated.allowScratchpad).toBe(false);
    expect(updated.allowReferenceDoc).toBe(true);
    expect(updated.referencePdfUrl).toBe('https://example.com/sheet.pdf');

    store.setRequireCloseOtherApps(false);
    store.setAllowSpellCheck(true);
    store.setAllowFindOnPage(false);
    store.setAllowedUrlPatterns(['docs.python.org']);
    store.setEnableScreenCaptureSnapshots(true);

    const hardening = useAssessmentStore.getState();
    expect(hardening.requireCloseOtherApps).toBe(false);
    expect(hardening.allowSpellCheck).toBe(true);
    expect(hardening.allowFindOnPage).toBe(false);
    expect(hardening.allowedUrlPatterns).toEqual(['docs.python.org']);
    expect(hardening.enableScreenCaptureSnapshots).toBe(true);
  });

  it('hydrates dock tools and quit password from assessment payload', () => {
    const store = useAssessmentStore.getState();
    store.hydrate({
      title: 'Math Exam',
      requireLockdown: true,
      allowCalculators: true,
      allowScratchpad: false,
      allowReferenceDoc: true,
      referencePdfUrl: 'https://example.com/formula.pdf',
      lockdownQuitPassword: 'secret-quit-pwd',
    });

    const state = useAssessmentStore.getState();
    expect(state.requireLockdown).toBe(true);
    expect(state.allowCalculators).toBe(true);
    expect(state.allowScratchpad).toBe(false);
    expect(state.allowReferenceDoc).toBe(true);
    expect(state.referencePdfUrl).toBe('https://example.com/formula.pdf');
    expect(state.lockdownQuitPassword).toBe('secret-quit-pwd');
  });

  it('updates requireLockdown and allowVirtualMachine via setters', () => {
    const store = useAssessmentStore.getState();
    store.setRequireLockdown(true);
    expect(useAssessmentStore.getState().requireLockdown).toBe(true);

    store.setAllowVirtualMachine(true);
    expect(useAssessmentStore.getState().allowVirtualMachine).toBe(true);
  });

  it('resets allowVirtualMachine to false when setRequireLockdown is toggled off (Safeguard 3)', () => {
    const store = useAssessmentStore.getState();
    store.setRequireLockdown(true);
    store.setAllowVirtualMachine(true);

    expect(useAssessmentStore.getState().requireLockdown).toBe(true);
    expect(useAssessmentStore.getState().allowVirtualMachine).toBe(true);

    // Turning off requireLockdown must also reset allowVirtualMachine
    store.setRequireLockdown(false);

    expect(useAssessmentStore.getState().requireLockdown).toBe(false);
    expect(useAssessmentStore.getState().allowVirtualMachine).toBe(false);
  });

  it('hydrates requireLockdown and allowVirtualMachine from assessment payload', () => {
    const store = useAssessmentStore.getState();
    store.hydrate({
      title: 'VDI Exam',
      requireLockdown: true,
      allowVirtualMachine: true,
    });

    expect(useAssessmentStore.getState().requireLockdown).toBe(true);
    expect(useAssessmentStore.getState().allowVirtualMachine).toBe(true);
  });

  it('hydrates requireLockdown from legacy securityPolicy.requireSEB fallback', () => {
    const store = useAssessmentStore.getState();
    store.hydrate({
      title: 'Legacy SEB Exam',
      securityPolicy: { requireSEB: true },
      allowVirtualMachine: false,
    });

    expect(useAssessmentStore.getState().requireLockdown).toBe(true);
    expect(useAssessmentStore.getState().allowVirtualMachine).toBe(false);
  });

  it('resets requireLockdown and allowVirtualMachine to false on reset()', () => {
    const store = useAssessmentStore.getState();
    store.setRequireLockdown(true);
    store.setAllowVirtualMachine(true);

    store.reset();

    expect(useAssessmentStore.getState().requireLockdown).toBe(false);
    expect(useAssessmentStore.getState().allowVirtualMachine).toBe(false);
  });
});
