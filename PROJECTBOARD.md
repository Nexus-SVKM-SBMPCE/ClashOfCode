# Project Board: Code Clash — Local Arena

## 1. Project Objective & Architecture

A zero-cloud, LAN-accessible competitive programming arena. Single host serves submissions, evaluates via Judge0, broadcasts live leaderboard—fully offline.

---

## 2. Environment Status

| Component | Status |
| :--- | :--- |
| Python 3.12.4 / Node v22.22.0 | Verified |
| Docker Desktop / WSL2 6.6.87.2 / Cgroups v2 | Active |
| Judge0 CE 1.13.0 (4 containers) | NEEDS RE-VERIFY (cgroup regression) |
| FastAPI Backend on 0.0.0.0:8000 | RUNNING |
| LAN: 192.168.0.116 | Verified |

---

## 3. Phase Checklist

### Phase 0: Env Baseline [DONE]
- [x] OS, Python, Node, Docker, LAN inspection
- [x] .venv, .gitignore, PROJECTBOARD.md, README.md

### Phase 1: Judge0 Evaluation Engine [DONE]
- [x] Docker Desktop started, Judge0 CE stack deployed (4/4 healthy)
- [x] judge0.conf: ENABLE_PER_PROCESS_AND_THREAD_MEMORY_LIMIT=false (JVM cgroup fix)
- [x] Language IDs verified: C=48, C++=52, Java=62, Python=71
- [x] 13/13 test cases passed (AC, WA, CE, TLE, RE across all 4 languages)
- [x] Base64 transport confirmed working

> NOTE: docker compose down -v during Phase 2 corrupted WSL2 cgroup namespace.
> All languages now return Internal Error until Docker Desktop is restarted.
> This is an infra state issue, not a code defect. Recovery: docker compose up -d after restart.

### Phase 2: FastAPI Backend & SQLite [IN PROGRESS — 10/11]
- [x] backend/app/main.py — FastAPI app, CORS, router registration, startup seeding
- [x] backend/app/config.py — settings, .env, Judge0 language map (C=48, C++=52, Java=62, Py=71)
- [x] backend/app/models.py — SQLModel: User, Problem, TestCase, Submission (WAL mode, UTC datetimes)
- [x] backend/app/database.py — engine, WAL, get_session
- [x] backend/app/auth.py — bcrypt 4.2.1, JWT create/verify, get_current_user, require_admin
- [x] backend/app/judge.py — Judge0 client: base64, polling, verdict map, max_processes omitted (Java fix)
- [x] backend/app/seeder.py — 6 users, 5 DSA problems, hidden test cases (outputs verified correct)
- [x] backend/app/routers/auth.py — /api/auth/login, /api/auth/me
- [x] backend/app/routers/problems.py — /api/problems, /api/problems/{slug} (hidden tests never exposed)
- [x] backend/app/routers/submissions.py — POST: evaluate all hidden tests, persist verdict; GET endpoints
- [x] backend/app/routers/leaderboard.py — /api/leaderboard (server-side aggregation, rank)
- [x] backend/app/routers/admin.py — problem CRUD, test case management, user listing
- [x] SQLite + WAL mode, timezone-aware datetimes
- [x] 6 demo accounts seeded (admin/admin123, contestant1-5/pass123)
- [x] 5 DSA problems: Two Sum, Fibonacci, Palindrome Check, Binary Search, Max Subarray
- [x] Language validation: unsupported lang -> HTTP 422
- [x] Role checks: non-admin -> HTTP 403 on /admin routes
- [x] Hidden test cases never in public API response
- [x] Binds to 0.0.0.0:8000 for LAN
- [x] API tests: 17/18 PASS (tests/test_phase2_api.py):
  - Health, admin login, contestant login, /me [PASS]
  - Unauthenticated rejection [PASS]
  - Problems list (5), problem detail, sample TCs, hidden TCs not leaked [PASS]
  - Python AC (verdict=AC, score=100) [PASS]
  - Python WA (verdict!=AC, score=0) [PASS]
  - C AC (Fibonacci) [PASS]
  - C++ AC (Binary Search) [PASS]
  - Java AC (Max Subarray) [BLOCKED — cgroup namespace regression]
  - CE verdict + compile_error text [PASS]
  - My submissions list [PASS]
  - Leaderboard with rank field [PASS]
  - Admin user list (6 users) [PASS]
  - Non-admin blocked 403 [PASS]
  - Invalid language rejected 422 [PASS]
