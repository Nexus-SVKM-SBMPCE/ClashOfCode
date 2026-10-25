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
from app.models import Problem, TestCase, User

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ProblemCreate(BaseModel):
    slug: str
    title: str
    statement: str
    difficulty: str = "medium"
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
