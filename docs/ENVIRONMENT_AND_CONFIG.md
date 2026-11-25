# CodeSkill Environment Variables & Configuration Reference

> **Ground-Truth Audit Document**  
> Source of truth: Monorepo code on `origin/main`. Covers 100% of environment variables, runtime flags, and process modes across `backend-nestjs`, `frontend-v2`, `scripts`, `deployment`, and `terraform`.

---

## Table of Contents

- [1. Global Process Roles and Runtime Modes](#1-global-process-roles-and-runtime-modes)
- [2. Complete Environment Variable Catalog](#2-complete-environment-variable-catalog)
- [3. Core Backend API & Worker Configuration](#3-core-backend-api--worker-configuration)
- [4. Database, Sharding, and Cache Configuration](#4-database-sharding-and-cache-configuration)
- [5. Code Execution & Judge Sandboxing Configuration](#5-code-execution--judge-sandboxing-configuration)
- [6. Authentication, Security, and Session Invariants](#6-authentication-security-and-session-invariants)
- [7. External Integrations & Webhooks (Alerting, S3, Email)](#7-external-integrations--webhooks-alerting-s3-email)
- [8. Frontend Next.js Client & Server Configuration](#8-frontend-nextjs-client--server-configuration)
- [9. Scripts & CI/CD Pipelines](#9-scripts--cicd-pipelines)
- [10. Production Environment Templates (.env.example)](#10-production-environment-templates-envexample)

---

## 1. Global Process Roles and Runtime Modes

CodeSkill processes are governed by the `PROCESS_ROLE` environment variable (`backend-nestjs/src/main.ts` and `worker.ts`):

| Process Role (`PROCESS_ROLE`) | Entrypoint | Primary Responsibilities | Enabled Modules | Concurrency / Clustering |
| :--- | :--- | :--- | :--- | :--- |
| `api` (or unset / default) | `dist/main.js` | HTTP REST endpoints, GraphQL query, WebSocket gateway, auth, questions, learning, admin. | All application modules except execution queue processor. | PM2 Cluster or Fork mode (`API_INSTANCES`, default: 1). |
| `judge` | `dist/worker.js` | Pulls submissions from Redis BullMQ (`submissions` queue) and runs code in Docker/Piston/Judge0. | `ExecutionModule`, BullMQ Worker processor. | Fork mode (`JUDGE_WORKER_INSTANCES`, default: 1, concurrency: 4). |

### Runtime Feature Flags

| Flag Name | Expected Values | Source Location | Default | Runtime Effect |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | `development`, `test`, `production` | Root, Backend, Frontend | `development` | Dictates strictness of JWT validation, cookie security, TLS enforcement, and database synchronization. |
| `ENABLE_EMBEDDED_JUDGE` | `true`, `false` | `backend-nestjs/src/execution/execution.module.ts` | `false` | When `true`, enables the BullMQ submission queue consumer inside the API process. In production, this MUST be `false` to isolate judge execution to separate workers. |
| `CODE_EXECUTION_PROVIDER` | `piston`, `judge0`, `legacy` | `backend-nestjs/src/execution/execution.service.ts` | `piston` | Determines which sandboxed execution backend is invoked for coding assessments. |
| `JUDGE_SANDBOX` | `docker`, `local` | `backend-nestjs/src/execution/execution.service.ts` | `docker` | When `docker`, runs submissions in isolated container environments with cgroup limits. `local` is forbidden in production. |
| `DB_SYNCHRONIZE` | `true`, `false` | `backend-nestjs/src/app.module.ts` | `false` | When `true`, automatically syncs TypeORM entities to database schema on startup. Strictly forbidden in production and incompatible with sharding. |

---

## 2. Complete Environment Variable Catalog

Below is the inventory of environment variable keys identified across the codebase:

| Variable Name | Referenced Subsystem(s) | Data Type | Default Value | Required? | Behavior When Missing / Unset |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ADMIN_BOOTSTRAP_EMAIL` | `backend-nestjs/src/create-admins.ts:18`<br>`backend-nestjs/src/database/database-auto-migration.service.ts:165` | String | `admin@codeskill.ac.in` | Optional | Runtime fallback or validation error. |
| `ADMIN_BOOTSTRAP_NAME` | `backend-nestjs/src/create-admins.ts:20`<br>`backend-nestjs/src/database/database-auto-migration.service.ts:170` | String | `Super Administrator` | Optional | Runtime fallback or validation error. |
| `ADMIN_BOOTSTRAP_PASSWORD` | `backend-nestjs/src/create-admins.ts:19`<br>`backend-nestjs/src/database/database-auto-migration.service.ts:168` | Secret string | `Admin@CodeSkill2026!` | Optional | Runtime fallback or validation error. |
| `ADMIN_CUCHD_PASSWORD` | `scripts/create_admin.js:61` | Secret string | `Admin@CodeSkill2026` | Optional | Runtime fallback or validation error. |
| `ADMIN_PASSWORD` | `scripts/create_admin.js:55`<br>`scripts/create_admin.js:67` | Secret string | `admin123` | Optional | Runtime fallback or validation error. |
| `ALERT_WEBHOOK_URL` | `backend-nestjs/src/audit/alert-webhook.service.ts:27`<br>`backend-nestjs/src/audit/alert-webhook.service.ts:28` | URL string | *None* | Optional | Runtime fallback or validation error. |
| `API_INSTANCES` | `ecosystem.config.js:22`<br>`ecosystem.config.js:23` | String | `1` | Optional | Runtime fallback or validation error. |
| `AWS_ACCESS_KEY_ID` | `backend-nestjs/src/config/index.ts:32`<br>`backend-nestjs/src/s3/s3-presigner.util.ts:48`<br>`backend-nestjs/src/s3/s3.service.ts:30`<br>*(and 1 more)* | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `AWS_REGION` | `backend-nestjs/src/config/index.ts:35`<br>`backend-nestjs/src/execution/runtime-config.ts:31`<br>`backend-nestjs/src/s3/s3.service.ts:108`<br>*(and 3 more)* | String | `ap-south-1`, `us-east-1` | Optional | Runtime fallback or validation error. |
| `AWS_S3_BUCKET_NAME` | `backend-nestjs/src/s3/s3.service.ts:25` | String | *None* | Optional | Runtime fallback or validation error. |
| `AWS_SECRET_ACCESS_KEY` | `backend-nestjs/src/config/index.ts:33`<br>`backend-nestjs/src/s3/s3-presigner.util.ts:49`<br>`backend-nestjs/src/s3/s3.service.ts:30`<br>*(and 1 more)* | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `AWS_SESSION_TOKEN` | `backend-nestjs/src/config/index.ts:34` | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `AWS_SES_SENDER` | `backend-nestjs/src/config/index.ts:36` | String | `noreply@cuchd.in` | Optional | Runtime fallback or validation error. |
| `AXIOM_DATASET` | `backend-nestjs/src/main.ts:54`<br>`backend-nestjs/src/main.ts:59`<br>`backend-nestjs/src/observability/logger/logger.module.ts:19`<br>*(and 3 more)* | String | *None* | Optional | Runtime fallback or validation error. |
| `AXIOM_EDGE_URL` | `backend-nestjs/src/main.ts:61`<br>`backend-nestjs/src/observability/logger/axiom.winston-transport.ts:27`<br>`backend-nestjs/src/observability/logger/logger.module.ts:36`<br>*(and 1 more)* | URL string | `https://eu-central-1.aws.edge.axiom.co` | Optional | Runtime fallback or validation error. |
| `AXIOM_ORG_ID` | `backend-nestjs/src/observability/logger/logger.module.ts:34` | String | *None* | Optional | Runtime fallback or validation error. |
| `AXIOM_TOKEN` | `backend-nestjs/src/main.ts:54`<br>`backend-nestjs/src/main.ts:60`<br>`backend-nestjs/src/observability/logger/logger.module.ts:19`<br>*(and 3 more)* | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `BCRYPT_ROUNDS` | `backend-nestjs/src/auth/password.util.ts:41` | String | *None* | Optional | Runtime fallback or validation error. |
| `CODESKILL_STAGING_API` | `scripts/piston/load.mjs:7` | String | *None* | Optional | Runtime fallback or validation error. |
| `CODE_EXECUTION_PROVIDER` | `backend-nestjs/src/execution/execution.service.spec.ts:13`<br>`backend-nestjs/src/execution/execution.service.spec.ts:14`<br>`backend-nestjs/src/execution/execution.service.spec.ts:6`<br>*(and 18 more)* | String | `piston` | Optional | Runtime fallback or validation error. |
| `CREDENTIAL_ENCRYPTION_KEY` | `backend-nestjs/src/students/utils/credential-crypto.util.ts:9` | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `DATABASE_CA_CERT` | `backend-nestjs/src/database/database.module.ts:134` | String | *None* | Optional | Runtime fallback or validation error. |
| `DATABASE_HOST` | `backend-nestjs/src/config/index.ts:11` | String | `localhost` | Optional | Runtime fallback or validation error. |
| `DATABASE_NAME` | `backend-nestjs/src/config/index.ts:15` | String | `codeskill` | Optional | Runtime fallback or validation error. |
| `DATABASE_PASSWORD` | `backend-nestjs/src/config/index.ts:14` | Secret string | `postgres` | Optional | Runtime fallback or validation error. |
| `DATABASE_PORT` | `backend-nestjs/src/config/index.ts:12` | Integer | `5432` | Optional | Runtime fallback or validation error. |
| `DATABASE_SSL` | `backend-nestjs/src/config/index.ts:16`<br>`scripts/create_admin.js:31`<br>`scripts/create_named_accounts.js:79` | Boolean (`true`/`false`) | *None* | Optional | Runtime fallback or validation error. |
| `DATABASE_SSL_CA` | `backend-nestjs/src/database/database.module.ts:135`<br>`backend-nestjs/src/database/database.module.ts:136` | Boolean (`true`/`false`) | *None* | Optional | Runtime fallback or validation error. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `backend-nestjs/src/database/database.module.ts:130`<br>`backend-nestjs/src/database/database.module.ts:131` | Boolean (`true`/`false`) | *None* | Optional | Runtime fallback or validation error. |
| `DATABASE_URL` | `backend-nestjs/seed_users.js:6`<br>`backend-nestjs/src/config/index.ts:17`<br>`backend-nestjs/test/assessment-proctoring-schema.integration.ts:11`<br>*(and 8 more)* | URL string | `postgres://localhost:5432/codeskill`, `postgres://postgres:password123@127.0.0.1:5432/codeskill`, `postgres://postgres:password123@127.0.0.1:5432/codeskill_pg` | Optional | Runtime fallback or validation error. |
| `DATABASE_USER` | `backend-nestjs/src/config/index.ts:13` | String | `postgres` | Optional | Runtime fallback or validation error. |
| `DB_POOL_CONN_TIMEOUT` | `backend-nestjs/src/database/database.module.ts:126` | Integer | `5000` | Optional | Runtime fallback or validation error. |
| `DB_POOL_IDLE_TIMEOUT` | `backend-nestjs/src/database/database.module.ts:125` | Integer | `30000` | Optional | Runtime fallback or validation error. |
| `DB_POOL_MAX` | `backend-nestjs/src/database/database.module.ts:123` | String | `50` | Optional | Runtime fallback or validation error. |
| `DB_POOL_MIN` | `backend-nestjs/src/database/database.module.ts:124` | String | `5` | Optional | Runtime fallback or validation error. |
| `DB_SSL` | `scripts/create_admin.js:31` | Boolean (`true`/`false`) | *None* | Optional | Runtime fallback or validation error. |
| `DB_SYNCHRONIZE` | `backend-nestjs/src/database/database.module.ts:117` | Boolean (`true`/`false`) | *None* | Optional | Runtime fallback or validation error. |
| `DISABLE_AUTO_MIGRATION` | `backend-nestjs/src/database/database-auto-migration.service.ts:24` | String | *None* | Optional | Runtime fallback or validation error. |
| `DOCKER_PATH` | `backend-nestjs/src/execution/execution.service.ts:901` | String | *None* | Optional | Runtime fallback or validation error. |
| `ENABLE_EMBEDDED_JUDGE` | `backend-nestjs/src/execution/execution.module.ts:23` | Boolean (`true`/`false`) | *None* | Optional | Runtime fallback or validation error. |
| `ENABLE_GOOGLE_LOGIN` | `backend-nestjs/src/config/index.ts:40` | Boolean (`true`/`false`) | *None* | Optional | Runtime fallback or validation error. |
| `EXAM_CENTER_SECRET` | `backend-nestjs/src/common/guards/smart-throttler.guard.ts:44` | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `GITHUB_CLIENT_ID` | `backend-nestjs/src/config/index.ts:43` | String | *None* | Optional | Runtime fallback or validation error. |
| `GITHUB_CLIENT_SECRET` | `backend-nestjs/src/config/index.ts:44` | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `GOOGLE_CLIENT_ID` | `backend-nestjs/src/config/index.ts:41` | String | *None* | Optional | Runtime fallback or validation error. |
| `GOOGLE_CLIENT_SECRET` | `backend-nestjs/src/config/index.ts:42` | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `HOME` | `backend-nestjs/src/execution/execution.service.ts:1210` | String | *None* | Optional | Runtime fallback or validation error. |
| `INTERNAL_BACKEND_URL` | `frontend-v2/next.config.ts:45`<br>`frontend-v2/next.config.ts:49`<br>`frontend-v2/src/config/api.ts:14` | URL string | `http://127.0.0.1:5001/api`, `http://127.0.0.1:5001/api/:path*` | Optional | Runtime fallback or validation error. |
| `JAVA_HOME` | `backend-nestjs/src/execution/execution.service.ts:1225` | String | *None* | Optional | Runtime fallback or validation error. |
| `JUDGE0_API_HOST` | `backend-nestjs/src/execution/judge0/judge0.config.ts:38` | String | *None* | Optional | Runtime fallback or validation error. |
| `JUDGE0_API_KEY` | `backend-nestjs/src/execution/judge0/judge0.config.ts:37` | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `JUDGE0_AUTH_TOKEN` | `backend-nestjs/src/execution/judge0/judge0.config.ts:36`<br>`backend-nestjs/src/execution/judge0/judge0.service.spec.ts:13`<br>`backend-nestjs/src/observability/metrics/sandbox-telemetry.service.ts:202`<br>*(and 1 more)* | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `JUDGE0_BASE_URL` | `backend-nestjs/src/observability/metrics/sandbox-telemetry.service.ts:192`<br>`backend-nestjs/test/judges-live.integration.ts:13`<br>`backend-nestjs/test/judges-live.integration.ts:133`<br>*(and 3 more)* | URL string | `http://127.0.0.1:2358` | Optional | Runtime fallback or validation error. |
| `JUDGE0_BASE_URLS` | `backend-nestjs/src/execution/runtime-config.ts:43`<br>`backend-nestjs/test/judges-live.integration.ts:22` | URL string | *None* | Optional | Runtime fallback or validation error. |
| `JUDGE0_LANGUAGE_IDS` | `backend-nestjs/src/execution/judge0/judge0.config.ts:14` | String | *None* | Optional | Runtime fallback or validation error. |
| `JUDGE0_POLL_INTERVAL_MS` | `backend-nestjs/src/execution/judge0/judge0.service.spec.ts:14` | Integer | *None* | Optional | Runtime fallback or validation error. |
| `JUDGE0_URL` | `backend-nestjs/src/observability/metrics/sandbox-telemetry.service.ts:192` | URL string | *None* | Optional | Runtime fallback or validation error. |
| `JUDGE_CONFIG_PARAMETER` | `backend-nestjs/src/execution/runtime-config.ts:20`<br>`backend-nestjs/src/execution/runtime-config.ts:21` | String | *None* | Optional | Runtime fallback or validation error. |
| `JUDGE_CPP_IMAGE` | `backend-nestjs/src/execution/language-adapters.ts:153` | String | `gcc:13` | Optional | Runtime fallback or validation error. |
| `JUDGE_C_IMAGE` | `backend-nestjs/src/execution/language-adapters.ts:435` | String | `gcc:13` | Optional | Runtime fallback or validation error. |
| `JUDGE_JAVA_IMAGE` | `backend-nestjs/src/execution/language-adapters.ts:226` | String | `eclipse-temurin:17-jdk` | Optional | Runtime fallback or validation error. |
| `JUDGE_NODE_IMAGE` | `backend-nestjs/src/execution/language-adapters.ts:356`<br>`backend-nestjs/src/execution/language-adapters.ts:396` | String | `node:20-alpine` | Optional | Runtime fallback or validation error. |
| `JUDGE_PYTHON_IMAGE` | `backend-nestjs/src/execution/language-adapters.ts:316` | String | `python:3.12-alpine` | Optional | Runtime fallback or validation error. |
| `JUDGE_SANDBOX` | `backend-nestjs/src/execution/execution.service.ts:872`<br>`ecosystem.config.js:59` | String | `docker` | Optional | Runtime fallback or validation error. |
| `JUDGE_TIME_LIMIT_MULTIPLIER` | `backend-nestjs/src/execution/judge0/judge0.service.spec.ts:133` | Integer | *None* | Optional | Runtime fallback or validation error. |
| `JUDGE_TS_IMAGE` | `backend-nestjs/src/execution/language-adapters.ts:395` | String | *None* | Optional | Runtime fallback or validation error. |
| `JUDGE_WORKER_INSTANCES` | `ecosystem.config.js:46` | String | `1` | Optional | Runtime fallback or validation error. |
| `JWT_SECRET` | `backend-nestjs/src/exam-security/exam-security.service.ts:166`<br>`backend-nestjs/src/students/utils/credential-crypto.util.ts:10`<br>`backend-nestjs/test-admin-token.js:6` | Secret string | `codeskill-secure-exam-token-secret`, `secret` | Optional | Runtime fallback or validation error. |
| `LINKEDIN_CLIENT_ID` | `backend-nestjs/src/config/index.ts:45` | String | *None* | Optional | Runtime fallback or validation error. |
| `LINKEDIN_CLIENT_SECRET` | `backend-nestjs/src/config/index.ts:46` | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `LOG_LEVEL` | `backend-nestjs/src/observability/logger/logger.module.ts:13`<br>`backend-nestjs/src/observability/logger/logger.module.ts:30`<br>`backend-nestjs/src/observability/logger/logger.module.ts:44` | String | `info` | Optional | Runtime fallback or validation error. |
| `MAX_CONCURRENT_JOBS_PER_USER` | `backend-nestjs/test/judge-resilience.integration.ts:21` | String | *None* | Optional | Runtime fallback or validation error. |
| `MAX_QUEUE_WAITING` | `backend-nestjs/src/assessments/assessments.service.ts:2456`<br>`backend-nestjs/src/execution/execution.controller.ts:307`<br>`backend-nestjs/test/judge-resilience.integration.ts:22` | String | `0`, `500` | Optional | Runtime fallback or validation error. |
| `METRICS_SCRAPE_TOKEN` | `backend-nestjs/src/observability/metrics/metrics.controller.spec.ts:64`<br>`backend-nestjs/src/observability/metrics/metrics.controller.spec.ts:72`<br>`backend-nestjs/src/observability/metrics/metrics.controller.ts:16` | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `NEXT_PUBLIC_API_URL` | `deploy-ec2-no-docker.sh:56`<br>`frontend-v2/.env.example:1`<br>`frontend-v2/src/config/api.ts:12`<br>*(and 4 more)* | URL string | `http://127.0.0.1:5001/api` | Optional | Runtime fallback or validation error. |
| `NEXT_PUBLIC_APP_URL` | `frontend-v2/src/__tests__/utils/seo.test.ts:20`<br>`frontend-v2/src/__tests__/utils/seo.test.ts:45`<br>`frontend-v2/src/__tests__/utils/seo.test.ts:93`<br>*(and 2 more)* | URL string | *None* | Optional | Runtime fallback or validation error. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `frontend-v2/.env.example:10`<br>`frontend-v2/src/config/auth.ts:1` | String | *None* | Optional | Runtime fallback or validation error. |
| `NEXT_PUBLIC_SITE_URL` | `frontend-v2/.env.example:5`<br>`frontend-v2/src/__tests__/utils/seo.test.ts:19`<br>`frontend-v2/src/__tests__/utils/seo.test.ts:27`<br>*(and 5 more)* | URL string | *None* | Optional | Runtime fallback or validation error. |
| `NEXT_PUBLIC_SOCKET_URL` | `frontend-v2/src/__tests__/utils/seo.test.ts:21`<br>`frontend-v2/src/__tests__/utils/seo.test.ts:46`<br>`frontend-v2/src/__tests__/utils/seo.test.ts:94`<br>*(and 4 more)* | URL string | *None* | Optional | Runtime fallback or validation error. |
| `NEXT_PUBLIC_WS_URL` | `frontend-v2/src/hooks/anti-cheat/useAntiCheatMaster.ts:40` | URL string | *None* | Optional | Runtime fallback or validation error. |
| `NODE_ENV` | `backend-nestjs/src/auth/auth.service.ts:746`<br>`backend-nestjs/src/auth/password.util.ts:46`<br>`backend-nestjs/src/common/cors.util.ts:39`<br>*(and 27 more)* | String | `development`, `production` | Optional | Runtime fallback or validation error. |
| `OPENROUTER_API_KEY` | `backend-nestjs/src/pet/pet.service.ts` | Secret string | *None* | Optional | Byte serves built-in hints. |
| `OPENROUTER_MODEL` | `backend-nestjs/src/pet/pet.service.ts` | String | `openrouter/free` | Optional | Byte uses the Free Models Router. |
| `OTP_PEPPER` | `backend-nestjs/src/redis/otp.service.ts:92` | String | *None* | Optional | Runtime fallback or validation error. |
| `PATH` | `backend-nestjs/src/execution/execution.service.ts:1213` | String | *None* | Optional | Runtime fallback or validation error. |
| `PISTON_API_KEY` | `backend-nestjs/src/execution/piston/piston.config.ts:63` | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `PISTON_BASE_URL` | `backend-nestjs/src/observability/health/health.controller.ts:38`<br>`backend-nestjs/test/judges-live.integration.ts:14` | URL string | `http://127.0.0.1:2001/api/v2` | Optional | Runtime fallback or validation error. |
| `PISTON_BASE_URLS` | `backend-nestjs/src/execution/runtime-config.ts:44`<br>`backend-nestjs/test/judges-live.integration.ts:22` | URL string | *None* | Optional | Runtime fallback or validation error. |
| `PISTON_GLOBAL_MAX_CONCURRENT` | `backend-nestjs/src/execution/piston/piston.load.spec.ts:54` | String | *None* | Optional | Runtime fallback or validation error. |
| `PISTON_LIVE_TESTS` | `scripts/piston/load.mjs:5`<br>`scripts/piston/smoke.mjs:3` | String | *None* | Optional | Runtime fallback or validation error. |
| `PISTON_MAX_CONCURRENT_EXECUTIONS` | `backend-nestjs/src/execution/piston/piston.service.spec.ts:107` | String | *None* | Optional | Runtime fallback or validation error. |
| `PISTON_PROVISION_URL` | `scripts/piston/provision.mjs:7` | URL string | `http://127.0.0.1:2001/api/v2` | Optional | Runtime fallback or validation error. |
| `PISTON_RUNTIME_VERSIONS` | `backend-nestjs/src/execution/piston/piston.config.ts:49`<br>`backend-nestjs/src/execution/piston/piston.load.spec.ts:41`<br>`backend-nestjs/src/execution/piston/piston.service.spec.ts:23` | String | `{}` | Optional | Runtime fallback or validation error. |
| `PISTON_TEST_BASE_URL` | `scripts/piston/smoke.mjs:7` | URL string | `http://127.0.0.1:2001/api/v2` | Optional | Runtime fallback or validation error. |
| `PISTON_TEST_COMPILE_TIMEOUT_MS` | `scripts/piston/smoke.mjs:9` | Integer | `10000` | Optional | Runtime fallback or validation error. |
| `PISTON_TEST_RUN_TIMEOUT_MS` | `scripts/piston/smoke.mjs:8` | Integer | `3000` | Optional | Runtime fallback or validation error. |
| `PISTON_TRUSTED_PROVISIONING` | `scripts/piston/provision.mjs:6` | String | *None* | Optional | Runtime fallback or validation error. |
| `PISTON_URL` | `backend-nestjs/src/observability/health/health.controller.ts:37` | URL string | *None* | Optional | Runtime fallback or validation error. |
| `PORT` | `backend-nestjs/src/config/index.ts:5`<br>`backend-nestjs/src/main.ts:165`<br>`deployment/monitoring/uptime-kuma/whatsapp-relay.js:8` | Integer | `3002`, `5001` | Optional | Runtime fallback or validation error. |
| `PROCESS_ROLE` | `backend-nestjs/src/execution/execution.module.ts:21`<br>`backend-nestjs/src/execution/execution.module.ts:22`<br>`backend-nestjs/src/execution/execution.module.ts:24`<br>*(and 1 more)* | String | *None* | Optional | Runtime fallback or validation error. |
| `RECIPIENT_PHONE_NUMBER` | `deployment/monitoring/uptime-kuma/whatsapp-relay.js:11` | String | *None* | Optional | Runtime fallback or validation error. |
| `REDIS_CLUSTER_MODE` | `backend-nestjs/src/app.module.ts:86`<br>`backend-nestjs/src/gateway/redis-io.adapter.ts:17`<br>`backend-nestjs/src/observability/metrics/metrics.service.ts:121`<br>*(and 1 more)* | Boolean (`true`/`false`) | *None* | Optional | Runtime fallback or validation error. |
| `REDIS_CLUSTER_NODES` | `backend-nestjs/src/app.module.ts:94`<br>`backend-nestjs/src/app.module.ts:95`<br>`backend-nestjs/src/observability/metrics/metrics.service.ts:129`<br>*(and 2 more)* | Boolean (`true`/`false`) | *None* | Optional | Runtime fallback or validation error. |
| `REDIS_ENABLE_CLUSTER` | `backend-nestjs/src/app.module.ts:87`<br>`backend-nestjs/src/gateway/redis-io.adapter.ts:18`<br>`backend-nestjs/src/observability/metrics/metrics.service.ts:122`<br>*(and 1 more)* | Boolean (`true`/`false`) | *None* | Optional | Runtime fallback or validation error. |
| `REDIS_HOST` | `backend-nestjs/src/config/index.ts:22`<br>`backend-nestjs/src/observability/metrics/metrics.service.ts:115`<br>`backend-nestjs/src/observability/metrics/metrics.service.ts:124` | String | `127.0.0.1` | Optional | Runtime fallback or validation error. |
| `REDIS_PASSWORD` | `backend-nestjs/src/config/index.ts:24`<br>`backend-nestjs/src/observability/metrics/metrics.service.ts:126` | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `REDIS_PORT` | `backend-nestjs/src/config/index.ts:23`<br>`backend-nestjs/src/observability/metrics/metrics.service.ts:125` | Integer | `6379` | Optional | Runtime fallback or validation error. |
| `REDIS_TLS` | `backend-nestjs/src/app.module.ts:91`<br>`backend-nestjs/src/gateway/redis-io.adapter.ts:25`<br>`backend-nestjs/src/observability/metrics/metrics.service.ts:127`<br>*(and 1 more)* | String | *None* | Optional | Runtime fallback or validation error. |
| `REDIS_URL` | `backend-nestjs/src/config/index.ts:25`<br>`backend-nestjs/test/judge-resilience.integration.ts:11`<br>`backend-nestjs/test/judges-live.integration.ts:15`<br>*(and 3 more)* | URL string | `redis://127.0.0.1:6379` | Optional | Runtime fallback or validation error. |
| `RUNNER_ID` | `backend-nestjs/src/execution/judge.processor.ts:43` | String | *None* | Optional | Runtime fallback or validation error. |
| `SERVICE_NAME` | `backend-nestjs/src/observability/logger/axiom.winston-transport.ts:22`<br>`backend-nestjs/src/observability/logger/logger.module.ts:50` | String | `codeskill-backend` | Optional | Runtime fallback or validation error. |
| `SUBMISSIONS_QUEUE_NAME` | `backend-nestjs/src/observability/metrics/metrics.service.ts:140` | String | `submissions` | Optional | Runtime fallback or validation error. |
| `SUBMISSION_RATE_LIMIT_PER_MINUTE` | `backend-nestjs/test/judge-resilience.integration.ts:20` | Integer | *None* | Optional | Runtime fallback or validation error. |
| `SUBMISSION_SHARDS` | `backend-nestjs/test/submission-sharding.integration.ts:55` | JSON array string | *None* | Optional | Runtime fallback or validation error. |
| `SWAGGER_ENABLED` | `backend-nestjs/src/main.ts:163` | Boolean (`true`/`false`) | *None* | Optional | Runtime fallback or validation error. |
| `USE_MOCK_SES` | `backend-nestjs/src/emails/email.service.ts:29` | String | *None* | Optional | Runtime fallback or validation error. |
| `WHATSAPP_API_TOKEN` | `deployment/monitoring/uptime-kuma/whatsapp-relay.js:9` | Secret string | *None* | Optional | Runtime fallback or validation error. |
| `WHATSAPP_PHONE_NUMBER_ID` | `deployment/monitoring/uptime-kuma/whatsapp-relay.js:10` | String | *None* | Optional | Runtime fallback or validation error. |
| `WORKER_CONCURRENCY` | `backend-nestjs/src/execution/judge.processor.ts:37` | Integer | `10` | Optional | Runtime fallback or validation error. |

---

## 3. Core Backend API & Worker Configuration

### `PORT`
- **Component:** Backend NestJS (`backend-nestjs/src/main.ts`, `ecosystem.config.js`)
- **Type:** Integer
- **Default:** `5001`
- **Description:** Port for HTTP and WebSocket listeners.

### `PROCESS_ROLE`
- **Component:** Backend process orchestrator (`src/app.module.ts`, `src/execution/execution.module.ts`)
- **Type:** Enum (`api` | `judge`)
- **Default:** `api`
- **Description:** Determines whether the process serves client HTTP/WS traffic (`api`) or consumes BullMQ code execution tasks (`judge`).

### `CORS_ORIGIN` / `FRONTEND_URL` / `CLIENT_URL`
- **Component:** Security / Gateway (`backend-nestjs/src/common/cors.util.ts`, `backend-nestjs/src/main.ts`)
- **Type:** String (Comma-separated URL list or single origin)
- **Default:** `http://localhost:3000`
- **Description:** Defines whitelisted browser origins for HTTP REST API requests and Socket.IO WebSockets. In production, wildcard `*` is explicitly rejected when credentials are enabled.

### `WORKER_CONCURRENCY`
- **Component:** BullMQ Judge Processor (`backend-nestjs/src/execution/judge.processor.ts`)
- **Type:** Integer
- **Default:** `4`
- **Description:** Number of simultaneous submissions evaluated by a single worker process.

---

## 4. Database, Sharding, and Cache Configuration

### PostgreSQL Primary Instance
| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Connection URL | *None* | Canonical PostgreSQL connection string (takes precedence over discrete params). |
| `DATABASE_HOST` | String | `localhost` | Hostname of primary PostgreSQL instance. |
| `DATABASE_PORT` | Integer | `5432` | Port of primary PostgreSQL instance. |
| `DATABASE_USER` | String | `postgres` | Database username. |
| `DATABASE_PASSWORD` | Secret String | `postgres` | Database password. |
| `DATABASE_NAME` | String | `codeskill` | Primary relational database name. |
| `DATABASE_SSL` | Boolean | `false` | Enables SSL/TLS for PostgreSQL connection (required in AWS RDS). |

### Submission Database Sharding
Submission storage uses a 128-bucket MD5 consistent sharding architecture (`submissions-user-md5-v1`):

| Variable | Type | Format | Description |
| :--- | :--- | :--- | :--- |
| `SUBMISSION_SHARDS` | JSON Array | `[{"id":"shard-a","url":"postgres://...","ssl":true}]` | Declares shard endpoints. If unset or empty, submissions default to the primary PostgreSQL database. |
| `SHARD_POOL_SIZE` | Integer | Default: `10` | Max connection pool size per shard database. |

### Redis Cache, BullMQ & Socket.IO Relay
| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `REDIS_URL` | Connection URL | *None* | Redis URI connection string. |
| `REDIS_HOST` | String | `127.0.0.1` | Redis host address. |
| `REDIS_PORT` | Integer | `6379` | Redis port. |
| `REDIS_PASSWORD` | Secret String | `""` (empty) | Redis authentication password. |
| `REDIS_CLUSTER` | Boolean | `false` | Enables Redis Cluster mode (used in AWS ElastiCache). |
| `REDIS_TLS` | Boolean | `false` | Enables TLS encryption for in-transit Redis commands. |

---

## 5. Code Execution & Judge Sandboxing Configuration

### Piston Execution Engine
| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `PISTON_BASE_URL` | URL | `http://127.0.0.1:2000` | Endpoint of the Piston API server. |
| `PISTON_TIMEOUT_MS` | Integer | `10000` | Execution timeout threshold in milliseconds. |
| `PISTON_API_KEY` | Secret String | *None* | Optional authentication header for private Piston clusters. |
| `PISTON_RUNTIME_VERSIONS` | JSON String | *None* | Override map for pinned compiler/interpreter package versions. |

### Judge0 Execution Engine
| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `JUDGE0_BASE_URL` | URL | `http://127.0.0.1:2358` | Endpoint of the Judge0 submission API. |
| `JUDGE0_API_KEY` | Secret String | *None* | API key for RapidAPI or self-hosted Judge0 instances. |
| `JUDGE0_API_HOST` | String | *None* | RapidAPI host header (if hosted through RapidAPI). |
| `JUDGE0_WAIT` | Boolean | `false` | Synchronous polling wait flag. |
| `JUDGE0_TIMEOUT_MS` | Integer | `10000` | Maximum submission evaluation wait time. |

### Execution Admission Control
| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `EXECUTION_MAX_CONCURRENT` | Integer | `50` | Global concurrency cap for active execution jobs across all nodes. |
| `EXECUTION_QUEUE_MAX_SIZE` | Integer | `1000` | Max queue depth before shedding non-assessment run requests. |

---

## 6. Authentication, Security, and Session Invariants

The authentication subsystem enforces strict cryptographic invariants at boot (`jwt.config.ts`):

| Variable | Type | Minimum Length | Strict Invariant |
| :--- | :--- | :--- | :--- |
| `JWT_SECRET` | Secret String | 32 characters | Outside `development` and `test`, missing or low-entropy secrets (< 8 unique characters) abort boot immediately. Placeholder secrets (e.g. `secret`, `changeme`, `supersecretcodeskilljwt`) are hard-blocked. |
| `JWT_ACCESS_TTL` | String / Sec | Default: `3600` (1h) | Must not exceed 24 hours (`86400s`). Formats supported: `900`, `15m`, `1h`, `24h`. |
| `JWT_REFRESH_TTL` | String / Sec | Default: `604800` (7d) | Refresh token lifespan before re-login is required. |
| `JWT_ISSUER` | String | Default: `codeskill` | JWT `iss` claim. |
| `JWT_AUDIENCE` | String | Default: `codeskill-web` | JWT `aud` claim. |

---

## 7. External Integrations & Webhooks (Alerting, S3, Email)

### Byte practice hints

An eligible team maintainer can enable model-generated hints in staging using the backend secret `OPENROUTER_API_KEY`. `OPENROUTER_MODEL` defaults to `openrouter/free` and accepts a specific `:free` model. Requests set a zero price ceiling and ask for no data collection and zero data retention. Review the team's provider privacy settings before enabling student traffic and leave the key unset to serve built-in hints only. [OpenRouter eligibility](https://openrouter.ai/terms#2-eligibility) · [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)

OpenRouter documents a shared free quota of 20 model requests per minute and 50 per day for an account with no purchased credits. Confirm the account's effective quota before enabling staging. Byte serves a built-in hint when the provider returns a rate limit, has no eligible endpoint, or times out. [OpenRouter rate limits](https://openrouter.ai/docs/api_reference/limits)

For the staging smoke test, sign in as a test learner, open a synthetic practice problem, and ask Byte a question that calls for a hint. Verify the reply is a single actionable hint and that the `POST /api/pet/ask` response has `source: openrouter`. Test quota and outage fallback with the mocked responses in `pet.service.spec.ts`.

### AWS Storage & Email Delivery
| Variable | Type | Description |
| :--- | :--- | :--- |
| `AWS_ACCESS_KEY_ID` | String | AWS IAM access key credentials. |
| `AWS_SECRET_ACCESS_KEY` | Secret String | AWS IAM secret key credentials. |
| `AWS_REGION` | String | Default: `ap-south-1`. |
| `AWS_S3_BUCKET_NAME` | String | Target S3 bucket for candidate proctoring snapshots, reports, and assets. |
| `AWS_SES_SENDER` | Email String | Verified sender email for student credential and notification dispatch. |

### Cheating Radar & Operational Alert Webhooks
| Variable | Target Service | Purpose |
| :--- | :--- | :--- |
| `ALERT_WEBHOOK_URL` | Generic HTTP | Dispatches JSON notifications for security anomalies and system events. |
| `ALERT_WEBHOOK_SECRET` | HMAC Secret | Signs outbound webhook payloads using SHA-256 HMAC in `X-Codeskill-Signature`. |
| `DISCORD_ALERT_WEBHOOK_URL` | Discord Channel | Posts embedded rich alerts for detected exam anomalies (e.g., multi-IP collision). |
| `SLACK_ALERT_WEBHOOK_URL` | Slack Channel | Dispatches Slack-formatted alert cards to faculty / proctor channels. |
| `WHATSAPP_ALERT_WEBHOOK_URL` | WhatsApp Relay | Dispatches immediate mobile notifications to proctors for critical breaches. |
| `WHATSAPP_RELAY_URL` | WhatsApp Relay | Endpoint of the Uptime Kuma / Baileys WhatsApp relay bridge. |
| `WHATSAPP_RELAY_KEY` | Secret String | Bearer authorization token for the WhatsApp relay API. |
| `WHATSAPP_ALERT_RECIPIENTS` | Comma-separated | International phone numbers receiving WhatsApp security alerts. |

---

## 8. Frontend Next.js Client & Server Configuration

Defined in `frontend-v2/next.config.ts`, `frontend-v2/src/config/api.ts`, and `src/lib/api-base-url.ts`:

| Variable Name | Environment | Default Value | Purpose |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Client & Server | `http://localhost:5001/api` | Base URL used by browser Axios instances to query the NestJS backend. |
| `INTERNAL_BACKEND_URL` | Server Only (SSR) | `http://localhost:5001` | Private internal backend URL for server-side fetches and Next.js proxy rewrites. |
| `NEXT_PUBLIC_WS_URL` | Client | Derived from API URL | Socket.IO connection string for live contest and proctoring events. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Client | *None* | Google OAuth Client ID for student social login button. |

---

## 9. Scripts & CI/CD Pipelines

| Variable Name | Referenced Location | Purpose |
| :--- | :--- | :--- |
| `ADMIN_EMAIL` | `scripts/create_admin.js` | Initial bootstrapped SuperAdmin email. |
| `ADMIN_PASSWORD` | `scripts/create_admin.js` | Initial bootstrapped SuperAdmin password. |
| `AWS_ROLE_TO_ASSUME` | `.github/workflows/deploy.yml` | AWS OIDC IAM role assumed by GitHub Actions runner. |
| `PRODUCTION_SSH_KEY` | `.github/workflows/deploy.yml` | SSH private key for production EC2 deployment script. |

---

## 10. Production Environment Templates (.env.example)

### Backend Production Template (`backend-nestjs/.env.production`)
```bash
NODE_ENV=production
PORT=5001
PROCESS_ROLE=api
ENABLE_EMBEDDED_JUDGE=false
CORS_ORIGIN=https://codeskill.cuchd.in

# PostgreSQL Primary
DATABASE_URL=postgres://codeskill_user:SecurePassword123@db-prod.internal:5432/codeskill
DATABASE_SSL=true

# Redis Cache & Queues
REDIS_HOST=redis-prod.internal
REDIS_PORT=6379
REDIS_PASSWORD=YourRedisSecretPassword
REDIS_TLS=true

# Cryptographic JWT Settings (Min 32 characters, high entropy)
JWT_SECRET=c8f1e8a93b4d2e7a1f5c6b9d8e4f2a7b1c3d5e7f9a2b4c6e8d0f1a3b5c7e9f1
JWT_ACCESS_TTL=1h
JWT_REFRESH_TTL=7d
JWT_ISSUER=codeskill
JWT_AUDIENCE=codeskill-web

# Piston Execution Cluster
CODE_EXECUTION_PROVIDER=piston
PISTON_BASE_URL=http://piston-cluster.internal:2000
JUDGE_SANDBOX=docker

# AWS Storage & Email
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=codeskill-prod-media-assets
AWS_SES_SENDER=noreply@cuchd.in
```

### Frontend Production Template (`frontend-v2/.env.production`)
```bash
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_API_URL=https://api.codeskill.cuchd.in/api
INTERNAL_BACKEND_URL=http://backend-api.internal:5001
NEXT_PUBLIC_WS_URL=https://api.codeskill.cuchd.in
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```
