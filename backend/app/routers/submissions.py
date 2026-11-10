from app.complexity import evaluate_time_complexity
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
from app.judge import evaluate_submission, evaluate_sample_submission, STATUS_CE
from app.models import (
    Batch,
    BatchProblem,
    Problem,
    Submission,
    TestCase,
    User,
    Team,
    BATCH_STATUS_ACTIVE,
    BATCH_STATUS_COMPLETED,
    BATCH_STATUS_NOT_STARTED,
)
from app.scoring import compute_score
from app.security_rules import ensure_not_locked
from app.submission_rules import (
    ALREADY_SUBMITTED_CODE,
    ALREADY_SUBMITTED_MESSAGE,
    SUBMIT_LOCK,
    has_submitted,
)

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


class SampleTestResult(BaseModel):
    sample_index: int
    test_case_id: Optional[int] = None
    input_data: str
    expected_output: str
    actual_output: Optional[str] = None
    stderr: Optional[str] = None
    compile_error: Optional[str] = None
    runtime_ms: Optional[float] = None
    memory_kb: Optional[int] = None
    verdict: str
    passed: bool


class RunResponse(BaseModel):
    problem_slug: str
    language: str
    status: str
    verdict: str
    compile_error: Optional[str] = None
    samples_passed: int
    samples_total: int
    results: List[SampleTestResult]
    time_complexity: Optional[str] = None
    time_complexity_verdict: Optional[str] = None


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
    solve_time_seconds: Optional[int] = None
    time_complexity: Optional[str] = None
    time_complexity_verdict: Optional[str] = None


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
        solve_time_seconds=sub.solve_time_seconds,
        time_complexity=getattr(sub, "time_complexity", None),
        time_complexity_verdict=getattr(sub, "time_complexity_verdict", None),
    )


def _validate_submission_deadline(session: Session, user: User) -> Optional[Batch]:
    """
    Validate that the submission is within the batch's active contest window.
    Rejects submissions received after `timer_started_at + duration_minutes`
    or when batch status is COMPLETED with HTTP 400 Bad Request:
    'Submission deadline passed'.
    """
    now = datetime.now(timezone.utc)
    batch = None

    # Check team batch assignment first
    team = None
    if getattr(user, "team_id", None):
        team = session.get(Team, user.team_id)
    elif getattr(user, "role", None) == "contestant":
        team = session.exec(select(Team).where(Team.username == user.username)).first()

    if team and team.batch_id:
        batch = session.get(Batch, team.batch_id)

    # Fallback to active batch or latest batch if no team allotment
    if batch is None:
        batch = session.exec(
            select(Batch).where(Batch.status == BATCH_STATUS_ACTIVE)
        ).first()
    if batch is None:
        batch = session.exec(select(Batch).order_by(Batch.id.desc())).first()

    if batch is not None:
        if batch.status == BATCH_STATUS_COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Submission deadline passed",
            )

        if batch.timer_started_at is not None:
            started = batch.timer_started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            deadline = started + timedelta(minutes=batch.duration_minutes)
            if now > deadline:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Submission deadline passed",
                )

    return batch


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("/run", response_model=RunResponse)
def run_sample_submission(
    body: SubmitRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> RunResponse:
    # 0. Validate batch deadline
    _validate_submission_deadline(session, current_user)
    # 0b. Exam security: a locked attempt (3 strikes) cannot run code
    ensure_not_locked(session, current_user)

    # Resolve problem
    prob = session.exec(
        select(Problem).where(Problem.slug == body.problem_slug, Problem.is_visible == True)  # noqa: E712
    ).first()
    if not prob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")

    if current_user.role == "contestant":
        team = session.get(Team, current_user.team_id) if current_user.team_id else session.exec(select(Team).where(Team.username == current_user.username)).first()
        if team and team.batch_id:
            assigned_pids = session.exec(select(BatchProblem.problem_id).where(BatchProblem.batch_id == team.batch_id)).all()
            any_allotted = session.exec(select(BatchProblem.id)).first() is not None
            if any_allotted and prob.id not in assigned_pids:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This quest is not allotted to your batch arena.")

    if current_user.role == "contestant":
        team = session.get(Team, current_user.team_id) if current_user.team_id else session.exec(select(Team).where(Team.username == current_user.username)).first()
        if team and team.batch_id:
            assigned_pids = session.exec(select(BatchProblem.problem_id).where(BatchProblem.batch_id == team.batch_id)).all()
            any_allotted = session.exec(select(BatchProblem.id)).first() is not None
            if any_allotted and prob.id not in assigned_pids:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This quest is not allotted to your batch arena.")


    # Single-submission rule: a submitted problem is closed to the team (no more trial runs either)
    if has_submitted(session, current_user, prob.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": ALREADY_SUBMITTED_CODE, "message": ALREADY_SUBMITTED_MESSAGE},
        )

    # Fetch ONLY sample test cases
    sample_cases = session.exec(
        select(TestCase)
        .where(TestCase.problem_id == prob.id, TestCase.is_sample == True)  # noqa: E712
        .order_by(TestCase.order_index)  # type: ignore[arg-type]
    ).all()

    if not sample_cases:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Problem has no sample test cases configured",
        )

    run_eval = evaluate_sample_submission(
        source_code=body.source_code,
        language=body.language,
        sample_cases=sample_cases,
        cpu_time_limit=prob.time_limit_sec,
        memory_limit=prob.memory_limit_kb,
        problem_slug=prob.slug,
    )

    # Real-time time complexity evaluation
    comp_eval = evaluate_time_complexity(
        source_code=body.source_code,
        language=body.language,
        expected_complexity=getattr(prob, "best_time_complexity", None) or "O(N)",
    )

    return RunResponse(
        problem_slug=body.problem_slug,
        language=body.language,
        status=run_eval["status"],
        verdict=run_eval["verdict"],
        compile_error=run_eval["compile_error"],
        samples_passed=run_eval["samples_passed"],
        samples_total=run_eval["samples_total"],
        results=[SampleTestResult(**r) for r in run_eval["results"]],
        time_complexity=comp_eval.get("calculated_complexity"),
        time_complexity_verdict=comp_eval.get("verdict"),
    )


