# CodeSkill Learning Module — Architectural Decisions (ADRs)

---

## ADR-001: Exclude Video Streaming from Core Architecture
- **Context:** The prompt explicitly mandates **NO VIDEO LESSONS**. The platform focus is hands-on learning through structured text, interactive code examples, knowledge-check quizzes, and coding exercises.
- **Decision:** All curriculum schemas and frontend components support Markdown, formatted syntax-highlighted code snippets, runnable examples, diagrams, quizzes, and coding problems. No video player, video transcoding, or video watch-time completion mechanisms will be implemented.
- **Consequences:** Lower server bandwidth/storage costs, zero external video hosting dependencies, and superior pedagogical alignment with active coding mastery.

---

## ADR-002: Modular Monolith vs. Microservices
- **Context:** CodeSkill operates as a cohesive NestJS backend (`backend-nestjs`) and Next.js frontend (`frontend-v2`).
- **Decision:** Implement the learning platform as modular NestJS modules (`LearningModule`, `GamificationModule`, `CertificationModule`) within the existing codebase.
- **Consequences:** Direct transactional consistency via TypeORM, instant access to `ExecutionService` and `AuthModule`, zero network serialization overhead between services, and simplified CI/CD.

---

## ADR-003: Reusing Existing Execution Engine for Learning Practice
- **Context:** CodeSkill has a high-performance execution engine (`ExecutionService`, `Judge0`, `Piston`) that handles multi-language sandboxed code execution with memory/time limits.
- **Decision:** Learning practice exercises reference existing `Problem` statements and route executions through `ExecutionService` and `Submissions`.
- **Consequences:** Eliminates redundant runner infrastructure, leverages existing language support, and ensures uniform execution metrics across practice and competitive assessments.

---

## ADR-004: Server-Authoritative Progress Verification
- **Context:** Client-side state can be tampered with or desynchronized across tabs/devices.
- **Decision:** A lesson or exercise is only marked complete when the server independently verifies that all mandatory requirements have been met (e.g. accepted submission on file, passing quiz score).
- **Consequences:** Eliminates progress spoofing, ensures authentic certificates, and guarantees reliable progress recovery across device switches.

---

## ADR-005: Append-Only XP Ledger for Gamification
- **Context:** Storing XP as a mutable number in `User.stats` is vulnerable to duplicate awards from retries, concurrent submissions, and lost audit trails.
- **Decision:** Create an immutable `xp_ledger` table with unique constraint `UNIQUE(student_id, idempotency_key)`. The user's total XP is atomically synchronized from the ledger.
- **Consequences:** Full replay protection, auditability of every XP point earned, and zero risk of inflation attacks.
