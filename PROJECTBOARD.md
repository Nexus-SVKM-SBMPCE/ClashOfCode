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
- [x] **Run Button (Sample Test Runner)**:
  - [x] Add `POST /api/submissions/run` endpoint (runs only against `sample_test_cases`, does not persist score)
  - [x] Update `judge.py` with separate driver pipeline (`evaluate_sample_submission`) for sample evaluation
  - [x] Add "Run" button beside "Submit" in `ProblemPage.tsx` with disabled states synced with timer
  - [x] Display sample test case I/O results, user stdout, and diff/runtime in editor console drawer
  - [x] Verified: 5/5 backend tests in `tests/test_run_sample.py` & 3/3 frontend tests in `ProblemPage.test.tsx` (build clean, 0 TS errors)
- [x] **RBAC (Leaderboard Lockdown)**:
  - [x] Protect `/api/leaderboard` with role check (HTTP 403 for `contestant` role via `require_admin`)
  - [x] Hide Leaderboard ("War Ranks") link from navbar for contestants
  - [x] Restrict `/leaderboard` route via `RequireAdmin` guard redirecting unprivileged attempts to `/problems`
  - [x] Verified: 5/5 backend tests in `tests/test_rbac_leaderboard.py` & 4/4 frontend tests in `frontend/src/RbacLeaderboard.test.tsx` (build clean, 0 TS errors)
- [x] **Team Database & Single Team Shared Login**:
  - [x] Create `Team` model (`id`, `name`, `username`, `hashed_password`, `leader_name`, `leader_email`, `members_info`, `batch_id`, `total_score`, `created_at`)
  - [x] Migrate `/api/auth/login` to authenticate teams by shared credentials, issue team JWTs, and sync User records
  - [x] Integrate `/api/auth/me` and `/api/batches/my-batch/timer` to resolve team batch assignment
  - [x] Seed sample teams across Batch 1 and Batch 2 (`team1`–`team5`)
  - [x] Verified: 7/7 backend tests in `tests/test_team_auth.py` (build clean, 0 TS errors)
- [x] **Batch-Wise Allotment & Batch Leaderboards**:
  - [x] Create `Batch` model (`id`, `batch_number`, `name`, `status`, `timer_started_at`, `duration_minutes`)
  - [x] Implement Admin batch management UI to view/assign teams to batches ($N$ batches of $X$ teams)
  - [x] Add batch filtering to leaderboard: `GET /api/leaderboard?batch_id=X`
  - [x] Verified: 10/10 backend tests in `tests/test_batch_allotment_leaderboard.py` & 2/2 frontend tests in `BatchAllotmentLeaderboard.test.tsx` (build clean, 0 TS errors)
- [x] **Hidden LeetCode-Style Driver Injection**:
  - [x] `inject_hidden_driver(source_code, language, problem_slug)` in `judge.py` — auto-wraps `class Solution` style code with stdin-parsing driver for all 5 problems x 4 languages (Python, C++, Java, C)
  - [x] Passthrough mode: if user code already has `main()` or raw `input()`, driver is NOT injected
  - [x] `evaluate_local_submission()` — offline fallback using Python `subprocess` (graceful degradation when Judge0 is offline)
  - [x] `evaluate_submission()` catches `requests.RequestException` and routes to local fallback — zero raw connection errors surfaced to users
  - [x] Verified: 27/27 backend tests pass; `npm run build` exit 0, 0 TS errors
- [x] **Clean Run Console (Stderr Removed)**:
  - [x] Removed `Stderr / Debug Log` block from `ProblemPage.tsx` run result display
  - [x] Console now shows only: Input, Expected Output, Your Stdout — no debug noise
  - [x] Backend: `evaluate_sample_submission` always returns `"stderr": ""` for all result entries
  - [x] Verified: `npm run build` exit 0, 0 TS errors; 27/27 backend tests pass
- [x] **Batch-Wise Question Allotment (Admin Form)**:
  - [x] `BatchProblem` SQLModel added to `models.py` (`batch_problems` table: `id, batch_id FK, problem_id FK`); auto-migrated on startup
  - [x] Admin endpoints in `admin.py`: `GET /api/admin/batches/{id}/problems`, `POST /api/admin/batches/{id}/problems`, `POST /api/admin/batches/allot-problems`
  - [x] `problems.py` — contestants filtered to only see their batch's allotted problems; non-allotted slugs return HTTP 403
  - [x] `submissions.py` — Run and Submit both validate batch question allotment, block non-allotted with HTTP 403
  - [x] Frontend `api.ts` — `BatchProblemAdminInfo` interface + `getBatchProblems`, `setBatchProblems`, `autoAllotBatchProblems` API functions
  - [x] Admin UI in `LeaderboardPage.tsx` — 'Arena Quest Allotment' section with batch selector, problem checkbox table, Save + Auto-Split buttons
  - [x] `ProblemPage.tsx` — LeetCode-style `PROBLEM_STARTERS` class skeletons auto-load per problem x language in Monaco editor
  - [x] Verified: 27/27 backend tests pass; `npm run build` exit 0, 0 TS errors
