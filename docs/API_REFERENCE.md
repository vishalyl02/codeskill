# CodeSkill API Reference: REST, GraphQL & WebSockets

> **Ground-Truth Audit Document**  
> Source of truth: NestJS controllers, GraphQL resolvers, and Socket.IO gateways on `origin/main`. Covers 100% of REST endpoints (248 routes across 33 controllers), GraphQL operations, and WebSocket real-time event protocols.

---

## Table of Contents

- [1. Global API Conventions & Envelopes](#1-global-api-conventions--envelopes)
- [2. Complete REST Controller & Endpoint Catalog (33 Controllers, 248 Routes)](#2-complete-rest-controller--endpoint-catalog)
- [3. GraphQL Schema Reference](#3-graphql-schema-reference)
- [4. WebSocket & Real-Time Gateway Protocols](#4-websocket--real-time-gateway-protocols)

---

## 1. Global API Conventions & Envelopes

- **Global API Prefix:** `/api` (configured in `backend-nestjs/src/main.ts`).
- **Authentication:** Bearer JWT in the `Authorization: Bearer <token>` header, or `codeskill_access_token` cookie.
- **Response Envelope (`ResponseInterceptor`):**
  - Successful array results are wrapped: `{ "success": true, "data": [...] }`
  - Objects already containing `success: true` or `success: false` pass through unmodified.
  - Ordinary objects are enriched with `success: true`: `{ "success": true, ...result }`
- **Error Sanitization (`HttpExceptionFilter`):**
  - Standardized JSON: `{ "statusCode": 400, "message": "...", "error": "Bad Request", "timestamp": "..." }`
  - Internal 500 errors redact sensitive stack traces in production.

---

## 2. Complete REST Controller & Endpoint Catalog (33 Controllers, 248 Routes)

### Controller: `AdminActivityController`
- **Source File:** `backend-nestjs/src/admin/controllers/activity.controller.ts`
- **Base Path Prefix:** `/api/admin/activity`
- **Total Endpoints:** 5

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/activity` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{     summary: 'Get keyset-paginated activity logs with multi-dimensional filters'`<br>`}` |
| `GET` | `/api/admin/activity/count` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{     summary: 'Get count of new events since a given timestamp for live badge polling'`<br>`}` |
| `GET` | `/api/admin/activity/stats` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{     summary: 'Get overall activity KPI statistics for the executive dashboard'`<br>`}` |
| `GET` | `/api/admin/activity/radar` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{     summary: 'Get active Cheating Radar alerts and anomalies'`<br>`}` |
| `GET` | `/api/admin/activity/export` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{     summary: 'Stream activity logs as CSV with chunked streaming'`<br>`}` |

---

### Controller: `AdminCompaniesController`
- **Source File:** `backend-nestjs/src/admin/controllers/companies.controller.ts`
- **Base Path Prefix:** `/api/admin/companies`
- **Total Endpoints:** 4

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/companies` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'List all companies' }` |
| `POST` | `/api/admin/companies` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Approve or create a company' }` |
| `PUT` | `/api/admin/companies/:id/verify` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Toggle company verification' }` |
| `DELETE` | `/api/admin/companies/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Delete a company' }` |

---

### Controller: `AdminContestsController`
- **Source File:** `backend-nestjs/src/admin/controllers/contests.controller.ts`
- **Base Path Prefix:** `/api/admin/contests`
- **Total Endpoints:** 10

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/contests` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'List all contests' }` |
| `GET` | `/api/admin/contests/:id/results/export` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Export contest results as CSV' }` |
| `GET` | `/api/admin/contests/:id/results` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Get contest results`<br>`scores`<br>`violations and reattempts' }` |
| `POST` | `/api/admin/contests/:id/publish-results` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Publish or unpublish contest results for students' }` |
| `POST` | `/api/admin/contests/:id/reattempts` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Grant reattempts to one or more students' }` |
| `POST` | `/api/admin/contests/:id/reattempts/revoke` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Revoke active reattempt grant' }` |
| `GET` | `/api/admin/contests/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Get a contest by ID' }` |
| `POST` | `/api/admin/contests` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Create a new contest' }` |
| `PUT` | `/api/admin/contests/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Update a contest' }` |
| `DELETE` | `/api/admin/contests/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Delete a contest' }` |

---

### Controller: `AdminDashboardController`
- **Source File:** `backend-nestjs/src/admin/controllers/dashboard.controller.ts`
- **Base Path Prefix:** `/api/admin/dashboard`
- **Total Endpoints:** 1

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/dashboard/stats` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{     summary: 'Get overall platform statistics for admin dashboard'`<br>`}` |

---

### Controller: `AdminProblemsController`
- **Source File:** `backend-nestjs/src/admin/controllers/problems.controller.ts`
- **Base Path Prefix:** `/api/admin/problems`
- **Total Endpoints:** 5

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/problems` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'List all problems' }` |
| `GET` | `/api/admin/problems/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Get a problem by ID' }` |
| `POST` | `/api/admin/problems` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Create a new problem' }` |
| `PUT` | `/api/admin/problems/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Update a problem' }` |
| `DELETE` | `/api/admin/problems/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Delete a problem' }` |

---

### Controller: `AdminUniversitiesController`
- **Source File:** `backend-nestjs/src/admin/controllers/universities.controller.ts`
- **Base Path Prefix:** `/api/admin/universities`
- **Total Endpoints:** 4

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/universities` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'List all universities' }` |
| `POST` | `/api/admin/universities` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Create/register a university' }` |
| `PUT` | `/api/admin/universities/:id/verify` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Toggle university verification' }` |
| `DELETE` | `/api/admin/universities/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Delete a university' }` |

---

### Controller: `AdminUsersController`
- **Source File:** `backend-nestjs/src/admin/controllers/users.controller.ts`
- **Base Path Prefix:** `/api/admin/users`
- **Total Endpoints:** 6

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/admin/users` | `UseGuards()` | JwtAuthGuard, AdminGuard | `SuperAdminGuard` |
| `GET` | `/api/admin/users` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'List all users with pagination and search' }` |
| `PUT` | `/api/admin/users/:id/role` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Update user role with strict authorization checks' }` |
| `GET` | `/api/admin/users/:id/report` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Get candidate report' }` |
| `PUT` | `/api/admin/users/:id/promote` | `UseGuards()` | JwtAuthGuard, AdminGuard | `SuperAdminGuard` |
| `PUT` | `/api/admin/users/:id/demote` | `UseGuards()` | JwtAuthGuard, AdminGuard | `SuperAdminGuard` |

---

### Controller: `AnalyticsController`
- **Source File:** `backend-nestjs/src/analytics/analytics.controller.ts`
- **Base Path Prefix:** `/api/admin/analytics`
- **Total Endpoints:** 9

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/analytics/overview` | `getOverview()` | JwtAuthGuard, AdminGuard | *None* |
| `GET` | `/api/admin/analytics/activity` | `getActivity()` | JwtAuthGuard, AdminGuard | `@Query(` |
| `GET` | `/api/admin/analytics/languages` | `getLanguages()` | JwtAuthGuard, AdminGuard | *None* |
| `GET` | `/api/admin/analytics/leaderboard` | `getLeaderboard()` | JwtAuthGuard, AdminGuard | `@Query(` |
| `GET` | `/api/admin/analytics/assessments` | `getAssessments()` | JwtAuthGuard, AdminGuard | *None* |
| `GET` | `/api/admin/analytics/retention` | `getRetention()` | JwtAuthGuard, AdminGuard | *None* |
| `GET` | `/api/admin/analytics/assessment/:id/overview` | `getAssessmentOverview()` | JwtAuthGuard, AdminGuard | `@Param('id'` |
| `GET` | `/api/admin/analytics/assessment/:id/leaderboard` | `getAssessmentLeaderboard()` | JwtAuthGuard, AdminGuard | `@Param('id'` |
| `GET` | `/api/admin/analytics/assessment/:id/questions` | `getQuestionAnalytics()` | JwtAuthGuard, AdminGuard | `@Param('id'` |

---

### Controller: `AppController`
- **Source File:** `backend-nestjs/src/app.controller.ts`
- **Base Path Prefix:** `/api`
- **Total Endpoints:** 1

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api` | `getStatus()` | *Public / None* | *None* |

---

### Controller: `AssessmentsAdminController`
- **Source File:** `backend-nestjs/src/assessments/assessments-admin.controller.ts`
- **Base Path Prefix:** `/api/admin/assessments`
- **Total Endpoints:** 10

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/admin/assessments` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'Create a new MCQ assessment / exam' }` |
| `GET` | `/api/admin/assessments` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'List all assessments with filters' }` |
| `GET` | `/api/admin/assessments/targeting-options` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{     summary:       'Get distinct student targeting options (years`<br>`semesters`<br>`sections` |
| `GET` | `/api/admin/assessments/students-search` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{     summary: 'Search students by name`<br>`email`<br>`uid with optional cohort filters'` |
| `POST` | `/api/admin/assessments/preview-target-audience` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{     summary:       'Preview eligible audience count and sample students for targeting criteria'`<br>`}` |
| `GET` | `/api/admin/assessments/:id` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'Get assessment details with populated questions' }` |
| `PUT` | `/api/admin/assessments/:id` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'Update assessment details`<br>`schedule`<br>`or timings' }` |
| `PUT` | `/api/admin/assessments/:id/status` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{     summary:       'Toggle or update assessment status (published`<br>`draft`<br>`completed` |
| `DELETE` | `/api/admin/assessments/:id` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'Archive assessment' }` |
| `GET` | `/api/admin/assessments/:id/results` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{     summary: 'Get student attempt results and summary analytics'`<br>`}` |

---

### Controller: `AssessmentsStudentController`
- **Source File:** `backend-nestjs/src/assessments/assessments-student.controller.ts`
- **Base Path Prefix:** `/api/assessments`
- **Total Endpoints:** 11

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/assessments/my-assessments` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Get assigned assessments for current candidate' }` |
| `GET` | `/api/assessments/:id/overview` | `ApiOperation()` | JwtAuthGuard | `{     summary: 'Get assessment briefing and candidate eligibility'`<br>`}` |
| `POST` | `/api/assessments/:id/start` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Begin or resume assessment attempt session' }` |
| `POST` | `/api/assessments/:id/retake` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Redo / Retake assessment session for practice' }` |
| `POST` | `/api/assessments/:id/verify-identity` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Verify candidate identity before assessment start' }` |
| `POST` | `/api/assessments/:id/violations` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Record timestamped proctoring violation and secure evidence' }` |
| `POST` | `/api/assessments/:id/proctor-capture` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Receive proctoring frame capture from @peepl/proctoring' }` |
| `POST` | `/api/assessments/:id/save-progress` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Autosave candidate responses during test' }` |
| `POST` | `/api/assessments/:id/submit` | `ApiOperation()` | JwtAuthGuard | `{     summary: 'Submit completed assessment for server evaluation'`<br>`}` |
| `POST` | `/api/assessments/:id/evaluate-code` | `UseGuards()` | JwtAuthGuard | `SubmissionRateLimitGuard` |
| `GET` | `/api/assessments/:id/result` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Get candidate scorecard and performance review' }` |

---

### Controller: `AuthController`
- **Source File:** `backend-nestjs/src/auth/auth.controller.ts`
- **Base Path Prefix:** `/api/auth`
- **Total Endpoints:** 21

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register/send-otp` | `ApiOperation()` | *Public / None* | `{ summary: 'Send OTP for registration' }` |
| `POST` | `/api/auth/register` | `ApiOperation()` | *Public / None* | `{ summary: 'Register with OTP' }` |
| `POST` | `/api/auth/login` | `ApiOperation()` | *Public / None* | `{ summary: 'Login with email and password' }` |
| `POST` | `/api/auth/student-login` | `ApiOperation()` | *Public / None* | `{ summary: 'Student login with University UID and password' }` |
| `POST` | `/api/auth/force-change-password` | `ApiBearerAuth()` | *Public / None* | *None* |
| `POST` | `/api/auth/admin-login` | `ApiOperation()` | *Public / None* | `{ summary: 'Admin login requesting OTP' }` |
| `POST` | `/api/auth/admin-login/verify` | `ApiOperation()` | *Public / None* | `{ summary: 'Verify admin OTP and login' }` |
| `POST` | `/api/auth/refresh` | `ApiOperation()` | *Public / None* | `{ summary: 'Rotate and exchange a refresh token for new credentials' }` |
| `POST` | `/api/auth/logout` | `ApiBearerAuth()` | *Public / None* | *None* |
| `POST` | `/api/auth/google` | `ApiOperation()` | *Public / None* | `{ summary: 'Google OAuth login' }` |
| `POST` | `/api/auth/github` | `ApiOperation()` | *Public / None* | `{ summary: 'GitHub OAuth login' }` |
| `POST` | `/api/auth/linkedin` | `ApiOperation()` | *Public / None* | `{ summary: 'LinkedIn OAuth login' }` |
| `POST` | `/api/auth/send-otp` | `ApiOperation()` | *Public / None* | `{ summary: 'Send OTP for passwordless login' }` |
| `POST` | `/api/auth/verify-otp` | `ApiOperation()` | *Public / None* | `{ summary: 'Verify OTP and login' }` |
| `GET` | `/api/auth/me` | `ApiBearerAuth()` | *Public / None* | *None* |
| `PUT` | `/api/auth/profile` | `ApiBearerAuth()` | *Public / None* | *None* |
| `POST` | `/api/auth/profile/social-link/start` | `ApiBearerAuth()` | *Public / None* | *None* |
| `POST` | `/api/auth/profile/social-link/complete` | `ApiBearerAuth()` | *Public / None* | *None* |
| `POST` | `/api/auth/avatar` | `ApiBearerAuth()` | *Public / None* | *None* |
| `POST` | `/api/auth/forgot-password` | `ApiOperation()` | *Public / None* | `{ summary: 'Send password reset OTP' }` |
| `POST` | `/api/auth/reset-password` | `ApiOperation()` | *Public / None* | `{ summary: 'Reset password using OTP' }` |

---

### Controller: `BugsController`
- **Source File:** `backend-nestjs/src/bugs/bugs.controller.ts`
- **Base Path Prefix:** `/api/admin/bugs`
- **Total Endpoints:** 9

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/bugs` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'List reported bugs with status counts' }` |
| `POST` | `/api/admin/bugs` | `ApiConsumes()` | JwtAuthGuard, AdminGuard | `'multipart/form-data'` |
| `GET` | `/api/admin/bugs/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Get a bug report`<br>`comments`<br>`images` |
| `PUT` | `/api/admin/bugs/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Update a bug report title and description' }` |
| `PUT` | `/api/admin/bugs/:id/assign` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Claim a new bug for work' }` |
| `PUT` | `/api/admin/bugs/:id/status` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Mark a bug fixed or reopen it' }` |
| `POST` | `/api/admin/bugs/:id/images` | `ApiConsumes()` | JwtAuthGuard, AdminGuard | `'multipart/form-data'` |
| `POST` | `/api/admin/bugs/:id/comments` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Add a comment to a bug report' }` |
| `PUT` | `/api/admin/bugs/:id/comments/:commentId` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Edit a comment written by the current user' }` |

---

### Controller: `CampusController`
- **Source File:** `backend-nestjs/src/campus/campus.controller.ts`
- **Base Path Prefix:** `/api/campus`
- **Total Endpoints:** 12

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/campus` | `ApiOperation()` | *Public / None* | `{ summary: 'Get all verified universities' }` |
| `POST` | `/api/campus` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/campus/my-universities` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/campus/profile/:username` | `ApiOperation()` | *Public / None* | `{ summary: 'Get university public profile' }` |
| `GET` | `/api/campus/batches` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `POST` | `/api/campus/batches` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/campus/batches/:batchId/students` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `DELETE` | `/api/campus/batches/:batchId` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/campus/students` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `POST` | `/api/campus/students/mock` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/campus/:id` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `PUT` | `/api/campus/:id` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |

---

### Controller: `CompaniesController`
- **Source File:** `backend-nestjs/src/companies/companies.controller.ts`
- **Base Path Prefix:** `/api/companies`
- **Total Endpoints:** 2

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/companies` | `ApiOperation()` | *Public / None* | `{ summary: 'Get all verified companies' }` |
| `GET` | `/api/companies/:username` | `ApiOperation()` | *Public / None* | `{ summary: 'Get company profile and jobs' }` |

---

### Controller: `CompanyController`
- **Source File:** `backend-nestjs/src/companies/company.controller.ts`
- **Base Path Prefix:** `/api/company`
- **Total Endpoints:** 14

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/company` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/company/my-companies` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/company/jobs` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `POST` | `/api/company/jobs` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `PUT` | `/api/company/jobs/:jobId` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `DELETE` | `/api/company/jobs/:jobId` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/company/team` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `POST` | `/api/company/team/invite` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `DELETE` | `/api/company/team/:userId` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/company/applications` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `PUT` | `/api/company/applications/:id/stage` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `POST` | `/api/company/applications/mock` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/company/:id` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `PUT` | `/api/company/:id` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |

---

### Controller: `ContestsController`
- **Source File:** `backend-nestjs/src/contests/contests.controller.ts`
- **Base Path Prefix:** `/api/contests`
- **Total Endpoints:** 13

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/contests` | `ApiOperation()` | *Public / None* | `{ summary: 'Get all public contests' }` |
| `GET` | `/api/contests/private` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/contests/:slug/leaderboard` | `leaderboard()` | *Public / None* | `@Param('slug'` |
| `GET` | `/api/contests/:slug/member-leaderboard` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/contests/:id/registration` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/contests/:id/start-context` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/contests/:id/results` | `UseGuards()` | *Public / None* | `OptionalJwtAuthGuard` |
| `GET` | `/api/contests/:id/editorials` | `UseGuards()` | *Public / None* | `OptionalJwtAuthGuard` |
| `POST` | `/api/contests/:id/start` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `POST` | `/api/contests/:id/submit` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `POST` | `/api/contests/:id/violations` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/contests/:slug` | `ApiOperation()` | *Public / None* | `{ summary: 'Get contest details' }` |
| `POST` | `/api/contests/:id/register` | `ApiBearerAuth()` | *Public / None* | *None* |

---

### Controller: `DiscussionsController`
- **Source File:** `backend-nestjs/src/discussions/discussions.controller.ts`
- **Base Path Prefix:** `/api/discussions`
- **Total Endpoints:** 9

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/discussions/problem/:problemId` | `ApiOperation()` | *Public / None* | `{ summary: 'Get discussion threads for a problem' }` |
| `GET` | `/api/discussions/:threadId` | `ApiOperation()` | *Public / None* | `{ summary: 'Get a single discussion thread' }` |
| `GET` | `/api/discussions/:threadId/replies` | `ApiOperation()` | *Public / None* | `{ summary: 'Get replies for a discussion thread' }` |
| `POST` | `/api/discussions` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `DELETE` | `/api/discussions/:threadId` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `PUT` | `/api/discussions/:threadId/vote` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `POST` | `/api/discussions/:threadId/replies` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `DELETE` | `/api/discussions/replies/:replyId` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `PUT` | `/api/discussions/replies/:replyId/vote` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |

---

### Controller: `ExamSecurityController`
- **Source File:** `backend-nestjs/src/exam-security/exam-security.controller.ts`
- **Base Path Prefix:** `/api/exam-security`
- **Total Endpoints:** 3

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/exam-security/:assessmentId/secure-session/init` | `HttpCode()` | JwtAuthGuard | `200` |
| `POST` | `/api/exam-security/session/:sessionId/heartbeat` | `HttpCode()` | JwtAuthGuard | `200` |
| `POST` | `/api/exam-security/session/:sessionId/violation` | `HttpCode()` | JwtAuthGuard | `200` |

---

### Controller: `ExecutionController`
- **Source File:** `backend-nestjs/src/execution/execution.controller.ts`
- **Base Path Prefix:** `/api/execution`
- **Total Endpoints:** 5

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/execution/health` | `SkipThrottle()` | JwtAuthGuard, SubmissionRateLimitGuard | *None* |
| `GET` | `/api/execution/runtimes` | `SkipThrottle()` | JwtAuthGuard, SubmissionRateLimitGuard | *None* |
| `POST` | `/api/execution/run` | `HttpCode()` | JwtAuthGuard, SubmissionRateLimitGuard | `HttpStatus.OK` |
| `POST` | `/api/execution/analyze-complexity` | `HttpCode()` | JwtAuthGuard, SubmissionRateLimitGuard | `HttpStatus.OK` |
| `GET` | `/api/execution/jobs/:jobId` | `ApiOperation()` | JwtAuthGuard, SubmissionRateLimitGuard | `{ summary: 'Get an asynchronous execution result' }` |

---

### Controller: `HealthController`
- **Source File:** `backend-nestjs/src/health/health.controller.ts`
- **Base Path Prefix:** `/api/health`
- **Total Endpoints:** 4

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | `ApiOperation()` | *Public / None* | `{ summary: 'Check general API health status' }` |
| `GET` | `/api/health/live` | `ApiOperation()` | *Public / None* | `{ summary: 'Liveness probe (process is running and responsive` |
| `GET` | `/api/health/startup` | `ApiOperation()` | *Public / None* | `{ summary: 'Startup probe (initialization completed` |
| `GET` | `/api/health/ready` | `HttpCode()` | *Public / None* | `HttpStatus.OK` |

---

### Controller: `AdminLearningController`
- **Source File:** `backend-nestjs/src/learning/controllers/admin-learning.controller.ts`
- **Base Path Prefix:** `/api/admin/learning`
- **Total Endpoints:** 26

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/learning/overview` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Learning overview metrics for admin dashboard' }` |
| `GET` | `/api/admin/learning/paths` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'List all paths for admin' }` |
| `POST` | `/api/admin/learning/paths` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Create a new learning path' }` |
| `GET` | `/api/admin/learning/paths/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Get learning path details with courses and modules' }` |
| `PATCH` | `/api/admin/learning/paths/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Update a learning path' }` |
| `DELETE` | `/api/admin/learning/paths/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Delete a learning path' }` |
| `POST` | `/api/admin/learning/paths/:id/publish` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Publish learning path revision' }` |
| `GET` | `/api/admin/learning/courses` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'List all courses' }` |
| `POST` | `/api/admin/learning/courses` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Create a new course' }` |
| `PATCH` | `/api/admin/learning/courses/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Update a course' }` |
| `DELETE` | `/api/admin/learning/courses/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Delete a course' }` |
| `POST` | `/api/admin/learning/courses/:id/modules` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Add module to course' }` |
| `PATCH` | `/api/admin/learning/modules/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Update course module details and study time' }` |
| `PUT` | `/api/admin/learning/modules/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Update course module details and study time' }` |
| `DELETE` | `/api/admin/learning/modules/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Delete course module' }` |
| `POST` | `/api/admin/learning/modules/:id/lessons` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Add structured lesson to module' }` |
| `PATCH` | `/api/admin/learning/lessons/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Update a lesson' }` |
| `DELETE` | `/api/admin/learning/lessons/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Delete a lesson' }` |
| `POST` | `/api/admin/learning/lessons/:id/exercises` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Attach practice exercise to lesson' }` |
| `DELETE` | `/api/admin/learning/exercises/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Delete a practice exercise' }` |
| `GET` | `/api/admin/learning/badges` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'List all badge definitions' }` |
| `POST` | `/api/admin/learning/badges` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Create a badge definition' }` |
| `GET` | `/api/admin/learning/certificates` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'List all issued certificates for admin' }` |
| `GET` | `/api/admin/learning/certificate-templates` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'List all certificate templates' }` |
| `POST` | `/api/admin/learning/certificate-templates` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Create certificate template' }` |
| `POST` | `/api/admin/learning/certificates/:id/revoke` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Revoke an issued certificate' }` |

---

### Controller: `CertificateVerificationController`
- **Source File:** `backend-nestjs/src/learning/controllers/certificate-verification.controller.ts`
- **Base Path Prefix:** `/api/certificates`
- **Total Endpoints:** 1

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/certificates/verify/:credentialId` | `ApiOperation()` | *Public / None* | `{ summary: 'Publicly verify a credential without authentication' }` |

---

### Controller: `LearningController`
- **Source File:** `backend-nestjs/src/learning/controllers/learning.controller.ts`
- **Base Path Prefix:** `/api/learning`
- **Total Endpoints:** 14

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/learning/paths` | `UseGuards()` | *Public / None* | `OptionalJwtAuthGuard` |
| `GET` | `/api/learning/paths/:slug` | `UseGuards()` | *Public / None* | `OptionalJwtAuthGuard` |
| `POST` | `/api/learning/paths/:id/enroll` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/learning/courses/:id` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/learning/lessons/:id` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `POST` | `/api/learning/lessons/:id/time-spent` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/learning/lessons/:id/completion-status` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `POST` | `/api/learning/lessons/:id/complete` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `POST` | `/api/learning/exercises/:id/submit` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/learning/me/progress` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/learning/me/achievements` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `GET` | `/api/learning/me/certificates` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `POST` | `/api/learning/paths/:id/certify` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |
| `POST` | `/api/learning/playground/run` | `UseGuards()` | *Public / None* | `JwtAuthGuard` |

---

### Controller: `HealthAndTelemetryController`
- **Source File:** `backend-nestjs/src/observability/health/health.controller.ts`
- **Base Path Prefix:** `/api`
- **Total Endpoints:** 2

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health/deep` | `ApiOperation()` | *Public / None* | `{ summary: 'Deep Synthetic Health Probe' }` |
| `POST` | `/api/telemetry/client-events` | `HttpCode()` | *Public / None* | `HttpStatus.NO_CONTENT` |

---

### Controller: `MetricsController`
- **Source File:** `backend-nestjs/src/observability/metrics/metrics.controller.ts`
- **Base Path Prefix:** `/api`
- **Total Endpoints:** 1

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api` | `ApiOperation()` | *Public / None* | `{ summary: 'Prometheus metrics exposition endpoint' }` |

---

### Controller: `PetController`
- **Source File:** `backend-nestjs/src/pet/pet.controller.ts`
- **Base Path Prefix:** `/api/pet`
- **Total Endpoints:** 1

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/pet/ask` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Ask the practice pet about a coding problem' }` |

---

### Controller: `ProblemsController`
- **Source File:** `backend-nestjs/src/problems/problems.controller.ts`
- **Base Path Prefix:** `/api/problems`
- **Total Endpoints:** 2

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/problems` | `ApiOperation()` | *Public / None* | `{ summary: 'Get paginated problems list' }` |
| `GET` | `/api/problems/:slug` | `ApiOperation()` | *Public / None* | `{ summary: 'Get single problem by slug' }` |

---

### Controller: `QuestionsController`
- **Source File:** `backend-nestjs/src/questions/questions.controller.ts`
- **Base Path Prefix:** `/api/admin/questions`
- **Total Endpoints:** 17

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/questions` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{     summary:       'Get paginated list of assessment questions with topic/difficulty filters'`<br>`}` |
| `POST` | `/api/admin/questions/import` | `HttpCode()` | JwtAuthGuard, AssessmentAuthorGuard | `HttpStatus.OK` |
| `POST` | `/api/admin/questions/import/auto` | `HttpCode()` | JwtAuthGuard, AssessmentAuthorGuard | `HttpStatus.OK` |
| `POST` | `/api/admin/questions/import/confirm` | `HttpCode()` | JwtAuthGuard, AssessmentAuthorGuard | `HttpStatus.OK` |
| `GET` | `/api/admin/questions/topics` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{     summary: 'Get aggregated topic distribution and difficulty breakdowns'`<br>`}` |
| `GET` | `/api/admin/questions/:id` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'Get single question details (Admin full view` |
| `POST` | `/api/admin/questions` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'Manually author a new assessment question' }` |
| `PUT` | `/api/admin/questions/bulk` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'Bulk update multiple assessment questions' }` |
| `PUT` | `/api/admin/questions/:id` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'Update an existing assessment question' }` |
| `DELETE` | `/api/admin/questions/:id` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'Soft delete (archive` |
| `PUT` | `/api/admin/questions/:id/approve` | `UseGuards()` | JwtAuthGuard, AssessmentAuthorGuard | `AdminGuard` |
| `PUT` | `/api/admin/questions/:id/reject` | `UseGuards()` | JwtAuthGuard, AssessmentAuthorGuard | `AdminGuard` |
| `GET` | `/api/admin/questions` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'List all question bank collections' }` |
| `GET` | `/api/admin/questions/:id` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{     summary: 'Get single question bank with populated questions'`<br>`}` |
| `POST` | `/api/admin/questions` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'Create a new question bank collection' }` |
| `PUT` | `/api/admin/questions/:id` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'Update a question bank collection' }` |
| `DELETE` | `/api/admin/questions/:id` | `ApiOperation()` | JwtAuthGuard, AssessmentAuthorGuard | `{ summary: 'Delete a question bank collection' }` |

