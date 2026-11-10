"""
Admin router: problem CRUD, test case management, user listing.
All endpoints require role == "admin".
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select

from app.auth import require_admin
from app.database import get_session
from app.models import Problem, TestCase, User, Team, Batch, BatchProblem, Submission

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ProblemCreate(BaseModel):
    slug: str
    title: str
    statement: str
    difficulty: str = "medium"
    best_time_complexity: str = "O(N)"
    time_limit_sec: float = 2.0
    memory_limit_kb: int = 262144

    @field_validator("difficulty")
    @classmethod
    def valid_diff(cls, v: str) -> str:
        if v not in ("easy", "medium", "hard"):
            raise ValueError("difficulty must be easy, medium, or hard")
        return v

    @field_validator("time_limit_sec")
    @classmethod
    def valid_time(cls, v: float) -> float:
        if not (0.5 <= v <= 10.0):
            raise ValueError("time_limit_sec must be between 0.5 and 10.0")
        return v

    @field_validator("memory_limit_kb")
    @classmethod
    def valid_mem(cls, v: int) -> int:
        if not (16384 <= v <= 2097152):
            raise ValueError("memory_limit_kb must be between 16 MB and 2 GB")
        return v


class ProblemUpdate(BaseModel):
    title: Optional[str] = None
    statement: Optional[str] = None
    difficulty: Optional[str] = None
    best_time_complexity: Optional[str] = None
    time_limit_sec: Optional[float] = None
    memory_limit_kb: Optional[int] = None
    is_visible: Optional[bool] = None


class TestCaseCreate(BaseModel):
    input_data: str
    expected_output: str
    is_sample: bool = False
    order_index: int = 0


# ---------------------------------------------------------------------------
# Problem Endpoints
# ---------------------------------------------------------------------------
@router.get("/problems")
def admin_list_problems(
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> List[Dict[str, Any]]:
    problems = session.exec(select(Problem)).all()
    return [
        {
            "id": p.id, "slug": p.slug, "title": p.title,
            "difficulty": p.difficulty, "is_visible": p.is_visible,
            "best_time_complexity": getattr(p, "best_time_complexity", None) or "O(N)",
            "time_limit_sec": p.time_limit_sec, "memory_limit_kb": p.memory_limit_kb,
            "test_case_count": session.exec(
                select(TestCase).where(TestCase.problem_id == p.id)
            ).all().__len__(),
        }
        for p in problems
    ]


@router.post("/problems", status_code=status.HTTP_201_CREATED)
def admin_create_problem(
    body: ProblemCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> Dict[str, Any]:
    exists = session.exec(select(Problem).where(Problem.slug == body.slug)).first()
    if exists:
        raise HTTPException(status_code=400, detail=f"Problem slug '{body.slug}' already exists")
    prob = Problem(**body.model_dump())
    session.add(prob)
    session.commit()
    session.refresh(prob)
    return {"id": prob.id, "slug": prob.slug, "message": "Problem created"}


@router.patch("/problems/{problem_id}")
def admin_update_problem(
    problem_id: int,
    body: ProblemUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> Dict[str, Any]:
    prob = session.get(Problem, problem_id)
    if not prob:
        raise HTTPException(status_code=404, detail="Problem not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(prob, field, value)
    session.add(prob)
    session.commit()
    return {"message": "Problem updated"}


@router.delete("/problems/{problem_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_problem(
    problem_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> None:
    prob = session.get(Problem, problem_id)
    if not prob:
        raise HTTPException(status_code=404, detail="Problem not found")
    # Delete associated test cases first
    for tc in session.exec(select(TestCase).where(TestCase.problem_id == problem_id)).all():
        session.delete(tc)
    session.delete(prob)
    session.commit()


# ---------------------------------------------------------------------------
# Test Case Endpoints
# ---------------------------------------------------------------------------
@router.get("/problems/{problem_id}/testcases")
def admin_list_testcases(
    problem_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> List[Dict[str, Any]]:
    tcs = session.exec(
        select(TestCase).where(TestCase.problem_id == problem_id).order_by(TestCase.order_index)  # type: ignore[arg-type]
    ).all()
    return [
        {
            "id": tc.id, "order_index": tc.order_index,
            "is_sample": tc.is_sample,
            "input_data": tc.input_data,
            "expected_output": tc.expected_output,
        }
        for tc in tcs
    ]


@router.post("/problems/{problem_id}/testcases", status_code=status.HTTP_201_CREATED)
def admin_add_testcase(
    problem_id: int,
    body: TestCaseCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> Dict[str, Any]:
    prob = session.get(Problem, problem_id)
    if not prob:
        raise HTTPException(status_code=404, detail="Problem not found")
    tc = TestCase(problem_id=problem_id, **body.model_dump())
    session.add(tc)
    session.commit()
    session.refresh(tc)
    return {"id": tc.id, "message": "Test case added"}


@router.delete("/problems/{problem_id}/testcases/{tc_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_testcase(
    problem_id: int,
    tc_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> None:
    tc = session.get(TestCase, tc_id)
    if not tc or tc.problem_id != problem_id:
        raise HTTPException(status_code=404, detail="Test case not found")
    session.delete(tc)
    session.commit()


# ---------------------------------------------------------------------------
# User listing (admin only)
# ---------------------------------------------------------------------------
@router.get("/users")
def admin_list_users(
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> List[Dict[str, Any]]:
    users = session.exec(select(User)).all()
    return [
        {
            "id": u.id, "username": u.username,
            "display_name": u.display_name,
            "role": u.role, "is_active": u.is_active,
        }
        for u in users
    ]


class AssignBatchRequest(BaseModel):
    batch_id: Optional[int] = None


class AllotBatchesRequest(BaseModel):
    teams_per_batch: Optional[int] = None
    batch_ids: Optional[List[int]] = None


# ---------------------------------------------------------------------------
# Team Management & Batch Allotment (admin only)
# ---------------------------------------------------------------------------
@router.get("/teams")
def admin_list_teams(
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> List[Dict[str, Any]]:
    teams = session.exec(select(Team)).all()
    batches = {b.id: b for b in session.exec(select(Batch)).all()}
    return [
        {
            "id": t.id,
            "name": t.name,
            "username": t.username,
            "leader_name": t.leader_name,
            "leader_email": t.leader_email,
            "members_info": t.members_info,
            "batch_id": t.batch_id,
            "batch_name": batches[t.batch_id].name if t.batch_id in batches else None,
            "total_score": t.total_score,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in teams
    ]


@router.get("/teams/{team_id}/dossier")
def admin_get_team_dossier(
    team_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> Dict[str, Any]:
    team = session.get(Team, team_id)
    if not team:
        # Fallback if team_id matches a user id
        user_candidate = session.get(User, team_id)
        if user_candidate and user_candidate.team_id:
            team = session.get(Team, user_candidate.team_id)
        elif user_candidate:
            team = session.exec(select(Team).where(Team.username == user_candidate.username)).first()

    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    batch = session.get(Batch, team.batch_id) if team.batch_id else None
    user = session.exec(select(User).where((User.team_id == team.id) | (User.username == team.username))).first()
    user_id = user.id if user else None

    problems = {p.id: p for p in session.exec(select(Problem)).all()}

    subs = session.exec(
        select(Submission)
        .where(Submission.user_id == user_id)
        .order_by(Submission.created_at.desc())  # type: ignore[attr-defined]
    ).all() if user_id else []

    fs_count = team.fullscreen_exit_count or 0
    tab_count = team.tab_switch_count or 0
    if fs_count >= 2 or tab_count >= 5:
        integrity_status = "FLAGGED"
    elif fs_count >= 1 or tab_count >= 2:
        integrity_status = "CAUTION"
    else:
        integrity_status = "CLEAN"

    lock_status = "ACTIVE"
    locked_at = None
    try:
        from app.models import ContestSecurityState
        if user_id and team.batch_id:
            cstate = session.exec(
                select(ContestSecurityState).where(
                    ContestSecurityState.user_id == user_id,
                    ContestSecurityState.batch_id == team.batch_id,
                )
            ).first()
            if cstate:
                lock_status = cstate.status
                locked_at = cstate.locked_at.isoformat() if cstate.locked_at else None
    except Exception:
        pass

    # Group by problem to show each problem's best or latest solution and complexity
    problem_cards = []
    grouped: Dict[int, List[Submission]] = {}
    for s in subs:
        grouped.setdefault(s.problem_id, []).append(s)

    for pid, psubs in grouped.items():
        prob = problems.get(pid)
        best_sub = next((s for s in psubs if s.verdict == "AC"), None)
        if not best_sub:
            best_sub = max(psubs, key=lambda s: s.score)

        problem_cards.append({
            "problem_id": pid,
            "problem_title": prob.title if prob else f"Problem #{pid}",
            "problem_slug": prob.slug if prob else "",
            "difficulty": prob.difficulty if prob else "medium",
            "best_expected_complexity": getattr(prob, "best_time_complexity", None) or "O(N)",
            "latest_submission_id": best_sub.id,
            "verdict": best_sub.verdict or "PENDING",
            "score": best_sub.score,
            "test_score": best_sub.test_score,
            "bonus_points": best_sub.bonus_points,
            "tests_passed": best_sub.tests_passed,
            "tests_total": best_sub.tests_total,
            "language": best_sub.language,
            "runtime_ms": best_sub.runtime_ms,
            "memory_kb": best_sub.memory_kb,
            "solve_time_seconds": best_sub.solve_time_seconds,
            "time_complexity": getattr(best_sub, "time_complexity", None) or "—",
            "time_complexity_verdict": getattr(best_sub, "time_complexity_verdict", None) or "UNKNOWN",
            "total_attempts": len(psubs),
            "created_at": best_sub.created_at.isoformat() if best_sub.created_at else None,
        })

    problem_cards.sort(key=lambda x: (x["verdict"] != "AC", x["problem_title"]))

    return {
        "team": {
            "id": team.id,
            "name": team.name,
            "username": team.username,
            "leader_name": team.leader_name,
            "leader_email": team.leader_email,
            "members_info": team.members_info,
            "batch_id": team.batch_id,
            "batch_name": batch.name if batch else "Unassigned",
            "batch_status": batch.status if batch else "NOT_STARTED",
            "total_score": team.total_score,
            "last_active_at": team.last_active_at.isoformat() if team.last_active_at else None,
            "created_at": team.created_at.isoformat() if team.created_at else None,
        },
        "security": {
            "integrity_status": integrity_status,
            "tab_switch_count": tab_count,
            "fullscreen_exit_count": fs_count,
            "lock_status": lock_status,
            "locked_at": locked_at,
        },
        "submissions_count": len(subs),
        "solved_count": sum(1 for c in problem_cards if c["verdict"] == "AC"),
        "problems": problem_cards,
    }


@router.post("/teams/{team_id}/assign-batch")
def admin_assign_team_batch(
    team_id: int,
    body: AssignBatchRequest,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> Dict[str, Any]:
    team = session.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    if body.batch_id is not None:
        batch = session.get(Batch, body.batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")

    team.batch_id = body.batch_id
    session.add(team)

    # Sync User record
    user = session.exec(select(User).where(User.username == team.username)).first()
    if user:
        user.team_id = team.id
        session.add(user)

    session.commit()
    session.refresh(team)

    batch_obj = session.get(Batch, team.batch_id) if team.batch_id else None
    return {
        "message": f"Team {team.name} assigned to batch {batch_obj.name if batch_obj else 'None'}",
        "team_id": team.id,
        "batch_id": team.batch_id,
        "batch_name": batch_obj.name if batch_obj else None,
    }


@router.post("/batches/allot")
def admin_allot_batches(
    body: Optional[AllotBatchesRequest] = None,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> Dict[str, Any]:
    """
    Allot teams into N batches of X teams.
    If teams_per_batch is provided, packs teams up to that limit per batch.
    Otherwise distributes teams evenly across the batches.
    """
    req = body or AllotBatchesRequest()
    if req.batch_ids:
        batches = session.exec(select(Batch).where(Batch.id.in_(req.batch_ids)).order_by(Batch.batch_number)).all()  # type: ignore[attr-defined]
    else:
        batches = session.exec(select(Batch).order_by(Batch.batch_number)).all()

    if not batches:
        raise HTTPException(status_code=400, detail="No batches available for allotment")

    teams = session.exec(select(Team).order_by(Team.id)).all()
    if not teams:
        return {"message": "No teams registered to allot", "allotted_count": 0}

    teams_per_batch = req.teams_per_batch

    allotments: Dict[int, List[str]] = {b.id: [] for b in batches}  # type: ignore[misc]

    if teams_per_batch and teams_per_batch > 0:
        # Pack up to X teams per batch
        batch_idx = 0
        for team in teams:
            cur_batch = batches[batch_idx]
            team.batch_id = cur_batch.id
            session.add(team)
            allotments[cur_batch.id].append(team.name)  # type: ignore[index]
            if len(allotments[cur_batch.id]) >= teams_per_batch and batch_idx + 1 < len(batches):  # type: ignore[index]
                batch_idx += 1
    else:
        # Distribute round-robin evenly across N batches
        for i, team in enumerate(teams):
            target_batch = batches[i % len(batches)]
            team.batch_id = target_batch.id
            session.add(team)
            allotments[target_batch.id].append(team.name)  # type: ignore[index]

    # Sync User records
    for team in teams:
        user = session.exec(select(User).where(User.username == team.username)).first()
        if user:
            user.team_id = team.id
            session.add(user)

    session.commit()

    return {
        "message": f"Successfully allotted {len(teams)} teams across {len(batches)} batches",
        "allotted_count": len(teams),
        "batches": [
            {
                "batch_id": b.id,
                "batch_name": b.name,
                "teams_count": len(allotments.get(b.id, [])),  # type: ignore[arg-type]
                "teams": allotments.get(b.id, []),  # type: ignore[arg-type]
            }
            for b in batches
        ],
    }
class SetBatchProblemsRequest(BaseModel):
    problem_ids: List[int]


class AllotProblemsRequest(BaseModel):
    problems_per_batch: Optional[int] = None


@router.get("/batches/{batch_id}/problems")
def admin_get_batch_problems(
    batch_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> List[Dict[str, Any]]:
    batch = session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    all_problems = session.exec(select(Problem).order_by(Problem.id)).all()
    assigned = session.exec(
        select(BatchProblem.problem_id).where(BatchProblem.batch_id == batch_id)
    ).all()
    assigned_set = set(assigned)
    return [
        {
            "id": p.id,
            "slug": p.slug,
            "title": p.title,
            "difficulty": p.difficulty,
            "best_time_complexity": getattr(p, "best_time_complexity", None) or "O(N)",
            "is_assigned": p.id in assigned_set,
        }
        for p in all_problems
    ]


@router.post("/batches/{batch_id}/problems")
def admin_set_batch_problems(
    batch_id: int,
    body: SetBatchProblemsRequest,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> Dict[str, Any]:
    batch = session.get(Batch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    existing = session.exec(select(BatchProblem).where(BatchProblem.batch_id == batch_id)).all()
    for row in existing:
        session.delete(row)

    for pid in body.problem_ids:
        prob = session.get(Problem, pid)
        if prob:
            session.add(BatchProblem(batch_id=batch_id, problem_id=pid))

    session.commit()
    return {
        "message": f"Successfully updated questions for {batch.name}",
        "batch_id": batch_id,
        "problem_ids": body.problem_ids,
    }


@router.post("/batches/allot-problems")
def admin_auto_allot_problems(
    body: Optional[AllotProblemsRequest] = None,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> Dict[str, Any]:
    batches = session.exec(select(Batch).order_by(Batch.batch_number)).all()
    if not batches:
        raise HTTPException(status_code=400, detail="No batches available")
    problems = session.exec(select(Problem).where(Problem.is_visible == True).order_by(Problem.id)).all()
    if not problems:
        raise HTTPException(status_code=400, detail="No problems available")

    all_existing = session.exec(select(BatchProblem)).all()
    for row in all_existing:
        session.delete(row)

    per_batch = body.problems_per_batch if body and body.problems_per_batch else 0
    summary: Dict[str, List[str]] = {}

    if per_batch > 0:
        for idx, b in enumerate(batches):
            start_idx = (idx * per_batch) % len(problems)
            batch_probs = [problems[(start_idx + i) % len(problems)] for i in range(min(per_batch, len(problems)))]
            for p in batch_probs:
                session.add(BatchProblem(batch_id=b.id, problem_id=p.id))  # type: ignore[arg-type]
            summary[b.name] = [p.title for p in batch_probs]
    else:
        for idx, p in enumerate(problems):
            target_batch = batches[idx % len(batches)]
            session.add(BatchProblem(batch_id=target_batch.id, problem_id=p.id))  # type: ignore[arg-type]
            summary.setdefault(target_batch.name, []).append(p.title)

    session.commit()
    return {
        "message": "Questions successfully allotted across batches",
        "batches": summary,
    }


class BatchCreate(BaseModel):
    batch_number: int
    name: str
    duration_minutes: int = 60


@router.post("/batches", status_code=status.HTTP_201_CREATED)
def admin_create_batch(
    body: BatchCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
) -> Dict[str, Any]:
    exists = session.exec(select(Batch).where(Batch.batch_number == body.batch_number)).first()
    if exists:
        raise HTTPException(status_code=400, detail=f"Batch number {body.batch_number} already exists")
    batch = Batch(
        batch_number=body.batch_number,
        name=body.name,
        duration_minutes=body.duration_minutes,
        status="NOT_STARTED",
    )
    session.add(batch)
    session.commit()
    session.refresh(batch)
    return {
        "id": batch.id,
        "batch_number": batch.batch_number,
        "name": batch.name,
        "duration_minutes": batch.duration_minutes,
        "status": batch.status,
        "message": "Batch created successfully",
    }