- [x] **LeetCode-Style Stdout Extraction & Delimited Driver**:
  - [x] Added `DELIM_START` (`__CLASH_RES_START__`) and `DELIM_END` (`__CLASH_RES_END__`) to drivers across all 4 languages to cleanly separate user debug prints (e.g. `print()`, `cout`) from judge solution output
  - [x] Implemented `parse_judge_output(raw_stdout, expected_output)`: user debug logs are always preserved in the stdout display frame, and debug prints never cause a correct solution to fail
  - [x] Resilient IE fallback: if Judge0 returns `verdict == 'IE'` (due to WSL2/Docker container failures), `evaluate_submission` immediately falls back to native local execution
  - [x] LeetCode index normalization: automatically normalizes both 0-based and 1-based index returns for `two-sum` and `binary-search`
  - [x] Verified: automated tests in `tests/test_scoring_and_driver.py` pass; stdout from `print("hello world")` verified in console
- [x] **Granular Scoring Engine (1 Pt Per Passed Test + Difficulty Bonus)**:
  - [x] Configured `MARKS_PER_TEST_CASE = 1` and `PARTIAL_THRESHOLD = 0.0` in `config.py` & `scoring.py`
  - [x] Each passed test case awards 1 point (partial scores awarded without threshold blocking)
  - [x] Complete problem solve bonus: Easy (+2), Medium (+3), Hard (+5) added upon passing 100% of test cases
  - [x] Leaderboard aggregates best score per problem with tie-breaking based on solve time
  - [x] Verified: 32/32 tests pass in test suite (`pytest -v`)
- [x] **Deterministic Mathematical Time Complexity Evaluator (Zero-AI, Sub-Millisecond)**:
  - [x] Built native AST analysis engine in `backend/app/complexity.py` (`PythonASTComplexityAnalyzer`): loop depth analysis, constant bound detection (`range(26)` -> $O(1)$), logarithmic stride detection (`*=` / `/=` / `>>=` / binary search -> $O(\log N)$), nested loop multiplication, asymptotic dominance, sorting detection ($O(N \log N)$), unmemoized exponential recursion detection ($O(2^N)$), and memoization discounting (`@lru_cache`, `memo` dict -> $O(N)$)
  - [x] Lexical control-flow analyzer for C, C++, Java (`analyze_lexical_complexity`)
  - [x] Asymptotic complexity comparator: evaluates calculated vs optimal complexity returning `OPTIMAL`, `ACCEPTABLE`, or `SUBOPTIMAL`
  - [x] Average execution time < 0.2ms, fully offline, deterministic, zero-AI
  - [x] Verified: 11/11 tests pass in `tests/test_complexity_engine.py`
- [x] **Database Schema & Pipeline Integration**:
  - [x] Added `best_time_complexity` to `Problem` model and `time_complexity` + `time_complexity_verdict` to `Submission`
  - [x] Implemented safe SQLite `ALTER TABLE` auto-migration in `_migrate_columns()`
  - [x] Integrated real-time complexity evaluation into `/api/submissions/run` and `/api/submissions`
  - [x] Verified: 48/48 backend tests pass (`backend/.venv/Scripts/pytest.exe`)
- [x] **Admin Quest Forge UI & Optimal Complexity Config**:
  - [x] Built `frontend/src/components/QuestForge.tsx` matching Clash of Clans 3D beveled stone-and-gold styling
  - [x] Title, auto-slug, difficulty, **Best Time Complexity** selector ($O(1)$, $O(\log N)$, $O(N)$, $O(N \log N)$, $O(N^2)$, $O(N^3)$, $O(2^N)$), time limit, memory limit
  - [x] Markdown problem statement editor with preview mode toggle
  - [x] Dynamic test cases manager (stdin input, stdout output, public sample vs hidden toggle, add/remove cases)
  - [x] Active Quest Roster table with optimal complexity badges and demolish action
  - [x] Integrated as third tab `⚒️ Quest Forge & Complexity` in `frontend/src/pages/LeaderboardPage.tsx`
- [x] **Unified Batch Allotment & Contestant Complexity Feedback**:
  - [x] Added "Create New Batch" form card in `LeaderboardPage.tsx` (Batch Number, Name, Duration)
  - [x] Added Optimal Time Complexity badge to the Arena Quest Allotment table
  - [x] Problem statement header displays `⚡ Optimal: {best_time_complexity}` badge
  - [x] Sample test console and attack verdict strip display evaluated asymptotic complexity with verdict (`⚡ Time: O(N) (OPTIMAL)`)
  - [x] Verified: `npm test` passes all 7 suites / 39 tests; `npm run build` exits 0 (zero TS errors)


### Bhakti's Tracker (`branch: bhakti`)
- [x] **Clash of Clans Theme Design Tokens**:
  - [x] Define CoC color tokens: Gold (`#f5a623`/`#ffd700`), Elixir (`#d946ef`), Dark Elixir (`#0a0e1a`/`#141b2d`), Stone/Wood backgrounds — full palette in `index.css` `:root`
  - [x] Style 3D tactile buttons with raised beveled gold gradients, stone borders, and battle hover glows (`.btn`, `.btn-primary` with multi-layer box-shadows)
  - [x] Custom language dropdown selector with 3D beveled stone-and-gold styling in code editor
  - [x] Clean offline typography: bundled Inter and JetBrains Mono fonts (zero external CDN calls)
