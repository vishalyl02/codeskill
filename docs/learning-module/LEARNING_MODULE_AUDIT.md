# CodeSkill Learning Module — Repository Audit (Batch 0)

**Date:** October 21, 2026  
**Auditor:** Principal Software Architect & Application Security Engineer  
**Branch:** `feat/learning-paths-practice-certification`  
**Repository:** `sazamansari/codeskill`

---

## 1. Executive Summary

This repository audit analyzes the current CodeSkill codebase (`backend-nestjs` and `frontend-v2`) to lay the foundation for a production-grade **Learning Paths, Courses, Practice Exercises, Gamification (XP/Badges), and Verifiable Certification** platform without video dependencies.

The objective is to leverage and extend the battle-tested infrastructure already in place—PostgreSQL/TypeORM, BullMQ, Redis, the Piston/Judge0 code execution engine, Monaco Editor, S3-compatible asset storage, and JWT/RBAC security boundaries—without duplicating core logic or destabilizing existing assessment, contest, and proctoring workflows.

---

## 2. Codebase Baseline & Health Status

| Component | Technology | Current Test Status | Build Health | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Backend** | NestJS 11, TypeORM 1.1, PostgreSQL 16, BullMQ, Redis | 75/75 test suites passing (642/642 tests) | `npm run build` succeeds (0 errors) | Zero-downtime shard-aware database connectivity |
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS v4 | 49/49 test suites passing (355/355 tests) | `npm run build` succeeds (81/81 routes) | Strict TypeScript mode (`tsc --noEmit` clean) |
| **Execution** | Piston / Judge0 failover cluster | Integration verified | Production ready | Multi-language sandbox (C, C++, Java, JS, Python) |
| **PDF Generation**| `@react-pdf/renderer` v4.9.0 | Installed in both frontend & backend | Available | Reusable for high-fidelity certificate rendering |

---

## 3. Existing Capabilities & Reuse Mapping

### 3.1 Authentication & Authorization
- **Current State:** JWT token authentication with transparent refresh rotation (`TokenService`, `RefreshToken`), role-based guards (`AdminGuard`, `TeacherGuard`, `SuperAdminGuard`), and token revocation tracking (`tokenVersion` on `User`).
- **Reuse Strategy:**
  - Standard learners authenticate using existing student JWT tokens.
  - Admin Studio endpoints will enforce `AdminGuard` with granular permission checks (`SuperAdmin`, `LearningAdmin`, `CertificationAdmin`).
  - Public certificate verification endpoints (`/certificates/verify/:credentialId`) will remain accessible without authentication, exposing strictly non-sensitive credential data.

### 3.2 Coding Sandbox & Submission Lifecycle
- **Current State:** `backend-nestjs/src/execution` provides sandbox compilation and test execution with memory/CPU limits, timeouts, and Judge0-Piston failover. `backend-nestjs/src/submissions` records submission logs, verdicts, and test case results.
- **Reuse Strategy:**
  - **No duplicate execution engine.** Learning practice exercises link directly to problem statements (`Problem`, `ProblemConfig`, `ProblemTestCase`).
  - Learning practice allows unlimited retries, hints, and immediate feedback without affecting competitive contest ratings or proctored assessment flags.

### 3.3 Question Bank & Quizzes
- **Current State:** `backend-nestjs/src/questions` supports single-choice MCQs, multiple-choice questions, difficulty scoring, topic/subtopic tagging, code snippets, and explanations.
- **Reuse Strategy:**
  - Reuse question structures for course knowledge checks and milestone quizzes.
  - The server evaluates answer keys; client requests never receive answer keys prior to submission.

### 3.4 Gamification (XP, Stats & Badges)
- **Current State:** `User.stats` contains `xp`, `totalSolved`, `currentStreak`, and `badges: { badgeId, unlockedAt }[]`.
- **Reuse Strategy:**
  - The current JSONB storage lacks transaction auditability and idempotency guarantees.
  - Introduce an append-only `xp_ledger` table with unique idempotency keys (`student_id`, `event_type`, `entity_id`) to prevent duplicate awards from retries and race conditions, deriving `User.stats.xp` atomically.
  - Formalize `badge_definitions` and `student_badges` tables with explicit award criteria.

### 3.5 Storage & Assets
- **Current State:** `backend-nestjs/src/s3` handles S3/MinIO presigned URLs and direct uploads with MIME type safety and directory segregation.
- **Reuse Strategy:**
  - Store generated certificate PDFs and badge artwork in dedicated S3 prefixes (`certificates/` and `badges/`).

---

## 4. Gaps to Implement

1. **Curriculum Hierarchy:** `learning_paths`, `courses`, `course_modules`, `lessons`, and `course_exercises` tables with versioning (`draft`, `published`, `archived`).
2. **Server-Side Progress Tracking:** Authoritative progress calculation across lessons, exercises, courses, and learning paths (`lesson_progress`, `course_progress`, `path_progress`).
3. **Certification Lifecycle Engine:** Template definition, eligibility rules evaluator, cryptographic credential hash generation, and atomic issuance preventing race conditions.
4. **Admin Studio UI:** Authoring interface for paths, curriculum, quiz builders, badge configuration, and certificate templates.
5. **Student Experience:** Path discovery, course curriculum tree, reading reader with syntax-highlighted code examples, embedded Monaco coding workspace, and public verification page.
