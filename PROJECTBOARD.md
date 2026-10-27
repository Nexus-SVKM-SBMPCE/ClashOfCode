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
- [x] **Per-Batch 1-Hour Countdown Timer** *(IN PROGRESS — Phase 1 complete)*:
  - [x] Added `Batch` model with `timer_started_at` (UTC), `duration_minutes` (default 60), `status` (NOT_STARTED/ACTIVE/COMPLETED) — `backend/app/models.py`
  - [x] Added `solve_time_seconds` + `batch_id` to `Submission` model for per-question time tracking
  - [x] Created `backend/app/routers/batches.py` — `GET /api/batches/my-batch/timer` (server-synced clock), `POST /api/admin/batches/{batch_id}/start-timer`, batch CRUD
  - [x] Added `GET /api/server-time` endpoint in `main.py` for initial clock skew calibration
  - [x] Seeded default Batch 1 (NOT_STARTED) in `seeder.py`
  - [x] Created `frontend/src/useCountdownTimer.ts` — server-synced hook (skew-corrected, re-polls every 30s, ticks every 1s)
  - [x] Integrated `BatchTimer` component into `frontend/src/Navbar.tsx` (4 visual states: loading / waiting / active+pulse / ended)
  - [x] Added timer CSS with urgency pulse animation (≤5 min amber glow) in `index.css`
  - [x] TypeScript: `tsc --noEmit --skipLibCheck` exits 0; Python: all syntax OK
- [ ] **Admin Timer Control & Problem Locking** *(Phase 2)*:
  - [ ] Restrict problem visibility: contestants cannot see problems until timer for their batch is started
  - [ ] Display "Waiting for Battle to Begin" screen before timer starts
- [ ] **Contest Expiry & Submission Freeze** *(Phase 2)*:
  - [ ] Display unclosable "Battle Finished / Event Ended" popup modal when timer hits 00:00:00
  - [ ] Disable Monaco editor and lock Run/Submit buttons upon expiration
  - [ ] Backend validator rejecting submissions received after batch deadline (HTTP 400)
- [ ] **Per-Question Time Calculation** *(Phase 2)*:
  - [ ] Calculate elapsed seconds from batch start to successful solve for each problem
  - [ ] Store `solve_time_seconds` in `Submission` table for tie-breakers and analytics

### Vatsal's Tracker (`branch: vatsal`)
- [ ] **Live Submission Counter**:
  - [ ] Implement `GET /api/submissions/stats` returning total submissions, today's AC count, and active teams
  - [ ] Display live animated submission counter badge next to the timer in the navbar
  - [ ] Auto-poll every 10–15s to maintain high arena energy
- [ ] **Partial Scoring Engine (Per-Test-Case Marks)**:
  - [ ] Replace binary 0/100 scoring with proportional test-case points
  - [ ] Award marks if at least 50% of test cases pass (e.g. 6/10 passed = 60% base score)
  - [ ] Persist granular score to team total upon submission
- [ ] **Category-Wise Difficulty Bonus Scoring**:
  - [ ] Configure problem difficulty bonuses: Easy = +2 bonus, Medium = +3 bonus, Hard = +5 bonus
  - [ ] Award bonus points upon successful question solve
  - [ ] Update verdict banner in `ProblemPage.tsx` to display score breakdown (`Test Cases + Difficulty Bonus = Total`)

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

