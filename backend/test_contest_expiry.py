"""
Unit and integration tests for Contest Expiry & Submission Freeze (Phase 3).

Verifies that POST /api/submissions rejects submissions when the batch deadline
has passed or batch status is COMPLETED with HTTP 400 'Submission deadline passed'.
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

# Ensure backend directory is in path
BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from app.main import app
from app.auth import get_current_user
from app.database import get_session
from app.models import (
    Batch,
    Problem,
    TestCase,
    User,
    BATCH_STATUS_ACTIVE,
    BATCH_STATUS_COMPLETED,
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

    test_user = User(
        id=1,
        username="contestant_1",
        display_name="Contestant One",
        hashed_password="fake",
        role="contestant",
        is_active=True,
    )
    session.add(test_user)

    # Seed a problem and testcase for submission testing
    problem = Problem(
        id=1,
        slug="test-problem",
        title="Test Problem",
        statement="Solve it",
        difficulty="easy",
        time_limit_sec=2.0,
        memory_limit_kb=262144,
        is_visible=True,
    )
    session.add(problem)
    session.commit()

    test_case = TestCase(
        id=1,
        problem_id=1,
        input_data="1 2\n",
        expected_output="3\n",
        is_sample=True,
    )
    session.add(test_case)
    session.commit()

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_current_user] = lambda: test_user

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def test_submission_rejected_after_deadline(client: TestClient, session: Session):
    """Submissions received after timer_started_at + duration_minutes must return HTTP 400."""
    past_start = datetime.now(timezone.utc) - timedelta(minutes=65)
    batch = Batch(
        id=1,
        batch_number=1,
        name="Batch 1",
        status=BATCH_STATUS_ACTIVE,
        timer_started_at=past_start,
        duration_minutes=60,  # Expired 5 minutes ago
    )
    session.add(batch)
    session.commit()

    response = client.post(
        "/api/submissions",
        json={
            "problem_slug": "test-problem",
            "language": "python",
            "source_code": "print(3)",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Submission deadline passed"


def test_submission_rejected_when_batch_completed(client: TestClient, session: Session):
    """Submissions received when batch status is COMPLETED must return HTTP 400."""
    batch = Batch(
        id=1,
        batch_number=1,
        name="Batch 1",
        status=BATCH_STATUS_COMPLETED,
        timer_started_at=datetime.now(timezone.utc) - timedelta(minutes=30),
        duration_minutes=60,
    )
    session.add(batch)
    session.commit()

    response = client.post(
        "/api/submissions",
        json={
            "problem_slug": "test-problem",
            "language": "python",
            "source_code": "print(3)",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Submission deadline passed"


def test_submission_allowed_before_deadline(client: TestClient, session: Session, monkeypatch: pytest.MonkeyPatch):
    """Submissions within the active contest window should be evaluated normally."""
    # Mock evaluate_submission so the test does not depend on an external Judge0 daemon
    monkeypatch.setattr(
        "app.routers.submissions.evaluate_submission",
        lambda **kwargs: {
            "status_id": 3,
            "verdict": "AC",
            "stdout": "3\n",
            "stderr": "",
            "compile_error": None,
            "runtime_ms": 12.0,
            "memory_kb": 1024,
        },
    )

    recent_start = datetime.now(timezone.utc) - timedelta(minutes=10)
    batch = Batch(
        id=1,
        batch_number=1,
        name="Batch 1",
        status=BATCH_STATUS_ACTIVE,
        timer_started_at=recent_start,
        duration_minutes=60,  # 50 minutes remaining
    )
    session.add(batch)
    session.commit()

    response = client.post(
        "/api/submissions",
        json={
            "problem_slug": "test-problem",
            "language": "python",
            "source_code": "print(3)",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["problem_slug"] == "test-problem"
    assert data["status"] == "done"
    assert data["score"] == 100
    assert data["verdict"] == "AC"
