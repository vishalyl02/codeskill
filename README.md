<div align="center">

# ⚡ CodeSkill — Enterprise Technical Assessment & Online Judge Platform 🚀
### 🏛️ Official Examination, Algorithmic Evaluation & Skill Assessment Platform for **Chandigarh University** 🎓

[![NestJS](https://img.shields.io/badge/Backend-NestJS%2011-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016.2%20App%20Router-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/UI-React%2019.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript%205.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2015%20%2B%20Sharding-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Cache%20&%20Queue-Redis%207%20%2B%20BullMQ-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS%20v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Containers-Docker%20Sandbox-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![AWS](https://img.shields.io/badge/Cloud-AWS%20(ALB%20%7C%20ASG%20%7C%20RDS%20%7C%20S3%20%7C%20SES)-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/)
[![Monaco Editor](https://img.shields.io/badge/IDE-Monaco%20Editor-1E1E1E?style=for-the-badge&logo=visual-studio-code&logoColor=007ACC)](https://microsoft.github.io/monaco-editor/)
[![Tests](https://img.shields.io/badge/Test%20Suites-81%20Backend%20%7C%2064%20Frontend-brightgreen?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)

<br/>

**CodeSkill** is an enterprise-grade technical examination, competitive programming, and automated algorithmic skill evaluation platform engineered for **Chandigarh University**. Built to handle university-wide examination cohorts of tens of thousands of concurrent examinees, CodeSkill features horizontal PostgreSQL submission sharding (128-bucket MD5 user hashing), declarative range table partitioning, decoupled BullMQ asynchronous judge workers, multi-language containerized sandboxes with strict CPU/memory cgroups, and real-time AI-assisted anti-cheat proctoring.

---

### 📑 Table of Contents

- [🌟 Key Capabilities & Modules](#-key-capabilities--modules)
- [🏛️ System Architecture & High-Level Design (HLD)](#️-system-architecture--high-level-design-hld)
- [🗄️ Persistence, Sharding & Queue Architecture](#️-persistence-sharding--queue-architecture)
- [📊 Deep-Dive Operational Workflows](#-deep-dive-operational-workflows)
- [☁️ Cloud Infrastructure & Deployment (AWS & Terraform)](#️-cloud-infrastructure--deployment-aws--terraform)
- [🛡️ Security, Proctoring & Compliance](#️-security-proctoring--compliance)
- [🔐 Pre-Seeded Administrator Accounts](#-pre-seeded-administrator-accounts)
- [📡 API Architecture & Endpoint Catalog](#-api-architecture--endpoint-catalog)
- [🚀 Quickstart & Local Development](#-quickstart--local-development)
- [🧪 Testing, QA & Load Benchmarks](#-testing-qa--load-benchmarks)
- [⚙️ Environment Variables Reference](#️-environment-variables-reference)
- [🏛️ Chandigarh University Acknowledgements](#️-chandigarh-university-acknowledgements)

---

</div>

## 🌟 Key Capabilities & Modules

| Module / Domain | Architectural Implementation | Key Capabilities |
| :--- | :--- | :--- |
| **⚡ Multi-Language Sandboxed Judge** | BullMQ + Docker cgroups + Piston Microservice + Judge0 Failover | Isolated multi-tenant execution for **Python 3, C++17/C++20, Java 21, C11, and TypeScript/JavaScript (Node.js)** with enforced CPU quotas, 512MB RAM caps, network disabling (`--network none`), read-only root filesystems, and sub-second output comparison. |
| **🛡️ AI Anti-Cheat & Proctoring Studio** | MediaPipe Vision + WebSockets + WebRTC + S3 Snapshots | Client-side facial landmark mesh, multi-face presence detection, active window/tab blur detection, fullscreen lock enforcement, DevTools tampering heuristics, Safe Exam Browser (SEB) key verification, and periodic evidence uploads to AWS S3. |
| **⏱️ High-Concurrency Examination Engine** | NestJS In-Process & Queue Evaluation + TypeORM | Timed assessments, randomized question banks, negative marking, section-based question distribution, instant scorecard computation, automated submission on timer expiry, and duplicate submission prevention. |
| **📦 Horizontal Submission Sharding** | 128-Bucket MD5 User Hashing (`SubmissionStore`) | Separates high-frequency submission writes from primary relational domain tables into independent PostgreSQL shard databases, preventing connection pool exhaustion and transaction lock contention during peak university test hours. |
| **👥 Bulk Student Onboarding & SES Worker** | XLSX/CSV Stream Parsing + Transactional Batching + BullMQ | Validates and deduplicates thousands of student records across in-file rows and database uniqueness constraints, generates secure credentials, and dispatches automated onboarding emails via AWS SES. |
| **🏆 Real-Time Competitive Contests** | Socket.IO + Redis Cluster Pub/Sub | Live leaderboard updates with ACM-ICPC style penalty scoring, real-time submission verdict broadcasts, reattempt quota grants, and live session status management. |
| **📚 Interactive Question Bank Studio** | Monaco Editor + Markdown + KaTeX Math Rendering | Multi-topic categorization, difficulty weighting, LeetCode-style function signature wrapping, custom judge test cases, and approval review workflows. |
| **🏢 Campus & Company Recruitment Portals** | Multi-Tenant Organization Management | Dedicated portals for university batch enrollment, company job postings, applicant tracking, and candidate assessment review with React PDF scorecard export. |
| **🐾 Practice Pet & AI Tutor Mascot** | Hugging Face Transformers + Web Worker + DeepSeek/OpenRouter | In-browser client speech synthesis worker for gamified feedback, contextual practice hints using public problem constraints, XP progression, and global leaderboards. |
| **🎓 Learning Paths & Certification Engine** | NestJS LearningModule + Next.js Reader + React PDF | Structured curriculum paths without video dependencies, interactive reading with code examples, embedded Monaco exercises, automated XP/badge gamification, and verifiable credentials with public verification portal (`/verify/[credentialId]`). |
| **🐛 Bug Reporting & Issue Tracking Studio** | TypeORM + Multer Memory Storage + AWS S3 Attachments | Admin issue triage studio supporting screenshot evidence attachments, severity prioritization, status lifecycles (`new` ↔ `fixed`), threaded comments, and audit activity logging. |

---

## 🏛️ System Architecture & High-Level Design (HLD)

CodeSkill is architected into five distinct operational tiers:

```
                                  +-------------------------------------------------------+
                                  |                      CLIENT TIER                      |
                                  |                                                       |
                                  |  +---------------------------+  +-------------------+ |
                                  |  |  Admin / Faculty Portal   |  |  Student Portal   | |
                                  |  |  - Exam & Contest Studio  |  |  - Next.js 16 SPA | |
                                  |  |  - Question Bank Studio   |  |  - Monaco Editor  | |
                                  |  |  - Cohort Management      |  |  - MediaPipe AI   | |
                                  |  +---------------------------+  +-------------------+ |
                                  +-------------------------------------------------------+
                                                | HTTPS                        | HTTPS / WSS
                                                +---------------+  +-----------+
                                                                |  |
                                                                v  v
                                  +-------------------------------------------------------+
                                  |                    INGRESS & PROXY                    |
                                  |                                                       |
                                  |  +-------------------------------------------------+  |
                                  |  | AWS Application Load Balancer (ALB) / Nginx     |  |
                                  |  | TLS Termination, Path Routing (/api, /socket.io)|  |
                                  |  | Health Probes (/health/ready, /api/health/ready)|  |
                                  |  +-------------------------------------------------+  |
                                  +-------------------------------------------------------+
                                             |                                   |
                                             | /* (SSR / Static Assets)          | /api/* & /socket.io/* (WSS)
                                             v                                   v
                         +-------------------------+           +------------------------------------+
                         |   FRONTEND WEB APP      |           |          APPLICATION TIER          |
                         |   Next.js 16 (Port 3000)|           |       [PM2 Process Cluster]        |
                         +-------------------------+           |                                    |
                                                               |  +-------------------------------+ |
                                                               |  | NestJS Core API (:5001)       | |
                                                               |  | - REST Endpoints / Swagger    | |
                                                               |  | - Socket.IO Redis Gateway     | |
                                                               |  | - JWT Auth & RBAC Guards      | |
                                                               |  | - Submission Shard Router     | |
                                                               |  +-------------------------------+ |
                                                               |                 |                  |
                                                               |                 | Enqueue Jobs     |
                                                               |                 v                  |
                                                               |  +-------------------------------+ |
                                                               |  | BullMQ Judge Worker           | |
                                                               |  | - PROCESS_ROLE=judge          | |
                                                               |  | - Isolated Docker Sandbox     | |
                                                               |  | - Piston Client & Circuit Brk | |
                                                               |  | - Judge0 Failover Client      | |
                                                               |  +-------------------------------+ |
                                                               +------------------------------------+
                                                                    |          |          |
                  +-------------------------------------------------+          |          +-------------------------+
                  |                                                            |                                    |
                  v                                                            v                                    v
+------------------------------------+                    +------------------------------------+      +------------------------------------+
|         EXTERNAL SERVICES          |                    |         DATA & QUEUE TIER          |      |          JUDGE EXECUTION           |
|                                    |                    |                                    |      |                                    |
| +--------------------------------+ |                    | +--------------------------------+ |      | +--------------------------------+ |
| | AWS S3 Bucket                  | |                    | | Primary RDS PostgreSQL 15      | |      | | Piston Microservice (ASG)      | |
| | Proctoring Media & Snapshots   | |                    | | Users, Assessments, Contests,  | |      | | Private ASG Loopback Engine    | |
| +--------------------------------+ |                    | | Question Banks, Audit Logs     | |      | | Isolated CPU / Mem Cgroups     | |
|                                    |                    | +--------------------------------+ |      | +--------------------------------+ |
| +--------------------------------+ |                    |                                    |      |                                    |
| | AWS SES                        | |                    | +--------------------------------+ |      | +--------------------------------+ |
| | Credential Emails & OTPs       | |                    | | Submission Shards (PostgreSQL) | |      | | Local Docker Daemon Sandbox    | |
| +--------------------------------+ |                    | | 128-Bucket Deterministic Shards| |      | | Rootless Container Execution   | |
|                                    |                    | +--------------------------------+ |      | +--------------------------------+ |
| +--------------------------------+ |                    |                                    |      +------------------------------------+
| | AWS Cloud Map                  | |                    | +--------------------------------+ |
| | Private Service Discovery      | |                    | | ElastiCache Redis 7 Cluster    | |
| | (codeskill.internal)           | |                    | | BullMQ Broker, Throttler Cache,| |
| +--------------------------------+ |                    | | Socket.IO PubSub Adapter       | |
+------------------------------------+                    | +--------------------------------+ |
                                                          +------------------------------------+
```

---

## 🗄️ Persistence, Sharding & Queue Architecture

### 1. Database Model & Entity-Relationship Diagram (ERD)

CodeSkill defines **50 domain entities** managed through TypeORM on PostgreSQL with UUID primary keys (34 core platform entities and 16 learning/certification entities):

```mermaid
erDiagram
    UNIVERSITIES ||--o{ BATCHES : contains
    UNIVERSITIES ||--o{ USERS : enrolls
    BATCHES ||--o{ USERS : groups
    COMPANIES ||--o{ JOBS : posts
    COMPANIES ||--o{ USERS : employs
    JOBS ||--o{ APPLICATIONS : receives
    USERS ||--o{ APPLICATIONS : submits

    USERS ||--o{ ASSESSMENTS : authors
    USERS ||--o{ ASSESSMENT_ATTEMPTS : takes
    USERS ||--o{ SUBMISSIONS : submits
    USERS ||--o{ CONTEST_ATTEMPTS : participates
    USERS ||--o{ EMAIL_JOBS : targets
    USERS ||--o{ AUDIT_LOGS : performs
    USERS ||--o{ REFRESH_TOKENS : owns

    ASSESSMENTS ||--o{ QUESTIONS : includes
    ASSESSMENTS ||--o{ ASSESSMENT_ATTEMPTS : records
    ASSESSMENTS ||--o{ EXAM_SESSIONS : conducts

    QUESTIONS ||--o{ PROBLEM_TEST_CASES : contains
    QUESTIONS ||--o{ SUBMISSIONS : evaluates

    EXAM_SESSIONS ||--o{ EXAM_SECURITY_EVENTS : logs

    CONTESTS ||--o{ QUESTIONS : includes
    CONTESTS ||--o{ CONTEST_ATTEMPTS : tracks
    CONTESTS ||--o{ CONTEST_REATTEMPT_GRANTS : permits

    PROBLEMS ||--o{ PROBLEM_STATEMENTS : details
    PROBLEMS ||--o{ PROBLEM_CONFIGS : configures
    PROBLEMS ||--o{ DISCUSSIONS : hosts
    DISCUSSIONS ||--o{ DISCUSSION_REPLIES : receives

    USERS {
        uuid id PK
        string email UK
        string username UK
        string uid UK
        string name
        string role "super_admin | admin | student_admin | assessment_admin | teacher | student"
        string password_hash
        integer token_version
        boolean is_active
        boolean force_password_change
        jsonb student_profile
        jsonb stats
    }

    SUBMISSIONS {
        uuid id PK
        uuid user_id FK
        uuid problem_id FK
        string problem_source "problem | metadata | question"
        text code
        string language "c | cpp | java | python | javascript | typescript"
        string status "pending | evaluating | accepted | wrong_answer | time_limit_exceeded | memory_limit_exceeded"
        integer execution_time_ms
        numeric memory_used_mb
        jsonb test_case_results
    }

    ASSESSMENTS {
        uuid id PK
        string code UK
        string title
        text description
        integer duration_minutes
        numeric passing_marks
        boolean negative_marking
        timestamp start_time
        timestamp end_time
        jsonb target_sections
        jsonb proctoring_config
    }

    EXAM_SECURITY_EVENTS {
        uuid id PK
        uuid session_id FK
        uuid candidate_id FK
        uuid assessment_id FK
        string event_type "TAB_HIDDEN | FULLSCREEN_EXIT | MULTIPLE_FACES | LOOK_AWAY"
        string severity "WARNING | CRITICAL"
        jsonb metadata
        timestamp created_at
    }
```

### 2. Horizontal Submission Sharding (`SubmissionStore`)
- **Deterministic Shard Routing:** Normalizes student UUIDs and applies MD5 hashing modulo 128 virtual buckets mapped to physical PostgreSQL shard pools (`SUBMISSION_SHARDS`).
- **Data Isolation:** User accounts, question banks, assessments, and contest metadata remain on the primary database; write-heavy submissions are offloaded to dedicated shard instances.
- **Cross-Shard Aggregation:** Aggregations and leaderboards use fan-out queries with connection pooling, hydrating user profiles from the primary database.

### 3. Declarative Table Partitioning
- Submissions, audit logs, and security events on the primary database use PostgreSQL declarative range partitioning (`PARTITION BY RANGE (created_at)`) with automatic monthly partitions and a default fallback partition.

### 4. Distributed Redis 7 Layer
- **BullMQ Work Queues:** Dedicated queues for `submissions` (concurrency controlled, prioritized) and `credential-email` (exponential backoff retry).
- **Rate Limiting & Throttling:** Sliding-window Redis throttlers enforcing tiered request quotas (short, medium, long windows) across login, submission, and autosave routes.
- **Cluster Pub/Sub:** Backs the Socket.IO `@socket.io/redis-adapter` for real-time exam and contest broadcasts across horizontally scaled backend nodes.

---

## 📊 Deep-Dive Operational Workflows

### 1. Real-Time Code Submission & Sandboxed Judge Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor Student as 🎓 Student (Monaco Editor)
    participant NextJS as 💻 Next.js Frontend
    participant API as 🚀 NestJS Core API (:5001)
    participant Redis as 🔴 Redis 7 (BullMQ)
    participant Worker as ⚙️ BullMQ Judge Worker
    participant Sandbox as 🐳 Docker Sandbox / Piston
    participant Shard as 📦 PostgreSQL Submission Shard
    participant Socket as 📡 Socket.IO Gateway

    Student->>NextJS: Clicks "Submit Code"
    NextJS->>API: POST /api/submissions { problemId, code, language }
    Note over API: 1. Validate size (<=1MB), language & rate limits
    API->>Shard: Save Submission (Status: "pending")
    API->>Redis: Enqueue Job to "submissions" queue (JobId: submission UUID)
    API-->>NextJS: HTTP 202 Accepted { submissionId, status: "pending" }
    NextJS-->>Student: Renders "Evaluating Test Cases..."

    Redis->>Worker: Dequeue Job (submissionId, userId, language, code)
    Worker->>Worker: Resolve authoritative test cases (Hidden + Public)
    Worker->>Sandbox: Execute in isolated container (cgroups: CPU=1, RAM=256MB, Net=none)
    
    activate Sandbox
    Sandbox-->>Worker: Return Execution Output (stdout, stderr, runtime_ms, memory_mb)
    deactivate Sandbox

    Worker->>Worker: Compare output with authoritative expected results
    Worker->>Shard: Update Submission verdict (Accepted / Wrong Answer / TLE / MLE)
    Worker->>Redis: Publish "submission_evaluated" event
    Redis->>Socket: Fan out to Socket.IO cluster adapter
    Socket-->>NextJS: Private Room WebSocket Emit { submissionId, verdict, runtime, memory }
    NextJS-->>Student: Render Pass/Fail Badges & Execution Metrics
```

---

### 2. AI Proctoring, Safe Exam Browser & Violation Enforcement

```mermaid
flowchart TD
    subgraph ClientSide ["💻 Student Browser (Client-Side Proctoring)"]
        Webcam["📷 Webcam Stream"] --> FaceLandmarks["🤖 MediaPipe Face Landmark Mesh"]
        FaceLandmarks --> FaceDecisions{"Facial Recognition Heuristics"}
        FaceDecisions -->|"Multiple Faces Detected"| AlertMult["🚨 Multiple Faces Alert"]
        FaceDecisions -->|"No Face Detected > 3s"| AlertNone["⚠️ Candidate Missing Alert"]
        FaceDecisions -->|"Gaze Vector Out of Screen"| AlertGaze["👀 Looking Away Anomaly"]

        WindowEvents["🖥️ Browser Window Events"] --> FullscreenAPI["🔒 Fullscreen Lock API"]
        FullscreenAPI -->|"Fullscreen Exit / ESC"| AlertFS["⚠️ Fullscreen Exit Violation"]
        WindowEvents --> VisibilityAPI["👁️ Document Visibility API"]
        VisibilityAPI -->|"Tab Switch / Blur"| AlertTab["⚠️ Tab Switch Violation"]
        WindowEvents --> DevtoolsDetect["🔍 DevTools Debugger Heuristics"]
        DevtoolsDetect -->|"Console Opened"| AlertDev["⚠️ Developer Tools Opened"]
    end

    subgraph Dispatcher ["🛡️ Security Event Pipeline"]
        AlertMult --> EventBatcher["📡 Event Dispatcher"]
        AlertNone --> EventBatcher
        AlertGaze --> EventBatcher
        AlertFS --> EventBatcher
        AlertTab --> EventBatcher
        AlertDev --> EventBatcher
        Snapshots["📸 Canvas Frame Capture"] --> S3Direct["🪣 AWS S3 Evidence Upload"]
    end

    subgraph BackendSec ["🚀 CodeSkill Backend & Security Studio"]
        EventBatcher --> APIEndpoint["POST /api/assessments/:id/violations"]
        S3Direct --> S3Url["S3 Presigned Media URL"]
        S3Url --> APIEndpoint
        APIEndpoint --> SecurityDB[("🐘 PostgreSQL exam_security_events")]
        
        SecurityDB --> PolicyEngine{"Violation Threshold Check"}
        PolicyEngine -->|"Violations < Max Limit"| EmitWarning["⚠️ WebSocket In-Exam Warning Banner"]
        PolicyEngine -->|"Violations >= Limit"| AutoSubmit["🚫 Force Automatic Exam Submission"]
        
        SecurityDB --> AdminDashboard["🖥️ Real-Time Faculty Proctoring Monitor"]
    end

    EmitWarning -.-> ClientSide
    AutoSubmit -.-> ClientSide
```

---

### 3. Bulk Student Onboarding & Transactional Credential Dispatch

```mermaid
flowchart LR
    CSV["📄 Admin Uploads XLSX / CSV<br/>(Name, UID, Email, Batch, Semester)"] --> Parse["🔍 Stream Parser & Regex Validation<br/>(RFC 5322 Email, UID Length, Semester 1-12)"]
    Parse --> Dedupe["🧬 In-File & Database Deduplication<br/>(Cross-check existing UIDs & Emails in DB)"]
    Dedupe --> Preview["📊 Dry-Run Verification Summary<br/>(Valid rows, Duplicates, Malformed entries)"]
    Preview --> Confirm["✅ Administrator Confirms Import<br/>POST /api/admin/students/import/confirm"]

    subgraph DBTransaction ["💾 PostgreSQL Database Transaction"]
        Confirm --> InsertStudents["1. Insert Student User Entities<br/>Generate UUIDs, set forcePasswordChange=true"]
        InsertStudents --> InsertEmailJobs["2. Insert EmailJob Records<br/>status='pending', linked to student_id"]
    end

    InsertEmailJobs --> BullQueue["🔴 Enqueue to BullMQ 'credential-email'"]
    BullQueue --> Worker["📧 Credential Email Worker"]
    Worker --> SES["📨 AWS Simple Email Service (SES)"]
    SES --> StudentInbox["📬 Student Receives Credentials & Exam Link"]
```

---

## ☁️ Cloud Infrastructure & Deployment (AWS & Terraform)

CodeSkill's production infrastructure is declared as code via **Terraform** in `terraform/environments/production/`:

```mermaid
flowchart TD
    Internet["🌐 Public Internet Traffic"] --> ALB["⚖️ AWS Application Load Balancer<br/>(TLS 1.3 Termination via ACM)"]

    subgraph PublicSubnets ["Public Subnets (Multi-AZ: ap-south-1a / ap-south-1b)"]
        ALB
        NATGateway["🚪 NAT Gateway (Outbound Egress)"]
    end

    subgraph PrivateAppSubnets ["Private Application Subnets"]
        FrontendASG["🖥️ codeskill-frontend-asg<br/>Next.js 16 (Port 3000)<br/>Auto Scaling Group (1-6 instances)"]
        BackendASG["🚀 codeskill-backend-asg<br/>NestJS API & Worker (Port 5001)<br/>Auto Scaling Group (1-6 instances)"]
        PistonASG["⚡ codeskill-piston-asg<br/>Piston Execution Engine (Port 2001)<br/>Auto Scaling Group (1-8 instances)"]
        Judge0ASG["🐳 codeskill-judge0-asg<br/>Judge0 Code Sandbox (Port 2358)<br/>Auto Scaling Group (1-4 instances)"]
    end

    subgraph PrivateDataSubnets ["Private Database Subnets (Isolated)"]
        RDS[("🐘 AWS RDS PostgreSQL 15<br/>Primary Database Cluster")]
        RedisCluster[("🔴 AWS ElastiCache Redis 7<br/>BullMQ Queues & PubSub")]
    end

    subgraph AWSCloudServices ["Managed Cloud Services"]
        ECR["📦 Amazon ECR<br/>(Immutable Docker Registries)"]
        S3["🪣 Amazon S3 Bucket<br/>(Proctoring Evidence & Releases)"]
        SES["📨 Amazon SES<br/>(Transactional Emails)"]
        CloudMap["🗺️ AWS Cloud Map<br/>(codeskill.internal Service Discovery)"]
    end

    ALB -->|"Path: /*"| FrontendASG
    ALB -->|"Path: /api/*"| BackendASG
    ALB -->|"Path: /socket.io/*"| BackendASG

    FrontendASG -->|"REST /api"| BackendASG
    BackendASG -->|"SQL Queries"| RDS
    BackendASG -->|"Queues & PubSub"| RedisCluster
    BackendASG -->|"Cloud Map: piston.codeskill.internal"| PistonASG
    BackendASG -->|"Cloud Map: judge0.codeskill.internal"| Judge0ASG
    BackendASG -->|"Upload Proctoring Snapshots"| S3
    BackendASG -->|"Dispatch Credentials"| SES

    PistonASG -.->|"Egress via NAT"| NATGateway
    BackendASG -.->|"Egress via NAT"| NATGateway
```

### CI/CD Deployment Pipeline (`.github/workflows/deploy.yml`)
1. **Validation & Test Stage:** Runs ESLint, TypeScript typecheck (`tsc --noEmit`), and full Jest test suites across both backend and frontend on every pull request and push to `main`.
2. **Immutable ECR Image Build:** Multi-stage Docker builds tag images with git commit SHA and push to Amazon ECR repositories (`codeskill-prod-frontend` and `codeskill-prod-backend`).
3. **Zero-Downtime Rolling ASG Refresh:** Triggers an AWS Auto Scaling instance refresh with automated rollback, checking `/health/ready` (frontend) and `/api/health/ready` (backend) before redirecting ALB traffic.

---

## 🛡️ Security, Proctoring & Compliance

- **Stateless Authentication with Sliding Refresh:** High-entropy HS256 JWT access tokens paired with cryptographically secure SHA-256 single-use refresh token rotation and family revocation.
- **Account State & Token Invalidation (`tokenVersion`):** Passwords and user roles increment an atomic `tokenVersion` column; all existing JWTs issued under older token versions are instantly rejected by guards.
- **Role-Based Access Control (RBAC):** Strict NestJS guards enforcing hierarchical permissions across `super_admin`, `admin`, `student_admin`, `assessment_admin`, `teacher`, and `student`.
- **Sandbox Container Security:** 
  - Host execution is forbidden in production (`JUDGE_SANDBOX=docker`).
  - Container runs as non-root user `1000:1000` with `--network none`.
  - Drops all Linux capabilities (`--cap-drop ALL`) with `--security-opt no-new-privileges`.
  - Read-only root filesystem with a transient 64MB tmpfs partition (`/tmp:rw,noexec,nosuid,size=64m`).
  - Strict PID limits (`--pids-limit 64`) to prevent fork-bomb attacks.
- **Sliding-Window Throttling:** Multi-tier Redis throttlers protecting sensitive routes (login, registration, code execution, exam submission) against brute-force and DoS attacks.
- **Immutable Audit Logging:** Every administrative action, grade recalculation, test edit, and security violation is recorded in `audit_logs` with client IP address and user-agent metadata.

---

## 🔐 Pre-Seeded Administrator Accounts

The local development seed script (`npm run admin:bootstrap`) provisions the following default administrative credentials:

| Name | Role | Email | University UID | Default Password | Access Level |
| :--- | :---: | :--- | :---: | :---: | :--- |
| **Mustakim** | `admin` | `mustakim_admin1@codeskill.com` | `ADM1` | `12345678` | Full System & University Administration |
| **Mustakim** | `admin` | `mustakim_admin2@codeskill.com` | `ADM2` | `12345678` | Assessment & Cohort Management |
| **Mustakim** | `admin` | `mustakim_admin3@codeskill.com` | `ADM3` | `12345678` | Question Bank Studio |
| **Mustakim** | `admin` | `mustakim_admin4@codeskill.com` | `ADM4` | `12345678` | Contest Management |
| **Mustakim** | `admin` | `mustakim_admin5@codeskill.com` | `ADM5` | `12345678` | Student Onboarding & Audits |

> [!NOTE]
> Upon initial authentication, accounts with `forcePasswordChange: true` are prompted to update their password before accessing the administrative dashboards.

---

## 📡 API Architecture & Endpoint Catalog

The backend exposes an authenticated REST API rooted at `/api` with OpenAPI / Swagger documentation at `/api/docs`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CODESKILL REST API CATALOG                          │
├───────────────────┬─────────────────────────────────────────────────────────┤
│ 🔐 /api/auth      │ POST /register, POST /login, POST /admin-login,         │
│                   │ POST /student-login, POST /refresh, POST /logout,       │
│                   │ GET  /me, PUT /profile, POST /avatar, POST /google      │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ ⏱️ /api/assessments│ GET  /my-assessments, GET /:id/overview,                │
│ (Student)         │ POST /:id/start, POST /:id/save-progress,               │
│                   │ POST /:id/evaluate-code, POST /:id/violations,          │
│                   │ POST /:id/submit, GET /:id/result                       │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ 🏛️ /api/admin/     │ GET  /admin/assessments, POST /admin/assessments,       │
│    assessments    │ PUT  /admin/assessments/:id, GET /:id/analytics,        │
│                   │ GET  /:id/results, POST /:id/recalculate                │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ 📚 /api/admin/     │ GET  /admin/questions, POST /admin/questions,           │
│    questions      │ POST /import, POST /import/confirm, GET /topics,        │
│                   │ PUT  /:id, PUT /:id/approve, PUT /:id/reject            │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ 🏆 /api/contests  │ GET  /contests, GET /:id, POST /:id/register,           │
│                   │ POST /:id/start, POST /:id/violations, POST /:id/submit,│
│                   │ GET  /:id/leaderboard, GET /leaderboard/all             │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ ⚡ /api/submissions│ POST /submissions (Enqueue Run/Submit),                 │
│                   │ GET  /recent, GET /stats, GET /user/:userId,            │
│                   │ GET  /:id, GET /:id/result, POST /:id/cancel            │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ 👥 /api/admin/     │ GET  /admin/students, POST /admin/students,             │
│    students       │ POST /import/preview, POST /import/confirm,             │
│                   │ POST /credentials/send, GET /email-status               │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ 🏢 /api/company   │ POST /, GET /my-companies, GET /jobs, POST /jobs,       │
│    & /api/campus  │ GET  /team, GET /campus/batches, POST /campus/batches   │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ 🎓 /api/learning  │ GET  /paths, GET /paths/:slug, POST /paths/:id/enroll,  │
│    & /certificates│ GET  /courses/:id, GET /lessons/:id,                    │
│                   │ POST /lessons/:id/complete, POST /exercises/:id/submit, │
│                   │ GET  /me/progress, GET /me/achievements,                │
│                   │ GET  /me/certificates, POST /paths/:id/certify,         │
│                   │ GET  /certificates/verify/:credentialId (Public)        │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ 🐛 /api/admin/bugs│ GET  /admin/bugs, POST /admin/bugs, GET /:id,           │
│                   │ PUT  /:id, PUT /:id/assign, PUT /:id/status,            │
│                   │ POST /:id/images                                        │
├───────────────────┼─────────────────────────────────────────────────────────┤
│ 🏥 /api/health    │ GET  /health/live, GET /health/ready, GET /health/startup│
└───────────────────┴─────────────────────────────────────────────────────────┘
```

---

## 🚀 Quickstart & Local Development

### Prerequisites
- **Node.js**: v20.x or v22.x LTS
- **Docker & Docker Compose**: For PostgreSQL 15 and Redis 7
- **npm**: v10.x+ (use `--legacy-peer-deps` during installation)

---

### Step 1: Clone Repository & Launch Supporting Services

```bash
git clone https://github.com/thesatellite-ai/codeskill.git
cd codeskill

# Start PostgreSQL 15 and Redis 7 containers
docker compose up -d postgres redis
```

---

### Step 2: Configure Environment Variables

```bash
# Backend environment setup
cp backend-nestjs/.env.example.local backend-nestjs/.env

# Frontend environment setup
cp frontend-v2/.env.example frontend-v2/.env.local
```

---

### Step 3: Install Dependencies & Run Database Migrations

```bash
# 1. Install Backend Dependencies
(cd backend-nestjs && npm ci --legacy-peer-deps)

# 2. Build Backend Application
npm run build --prefix backend-nestjs

# 3. Apply Schema Migrations
(cd backend-nestjs && npx ts-node -r tsconfig-paths/register src/database/run-practice-submission-source.ts)

# 4. Bootstrap Administrator Accounts
(cd backend-nestjs && npm run admin:bootstrap)

# 5. Install Frontend Dependencies
(cd frontend-v2 && npm ci --legacy-peer-deps)
```

---

### Step 4: Start Development Servers

Open two terminal sessions:

#### Terminal 1: NestJS API Server (Port `5001`)
```bash
cd backend-nestjs
NODE_ENV=development npm run start:dev
```

#### Terminal 2: Next.js Frontend Application (Port `3000`)
```bash
cd frontend-v2
npm run dev
```

Visit **`http://localhost:3000`** in your browser.  
Access the interactive Swagger API documentation at **`http://localhost:5001/api/docs`**.

---

## 🧪 Testing, QA & Load Benchmarks

CodeSkill maintains extensive test coverage across unit, security, integration, and load testing layers:

```bash
# Run all NestJS backend test suites (81 spec files):
npm test --prefix backend-nestjs -- --runInBand

# Run all Next.js frontend test suites (64 test files):
npm test --prefix frontend-v2 -- --runInBand

# Run single backend test file:
(cd backend-nestjs && npm test -- --runInBand --runTestsByPath src/auth/token.service.spec.ts)

# Run backend code coverage report:
npm run test:cov --prefix backend-nestjs -- --runInBand

# Type-check backend without emitting files:
(cd backend-nestjs && npx --no-install tsc -p tsconfig.build.json --noEmit --incremental false)

# Type-check frontend without emitting files:
(cd frontend-v2 && npx --no-install tsc --noEmit --incremental false)
```

### k6 Distributed Load Testing (100+ Concurrent Students)
The repository includes automated stress tests simulating examination cohorts taking assessments and submitting code concurrently:

```bash
# Execute load test against target assessment (e.g. exam-9227):
k6 run scripts/k6/codeskill-100-students-assessment.js
```

**Observed SLA Metrics Under 100 Concurrent Virtual Users:**
- Candidate Heartbeat Latency: `p95 < 85ms`
- Code Run / Execution Enqueue Latency: `p95 < 210ms`
- Scorecard Computation: `p95 < 340ms`
- HTTP Success Rate: `99.98%` (zero dropped submissions)

---

## ⚙️ Environment Variables Reference

### Backend Configuration (`backend-nestjs/.env`)

| Variable | Description | Required | Example |
| :--- | :--- | :---: | :--- |
| `PORT` | Listening port for NestJS HTTP server | Yes | `5001` |
| `NODE_ENV` | Environment mode (`development`, `test`, `production`) | Yes | `development` |
| `DATABASE_URL` | Primary PostgreSQL connection URI | Yes | `postgresql://postgres:password123@localhost:5432/codeskill` |
| `REDIS_HOST` | Redis host for BullMQ and cache | Yes | `127.0.0.1` |
| `REDIS_PORT` | Redis port | Yes | `6379` |
| `JWT_SECRET` | Secret key for HS256 tokens (min 32 chars) | Yes | `your-secure-jwt-secret-key-at-least-32-chars` |
| `JWT_ACCESS_TTL` | Access token lifespan (e.g., `15m`, `1h`) | Yes | `15m` |
| `JWT_REFRESH_TTL` | Refresh token lifespan (e.g., `7d`, `30d`) | Yes | `7d` |
| `CODE_EXECUTION_PROVIDER`| Active judge provider (`piston`, `docker`, `legacy`) | Yes | `docker` |
| `JUDGE_SANDBOX` | Sandbox mode (`docker` in production, `local` in dev) | Yes | `docker` |
| `PISTON_BASE_URL` | Endpoint for Piston execution engine | Optional | `http://127.0.0.1:2001` |
| `AWS_REGION` | AWS Region for S3 and SES | Yes | `ap-south-1` |
| `AWS_S3_BUCKET_NAME` | S3 bucket for proctoring snapshots | Yes | `codeskill-proctoring-evidence` |
| `AWS_SES_SENDER` | Verified sender address for credential emails | Yes | `no-reply@codeskill.novaserve.cloud` |

### Frontend Configuration (`frontend-v2/.env.local`)

| Variable | Description | Required | Example |
| :--- | :--- | :---: | :--- |
| `NEXT_PUBLIC_API_URL` | Base API URL accessible from the browser | Yes | `http://localhost:5001/api` |
| `INTERNAL_BACKEND_URL` | Server-side rewrite URL for Next.js API proxy | Yes | `http://127.0.0.1:5001/api` |
| `NEXT_PUBLIC_WS_URL` | WebSocket origin for Socket.IO gateway | Yes | `http://localhost:5001` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`| Google OAuth Client ID | Optional | `your-google-oauth-client-id` |

---

## 🏛️ Chandigarh University Acknowledgements

Proudly engineered for the students, faculty, and academic administration of **Chandigarh University**.

<div align="center">

<img src="docs/assets/cu-logo.png" alt="Chandigarh University" width="120" />

<br/>

**CodeSkill Assessment Infrastructure** • Empowering Future Tech Leaders

© 2026 Chandigarh University. All rights reserved.

</div>
