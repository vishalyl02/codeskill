/** Keep work from a contest attempt separate from practice and other attempts. */
export function contestStoragePrefix(userId: string, contestId: string, sessionId: string): string {
  if (!userId || !contestId || !sessionId) throw new Error("Contest storage requires an active session");
  return `codeskill_contest_${userId}_${contestId}_${sessionId}`;
}

export function contestMcqDraftKey(userId: string, contestId: string, sessionId: string, problemId: string): string {
  return `${contestStoragePrefix(userId, contestId, sessionId)}_mcq_${problemId}`;
}

export function contestCodeDraftKey(userId: string, contestId: string, sessionId: string, problemId: string, language: string): string {
  return `${contestStoragePrefix(userId, contestId, sessionId)}_code_${problemId}_${language}`;
}

export function contestNoteKey(userId: string, contestId: string, sessionId: string, problemId: string): string {
  return `${contestStoragePrefix(userId, contestId, sessionId)}_note_${problemId}`;
}
