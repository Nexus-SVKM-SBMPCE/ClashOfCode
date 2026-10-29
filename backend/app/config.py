import os
from typing import List
from dotenv import load_dotenv

load_dotenv()

HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", "8000"))
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./codeclash.db")
SECRET_KEY: str = os.getenv("SECRET_KEY", "change_me_in_production")
ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))
JUDGE0_URL: str = os.getenv("JUDGE0_URL", "http://127.0.0.1:2358")

_cors_raw = os.getenv("CORS_ORIGINS", '["http://localhost:5173"]')
try:
    import json
    CORS_ORIGINS: List[str] = json.loads(_cors_raw)
except Exception:
    CORS_ORIGINS = [_cors_raw]

# Judge0 language ID mapping — verified via tests/verify_judge0.py (Phase 1)
JUDGE0_LANGUAGE_IDS = {
    "c":      48,   # C (GCC 7.4.0)
    "cpp":    52,   # C++ (GCC 7.4.0)
    "java":   62,   # Java (OpenJDK 13.0.1)
    "python": 71,   # Python (3.8.1)
}

SUPPORTED_LANGUAGES = list(JUDGE0_LANGUAGE_IDS.keys())

# Per-submission execution limits
DEFAULT_CPU_TIME_LIMIT: float = 2.0        # seconds
DEFAULT_WALL_TIME_LIMIT: float = 5.0       # seconds
DEFAULT_MEMORY_LIMIT: int = 262144         # KB = 256 MB (safe for Java, C, C++, Python)
DEFAULT_MAX_PROCESSES: int = 60

# Granular scoring (see app/scoring.py)
MARKS_PER_TEST_CASE: int = int(os.getenv("MARKS_PER_TEST_CASE", "10"))
PARTIAL_THRESHOLD: float = float(os.getenv("PARTIAL_THRESHOLD", "0.5"))  # min fraction of tests passed
DIFFICULTY_BONUS = {"easy": 2, "medium": 3, "hard": 5}
