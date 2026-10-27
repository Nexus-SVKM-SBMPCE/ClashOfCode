"""
FastAPI application entry point — Code Clash Local Arena backend.
Binds to 0.0.0.0 for LAN access. Serves OpenAPI docs at /docs.
"""
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.database import init_db
from app.seeder import seed
from app.models import get_session
from sqlmodel import Session
from app.models import engine

from app.routers import auth, problems, submissions, leaderboard, admin, batches

# ---------------------------------------------------------------------------
# App bootstrap
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Code Clash — Local Arena",
    description="Self-hosted competitive programming platform (offline LAN mode)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(problems.router)
app.include_router(submissions.router)
app.include_router(leaderboard.router)
app.include_router(admin.router)
app.include_router(batches.router)


@app.on_event("startup")
def on_startup():
    init_db()
    with Session(engine) as session:
        seed(session)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Code Clash Backend"}


@app.get("/api/server-time")
def server_time():
    """Return the server's current UTC timestamp.
    Frontend uses this on page load to calculate a clock-skew offset so the
    countdown timer is always synced to server time, not the client's local clock.
    """
    return {"server_now_utc": datetime.now(timezone.utc).isoformat()}
