# CodeSkill remediation implementation plan

Implementation authorized 12 October 2026. This tracker preserves AUD-001 through AUD-025 and the additional NEW findings. Production remains NO-GO until release gates have independent evidence.

The detailed reviewed design follows the verified remediation roadmap and architectural specifications. Its original audit severities, implementation instructions, dependencies, tests and rollback rules remain authoritative. No production deployment, credential rotation or database migration is performed by this initial batch.

## Delivery sequence

1. P0 authentication and access containment: R01/R03/R04/R10; restrict unsafe execution and mutation where needed. First code batch: password bypasses, passwordless admin login, active-account/JWT validation and regression tests.
2. Recovery and operational foundation in parallel: R18 remote restoration; R11 controlled migrations; R06/R15 Redis modes/failures; R05/R09 isolated judge and worker lifecycle; R26 immutable delivery.
3. Examination integrity: R07 canonical/versioned source contract; R21/R23 attempt policy/session state; R25 durable queue/result transitions; R02/R22 authoritative grading across all types.
4. Required feature/reliability closure: R12/R13 origins/native SEB; R14 execution admission; R16/R17 real contest workflow verification; R20/R24 authorization; R28 credentials/OTP; R30 owned S3 cleanup.
5. Evidence and rollout: R19 CI/security/browser/integration gates; R08 load at agreed target; R27 alert/health drills; R29 migration/restore/rollback staging rehearsal and limited pilot.

Each batch must be independently reviewable and tested. Preserve the existing local contest/practice/frontend changes. Do not use source completion as deployed vulnerability closure. Credentials and live-resource changes require coordinated owner access and verified recovery; no compromised credential or unsafe behavior may be restored as rollback.

## Backlog

| Task | Audit / additional references | Priority | Dependencies | Owner | Initial status |
|---|---|---|---|---|---|
| R00 Requirements and deployed revision | All | P1 | None | Architect/exam owner | Audited locally; live/load/recovery decisions pending |
| R01 Authentication containment | AUD-001/022 | P0 | R04 coordination | Backend/security | In progress: initial code batch |
| R02 Trusted examination grading | AUD-002 | P0 containment/P1 | R05/R07/R11/R21/R22/R25 | Backend/judge | Planned |
| R03 Candidate/report confidentiality | AUD-003 | P0 | R01/R20 permissions | Backend/security | Planned |
| R04 Credential rotation and secret removal | AUD-004 | P0 | Provider access/recovery | Security/DevSecOps | Planned; not rotated |
| R05 Code isolation | AUD-005 | P0 containment/P1 | R09/R26 runtime | Platform/security | Planned; production boundary unverified |
| R06 Redis topology | AUD-006/024 | P1 | R04/R15 | Backend/DevSecOps | Planned |
| R07 Source/version integrity | AUD-007 | P1/P2 | R11/R18 before backfill | Backend/DB | Existing compatibility adapter; reconciliation planned |
| R08 Measured capacity | AUD-008 | P1 | Approved load + R05/R06/R09/R25 | SRE/QA | Planned; no capacity claim |
| R09 Dedicated judge lifecycle | AUD-009 | P1 | R05/R06/R26 | Platform/backend | PM2 entry exists; ASG repair planned |
| R10 Socket authorization | AUD-010 | P0 | R01/R06 | Backend/security | Planned |
| R11 Versioned migrations | AUD-011 | P1 | R18 restoration | DB/DevSecOps | Targeted migration exists; unsafe deploy sync remains |
| R12 Origin/proxy policy | AUD-012 | P1 | Approved domains/R10/R13 | Backend/edge | Planned |
| R13 Native SEB verification | AUD-013 | P1 when required | R12/R21/R23 | Security/backend | Planned; policy/client fleet pending |
| R14 Execution admission | AUD-014/021 | P1 | R06/R15/R25 | Backend/SRE | Planned |
| R15 Redis failure semantics | AUD-015 | P1/P2 | R06 | Backend/SRE | Planned |
| R16 Anti-cheat closure | AUD-016 | P2 | R10/R21/R25 | Backend/frontend/QA | Historical route fixed locally; release proof pending |
| R17 Contest closure | AUD-017 | P2 | R05/R10/R25/R26 | Backend/frontend/QA | Historical pages repaired locally; release proof pending |
| R18 Durable restore | AUD-018 | P1 | R04/R26 | DB/SRE | Planned; restoration unverified |
| R19 Automated release gates | AUD-019 | P1 | Each task's suites/staging | QA/DevSecOps | Existing suites; critical gates planned |
| R20 Role update/revocation | AUD-020 | P0 restriction/P1 | R01/R11 as needed | Backend/security | Planned |
| R21 Eligibility/deadline/state | NEW-001 | P1 | R11/R18/R02 | Backend/DB | Planned |
| R22 All five type grading | NEW-002 | P1 | R02/R07 | Backend/frontend/QA | Planned |
| R23 Secure-session ownership | NEW-003 | P1 | R21/R13/R11 | Backend/security | Planned |
| R24 Organization authorization | NEW-004 | P0 restriction/P1 | R01/R20 | Backend/security | Planned |
| R25 Durable queue/leases | AUD-023, NEW-005 | P1 | R06/R11/R14/R15 | Backend/judge/DB | Planned |
| R26 Immutable release/IAM | NEW-006 | P1 | R04/R19/R11 | DevSecOps/security | Planned |
| R27 Readiness/alerts/TLS | NEW-007 | P1 | R06/R08/R18/R26 | SRE/DB | Planned |
| R28 Hashing/OTP lifecycle | NEW-008 | P1 | R01/R06/R15 | Backend/security | Planned |
| R29 Controlled rollout | All | P1 | Every required release gate | Release manager/owners | Not started |
| R30 Asset deletion ownership | AUD-025 | P1 | R01/R03/R26; R11/R18 for schema | Backend/security | Planned |

## First batch acceptance and evidence

- User.matchPassword accepts only bcrypt-matched credentials; removed fallback values are regression fixtures, not seeds.
- Admin password DTO requires a nonempty string; service rejects absent input/hash, wrong password, non-admin and inactive account before token issuance.
- Admin OTP continues for valid active admins; inactive users cannot receive administrative tokens there.
- JWT validation rejects missing/malformed canonical IDs before any repository query and rejects deleted/inactive users on every protected request.
- Tests first reproduced 31 failures across 44 cases before fixes. Post-change checks and HTTP regression evidence are recorded below after execution.
- This batch does not complete all of R01: privileged startup seeding/default credentials, exposed-key rotation, full session revocation and other R28 credential changes remain open. Do not mark the complete authentication release gate passed.

### Verification log

Pending final unit, HTTP, lint and compilation checks.
