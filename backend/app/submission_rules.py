"""
Single-submission rule (one official submission per problem per team).

Pure query helpers + one process-wide lock, shared by the problems and submissions
routers so both enforce the *same* definition of "already submitted".

Rules:
  * Applies to contestants only. Admins may inspect/test freely.
  * A submission consumes the attempt whatever its verdict (AC / WA / TLE / CE ...).
  * EXCEPT verdict "IE" (judge unreachable / internal error). That is not the team's
    fault — the UI already tells them to resubmit — so it does not burn the attempt.
  * A row that is still being judged (verdict is NULL) DOES count; that is what stops a
    double-click or a second tab from slipping a duplicate in while the first judges.
  * Sample runs (POST /api/submissions/run) are never stored, so they never count.
"""
import threading
from typing import Set

from sqlmodel import Session, select

from app.models import Submission, User

# Held only around "check + insert pending row" (milliseconds), NOT while judging.
# This makes the check-then-insert atomic for the single uvicorn worker the LAN
# deployment runs. If the app is ever run with several worker processes, replace this
# with a DB-level partial unique index.
SUBMIT_LOCK = threading.Lock()

ALREADY_SUBMITTED_MESSAGE = "You have already submitted this problem. Only one submission is allowed per problem."
ALREADY_SUBMITTED_CODE = "ALREADY_SUBMITTED"


def enforces_single_submission(user: User) -> bool:
    return user.role == "contestant"


def submitted_problem_ids(session: Session, user: User) -> Set[int]:
    """Problem ids this contestant has used their one submission on (empty for admins)."""
    if not enforces_single_submission(user):
        return set()
    rows = session.exec(
        select(Submission.problem_id).where(
            Submission.user_id == user.id,
            (Submission.verdict.is_(None)) | (Submission.verdict != "IE"),  # type: ignore[union-attr]
        )
    ).all()
    return set(rows)


def has_submitted(session: Session, user: User, problem_id: int) -> bool:
    return problem_id in submitted_problem_ids(session, user)
