"""
SQLModel database models and engine configuration.
Hidden test cases and reference solutions are never serialized to public API responses.
"""
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import UniqueConstraint
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
    "time_complexity": "VARCHAR(50) DEFAULT NULL",
    "time_complexity_verdict": "VARCHAR(50) DEFAULT NULL",
}

_PROBLEM_COLUMNS = {
    "best_time_complexity": "VARCHAR(50) DEFAULT 'O(N)'",
}

_USER_COLUMNS = {
    "team_id": "INTEGER DEFAULT NULL",
    "tab_switch_count": "INTEGER NOT NULL DEFAULT 0",
    "fullscreen_exit_count": "INTEGER NOT NULL DEFAULT 0",
    "last_active_at": "TIMESTAMP DEFAULT NULL",
}

_TEAM_COLUMNS = {
    "tab_switch_count": "INTEGER NOT NULL DEFAULT 0",
    "fullscreen_exit_count": "INTEGER NOT NULL DEFAULT 0",
    "last_active_at": "TIMESTAMP DEFAULT NULL",
}

_TAB_SWITCH_COLUMNS = {
    "event_type": "VARCHAR(32) NOT NULL DEFAULT 'TAB_SWITCH'",
    "violation_number": "INTEGER DEFAULT NULL",
    "event_metadata": "VARCHAR(500) DEFAULT NULL",
    "reset_id": "INTEGER DEFAULT NULL REFERENCES security_admin_actions(id)",
}


