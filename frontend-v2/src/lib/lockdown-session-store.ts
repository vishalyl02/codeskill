"use client";

import {
  savePersistedExamSession,
  getPersistedExamSession,
  clearPersistedExamSession,
  PersistedExamSessionPatch,
  isLockdownClient,
} from "@/lib/lockdown-bridge";

export interface LockdownSessionState {
  assessmentId: string;
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
  activeQuestionIndex?: number;
  mcqAnswers?: Record<string, number | number[]>;
  codeBuffers?: Record<string, { code: string; language: string }>;
  scratchpadNotes?: string;
  remainingCountdown?: number;
  updatedAtMs: number;
}

const STORAGE_PREFIX = "codeskill_lockdown_session_";

export class LockdownSessionStore {
  private static getStorageKey(assessmentId: string): string {
    return `${STORAGE_PREFIX}${assessmentId}`;
  }

  public static getLocalState(assessmentId: string): LockdownSessionState | null {
    if (typeof window === "undefined") return null;
    try {
      const raw =
        sessionStorage.getItem(this.getStorageKey(assessmentId)) ||
        localStorage.getItem(this.getStorageKey(assessmentId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public static async hydrateState(assessmentId: string): Promise<LockdownSessionState | null> {
    const local = this.getLocalState(assessmentId);

    if (isLockdownClient()) {
      try {
        const rustSession = await getPersistedExamSession();
        if (rustSession && rustSession.assessmentId === assessmentId) {
          const merged: LockdownSessionState = {
            assessmentId,
            candidateId: rustSession.candidateId || local?.candidateId,
            authToken: rustSession.authToken || local?.authToken,
            attestationToken: rustSession.attestationToken || local?.attestationToken,
            kioskActive: rustSession.kioskActive ?? local?.kioskActive ?? false,
            kioskMode: rustSession.kioskMode || local?.kioskMode,
            faceVerified: rustSession.faceVerified ?? local?.faceVerified ?? false,
            mediaPermissionsVerified:
              rustSession.mediaPermissionsVerified ?? local?.mediaPermissionsVerified ?? false,
            isSubmitted: rustSession.isSubmitted ?? local?.isSubmitted ?? false,
            submittedAtMs: rustSession.submittedAtMs || local?.submittedAtMs,
            submissionReceiptId: rustSession.submissionReceiptId || local?.submissionReceiptId,
            activeQuestionIndex: local?.activeQuestionIndex ?? 0,
            mcqAnswers: local?.mcqAnswers ?? {},
            codeBuffers: local?.codeBuffers ?? {},
            scratchpadNotes: local?.scratchpadNotes ?? "",
            remainingCountdown: local?.remainingCountdown,
            updatedAtMs: Math.max(rustSession.updatedAtMs || 0, local?.updatedAtMs || 0),
          };
          this.saveLocalState(assessmentId, merged);
          return merged;
        }
      } catch (err) {
        console.warn("[LockdownSessionStore] Rust hydration warning:", err);
      }
    }

    return local;
  }

  public static saveLocalState(assessmentId: string, state: LockdownSessionState): void {
    if (typeof window === "undefined") return;
    try {
      const serialized = JSON.stringify(state);
      sessionStorage.setItem(this.getStorageKey(assessmentId), serialized);
      localStorage.setItem(this.getStorageKey(assessmentId), serialized);
    } catch (e) {
      console.warn("[LockdownSessionStore] Local state storage failed:", e);
    }
  }

  public static async syncState(
    assessmentId: string,
    patch: Partial<LockdownSessionState>
  ): Promise<LockdownSessionState> {
    const current = (await this.hydrateState(assessmentId)) || {
      assessmentId,
      kioskActive: false,
      faceVerified: false,
      mediaPermissionsVerified: false,
      isSubmitted: false,
      updatedAtMs: Date.now(),
    };

    const updated: LockdownSessionState = {
      ...current,
      ...patch,
      updatedAtMs: Date.now(),
    };

    this.saveLocalState(assessmentId, updated);

    if (isLockdownClient()) {
      const rustPatch: PersistedExamSessionPatch = {
        assessmentId,
        candidateId: updated.candidateId,
        authToken: updated.authToken,
        attestationToken: updated.attestationToken,
        kioskActive: updated.kioskActive,
        kioskMode: updated.kioskMode,
        faceVerified: updated.faceVerified,
        mediaPermissionsVerified: updated.mediaPermissionsVerified,
        isSubmitted: updated.isSubmitted,
        submittedAtMs: updated.submittedAtMs,
        submissionReceiptId: updated.submissionReceiptId,
      };
      await savePersistedExamSession(rustPatch).catch((err) => {
        console.warn("[LockdownSessionStore] Sync to Rust failed:", err);
      });
    }

    return updated;
  }

  public static async clearState(assessmentId: string): Promise<void> {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(this.getStorageKey(assessmentId));
      localStorage.removeItem(this.getStorageKey(assessmentId));
    }
    if (isLockdownClient()) {
      await clearPersistedExamSession().catch(() => {});
    }
  }

  public static async loadState(assessmentId: string): Promise<LockdownSessionState | null> {
    return this.hydrateState(assessmentId);
  }

  public static async saveState(
    assessmentId: string,
    patch: Partial<LockdownSessionState>
  ): Promise<LockdownSessionState> {
    return this.syncState(assessmentId, patch);
  }
}