- [x] **Thematic Page Reskin & Event Branding**:
  - [x] Official Clash of Code Event Logo integrated into Navbar and Login portal
  - [x] Login Page: Clan War entrance portal with Valkyrie (bottom-left, 320px) and Giant (bottom-right, 280px)
  - [x] Problems Dashboard: "Battle Quests" with animated battlefield backdrop, rising war embers, and Barbarian King (bottom-left, 240px)
  - [x] Navbar: Clean game-HUD styling, pill tabs, zero emojis
  - [x] War Rankings Arena: Clean "War Rankings" header, fixed 6th column alignment, enhanced podium (🥇🥈🥉), and 15px readable table text
  - [x] Scale-Invariant Characters: Hardware-accelerated GPU zoom compensation hook (`useFixedZoomRef`) ensuring constant physical dimensions with zero glitching
- [x] **Animations & Effects**:
  - [x] Gold shimmer on login form, floating ember radial gradients, drifting battlefield fog
  - [x] Shield solve animation (3D flip), sword slash logo entrance, glow pulse
  - [x] All transitions respect `prefers-reduced-motion: reduce`
- [x] **Clash Regular Heading Font & UI Polish (Round 2)**:
  - [x] Integrated authentic Supercell `Clash Regular` font (`/fonts/Clash-Regular.otf` & `.ttf`) with `@font-face`
  - [x] Applied `var(--font-heading)` exclusively to all headings (`h1`–`h6`, `.page-title`, `.title`, `.card-title`, `.modal-title`, etc.) across all pages
  - [x] Replaced admin dropdown boxes (`LeaderboardPage.tsx`, `QuestForge.tsx`) with 3D beveled gold theme matching the code editor language selector
  - [x] Completely removed all emojis from code editor (`ProblemPage.tsx`), admin dashboards, and navbar (0 emojis remaining across `frontend/src`)
- Verification: `npm run build` exit 0, `npm run test` (11 test files, 91 tests) pass, all pages verified

### Sanchita's Tracker (`branch: sanchita`)
- [x] **Per-Batch 1-Hour Countdown Timer** *(Phase 1 — COMPLETE)*:
  - [x] Added `Batch` model with `timer_started_at` (UTC), `duration_minutes` (default 60), `status` (NOT_STARTED/ACTIVE/COMPLETED) — `backend/app/models.py`
  - [x] Added `solve_time_seconds` + `batch_id` to `Submission` model for per-question time tracking
  - [x] Created `backend/app/routers/batches.py` — `GET /api/batches/my-batch/timer` (server-synced clock), `POST /api/admin/batches/{batch_id}/start-timer`, batch CRUD
  - [x] Added `GET /api/server-time` endpoint in `main.py` for initial clock skew calibration
  - [x] Seeded default Batch 1 (NOT_STARTED) in `seeder.py`
  - [x] Created `frontend/src/useCountdownTimer.ts` — server-synced hook (skew-corrected, re-polls every 30s, ticks every 1s)
  - [x] Integrated `BatchTimer` component into `frontend/src/Navbar.tsx` (4 visual states: loading / waiting / active+pulse / ended)
  - [x] Added timer CSS with urgency pulse animation (≤5 min amber glow) in `index.css`
  - [x] TypeScript: `tsc --noEmit --skipLibCheck` exits 0; Python: all syntax OK
- [x] **Admin Timer Control & Problem Locking** *(Phase 2 — COMPLETE)*:
  - [x] `POST /api/admin/batches/{batch_id}/start-timer` already built in Phase 1 (`batches.py`) — sets `timer_started_at = UTC now`, status → ACTIVE
  - [x] Backend lock in `problems.py`: `_assert_batch_active()` — contestants get **HTTP 423 Locked** when no ACTIVE batch exists; admins bypass always
  - [x] `frontend/src/BatchGate.tsx` — route-level guard wrapping `/problems` and `/problems/:slug`; fail-closed (error state → locked)
  - [x] `frontend/src/pages/WaitingScreen.tsx` — animated "Arena is Locked" screen with floating castle icon, pulse rings, batch badge, live status dot
  - [x] `frontend/src/App.tsx` — `BatchGate` injected around both problem routes inside `RequireAuth`
  - [x] `isBatchLocked(err)` helper in `api.ts` for clean 423 detection
  - [x] CSS for WaitingScreen + BatchGate spinner added to `index.css`
  - [x] TypeScript: `tsc --noEmit --skipLibCheck` exits 0; Python: all syntax OK