def _migrate_columns():
    from sqlalchemy import inspect, text
    with engine.begin() as conn:
        inspector = inspect(engine)
        if inspector.has_table("submissions"):
            sub_cols = {c["name"] for c in inspector.get_columns("submissions")}
            for name, ddl in _SUBMISSION_COLUMNS.items():
                if name not in sub_cols:
                    conn.execute(text(f"ALTER TABLE submissions ADD COLUMN {name} {ddl}"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_submissions_created_at ON submissions (created_at)"))

        if inspector.has_table("problems"):
            prob_cols = {c["name"] for c in inspector.get_columns("problems")}
            for name, ddl in _PROBLEM_COLUMNS.items():
                if name not in prob_cols:
                    conn.execute(text(f"ALTER TABLE problems ADD COLUMN {name} {ddl}"))

        if inspector.has_table("users"):
            user_cols = {c["name"] for c in inspector.get_columns("users")}
            for name, ddl in _USER_COLUMNS.items():
                if name not in user_cols:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {ddl}"))

        if inspector.has_table("teams"):
            team_cols = {c["name"] for c in inspector.get_columns("teams")}
            for name, ddl in _TEAM_COLUMNS.items():
                if name not in team_cols:
                    conn.execute(text(f"ALTER TABLE teams ADD COLUMN {name} {ddl}"))

        if inspector.has_table("tab_switch_events"):
            ev_cols = {c["name"] for c in inspector.get_columns("tab_switch_events")}
            for name, ddl in _TAB_SWITCH_COLUMNS.items():
                if name not in ev_cols:
                    conn.execute(text(f"ALTER TABLE tab_switch_events ADD COLUMN {name} {ddl}"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tab_switch_events_event_type ON tab_switch_events (event_type)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tab_switch_events_reset_id ON tab_switch_events (reset_id)"))

        if not inspector.has_table("batch_problems"):
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS batch_problems (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    batch_id INTEGER NOT NULL,
                    problem_id INTEGER NOT NULL
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_batch_problems_batch_id ON batch_problems (batch_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_batch_problems_problem_id ON batch_problems (problem_id)"))


# ---------------------------------------------------------------------------
# Team — Single shared login per team (username + password)
# ---------------------------------------------------------------------------
class Team(SQLModel, table=True):
    __tablename__ = "teams"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)                             # Team name, e.g. "Code Clan"
    username: str = Field(index=True, unique=True, max_length=50) # Shared login username, e.g. "team1"
    hashed_password: str                                          # Bcrypt hash of team password
    leader_name: str = Field(max_length=100)                      # Team leader name
    leader_email: str = Field(max_length=150)                     # Team leader email
    members_info: Optional[str] = Field(default=None)             # JSON string of members info
    batch_id: Optional[int] = Field(default=None, foreign_key="batches.id", index=True)
    total_score: int = Field(default=0)
    tab_switch_count: int = Field(default=0)
    fullscreen_exit_count: int = Field(default=0)
    last_active_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    batch: Optional["Batch"] = Relationship()
    users: List["User"] = Relationship(back_populates="team")


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
    team_id: Optional[int] = Field(default=None, foreign_key="teams.id", index=True)
    tab_switch_count: int = Field(default=0)
    fullscreen_exit_count: int = Field(default=0)
    last_active_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    submissions: List["Submission"] = Relationship(back_populates="user")
    team: Optional[Team] = Relationship(back_populates="users")


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
    best_time_complexity: Optional[str] = Field(default="O(N)", max_length=50)
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
# ---------------------------------------------------------------------------
# BatchProblem ? association between batches and allotted questions
# ---------------------------------------------------------------------------
class BatchProblem(SQLModel, table=True):
    __tablename__ = "batch_problems"

    id: Optional[int] = Field(default=None, primary_key=True)
    batch_id: int = Field(foreign_key="batches.id", index=True)
    problem_id: int = Field(foreign_key="problems.id", index=True)


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
    time_complexity: Optional[str] = None       # Real-time evaluated time complexity, e.g. O(N)
    time_complexity_verdict: Optional[str] = None  # OPTIMAL | ACCEPTABLE | SUBOPTIMAL
    batch_id: Optional[int] = Field(default=None, foreign_key="batches.id", index=True)

    user: Optional[User] = Relationship(back_populates="submissions")
    problem: Optional[Problem] = Relationship(back_populates="submissions")


# ---------------------------------------------------------------------------
# Exam security — violation log, per-attempt lock state, admin audit trail
# ---------------------------------------------------------------------------
VIOLATION_TYPES = ("TAB_SWITCH", "FULLSCREEN_EXIT", "COPY_ATTEMPT", "CUT_ATTEMPT", "PASTE_ATTEMPT")
SECURITY_STATUS_ACTIVE = "ACTIVE"
SECURITY_STATUS_LOCKED = "LOCKED"


class TabSwitchEvent(SQLModel, table=True):
    """One row per distinct security violation reported by a contestant's browser.

    Historically tab switches only (hence the table name); `event_type` now covers
    every VIOLATION_TYPES entry. The strike count is COUNT(*) of rows with
    `reset_id IS NULL` — never a number the client claims. `client_event_id` plus
    the unique constraint makes retries of the same event idempotent. An admin
    reset never deletes rows: it stamps them with the audit row's id.
    """
    __tablename__ = "tab_switch_events"
    __table_args__ = (UniqueConstraint("user_id", "client_event_id", name="uq_tab_switch_user_event"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    batch_id: Optional[int] = Field(default=None, foreign_key="batches.id", index=True)
    client_event_id: str = Field(max_length=64)
    event_type: str = Field(default="TAB_SWITCH", max_length=32, index=True)
    violation_number: Optional[int] = None          # strike number at the time it was recorded
    event_metadata: Optional[str] = Field(default=None, max_length=500)  # JSON, e.g. {"path": "/problems/x"}
    reset_id: Optional[int] = Field(default=None, foreign_key="security_admin_actions.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)


class ContestSecurityState(SQLModel, table=True):
    """Lock state of one contestant's attempt (user + batch). Survives logout/login."""
    __tablename__ = "contest_security_states"
    __table_args__ = (UniqueConstraint("user_id", "batch_id", name="uq_security_state_user_batch"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    batch_id: int = Field(foreign_key="batches.id", index=True)
    status: str = Field(default=SECURITY_STATUS_ACTIVE, max_length=16)   # ACTIVE | LOCKED
    locked_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SecurityAdminAction(SQLModel, table=True):
    """Audit trail: every admin UNLOCK / RESET with who, whom, when and why."""
    __tablename__ = "security_admin_actions"

    id: Optional[int] = Field(default=None, primary_key=True)
    admin_id: int = Field(foreign_key="users.id", index=True)
    target_user_id: int = Field(foreign_key="users.id", index=True)
    batch_id: Optional[int] = Field(default=None, foreign_key="batches.id", index=True)
    action: str = Field(max_length=16)               # UNLOCK | RESET
    reason: str = Field(max_length=500)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
