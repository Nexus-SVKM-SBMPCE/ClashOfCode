"""
Problems router: list problems, get problem details with sample test cases.
Hidden test cases are never serialized in any response.
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user, require_admin
from app.database import get_session
from app.models import Problem, TestCase, User

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
# Endpoints
# ---------------------------------------------------------------------------
@router.get("", response_model=List[ProblemSummary])
def list_problems(
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
) -> List[ProblemSummary]:
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
    _: User = Depends(get_current_user),
) -> ProblemDetail:
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
