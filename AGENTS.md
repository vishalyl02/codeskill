# CodeSkill agent runbook

## Scope and architecture
- Root commands below assume the repository working directory; subshells select each package explicitly.
- Read `ARCHITECTURE.md` for source-backed flows/findings. This runbook was derived statically on 2026-10-14; commands were not executed during analysis.
- Two npm applications, no npm-workspace orchestrator: `backend-nestjs/` (NestJS API + judge) and `frontend-v2/` (Next.js App Router).
- PostgreSQL owns domain data; Redis supplies BullMQ, cache, OTP/throttles and socket pub/sub. Optional PostgreSQL shards own only submissions.
- Entrypoints: `backend-nestjs/src/main.ts`, `backend-nestjs/src/worker.ts`, `frontend-v2/src/app/layout.tsx`; process definition: `ecosystem.config.js`.
- API prefix `/api`, default API port 5001, frontend 3000, Swagger `/api/docs`. See `backend-nestjs/src/main.ts` and `frontend-v2/next.config.ts`.
- Honor nested `frontend-v2/AGENTS.md` for frontend edits; it requires relevant installed Next.js guides before coding. During an explicitly read-only review that excludes dependencies, do not inspect `node_modules`.

## Exact commands
- CI uses Node 22 (`.github/workflows/piston-validation.yml` and `.github/workflows/deploy.yml`); actual supported patch versions must be checked against installed packages when implementation is authorized.
- Install (writes dependencies): `(cd backend-nestjs && npm ci --legacy-peer-deps)` and `(cd frontend-v2 && npm ci --legacy-peer-deps)`.
- Backend build/compile: `npm run build --prefix backend-nestjs` (cleans `dist`, invokes `tsc -p tsconfig.build.json`).
- Frontend build: `npm run build --prefix frontend-v2` (cleans `.next`, invokes `next build --webpack`).
- Combined build without install: `npm run build:backend && npm run build:frontend`.
- Root `npm run build` also runs installs; it is not a read-only verification command (`package.json`).
- Backend type-check without emitted files: `(cd backend-nestjs && npx --no-install tsc -p tsconfig.build.json --noEmit --incremental false)`.
- Frontend type-check without incremental output: `(cd frontend-v2 && npx --no-install tsc --noEmit --incremental false)`; generated Next type references may require a prior build.
- Backend lint without fixes: `(cd backend-nestjs && npx --no-install eslint "{src,apps,libs,test}/**/*.ts")`.
- Frontend lint: `npm run lint --prefix frontend-v2`.
- Backend `npm run lint` includes `--fix`; `npm run format` includes `--write`. Never use them in read-only tasks (`backend-nestjs/package.json`).
- Full backend unit suite: `npm test --prefix backend-nestjs -- --runInBand` (81 spec files).
- Full frontend unit suite: `npm test --prefix frontend-v2 -- --runInBand` (64 test files).
- One backend file: `(cd backend-nestjs && npm test -- --runInBand --runTestsByPath src/auth/token.service.spec.ts)`.
- One frontend file: `(cd frontend-v2 && npm test -- --runInBand --runTestsByPath src/lib/await-execution.test.ts)`.
- One named test: append `-t 'exact test name'` to the corresponding isolated-file command.
- Backend coverage: `npm run test:cov --prefix backend-nestjs -- --runInBand` (writes coverage output).
- Backend e2e suite: `(cd backend-nestjs && NODE_ENV=test npm run test:e2e -- --runInBand)`; requires configured disposable PostgreSQL/Redis and schema.
- Shard integration suite: `(cd backend-nestjs && NODE_ENV=test npm run test:shards:integration)`; requires local primary `DATABASE_URL`, 2+ local `SUBMISSION_SHARDS`, and CREATE/DROP DATABASE privileges.
- All automated suites means BOTH unit suites plus backend e2e and shard integration; no root all-tests command exists. Integration tests mutate disposable services.
- Known e2e caveat: `backend-nestjs/test/app.e2e-spec.ts` expects raw `Hello World!`, while the global interceptor wraps responses; don't claim it passes without running it.
- Local infrastructure (creates containers/volumes): `docker compose up -d postgres redis`; optional shard servers: `docker compose --profile shards up -d submission-shard-a submission-shard-b`.
- Backend dev: `(cd backend-nestjs && NODE_ENV=development npm run start:dev)`.
- Frontend dev: `npm run dev --prefix frontend-v2` (Webpack).
- Built API: `(cd backend-nestjs && NODE_ENV=production npm run start:prod)` with production environment ready.
- Built judge: `(cd backend-nestjs && NODE_ENV=production PROCESS_ROLE=judge JUDGE_SANDBOX=docker node dist/worker.js)` with database/Redis and execution provider ready.
- Built frontend: `npm run start --prefix frontend-v2`.
- Managed production processes: `npm start` / `npm run restart` at root invokes PM2; these change running services.
- Piston script syntax checks: `bash -n scripts/piston/preflight.sh`; `node --check scripts/piston/provision.mjs`; `node --check scripts/piston/smoke.mjs`.
- Do not run deployment, seed, migration, admin bootstrap, cleanup, load tests, or Terraform apply as incidental verification.

