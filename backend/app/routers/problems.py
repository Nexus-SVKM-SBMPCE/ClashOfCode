"""
Problems router: list problems, get problem details with sample test cases.
Hidden test cases are never serialized in any response.

Batch Lock Guard (Sanchita — Phase 2)
--------------------------------------
Contestants cannot view any problem until the admin has started the timer
for their batch.  When the batch status is NOT_STARTED (or no batch exists),
the endpoint returns HTTP 423 Locked with a structured body:

    { "locked": true, "reason": "Contest has not started yet" }

Admin users bypass the lock entirely so they can inspect problems at any time.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.models import (
    Batch,
    Problem,
    TestCase,
    User,
    BATCH_STATUS_NOT_STARTED,
)

router = APIRouter(prefix="/api/problems", tags=["problems"])


# ---------------------------------------------------------------------------
# Schemas (no hidden fields)
# ---------------------------------------------------------------------------
class SampleTestCase(BaseModel):
    input_data: str
    expected_output: str


class ProblemSummary(BaseModel):
    id: int
    slug: str
    title: str
    difficulty: str
    time_limit_sec: float
    memory_limit_kb: int


class ProblemDetail(ProblemSummary):
    statement: str
    sample_test_cases: List[SampleTestCase]


# ---------------------------------------------------------------------------
# Batch-lock helper
# ---------------------------------------------------------------------------
def _assert_batch_active(session: Session, user: User) -> None:
    """
    Raise HTTP 423 if the current batch has not been started yet.
    Admins are always allowed through — they need to verify problems exist
    before the contest begins.
    """
    if user.role == "admin":
        return  # admins bypass the lock

    now = datetime.now(timezone.utc)

    # Find the first active batch (Phase 1: single batch model)
    batch: Batch | None = session.exec(
        select(Batch).where(Batch.status != BATCH_STATUS_NOT_STARTED)
    ).first()

    if batch is None:
        # No active batch found at all — contest has not been started
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={
                "locked": True,
                "reason": "Contest has not started yet. Please wait for the admin to open the arena.",
            },
        )

    # Edge case: timer_started_at might be in the future (shouldn't happen with
    # the current admin endpoint, but guard anyway)
    if batch.timer_started_at is not None:
        started = batch.timer_started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        if now < started:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail={
                    "locked": True,
                    "reason": "Contest has not started yet. Please wait for the admin to open the arena.",
                },
            )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("", response_model=List[ProblemSummary])
def list_problems(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> List[ProblemSummary]:
    _assert_batch_active(session, current_user)

    problems = session.exec(
        select(Problem).where(Problem.is_visible == True)  # noqa: E712
    ).all()
    return [
        ProblemSummary(
            id=p.id,
            slug=p.slug,
            title=p.title,
            difficulty=p.difficulty,
            time_limit_sec=p.time_limit_sec,
            memory_limit_kb=p.memory_limit_kb,
        )
        for p in problems
    ]


@router.get("/{slug}", response_model=ProblemDetail)
def get_problem(
    slug: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ProblemDetail:
    _assert_batch_active(session, current_user)

    prob = session.exec(
        select(Problem).where(Problem.slug == slug, Problem.is_visible == True)  # noqa: E712
    ).first()
    if not prob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")

    samples = session.exec(
        select(TestCase).where(
            TestCase.problem_id == prob.id,
            TestCase.is_sample == True,  # noqa: E712
        )
    ).all()

    return ProblemDetail(
        id=prob.id,
        slug=prob.slug,
        title=prob.title,
        difficulty=prob.difficulty,
        time_limit_sec=prob.time_limit_sec,
        memory_limit_kb=prob.memory_limit_kb,
        statement=prob.statement,
        sample_test_cases=[
            SampleTestCase(input_data=tc.input_data, expected_output=tc.expected_output)
            for tc in samples
        ],
    )
