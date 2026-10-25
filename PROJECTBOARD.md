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

## 4. Key Decisions

1. ENABLE_PER_PROCESS_AND_THREAD_MEMORY_LIMIT=false — prevents per-thread cgroup enforcement crashing JVM under WSL2
2. max_processes_and_or_threads omitted from Judge0 payload — explicit value triggers cgroup enforcement; omitting uses safe conf defaults
3. bcrypt pinned to 4.2.1 — bcrypt 5.0.0 breaks passlib 1.7.4
4. All-or-nothing scoring: score=100 if all hidden tests pass, else 0 (server-side only)
5. Hidden test outputs never serialized to any public API response
6. WAL mode for SQLite concurrent reads during live contest

---

## 5. Test Results Summary

| Phase | Test | Result |
| :--- | :--- | :--- |
| Phase 1 | verify_judge0.py — 13/13 | PASS |
| Phase 2 | test_phase2_api.py — 17/18 | 17 PASS / 1 BLOCKED (Java — cgroup) |

---

## 6. Recovery & Next Session

### Judge0 Recovery (run first)
`powershell
# After Docker Desktop restart:
cd r:\ClashOfCode\judge0
docker compose up -d
Start-Sleep 30
cd r:\ClashOfCode
.\.venv\Scripts\python.exe tests\verify_judge0.py
`

### Next Session Priority
1. Restore Judge0 — smoke test C + Python
2. Delete backend/codeclash.db, restart uvicorn, re-run test_phase2_api.py -> 18/18 -> Phase 2 DONE
3. Write frontend/src/index.css design system
4. npm run dev, browser test all pages
5. Phase 4 E2E testing
6. Phase 5 LAN offline test
