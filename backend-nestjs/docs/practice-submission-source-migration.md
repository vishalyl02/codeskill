# Practice submission source migration

Published practice problems now reuse `problem_metadata` and explicitly published coding `questions` records alongside legacy `problems` records. Submissions retain their existing UUID `problemId` and add a `problemSource` value of `problem`, `metadata`, or `question`. Existing submissions default to `problem`.

The existing foreign key from `submissions.problemId` to `problems.id` must be removed before metadata-backed and Question Bank submissions can be saved. The updated application validates the source record and its publication/access rules before accepting a submission. The entity disables creation of that legacy FK and declares the matching source check.

Build the updated backend, then run this targeted migration against the running backend's database before starting the updated backend and judge workers. Take a database backup through the existing deployment process first.

From `backend-nestjs`, with the production service's database environment inherited:

```sh
npm run build
NODE_ENV=production node dist/database/run-practice-submission-source.js
```

The runner uses the existing `DATABASE_URL` or `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`, and `DATABASE_SSL` settings, loading configuration automatically via `dotenv.config()`.

The runner applies all migrations inside a single transaction guarded by a PostgreSQL advisory lock (`pg_advisory_xact_lock(1902230159)`), releases its connection, and returns a nonzero exit status on failure. It can be rerun safely.

In addition to the original practice submission source migration:
- Adds/backfills `problemSource` with the legacy default `problem`, and sets it nonnullable.
- Adds/upgrades/validates `CHK_submissions_problem_source`, allowing `problem`, `metadata`, and `question`.
- Discovers and drops only single-column FKs from `submissions.problemId` to the current `problems.id` relation.

The runner now also applies the subsequent platform schema migrations within the same advisory-locked transaction:
- `applyAuthTokensSchemaMigration`: Refresh tokens table and indices.
- `applyDeclarativePartitioningMigration`: Time-range partitioning for submissions, audit logs, and security events.
- `applyContestSecurityReattemptMigration`: Reattempt grants and contest attempt schema.
- `applyAssessmentAudienceTargetingMigration`: Assessment targeting columns.
- `applyAssessmentProctorCapturesMigration` & `applyAssessmentProctoringModesMigration`: Proctoring capture arrays and proctoring modes.
- `applyAssessmentResumeLimitMigration`: Assessment attempt resume count limits.
- `applyBugReportsMigration`: Bug report tables, screenshots, comments, and activity tracking.
- `applyLearningModuleMigration`: Learning paths, courses, modules, lessons, exercises, gamification XP/badges, and certificates.
- `applyProblemConfigDefaultLanguageMigration`: Problem default programming language configuration.

Existing submission IDs, `problemId` values, submission history, the user FK, and indexes are preserved. A fresh development database created from the updated entities already has the schema; the runner is also idempotent and safe there.

Question Bank publication is explicit: only coding types with `metadata.visibility` set to `Published` or `Public`, an eligible approval status, and `metadata.contestOnly` not true can appear publicly. Existing approved-only records are not automatically published. The previous admin label inferred publication incorrectly; open the existing question, choose Publish Immediately, and save if it is intended for public practice. Stable `question-<uuid>` URLs support explicitly published older questions with no slug without changing their records.