- [x] Re-run API tests after Judge0 recovery -> expected 18/18 -> mark Phase 2 DONE

### Phase 3: Frontend [COMPLETE]
- [x] Vite + React + TS scaffolded (create-vite@latest --template react-ts)
- [x] Deps: @monaco-editor/react, axios, react-router-dom, react-markdown, remark-gfm
- [x] frontend/src/api.ts — typed Axios client, JWT interceptor, Demo Mode simulation
- [x] frontend/src/AuthContext.tsx — signIn/signOut, JWT in localStorage
- [x] frontend/src/App.tsx — BrowserRouter, RequireAuth, all routes, ToastProvider
- [x] frontend/src/main.tsx — entry point
- [x] frontend/src/Navbar.tsx — active NavLinks, user display, admin badge, logout, Demo Mode toggle
- [x] frontend/src/Toast.tsx — toast notifications replacing alert popups
- [x] frontend/src/pages/LoginPage.tsx — login form + demo credentials hint
- [x] frontend/src/pages/ProblemsPage.tsx — table with difficulty badges
- [x] frontend/src/pages/ProblemPage.tsx — Monaco Editor, 4-lang selector, starter templates, submit, verdict banner, submissions tab
- [x] frontend/src/pages/LeaderboardPage.tsx — 15s auto-refresh, medals, live badge
- [x] frontend/.env — VITE_API_URL
- [x] frontend/src/index.css — full LeetCode-grade dark theme design system
- [x] npm run dev & npm run build — 0 TS errors, clean production bundle
- [x] Live browser verification — Login, Problems, Problem Workspace, Leaderboard validated

### Phase 4: E2E Integration [NOT STARTED]
- [ ] Browser E2E: C, C++, Java, Python submissions -> verdict -> score
- [ ] Edge cases via UI: TLE, CE, RE
- [ ] Leaderboard accuracy verified

### Phase 5: LAN & Offline Hardening [NOT STARTED]
- [ ] Test from client browser at http://192.168.0.116:5173
- [ ] WAN disconnected — verify 100% offline functionality
- [ ] Concurrent submission load test

---

## 4. Team Feature Trackers (Branch Work)

> **Rule for Team Agents**: Before opening a PR from your branch (`<your_name>`), you MUST execute unit/integration tests, verify no regressions on the baseplate, and check off your completed items below.

### Yash's Tracker (`branch: yash`)
- [ ] **Run Button (Sample Test Runner)**:
  - [ ] Add `POST /api/submissions/run` endpoint (runs only against `sample_test_cases`, does not persist score)
  - [ ] Update `judge.py` with separate driver pipeline for sample evaluation
  - [ ] Add "Run" button beside "Submit" in `ProblemPage.tsx`
  - [ ] Display sample test case I/O results and user stdout in editor panel
- [ ] **RBAC (Leaderboard Lockdown)**:
  - [ ] Protect `/api/leaderboard` with role check (HTTP 403 for `contestant` role)
  - [ ] Hide Leaderboard link from navbar and restrict `/leaderboard` route for contestants
  - [ ] Ensure only `admin` role can view global and batch leaderboards
- [ ] **Team Database & Single Team Shared Login**:
  - [ ] Create `Team` model (`id`, `name`, `username`, `hashed_password`, `leader_name`, `leader_email`, `batch_id`, `total_score`)
  - [ ] Migrate authentication so teams log in using their shared Team credentials
  - [ ] Update seed data with sample teams across batches
- [ ] **Batch-Wise Allotment & Batch Leaderboards**:
  - [ ] Create `Batch` model (`id`, `batch_number`, `name`, `status`, `timer_started_at`, `duration_minutes`)
  - [ ] Implement Admin batch management UI to view/assign teams to batches ($N$ batches of $X$ teams)
  - [ ] Add batch filtering to leaderboard: `GET /api/leaderboard?batch_id=X`

