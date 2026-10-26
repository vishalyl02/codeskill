# CodeSkill Learning Module — Implementation Plan (Batch 0)

**Date:** October 21, 2026  
**Status:** Approved for Implementation  
**Feature Branch:** `feat/learning-paths-practice-certification`  

---

## 1. Batch Breakdown & Delivery Milestones

```mermaid
gantt
    title Learning Module Implementation Roadmap
    dateFormat  YYYY-MM-DD
    section Foundation
    Batch 0: Audit & Architecture            :done, b0, 2026-10-21, 1d
    Batch 1: Database & Backend Foundation   :active, b1, 2026-10-22, 2d
    section Core Workflows
    Batch 2: Admin Studio (Builders)         :b2, after b1, 2d
    Batch 3: Student Learning Experience     :b3, after b2, 2d
    Batch 4: Progress & Mastery Engine       :b4, after b3, 2d
    section Gamification & Certs
    Batch 5: XP, Skills & Badges             :b5, after b4, 2d
    Batch 6: Certification Engine            :b6, after b5, 2d
    section Production
    Batch 7: Analytics & Initial Curriculum  :b7, after b6, 1d
    Batch 8: QA & Production Rollout        :b8, after b7, 1d
```

---

## 2. Detailed Batch Specifications

### Batch 0 — Repository Audit & Design (COMPLETED)
- **Deliverables:** Baseline tests, `LEARNING_MODULE_AUDIT.md`, `LEARNING_MODULE_ARCHITECTURE.md`, `LEARNING_MODULE_ENTITY_REUSE_MAP.md`, `LEARNING_MODULE_API_CONTRACTS.md`, `LEARNING_MODULE_IMPLEMENTATION_PLAN.md`, `LEARNING_MODULE_RISK_REGISTER.md`.
- **Exit Gate:** Architectural sign-off with verified zero regressions on existing suites.

### Batch 1 — Database & Backend Foundation
- **Scope:**
  - Create TypeORM entities: `LearningPath`, `Course`, `CourseModule`, `Lesson`, `CourseExercise`, `LearningEnrollment`, `LessonProgress`, `CourseProgress`, `PathProgress`, `XPLedger`, `BadgeDefinition`, `StudentBadge`, `CertificateTemplate`, `Certificate`, `CertificateEvent`.
  - Migration script with rollback support.
  - NestJS `LearningModule`, `GamificationModule`, `CertificationModule`.
  - Core CRUD services and DTO validation.
- **Exit Gate:** Clean migration execution, entity relationships verified in PostgreSQL, unit tests for services.

### Batch 2 — Admin Studio
- **Scope:**
  - Frontend admin routes under `/admin/learning`.
  - Learning Path Manager (create, edit, reorder courses, publish revision).
  - Course & Lesson Builder (Markdown editor, code block insertion, exercise configuration).
  - Quiz authoring tool (single/multiple choice with server-validated answers).
  - Draft vs. Published revision workflows.
- **Exit Gate:** Admin can author and publish a path without manual DB intervention.

### Batch 3 — Student Learning Experience
- **Scope:**
  - Student learning catalog (`/learning`).
  - Path detail & enrollment screen.
  - Course curriculum navigation & reading view with structured code snippets (NO VIDEO).
  - Integrated practice runner reusing Monaco editor and `submissionAPI` / `runAPI`.
  - Next-lesson progression and resume learning state.
- **Exit Gate:** Student can browse, enroll, read a lesson, and solve an exercise end-to-end.

### Batch 4 — Progress & Mastery Engine
- **Scope:**
  - Server-calculated completion triggers for lessons, modules, courses, and paths.
  - Verification check on exercise outcomes (only `Accepted` submissions qualify).
  - Safe concurrency handling for rapid student submissions.
  - Resume state tracking (last active lesson/exercise).
- **Exit Gate:** Progress is 100% preserved after browser close, refresh, and device change.

### Batch 5 — XP, Skills & Badges
- **Scope:**
  - Append-only `XPLedger` with idempotency key enforcement.
  - Badge rules engine (evaluates criteria on exercise/course/path completions).
  - Student profile badge showcase and level progression.
  - Anti-gaming protection (re-submitting same problem yields 0 duplicate XP).
- **Exit Gate:** XP awards are strictly auditable and replay-proof.

### Batch 6 — Certification Engine
- **Scope:**
  - Server-side eligibility evaluator verifying all required courses and milestone passing scores.
  - Unique credential generator with collision prevention (`CS-YYYY-XXXXXX`).
  - PDF generation service using `@react-pdf/renderer` with S3 storage.
  - Public credential verification page (`/verify/:credentialId`).
  - Revocation workflow with audit logging.
- **Exit Gate:** Incomplete students cannot obtain a certificate; verified credentials render authentically.

### Batch 7 — Analytics & Initial Curriculum
- **Scope:**
  - Admin analytics dashboard (enrollments, completion rates, exercise drop-off analysis).
  - Seed initial starter curriculum (Programming Fundamentals, DSA, JavaScript, Python, SQL).
- **Exit Gate:** Curriculum populated and student funnels tracked accurately.

### Batch 8 — QA, Performance & Production Rollout
- **Scope:**
  - End-to-end integration tests.
  - Load and stress tests on code submission and verification endpoints.
  - Regression testing on existing contests and assessments.
  - Feature flag configuration for staged rollout.
- **Exit Gate:** 100% CI pass rate, production runbook documented.
