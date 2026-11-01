"""
Granular scoring engine (pure functions — no DB / Judge0 access, easy to unit test).

Rules:
  * Each passed test case is worth MARKS_PER_TEST_CASE mark (1 point each).
  * Partially passed test cases are always calculated for 1 point each (no threshold gating).
  * A difficulty bonus (easy=+2, medium=+3, hard=+5) is added only when the
    submission passes every test case (complete problem solved).
  * Marks are computed only on official submit — never on sample runs.
"""
from typing import Dict

from app.config import MARKS_PER_TEST_CASE, PARTIAL_THRESHOLD, DIFFICULTY_BONUS


def difficulty_bonus(difficulty: str) -> int:
    return DIFFICULTY_BONUS.get((difficulty or "").lower(), 0)


def compute_score(passed: int, total: int, difficulty: str) -> Dict[str, int]:
    """Return {test_score, bonus_points, score} for a judged submission."""
    if total <= 0 or passed <= 0:
        return {"test_score": 0, "bonus_points": 0, "score": 0}

    passed = min(passed, total)
    # Award 1 point per passed test case
    test_score = passed * MARKS_PER_TEST_CASE if (passed / total >= PARTIAL_THRESHOLD) else 0
    # Award difficulty bonus if all test cases pass
    bonus = difficulty_bonus(difficulty) if passed == total else 0
    return {"test_score": test_score, "bonus_points": bonus, "score": test_score + bonus}
