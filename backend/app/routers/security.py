"""
Exam-security router — three-strike violation tracking + admin review.

Contestant
----------
POST /api/security/violations          Report one violation {event_id, event_type, metadata?}
GET  /api/security/status              Own strike count / lock state (restored after login)
POST /api/security/tab-switch          Legacy: same as a TAB_SWITCH violation
GET  /api/security/tab-switch          Legacy: own active TAB_SWITCH count

Admin (require_admin; contestants get 403)
-----
GET  /api/admin/security/participants                      Per-attempt summary (?batch_id=)
GET  /api/admin/security/participants/{user_id}/events     Incident history + admin actions
POST /api/admin/security/participants/{user_id}/unlock     {reason, batch_id?}
POST /api/admin/security/participants/{user_id}/reset      {reason, batch_id?} voids strikes + unlocks
GET  /api/admin/security/audit                             Admin action trail (?batch_id=)
GET  /api/admin/security/tab-switches                      Legacy per-user counts

All counting / locking rules live in app/security_rules.py.
"""
import json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from app.auth import get_current_user, require_admin
from app.database import get_session
from app.models import (
    SECURITY_STATUS_ACTIVE,
    SECURITY_STATUS_LOCKED,
    Batch,
    ContestSecurityState,
    SecurityAdminAction,
    TabSwitchEvent,
    Team,
    User,
)
from app.routers.batches import resolve_user_batch
from app.security_rules import (
    SECURITY_LOCK,
    get_or_create_state,
    iso,
    record_violation,
    status_payload,
)

router = APIRouter(tags=["security"])

EventId = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
ViolationType = Literal["TAB_SWITCH", "FULLSCREEN_EXIT", "COPY_ATTEMPT", "CUT_ATTEMPT", "PASTE_ATTEMPT"]


# ─── Schemas ──────────────────────────────────────────────────────────────────
class ViolationReport(BaseModel):
    event_id: str = EventId
    event_type: ViolationType
    metadata: Optional[Dict[str, str]] = Field(default=None, max_length=5)


class SecurityStatus(BaseModel):
    count: int
    max_strikes: int
    locked: bool
    recorded: bool
    contest_live: bool
    batch_id: Optional[int]
    reason: Optional[str] = None


class TabSwitchReport(BaseModel):
    event_id: str = EventId


class TabSwitchStatus(BaseModel):
    count: int
    recorded: bool


class AdminActionRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    batch_id: Optional[int] = None


class ParticipantSummary(BaseModel):
    user_id: int
    username: str
    display_name: str
    team_name: Optional[str]
    batch_id: Optional[int]
    batch_name: Optional[str]
    total_violations: int          # active strikes (after resets)
    tab_switches: int
    fullscreen_exits: int
    copy_paste_attempts: int
    lifetime_violations: int       # including voided by resets
    status: str                    # ACTIVE | LOCKED
    locked_at: Optional[str]
    last_violation_at: Optional[str]


class IncidentEvent(BaseModel):
    id: int
    event_type: str
    violation_number: Optional[int]
    created_at: Optional[str]
    voided: bool
    metadata: Optional[Dict[str, Any]]


class AdminActionOut(BaseModel):
    id: int
    action: str
    reason: str
    admin_username: str
    target_username: str
    batch_id: Optional[int]
    created_at: Optional[str]


class IncidentHistory(BaseModel):
    participant: ParticipantSummary
    events: List[IncidentEvent]
    actions: List[AdminActionOut]


class TabSwitchSummary(BaseModel):
    user_id: int
    username: str
    display_name: str
    batch_id: Optional[int]
    count: int
    last_switch_at: Optional[str]


