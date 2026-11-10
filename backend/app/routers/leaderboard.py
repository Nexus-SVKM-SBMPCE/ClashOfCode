"""
Leaderboard router: server-side score aggregation.
Score per problem = best granular score across the team's submissions
(test-case marks + difficulty bonus, see app/scoring.py).
Ranks by: total score DESC, solved count DESC, total solve time ASC (fastest solve time wins tie-break), last AC time ASC.
"""
from typing import Any, Dict, List, Optional
from sqlmodel import Session, select, func
from fastapi import APIRouter, Depends

from app.auth import require_admin
from app.complexity import evaluate_time_complexity
from app.database import get_session
from app.models import Submission, Problem, User, Team

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get("")
def get_leaderboard(
    batch_id: Optional[int] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
) -> List[Dict[str, Any]]:
    # Pre-fetch teams map by id and username
    teams = session.exec(select(Team)).all()
    team_by_id = {t.id: t for t in teams}
    team_by_username = {t.username: t for t in teams}

    # Get all contestants (non-admin)
    users = session.exec(
        select(User).where(User.role == "contestant", User.is_active == True)  # noqa: E712
    ).all()

    # Filter contestants if batch_id is specified
    if batch_id is not None:
        filtered_users = []
        for u in users:
            team = team_by_id.get(u.team_id) if u.team_id else team_by_username.get(u.username)
            if team and team.batch_id == batch_id:
                filtered_users.append(u)
        users = filtered_users

    # Get all problems
    problems = session.exec(select(Problem).where(Problem.is_visible == True)).all()  # noqa: E712
    problem_ids = {p.id for p in problems}
    problem_by_id = {p.id: p for p in problems}

    # For each user, calculate best submission per problem
    rows = []
    for user in users:
        team = team_by_id.get(user.team_id) if user.team_id else team_by_username.get(user.username)

        # All done submissions for this user on visible problems
        sub_query = select(Submission).where(
            Submission.user_id == user.id,
            Submission.status == "done",
            Submission.problem_id.in_(problem_ids),  # type: ignore[attr-defined]
        )
        if batch_id is not None:
            sub_query = sub_query.where(Submission.batch_id == batch_id)

        user_subs = session.exec(sub_query).all()

        solved_problems: Dict[int, dict] = {}
        best_score: Dict[int, dict] = {}
        for sub in user_subs:
            pid = sub.problem_id
            cur = best_score.get(pid)

            # Resolve time complexity if not already stored
            tc = getattr(sub, "time_complexity", None)
            tc_v = getattr(sub, "time_complexity_verdict", None)
            if not tc and getattr(sub, "source_code", None):
                p_obj = problem_by_id.get(pid)
                exp_c = getattr(p_obj, "best_time_complexity", None) or "O(N)"
                try:
                    c_eval = evaluate_time_complexity(sub.source_code, sub.language, exp_c)
                    tc = c_eval.get("calculated_complexity")
                    tc_v = c_eval.get("verdict")
                except Exception:
                    tc = None
                    tc_v = None

            if sub.score > 0 and (
                cur is None or sub.score > cur["score"]
                or (sub.score == cur["score"] and sub.created_at < cur["time"])
            ):
                best_score[pid] = {
                    "score": sub.score,
                    "time": sub.created_at,
                    "time_complexity": tc,
                    "time_complexity_verdict": tc_v,
                }
            if sub.verdict == "AC":
                # Keep earliest AC per problem (first successful solve time considered)
                if pid not in solved_problems or sub.created_at < solved_problems[pid]["time"]:
                    solved_problems[pid] = {
                        "time": sub.created_at,
                        "runtime_ms": sub.runtime_ms,
                        "solve_time_seconds": sub.solve_time_seconds or 0,
                        "time_complexity": tc,
                        "time_complexity_verdict": tc_v,
                    }

        total_score = sum(v["score"] for v in best_score.values())
        total_submissions = len(user_subs)
        total_solve_time = sum(v["solve_time_seconds"] for v in solved_problems.values())
        last_ac_time = (
            max(v["time"] for v in solved_problems.values()).isoformat()
            if solved_problems else None
        )
        last_score_time = (
            max(v["time"] for v in best_score.values()).isoformat()
            if best_score else None
        )

        # Collect complexities from solved problems or best attempted submissions
        target_dict = solved_problems if solved_problems else best_score
        complexities = [
            {
                "problem_id": pid,
                "complexity": v.get("time_complexity") or "O(N)",
                "verdict": v.get("time_complexity_verdict") or "UNKNOWN",
            }
            for pid, v in target_dict.items()
            if v.get("time_complexity") and v.get("time_complexity") != "—"
        ]
        optimal_complexity_count = sum(1 for c in complexities if c["verdict"] == "OPTIMAL")

        rows.append({
            "user_id": user.id,
            "username": user.username,
            "display_name": team.name if team else user.display_name,
            "team_id": team.id if team else None,
            "batch_id": team.batch_id if team else None,
            "total_score": total_score,
            "solved_count": len(solved_problems),
            "total_submissions": total_submissions,
            "last_ac_time": last_ac_time,
            "total_solve_time_seconds": total_solve_time,
            "complexities": complexities,
            "optimal_complexity_count": optimal_complexity_count,
            "_last_score_time": last_score_time,
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
        del row["_last_score_time"]

    return rows
