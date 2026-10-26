# 💻 CodeSkill Frontend — Next.js 16 App Router & Examination UI

The responsive, high-performance web application for the **CodeSkill Assessment Platform**, built with **Next.js 16.2.9 (App Router)**, **React 19.2.4**, **Tailwind CSS v4**, **Monaco Editor**, and **Zustand**.

---

## 🌟 Key Features & UI Capabilities

- **App Router Architecture (`src/app/`):** 79 optimized server and static routes covering Public Problems, Live Contests, Student Assessment Exam Taker, and Faculty/Admin Portals.
- **Monaco Code Editor (`src/components/editor/`):** Full-featured code editor with syntax highlighting, LeetCode function signature support, Vim mode (`monaco-vim`), and custom testcase execution feedback.
- **Client-Side Anti-Cheat & Proctoring (`src/hooks/anti-cheat/`):**
  - MediaPipe Vision face mesh (`@mediapipe/tasks-vision` / `@vladmandic/human`) for multi-face detection and gaze anomaly alerts.
  - Document visibility & blur detection for tab switching warnings.
  - Fullscreen lock enforcement via the Fullscreen API.
  - Automated webcam frame capture and S3 presigned evidence submission.
  - Authenticated Socket.IO event bridge for instant proctoring commands (e.g. force submit).
- **State Management & Offline Drafts:** Zustand stores paired with `idb-keyval` (IndexedDB) for offline question and assessment draft persistence across browser reloads.
- **PDF Report Generation:** In-browser and server-rendered assessment scorecards powered by `@react-pdf/renderer`.
- **Practice Pet AI Mascot:** Gamified coding assistant featuring client-side Hugging Face Transformers speech synthesis and animated feedback.

---

## 🛠️ Developer Setup & Commands

### Installation
```bash
# Install dependencies with legacy peer dependency resolution
npm ci --legacy-peer-deps
```

### Environment Configuration
```bash
cp .env.example .env.local
```
Key environment variables:
- `NEXT_PUBLIC_SITE_URL`: Canonical site domain for SEO, sitemap.xml, and robots.txt (defaults to `https://codeskill.novaserve.cloud`)
- `NEXT_PUBLIC_API_URL`: Browser API endpoint (e.g., `http://localhost:5001/api`)
- `INTERNAL_BACKEND_URL`: Server-side rewrite URL (e.g., `http://127.0.0.1:5001/api`)
- `NEXT_PUBLIC_WS_URL`: WebSocket origin for real-time Socket.IO judge updates (e.g., `http://localhost:5001`)

### Development & Testing
```bash
# Start development server with Webpack (Port 3000)
npm run dev

# Run full frontend test suite (64 test files):
npm test -- --runInBand

# Run single component test:
npm test -- --runInBand --runTestsByPath src/__tests__/components/PublicProblems.test.tsx

# Type-check codebase without emitting files:
npm run typecheck

# Build optimized production bundle:
npm run build
```

---

## 📂 Route Overview

- `/problems`: Public coding problem catalog with topic and difficulty filters.
- `/problems/[id]`: Interactive coding workspace with Monaco Editor and live testcase runner.
- `/assessments/[id]/take`: Proctored student examination workspace with camera feed and security hooks.
- `/contests/[id]/attempt`: Live contest workspace with ACM-ICPC penalty scoring and Socket.IO feeds.
- `/contests/leaderboard`: Real-time public and contest leaderboards.
- `/learning`: Catalog of guided learning paths with search and difficulty filters.
- `/learning/[pathSlug]`: Path syllabus, curriculum tree, and enrollment.
- `/learning/[pathSlug]/[courseSlug]`: Reading module with interactive Monaco code exercises and quizzes.
- `/verify/[credentialId]`: Public digital certificate verification portal.
- `/skill-development`: Skill development overview with 3D team helix.
- `/admin/*`: Administrator and faculty studios for questions, assessments, student onboarding, cohort analytics, and learning paths (`/admin/learning`).
- `/health/ready`: Liveness and readiness probe consumed by AWS Application Load Balancers.
