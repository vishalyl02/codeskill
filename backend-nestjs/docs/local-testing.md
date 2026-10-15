# Local test environment

Frontend: http://localhost:3000 · API: http://localhost:5001/api · API docs: http://localhost:5001/api/docs.

| Account | Login | Password |
| --- | --- | --- |
| Student | `student.test@codeskill.local` at `/login` | `Student@123` |
| Super admin | `admin.test@codeskill.local` at `/admin/login` | `Admin@123` |
| Assessment candidate | UID `TEST001` at `/student-login` | `Student@123` |
| University admin | `university.test@codeskill.local` at `/login` | `University@123` |
| Company recruiter | `company.test@codeskill.local` at `/login` | `Company@123` |

These are local demo credentials. The seed script rejects production mode and nonlocal database/Redis URLs. It preserves existing records, updates only fixture identities, hashes passwords, and resets demo sessions on a repeat run.

Run `npm run seed:local` in `backend-nestjs` to populate accounts, four practice problems (or preserve existing versions), MCQs and coding questions, three assessments, a completed candidate report fixture, a contest, university/batch/enrollments, company/recruiter/job/application, and a discussion with a reply. Existing additional practice content remains available. Run `PROCESS_ROLE=seed npm run seed:os-test1` to add the 20-question OS assessment. Question banks and test cases are included.

Assessment codes: `DEMO-MCQ-01`, `DEMO-CODE-01`, `DEMO-MIXED-01`, `MCQ-OS-TEST-01`. Batch invite code: `CS-DEMO-2027`. Contest slug: `local-practice-contest`. Primary student starts with fresh assessment attempts; the candidate has a labeled completed demo quiz so admin reports can be tested.

The local app is managed through the ignored `.local-dev/launch-agents` plists. Backend runs the compiled build to avoid the watch compiler deleting files used by the judge worker. After backend source edits, build and restart both backend and judge processes. Frontend runs Next.js development mode.

Judge0/Piston architecture, Docker commands, deployment environment variables, and external-drive requirements are in [judge-failover.md](judge-failover.md).
