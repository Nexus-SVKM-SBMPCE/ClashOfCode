# Project Board: Contest Integrity Telemetry, Dev Timer Reset & Batch Allotment Engine

## Current Milestone Objective
Fix batch-wise question allotment and timer resetting bugs, implement dev-mode timer reset controls, build anti-cheat telemetry tracking (tab switches + fullscreen exits) with discrete data dashboard tables, and provide Staff Engineer evaluation regarding Supabase cloud database vs. local offline LAN architecture.

---

## Phase Breakdown

### Phase 1: Batch-Wise Allotment Bug Fix & Default Seeding [COMPLETE]
- [x] Fix `backend/app/routers/problems.py` so that `list_problems` and `get_problem` strictly enforce batch question boundaries when batch questions are configured.
- [x] Fix `backend/app/routers/submissions.py` so `create_submission` validates that the target problem is allotted to the contestant's batch.
- [x] Update `backend/app/seeder.py` to seed distinct default problem sets for Batch 1 and Batch 2 (Batch 1: Two Sum, Fibonacci, Palindrome Check; Batch 2: Binary Search, Max Subarray, Two Sum).
- [x] Automated tests in `tests/test_batch_problem_allotment.py` pass (100% isolation verified, 403 on cross-batch access & submit, 0 questions leaked).

### Phase 2: Timer Reset Controls & Admin Multi-Batch Timer Sync [COMPLETE]
- [x] Add `POST /api/admin/batches/{batch_id}/reset-timer` endpoint in `backend/app/routers/batches.py`.
- [x] Update `get_my_batch_timer` in `batches.py` to accept optional `batch_id` and dynamically resolve active batches for admins.
- [x] Update `frontend/src/useCountdownTimer.ts` to reset monotonic clamps when batch changes or status transitions to `NOT_STARTED`.
- [x] Add `resetBatchTimer(batchId)` in `frontend/src/api.ts` and "🔄 Reset Timer" button on batch cards in `LeaderboardPage.tsx`.
- [x] Automated tests in `tests/test_timer_and_telemetry.py` pass.

### Phase 3: Anti-Cheat Telemetry Engine (Tab Switches & Fullscreen Disables) [COMPLETE]
- [x] Add `tab_switch_count`, `fullscreen_exit_count`, `last_active_at` to `Team` and `User` in `backend/app/models.py` with auto-migration.
- [x] Implement `POST /api/telemetry/report` in `backend/app/routers/telemetry.py` for real-time violation reporting with rate throttling.
- [x] Implement `GET /api/telemetry/admin/discrete` returning discrete user activity and violation status (`CLEAN`, `CAUTION`, `FLAGGED`).
- [x] Connect frontend `visibilitychange`, `blur` (`useTabSwitchMonitor.ts`), and fullscreen exit (`useFullscreenLock.ts`) hooks to dispatch telemetry reports to backend.
- [x] Register router in `backend/app/main.py`.

### Phase 4: Admin Discrete Data Dashboard [COMPLETE]
- [x] Build multi-table discrete dashboard in `LeaderboardPage.tsx`:
  - Event Overview Command Center metrics (Active clans, AC victories, total attacks, proctor alerts).
  - View selector filter: `📊 All Intelligence`, `🏆 Scores & Ranks`, `🛡️ Proctor Surveillance`.
  - Table 1: Clan Standings & Battle Scores.
  - Table 2: Clan Anti-Cheat Surveillance & Proctoring Telemetry (Fullscreen exits, tab switches, integrity badges, last active ping).
- [x] All 10 Vitest test suites (58 tests) pass.
- [x] Production build (`npm run build --prefix frontend`) passes with 0 errors.

### Phase 5: Architectural Opinion on Cloud Database (Supabase) [COMPLETE]
- [x] Formulate detailed Staff Engineer assessment comparing Supabase vs. SQLite WAL / LAN PostgreSQL for offline LAN competition.
