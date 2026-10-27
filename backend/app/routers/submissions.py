"""
Submissions router:
  POST /api/submissions          — evaluate all hidden tests, compute final verdict
  GET  /api/submissions/{id}     — get one submission (owner or admin)
  GET  /api/submissions          — list own submissions (admin sees all)
  GET  /api/submissions/stats    — live arena counters (total, AC today, active teams)
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select, func

from app.auth import get_current_user
from app.config import SUPPORTED_LANGUAGES
from app.database import get_session
from app.judge import evaluate_submission, STATUS_CE
from app.models import Problem, Submission, TestCase, User
from app.scoring import compute_score

router = APIRouter(prefix="/api/submissions", tags=["submissions"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class SubmitRequest(BaseModel):
    problem_slug: str
    language: str
    source_code: str

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        if v not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Language must be one of: {SUPPORTED_LANGUAGES}")
        return v

    @field_validator("source_code")
    @classmethod
    def validate_source(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Source code cannot be empty")
        if len(v) > 65_536:
            raise ValueError("Source code exceeds 64 KB limit")
        return v


class SubmissionResponse(BaseModel):
    id: int
    problem_slug: str
    language: str
    status: str
    verdict: Optional[str]
    score: int
    test_score: int = 0
    bonus_points: int = 0
    tests_passed: int = 0
    tests_total: int = 0
    runtime_ms: Optional[float]
    memory_kb: Optional[int]
    compile_error: Optional[str]    # only for CE on own submission
    created_at: str
    judged_at: Optional[str]


def _to_response(sub: Submission, problem_slug: str, include_ce: bool = True) -> SubmissionResponse:
    return SubmissionResponse(
        id=sub.id,
        problem_slug=problem_slug,
        language=sub.language,
        status=sub.status,
        verdict=sub.verdict,
        score=sub.score,
        test_score=sub.test_score or 0,
        bonus_points=sub.bonus_points or 0,
        tests_passed=sub.tests_passed or 0,
        tests_total=sub.tests_total or 0,
        runtime_ms=sub.runtime_ms,
        memory_kb=sub.memory_kb,
        compile_error=sub.compile_error if include_ce else None,
        created_at=sub.created_at.isoformat(),
        judged_at=sub.judged_at.isoformat() if sub.judged_at else None,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("", response_model=SubmissionResponse)
def create_submission(
    body: SubmitRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> SubmissionResponse:
    # Resolve problem
    prob = session.exec(
        select(Problem).where(Problem.slug == body.problem_slug, Problem.is_visible == True)  # noqa: E712
    ).first()
    if not prob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")

    # Fetch all test cases (hidden + sample), ordered
    test_cases = session.exec(
        select(TestCase)
        .where(TestCase.problem_id == prob.id)
        .order_by(TestCase.order_index)  # type: ignore[arg-type]
    ).all()
    if not test_cases:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Problem has no test cases configured",
        )

    # Create pending submission record first
    sub = Submission(
        user_id=current_user.id,
        problem_id=prob.id,
        language=body.language,
        source_code=body.source_code,
        status="judging",
    )
    session.add(sub)
    session.commit()
    session.refresh(sub)

    # ---------------------------------------------------------------------------
    # Evaluate against all test cases
    # ---------------------------------------------------------------------------
    test_results = []
    final_verdict = "AC"
    worst_runtime: float = 0.0
    worst_memory: int = 0
    compile_error_text: Optional[str] = None

    for tc in test_cases:
        result = evaluate_submission(
            source_code=body.source_code,
            language=body.language,
            stdin=tc.input_data,
            expected_output=tc.expected_output,
            cpu_time_limit=prob.time_limit_sec,
            memory_limit=prob.memory_limit_kb,
        )

        verdict = result["verdict"]
        runtime = result["runtime_ms"] or 0.0
        memory  = result["memory_kb"] or 0

        worst_runtime = max(worst_runtime, runtime)
        worst_memory  = max(worst_memory, memory)

        # CE short-circuits: record and break
        if verdict == "CE":
            compile_error_text = result["compile_error"]
            final_verdict = "CE"
            test_results.append({
                "test_case_id": tc.id,
                "is_sample": tc.is_sample,
                "verdict": "CE",
            })
            break

        test_results.append({
            "test_case_id": tc.id,
            "is_sample": tc.is_sample,
            "verdict": verdict,
        })

        # IE = judge unreachable/broken: remaining tests would fail the same way, so stop early
        if verdict == "IE":
            final_verdict = "IE"
            break

        # First non-AC verdict wins (order: CE > TLE > MLE > RE > WA)
        if final_verdict == "AC" and verdict != "AC":
            final_verdict = verdict

    # Granular marks: per-test-case points (>= 50% threshold) + difficulty bonus on full AC.
    # A CE means nothing ran, so nothing passed.
    tests_passed = 0 if final_verdict == "CE" else sum(1 for r in test_results if r["verdict"] == "AC")
    marks = compute_score(tests_passed, len(test_cases), prob.difficulty)

    # Persist results
    sub.status       = "done"
    sub.verdict      = final_verdict
    sub.score        = marks["score"]
    sub.test_score   = marks["test_score"]
    sub.bonus_points = marks["bonus_points"]
    sub.tests_passed = tests_passed
    sub.tests_total  = len(test_cases)
    sub.runtime_ms   = worst_runtime if worst_runtime > 0 else None
    sub.memory_kb    = worst_memory  if worst_memory  > 0 else None
    sub.compile_error = compile_error_text
    sub.test_results = json.dumps(test_results)
    sub.judged_at    = datetime.now(timezone.utc)
    session.add(sub)
    session.commit()
    session.refresh(sub)

    return _to_response(sub, body.problem_slug)


@router.get("", response_model=List[SubmissionResponse])
def list_submissions(
    problem_slug: Optional[str] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> List[SubmissionResponse]:
    query = select(Submission, Problem).join(Problem, Submission.problem_id == Problem.id)  # type: ignore[call-overload]

    if current_user.role != "admin":
        query = query.where(Submission.user_id == current_user.id)

    if problem_slug:
        query = query.where(Problem.slug == problem_slug)

    query = query.order_by(Submission.created_at.desc())  # type: ignore[union-attr]
    rows = session.exec(query).all()

    return [
        _to_response(sub, prob.slug, include_ce=(sub.user_id == current_user.id or current_user.role == "admin"))
        for sub, prob in rows
    ]


class SubmissionStats(BaseModel):
    total_submissions: int
    accepted_today: int
    active_teams: int
    server_time: str


@router.get("/stats", response_model=SubmissionStats)
def submission_stats(
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> SubmissionStats:
    """Arena-wide counters for the navbar. Aggregates only — no per-team data leaks."""
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    active_since = now - timedelta(minutes=15)

    total = session.exec(select(func.count(Submission.id))).one()
    accepted_today = session.exec(
        select(func.count(Submission.id)).where(
            Submission.verdict == "AC", Submission.created_at >= day_start
        )
    ).one()
    active = session.exec(
        select(func.count(func.distinct(Submission.user_id))).where(
            Submission.created_at >= active_since
        )
    ).one()
    return SubmissionStats(
        total_submissions=total,
        accepted_today=accepted_today,
        active_teams=active,
        server_time=now.isoformat(),
    )


@router.get("/{submission_id}", response_model=SubmissionResponse)
def get_submission(
    submission_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> SubmissionResponse:
    row = session.exec(
        select(Submission, Problem).join(Problem, Submission.problem_id == Problem.id)  # type: ignore[call-overload]
        .where(Submission.id == submission_id)
    ).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    sub, prob = row
    if sub.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    include_ce = sub.user_id == current_user.id or current_user.role == "admin"
    return _to_response(sub, prob.slug, include_ce=include_ce)
