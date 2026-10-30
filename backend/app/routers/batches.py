"""
Batches router — per-batch contest timer management.

Endpoints
---------
GET  /api/batches/                            List all batches (admin)
GET  /api/batches/my-batch/timer              Contestant: get their batch timer (server-synced)
POST /api/admin/batches/{batch_id}/start-timer  Admin: start a batch timer
POST /api/admin/batches/                      Admin: create a new batch

Design principle for timer sync
--------------------------------
Every response that carries timer data also includes `server_now_utc` (the
server's current UTC time).  The frontend subtracts `server_now_utc` from
`timer_started_at` to compute elapsed seconds, then counts down from
`duration_minutes * 60`.  This eliminates any dependence on the client clock.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user, require_admin
from app.database import get_session
from app.models import (
    Batch,
    User,
    BATCH_STATUS_NOT_STARTED,
    BATCH_STATUS_ACTIVE,
    BATCH_STATUS_COMPLETED,
)

router = APIRouter(tags=["batches"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class BatchCreate(BaseModel):
    batch_number: int
    name: str
    duration_minutes: int = 60


class BatchTimerResponse(BaseModel):
    batch_id: int
    batch_name: str
    status: str                            # NOT_STARTED | ACTIVE | COMPLETED
    timer_started_at: Optional[str]        # ISO-8601 UTC string, None if not started
    duration_minutes: int
    server_now_utc: str                    # ISO-8601 UTC — client must use this, NOT local clock
    remaining_seconds: Optional[int]       # Pre-computed; None if not started or already ended


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _compute_remaining(batch: Batch, now: datetime) -> Optional[int]:
    """Return seconds remaining or None if timer not started."""
    if batch.timer_started_at is None:
        return None
    started = batch.timer_started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    deadline = started.replace(second=started.second) if False else started
    elapsed = (now - started).total_seconds()
    total = batch.duration_minutes * 60
    remaining = int(total - elapsed)
    return max(remaining, 0)


def _batch_to_timer_response(batch: Batch, now: datetime) -> BatchTimerResponse:
    return BatchTimerResponse(
        batch_id=batch.id,  # type: ignore[arg-type]
        batch_name=batch.name,
        status=batch.status,
        timer_started_at=(
            batch.timer_started_at.replace(tzinfo=timezone.utc).isoformat()
            if batch.timer_started_at and batch.timer_started_at.tzinfo is None
            else (batch.timer_started_at.isoformat() if batch.timer_started_at else None)
        ),
        duration_minutes=batch.duration_minutes,
        server_now_utc=now.isoformat(),
        remaining_seconds=_compute_remaining(batch, now),
    )


# ---------------------------------------------------------------------------
# Contestant endpoint — get timer for current user's batch
# NOTE: In the current phase, a single "default" batch (batch_number=1) is
# used for all contestants.  When Yash's Team/Batch assignment work is merged,
# this endpoint will look up the team's batch_id from the Team model.
# ---------------------------------------------------------------------------
@router.get("/api/batches/my-batch/timer", response_model=BatchTimerResponse)
def get_my_batch_timer(
    session: Session = Depends(get_session),
    _current_user: User = Depends(get_current_user),
) -> BatchTimerResponse:
    """
    Return the live countdown data for the contestant's batch.
    The `server_now_utc` field is the authoritative time reference;
    the client MUST use it — never the browser's local clock.
    """
    now = _utc_now()
    # Phase 1: return the first ACTIVE batch, or the first batch at all as fallback
    batch = session.exec(
        select(Batch).where(Batch.status == BATCH_STATUS_ACTIVE)
    ).first()
    if batch is None:
        # Fall back to the earliest batch regardless of status (pre-start state)
        batch = session.exec(select(Batch).order_by(Batch.batch_number)).first()  # type: ignore[arg-type]
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No batch found. Admin must create a batch first.",
        )
    return _batch_to_timer_response(batch, now)


# ---------------------------------------------------------------------------
# Admin — list all batches
# ---------------------------------------------------------------------------
@router.get("/api/admin/batches", response_model=List[Dict[str, Any]])
def admin_list_batches(
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> List[Dict[str, Any]]:
    now = _utc_now()
    batches = session.exec(select(Batch).order_by(Batch.batch_number)).all()  # type: ignore[arg-type]
    return [
        {
            "id": b.id,
            "batch_number": b.batch_number,
            "name": b.name,
            "status": b.status,
            "timer_started_at": b.timer_started_at.isoformat() if b.timer_started_at else None,
            "duration_minutes": b.duration_minutes,
            "remaining_seconds": _compute_remaining(b, now),
            "server_now_utc": now.isoformat(),
        }
        for b in batches
    ]


# ---------------------------------------------------------------------------
# Admin — create a new batch
# ---------------------------------------------------------------------------
@router.post("/api/admin/batches", status_code=status.HTTP_201_CREATED)
def admin_create_batch(
    body: BatchCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> Dict[str, Any]:
    batch = Batch(
        batch_number=body.batch_number,
        name=body.name,
        duration_minutes=body.duration_minutes,
        status=BATCH_STATUS_NOT_STARTED,
    )
    session.add(batch)
    session.commit()
    session.refresh(batch)
    return {"id": batch.id, "name": batch.name, "message": "Batch created"}


# ---------------------------------------------------------------------------
# Admin — start a batch timer  (POST /api/admin/batches/{batch_id}/start-timer)
# ---------------------------------------------------------------------------
@router.post("/api/admin/batches/{batch_id}/start-timer")
def admin_start_batch_timer(
    batch_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> Dict[str, Any]:
    """
    Triggers the countdown for a specific batch.
    Sets timer_started_at = UTC now and flips status to ACTIVE.
    Idempotent guard: if the batch is already ACTIVE, returns the current state.
    """
    batch = session.get(Batch, batch_id)
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found")
    if batch.status == BATCH_STATUS_ACTIVE:
        now = _utc_now()
        return {
            "message": "Batch timer already running",
            "timer_started_at": batch.timer_started_at.isoformat() if batch.timer_started_at else None,
            "remaining_seconds": _compute_remaining(batch, now),
            "server_now_utc": now.isoformat(),
        }
    if batch.status == BATCH_STATUS_COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Batch has already completed. Create a new batch to run another session.",
        )
    now = _utc_now()
    batch.timer_started_at = now
    batch.status = BATCH_STATUS_ACTIVE
    session.add(batch)
    session.commit()
    session.refresh(batch)
    return {
        "message": f"Timer started for batch '{batch.name}'",
        "batch_id": batch.id,
        "timer_started_at": batch.timer_started_at.isoformat(),  # type: ignore[union-attr]
        "duration_minutes": batch.duration_minutes,
        "server_now_utc": now.isoformat(),
    }
