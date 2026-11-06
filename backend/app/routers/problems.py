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
from typing import Any, Dict, List, Optional

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
    Team,
    BatchProblem,
    BATCH_STATUS_NOT_STARTED,
)

from app.submission_rules import (
    ALREADY_SUBMITTED_CODE,
    ALREADY_SUBMITTED_MESSAGE,
    has_submitted,
    submitted_problem_ids,
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
    best_time_complexity: Optional[str] = 'O(N)'


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
    batch_id: Optional[int] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> List[ProblemSummary]:
    _assert_batch_active(session, current_user)

    target_batch_id = batch_id
    if current_user.role == "contestant":
        team = None
        if current_user.team_id:
            team = session.get(Team, current_user.team_id)
        else:
            team = session.exec(select(Team).where(Team.username == current_user.username)).first()
        if team and team.batch_id:
            target_batch_id = team.batch_id

    query = select(Problem).where(Problem.is_visible == True)  # noqa: E712
    if target_batch_id is not None:
        assigned_pids = session.exec(
            select(BatchProblem.problem_id).where(BatchProblem.batch_id == target_batch_id)
        ).all()
        if assigned_pids:
            query = query.where(Problem.id.in_(assigned_pids))

    # Single-submission rule: a problem the team already submitted is hidden from them
    submitted = submitted_problem_ids(session, current_user)
    if submitted:
        query = query.where(Problem.id.not_in(submitted))  # type: ignore[union-attr]

    problems = session.exec(query).all()
    return [
        ProblemSummary(
            id=p.id,
            slug=p.slug,
            title=p.title,
            difficulty=p.difficulty,
            time_limit_sec=p.time_limit_sec,
            memory_limit_kb=p.memory_limit_kb,
            best_time_complexity=getattr(p, "best_time_complexity", None) or "O(N)",
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

    if current_user.role == "contestant":
        team = None
        if current_user.team_id:
            team = session.get(Team, current_user.team_id)
        else:
            team = session.exec(select(Team).where(Team.username == current_user.username)).first()
        if team and team.batch_id:
            assigned_pids = session.exec(
                select(BatchProblem.problem_id).where(BatchProblem.batch_id == team.batch_id)
            ).all()
            if assigned_pids and prob.id not in assigned_pids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This quest is not allotted to your batch arena.",
                )

    # Single-submission rule: once submitted, the briefing is closed to the team
    if has_submitted(session, current_user, prob.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": ALREADY_SUBMITTED_CODE, "message": ALREADY_SUBMITTED_MESSAGE},
        )

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
