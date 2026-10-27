"""
Granular scoring engine (pure functions — no DB / Judge0 access, easy to unit test).

Rules:
  * Each test case is worth MARKS_PER_TEST_CASE marks.
  * Test-case marks are awarded only if at least PARTIAL_THRESHOLD of the
    test cases pass (e.g. 5/10). Below that, the submission scores 0.
  * A difficulty bonus (easy=+2, medium=+3, hard=+5) is added only when the
    submission passes every test case (verdict AC).
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
    test_score = passed * MARKS_PER_TEST_CASE if passed / total >= PARTIAL_THRESHOLD else 0
    bonus = difficulty_bonus(difficulty) if passed == total else 0
    return {"test_score": test_score, "bonus_points": bonus, "score": test_score + bonus}
