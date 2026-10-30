"""
SQLModel database models and engine configuration.
Hidden test cases and reference solutions are never serialized to public API responses.
"""
from datetime import datetime, timezone
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship, create_engine, Session
from app.config import DATABASE_URL

# Status literals for Batch
BATCH_STATUS_NOT_STARTED = "NOT_STARTED"
BATCH_STATUS_ACTIVE = "ACTIVE"
BATCH_STATUS_COMPLETED = "COMPLETED"

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------
engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)


def get_session():
    with Session(engine) as session:
        yield session


def init_db():
    SQLModel.metadata.create_all(engine)
    # Enable WAL mode for concurrent reads
    with Session(engine) as session:
        session.exec(  # type: ignore[call-overload]
            __import__("sqlalchemy").text("PRAGMA journal_mode=WAL")
        )
        session.commit()
    _migrate_columns()


# Columns added after the initial schema. create_all() never alters existing
# tables, so add them in place for databases created by older builds.
_SUBMISSION_COLUMNS = {
    "test_score": "INTEGER NOT NULL DEFAULT 0",
    "bonus_points": "INTEGER NOT NULL DEFAULT 0",
    "tests_passed": "INTEGER NOT NULL DEFAULT 0",
    "tests_total": "INTEGER NOT NULL DEFAULT 0",
    "solve_time_seconds": "INTEGER DEFAULT NULL",
    "batch_id": "INTEGER DEFAULT NULL",
}


def _migrate_columns():
    from sqlalchemy import inspect, text
    existing = {c["name"] for c in inspect(engine).get_columns("submissions")}
    with engine.begin() as conn:
        for name, ddl in _SUBMISSION_COLUMNS.items():
            if name not in existing:
                conn.execute(text(f"ALTER TABLE submissions ADD COLUMN {name} {ddl}"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_submissions_created_at ON submissions (created_at)"))


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True, max_length=50)
    hashed_password: str
    display_name: str = Field(max_length=100)
    role: str = Field(default="contestant")   # "admin" | "contestant"
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    submissions: List["Submission"] = Relationship(back_populates="user")


# ---------------------------------------------------------------------------
# Problem
# ---------------------------------------------------------------------------
class Problem(SQLModel, table=True):
    __tablename__ = "problems"

    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True, max_length=100)
    title: str = Field(max_length=200)
    statement: str       # Full markdown problem statement
    difficulty: str = Field(default="medium")   # "easy" | "medium" | "hard"
    time_limit_sec: float = Field(default=2.0)
    memory_limit_kb: int = Field(default=262144)
    is_visible: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    test_cases: List["TestCase"] = Relationship(back_populates="problem")
    submissions: List["Submission"] = Relationship(back_populates="problem")


# ---------------------------------------------------------------------------
# TestCase — hidden by default; reference solutions never returned to API
# ---------------------------------------------------------------------------
class TestCase(SQLModel, table=True):
    __tablename__ = "test_cases"

    id: Optional[int] = Field(default=None, primary_key=True)
    problem_id: int = Field(foreign_key="problems.id", index=True)
    order_index: int = Field(default=0)
    input_data: str       # stdin
    expected_output: str  # Expected stdout — NEVER exposed publicly
    is_sample: bool = Field(default=False)  # True = shown in problem statement

    problem: Optional[Problem] = Relationship(back_populates="test_cases")


# ---------------------------------------------------------------------------
# Batch — per-batch contest timer and metadata
# ---------------------------------------------------------------------------
class Batch(SQLModel, table=True):
    """Represents a contest batch. Each batch has its own 60-minute countdown.
    status: NOT_STARTED | ACTIVE | COMPLETED
    timer_started_at: UTC timestamp when admin triggered the batch start.
    """
    __tablename__ = "batches"

    id: Optional[int] = Field(default=None, primary_key=True)
    batch_number: int = Field(index=True)           # e.g. 1, 2, 3 …
    name: str = Field(max_length=100)               # Display name, e.g. "Batch A"
    status: str = Field(default=BATCH_STATUS_NOT_STARTED)  # NOT_STARTED | ACTIVE | COMPLETED
    timer_started_at: Optional[datetime] = None     # UTC — set when admin fires start-timer
    duration_minutes: int = Field(default=60)       # Contest window in minutes (default 1 h)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Submission
# ---------------------------------------------------------------------------
class Submission(SQLModel, table=True):
    __tablename__ = "submissions"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    problem_id: int = Field(foreign_key="problems.id", index=True)
    language: str = Field(max_length=20)        # "c" | "cpp" | "java" | "python"
    source_code: str                            # User code — private in listing responses
    status: str = Field(default="pending")      # "pending" | "judging" | "done" | "error"

    # Aggregate verdict across all test cases
    verdict: Optional[str] = None               # "AC" | "WA" | "TLE" | "MLE" | "CE" | "RE" | "IE"
    score: int = Field(default=0)               # test_score + bonus_points (see app/scoring.py)
    test_score: int = Field(default=0)          # marks from passed test cases
    bonus_points: int = Field(default=0)        # difficulty bonus, only on full AC
    tests_passed: int = Field(default=0)
    tests_total: int = Field(default=0)
    runtime_ms: Optional[float] = None
    memory_kb: Optional[int] = None
    test_results: Optional[str] = None         # JSON — hidden detail per test run
    compile_error: Optional[str] = None        # CE message (shown to submitter only)
    judged_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Per-question solve time for tie-breaking (seconds elapsed from batch start to first AC)
    solve_time_seconds: Optional[int] = None    # NULL until the submission is AC
    batch_id: Optional[int] = Field(default=None, foreign_key="batches.id", index=True)

    user: Optional[User] = Relationship(back_populates="submissions")
    problem: Optional[Problem] = Relationship(back_populates="submissions")
