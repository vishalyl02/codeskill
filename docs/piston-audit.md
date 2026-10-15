# Execution audit (2026-10-13)

- Existing ExecutionModule owns ExecutionService, language adapters, authenticated ExecutionController, and the `submissions` BullMQ queue. JudgeProcessor is enabled only in worker roles (or development). Preserve these components.
- ExecutionService currently compiles/runs via child processes, optionally Docker; adapters provide trusted function wrappers. AzureExecutionService is a separate legacy optional provider.
- Practice submissions persist authoritative problem source and source code before queueing. The worker reloads PostgreSQL data and strips hidden test output from notifications. Existing defects: replay can increment accepted counters twice; system errors can become wrong answers; measured queue/client duration is stored as execution runtime.
- AssessmentsService grades coding responses through ExecutionService synchronously and calculates proportional marks. It currently has a five-minute final submission grace period and catches infrastructure errors as zero marks. This must not silently penalize students during Piston outages.
- Contest standings and leaderboard logic are separate; no evidence that practice submissions update contest scores. Do not invent a new ranking policy.
- Next.js problem workspaces already poll run jobs and show WebSocket submission updates. Assessment editors use `/execution/azure-run` and assume synchronous results even when the backend returns a queued job.
- PostgreSQL submission status is varchar; retain existing status strings. Existing queuedAt records acceptance separately from completedAt. No schema migration is needed for provider integration.
- Root Compose only hosts PostgreSQL and Redis. Terraform EC2/ASG uses application hosts, PM2, and small-instance swap. There is no dedicated Linux execution fleet. Existing GitHub workflow builds/tests then refreshes production; do not enable Piston automatically there.
- Local host: macOS arm64. Docker CLI exists but daemon socket is absent. No installed self-hosted Piston endpoint or runtime registry was provided. Real execution/isolation/load verification is blocked until dedicated Linux infrastructure is available.

Contract: https://piston.readthedocs.io/en/latest/api-v2/ and official upstream api/src/job.js and config.js. Upstream exposes optional Isolate status, CPU/wall time and memory beyond the basic documented response; missing values must stay absent. SIGKILL alone is ambiguous and must not mean TLE or MLE.