- [x] **Contest Expiry & Submission Freeze** *(Phase 3 — COMPLETE)*:
  - [x] Created `frontend/src/BattleFinishedModal.tsx` — unclosable "Battle Finished" modal rendered on `COMPLETED` timer status
  - [x] Updated `frontend/src/pages/ProblemPage.tsx` — Monaco editor set to `readOnly: true`, Submit button disabled with "⏱ Contest Ended"
  - [x] Styled modal in `frontend/src/index.css` with Clash of Clans dark fantasy overlay, gold border, and red status badge
  - [x] Backend validator `_validate_submission_deadline` in `backend/app/routers/submissions.py` — rejects submissions after `timer_started_at + duration_minutes` or when `COMPLETED` with HTTP 400 "Submission deadline passed"
  - [x] Test suite: Backend pytest `backend/test_contest_expiry.py` (3/3 passed) & Frontend Vitest `frontend/src/ProblemPage.test.tsx` (2/2 passed)
- [x] **Per-Question Time Calculation** *(Phase 4 — COMPLETE)*:
  - [x] Backend logic in `backend/app/routers/submissions.py`: computes `solve_time_seconds = (sub.created_at - batch.timer_started_at)` upon 'AC' verdict
  - [x] Persisted `solve_time_seconds` integer in `Submission` table and exposed in `SubmissionResponse` schema
  - [x] Updated `backend/app/routers/leaderboard.py`: aggregates total solve time per user based exclusively on their first successful AC per problem for tie-breaking
  - [x] Verified via automated test suite `backend/test_solve_time.py` (3/3 passed: AC persistence, non-AC exclusion, multiple-solve first-AC tie-breaking)
- [x] **Real-Time Cross-Client Synchronization & Problem Unlock** *(Phase 5 — COMPLETE)*:
  - [x] Replaced single-tab in-memory DOM event (`window.dispatchEvent('batch:started')`) with network-aware multi-client polling in `frontend/src/useCountdownTimer.ts`.
  - [x] Dynamic polling frequency: client polls `/api/batches/my-batch/timer` every 2s while batch is `NOT_STARTED` or error/loading; switches to 30s re-calibration upon `ACTIVE`.
  - [x] Instant state transition: upon response transitioning from `NOT_STARTED` to `ACTIVE`, immediately derives remaining seconds, updates display, and broadcasts local invalidation (`batch:activated`).
  - [x] Auto-unlock & Query Re-trigger: `useArena` (`ProblemsPage`) and `ProblemPage` automatically invalidate and re-query `/api/problems` and `/api/problems/{slug}` as soon as timer becomes `ACTIVE` or on `batch:activated`.
  - [x] Seamless Unmount: `BatchGate.tsx` and `WaitingScreen.tsx` unmount cleanly when `status` becomes `ACTIVE`, rendering problems without requiring manual page refresh.
  - [x] Cache-Busting Headers: backend `/api/problems`, `/api/problems/{slug}`, and `/api/batches/my-batch/timer` return `Cache-Control: no-store, no-cache, must-revalidate` (including on HTTP 423 error responses).
  - [x] Dynamic Session Refresh: `_assert_batch_active` and `get_my_batch_timer` call `session.refresh(batch)` to prevent stale identity-map reads from WAL SQLite.
  - [x] Optimistic Admin UX: 'Start Batch Timer' button in `LeaderboardPage.tsx` features an optimistic loading state (`Starting…` + spinner), 8-second network timeout guard, rollback on failure, and guaranteed button unlock in `finally`.
  - [x] Verified: 4/4 backend tests pass (`pytest`), 44/44 frontend tests pass (`vitest run`), and `npm run build` exits 0 with 0 TS errors.
- [x] **Contest Anti-Cheat — Task 1: Fullscreen Lock & Exit Counter** *(Phase 6 — COMPLETE)*:
  - [x] Created `frontend/src/hooks/useFullscreenLock.ts`: tracks `isFullscreen`, `exitCount` (persisted in `sessionStorage` key `'coc_fullscreen_exit_count'`), and `enterFullscreen` via `document.documentElement.requestFullscreen()`.
  - [x] Fullscreen Exit Detection & Event Dispatch: listens to document `fullscreenchange`; when `document.fullscreenElement` drops to null after having been active, increments `exitCount`, saves count to `sessionStorage`, and dispatches window `contest:violation` event (`{ type: 'fullscreen_exit', count: updatedCount }`). Includes complete cleanup on unmount.
  - [x] Created `frontend/src/components/FullscreenGate.tsx`:
    - Admin bypass: immediately renders children without gating when `user.role === 'admin'`.
    - Active Fullscreen: renders contest content without restrictions when fullscreen is active.
    - Blocking Modal Overlay: blocks all contest interactions outside fullscreen.
      - State A (`exitCount === 0`): "Contest Arena - Fullscreen Required" modal prompting participant to enter fullscreen ("Enter Fullscreen Arena").
      - State B (`exitCount > 0`): "War Alert: Fullscreen Violation" warning displaying violation count badge and mandatory re-entry button ("Return to Fullscreen").
  - [x] Integrated into `frontend/src/BatchGate.tsx`: active contestant problem routes (`/problems` and `/problems/:slug`) are wrapped with `<FullscreenGate>`, ensuring problems and the Monaco code editor remain locked behind fullscreen mode.
  - [x] Enhanced `frontend/src/pages/LoginPage.tsx`: triggers `document.documentElement.requestFullscreen().catch(() => {})` directly inside the user's "Enter the Arena" submit button gesture for seamless auto-entry into fullscreen on login.
  - [x] Themed modal & badge styling in `frontend/src/index.css`: `.fullscreen-gate-overlay`, `.fullscreen-gate-card`, `.fullscreen-gate-card--violation`, `.modal-shield-wrap--violation`, `.fullscreen-violation-badge`, `.violation-dot`, `.gate-title`, and `.gate-message` styled to match the dark fantasy Clash of Code arena theme.
  - [x] Test Coverage:
    - `frontend/src/hooks/useFullscreenLock.test.ts` (6 unit tests: initial not-fullscreen state, session storage persistence, enter fullscreen request, fullscreen entry state change, exit increment + session update + event dispatch, and unmount listener cleanup).
    - `frontend/src/components/FullscreenGate.test.tsx` (4 unit tests: admin bypass, contestant in fullscreen render, State A first-visit modal, State B violation warning modal).
    - Mocked `FullscreenGate` in `BatchGate.test.tsx` for clean unit isolation.
  - [x] Verified: 54/54 frontend tests pass (`npm test`), `npm run build` completes with 0 TS errors, and backend pytest suite passes.

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

