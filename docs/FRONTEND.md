# CodeSkill Frontend Architecture & UI Reference

> **Ground-Truth Audit Document**  
> Source of truth: Next.js 16 App Router codebase in `frontend-v2/src/` on `origin/main`. Covers 100% of routes (103 pages, 5 layouts, 5 route handlers), all 130 components, all 13 hooks, state stores, and proctoring/editor integrations.

---

## Table of Contents

- [1. Next.js 16 App Router Architecture](#1-nextjs-16-app-router-architecture)
- [2. Complete Route Inventory (103 Pages, 5 Layouts, 5 Route Handlers)](#2-complete-route-inventory)
- [3. Component Directory by Domain (130 Components)](#3-component-directory-by-domain)
- [4. API Client & Execution Polling Layer](#4-api-client--execution-polling-layer)
- [5. Custom React Hooks Directory (13 Hooks)](#5-custom-react-hooks-directory)
- [6. State Management & Context Providers](#6-state-management--context-providers)
- [7. Monaco Editor & Proctoring Media Architecture](#7-monaco-editor--proctoring-media-architecture)

---

## 1. Next.js 16 App Router Architecture

- **Framework:** Next.js 16.2.9 with React 19 (Webpack bundler configured in `next.config.ts`).
- **Rendering Strategy:** Dynamic server-side rendering for protected candidate/admin flows (`/assessments/[id]/take`, `/admin/*`) and static prerendering for marketing/auth landing pages.
- **Authentication:** `useAuth` hook and Axios request/response interceptors (`src/config/api.ts`) managing token storage and automated refresh against `/api/auth/refresh`.
- **Package Optimization:** `optimizePackageImports` configured for `lucide-react`, `@hugeicons/react`, `dayjs`, `recharts`, and `framer-motion`.

---

## 2. Complete Route Inventory

### Application Layouts (`layout.tsx`)

| File Path | Target Route | Purpose |
| :--- | :--- | :--- |
| `src/app/admin/layout.tsx` | `/admin` | Shared root layout, theme provider, and global navigation wrapper. |
| `src/app/campus/layout.tsx` | `/campus` | Shared root layout, theme provider, and global navigation wrapper. |
| `src/app/company/layout.tsx` | `/company` | Shared root layout, theme provider, and global navigation wrapper. |
| `src/app/layout.tsx` | `/` | Shared root layout, theme provider, and global navigation wrapper. |
| `src/app/teacher/layout.tsx` | `/teacher` | Shared root layout, theme provider, and global navigation wrapper. |

### Application Pages (`page.tsx` - All 103 Routes)

| Page Route URL | Source File Path | Access Level / Role | Purpose / User Flow |
| :--- | :--- | :--- | :--- |
| `/` | `src/app/page.tsx` | *Public / Guest* | Page view and workflow controller. |
| `/admin/activity` | `src/app/admin/activity/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/analytics` | `src/app/admin/analytics/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/assessments` | `src/app/admin/assessments/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/assessments/[id]/analytics` | `src/app/admin/assessments/[id]/analytics/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/assessments/[id]/results` | `src/app/admin/assessments/[id]/results/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/assessments/create` | `src/app/admin/assessments/create/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/bugs` | `src/app/admin/bugs/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/bugs/[id]` | `src/app/admin/bugs/[id]/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/candidates` | `src/app/admin/candidates/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/candidates/[id]` | `src/app/admin/candidates/[id]/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/companies` | `src/app/admin/companies/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/contest-results` | `src/app/admin/contest-results/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/contests` | `src/app/admin/contests/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/contests/[id]/edit` | `src/app/admin/contests/[id]/edit/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/contests/create` | `src/app/admin/contests/create/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/dashboard` | `src/app/admin/dashboard/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/faq` | `src/app/admin/faq/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/learning` | `src/app/admin/learning/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/learning/paths` | `src/app/admin/learning/paths/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/learning/paths/[id]/edit` | `src/app/admin/learning/paths/[id]/edit/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/login` | `src/app/admin/login/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/mcqs` | `src/app/admin/mcqs/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/problems` | `src/app/admin/problems/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/problems/[id]/edit` | `src/app/admin/problems/[id]/edit/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/problems/create` | `src/app/admin/problems/create/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/problems/import` | `src/app/admin/problems/import/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/questions` | `src/app/admin/questions/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/questions/[id]/edit` | `src/app/admin/questions/[id]/edit/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/questions/create` | `src/app/admin/questions/create/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/questions/import` | `src/app/admin/questions/import/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/questions/pending` | `src/app/admin/questions/pending/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/questions/topics` | `src/app/admin/questions/topics/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/settings` | `src/app/admin/settings/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/students` | `src/app/admin/students/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/students/credentials` | `src/app/admin/students/credentials/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/students/import` | `src/app/admin/students/import/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/admin/universities` | `src/app/admin/universities/page.tsx` | **Admin / Faculty** | Page view and workflow controller. |
| `/assessments` | `src/app/assessments/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/assessments/[id]` | `src/app/assessments/[id]/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/assessments/[id]/result` | `src/app/assessments/[id]/result/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/assessments/[id]/take` | `src/app/assessments/[id]/take/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/campus` | `src/app/campus/page.tsx` | **Campus Coordinator** | Page view and workflow controller. |
| `/campus/batches` | `src/app/campus/batches/page.tsx` | **Campus Coordinator** | Page view and workflow controller. |
| `/campus/batches/[id]` | `src/app/campus/batches/[id]/page.tsx` | **Campus Coordinator** | Page view and workflow controller. |
| `/campus/dashboard` | `src/app/campus/dashboard/page.tsx` | **Campus Coordinator** | Page view and workflow controller. |
| `/campus/profile` | `src/app/campus/profile/page.tsx` | **Campus Coordinator** | Page view and workflow controller. |
| `/campus/students` | `src/app/campus/students/page.tsx` | **Campus Coordinator** | Page view and workflow controller. |
| `/company` | `src/app/company/page.tsx` | **Corporate Partner** | Page view and workflow controller. |
| `/company/candidates` | `src/app/company/candidates/page.tsx` | **Corporate Partner** | Page view and workflow controller. |
| `/company/dashboard` | `src/app/company/dashboard/page.tsx` | **Corporate Partner** | Page view and workflow controller. |
| `/company/jobs` | `src/app/company/jobs/page.tsx` | **Corporate Partner** | Page view and workflow controller. |
| `/company/jobs/create` | `src/app/company/jobs/create/page.tsx` | **Corporate Partner** | Page view and workflow controller. |
| `/company/profile` | `src/app/company/profile/page.tsx` | **Corporate Partner** | Page view and workflow controller. |
| `/company/team` | `src/app/company/team/page.tsx` | **Corporate Partner** | Page view and workflow controller. |
| `/contact` | `src/app/contact/page.tsx` | Authenticated User | Page view and workflow controller. |
| `/contests` | `src/app/contests/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/contests/[id]` | `src/app/contests/[id]/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/contests/[id]/attempt` | `src/app/contests/[id]/attempt/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/contests/[id]/results` | `src/app/contests/[id]/results/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/contests/leaderboard` | `src/app/contests/leaderboard/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/contests/report-preview` | `src/app/contests/report-preview/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/dashboard` | `src/app/dashboard/page.tsx` | Authenticated User | Page view and workflow controller. |
| `/demo-report` | `src/app/demo-report/page.tsx` | Authenticated User | Page view and workflow controller. |
| `/forgot-password` | `src/app/(auth)/forgot-password/page.tsx` | *Public / Guest* | Page view and workflow controller. |
| `/leaderboard` | `src/app/leaderboard/page.tsx` | Authenticated User | Page view and workflow controller. |
| `/learning` | `src/app/learning/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/learning/[pathSlug]` | `src/app/learning/[pathSlug]/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/learning/[pathSlug]/[courseSlug]` | `src/app/learning/[pathSlug]/[courseSlug]/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/learning/me/achievements` | `src/app/learning/me/achievements/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/learning/me/certificates` | `src/app/learning/me/certificates/page.tsx` | **Student (Authenticated)** | Page view and workflow controller. |
| `/login` | `src/app/(auth)/login/page.tsx` | *Public / Guest* | Page view and workflow controller. |
| `/login-animated` | `src/app/(auth)/login-animated/page.tsx` | Authenticated User | Page view and workflow controller. |
| `/privacy` | `src/app/privacy/page.tsx` | Authenticated User | Page view and workflow controller. |
| `/problems` | `src/app/problems/page.tsx` | Authenticated User | Page view and workflow controller. |
| `/problems/[id]` | `src/app/problems/[id]/page.tsx` | Authenticated User | Page view and workflow controller. |
| `/profile` | `src/app/profile/page.tsx` | Authenticated User | Page view and workflow controller. |
| `/register` | `src/app/(auth)/register/page.tsx` | *Public / Guest* | Page view and workflow controller. |
| `/result-demo` | `src/app/result-demo/page.tsx` | Authenticated User | Page view and workflow controller. |
| `/skill-development` | `src/app/skill-development/page.tsx` | Authenticated User | Page view and workflow controller. |
| `/student-login` | `src/app/student-login/page.tsx` | *Public / Guest* | Page view and workflow controller. |
| `/teacher` | `src/app/teacher/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/assessments` | `src/app/teacher/assessments/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/assessments/create` | `src/app/teacher/assessments/create/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/candidates` | `src/app/teacher/candidates/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/contest-results` | `src/app/teacher/contest-results/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/contests` | `src/app/teacher/contests/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/dashboard` | `src/app/teacher/dashboard/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/faq` | `src/app/teacher/faq/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/mcqs` | `src/app/teacher/mcqs/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/problems` | `src/app/teacher/problems/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/problems/create` | `src/app/teacher/problems/create/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/questions` | `src/app/teacher/questions/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/questions/create` | `src/app/teacher/questions/create/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/questions/import` | `src/app/teacher/questions/import/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/questions/pending` | `src/app/teacher/questions/pending/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/questions/topics` | `src/app/teacher/questions/topics/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/students` | `src/app/teacher/students/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/students/credentials` | `src/app/teacher/students/credentials/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/teacher/students/import` | `src/app/teacher/students/import/page.tsx` | **Teacher / Faculty** | Page view and workflow controller. |
| `/terms` | `src/app/terms/page.tsx` | Authenticated User | Page view and workflow controller. |
| `/u/[username]` | `src/app/u/[username]/page.tsx` | Authenticated User | Page view and workflow controller. |
| `/verify/[credentialId]` | `src/app/verify/[credentialId]/page.tsx` | Authenticated User | Page view and workflow controller. |

### API Route Handlers (`route.ts`)

| Route URL | File Path | Method | Purpose |
| :--- | :--- | :--- | :--- |
| `/health/live` | `src/app/health/live/route.ts` | `GET` | Health checking and SSR telemetry endpoints. |
| `/health/ready` | `src/app/health/ready/route.ts` | `GET` | Health checking and SSR telemetry endpoints. |
| `/health` | `src/app/health/route.ts` | `GET` | Health checking and SSR telemetry endpoints. |
| `/health/startup` | `src/app/health/startup/route.ts` | `GET` | Health checking and SSR telemetry endpoints. |
| `/healthz` | `src/app/healthz/route.ts` | `GET` | Health checking and SSR telemetry endpoints. |

---

## 3. Component Directory by Domain (130 Components)

### Domain: `Result` (14 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/Result/AIAssistantPanel.tsx` | `AIAssistantPanel` | Domain UI element and view logic. |
| `src/components/Result/CompilerMessage.tsx` | `CompilerMessage` | Domain UI element and view logic. |
| `src/components/Result/ExecutionFeedback.tsx` | `ExecutionFeedback` | Domain UI element and view logic. |
| `src/components/Result/OutputPanel.tsx` | `OutputPanel` | Domain UI element and view logic. |
| `src/components/Result/PracticeConfetti.tsx` | `PracticeConfetti` | Domain UI element and view logic. |
| `src/components/Result/ResultCard.tsx` | `ResultCard` | Domain UI element and view logic. |
| `src/components/Result/ResultHeader.tsx` | `ResultHeader` | Domain UI element and view logic. |
| `src/components/Result/ResultToolbar.tsx` | `ResultToolbar` | Domain UI element and view logic. |
| `src/components/Result/RuntimeDistributionChart.tsx` | `RuntimeDistributionChart` | Domain UI element and view logic. |
| `src/components/Result/StatusBadge.tsx` | `StatusBadge` | Domain UI element and view logic. |
| `src/components/Result/SubmissionDetails.tsx` | `SubmissionDetails` | Domain UI element and view logic. |
| `src/components/Result/SubmissionSummary.tsx` | `SubmissionSummary` | Domain UI element and view logic. |
| `src/components/Result/TestCaseSidebar.tsx` | `TestCaseSidebar` | Domain UI element and view logic. |
| `src/components/Result/index.ts` | `index` | Domain UI element and view logic. |

### Domain: `admin` (4 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/admin/ActivityDiffViewer.tsx` | `ActivityDiffViewer` | Domain UI element and view logic. |
| `src/components/admin/AdminLogo.tsx` | `AdminLogo` | Domain UI element and view logic. |
| `src/components/admin/AdminSidebar.tsx` | `AdminSidebar` | Domain UI element and view logic. |
| `src/components/admin/PracticeProblemEditor.tsx` | `PracticeProblemEditor` | Domain UI element and view logic. |

### Domain: `analytics` (11 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/analytics/AnalyticsDashboardView.tsx` | `AnalyticsDashboardView` | Domain UI element and view logic. |
| `src/components/analytics/ChartCard.tsx` | `ChartCard` | Domain UI element and view logic. |
| `src/components/analytics/ChartTooltip.tsx` | `ChartTooltip` | Domain UI element and view logic. |
| `src/components/analytics/CodingActivityChart.tsx` | `CodingActivityChart` | Domain UI element and view logic. |
| `src/components/analytics/LanguageUsageChart.tsx` | `LanguageUsageChart` | Domain UI element and view logic. |
| `src/components/analytics/ScoreDistributionChart.tsx` | `ScoreDistributionChart` | Domain UI element and view logic. |
| `src/components/analytics/StudentEngagementChart.tsx` | `StudentEngagementChart` | Domain UI element and view logic. |
| `src/components/analytics/WeeklyActivityChart.tsx` | `WeeklyActivityChart` | Domain UI element and view logic. |
| `src/components/analytics/analyticsData.ts` | `analyticsData` | Domain UI element and view logic. |
| `src/components/analytics/index.ts` | `index` | Domain UI element and view logic. |
| `src/components/analytics/types.ts` | `types` | Domain UI element and view logic. |

### Domain: `assessment` (7 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/assessment/AssessmentReadingZoom.tsx` | `AssessmentReadingZoom` | Domain UI element and view logic. |
| `src/components/assessment/CodeSnippet.tsx` | `CodeSnippet` | Domain UI element and view logic. |
| `src/components/assessment/DSAAssessmentEditor.tsx` | `DSAAssessmentEditor` | Domain UI element and view logic. |
| `src/components/assessment/FloatingAssessmentMonitor.tsx` | `FloatingAssessmentMonitor` | Domain UI element and view logic. |
| `src/components/assessment/MicrophoneLevelIndicator.tsx` | `MicrophoneLevelIndicator` | Domain UI element and view logic. |
| `src/components/assessment/ResizableAssessmentPanels.tsx` | `ResizableAssessmentPanels` | Domain UI element and view logic. |
| `src/components/assessment/SafeExamBrowser.tsx` | `SafeExamBrowser` | Domain UI element and view logic. |

### Domain: `auth` (3 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/auth/GoogleLoginButton.tsx` | `GoogleLoginButton` | Domain UI element and view logic. |
| `src/components/auth/LoginForm.tsx` | `LoginForm` | Domain UI element and view logic. |
| `src/components/auth/LoginPage.tsx` | `LoginPage` | Domain UI element and view logic. |

### Domain: `contests` (1 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/contests/ContestPicker.tsx` | `ContestPicker` | Domain UI element and view logic. |

### Domain: `editor` (1 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/editor/MonacoEditor.tsx` | `MonacoEditor` | Domain UI element and view logic. |

### Domain: `errors` (1 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/errors/ErrorFallback.tsx` | `ErrorFallback` | Domain UI element and view logic. |

### Domain: `landing` (17 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/landing/AssessmentPreview.tsx` | `AssessmentPreview` | Domain UI element and view logic. |
| `src/components/landing/AssignedAssessments.tsx` | `AssignedAssessments` | Domain UI element and view logic. |
| `src/components/landing/CodingExperience.tsx` | `CodingExperience` | Domain UI element and view logic. |
| `src/components/landing/FeatureGrid.tsx` | `FeatureGrid` | Domain UI element and view logic. |
| `src/components/landing/FinalCTA.tsx` | `FinalCTA` | Domain UI element and view logic. |
| `src/components/landing/Hero.tsx` | `Hero` | Domain UI element and view logic. |
| `src/components/landing/HeroCodePreview.tsx` | `HeroCodePreview` | Domain UI element and view logic. |
| `src/components/landing/HowItWorks.tsx` | `HowItWorks` | Domain UI element and view logic. |
| `src/components/landing/InstitutionalSection.tsx` | `InstitutionalSection` | Domain UI element and view logic. |
| `src/components/landing/InteractiveListSection.tsx` | `InteractiveListSection` | Domain UI element and view logic. |
| `src/components/landing/LeaderboardPreview.tsx` | `LeaderboardPreview` | Domain UI element and view logic. |
| `src/components/landing/ProblemTablePreview.tsx` | `ProblemTablePreview` | Domain UI element and view logic. |
| `src/components/landing/QuoteOrbit.tsx` | `QuoteOrbit` | Domain UI element and view logic. |
| `src/components/landing/StudentAnalyticsPreview.tsx` | `StudentAnalyticsPreview` | Domain UI element and view logic. |
| `src/components/landing/SupportedLanguages.tsx` | `SupportedLanguages` | Domain UI element and view logic. |
| `src/components/landing/TopicsPreview.tsx` | `TopicsPreview` | Domain UI element and view logic. |
| `src/components/landing/TrustBar.tsx` | `TrustBar` | Domain UI element and view logic. |

### Domain: `learning` (2 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/learning/ChandigarhUniversityCertificate.tsx` | `ChandigarhUniversityCertificate` | Domain UI element and view logic. |
| `src/components/learning/ModuleCompletionModal.tsx` | `ModuleCompletionModal` | Domain UI element and view logic. |

### Domain: `pdf` (5 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/pdf/AssessmentPerformanceReport.tsx` | `AssessmentPerformanceReport` | Domain UI element and view logic. |
| `src/components/pdf/ScoreDonutChart.tsx` | `ScoreDonutChart` | Domain UI element and view logic. |
| `src/components/pdf/StudentResultReport.tsx` | `StudentResultReport` | Domain UI element and view logic. |
| `src/components/pdf/cu-assets.ts` | `cu-assets` | Domain UI element and view logic. |
| `src/components/pdf/cu-icons.tsx` | `cu-icons` | Domain UI element and view logic. |

### Domain: `pet` (3 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/pet/BytePetCanvas.tsx` | `BytePetCanvas` | Domain UI element and view logic. |
| `src/components/pet/PracticePet.tsx` | `PracticePet` | Domain UI element and view logic. |
| `src/components/pet/speech.worker.ts` | `speech.worker` | Domain UI element and view logic. |

### Domain: `problems` (8 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/problems/PracticeSampleCases.tsx` | `PracticeSampleCases` | Domain UI element and view logic. |
| `src/components/problems/PracticeTestConsole.tsx` | `PracticeTestConsole` | Domain UI element and view logic. |
| `src/components/problems/ProblemFormats.tsx` | `ProblemFormats` | Domain UI element and view logic. |
| `src/components/problems/ProblemNavigation.tsx` | `ProblemNavigation` | Domain UI element and view logic. |
| `src/components/problems/ProblemProgressMark.tsx` | `ProblemProgressMark` | Domain UI element and view logic. |
| `src/components/problems/ProblemWorkspace.tsx` | `ProblemWorkspace` | Domain UI element and view logic. |
| `src/components/problems/SampleTestCasesPanel.tsx` | `SampleTestCasesPanel` | Domain UI element and view logic. |
| `src/components/problems/WorkspaceTimer.tsx` | `WorkspaceTimer` | Domain UI element and view logic. |

### Domain: `providers` (1 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/providers/MotionProvider.tsx` | `MotionProvider` | Domain UI element and view logic. |

### Domain: `reports` (8 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/reports/ContestReportDocument.tsx` | `ContestReportDocument` | Domain UI element and view logic. |
| `src/components/reports/ContestReportDownloadButton.tsx` | `ContestReportDownloadButton` | Domain UI element and view logic. |
| `src/components/reports/pdf-styles.ts` | `pdf-styles` | Domain UI element and view logic. |
| `src/components/reports/pdf/AssessmentReportPDF.tsx` | `AssessmentReportPDF` | Domain UI element and view logic. |
| `src/components/reports/pdf/PDFComponents.tsx` | `PDFComponents` | Domain UI element and view logic. |
| `src/components/reports/pdf/PDFDownloadButton.tsx` | `PDFDownloadButton` | Domain UI element and view logic. |
| `src/components/reports/pdf/PDFStyles.ts` | `PDFStyles` | Domain UI element and view logic. |
| `src/components/reports/pdf/types.ts` | `types` | Domain UI element and view logic. |

### Domain: `root` (10 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/AnimatedBackground.tsx` | `AnimatedBackground` | Domain UI element and view logic. |
| `src/components/Background.tsx` | `Background` | Domain UI element and view logic. |
| `src/components/BrandLogo.tsx` | `BrandLogo` | Domain UI element and view logic. |
| `src/components/Footer.tsx` | `Footer` | Domain UI element and view logic. |
| `src/components/GSAPProvider.tsx` | `GSAPProvider` | Domain UI element and view logic. |
| `src/components/MorphHero.tsx` | `MorphHero` | Domain UI element and view logic. |
| `src/components/Navbar.tsx` | `Navbar` | Domain UI element and view logic. |
| `src/components/Providers.tsx` | `Providers` | Domain UI element and view logic. |
| `src/components/TestimonialsSection.tsx` | `TestimonialsSection` | Domain UI element and view logic. |
| `src/components/ThemeToggle.tsx` | `ThemeToggle` | Domain UI element and view logic. |

### Domain: `skill-development` (3 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/skill-development/MentorGratitude.tsx` | `MentorGratitude` | Domain UI element and view logic. |
| `src/components/skill-development/TeamHelixGallery.tsx` | `TeamHelixGallery` | Domain UI element and view logic. |
| `src/components/skill-development/TeamSection.tsx` | `TeamSection` | Domain UI element and view logic. |

### Domain: `ui` (31 Components)

| Component File Path | Component Name | Primary Purpose |
| :--- | :--- | :--- |
| `src/components/ui/MultiSelectDropdown.tsx` | `MultiSelectDropdown` | Domain UI element and view logic. |
| `src/components/ui/ProgrammingLanguageIcon.tsx` | `ProgrammingLanguageIcon` | Domain UI element and view logic. |
| `src/components/ui/auth-ui.tsx` | `auth-ui` | Domain UI element and view logic. |
| `src/components/ui/badge.tsx` | `badge` | Domain UI element and view logic. |
| `src/components/ui/bento-grid.tsx` | `bento-grid` | Domain UI element and view logic. |
| `src/components/ui/button.tsx` | `button` | Domain UI element and view logic. |
| `src/components/ui/card.tsx` | `card` | Domain UI element and view logic. |
| `src/components/ui/codeskill-footer-animation.tsx` | `codeskill-footer-animation` | Domain UI element and view logic. |
| `src/components/ui/contribution-skyline-demo.tsx` | `contribution-skyline-demo` | Domain UI element and view logic. |
| `src/components/ui/contribution-skyline.tsx` | `contribution-skyline` | Domain UI element and view logic. |
| `src/components/ui/demo-spinner.tsx` | `demo-spinner` | Domain UI element and view logic. |
| `src/components/ui/demo.tsx` | `demo` | Domain UI element and view logic. |
| `src/components/ui/domino-gallery.tsx` | `domino-gallery` | Domain UI element and view logic. |
| `src/components/ui/dropdown-menu.tsx` | `dropdown-menu` | Domain UI element and view logic. |
| `src/components/ui/fluid-grid.tsx` | `fluid-grid` | Domain UI element and view logic. |
| `src/components/ui/footer-section.tsx` | `footer-section` | Domain UI element and view logic. |
| `src/components/ui/hover-footer.tsx` | `hover-footer` | Domain UI element and view logic. |
| `src/components/ui/input.tsx` | `input` | Domain UI element and view logic. |
| `src/components/ui/interactive-card.tsx` | `interactive-card` | Domain UI element and view logic. |
| `src/components/ui/interactive-list-preview.tsx` | `interactive-list-preview` | Domain UI element and view logic. |
| `src/components/ui/modern-animated-sign-in.tsx` | `modern-animated-sign-in` | Domain UI element and view logic. |
| `src/components/ui/modern-loader-utils/typeanimation.tsx` | `typeanimation` | Domain UI element and view logic. |
| `src/components/ui/modern-loader.tsx` | `modern-loader` | Domain UI element and view logic. |
| `src/components/ui/motion-footer-demo.tsx` | `motion-footer-demo` | Domain UI element and view logic. |
| `src/components/ui/motion-footer.tsx` | `motion-footer` | Domain UI element and view logic. |
| `src/components/ui/otp-input.tsx` | `otp-input` | Domain UI element and view logic. |
| `src/components/ui/sign-in-page.tsx` | `sign-in-page` | Domain UI element and view logic. |
| `src/components/ui/skeleton.tsx` | `skeleton` | Domain UI element and view logic. |
| `src/components/ui/spinner.tsx` | `spinner` | Domain UI element and view logic. |
| `src/components/ui/table.tsx` | `table` | Domain UI element and view logic. |
| `src/components/ui/v-table-3.tsx` | `v-table-3` | Domain UI element and view logic. |

---

## 4. API Client & Execution Polling Layer

Client-side networking is consolidated in `frontend-v2/src/config/api.ts`:

1. **Axios Client Configuration:**
   - Global base URL: `NEXT_PUBLIC_API_URL` (Default: `http://localhost:5001/api`).
   - Credentials: `withCredentials: true` ensures secure HTTP-only cookies are exchanged.
2. **Interceptors:**
   - **Request:** Automatically injects `Authorization: Bearer <token>` from local storage.
   - **Response:** Automatically catches 401s, executes token refresh against `/api/auth/refresh`, and retries the original request.
3. **Bounded ID Normalization (`normalizeIds`):**
   - Traverses responses up to depth 3 to alias `_id` to `id` for domain entity lists (`problems`, `questions`, `submissions`, `results`) without recursive performance degradation.
4. **Adaptive Execution Poller (`src/lib/await-execution.ts`):**
   - Polls code run status with gentle exponential backoff (800ms up to 2500ms) to protect backend services from polling storms during burst submissions.

---

## 5. Custom React Hooks Directory (13 Hooks)

| Hook File | Exported Hook | Purpose |
| :--- | :--- | :--- |
| `src/hooks/anti-cheat/useAntiCheatMaster.ts` | `useAntiCheatMaster` | Custom lifecycle, proctoring, or state abstraction hook. |
| `src/hooks/anti-cheat/useCopyPasteProtect.ts` | `useCopyPasteProtect` | Custom lifecycle, proctoring, or state abstraction hook. |
| `src/hooks/anti-cheat/useDevToolsDetect.ts` | `useDevToolsDetect` | Custom lifecycle, proctoring, or state abstraction hook. |
| `src/hooks/anti-cheat/useFullscreen.ts` | `useFullscreen` | Custom lifecycle, proctoring, or state abstraction hook. |
| `src/hooks/anti-cheat/useKeyboardBlocker.ts` | `useKeyboardBlocker` | Custom lifecycle, proctoring, or state abstraction hook. |
| `src/hooks/anti-cheat/useTabVisibility.ts` | `useTabVisibility` | Custom lifecycle, proctoring, or state abstraction hook. |
| `src/hooks/use-delete-confirmation.tsx` | `use-delete-confirmation` | Custom lifecycle, proctoring, or state abstraction hook. |
| `src/hooks/useActivityTimer.ts` | `useActivityTimer` | Custom lifecycle, proctoring, or state abstraction hook. |
| `src/hooks/useAssessmentMedia.ts` | `useAssessmentMedia` | Custom lifecycle, proctoring, or state abstraction hook. |
| `src/hooks/useExecutionRuntimes.ts` | `useExecutionRuntimes` | Custom lifecycle, proctoring, or state abstraction hook. |
| `src/hooks/usePracticeTestCases.ts` | `usePracticeTestCases` | Custom lifecycle, proctoring, or state abstraction hook. |
| `src/hooks/useProblemProgress.ts` | `useProblemProgress` | Custom lifecycle, proctoring, or state abstraction hook. |
| `src/hooks/usePublicContests.ts` | `usePublicContests` | Custom lifecycle, proctoring, or state abstraction hook. |

---

## 6. State Management & Context Providers

- **Zustand Store (`src/store/`):**
  - Lightweight, reactive client state for editor theme, submission drafts, and temporary code buffers.
- **React Context Providers (`src/context/`):**
  - `AuthContext`: Provides user authentication state, role verification, and login/logout handlers.
  - `ThemeContext`: Toggles dark/light theme and persists user preference.

---

## 7. Monaco Editor & Proctoring Media Architecture

### Monaco Code Editor Integration
- **Component:** `src/components/problems/ProblemWorkspace.tsx` and `src/app/problems/[id]/page.tsx`.
- **Decoupled Keystrokes:** Monaco's `onChange` event updates an immediate `codeRef` without triggering full component re-renders. A 350ms debounced timer flushes the buffer to React state and `localStorage`.
- **Unload Flush:** A `beforeunload` window listener forces an immediate synchronous write to local storage, preventing code loss on tab closure.

### Assessment Proctoring & Media Engine
- **Hook:** `src/hooks/useAssessmentMedia.ts`.
- **MediaPipe Vision Tasks:** Local WebAssembly files in `public/mediapipe/wasm` perform real-time client-side face landmark and head yaw analysis without streaming video data to the server.
- **Leaf Audio Meter:** `MicrophoneLevelIndicator.tsx` updates audio decibel levels via direct DOM refs without triggering virtual DOM re-renders.