# ─── Contestant endpoints ─────────────────────────────────────────────────────
@router.post("/api/security/violations", response_model=SecurityStatus)
def report_violation(
    body: ViolationReport,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    return record_violation(session, current_user, body.event_id, body.event_type, body.metadata)


@router.get("/api/security/status", response_model=SecurityStatus)
def my_security_status(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    return status_payload(session, current_user)


def _active_type_count(session: Session, user_id: int, batch_id: Optional[int], event_type: str) -> int:
    stmt = select(func.count()).select_from(TabSwitchEvent).where(
        TabSwitchEvent.user_id == user_id, TabSwitchEvent.event_type == event_type,
        TabSwitchEvent.reset_id == None,  # noqa: E711
    )
    if batch_id is not None:
        stmt = stmt.where(TabSwitchEvent.batch_id == batch_id)
    return int(session.exec(stmt).one())


@router.post("/api/security/tab-switch", response_model=TabSwitchStatus)
def report_tab_switch(
    body: TabSwitchReport,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> TabSwitchStatus:
    result = record_violation(session, current_user, body.event_id, "TAB_SWITCH")
    return TabSwitchStatus(count=result["count"], recorded=result["recorded"])


@router.get("/api/security/tab-switch", response_model=TabSwitchStatus)
def my_tab_switches(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> TabSwitchStatus:
    if current_user.role != "contestant":
        return TabSwitchStatus(count=0, recorded=False)
    batch = resolve_user_batch(session, current_user)
    return TabSwitchStatus(
        count=_active_type_count(session, current_user.id, batch.id if batch else None, "TAB_SWITCH"),  # type: ignore[arg-type]
        recorded=False,
    )


# ─── Admin helpers ────────────────────────────────────────────────────────────
def _summaries(session: Session, batch_id: Optional[int], only_user: Optional[int] = None) -> List[ParticipantSummary]:
    ev_stmt = select(TabSwitchEvent)
    st_stmt = select(ContestSecurityState)
    if batch_id is not None:
        ev_stmt = ev_stmt.where(TabSwitchEvent.batch_id == batch_id)
        st_stmt = st_stmt.where(ContestSecurityState.batch_id == batch_id)
    if only_user is not None:
        ev_stmt = ev_stmt.where(TabSwitchEvent.user_id == only_user)
        st_stmt = st_stmt.where(ContestSecurityState.user_id == only_user)

    agg: Dict[tuple, Dict[str, Any]] = defaultdict(lambda: {
        "TAB_SWITCH": 0, "FULLSCREEN_EXIT": 0, "COPY": 0, "active": 0, "lifetime": 0, "last": None,
    })
    for ev in session.exec(ev_stmt).all():
        a = agg[(ev.user_id, ev.batch_id)]
        a["lifetime"] += 1
        if ev.reset_id is not None:
            continue
        a["active"] += 1
        if ev.event_type in ("COPY_ATTEMPT", "CUT_ATTEMPT", "PASTE_ATTEMPT"):
            a["COPY"] += 1
        elif ev.event_type in a:
            a[ev.event_type] += 1
        if a["last"] is None or ev.created_at > a["last"]:
            a["last"] = ev.created_at
    states = {(s.user_id, s.batch_id): s for s in session.exec(st_stmt).all()}
    for key in states:
        agg[key]  # make sure locked/unlocked attempts with zero events still appear

    if not agg:
        return []
    user_ids = {k[0] for k in agg}
    users = {u.id: u for u in session.exec(select(User).where(User.id.in_(user_ids))).all()}  # type: ignore[union-attr]
    team_ids = {u.team_id for u in users.values() if u.team_id}
    teams = {t.id: t for t in session.exec(select(Team).where(Team.id.in_(team_ids))).all()} if team_ids else {}  # type: ignore[union-attr]
    batch_ids = {k[1] for k in agg if k[1] is not None}
    batches = {b.id: b for b in session.exec(select(Batch).where(Batch.id.in_(batch_ids))).all()} if batch_ids else {}  # type: ignore[union-attr]

    out: List[ParticipantSummary] = []
    for (uid, bid), a in agg.items():
        u = users.get(uid)
        if u is None:
            continue
        st = states.get((uid, bid))
        team = teams.get(u.team_id) if u.team_id else None
        out.append(ParticipantSummary(
            user_id=uid, username=u.username, display_name=u.display_name,
            team_name=team.name if team else None,
            batch_id=bid, batch_name=batches[bid].name if bid in batches else None,
            total_violations=a["active"], tab_switches=a["TAB_SWITCH"], fullscreen_exits=a["FULLSCREEN_EXIT"],
            copy_paste_attempts=a["COPY"], lifetime_violations=a["lifetime"],
            status=st.status if st else SECURITY_STATUS_ACTIVE,
            locked_at=iso(st.locked_at) if st and st.status == SECURITY_STATUS_LOCKED else None,
            last_violation_at=iso(a["last"]),
        ))
    out.sort(key=lambda s: (s.status != SECURITY_STATUS_LOCKED, -s.total_violations, s.username))
    return out


def _action_out(session: Session, actions: List[SecurityAdminAction]) -> List[AdminActionOut]:
    ids = {a.admin_id for a in actions} | {a.target_user_id for a in actions}
    names = {u.id: u.username for u in session.exec(select(User).where(User.id.in_(ids))).all()} if ids else {}  # type: ignore[union-attr]
    return [AdminActionOut(
        id=a.id, action=a.action, reason=a.reason,  # type: ignore[arg-type]
        admin_username=names.get(a.admin_id, f"#{a.admin_id}"),
        target_username=names.get(a.target_user_id, f"#{a.target_user_id}"),
        batch_id=a.batch_id, created_at=iso(a.created_at),
    ) for a in actions]


def _target(session: Session, user_id: int, batch_id: Optional[int]) -> tuple:
    target = session.get(User, user_id)
    if target is None or target.role != "contestant":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contestant not found")
    if batch_id is None:
        batch = resolve_user_batch(session, target)
        batch_id = batch.id if batch else None
    if batch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contestant has no batch")
    return target, batch_id


# ─── Admin endpoints ──────────────────────────────────────────────────────────
@router.get("/api/admin/security/participants", response_model=List[ParticipantSummary])
def admin_participants(
    batch_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    _admin: User = Depends(require_admin),
) -> List[ParticipantSummary]:
    return _summaries(session, batch_id)


@router.get("/api/admin/security/participants/{user_id}/events", response_model=IncidentHistory)
def admin_incident_history(
    user_id: int,
    batch_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    _admin: User = Depends(require_admin),
) -> IncidentHistory:
    target, b_id = _target(session, user_id, batch_id)
    summary = _summaries(session, b_id, only_user=target.id)
    participant = summary[0] if summary else ParticipantSummary(
        user_id=target.id, username=target.username, display_name=target.display_name, team_name=None,  # type: ignore[arg-type]
        batch_id=b_id, batch_name=None, total_violations=0, tab_switches=0, fullscreen_exits=0,
        copy_paste_attempts=0, lifetime_violations=0, status=SECURITY_STATUS_ACTIVE, locked_at=None, last_violation_at=None,
    )
    events = session.exec(
        select(TabSwitchEvent).where(TabSwitchEvent.user_id == target.id, TabSwitchEvent.batch_id == b_id)
        .order_by(TabSwitchEvent.created_at.desc())  # type: ignore[attr-defined]
    ).all()
    actions = session.exec(
        select(SecurityAdminAction).where(SecurityAdminAction.target_user_id == target.id, SecurityAdminAction.batch_id == b_id)
        .order_by(SecurityAdminAction.created_at.desc())  # type: ignore[attr-defined]
    ).all()

    def meta(raw: Optional[str]) -> Optional[Dict[str, Any]]:
        try:
            return json.loads(raw) if raw else None
        except ValueError:
            return None

    return IncidentHistory(
        participant=participant,
        events=[IncidentEvent(id=e.id, event_type=e.event_type, violation_number=e.violation_number,  # type: ignore[arg-type]
                              created_at=iso(e.created_at), voided=e.reset_id is not None, metadata=meta(e.event_metadata))
                for e in events],
        actions=_action_out(session, list(actions)),
    )


def _admin_action(session: Session, admin: User, user_id: int, body: AdminActionRequest, action: str) -> IncidentHistory:
    target, b_id = _target(session, user_id, body.batch_id)
    with SECURITY_LOCK:
        now = datetime.now(timezone.utc)
        audit = SecurityAdminAction(admin_id=admin.id, target_user_id=target.id, batch_id=b_id,  # type: ignore[arg-type]
                                    action=action, reason=body.reason.strip(), created_at=now)
        session.add(audit)
        session.flush()
        if action == "RESET":
            for ev in session.exec(select(TabSwitchEvent).where(
                TabSwitchEvent.user_id == target.id, TabSwitchEvent.batch_id == b_id,
                TabSwitchEvent.reset_id == None,  # noqa: E711
            )).all():
                ev.reset_id = audit.id
                session.add(ev)
        state = get_or_create_state(session, target.id, b_id)  # type: ignore[arg-type]
        state.status = SECURITY_STATUS_ACTIVE
        state.locked_at = None
        state.updated_at = now
        session.add(state)
        session.commit()
    return admin_incident_history(target.id, b_id, session, admin)  # type: ignore[arg-type]


@router.post("/api/admin/security/participants/{user_id}/unlock", response_model=IncidentHistory)
def admin_unlock(
    user_id: int,
    body: AdminActionRequest,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
) -> IncidentHistory:
    """Unlock without clearing strikes: the next violation locks again immediately."""
    return _admin_action(session, admin, user_id, body, "UNLOCK")


@router.post("/api/admin/security/participants/{user_id}/reset", response_model=IncidentHistory)
def admin_reset(
    user_id: int,
    body: AdminActionRequest,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin),
) -> IncidentHistory:
    """Void all active strikes (kept in history, marked voided) and unlock."""
    return _admin_action(session, admin, user_id, body, "RESET")


@router.get("/api/admin/security/audit", response_model=List[AdminActionOut])
def admin_audit(
    batch_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    _admin: User = Depends(require_admin),
) -> List[AdminActionOut]:
    stmt = select(SecurityAdminAction).order_by(SecurityAdminAction.created_at.desc())  # type: ignore[attr-defined]
    if batch_id is not None:
        stmt = stmt.where(SecurityAdminAction.batch_id == batch_id)
    return _action_out(session, list(session.exec(stmt).all()))


@router.get("/api/admin/security/tab-switches", response_model=List[TabSwitchSummary])
def admin_tab_switches(
    batch_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    _admin: User = Depends(require_admin),
) -> List[TabSwitchSummary]:
    return [TabSwitchSummary(user_id=s.user_id, username=s.username, display_name=s.display_name, batch_id=s.batch_id,
                             count=s.tab_switches, last_switch_at=s.last_violation_at)
            for s in _summaries(session, batch_id) if s.tab_switches > 0]