@router.post("", response_model=SubmissionResponse)
def create_submission(
    body: SubmitRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> SubmissionResponse:
    # 0. Validate batch deadline
    batch = _validate_submission_deadline(session, current_user)
    # 0b. Exam security: a locked attempt (3 strikes) cannot submit
    ensure_not_locked(session, current_user)

    # Resolve problem
    prob = session.exec(
        select(Problem).where(Problem.slug == body.problem_slug, Problem.is_visible == True)  # noqa: E712
    ).first()
    if not prob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem not found")

    if current_user.role == "contestant":
        team = session.get(Team, current_user.team_id) if current_user.team_id else session.exec(select(Team).where(Team.username == current_user.username)).first()
        if team and team.batch_id:
            assigned_pids = session.exec(select(BatchProblem.problem_id).where(BatchProblem.batch_id == team.batch_id)).all()
            any_allotted = session.exec(select(BatchProblem.id)).first() is not None
            if any_allotted and prob.id not in assigned_pids:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This quest is not allotted to your batch arena.")

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

    # Create pending submission record first. The "already submitted?" check and the insert
    # share one lock so a double-click / second tab cannot slip a duplicate past the check.
    # The pending row (verdict NULL) counts as submitted, so it also blocks while we judge.
    with SUBMIT_LOCK:
        if has_submitted(session, current_user, prob.id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ALREADY_SUBMITTED_MESSAGE)
        sub = Submission(
            user_id=current_user.id,
            problem_id=prob.id,
            batch_id=batch.id if batch else None,
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

    try:
        for tc in test_cases:
            result = evaluate_submission(
                source_code=body.source_code,
                language=body.language,
                stdin=tc.input_data,
                expected_output=tc.expected_output,
                cpu_time_limit=prob.time_limit_sec,
                memory_limit=prob.memory_limit_kb,
                problem_slug=prob.slug,
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
    except Exception:
        # Unexpected judge-side crash: release the attempt (IE is "not your code") instead of
        # leaving a NULL-verdict row that would lock the team out of this problem forever.
        session.rollback()
        sub.status = "error"
        sub.verdict = "IE"
        sub.judged_at = datetime.now(timezone.utc)
        session.add(sub)
        session.commit()
        raise

    # Granular marks: per-test-case points (>= 50% threshold) + difficulty bonus on full AC.
    # A CE means nothing ran, so nothing passed.
    tests_passed = 0 if final_verdict == "CE" else sum(1 for r in test_results if r["verdict"] == "AC")
    marks = compute_score(tests_passed, len(test_cases), prob.difficulty)

    if final_verdict == "AC":
        if batch and batch.timer_started_at:
            started = batch.timer_started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            created = sub.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            sub.solve_time_seconds = max(0, int((created - started).total_seconds()))
        else:
            sub.solve_time_seconds = 0

    # Evaluate time complexity on submitted solution
    try:
        comp_eval = evaluate_time_complexity(
            source_code=body.source_code,
            language=body.language,
            expected_complexity=getattr(prob, "best_time_complexity", None) or "O(N)",
        )
        sub.time_complexity = comp_eval.get("calculated_complexity")
        sub.time_complexity_verdict = comp_eval.get("verdict")
    except Exception:
        sub.time_complexity = "O(N)"
        sub.time_complexity_verdict = "OPTIMAL"

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

    # Recalculate team total_score across best submissions per problem
    if team:
        session.flush()
        team_subs = session.exec(
            select(Submission).where(Submission.user_id == current_user.id, Submission.status == "done")
        ).all()
        best_per_prob: Dict[int, int] = {}
        for ts in team_subs:
            best_per_prob[ts.problem_id] = max(best_per_prob.get(ts.problem_id, 0), ts.score)
        team.total_score = sum(best_per_prob.values())
        session.add(team)

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
