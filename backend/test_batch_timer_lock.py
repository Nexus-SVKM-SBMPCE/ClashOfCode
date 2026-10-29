"""
Unit and integration tests for Batch Timer & Admin Controls (Phases 1 & 2).

Verifies:
1. GET /api/server-time returns current UTC server timestamp.
2. GET /api/batches/my-batch/timer returns batch timer status, remaining seconds, and server_now_utc.
3. POST /api/admin/batches/{batch_id}/start-timer sets status=ACTIVE, timer_started_at=UTC now.
4. Problem lock:
   - Contestants receive HTTP 423 Locked when batch status is NOT_STARTED.
   - Admins bypass lock and receive HTTP 200 OK.
   - Contestants receive HTTP 200 OK once batch is ACTIVE.
"""
import sys
from datetime import datetime, timezone
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from app.main import app
from app.auth import get_current_user, require_admin
from app.database import get_session
from app.models import (
    Batch,
    Problem,
    TestCase,
    User,
    BATCH_STATUS_ACTIVE,
    BATCH_STATUS_NOT_STARTED,
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
def client_fixture(session: Session):
    def get_session_override():
        return session

    admin_user = User(
        id=1,
        username="admin_user",
        display_name="Admin Chief",
        hashed_password="fake",
        role="admin",
        is_active=True,
    )
    contestant_user = User(
        id=2,
        username="contestant_user",
        display_name="Contestant Tester",
        hashed_password="fake",
        role="contestant",
        is_active=True,
    )
    session.add(admin_user)
    session.add(contestant_user)

    prob = Problem(
        id=1,
        slug="sample-quest",
        title="Sample Quest",
        statement="Solve the quest.",
        difficulty="easy",
        time_limit_sec=2.0,
        memory_limit_kb=262144,
        is_visible=True,
    )
    session.add(prob)

    tc = TestCase(
        id=1,
        problem_id=1,
        order_index=0,
        input_data="1\n",
        expected_output="1\n",
        is_sample=True,
    )
    session.add(tc)

    batch = Batch(
        id=1,
        batch_number=1,
        name="Batch 1",
        status=BATCH_STATUS_NOT_STARTED,
        duration_minutes=60,
    )
    session.add(batch)
    session.commit()

    current_user_holder = {"user": contestant_user}

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_current_user] = lambda: current_user_holder["user"]
    app.dependency_overrides[require_admin] = lambda: admin_user if current_user_holder["user"].role == "admin" else None

    client = TestClient(app)
    client.current_user_holder = current_user_holder  # type: ignore[attr-defined]
    client.admin_user = admin_user                    # type: ignore[attr-defined]
    client.contestant_user = contestant_user          # type: ignore[attr-defined]

    yield client
    app.dependency_overrides.clear()


def test_server_time_endpoint(client: TestClient):
    """GET /api/server-time returns ISO-8601 UTC timestamp."""
    res = client.get("/api/server-time")
    assert res.status_code == 200
    data = res.json()
    assert "server_now_utc" in data
    # Parse timestamp
    dt = datetime.fromisoformat(data["server_now_utc"])
    assert dt is not None


def test_batch_timer_when_not_started(client: TestClient):
    """GET /api/batches/my-batch/timer returns NOT_STARTED and remaining_seconds=None."""
    res = client.get("/api/batches/my-batch/timer")
    assert res.status_code == 200
    data = res.json()
    assert data["batch_name"] == "Batch 1"
    assert data["status"] == "NOT_STARTED"
    assert data["remaining_seconds"] is None
    assert "server_now_utc" in data


def test_problems_locked_for_contestant_when_not_started(client: TestClient):
    """Contestants receive HTTP 423 Locked when batch has NOT_STARTED."""
    client.current_user_holder["user"] = client.contestant_user

    res_list = client.get("/api/problems")
    assert res_list.status_code == 423
    assert res_list.json()["detail"]["locked"] is True

    res_detail = client.get("/api/problems/sample-quest")
    assert res_detail.status_code == 423
    assert res_detail.json()["detail"]["locked"] is True


def test_problems_accessible_by_admin_even_when_not_started(client: TestClient):
    """Admin users bypass batch lock (HTTP 200)."""
    client.current_user_holder["user"] = client.admin_user

    res_list = client.get("/api/problems")
    assert res_list.status_code == 200
    assert len(res_list.json()) == 1

    res_detail = client.get("/api/problems/sample-quest")
    assert res_detail.status_code == 200
    assert res_detail.json()["slug"] == "sample-quest"


def test_admin_start_timer_and_unlock_problems(client: TestClient):
    """Admin starts the timer; batch transitions to ACTIVE; contestant access is unlocked."""
    # Start timer as admin
    client.current_user_holder["user"] = client.admin_user
    res_start = client.post("/api/admin/batches/1/start-timer")
    assert res_start.status_code == 200
    assert "Timer started" in res_start.json()["message"]

    # Verify timer endpoint now shows ACTIVE with ~3600 remaining seconds
    res_timer = client.get("/api/batches/my-batch/timer")
    assert res_timer.status_code == 200
    timer_data = res_timer.json()
    assert timer_data["status"] == "ACTIVE"
    assert timer_data["timer_started_at"] is not None
    assert 3590 <= timer_data["remaining_seconds"] <= 3600

    # Switch to contestant: problems must now return HTTP 200
    client.current_user_holder["user"] = client.contestant_user
    res_problems = client.get("/api/problems")
    assert res_problems.status_code == 200
    assert len(res_problems.json()) == 1
    assert res_problems.json()[0]["slug"] == "sample-quest"