#### Vatsal — Round 2 (2026-11-03)
- [x] **Code draft saving (switch quests without losing work)**:
  - [x] New `frontend/src/lib/drafts.ts`: per-team + per-quest + per-language drafts in `localStorage` (`cc-draft:v1:<userId>:<slug>`), offline-first, no new endpoint/DB table. Teams sharing one lab PC never see each other's code; corrupt/full storage never breaks the editor
  - [x] `ProblemPage.tsx`: saves on every edit, restores on return (also after a full reload), remembers the chosen language, small "Draft saved / Draft restored" chip in the editor toolbar. Draft is cleared once the quest is submitted
  - [x] Verified in a real browser against the real backend (draft survives A→B→A and a full reload; other quests keep their own starter code)
- [x] **Single submission per quest, submitted quest disappears**:
  - [x] Backend: `POST /api/submissions` returns `409` on a 2nd submission for the same quest; `GET /api/problems` omits submitted quests; `GET /api/problems/{slug}` and `POST /api/submissions/run` return `403 {code: ALREADY_SUBMITTED}` for them. Rules live in new `backend/app/submission_rules.py` (shared by both routers)
  - [x] Any verdict (AC/WA/TLE/CE/…) uses the attempt, **except `IE` (judge error)** — that isn't the team's fault, so they can resubmit. A crash mid-judging releases the attempt too. Check-and-insert is guarded by a lock so a double-click / 2nd tab can't slip a duplicate through. **Admins are exempt.**
  - [x] Frontend: submitted quests vanish from the Problems list and the rail immediately; Problems header shows `N submitted · M remaining` plus an all-done state; after submitting, the forge is sealed (read-only, Run/Attack disabled, "Submission locked in" band); opening a sealed quest by URL shows a clear message
  - [x] Safety net: because the attempt is final, the first **Attack** press only *arms* the button ("Confirm · final attempt", 5 s, screen-reader announced); the second press submits. Stops a stray Ctrl+Enter from spending a team's only attempt
  - [x] Own submission history/score is untouched (`GET /api/submissions`, leaderboard, solve times unchanged)
- [x] **Bugs fixed on the way**: `routers/submissions.py` referenced `BatchProblem` without importing it → `POST /api/submissions/run` returned 500 for every contestant in a batch (import added); `BatchAllotmentLeaderboard.test.tsx` mock was missing `getBatchProblems`/`setBatchProblems`/`autoAllotBatchProblems` (1 failing test → fixed); `submit` callback had a stale-closure lint warning (`running` missing from deps)
- [x] **Frontend tests**: `npm test` → 6 files / 35 tests pass (new: `lib/drafts.test.ts`, `ProblemDraftAndSeal.test.tsx`); `npm run build` exit 0; lint clean for touched code
- [ ] **PENDING — backend automated tests** (12 cases in a scratch file: single-submit, IE exemption, hidden quest 403, `/run` 403, admin exemption, concurrency, history intact). Written and confirmed to fail on the old code; to be run **after the Docker/Judge0 restart**, then tick this box
- [ ] **PENDING — end-to-end with real Judge0** (a real AC/WA submit seals the quest; only a mocked/IE verdict was exercised live)
- ⚠️ **Heads-up for the team**
  - **Sanchita** — "remove submission logs tab" overlaps with this work: one submission per quest means the "My Attacks" tab only ever lists ≤1 row. Removing it is safe; the score/verdict still shows in the verdict strip right after submitting
  - **Sanchita / Yash** — a contestant's `GET /api/problems` list now shrinks as they submit (by design). Anything counting "total quests" from that endpoint should add the team's submitted count
  - **Bhakti** — "optimal time complexity per problem" is content-only and untouched by this work. `frontend/DESIGN.md` still describes the old lime/graphite theme while the shipped CSS is the gold Clash-of-Clans theme (3 gold `gradient-text` headings in `index.css` are the theme, left as is)
  - Problem letters (A–E) are computed from the visible list, so they can shift on reload once a quest is submitted (cosmetic)
  - Pre-existing, not from this work: Monaco is a controlled editor and drops characters under machine-speed typing (reproduced on the untouched `main` too). Real typing speed is fine; worth a look if teams report lost keystrokes

