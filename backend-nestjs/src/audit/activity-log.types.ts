export interface ActivityLogInput {
  actorId?: string;
  actorEmail?: string;
  actorName?: string;
  actorRole?: string;
  actorUid?: string;
  action: string;
  target?: string;
  targetType?: string;
  studentId?: string;
  attemptId?: string;
  assessmentId?: string;
  event?: string;
  riskWeight?: number;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  timestamp?: Date;
}

export interface ActivityCursorPayload {
  timestamp: string;
  id: string;
}

export type ActivityCategory =
  | 'all'
  | 'auth'
  | 'assessment'
  | 'submission'
  | 'security'
  | 'radar'
  | 'question'
  | 'user'
  | 'contest';

export type ActivityRole = 'all' | 'student' | 'admin' | 'teacher';
export type ActivitySeverity = 'all' | 'normal' | 'warning' | 'critical';
