"""
Telemetry router: proctoring surveillance, tab switch and fullscreen exit logging.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user, require_admin
from app.database import get_session
from app.models import User, Team, Batch, Submission

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


class TelemetryReport(BaseModel):
    event_type: str  # "tab_switch" | "fullscreen_exit" | "heartbeat"
    count: Optional[int] = 1


@router.post("/report")
def report_telemetry(
    body: TelemetryReport,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    current_user.last_active_at = now

    team: Optional[Team] = None
    if current_user.team_id:
        team = session.get(Team, current_user.team_id)
    elif current_user.role == "contestant":
        team = session.exec(select(Team).where(Team.username == current_user.username)).first()

    step = max(1, body.count or 1)
    if body.event_type == "tab_switch":
        current_user.tab_switch_count = (current_user.tab_switch_count or 0) + step
        if team:
            team.tab_switch_count = (team.tab_switch_count or 0) + step
    elif body.event_type == "fullscreen_exit":
        current_user.fullscreen_exit_count = (current_user.fullscreen_exit_count or 0) + step
        if team:
            team.fullscreen_exit_count = (team.fullscreen_exit_count or 0) + step

    if team:
        team.last_active_at = now
        session.add(team)

    session.add(current_user)
    session.commit()

    return {
        "status": "ok",
        "event_type": body.event_type,
        "tab_switch_count": team.tab_switch_count if team else current_user.tab_switch_count,
        "fullscreen_exit_count": team.fullscreen_exit_count if team else current_user.fullscreen_exit_count,
    }


@router.get("/admin/discrete", response_model=List[Dict[str, Any]])
def admin_get_telemetry(
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> List[Dict[str, Any]]:
    teams = session.exec(select(Team).order_by(Team.id)).all()  # type: ignore[arg-type]
    batches = {b.id: b for b in session.exec(select(Batch)).all()}

    # Pre-aggregate solved and attack count per team/user
    results = []
    for t in teams:
        user = session.exec(select(User).where(User.username == t.username)).first()
        uid = user.id if user else None

        subs = session.exec(select(Submission).where(Submission.user_id == uid)).all() if uid else []
        solved_slugs = {s.problem_id for s in subs if s.verdict == "AC"}
        total_attacks = len(subs)

        fs_count = t.fullscreen_exit_count or 0
        tab_count = t.tab_switch_count or 0

        # Integrity Status scoring
        if fs_count >= 2 or tab_count >= 5:
            integrity_status = "FLAGGED"
        elif fs_count >= 1 or tab_count >= 2:
            integrity_status = "CAUTION"
        else:
            integrity_status = "CLEAN"

        batch_name = batches[t.batch_id].name if t.batch_id in batches else "Unassigned"

        results.append({
            "team_id": t.id,
            "team_name": t.name,
            "username": t.username,
            "leader_name": t.leader_name,
            "leader_email": t.leader_email,
            "batch_id": t.batch_id,
            "batch_name": batch_name,
            "total_score": t.total_score,
            "solved_count": len(solved_slugs),
            "total_attacks": total_attacks,
            "fullscreen_exit_count": fs_count,
            "tab_switch_count": tab_count,
            "integrity_status": integrity_status,
            "last_active_at": t.last_active_at.isoformat() if t.last_active_at else None,
        })

    return results