---

### Controller: `ReportsController`
- **Source File:** `backend-nestjs/src/reports/reports.controller.ts`
- **Base Path Prefix:** `/api/reports`
- **Total Endpoints:** 1

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/reports/assessment-attempt/:attemptId` | `getStudentResultReport()` | JwtAuthGuard | `@Param('attemptId'` |

---

### Controller: `StudentsController`
- **Source File:** `backend-nestjs/src/students/students.controller.ts`
- **Base Path Prefix:** `/api/admin/students`
- **Total Endpoints:** 13

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/students` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Get paginated list of students with filters' }` |
| `GET` | `/api/admin/students/email-status` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{     summary: 'Get delivery metrics and log entries for credential emails'`<br>`}` |
| `GET` | `/api/admin/students/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Get single student details' }` |
| `POST` | `/api/admin/students` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Create a new assessment student' }` |
| `PUT` | `/api/admin/students/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Update student profile/details' }` |
| `PUT` | `/api/admin/students/:id/status` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Activate or deactivate a student' }` |
| `DELETE` | `/api/admin/students/:id` | `ApiOperation()` | JwtAuthGuard, AdminGuard | `{ summary: 'Deactivate (soft delete` |
| `POST` | `/api/admin/students/:id/reset-password` | `HttpCode()` | JwtAuthGuard, AdminGuard | `HttpStatus.OK` |
| `POST` | `/api/admin/students/import` | `HttpCode()` | JwtAuthGuard, AdminGuard | `HttpStatus.OK` |
| `POST` | `/api/admin/students/import/confirm` | `HttpCode()` | JwtAuthGuard, AdminGuard | `HttpStatus.OK` |
| `POST` | `/api/admin/students/send-credentials` | `HttpCode()` | JwtAuthGuard, AdminGuard | `HttpStatus.OK` |
| `POST` | `/api/admin/students/:id/send-credential` | `HttpCode()` | JwtAuthGuard, AdminGuard | `HttpStatus.OK` |
| `POST` | `/api/admin/students/retry-failed` | `HttpCode()` | JwtAuthGuard, AdminGuard | `HttpStatus.OK` |

---

### Controller: `SubmissionsController`
- **Source File:** `backend-nestjs/src/submissions/submissions.controller.ts`
- **Base Path Prefix:** `/api/submissions`
- **Total Endpoints:** 10

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/submissions` | `UseGuards()` | JwtAuthGuard | `SubmissionRateLimitGuard` |
| `GET` | `/api/submissions/progress` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Get personal solved/attempted status for visible problems' }` |
| `GET` | `/api/submissions/recent` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Get recent submissions' }` |
| `GET` | `/api/submissions/stats` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Get user statistics' }` |
| `GET` | `/api/submissions/user/:userId` | `ApiOperation()` | JwtAuthGuard | `{ summary: "Get a specific user's submissions history" }` |
| `GET` | `/api/submissions/problem/:problemId` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Get submissions for a specific problem' }` |
| `GET` | `/api/submissions/:id` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Get submission details by ID' }` |
| `GET` | `/api/submissions/:id/result` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Get submission result and status' }` |
| `POST` | `/api/submissions/:id/cancel` | `HttpCode()` | JwtAuthGuard | `HttpStatus.OK` |
| `GET` | `/api/submissions/problem/:problemId/stats` | `ApiOperation()` | JwtAuthGuard | `{ summary: 'Get live submission statistics for a problem' }` |

---

### Controller: `UsersController`
- **Source File:** `backend-nestjs/src/users/users.controller.ts`
- **Base Path Prefix:** `/api/users`
- **Total Endpoints:** 2

| Method | Full Route Path | Handler Method | Guards / Roles | Parameter Decorators |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/users/leaderboard` | `ApiOperation()` | *Public / None* | `{ summary: 'Get top users ranked by XP' }` |
| `GET` | `/api/users/:identifier` | `ApiOperation()` | *Public / None* | `{ summary: 'Get public user profile' }` |

---

## 3. GraphQL Schema Reference

- **Schema Generation:** Automated Code-First via Apollo Driver (`backend-nestjs/src/app.module.ts`).
- **Endpoint:** `/graphql` (POST).
- **Exported File:** `backend-nestjs/src/schema.gql`.

### Queries
| Operation Name | Return Type | Arguments | Resolver File | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `ping` | `String!` | *None* | `src/health/health.resolver.ts` | Heartbeat query returning `"pong"`. |

---

## 4. WebSocket & Real-Time Gateway Protocols

- **Gateway Class:** `AppGateway` (`backend-nestjs/src/gateway/app.gateway.ts`).
- **Socket.IO Transport:** Polling and WebSockets with CORS validation (`backend-nestjs/src/common/cors.util.ts`).
- **Authentication Handshake:** Requires valid Bearer JWT in `handshake.auth.token` or `handshake.headers.authorization`. Upon connection, the socket automatically joins private room `user_${user.id}`.
- **Per-Socket Rate Limiting:** Max 25 messages per second per client socket.

### Inbound Message Handlers (`@SubscribeMessage`)

| Message Event | Inbound Payload | Handled Rooms | Authorization Rule |
| :--- | :--- | :--- | :--- |
| `join_contest` | `{ contestId: string }` | `contest_${contestId}` | Authenticated user must be registered for the contest or hold an administrative role. Emits `user_joined` to room. |
| `leave_contest` | `{ contestId: string }` | `contest_${contestId}` | Leaves room and broadcasts `user_left`. |
| `join_user` | `{ userId: string }` | `user_${userId}` | Room isolation: students cannot join another user's room unless user has platform admin privileges. |

### Outbound Broadcasts & Redis Pub/Sub Relays

- **Distributed Relay Channels:**
  - `codeskill:ws:events`: Cross-node event relay for multi-instance deployments.
  - `codeskill:gateway:events`: Room broadcast bridge.
- **Emitted Events:**
  - `user_joined` (payload: `{ userId: string }`)
  - `user_left` (payload: `{ userId: string }`)
  - `submission_verdict` (live test case pass/fail feedback)
  - `contest_leaderboard_update` (live standings and scores)
  - `error` (payload: `{ message: string }`)