# 🚀 CodeSkill Backend — NestJS Core API & Distributed Judge Engine

The enterprise backend service for the **CodeSkill Assessment Platform**, built with **NestJS 11**, **TypeORM**, **PostgreSQL 15**, and **Redis 7 / BullMQ**.

---

## 🏛️ Architecture & Modules

The backend operates as both an HTTP REST / Socket.IO API server and a decoupled asynchronous background worker:

- **Authentication & RBAC (`src/auth/`):** High-entropy HS256 JWT access tokens, SHA-256 single-use refresh token rotation with family revocation, and `tokenVersion` immediate invalidation.
- **Examinations & Grading (`src/assessments/`):** Timed exam lifecycles, autosave responses, multi-attempt support, section scoring, and server-side coding evaluation.
- **Contest Engine (`src/contests/`):** Real-time competitive programming arena with live leaderboards, penalty calculations, and Socket.IO cluster broadcast.
- **Submission Sharding (`src/database/sharding/`):** `SubmissionStore` providing 128-bucket deterministic MD5 user hash routing across independent PostgreSQL shards.
- **Execution & Sandboxing (`src/execution/`):** BullMQ queue processor executing multi-language code (Python, C++, Java, C, TypeScript) inside isolated Docker containers or remote Piston microservices with strict CPU/memory cgroups and network disabling.
- **AI Anti-Cheat & Security (`src/exam-security/`):** Heartbeat tracking, Safe Exam Browser (SEB) verification, and timestamped proctoring violation ingestion.
- **Student Onboarding (`src/students/`):** Streamed CSV/Excel bulk upload, cross-table deduplication, transactional insertion, and BullMQ AWS SES credential dispatch.
- **Learning Paths & Certification (`src/learning/`):** Structured curriculum paths, lessons without video dependency, embedded practice exercises, automated XP/badge gamification, and digital credentials with public verification (`/certificates/verify/:credentialId`).
- **Bug Reporting & Tracking (`src/bugs/`):** Admin bug triage studio supporting S3 screenshot evidence, status lifecycles, comments, and activity logs.

---

## 🛠️ Developer Setup & Commands

### Prerequisites
- Node.js v20.x or v22.x
- PostgreSQL 15 & Redis 7 (via `docker compose up -d postgres redis` at root)

### Installation
```bash
# Install dependencies with legacy peer dependency resolution
npm ci --legacy-peer-deps
```

### Environment Configuration
```bash
cp .env.example.local .env
```
Ensure `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, and a strong 32+ character `JWT_SECRET` are set.

### Database Migrations & Seeding
```bash
# Compile TypeScript build
npm run build

# Run schema migrations (partitioning, contest security, sharding)
npx ts-node -r tsconfig-paths/register src/database/run-practice-submission-source.ts

# Seed default administrator accounts (ADM1 - ADM5)
npm run admin:bootstrap
```

### Development & Testing
```bash
# Start API in watch mode (Port 5001)
NODE_ENV=development npm run start:dev

# Run complete test suite (81 spec files):
npm test -- --runInBand

# Run single test file:
npm test -- --runInBand --runTestsByPath src/auth/token.service.spec.ts

# Type-check without emitting files:
npx --no-install tsc -p tsconfig.build.json --noEmit --incremental false
```

### Production Execution (PM2 Process Clustering)
```bash
# Build production bundle
npm run build

# Start API and Judge Worker instances via PM2 (from repository root):
pm2 start ecosystem.config.js
```

---

## 📡 Interactive API Documentation

When running locally, explore the interactive OpenAPI / Swagger catalog at:  
👉 **`http://localhost:5001/api/docs`**