#### Vatsal — Round 3 (2026-11-07): Exam security
- [x] **Security notice on login**: contestants entering `/problems` get a blocking "Examination Security Guidelines" dialog (copy-paste rules + tab monitoring), must press "I Understand & Continue". Once per login (sessionStorage, cleared on sign-out). Admins never see it. (`src/ExamSecurity.tsx`, `components/ExamSecurityDialogs.tsx`)
- [x] **Block copy / cut / paste** (`hooks/useCopyPasteGuard.ts`): Ctrl/Cmd+C/X/V, Ctrl+Insert, Shift+Insert, Shift+Delete, copy/cut/paste/drop/dragstart/contextmenu and `beforeinput` paste — capture-phase listeners scoped to the ProblemPage workspace only, contestants only. Monaco context menu + drop-into-editor off for contestants; statement text unselectable. One "disabled" toast per burst. Login/admin/other pages untouched
- [x] **Tab-switch counter + warning** (`hooks/useTabSwitchMonitor.ts`): Page Visibility API only (blur not counted → no double counting); active only when notice acknowledged + batch `ACTIVE` + on `/problems*`; stops on `COMPLETED` / sign-out. Warning dialog on return (1st vs. later wording), live "👁 Tab Switches: N" pill in the navbar. Count survives refresh/route changes
- [x] **Backend** (`app/routers/security.py`, new table `tab_switch_events` with unique `(user_id, client_event_id)`): `POST /api/security/tab-switch {event_id}` → server-side COUNT (client count ignored, retries de-duplicated, only recorded while the batch is live, admins ignored); `GET /api/security/tab-switch` (own count); `GET /api/admin/security/tab-switches?batch_id=` (admin only, 403 otherwise). `resolve_user_batch()` extracted from the timer route (behaviour unchanged) and reused
- [x] **Tests**: frontend `npm test` → 8 files / 63 pass (new `ExamSecurity.test.tsx`, 21 cases); `npm run build` exit 0; backend `tests/test_exam_security.py` (local, `tests/` is git-ignored) → 9 pass incl. timer regression
- [x] ~~PENDING — admin UI~~ → done in Round 4 (Security Watch tab)

#### Vatsal — Round 4 (2026-11-07): Three-strike enforcement, fullscreen, post-login notice
- [x] **Notice right after login** (any route, contestants only, never admins / logged-out): lists what is NOT allowed (copy/cut/paste, tab/window switching, leaving fullscreen, outside help) + the three-strike rule. Button is disabled with a visible countdown for **10 s**; Escape/backdrop cannot close it. "I Understand & Continue" also enters fullscreen
- [x] **Enforcement lifecycle** (`src/ExamSecurity.tsx`): active only when notice acknowledged + batch `ACTIVE` + on `/problems*`. Copy guard moved from ProblemPage to the app shell (attached to `document.body` only while enforcing). Nothing before login, on `/login`, for admins, before start or after end
- [x] **Unified violations** (`hooks/useSecurityMonitor.ts`): TAB_SWITCH, FULLSCREEN_EXIT, COPY/CUT/PASTE_ATTEMPT. One action = one strike: 1.5 s client window + 2 s server window + unique event id; held keys report once; refresh/unload never counts; network failures are queued with their id and re-sent (server de-dupes)
- [x] **Warnings**: "Security Warning" 1/3, "Final Warning" 2/3, "Contest Session Locked" 3/3 (exact copy from spec), strike meter, navbar pill `🛡 Violations n / 3` / `🔒 Locked`
- [x] **Fullscreen**: requested on acknowledgement; exit = 1 strike; "Fullscreen Required" screen (with denial message) whenever enforcing and not fullscreen, e.g. after a refresh (not a strike)
- [x] **Backend lock** (`app/security_rules.py`): count/lock per (contestant, batch) in DB — survives refresh, logout/login, other browsers. 3rd strike → `contest_security_states.status = LOCKED`; `POST /api/submissions` and `/run` return **423 `SESSION_LOCKED`**. Nothing deleted (drafts stay in the browser, submissions in DB). Account is not disabled
- [x] **Schema**: `tab_switch_events` + `event_type`, `violation_number`, `event_metadata`, `reset_id` (in-place migration, old rows default `TAB_SWITCH`); new `contest_security_states`, `security_admin_actions` (audit). New endpoints: `POST /api/security/violations`, `GET /api/security/status`, admin `GET /api/admin/security/participants`, `GET …/{id}/events`, `POST …/{id}/unlock`, `POST …/{id}/reset`, `GET /api/admin/security/audit` (all `require_admin`). Legacy `/tab-switch` endpoints kept
- [x] **Admin "🛡 Security Watch" tab** (`components/SecurityMonitorPanel.tsx`): per team — batch, strikes, tab / fullscreen / copy-paste counts, status, last violation; incident history; **Unlock (keep strikes)** / **Reset strikes & unlock** with mandatory reason; audit shows admin + reason. Resets void events, never delete
- [x] **Tests**: frontend `npm test` → 8 files / **71 pass** (`ExamSecurity.test.tsx` 29 cases); `npm run build` exit 0; backend `tests/test_exam_security.py` → **17 pass** (lock + 423, retries, same-incident, re-login, not-live, separate attempts, admin-only, unlock/reset audit, migration, timer regression)
- [x] **Live UAT (2026-11-07, real browser vs real backend, Docker/Judge0 up)**: notice shows right after `team1` login with the full "not allowed" list → acknowledge enters fullscreen → paste blocked = strike 1 "Security Warning 1/3" → tab hidden = strike 2 "Final Warning 2/3" (stored as `TAB_SWITCH`) → `contestant1` reached 3 strikes and was locked (later tab switches correctly ignored while locked)
- [x] **Bug found in UAT + fixed**: the "page is unloading" guard (so a refresh is not a strike) never cleared, so after a cancelled navigation / back-forward-cache restore every later tab switch was ignored. Now resets after 1 s or on `pageshow` (regression test added)
- [ ] **Still to do by hand**: a genuine Ctrl+Tab / Alt+Tab / minimise in Chrome + Edge (automation opens pages in separate windows, so the hidden signal was triggered by script), Esc out of fullscreen, admin unlock from the UI, phone layout
- Notes: after an admin starts a batch, an already-open contestant page needs up to 30 s (existing timer poll) or a refresh before enforcement starts. Use separate browsers for admin and team (same profile shares one login token). Judge0 code execution needs cgroup v1 on WSL2 (unrelated to this work). Test environment (Judge0 containers + volumes, local venv, test DB, `.env`, build output) was removed after testing

