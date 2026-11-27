interface MacAssessmentDraft {
  code: string;
  language: string;
  codeByLanguage: Record<string, string>;
}

const prefix = (attemptId: string) => `codeskill-mac-draft:${encodeURIComponent(attemptId)}:`;
const key = (attemptId: string, questionId: string) => prefix(attemptId) + encodeURIComponent(questionId);

// Keep the latest edit through a reload of this WebView while encrypted autosave syncs.
export function checkpointMacAssessmentDraft(attemptId: string, questionId: string, draft: MacAssessmentDraft) {
  try {
    window.sessionStorage.setItem(key(attemptId, questionId), JSON.stringify(draft));
  } catch {
    // The network and native autosave queue remain available if session storage is blocked.
  }
}

export function readMacAssessmentDraft(attemptId: string, questionId: string): MacAssessmentDraft | null {
  try {
    const raw = window.sessionStorage.getItem(key(attemptId, questionId));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (typeof draft?.code !== "string" || typeof draft.language !== "string") return null;
    const codeByLanguage = Object.fromEntries(
      Object.entries(draft.codeByLanguage ?? {}).filter(([, code]) => typeof code === "string"),
    ) as Record<string, string>;
    return { code: draft.code, language: draft.language, codeByLanguage };
  } catch {
    return null;
  }
}

export function clearMacAssessmentDrafts(attemptId: string) {
  try {
    const storage = window.sessionStorage;
    const attemptPrefix = prefix(attemptId);
    for (let index = storage.length - 1; index >= 0; index--) {
      const entry = storage.key(index);
      if (entry?.startsWith(attemptPrefix)) storage.removeItem(entry);
    }
  } catch {
    // Session storage may already be unavailable during shutdown.
  }
}
