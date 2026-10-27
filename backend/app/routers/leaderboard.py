"""
Leaderboard router: server-side score aggregation.
Ranks by: total score DESC, then fewest submissions DESC, then earliest AC time ASC.
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
        for sub in user_subs:
            pid = sub.problem_id
            if sub.verdict == "AC":
                # Keep earliest AC per problem (first successful solve time considered)
                if pid not in solved_problems or sub.created_at < solved_problems[pid]["time"]:
                    solved_problems[pid] = {
                        "time": sub.created_at,
                        "runtime_ms": sub.runtime_ms,
                        "solve_time_seconds": sub.solve_time_seconds or 0,
                    }

        total_score = len(solved_problems) * 100
        total_submissions = len(user_subs)
        total_solve_time = sum(v["solve_time_seconds"] for v in solved_problems.values())
        last_ac_time = (
            max(v["time"] for v in solved_problems.values()).isoformat()
            if solved_problems else None
        )

        rows.append({
            "user_id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "total_score": total_score,
            "solved_count": len(solved_problems),
            "total_submissions": total_submissions,
            "last_ac_time": last_ac_time,
            "total_solve_time_seconds": total_solve_time,
        })

    # Sort: score DESC, solved DESC, total solve time ASC (fastest solve time wins tie-break), last AC time ASC
    rows.sort(
        key=lambda r: (
            -r["total_score"],
            -r["solved_count"],
            r["total_solve_time_seconds"],
            r["last_ac_time"] or "9999",
        )
    )

    # Assign ranks
    for i, row in enumerate(rows):
        row["rank"] = i + 1

    return rows
