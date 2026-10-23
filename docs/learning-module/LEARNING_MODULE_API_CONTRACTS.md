# CodeSkill Learning Module — API Contracts (Batch 0)

**Date:** October 21, 2026  
**Status:** Approved for Implementation  
**Base URL:** `/api`  

---

## 1. Student Learning APIs (`/learning`)

All endpoints require `Bearer` JWT authentication unless marked **[PUBLIC]**.

### 1.1 Learning Path Catalog & Details
- `GET /learning/paths` **[PUBLIC / AUTH]**
  - **Query:** `page`, `limit`, `search`, `difficulty`, `tag`
  - **Response:** Paginated list of published learning paths with course count, estimated duration, difficulty, and enrolled status (if authenticated).
- `GET /learning/paths/:slug` **[PUBLIC / AUTH]**
  - **Response:** Detailed path metadata, prerequisites, and full course syllabus tree.
- `POST /learning/paths/:id/enroll` **[AUTH]**
  - **Response:** `{ enrollmentId, pathId, status: "active", enrolledAt }`

### 1.2 Curriculum, Lessons & Practice
- `GET /learning/courses/:courseId` **[AUTH]**
  - **Response:** Ordered modules, lessons, exercises, and learner's current progress.
- `GET /learning/lessons/:lessonId` **[AUTH]**
  - **Response:** Lesson content (structured text, code snippets, notes, learning objectives) and attached exercises.
- `POST /learning/lessons/:lessonId/complete` **[AUTH]**
  - **Body:** `{}`
  - **Response:** `{ lessonId, completed: true, completedAt, nextLessonId, courseProgress }`
  - *Validation:* If the lesson contains mandatory knowledge checks or exercises, the server verifies they have passed before marking complete.
- `POST /learning/exercises/:exerciseId/submit` **[AUTH]**
  - **Body:** `{ code?: string, language?: string, selectedOption?: number }`
  - **Response:** `{ passed: boolean, feedback: ExecutionFeedbackResult, xpAwarded: number, unlockedBadges: Badge[] }`

### 1.3 Gamification & Progress
- `GET /learning/me/progress` **[AUTH]**
  - **Response:** Aggregate paths in progress, recent active lessons, completion percentages, streak count.
- `GET /learning/me/achievements` **[AUTH]**
  - **Response:** Total XP, level breakdown by skill category, earned badges with unlock dates.
- `GET /learning/me/certificates` **[AUTH]**
  - **Response:** List of earned credentials with PDF download URLs and verification codes.

---

## 2. Public Credential Verification (`/certificates`)

- `GET /certificates/verify/:credentialId` **[PUBLIC]**
  - **Response:**
    ```json
    {
      "valid": true,
      "credentialId": "CS-2026-A89F12",
      "recipientName": "Jane Doe",
      "learningPath": "Data Structures & Algorithms Mastery",
      "issuedAt": "2026-10-21T06:00:00Z",
      "status": "valid",
      "issuer": "CodeSkill · Chandigarh University",
      "skills": ["Binary Trees", "Graphs", "Dynamic Programming"]
    }
    ```
  - *Security:* Does **NOT** leak student email, user ID, internal scores, or private identifiers.

---

## 3. Admin Studio APIs (`/admin/learning`)

All endpoints require `Bearer` JWT with admin privileges (`AdminGuard`).

### 3.1 Path & Curriculum Management
- `POST /admin/learning/paths`: Create a new draft path.
- `PATCH /admin/learning/paths/:id`: Update draft path properties.
- `POST /admin/learning/paths/:id/publish`: Validate completeness and freeze a new published revision.
- `POST /admin/learning/courses`: Create a new course.
- `POST /admin/learning/courses/:id/modules`: Add/reorder modules.
- `POST /admin/learning/modules/:id/lessons`: Create a text-based lesson.
- `POST /admin/learning/lessons/:id/exercises`: Attach a coding exercise or quiz.

### 3.2 Gamification & Certification Policies
- `POST /admin/learning/badges`: Define badge criteria, rarity, and artwork URL.
- `GET /admin/learning/certification-policies`: View path completion rules and pass thresholds.
- `PATCH /admin/learning/certification-policies/:id`: Update completion criteria.
- `POST /admin/learning/certificates/:id/revoke`: Revoke a credential with mandatory audit reason.

### 3.3 Analytics & Reporting
- `GET /admin/learning/reports/overview`: Enrolled student counts, completion funnels, active learners.
- `GET /admin/learning/students/:id/audit`: Full learning attempt history, submission logs, and XP transactions.