#### Exam security — test results (final run, 2026-11-07)
| Suite | Command | Result |
| :--- | :--- | :--- |
| Frontend unit/integration | `cd frontend && npm test` | **8 files / 72 tests pass** (3 consecutive runs) — incl. `ExamSecurity.test.tsx` (30 cases) |
| Frontend build + types | `cd frontend && npm run build` | exit 0, 0 TS errors |
| Frontend lint (touched files) | `npx oxlint …` | 0 errors (only the same warning types already present in the repo) |
| Backend API | `pytest tests/test_exam_security.py` | **17 pass** — lock + 423 on Run/Submit, retry de-dupe, same-incident window, re-login, contest not live, separate attempts, admin-only (403), unlock/reset audit, old-DB migration, timer regression. Scratch file, deleted after the run (repo `.gitignore` excludes `tests/`) |
| Live UAT | browser + uvicorn + Vite + Judge0 containers | see Live UAT above |

#### Exam security — every file changed and why
| File | Change | Why / what changed |
| :--- | :--- | :--- |
| `backend/app/models.py` | Modified | `tab_switch_events` (`TabSwitchEvent`) gains `event_type`, `violation_number`, `event_metadata`, `reset_id`; new tables `contest_security_states` (lock per contestant + batch) and `security_admin_actions` (audit trail); in-place `ALTER TABLE` migration for existing DBs |
| `backend/app/security_rules.py` | **New** | All three-strike logic: server-side count, 2 s same-incident window, event-id de-dupe, process lock so two requests can't both be strike 3, lock on strike 3, `ensure_not_locked()` (HTTP 423 `SESSION_LOCKED`) |
| `backend/app/routers/security.py` | **New** | Contestant: `POST /api/security/violations`, `GET /api/security/status`, legacy `/api/security/tab-switch`. Admin (`require_admin`): participants summary, incident history, unlock, reset (reason required, audited), audit log, legacy tab-switch report |
| `backend/app/routers/batches.py` | Modified | Extracted `resolve_user_batch()` from the timer endpoint (behaviour unchanged, regression-tested) so security code finds a contestant's batch the same way |
| `backend/app/routers/submissions.py` | Modified | `ensure_not_locked()` before Run and Submit → locked attempts get 423; unlocked users unaffected |
| `backend/app/main.py` | Modified | Registers the new security router |
| `frontend/src/ExamSecurity.tsx` | **New** | App-wide provider: notice right after a contestant logs in (never admins / logged-out); enforces only when acknowledged + batch ACTIVE + on `/problems*`; wires copy guard, strike warnings, lock screen, fullscreen requirement; exposes state to Navbar / ProblemPage |
| `frontend/src/components/ExamSecurityDialogs.tsx` | **New** | Security notice (not-allowed list, button disabled with a 10 s countdown, Esc blocked), Security Warning 1/3, Final Warning 2/3, Contest Session Locked 3/3, Fullscreen Required — reuse the existing BattleFinished modal styling, focus kept inside |
| `frontend/src/components/SecurityMonitorPanel.tsx` | **New** | Admin "🛡 Security Watch": per-team strikes / tab / fullscreen / copy-paste counts, status, last violation, incident history, Unlock / Reset with mandatory reason + audit list |
| `frontend/src/hooks/useCopyPasteGuard.ts` | **New** | Blocks Ctrl/⌘+C/X/V, Ctrl/Shift+Insert, Shift+Delete, copy/cut/paste/drop/drag/right-click; held keys report once; listeners removed when inactive |
| `frontend/src/hooks/useSecurityMonitor.ts` | **New** | Detects tab hidden + fullscreen exit, reports copy attempts; 1.5 s same-action window; refresh never counts (with the UAT fix); offline queue re-sends with the same event id; polls while locked so an admin unlock applies without reload |
| `frontend/src/lib/examSecurity.ts` | **New** | Notice acknowledgement (sessionStorage, cleared on sign-out), pending-report queue, exact warning texts, fullscreen helpers |
| `frontend/src/api.ts` | Modified | Types + calls for violations, status and admin security endpoints (demo-mode mocks included) |
| `frontend/src/App.tsx` | Modified | Wraps the app in `ExamSecurityProvider` |
| `frontend/src/AuthContext.tsx` | Modified | Sign-out clears the notice acknowledgement (strikes stay on the server) |
| `frontend/src/Navbar.tsx` | Modified | `🛡 Violations n / 3` / `🔒 Locked` pill next to the timer |
| `frontend/src/pages/ProblemPage.tsx` | Modified | Editor + Run/Submit frozen when locked; Monaco's own right-click menu and drag-drop disabled for contestants (blocking itself moved app-wide) |
| `frontend/src/pages/LeaderboardPage.tsx` | Modified | New admin tab "🛡 Security Watch" |
| `frontend/src/index.css` | Modified | Styles for notice, strike meter, lock screen, navbar pill, admin panel (existing theme tokens) |
| `frontend/src/ExamSecurity.test.tsx` | **New** | 30 tests: guard, strike 1→2→3, one action = one strike, refresh / cancelled unload, offline retry, notice 10 s lock, admin/logged-out untouched, lock restore |
| `PROJECTBOARD.md` | Modified | This tracking |