## Codebase map
- New REST endpoints: `backend-nestjs/src/<domain>/<domain>.controller.ts`; register providers/controllers in the matching `.module.ts` and new modules in `src/app.module.ts`. Learning module routes are organized under `backend-nestjs/src/learning/controllers/` and bugs under `src/bugs/`.
- Business logic: matching `.service.ts`; admin cross-domain logic is `backend-nestjs/src/admin/admin.service.ts` with controllers in `src/admin/controllers/`.
- Request DTOs: domain `dto/`; use runtime class-validator decorators, not just TypeScript interfaces.
- Entities: `backend-nestjs/src/database/entities/`; register in `database.module.ts` and relevant `TypeOrmModule.forFeature` imports.
- Schema changes: `backend-nestjs/src/database/migrations/`; inspect runner `src/database/run-practice-submission-source.ts` before changing migration wiring.
- Submission reads/writes: `backend-nestjs/src/database/sharding/submission-store.ts`; do not bypass with primary-repository SQL.
- Judge/provider changes: `backend-nestjs/src/execution/`, language adapters and output comparison; Piston in `src/execution/piston/`.
- Auth/security: `backend-nestjs/src/auth/`, `src/common/guards/`, `src/redis/otp.service.ts`, `src/exam-security/`.
- Shared backend concerns: `backend-nestjs/src/common/`, `src/config/`, `src/redis/`, `src/gateway/`, `src/emails/`, `src/s3/`.
- Frontend routes: `frontend-v2/src/app/`; shared UI/editor/report components: `src/components/`; hooks: `src/hooks/`.
- All browser HTTP wrappers: `frontend-v2/src/config/api.ts`; URL behavior: `src/lib/api-base-url.ts`; async run polling: `src/lib/await-execution.ts`.
- State: `frontend-v2/src/context/`, `src/store/`, route-local `_store/`; shared pure helpers/types: `src/lib/`, `src/types/`.
- Infra: `terraform/environments/{dev,production}/main.tf`, reusable `terraform/modules/`; execution host: `deployment/piston/`; CI: `.github/workflows/`.

## Conventions to preserve
- Backend uses kebab-case filenames with `.controller.ts`, `.service.ts`, `.module.ts`, `.entity.ts`, `.dto.ts`; PascalCase classes and camelCase methods.
- Use Nest constructor injection, `private readonly`, `@InjectRepository(Entity)` repositories and `@InjectQueue('submissions')`; follow matching module exports/imports.
- Prefer thin controllers and service-side policy checks. Existing `any` payloads are technical debt, not a requirement for new code.
- Use DTO classes with `@Is*`, `@ValidateNested`, and `@Type` for nested bodies; global pipe strips unknown fields and transforms values (`src/main.ts`).
- Preserve database column names/types and API compatibility; mixed snake_case/camelCase exists. Do not casually rename `mongoId`, `_id`, or JSONB structures.
- No AutoMapper convention exists: mapping is explicit in services/serializers. Follow public field projections and never spread credential-bearing entities into responses.
- `id` is canonical UUID; `_id` aliases remain for clients. Problem source is `problem|metadata|question`; use `ProblemsService.getExecutionProblem` for authoritative judge content.
- Never accept client verdicts/marks as authoritative; keep hidden tests/reference solutions out of public DTOs, tutor context and socket payloads.
- Preserve response shapes: objects already containing `success` pass through; arrays become `{success:true,data}`; ordinary objects are spread beside `success` (`common/interceptors/response.interceptor.ts`).
- Throw Nest HTTP exceptions for domain failures; unknown errors are sanitized by `common/filters/http-exception.filter.ts`.
- Add explicit `JwtAuthGuard` and appropriate role/ownership checks; there is no global auth guard. UI route gating is not authorization.
- Preserve tokenVersion/active-account checks and hash-only refresh persistence; follow `auth/token.service.ts` and `auth/password.util.ts`.
- Use `SubmissionStore` and include `userId` for shard-local operations; maintain retry/idempotency and hidden-result redaction in `execution/judge.processor.ts`.
- Use parameterized SQL/TypeORM parameters; keep DB transactions scoped to their owning database. Redis/queue and primary/shard writes are not one atomic transaction.
- Frontend: PascalCase components, `useX` hooks, App Router `page.tsx`/`layout.tsx`; `@/` maps to `src/`. Add `"use client"` where browser APIs/hooks require it.
- Reuse `config/api.ts`, context providers, shared UI and existing Zustand stores; retain draft storage keys and cleanup/cancellation behavior.
- Match local file formatting; backend Prettier settings are in `.prettierrc`, lint in `eslint.config.mjs`; frontend uses Next core-web-vitals/TypeScript lint rules.
- Backend tests: colocated `*.spec.ts`, Jest mocks/Nest testing modules; frontend: `src/__tests__/**/*.test.ts(x)` or colocated utility tests, Testing Library/jsdom.
- Follow behavioral examples in `backend-nestjs/src/questions/questions.service.spec.ts` and `frontend-v2/src/__tests__/components/PublicProblems.test.tsx`; cover auth boundaries, error paths and cleanup for relevant changes.
- Run only appropriate checks and report actual results; a frontend build is not type safety because `frontend-v2/next.config.ts` ignores type errors.

