# AGENTS.md — Team Agent Guidelines & Execution Protocol

This document serves as the mandatory protocol and operational specification for any AI agent or developer contributing to **Code Clash — Local Arena**.

---

## 1. Core Workflow & Git Protocol

Every team member and their AI agent must strictly adhere to this sequence:

```text
1. Pull latest 'main' branch
2. Create dedicated branch: <your_name> (e.g., git checkout -b yash)
3. Implement assigned features:
   3.1. Modular architecture, clean code, deterministic patterns, full documentation.
   3.2. Unit Testing: Write local verification scripts (do NOT commit temporary scratch scripts).
   3.3. Integration Testing: Manually verify that changes seamlessly integrate with the FastAPI backend and React baseplate.
   3.4. User Acceptance Testing (UAT): Manually verify UX from the user's perspective (no glitches, UI freezes, or missing states).
4. Push to remote branch: git push -u origin <your_name>
5. Open Pull Request (PR) with verification evidence and test logs.
6. MANDATORY: Update PROJECTBOARD.md marking finished tasks as [x] with notes.
```

---

## 2. Universal Engineering Standards

1. **Deterministic Architecture & Clean Code**:
   - Backend: Use FastAPI dependency injection (`Depends`), Pydantic/SQLModel models, and transaction-safe database sessions with WAL mode.
   - Frontend: Strict TypeScript, modular React components, custom hooks for shared state, zero uncontrolled re-renders or useEffect loops.
   - Preserving Existing Endpoints: Do NOT break or delete existing API signatures without backward compatibility.
2. **Offline-First & Zero-Cloud**:
   - The entire platform must operate on a closed local area network (LAN) with zero internet access at runtime. Never import external CDNs or cloud-dependent packages.
3. **Database Migrations & Integrity**:
   - The SQLite database is at `backend/codeclash.db` with WAL mode enabled.
   - Any new tables must have appropriate indexes, foreign keys, and default timestamps in UTC.
4. **Mandatory Project Board Tracking**:
   - You are **strictly required** to update `PROJECTBOARD.md` after completing and testing each assigned subtask. Never open a PR with an out-of-date `PROJECTBOARD.md`.

---

## 3. Team Member Feature Assignments & Technical Specifications

---

### Yash: Run Driver, RBAC, Team Architecture & Batch Management
- **Branch**: `yash`
- **Assigned Modules**:
  1. **Run Button (Sample Test Driver)**:
     - Add a "Run" action button beside "Submit" in the code editor toolbar (`ProblemPage.tsx`).
     - Backend endpoint: `POST /api/submissions/run`.
     - Executes submitted code **only** against public/sample test cases (`sample_test_cases`).
     - Returns input, expected output, user stdout, execution time, and diff **without** persisting an official score or submission record to the leaderboard.
     - Drivers: Distinct execution pipeline for sample runner vs official submit runner (`app/judge.py`).
  2. **Authentication & RBAC (Restricted Leaderboard)**:
     - Contestants must be **completely barred** from viewing the full leaderboard.
     - Backend: Ensure `/api/leaderboard` returns HTTP `403 Forbidden` for users with role `contestant`.
     - Frontend: Hide the Leaderboard tab and route from contestants; redirect unprivileged attempts to `/problems`.
     - Only users with role `admin` can access `/leaderboard` and `/admin` routes.
  3. **Team Database & Single Team Shared Login**:
     - Database model `Team`:
       - `id`, `name`, `username`, `hashed_password`, `leader_name`, `leader_email`, `members_info` (JSON or string), `batch_id`, `total_score`, `created_at`.
     - One shared login credential per team (Team Username + Password).
     - Teams authenticate via existing `/api/auth/login`, receiving a JWT representing their team.
  4. **Batch-Wise Allotment & Batch Leaderboards**:
     - Database model `Batch`:
       - `id`, `batch_number`, `name`, `status` (`NOT_STARTED`, `ACTIVE`, `COMPLETED`), `timer_started_at`, `duration_minutes` (default 60).
     - Admin dashboard section: Batch management, team assignment to batches ($N$ batches of $X$ teams).
     - Batch-specific leaderboards: Admin can toggle between overall leaderboard and batch-filtered leaderboards (`/api/leaderboard?batch_id=X`).

---

