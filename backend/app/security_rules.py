"""
Three-strike exam-security rules — shared by the security and submissions routers.

Model
-----
* An "attempt" is (contestant, batch). Strikes and lock state belong to the attempt
  in the database, so logout/login, refresh or a new browser never reset them.
* Strike count = COUNT(tab_switch_events WHERE reset_id IS NULL) for the attempt.
  The client never supplies a count, a user id or a lock flag.
* MAX_STRIKES distinct violations lock the attempt (ContestSecurityState.LOCKED).
  A locked attempt cannot Run or Submit; nothing is deleted, drafts stay in the
  browser, existing submissions stay in the DB. Only an admin can unlock.

De-duplication (one browser action = at most one strike)
--------------------------------------------------------
1. Same `client_event_id` twice (network retry)     -> unique constraint, ignored.
2. Another violation within DEDUPE_WINDOW_SECONDS    -> same incident (e.g. Ctrl+Tab
   fires fullscreenchange AND visibilitychange; Ctrl+C fires keydown AND copy), ignored.
3. Violations while already locked or while the batch is not live -> ignored.
The check-and-insert runs under SECURITY_LOCK so two concurrent requests cannot both
become strike #3 (single uvicorn worker, same reasoning as SUBMIT_LOCK).
"""
import json
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, func, select

from app.models import (
    BATCH_STATUS_ACTIVE,
    SECURITY_STATUS_LOCKED,
    Batch,
    ContestSecurityState,
    TabSwitchEvent,
    User,
)


def resolve_user_batch(session: Session, user: User) -> Optional[Batch]:
    # Lazy import: app.routers/__init__ imports submissions, which imports this module.
    from app.routers.batches import resolve_user_batch as _resolve
    return _resolve(session, user)


def _compute_remaining(batch: Batch, now: datetime) -> Optional[int]:
    from app.routers.batches import _compute_remaining as _remaining
    return _remaining(batch, now)

MAX_STRIKES = 3
DEDUPE_WINDOW_SECONDS = 2.0
SECURITY_LOCK = threading.Lock()

SESSION_LOCKED_CODE = "SESSION_LOCKED"
SESSION_LOCKED_MESSAGE = (
    "Your contest session has been locked after repeated security violations. "
    "Your saved code has been preserved. Please contact the contest administrator."
)


def _utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def iso(dt: Optional[datetime]) -> Optional[str]:
    d = _utc(dt)
    return d.isoformat() if d else None


def is_batch_live(batch: Optional[Batch]) -> bool:
    if batch is None or batch.status != BATCH_STATUS_ACTIVE:
        return False
    remaining = _compute_remaining(batch, datetime.now(timezone.utc))
    return remaining is None or remaining > 0


def active_strikes(session: Session, user_id: int, batch_id: Optional[int]) -> int:
    stmt = (
        select(func.count()).select_from(TabSwitchEvent)
        .where(TabSwitchEvent.user_id == user_id, TabSwitchEvent.reset_id == None)  # noqa: E711
    )
    if batch_id is not None:
        stmt = stmt.where(TabSwitchEvent.batch_id == batch_id)
    return int(session.exec(stmt).one())


def get_state(session: Session, user_id: int, batch_id: Optional[int]) -> Optional[ContestSecurityState]:
    if batch_id is None:
        return None
    return session.exec(
        select(ContestSecurityState).where(
            ContestSecurityState.user_id == user_id, ContestSecurityState.batch_id == batch_id
        )
    ).first()


def get_or_create_state(session: Session, user_id: int, batch_id: int) -> ContestSecurityState:
    state = get_state(session, user_id, batch_id)
    if state is None:
        state = ContestSecurityState(user_id=user_id, batch_id=batch_id)
        session.add(state)
        session.flush()
    return state


def is_locked(session: Session, user: User) -> bool:
    if user.role != "contestant":
        return False
    batch = resolve_user_batch(session, user)
    state = get_state(session, user.id, batch.id if batch else None)  # type: ignore[arg-type]
    return state is not None and state.status == SECURITY_STATUS_LOCKED


def ensure_not_locked(session: Session, user: User) -> None:
    """Raise 423 for a locked attempt. Call before any action that changes the attempt."""
    if is_locked(session, user):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={"code": SESSION_LOCKED_CODE, "message": SESSION_LOCKED_MESSAGE},
        )


def status_payload(session: Session, user: User, *, recorded: bool = False, reason: Optional[str] = None) -> Dict[str, Any]:
    if user.role != "contestant":
        return {"count": 0, "max_strikes": MAX_STRIKES, "locked": False, "recorded": False,
                "contest_live": False, "batch_id": None, "reason": "not_contestant"}
    batch = resolve_user_batch(session, user)
    batch_id = batch.id if batch else None
    state = get_state(session, user.id, batch_id)  # type: ignore[arg-type]
    return {
        "count": active_strikes(session, user.id, batch_id),  # type: ignore[arg-type]
        "max_strikes": MAX_STRIKES,
        "locked": state is not None and state.status == SECURITY_STATUS_LOCKED,
        "recorded": recorded,
        "contest_live": is_batch_live(batch),
        "batch_id": batch_id,
        "reason": reason,
    }


def record_violation(
    session: Session, user: User, event_id: str, event_type: str, metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Record one violation for the authenticated contestant; returns the status payload."""
    if user.role != "contestant":
        return status_payload(session, user)

    with SECURITY_LOCK:
        batch = resolve_user_batch(session, user)
        if not is_batch_live(batch):
            return status_payload(session, user, reason="contest_not_live")
        batch_id: int = batch.id  # type: ignore[union-attr, assignment]

        state = get_or_create_state(session, user.id, batch_id)  # type: ignore[arg-type]
        if state.status == SECURITY_STATUS_LOCKED:
            session.commit()
            return status_payload(session, user, reason="already_locked")

        duplicate = session.exec(
            select(TabSwitchEvent.id).where(TabSwitchEvent.user_id == user.id, TabSwitchEvent.client_event_id == event_id)
        ).first()
        if duplicate is not None:
            session.commit()
            return status_payload(session, user, reason="duplicate_event")

        last = session.exec(
            select(TabSwitchEvent.created_at)
            .where(TabSwitchEvent.user_id == user.id, TabSwitchEvent.batch_id == batch_id, TabSwitchEvent.reset_id == None)  # noqa: E711
            .order_by(TabSwitchEvent.created_at.desc())  # type: ignore[attr-defined]
        ).first()
        now = datetime.now(timezone.utc)
        if last is not None and now - _utc(last) < timedelta(seconds=DEDUPE_WINDOW_SECONDS):  # type: ignore[operator]
            session.commit()
            return status_payload(session, user, reason="same_incident")

        strike = active_strikes(session, user.id, batch_id) + 1  # type: ignore[arg-type]
        meta = json.dumps(metadata)[:500] if metadata else None
        session.add(TabSwitchEvent(
            user_id=user.id, batch_id=batch_id, client_event_id=event_id,  # type: ignore[arg-type]
            event_type=event_type, violation_number=strike, event_metadata=meta, created_at=now,
        ))
        if strike >= MAX_STRIKES:
            state.status = SECURITY_STATUS_LOCKED
            state.locked_at = now
        state.updated_at = now
        session.add(state)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            return status_payload(session, user, reason="duplicate_event")
        return status_payload(session, user, recorded=True)