## Environment and operational gotchas
- Backend loads dotenv via ConfigModule. Start from `backend-nestjs/`; export process-role/environment switches before launch because `execution.module.ts` evaluates registration at import time.
- Explicitly set `NODE_ENV=development|test` locally. Outside those modes, `JWT_SECRET` must pass 32+ character/entropy/placeholder checks and access TTL must be <=24h (`config/jwt.config.ts`).
- Examples are stale: their placeholder secret and `JWT_EXPIRE=30d` fail strict startup. Do not copy examples directly into production.
- DB: supply `DATABASE_URL` or `DATABASE_HOST/PORT/USER/PASSWORD/NAME/SSL`. `DB_SYNCHRONIZE=true` is only for deliberate disposable nonproduction initialization and is forbidden with shards.
- Redis: configure host/port/password and consistent cluster/TLS settings. BullMQ uses production=>Cluster while RedisService/Socket.IO use explicit flags (`src/app.module.ts`, `src/redis/redis.service.ts`).
- Execution: `CODE_EXECUTION_PROVIDER=legacy|piston`; production legacy needs Docker and approved images (`execution/language-adapters.ts`). Local execution is forbidden in production.
- Piston needs `PISTON_BASE_URL` and reviewed `PISTON_RUNTIME_VERSIONS`; read `deployment/piston/backend.env.example` and `docs/piston-audit.md`. Never provision privileged Piston on the app/shared CI host.
- Frontend: `NEXT_PUBLIC_API_URL`, optional `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_WS_URL`; backend Google client ID must match. Gateway origins use `CORS_ORIGIN`/`FRONTEND_URL`, not `CLIENT_URL`.
- `INTERNAL_BACKEND_URL` is consumed both as Axios base and whole rewrite destination; check wildcard/path semantics in `frontend-v2/next.config.ts` before overriding.
- SES uses `AWS_SES_SENDER` (not only `AWS_SES_EMAIL`); S3 requires `AWS_S3_BUCKET_NAME`; use AWS credential chain/managed environment. AI keys are optional (`src/pet/pet.service.ts`).
- Shards: same `SUBMISSION_SHARDS`/bucket map on all API/judge processes; remote shards require verified TLS. Never disable sharding to roll back after cutover.
- Schema runner: `(cd backend-nestjs && NODE_ENV=production node dist/database/run-practice-submission-source.js)` loads dotenv via `dotenv.config()` and applies auth tokens, declarative partitioning, contest security, assessment targeting/proctoring captures/modes/resume limits, bug reports, learning module, and problem default language migrations under a transactional PostgreSQL advisory lock (`pg_advisory_xact_lock`). It is not merely a source-column patch.
- Shard cutover: `(cd backend-nestjs && npm run db:shards:migrate -- --apply --writers-stopped)` only after backup and stopping/draining ALL writers; verify with `npm run db:shards:verify` in that package.
- Read `backend-nestjs/docs/submission-sharding.md` before cutover. Primary-only `scripts/backup.sh` does not back up shards.
- Known fragile paths: assessment grading duplicate-response handling; contest completion bypasses shards; editor sample verdict differs from final saved verdict; separate worker gateway emits lack a server. See `ARCHITECTURE.md` before touching these flows.
- Frontend refresh and logout are wired to backend token rotation and revocation via `/auth/refresh` and `/auth/logout`; anti-cheat socket transmits the authenticated bearer token in `auth.token` and `extraHeaders`.

## Do-not-touch zones and side effects
- Never hand-edit dependency/generated outputs: `node_modules/`, `nodemodules/`, `dist/`, `build/`, `target/`, `.next/`, coverage, `*.tsbuildinfo`, generated `next-env.d.ts`.
- `backend-nestjs/src/schema.gql` is generated by GraphQL startup; edit resolvers/types instead (`src/app.module.ts`).
- Preserve `.git/`, Terraform state/`.terraform/`, local secrets, uploads, logs, database volumes/backups, and user data; never commit their contents.
- Do not edit lockfiles manually; regenerate only for authorized dependency changes. Read-only exploration must exclude them when requested.
- Do not run `fix-*.sh`, `deploy-ec2-no-docker.sh`, `scripts/deploy.sh`, seed scripts, or root manual API probes without inspecting side effects and target environment.
- Existing root/new frontend refactor scripts are one-off transformations, not normal build steps. Do not run them as cleanup.
- For a read-only task, do not start the app (schema generation/processors), install, build, autofix, or run database integration tests. Write only explicitly requested deliverables.
