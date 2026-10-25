"""
Judge0 client — base64-encoded, resilient evaluation.
Verified against Judge0 CE 1.13.0 with language IDs from Phase 1.
"""
import base64
import time
import requests
from typing import Optional
from app.config import JUDGE0_URL, JUDGE0_LANGUAGE_IDS

# Judge0 status ID constants
_STATUS_IN_QUEUE    = 1
_STATUS_PROCESSING  = 2
STATUS_ACCEPTED     = 3
STATUS_WRONG_ANSWER = 4
STATUS_TLE          = 5
STATUS_CE           = 6
STATUS_RE_RANGE     = {7, 8, 9, 10, 11, 12}
STATUS_IE           = 13

VERDICT_MAP = {
    3:  "AC",
    4:  "WA",
    5:  "TLE",
    6:  "CE",
    7:  "RE",
    8:  "RE",
    9:  "RE",
    10: "RE",
    11: "RE",
    12: "RE",
    13: "IE",
    14: "IE",
}


def _b64(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    return base64.b64encode(s.encode("utf-8")).decode("utf-8")


def _unb64(s: Optional[str]) -> str:
    if not s:
        return ""
    try:
        return base64.b64decode(s.encode("utf-8")).decode("utf-8", errors="replace")
    except Exception:
        return str(s)


def evaluate_submission(
    source_code: str,
    language: str,
    stdin: str = "",
    expected_output: str = "",
    cpu_time_limit: float = 2.0,
    memory_limit: int = 262144,
) -> dict:
    """
    Submit to Judge0 and wait for result.
    Returns a dict with: status_id, verdict, stdout, stderr, compile_error,
                         runtime_ms, memory_kb.
    """
    lang_id = JUDGE0_LANGUAGE_IDS.get(language)
    if lang_id is None:
        return {
            "status_id": STATUS_IE,
            "verdict": "IE",
            "stdout": "",
            "stderr": "",
            "compile_error": f"Unsupported language: {language}",
            "runtime_ms": None,
            "memory_kb": None,
        }

    payload = {
        "source_code": _b64(source_code),
        "language_id": lang_id,
        "stdin": _b64(stdin),
        "expected_output": _b64(expected_output),
        "cpu_time_limit": cpu_time_limit,
        "wall_time_limit": cpu_time_limit + 3,
        "memory_limit": memory_limit,
        # NOTE: max_processes_and_or_threads intentionally omitted.
        # Phase 1 verified Java (ID 62) works without it.
        # Explicitly setting this causes isolate to enforce per-thread cgroup limits
        # which crashes the JVM under WSL2 cgroups v2.
    }

    try:
        r = requests.post(
            f"{JUDGE0_URL}/submissions?base64_encoded=true&wait=true",
            json=payload,
            timeout=cpu_time_limit + 10,
        )
        r.raise_for_status()
        res = r.json()
    except requests.RequestException as exc:
        return {
            "status_id": STATUS_IE,
            "verdict": "IE",
            "stdout": "",
            "stderr": str(exc),
            "compile_error": None,
            "runtime_ms": None,
            "memory_kb": None,
        }

    # Poll if still queued
    token = res.get("token")
    attempts = 0
    status_id = (res.get("status") or {}).get("id")
    while status_id in (_STATUS_IN_QUEUE, _STATUS_PROCESSING) and attempts < 20:
        time.sleep(0.4)
        try:
            r2 = requests.get(
                f"{JUDGE0_URL}/submissions/{token}?base64_encoded=true",
                timeout=8,
            )
            res = r2.json()
            status_id = (res.get("status") or {}).get("id")
        except Exception:
            break
        attempts += 1

    stdout       = _unb64(res.get("stdout"))
    stderr       = _unb64(res.get("stderr"))
    compile_err  = _unb64(res.get("compile_output"))
    time_val     = res.get("time")
    memory_val   = res.get("memory")

    runtime_ms: Optional[float] = float(time_val) * 1000 if time_val else None
    memory_kb:  Optional[int]   = int(memory_val) if memory_val else None
    verdict = VERDICT_MAP.get(status_id, "IE")

    return {
        "status_id":    status_id,
        "verdict":      verdict,
        "stdout":       stdout,
        "stderr":       stderr,
        "compile_error": compile_err,
        "runtime_ms":   runtime_ms,
        "memory_kb":    memory_kb,
    }
