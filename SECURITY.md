# Security Policy

## Supported Versions

CodeSkill platform components currently receiving security updates:

| Component | Version | Supported |
| :--- | :--- | :---: |
| **CodeSkill Core Platform** | `1.0.x` | :white_check_mark: |
| **Backend API (`backend-nestjs`)** | `0.0.1` (Current) | :white_check_mark: |
| **Frontend App (`frontend-v2`)** | `0.1.0` (Current) | :white_check_mark: |

---

## Architectural Security Controls

The CodeSkill codebase enforces defense-in-depth security mechanisms:

### 1. Authentication & Token Lifecycle
- **Stateless Access Tokens:** HS256 JWT access tokens enforcing minimum 32-character secret length, entropy checks, and rejection of known placeholder secrets (`jwt.config.ts`).
- **Cryptographic Refresh Token Rotation:** Single-use SHA-256 hashed refresh tokens with automatic token family revocation if a reused token is detected.
- **Immediate Session Invalidation:** User entities maintain an atomic `tokenVersion` column. Password updates, account deactivations, and role modifications increment `tokenVersion`, instantly invalidating existing JWTs across all active sessions.

### 2. Authorization & RBAC
- Role-based access control enforced through NestJS guards (`JwtAuthGuard`, `AdminGuard`, `SuperAdminGuard`).
- Question approval and rejection restricted strictly to administrators (`AdminGuard`).
- Submission history and assessment results enforce candidate identity boundaries (`effectiveUserId = isAdmin ? targetUserId : currentUserId`).

### 3. Untrusted Code Execution Isolation
- Untrusted student code is executed inside containerized sandboxes (Docker, Piston, or Judge0) enforcing:
  - Non-root user execution (`1000:1000`).
  - Strict network disabling (`--network none`).
  - Dropped Linux capabilities (`--cap-drop ALL`) with `--security-opt no-new-privileges`.
  - Read-only root filesystems with transient bounded tmpfs partitions.
  - Enforced CPU time limits and memory quotas (512MB RAM caps, PID limits).
  - Output comparison performed server-side; testcase inputs and hidden results are redacted before client delivery.

### 4. PII Protection & Data Sanitization
- Public user profiles (`GET /api/users/:identifier`) project curated public fields, eliminating entity spreading and preventing leakage of password hashes, salts, academic emails, university UIDs, or phone numbers.
- Temporary passwords generated during bulk student onboarding are stored with `@Column({ select: false })` on `EmailJob`, omitted from all status APIs, and purged immediately after email delivery.

### 5. Rate Limiting & Throttling
- Distributed sliding-window Redis throttlers protect sensitive endpoints (login, registration, code execution, assessment submission) against brute-force attacks and denial-of-service attempts.

---

## Reporting a Vulnerability

If you discover a security vulnerability in CodeSkill:

1. **Do not disclose publicly:** Do not open public issues or pull requests detailing the vulnerability.
2. **Contact:** Email the security team at `security@cuchd.in` or repository maintainers with a detailed description of the issue, reproduction steps, and impact assessment.
3. **Response Timeline:** 
   - Initial acknowledgement: within 48 hours.
   - Status update and assessment: within 5 business days.
   - Remediation and disclosure coordination: based on severity and operational impact.
