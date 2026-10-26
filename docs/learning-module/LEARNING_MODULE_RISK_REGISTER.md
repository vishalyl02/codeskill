# CodeSkill Learning Module — Risk Register (Batch 0)

**Date:** October 21, 2026  
**Status:** Monitored  

---

| Risk ID | Category | Description | Likelihood | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **RSK-01** | **Integrity** | Students attempt to spoof progress by sending client-side completion flags or calling completion endpoints without passing exercises. | High | Critical | **Server-authoritative evaluation only.** `LessonCompletionGuard` validates that all linked `CourseExercise` records have an accepted submission on file before issuing completion. |
| **RSK-02** | **Gamification** | Replay attacks or rapid multiple submissions awarding duplicate XP or duplicate badges. | High | High | **Append-only `XPLedger` with unique idempotency keys** `(student_id, idempotency_key)`. Database unique constraints prevent duplicate inserts. |
| **RSK-03** | **Performance** | Repeated heavy progress recalculations causing database CPU spikes on active paths with thousands of learners. | Medium | High | **Maintain incremental derived progress tables** (`course_progress`, `path_progress`). Update only relevant entity rows on completion events rather than scanning all raw submission records. |
| **RSK-04** | **Content Versioning**| Admins editing a published course structure, silently invalidating historical completion data for currently enrolled students. | Medium | Critical | **Immutable curriculum versioning.** Published revisions are frozen (`status = 'published'`). Edits create a new `draft` revision. Enrolled students remain attached to their enrolled version until explicitly upgraded. |
| **RSK-05** | **Certification** | Race conditions during certificate generation causing duplicate certificate records for the same student. | Medium | High | **Database-level unique constraint** `UNIQUE(student_id, path_id, path_version_id)` combined with an atomic issuance transaction. |
| **RSK-06** | **Privacy** | Public credential verification page unintentionally exposing student email, internal test scores, or private profile information. | Medium | High | Public verification DTO exposes **only** recipient display name, path title, issue date, issuer name, and active status. No PII or internal IDs are returned. |
| **RSK-07** | **Regression** | Modifications inadvertently affecting existing assessment or contest submission pipelines. | Low | Critical | **Strict isolation.** Learning module consumes `ExecutionService` and `Problem` entities as read/execute clients; no changes are made to `AssessmentAttempt`, `Contest`, or proctoring services. |
| **RSK-08** | **PDF Render Load** | Synchronous PDF generation blocking web request threads during bulk course completion. | Medium | Medium | Offload certificate PDF generation to asynchronous background BullMQ workers; immediate response returns verified credential status with pending PDF download link. |
