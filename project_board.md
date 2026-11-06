# Project Board: Time Complexity Engine & Admin Quest / Batch Management

## Objective
Implement a mathematical and analytical, non-AI real-time Time Complexity Evaluator, integrated with problem creation containing admin-specified best time complexity, and a unified batch question & team allotment system.

---

## Architecture & Edge Case Analysis

### 1. Mathematical & Analytical Time Complexity Engine (`backend/app/complexity.py`)
- **Philosophy**: 100% deterministic, zero-AI, sub-millisecond execution overhead so live concurrent contest submissions remain instantaneous.
- **Python AST Engine**:
  - Uses native `ast.parse` to extract Abstract Syntax Tree.
  - **Loop Nesting & Stride Analysis**:
    - Distinguishes literal constant loops (`for _ in range(10):` -> $O(1)$) from $N$-dependent loops (`for x in nums:` or `range(n)` -> $O(N)$).
    - Detects logarithmic stride updates (`i *= 2`, `i //= 2`, `low = mid + 1` / `high = mid - 1` binary search) -> $O(\log N)$.
    - Nested loops: combines multiplicative factors (e.g. $O(N) \times O(N) = O(N^2)$, $O(N) \times O(\log N) = O(N \log N)$).
    - Sequential loops: combines via asymptotic dominance ($\max(O_1, O_2)$).
  - **Recursion Graph & Call Analysis**:
    - Linear single recursion: $T(N) = T(N-1) + O(1) \implies O(N)$.
    - Divide-and-conquer recursion: $T(N) = 2T(N/2) + O(N) \implies O(N \log N)$ or $T(N) = T(N/2) + O(1) \implies O(\log N)$ (Master Theorem).
    - Branching recursion without memoization: `f(n-1) + f(n-2)` -> $O(2^N)$.
    - Branching with memoization/caching: detected through `@lru_cache`, `cache`, or memoization dict -> drops from $O(2^N)$ to $O(N)$.
  - **Built-in Functions**:
    - `sort()`, `sorted()` -> $O(N \log N)$.
    - `min()`, `max()`, `sum()`, `count()` on list -> $O(N)$.
    - Dict/set lookups and membership (`x in set_obj`) -> $O(1)$.
- **C / C++ / Java Analytical Lexical Engine**:
  - Control-flow scope tokenizer analyzing loop blocks (`for`, `while`, `do-while`), loop conditions, stride updates (`*= 2`, `/= 2`), recursive method calls, and standard library sorts (`std::sort`, `Arrays.sort`, `qsort`).
- **Complexity Hierarchy & Comparison**:
  - Formal scale: $O(1) < O(\log N) < O(N) < O(N \log N) < O(N^2) < O(N^3) < O(2^N) < O(N!)$.
  - Comparison against Admin's `best_time_complexity`:
    - `OPTIMAL`: Evaluated complexity is equal to or better than best complexity.
    - `ACCEPTABLE`: Evaluated complexity is within 1 tier (e.g. $O(N \log N)$ vs $O(N)$).
    - `SUBOPTIMAL`: Evaluated complexity is strictly worse (e.g. $O(N^2)$ vs $O(N)$).

### 2. Edge Cases & Corner Cases Handled
1. **Constant Loops**: Loops over fixed constants (e.g. `range(26)`, `range(4)`) do not artificially inflate complexity to $O(N)$.
2. **Early Exits (`break` / `return`)**: Loop trees with constant bounded early breaks evaluated safely.
3. **Multi-Function & Class Structures**: Analyzes entry points (`class Solution` methods, `def solve`, `main`) and traces child helper function call graphs.
4. **Syntax Errors / Unsupported Code**: Graceful fallback to `O(N)` default with `error: null` rather than crashing the submission worker.
5. **Concurrent Real-Time Safety**: Zero subprocess spawns or external network calls; pure in-memory AST / lexical evaluation executing in < 1ms.

---

## Phase Breakdown