### Bhakti: Clash of Clans (CoC) UI/UX Overhaul
- **Branch**: `bhakti`
- **Assigned Modules**:
  1. **Clash of Clans Theme Design System**:
     - Modernize `index.css` and component styling to adopt authentic Clash of Clans aesthetics:
       - **Color Palette**: Rich Gold (`#f59e0b` / `#d97706`), Elixir Pink/Purple (`#d946ef` / `#c026d3`), Dark Elixir Charcoal (`#1e1b4b` / `#0f172a`), Town Hall Wood & Stone textures.
       - **Buttons & Cards**: Raised 3D tactile buttons with beveled stone/wood borders, gold hover glows, and battle shield/sword accents.
       - **Badges & Modals**: Clan badge style rank emblems, war trophy icons, and scroll/banner header containers.
       - **Typography**: Bold, stylized headings with drop-shadows matching the fantasy gaming arena vibe.
  2. **Page Immersion**:
     - Login Page: Clan War entrance portal with glowing Town Hall level badge and wooden clan banner.
     - Problems Page: "Battle Quests / Arena Challenges" theme with star ratings or trophy rewards.
     - Code Editor Workspace: Fantasy command center with stone-bordered split panes and glowing run/submit gems.
     - Leaderboard: Clan War rankings with golden shield podiums, trophy icons, and clan leader badges.

---

### Sanchita: Per-Batch Timer Engine, Admin Controls & Time Analytics
- **Branch**: `sanchita`
- **Assigned Modules**:
  1. **Per-Batch Live Countdown Timer (1 Hour)**:
     - Global/batch timer tracking: 60-minute duration per batch.
     - Client navbar shows a sticky, pulsing live countdown timer (`HH:MM:SS`) synced with server time.
  2. **Admin Timer Start Control & Problem Locking**:
     - Endpoint: `POST /api/admin/batches/{batch_id}/start-timer`.
     - Problems are locked (hidden or disabled with a "Contest Has Not Started" waiting screen) until the Admin triggers the timer for that batch.
     - If timer is not active for a contestant's batch, `/api/problems` returns locked status.
  3. **Contest Expiry Window (Event Ended Modal)**:
     - When the timer reaches `00:00:00`, the frontend displays an unclosable "Battle Finished / Event Ended" modal.
     - Code editor is disabled and submit button is locked.
     - Backend rejects any submissions received after `timer_started_at + duration_minutes` with HTTP `400 Contest Ended`.
  4. **Per-Question Time Calculation**:
     - Track elapsed seconds from batch start to successful solve for each problem.
     - Store `solve_time_seconds` in the submission/score database.
     - Add solve time to admin leaderboard metrics for tie-breaking.

---

### Vatsal: Live Submission Counter & Granular Scoring Engine
- **Branch**: `vatsal`
- **Assigned Modules**:
  1. **Live Submission Counter**:
     - Display a dynamic, energetic submission counter beside the countdown timer in the navbar (e.g., `⚡ 42 Submissions Live`).
     - Endpoint: `/api/submissions/stats` returning total submissions, today's AC count, and active teams.
     - Auto-polls or refreshes every 10–15 seconds to maintain high arena energy.
  2. **Partial Test-Case Scoring (Granular Marks)**:
     - Replace strict all-or-nothing (0 or 100) scoring.
     - Award points proportionally for every test case passed (e.g., if a problem has 10 test cases and 6 pass, award 60% of base points).
     - If at least 50% test cases pass, the team receives partial marks persisted to their score upon submission.
  3. **Category-Wise Difficulty Bonus Scoring (Easy=2, Med=3, Hard=5)**:
     - The contest has 2 Easy, 2 Medium, and 1 Hard problem.
     - In addition to test-case marks, award dedicated difficulty bonus points upon submission solve:
       - **Easy Problem**: +2 Bonus Points
       - **Medium Problem**: +3 Bonus Points
       - **Hard Problem**: +5 Bonus Points
     - Clearly display points breakdown in the verdict banner (`X test cases passed + Y difficulty bonus = Z total points`).

---

## 4. Testing & Verification Checklist for AI Agents

Before any agent marks a task complete in `PROJECTBOARD.md` or issues a PR:

1. **FastAPI Backend Validation**:
   - Run existing API test suite: `python tests/test_phase2_api.py` and ensure zero regressions.
   - Write automated test assertions for newly added endpoints.
2. **Frontend Build & Types**:
   - Run `npm run build` in `frontend/` (Must exit with code 0, zero TS errors).
3. **Integration & Manual UAT**:
   - Run backend and frontend simultaneously.
   - Perform end-to-end user journeys (Admin perspective vs Contestant perspective).
4. **Project Board Update**:
   - Check off each corresponding task in `PROJECTBOARD.md`.
