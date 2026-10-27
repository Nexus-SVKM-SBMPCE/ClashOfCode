"""
Unit and integration tests for Per-Question Time Calculation (Phase 4).

Verifies:
1. solve_time_seconds is accurately computed as (submission_created_at - batch_start_time)
   and persisted to the database on 'AC' submissions.
2. Non-AC submissions do not record a solve_time_seconds (stored as None).
3. If a problem is solved multiple times, each submission stores its own solve_time_seconds,
   while leaderboard scoring and tie-breaking exclusively considers the first successful solve time.
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from app.main import app
from app.auth import get_current_user
from app.database import get_session
from app.models import (
    Batch,
    Problem,
    Submission,
    TestCase,
    User,
    BATCH_STATUS_ACTIVE,
)


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session, monkeypatch: pytest.MonkeyPatch):
    def get_session_override():
        return session

    # Create two contestant users
    user1 = User(
        id=1,
        username="contestant_1",
        display_name="Contestant One",
        hashed_password="fake",
        role="contestant",
        is_active=True,
    )
    user2 = User(
        id=2,
        username="contestant_2",
        display_name="Contestant Two",
        hashed_password="fake",
        role="contestant",
        is_active=True,
    )
    session.add(user1)
    session.add(user2)

    # Seed problem and testcase
    prob1 = Problem(
        id=1,
        slug="two-sum",
        title="Two Sum",
        statement="Find target sum",
        difficulty="easy",
        time_limit_sec=2.0,
        memory_limit_kb=262144,
        is_visible=True,
    )
    session.add(prob1)
    session.commit()

    tc1 = TestCase(
        id=1,
        problem_id=1,
        input_data="5 9\n2 7 11 15 4\n",
        expected_output="1 2\n",
        is_sample=True,
    )
    session.add(tc1)
    session.commit()

    # Default auth as user1
    current_test_user = {"user": user1}
    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_current_user] = lambda: current_test_user["user"]

    # Mock evaluate_submission to simulate AC by default
    monkeypatch.setattr(
        "app.routers.submissions.evaluate_submission",
        lambda **kwargs: {
            "status_id": 3,
            "verdict": "AC",
            "stdout": "1 2\n",
            "stderr": "",
            "compile_error": None,
            "runtime_ms": 15.0,
            "memory_kb": 1024,
        },
    )

    client = TestClient(app)
    client.current_test_user = current_test_user  # type: ignore[attr-defined]
    yield client
    app.dependency_overrides.clear()


def test_solve_time_calculated_and_persisted_for_ac(client: TestClient, session: Session):
    """Verify solve_time_seconds is calculated from batch start and saved to DB for AC."""
    # Batch started exactly 120 seconds ago
    batch_start = datetime.now(timezone.utc) - timedelta(seconds=120)
    batch = Batch(
        id=1,
        batch_number=1,
        name="Batch 1",
        status=BATCH_STATUS_ACTIVE,
        timer_started_at=batch_start,
        duration_minutes=60,
    )
    session.add(batch)
    session.commit()

    res = client.post(
        "/api/submissions",
        json={
            "problem_slug": "two-sum",
            "language": "python",
            "source_code": "print('1 2')",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["verdict"] == "AC"
    assert data["solve_time_seconds"] is not None
    # Elapsed time should be approximately 120 seconds (allow small margin for execution)
    assert 118 <= data["solve_time_seconds"] <= 125

    # Direct DB query verification
    db_sub = session.exec(select(Submission).where(Submission.id == data["id"])).first()
    assert db_sub is not None
    assert db_sub.solve_time_seconds == data["solve_time_seconds"]
    assert db_sub.batch_id == batch.id


def test_non_ac_submission_has_no_solve_time(client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch):
    """Verify non-AC submissions (WA) do not record solve_time_seconds."""
    monkeypatch.setattr(
        "app.routers.submissions.evaluate_submission",
        lambda **kwargs: {
            "status_id": 4,
            "verdict": "WA",
            "stdout": "wrong\n",
            "stderr": "",
            "compile_error": None,
            "runtime_ms": 10.0,
            "memory_kb": 512,
        },
    )

    batch_start = datetime.now(timezone.utc) - timedelta(seconds=60)
    batch = Batch(
        id=1,
        batch_number=1,
        name="Batch 1",
        status=BATCH_STATUS_ACTIVE,
        timer_started_at=batch_start,
        duration_minutes=60,
    )
    session.add(batch)
    session.commit()

    res = client.post(
        "/api/submissions",
        json={
            "problem_slug": "two-sum",
            "language": "python",
            "source_code": "print('wrong')",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["verdict"] == "WA"
    assert data["solve_time_seconds"] is None

    # Direct DB check
    db_sub = session.exec(select(Submission).where(Submission.id == data["id"])).first()
    assert db_sub is not None
    assert db_sub.solve_time_seconds is None


def test_multiple_solves_first_ac_time_considered_for_ranking(client: TestClient, session: Session):
    """
    Ensure that if a problem is solved multiple times, every submission stores its
    own solve_time, but the leaderboard uses the FIRST AC time for ranking and tie-breaks.
    """
    batch_start = datetime.now(timezone.utc) - timedelta(minutes=10)
    batch = Batch(
        id=1,
        batch_number=1,
        name="Batch 1",
        status=BATCH_STATUS_ACTIVE,
        timer_started_at=batch_start,
        duration_minutes=60,
    )
    session.add(batch)
    session.commit()

    # User 1 first submission at T+60s (AC)
    sub1_time = batch_start + timedelta(seconds=60)
    sub1 = Submission(
        user_id=1,
        problem_id=1,
        language="python",
        source_code="print('1 2')",
        status="done",
        verdict="AC",
        score=100,
        solve_time_seconds=60,
        batch_id=1,
        created_at=sub1_time,
    )
    session.add(sub1)

    # User 1 second submission on same problem at T+180s (AC again)
    sub2_time = batch_start + timedelta(seconds=180)
    sub2 = Submission(
        user_id=1,
        problem_id=1,
        language="python",
        source_code="print('1 2') # faster code",
        status="done",
        verdict="AC",
        score=100,
        solve_time_seconds=180,
        batch_id=1,
        created_at=sub2_time,
    )
    session.add(sub2)

    # User 2 solves problem 1 at T+120s (AC)
    sub3_time = batch_start + timedelta(seconds=120)
    sub3 = Submission(
        user_id=2,
        problem_id=1,
        language="python",
        source_code="print('1 2')",
        status="done",
        verdict="AC",
        score=100,
        solve_time_seconds=120,
        batch_id=1,
        created_at=sub3_time,
    )
    session.add(sub3)
    session.commit()

    # Verify both User 1 submissions have their respective solve times stored in DB
    all_subs_u1 = session.exec(select(Submission).where(Submission.user_id == 1)).all()
    assert len(all_subs_u1) == 2
    assert {s.solve_time_seconds for s in all_subs_u1} == {60, 180}

    # Query leaderboard
    leaderboard_res = client.get("/api/leaderboard")
    assert leaderboard_res.status_code == 200
    lb = leaderboard_res.json()

    # Both users solved 1 problem (100 pts)
    # User 1 first solved at 60s
    # User 2 first solved at 120s
    # User 1 must rank #1 (faster first solve: 60s < 120s)
    assert len(lb) >= 2
    assert lb[0]["user_id"] == 1
    assert lb[0]["rank"] == 1
    assert lb[0]["total_solve_time_seconds"] == 60  # Uses 60s, NOT 180s or 240s!

    assert lb[1]["user_id"] == 2
    assert lb[1]["rank"] == 2
    assert lb[1]["total_solve_time_seconds"] == 120