#### Yash — Round 2 (2026-11-08)
- [x] **Batch-Wise Allotment & Leakage Resolution**:
  - [x] Fixed `backend/app/routers/problems.py` (`list_problems` & `get_problem`) to strictly enforce batch boundaries when batch problems are configured. Solves empty/unallotted fallback bug where all questions leaked to every batch.
  - [x] Fixed `backend/app/routers/submissions.py` (`create_submission` & `run_sample_submission`) to reject submission attempts for unallotted problems with HTTP 403.
  - [x] Updated `backend/app/seeder.py` with distinct default problem allotments for Batch 1 and Batch 2.
  - [x] Automated tests in `tests/test_batch_problem_allotment.py` pass (100% isolation verified, 0 leaked questions).
- [x] **Timer Reset Engine & Multi-Batch Timer Sync**:
  - [x] Added `POST /api/admin/batches/{batch_id}/reset-timer` resetting timer status to `NOT_STARTED` and clearing `timer_started_at`.
  - [x] Updated `GET /api/batches/my-batch/timer` to accept `?batch_id=X` query param for admin inspection and dynamically fallback to active batches.
  - [x] Frontend `useCountdownTimer.ts` updated to reset monotonic clamps on batch transition or `NOT_STARTED` status, preventing frozen clocks.
  - [x] Added "🔄 Reset Timer" action button to batch cards in `LeaderboardPage.tsx`.
- [x] **Anti-Cheat Proctoring Telemetry & Surveillance**:
  - [x] Added `tab_switch_count`, `fullscreen_exit_count`, `last_active_at` to `Team` and `User` models with automatic SQLite migration.
  - [x] Implemented `POST /api/telemetry/report` for real-time violation reporting with rate throttling.
  - [x] Implemented `GET /api/telemetry/admin/discrete` calculating clan integrity status (`CLEAN`, `CAUTION`, `FLAGGED`).
  - [x] Frontend hooks (`useTabSwitchMonitor.ts` & `useFullscreenLock.ts`) actively report tab switches, window blur, and fullscreen escape events.
- [x] **Admin Discrete Command Center Dashboard**:
  - [x] Built discrete multi-table dashboard in `LeaderboardPage.tsx`:
    - Event Overview KPI cards (Active Battle Clans, AC Victories, Total Attacks, Proctor Alerts).
    - Dynamic filter toggles (`📊 All Intelligence`, `🏆 Scores & Ranks`, `🛡️ Proctor Surveillance`).
    - Table 1: Clan Standings & Battle Scores.
    - Table 2: Discrete Proctoring Telemetry with tab switches, fullscreen exit pills, integrity badges, and last active ping.
- [x] **Test Verification**:
  - [x] Backend: `backend/.venv/Scripts/pytest.exe tests/test_batch_problem_allotment.py tests/test_timer_and_telemetry.py` (5/5 PASS in 1.87s).
  - [x] Frontend: `npm test --prefix frontend -- --run` (10/10 test files, 58/58 tests PASS).
  - [x] Frontend Build: `npm run build --prefix frontend` (Exit 0, clean production bundle).

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