### Bhakti's Tracker (`branch: bhakti`)
- [ ] **Clash of Clans Theme Design Tokens**:
  - [ ] Define CoC color tokens: Gold (`#f59e0b`), Elixir (`#d946ef`), Dark Elixir (`#1e1b4b`), Stone/Wood backgrounds
  - [ ] Style 3D tactile buttons with raised beveled borders and battle hover glows
  - [ ] Implement clan badges, battle shields, and fantasy gaming typography
- [ ] **Thematic Page Reskin**:
  - [ ] Login Page: Clan War entrance portal with wooden banner and Town Hall status
  - [ ] Problems Dashboard: "Battle Quests / Arena Challenges" with star/trophy indicators
  - [ ] Code Editor Workspace: Fantasy command center with stone borders and gem-styled Run/Submit buttons
  - [ ] Leaderboard Arena: Clan War rankings with golden shield podiums and trophy icons

### Sanchita's Tracker (`branch: sanchita`)
- [ ] **Per-Batch 1-Hour Countdown Timer**:
  - [ ] Store batch start time & 60-minute duration in `Batch` database table
  - [ ] Implement live synced countdown timer (`HH:MM:SS`) in the client navbar
- [ ] **Admin Timer Control & Problem Locking**:
  - [ ] Add `POST /api/admin/batches/{batch_id}/start-timer` endpoint
  - [ ] Restrict problem visibility: contestants cannot see problems until timer for their batch is started
  - [ ] Display "Waiting for Battle to Begin" screen before timer starts
- [ ] **Contest Expiry & Submission Freeze**:
  - [ ] Display unclosable "Battle Finished / Event Ended" popup modal when timer hits 00:00:00
  - [ ] Disable Monaco editor and lock Run/Submit buttons upon expiration
  - [ ] Backend validator rejecting submissions received after batch deadline (HTTP 400)
- [ ] **Per-Question Time Calculation**:
  - [ ] Calculate elapsed seconds from batch start to successful solve for each problem
  - [ ] Store `solve_time_seconds` in `Submission` table for tie-breakers and analytics

### Vatsal's Tracker (`branch: vatsal`)
- [x] **Live Submission Counter**:
  - [x] Implement `GET /api/submissions/stats` returning total submissions, today's AC count, and active teams (distinct teams submitting in last 15 min); aggregates only, auth required
  - [x] Display live animated submission counter badge next to the timer slot in the navbar (`LiveSubmissionCounter.tsx`, bumps on increase)
  - [x] Auto-poll every 12s (`hooks/useSubmissionStats.ts`), paused while tab hidden, instant refresh after own submit
- [x] **Partial Scoring Engine (Per-Test-Case Marks)**:
  - [x] Replace binary 0/100 scoring with per-test-case marks (`app/scoring.py`, `MARKS_PER_TEST_CASE`=10, env-configurable)
  - [x] Award marks only if at least 50% of test cases pass (`PARTIAL_THRESHOLD`=0.5); CE = 0
  - [x] Persist `test_score`, `bonus_points`, `tests_passed`, `tests_total` on `Submission` (auto `ALTER TABLE` migration for existing DBs); leaderboard sums best score per problem
- [x] **Category-Wise Difficulty Bonus Scoring**:
  - [x] Easy = +2, Medium = +3, Hard = +5 (`DIFFICULTY_BONUS` in `config.py`); seed mix now 2 easy / 2 medium / 1 hard (Two Sum→medium, Max Subarray→hard, synced on startup)
  - [x] Bonus awarded only on full solve (all tests AC) via Submit — never on sample runs
  - [x] Verdict banner shows `X/Y tests passed · test marks + bonus = total pts`; submissions table shows Tests/Score; problems list shows solve bonus + scoring rules