### Phase 1: Mathematical Time Complexity Engine [COMPLETE]
- [x] Create `backend/app/complexity.py` with AST-based and analytical complexity evaluators.
- [x] Implement complexity hierarchy comparison (`compare_complexity(calculated, expected)`).
- [x] Unit test suite in `tests/test_complexity_engine.py` covering $O(1)$, $O(\log N)$, $O(N)$, $O(N \log N)$, $O(N^2)$, $O(2^N)$ across sample algorithms (11/11 tests pass, average analysis time < 0.2ms).

### Phase 2: Database Models & Real-Time Submission Pipeline Integration [COMPLETE]
- [x] Add `best_time_complexity: Optional[str]` to `Problem` model and `time_complexity: Optional[str]` to `Submission` model in `backend/app/models.py`.
- [x] Add column migrations in `_migrate_columns()` for existing SQLite databases (`problems` and `submissions` table ALTER TABLE migrations).
- [x] Seed default optimal complexities for existing DSA problems in `backend/app/seeder.py` (Two Sum: O(N), Binary Search: O(log N), Max Subarray: O(N), etc.).
- [x] Update `evaluate_submission` and `run_sample_submission` in `submissions.py` to compute complexity in real-time (< 1ms) and return in API responses.
- [x] Update `backend/app/routers/admin.py` endpoints for problem creation/update to accept and return `best_time_complexity` + added `POST /api/admin/batches`.
- [x] Backend test verification: 48/48 tests pass cleanly.

### Phase 3: Admin Problem Statement Creation UI (Quest Forge) [COMPLETE]
- [x] Add API client functions in `frontend/src/api.ts` (`createAdminProblem`, `updateAdminProblem`, `deleteAdminProblem`, `getAdminProblems`, `addAdminTestCase`, `getAdminTestCases`, `deleteAdminTestCase`, `createAdminBatch`).
- [x] Build Admin "Quest Forge" (`frontend/src/components/QuestForge.tsx`) component:
  - Fields: Title, Slug (auto-derived), Difficulty (Easy/Medium/Hard), Time Limit, Memory Limit.
  - Dedicated **Best Time Complexity** selector ($O(1)$, $O(\log N)$, $O(N)$, $O(N \log N)$, $O(N^2)$, $O(N^3)$, $O(2^N)$).
  - Problem statement markdown editor with live preview toggle.
  - Test case manager (Sample & Hidden input/output pairs, dynamically add/remove).
  - Existing Quest Roster table with optimal complexity badges and delete action.
  - CoC aesthetic styling: 3D beveled cards, gold border, dark elixir background, tactile buttons.
- [x] Integrated as third tab `⚒️ Quest Forge & Complexity` in `frontend/src/pages/LeaderboardPage.tsx`.

### Phase 4: Unified Batch Allotment Interface (Batches, Teams & Problems) [COMPLETE]
- [x] Enhance Admin Allotment view:
  - Added "Create New Batch" form card in `LeaderboardPage.tsx` with Batch Number, Name, Duration, and submission handler.
  - Added Optimal Time Complexity badge to the Arena Quest Allotment table for every question.
  - Full batch-question and batch-team allotment verified with backend API.

### Phase 5: Contestant Workspace Feedback & End-to-End Verification [COMPLETE]
- [x] In `frontend/src/pages/ProblemPage.tsx`:
  - Problem Statement pane displays `⚡ Optimal: {best_time_complexity}` badge beside difficulty, time, and memory limits.
  - Sample test console displays evaluated asymptotic time complexity pill with verdict (`⚡ Time: O(N) (OPTIMAL)`).
  - Attack submission verdict strip displays real-time complexity badge (`⚡ Complexity: O(N) (Optimal)` vs `⚠️ Complexity: O(N²) (Suboptimal · Best: O(N))`).
- [x] Automated test suites verified:
  - Backend pytest: `48 passed in 11.05s`
  - Frontend vitest: `7 test files, 39 passed in 6.07s`
  - Frontend build: `npm run build` exits with code 0 (zero errors).
