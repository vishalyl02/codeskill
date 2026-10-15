# PostgreSQL submission sharding

CodeSkill now supports application-level horizontal sharding of `submissions` across independent PostgreSQL databases. The initial local topology has two separate PostgreSQL instances on ports 5433 and 5434. The primary database stays on port 5432.

## Platform analysis and scope

The NestJS API uses TypeORM; BullMQ and a separately runnable judge process evaluate submitted code. Submissions contain the growing source-code and test-result history. Student history, result polling, and judging usually operate on a single student's records. Admin dashboards and contest leaderboards span students.

The existing declarative partition migration splits tables by time inside one PostgreSQL database. It does not distribute database compute across servers. The new submission store routes rows to different database endpoints. Accounts, OAuth/refresh tokens, catalogs, problems, assessments, attempts, exam security events, and audit logs remain in the primary database. These tables have shared relationships and are not automatically moved by this change.

The local source contained three submissions at initial inspection. That dataset verifies correctness, not production performance. All local instances still share the computer's CPU, memory, and disk; production horizontal capacity requires separate database hosts and a representative load test.

```mermaid
flowchart LR
  Student[Student] --> API[NestJS API]
  API -->|Accounts and catalog| Primary[(Primary PostgreSQL<br/>5432)]
  API --> Store[SubmissionStore<br/>Student ID → routing bucket]
  API --> Queue[Redis / BullMQ]
  Queue --> Judge[Judge worker]
  Judge -->|Results and status| Store
  Store --> A[(Shard A<br/>PostgreSQL 5433)]
  Store --> B[(Shard B<br/>PostgreSQL 5434)]
  Admin[Admin totals and leaderboards] -->|Merge shard results| Store
```

## Routing and queries

- A normalized UUID student ID is hashed into one of 128 fixed routing buckets. Each bucket maps to a stable shard ID. A student's submissions always stay together.
- Student history and normal judge updates target one shard. Admin ID lookups can query both shards because UUIDs from existing data are retained.
- Global totals sum shard counts. Global history merges bounded, ordered results with an ID tie-breaker. Large offset pages are capped at 10,000 records; use a cursor-based API for deeper exports.
- User relations are fetched from the primary database; accounts and passwords are not replicated to shards.
- Contest scoring reads attempt windows from the primary database and aggregates accepted submissions on their owning shards. Window boundaries preserve the existing timestamp semantics.
- Shards have indexes for student history, problem/status queries, accepted contest submissions, and legacy IDs. A database check constraint rejects records belonging to another shard.
- Every API and judge process must use the same topology. The primary stores a fingerprint, and each shard has an identity record. Changed routing, changed endpoints, an incomplete migration, or accidental disablement fails startup. Reordering configuration or rotating credentials does not remap students.
- A shard failure propagates an error. Writes never fall back to the primary database, and global reads never silently return partial totals.

## Configuration

Configure the same settings in every API and judge environment. Keep credentials in ignored environment files or your secret manager.

```dotenv
SUBMISSION_SHARDS=[{"id":"a","url":"postgres://postgres:LOCAL_PASSWORD@127.0.0.1:5433/codeskill_submissions","ssl":false},{"id":"b","url":"postgres://postgres:LOCAL_PASSWORD@127.0.0.1:5434/codeskill_submissions","ssl":false}]
SUBMISSION_SHARD_POOL_SIZE=5
DB_SYNCHRONIZE=false
```

For a Docker setup, `docker compose --profile shards up -d submission-shard-a submission-shard-b` starts the two additional local servers. Set `SHARD_POSTGRES_PASSWORD` to match the URLs. The primary PostgreSQL and Redis services remain separately configured.

Remote endpoints require verified TLS. Configure `ssl: true` and, where required, the provider's CA through Node's `NODE_EXTRA_CA_CERTS`; do not use TLS-disabling URL parameters. Budget connections per database across every API and judge process: the default is up to five shard connections per process per shard.

`SUBMISSION_SHARD_MAP` can explicitly assign the 128 buckets. It must be fixed before initial migration. Adding a server or changing assignments later needs a separate rebalance operation; this implementation deliberately refuses automatic remapping. It does not provide replication, automatic failover, or distributed transactions. Cross-database user-stat updates retain the application's existing separate-write behavior.

## Initial migration

1. Back up the primary database and test the backup. Prepare empty, dedicated shard databases. Apply the existing submission-source migration before cutover if `problemSource` is missing.
2. Disable incoming submission traffic, drain BullMQ, and stop **every** API and judge writer. Confirm no submissions remain queued, pending, running, or testing. A maintenance window is required.
3. Build the backend and run the migration from `backend-nestjs`:

   ```sh
   npm run db:shards:migrate -- --apply --writers-stopped
   # Or, from a built deployment:
   node dist/database/run-submission-sharding.js --apply --writers-stopped
   ```

4. Run `npm run db:shards:verify`, then restart every API and judge with the same shard configuration. Check student history and submit a problem before restoring traffic.

The migration locks the source table, copies records in batches, compares each copied record with its source, and checks counts before committing the active topology. IDs, source code, problem source, timestamps, and results are retained. The original `submissions` table stays in the primary database as a read-only cutover snapshot. A trigger blocks old application versions from writing there. Later deployment migrations skip that submission snapshot when sharding is active.

The operation is not a distributed transaction: shard batches commit before primary activation. If copying fails, the primary source is retained and no active marker is committed. Keep writers stopped, fix the cause, and retry with exactly the same topology; copied records are upserted and verified again. A successful retry after activation validates the topology without overwriting new shard writes.

After activation, do not roll back by clearing `SUBMISSION_SHARDS`: the primary snapshot no longer includes new submissions. Returning to one database requires maintenance, copying current shard data back, validating it, and deliberately removing the cutover guards and marker. No destructive rollback command is provided.

## Verification

`npm run db:shards:verify` checks database identities, routing assignments, and row counts. `npm run test:shards:integration` is restricted to localhost and creates disposable databases on the configured servers. It tests migration preservation, refusal of in-flight cutover, retries, student submission, judge persistence, history, global pagination, contest aggregation, shard ownership, and the primary write guard. Its temporary databases are removed after the test.