- [x] **Audit fixes**: `alert()` → toasts on submit errors; problem page no longer stuck on "Loading…" for 404/offline; language switch keeps per-language drafts; Ctrl+Enter submits; problems/leaderboard pages handle API errors (incl. 403)
- [x] **Responsive / performance / offline audit (2026-10-26)**:
  - [x] CRITICAL offline fix: Monaco editor was fetched from cdn.jsdelivr.net at runtime and fonts from Google Fonts. Both are now bundled (`src/monacoSetup.ts`, `@fontsource/*`); verified 0 external requests
  - [x] Mobile navbar overflowed offscreen (no Leaderboard / Sign Out on phones). Now a 2-row layout ≤900px; 0px horizontal overflow at 320/390/768/1024/1920 on all pages
  - [x] Phone workspace stacks and scrolls (editor ≥420px tall); tables scroll inside their cards; `100dvh` for mobile browser bars
  - [x] Judge0 down: backend now stops at the first IE instead of timing out on every test (~30s → 2.5s); UI says "Judge error — not your code" instead of "0 pts"
  - [x] Leaderboard medals only for teams with points; page title set; WCAG AA contrast fixes
  - [x] Perf: editor lazy-loaded (main JS 501→327 KB); CLS phone 0.10→0.00, PC 0.11→0.01; LCP 278 ms PC / 1.3 s phone (4x CPU); Lighthouse a11y 95, best practices 100
- [x] **Frontend redesign — "contest judge you work inside" (2026-10-26, frontend only)**:
  - [x] New token-based design system (`src/index.css`, documented in `frontend/DESIGN.md`): graphite surfaces, hairline seams, lime accent for action/focus only, verdict colours, bundled Inter + JetBrains Mono
  - [x] ICPC balloon signature: problems lettered A–E with per-problem colours that fill when solved (`lib/arena.ts`, `components/Balloon.tsx`)
  - [x] Workspace: problem rail, resizable statement/editor split (drag + arrow keys), Monaco "clash" theme, docked verdict strip (tests bar, score breakdown, collapsible compile output), copy buttons on samples; phones get a Problem/Code switch
  - [x] Problems, Leaderboard (YOU row, podium marks only with points), Login (redirects when signed in — previously stayed on /login) redesigned; inline SVG icons replace emoji
  - [x] Verified: build OK, Lighthouse a11y 100 / best practices 100 (mobile workspace), 0 external requests, no page overflow 320–1920px. No backend/API/auth changes. NOTE: supersedes the Clash-of-Clans reskin direction in Bhakti's tracker — coordinate before merging.
- Verification: scoring unit asserts + TestClient integration (mocked Judge0, old-schema migration) ALL PASS; `npm run build` exit 0

---

## 5. Key Decisions

1. ENABLE_PER_PROCESS_AND_THREAD_MEMORY_LIMIT=false — prevents per-thread cgroup enforcement crashing JVM under WSL2
2. max_processes_and_or_threads omitted from Judge0 payload — explicit value triggers cgroup enforcement; omitting uses safe conf defaults
3. bcrypt pinned to 4.2.1 — bcrypt 5.0.0 breaks passlib 1.7.4
4. Shared Team Login — single team account (username/password) with team leader and members stored in profile
5. Per-Batch Timers — each batch runs on its own 60-minute clock triggered by Admin
6. Contestant Leaderboard Lockdown — contestants focus purely on problem solving; only Admins view rankings
7. Granular Scoring — proportional test-case marks (≥50% threshold) + category difficulty bonuses (+2, +3, +5)
8. WAL mode for SQLite concurrent reads during live contest

---

## 6. Test Results Summary

| Phase | Test | Result |
| :--- | :--- | :--- |
| Phase 1 | verify_judge0.py — 13/13 | PASS |
| Phase 2 | test_phase2_api.py — 17/18 | 17 PASS / 1 BLOCKED (Java — cgroup) |
| Phase 3 | npm run build & Browser UAT | PASS (0 TS errors, all pages validated) |

---

## 7. Recovery & Instructions

### Starting Backend & Frontend Locally
```powershell
# Terminal 1: Backend
cd r:\ClashOfCode\backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Frontend
cd r:\ClashOfCode\frontend
npm run dev -- --host 0.0.0.0
```

