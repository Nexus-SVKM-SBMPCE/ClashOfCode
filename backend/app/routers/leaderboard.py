"""
Leaderboard router: server-side score aggregation.
Score per problem = best granular score across the team's submissions
(test-case marks + difficulty bonus, see app/scoring.py).
Ranks by: total score DESC, solved count DESC, then earliest time the final score was reached ASC.
"""
from typing import Any, Dict, List, Optional
from sqlmodel import Session, select, func
from fastapi import APIRouter, Depends

from app.auth import get_current_user
from app.database import get_session
from app.models import Submission, Problem, User

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("")
def get_leaderboard(
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    # Get all contestants (non-admin)
    users = session.exec(
        select(User).where(User.role == "contestant", User.is_active == True)  # noqa: E712
    ).all()

    # Get all problems
    problems = session.exec(select(Problem).where(Problem.is_visible == True)).all()  # noqa: E712
    problem_ids = {p.id for p in problems}

    # For each user, calculate best submission per problem
    rows = []
    for user in users:
        # All done submissions for this user on visible problems
        user_subs = session.exec(
            select(Submission).where(
                Submission.user_id == user.id,
                Submission.status == "done",
                Submission.problem_id.in_(problem_ids),  # type: ignore[attr-defined]
            )
        ).all()

        solved_problems: Dict[int, dict] = {}
        best_score: Dict[int, dict] = {}
        for sub in user_subs:
            pid = sub.problem_id
            cur = best_score.get(pid)
            if sub.score > 0 and (
                cur is None or sub.score > cur["score"]
                or (sub.score == cur["score"] and sub.created_at < cur["time"])
            ):
                best_score[pid] = {"score": sub.score, "time": sub.created_at}
            if sub.verdict == "AC":
                # Keep earliest AC per problem
                if pid not in solved_problems or sub.created_at < solved_problems[pid]["time"]:
                    solved_problems[pid] = {
                        "time": sub.created_at,
                        "runtime_ms": sub.runtime_ms,
                    }

        total_score = sum(v["score"] for v in best_score.values())
        total_submissions = len(user_subs)
        last_ac_time = (
            max(v["time"] for v in solved_problems.values()).isoformat()
            if solved_problems else None
        )
        last_score_time = (
            max(v["time"] for v in best_score.values()).isoformat()
            if best_score else None
        )

        rows.append({
            "user_id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "total_score": total_score,
            "solved_count": len(solved_problems),
            "total_submissions": total_submissions,
            "last_ac_time": last_ac_time,
            "_last_score_time": last_score_time,
        })

    # Sort: score DESC, solved DESC, last AC time ASC (earlier is better)
    rows.sort(
        key=lambda r: (
            -r["total_score"],
            -r["solved_count"],
            r["_last_score_time"] or "9999",
        )
    )

    # Assign ranks
    for i, row in enumerate(rows):
        row["rank"] = i + 1
        del row["_last_score_time"]

    return rows
