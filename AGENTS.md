# CodeSkill Agent Runbook & Repository Invariants

> **Ground-Truth Runbook for AI Coding Agents**  
> Derived from source code, package manifests, and configuration on `origin/main`.

---

## 1. Scope & Monorepo Topology

- Two independent application packages (no npm workspace orchestrator):
  - `backend-nestjs/`: NestJS 11 API, Apollo GraphQL, Socket.IO WebSockets, BullMQ Judge.
  - `frontend-v2/`: Next.js 16 App Router (React 19, Webpack).
- Infrastructure and ops code:
  - `terraform/`: AWS infrastructure definitions (`dev`, `production`, `judges` environments and 22 child modules).
  - `deployment/`: Docker compose files, Nginx reverse proxies, Piston/Judge0 runner configs.
  - `scripts/`: Operational scripts, k6 load tests, database backups, admin bootstrap.
- Process entrypoints:
  - Backend API: `backend-nestjs/src/main.ts` (`dist/main.js`), Port 5001, Global prefix `/api`.
  - Backend Judge Worker: `backend-nestjs/src/worker.ts` (`dist/worker.js`).
  - Frontend Next.js: `frontend-v2/src/app/layout.tsx`, Port 3000.
  - Process Manager: `ecosystem.config.js` (PM2).

---

## 2. Exact Verification & Execution Commands

All commands below assume the repository root directory unless wrapped in subshells:

### Package Installation
```bash
(cd backend-nestjs && npm ci --legacy-peer-deps)
(cd frontend-v2 && npm ci --legacy-peer-deps)
```

### Static Type Checking (Without Emitted Output)
```bash
# Backend TypeScript verification
(cd backend-nestjs && npx --no-install tsc -p tsconfig.build.json --noEmit --incremental false)

# Frontend TypeScript verification
(cd frontend-v2 && npx --no-install tsc --noEmit --incremental false)
```

### Production Compiles & Builds
```bash
# Backend build (cleans dist, compiles via tsc -p tsconfig.build.json)
npm run build --prefix backend-nestjs

# Frontend build (cleans .next, compiles via next build --webpack)
npm run build --prefix frontend-v2
```

### Linting (Read-Only Checks)
```bash
# Backend linting without auto-fix
(cd backend-nestjs && npx --no-install eslint "{src,apps,libs,test}/**/*.ts")

# Frontend linting
npm run lint --prefix frontend-v2
```

### Automated Test Suites
```bash
# Full backend unit suite (91 spec files)
npm test --prefix backend-nestjs -- --runInBand

# Single backend test file
(cd backend-nestjs && npm test -- --runInBand --runTestsByPath src/auth/token.service.spec.ts)

# Full frontend unit suite (71 test files)
npm test --prefix frontend-v2 -- --runInBand

# Single frontend test file
(cd frontend-v2 && npm test -- --runInBand --runTestsByPath src/lib/await-execution.test.ts)
```

---

## 3. Core Architectural Invariants to Preserve

1. **Strict Submission Sharding Invariant:**
   - Read and write operations to submissions MUST use `SubmissionStore` (`backend-nestjs/src/database/sharding/submission-store.ts`) and include `userId` for proper 128-bucket MD5 routing.
   - NEVER bypass `SubmissionStore` by writing direct SQL against the primary `submissions` repository.
2. **Zero-Invention Policy for Endpoints and DB Schema:**
   - Preserve existing column names and casing (`mongoId`, `_id`, JSONB fields).
   - Never rename or mutate database schema without an approved migration running under `pg_advisory_xact_lock`.
3. **Cryptographic JWT Invariants:**
   - Outside `development` and `test`, `JWT_SECRET` must be at least 32 characters long with high entropy. Never supply literal fallback secrets.
   - Access token lifetime must not exceed 24 hours (`JWT_ACCESS_TTL <= 24h`).
4. **Response Envelope Convention:**
   - All backend controller routes pass through `ResponseInterceptor`, standardizing successful outputs as `{ success: true, data: [...] }` or spreading `{ success: true, ...result }`.
5. **Frontend State & Performance Invariants:**
   - Monaco editor keystrokes MUST be debounced to prevent continuous virtual DOM diffing.
   - MediaPipe face detection runs locally via WebAssembly (`/mediapipe/wasm`) on the client to avoid streaming video across constrained networks.
   - Never add heavy full-screen CSS blur filters that degrade integrated GPU rendering.