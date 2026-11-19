/**
 * Pacing & Keystroke Cadence Telemetry Tracker
 * Tracks per-question dwell time, keystrokes, pasted/injected character volume, and typing bursts.
 */

export interface QuestionCadenceMetrics {
  questionId: string;
  dwellTimeMs: number;
  keystrokes: number;
  pastedChars: number;
  injectedChars: number;
  typingBursts: number;
  lastActiveTimestamp: number;
}

class PacingTelemetryManager {
  private metrics: Map<string, QuestionCadenceMetrics> = new Map();
  private activeQuestionId: string | null = null;
  private questionStartTime: number = Date.now();
  private lastKeystrokeTime: number = 0;
  private burstCounter: number = 0;

  public setActiveQuestion(questionId: string) {
    const now = Date.now();
    if (this.activeQuestionId && this.activeQuestionId !== questionId) {
      // Accumulate dwell time for previous question
      const prev = this.getOrCreateMetrics(this.activeQuestionId);
      prev.dwellTimeMs += Math.max(0, now - this.questionStartTime);
      prev.lastActiveTimestamp = now;
    }
    this.activeQuestionId = questionId;
    this.questionStartTime = now;
  }

  public recordKeystroke(questionId?: string) {
    const qid = questionId || this.activeQuestionId || 'general';
    const m = this.getOrCreateMetrics(qid);
    m.keystrokes += 1;

    const now = Date.now();
    const interval = now - this.lastKeystrokeTime;
    this.lastKeystrokeTime = now;

    // A typing burst is classified as rapid keystrokes within 80ms of each other
    if (interval < 80) {
      this.burstCounter++;
      if (this.burstCounter === 5) {
        m.typingBursts += 1;
      }
    } else {
      this.burstCounter = 0;
    }
  }

  public recordPaste(charCount: number, questionId?: string) {
    const qid = questionId || this.activeQuestionId || 'general';
    const m = this.getOrCreateMetrics(qid);
    m.pastedChars += Math.max(0, charCount);
    // Large bulk injections (> 50 chars instantaneously)
    if (charCount > 50) {
      m.injectedChars += charCount;
    }
  }

  public getSnapshot(questionId?: string): QuestionCadenceMetrics | QuestionCadenceMetrics[] {
    const now = Date.now();
    if (this.activeQuestionId) {
      const active = this.getOrCreateMetrics(this.activeQuestionId);
      active.dwellTimeMs += Math.max(0, now - this.questionStartTime);
      active.lastActiveTimestamp = now;
      this.questionStartTime = now;
    }

    if (questionId) {
      return { ...this.getOrCreateMetrics(questionId) };
    }

    return Array.from(this.metrics.values()).map((val) => ({ ...val }));
  }

  public clear() {
    this.metrics.clear();
    this.activeQuestionId = null;
    this.questionStartTime = Date.now();
    this.burstCounter = 0;
  }

  private getOrCreateMetrics(qid: string): QuestionCadenceMetrics {
    let m = this.metrics.get(qid);
    if (!m) {
      m = {
        questionId: qid,
        dwellTimeMs: 0,
        keystrokes: 0,
        pastedChars: 0,
        injectedChars: 0,
        typingBursts: 0,
        lastActiveTimestamp: Date.now(),
      };
      this.metrics.set(qid, m);
    }
    return m;
  }
}

export const pacingTelemetry = new PacingTelemetryManager();
