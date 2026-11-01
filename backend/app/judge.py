"""
Judge0 client — base64-encoded, resilient evaluation with LeetCode-style
hidden driver injection and offline local fallback execution engine.
"""
import base64
import subprocess
import sys
import time
import requests
from typing import Optional, List, Dict, Any
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


def inject_hidden_driver(source_code: str, language: str, problem_slug: Optional[str] = None) -> str:
    """
    Injects a LeetCode-like hidden driver at the end of user source code.
    If the user has written custom solution classes/functions, the driver reads
    stdin, executes the solution, and writes formatted output to stdout.
    If the user already wrote standard I/O (e.g. main() or raw input()), the driver
    safely yields to the user's entry point.
    """
    if not source_code or not problem_slug:
        return source_code

    slug = problem_slug.lower().strip()

    if language == "python":
        # Check if user already runs their own standard entry point without Solution
        if ("sys.stdin" in source_code or "input(" in source_code) and "class Solution" not in source_code:
            return source_code

        driver = f'''
# --- LeetCode Background Driver ---
import sys

def __clash_hidden_driver__():
    raw = sys.stdin.read().strip()
    if not raw:
        return
    lines = [line.strip() for line in raw.split('\\n') if line.strip()]
    if not lines:
        return

    sol = Solution() if 'Solution' in globals() else None

    if "{slug}" == "two-sum":
        parts = lines[0].split()
        n = int(parts[0])
        target = int(parts[1])
        nums = list(map(int, lines[1].split()))
        ans = None
        if sol and hasattr(sol, "twoSum"):
            ans = sol.twoSum(nums, target)
        elif sol and hasattr(sol, "two_sum"):
            ans = sol.two_sum(nums, target)
        elif 'twoSum' in globals():
            ans = twoSum(nums, target)
        elif 'two_sum' in globals():
            ans = two_sum(nums, target)
        elif 'solve' in globals():
            ans = solve(nums, target)
        if ans is not None:
            if isinstance(ans, (list, tuple)):
                print(f"{{ans[0]}} {{ans[1]}}")
            else:
                print(ans)

    elif "{slug}" == "fibonacci":
        n = int(lines[0])
        ans = None
        if sol and hasattr(sol, "fib"):
            ans = sol.fib(n)
        elif sol and hasattr(sol, "fibonacci"):
            ans = sol.fibonacci(n)
        elif 'fib' in globals():
            ans = fib(n)
        elif 'fibonacci' in globals():
            ans = fibonacci(n)
        elif 'solve' in globals():
            ans = solve(n)
        if ans is not None:
            print(ans)

    elif "{slug}" == "palindrome-check":
        s = lines[0]
        ans = None
        if sol and hasattr(sol, "isPalindrome"):
            ans = sol.isPalindrome(s)
        elif sol and hasattr(sol, "is_palindrome"):
            ans = sol.is_palindrome(s)
        elif 'isPalindrome' in globals():
            ans = isPalindrome(s)
        elif 'is_palindrome' in globals():
            ans = is_palindrome(s)
        elif 'solve' in globals():
            ans = solve(s)
        if ans is not None:
            if isinstance(ans, bool):
                print("YES" if ans else "NO")
            else:
                print(str(ans).strip())

    elif "{slug}" == "binary-search":
        parts = lines[0].split()
        n = int(parts[0])
        target = int(parts[1])
        nums = list(map(int, lines[1].split()))
        ans = None
        if sol and hasattr(sol, "search"):
            ans = sol.search(nums, target)
        elif sol and hasattr(sol, "binarySearch"):
            ans = sol.binarySearch(nums, target)
        elif 'search' in globals():
            ans = search(nums, target)
        elif 'solve' in globals():
            ans = solve(nums, target)
        if ans is not None:
            print(ans)

    elif "{slug}" == "max-subarray":
        n = int(lines[0])
        nums = list(map(int, lines[1].split()))
        ans = None
        if sol and hasattr(sol, "maxSubArray"):
            ans = sol.maxSubArray(nums)
        elif sol and hasattr(sol, "max_sub_array"):
            ans = sol.max_sub_array(nums)
        elif 'maxSubArray' in globals():
            ans = maxSubArray(nums)
        elif 'solve' in globals():
            ans = solve(nums)
        if ans is not None:
            print(ans)

if __name__ == '__main__':
    __clash_hidden_driver__()
'''
        return source_code + "\n" + driver

    elif language == "cpp":
        if "int main(" in source_code or "main()" in source_code or "main (" in source_code:
            return source_code

        if slug == "two-sum":
            driver = '''
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    int n, target;
    if (cin >> n >> target) {
        vector<int> nums(n);
        for (int i = 0; i < n; ++i) cin >> nums[i];
        Solution sol;
        vector<int> ans = sol.twoSum(nums, target);
        if (ans.size() >= 2) cout << ans[0] << " " << ans[1] << "\\n";
    }
    return 0;
}
'''
        elif slug == "fibonacci":
            driver = '''
int main() {
    int n;
    if (cin >> n) {
        Solution sol;
        cout << sol.fib(n) << "\\n";
    }
    return 0;
}
'''
        elif slug == "palindrome-check":
            driver = '''
int main() {
    string s;
    if (getline(cin, s)) {
        Solution sol;
        bool ans = sol.isPalindrome(s);
        cout << (ans ? "YES" : "NO") << "\\n";
    }
    return 0;
}
'''
        elif slug == "binary-search":
            driver = '''
int main() {
    int n, target;
    if (cin >> n >> target) {
        vector<int> nums(n);
        for (int i = 0; i < n; ++i) cin >> nums[i];
        Solution sol;
        cout << sol.search(nums, target) << "\\n";
    }
    return 0;
}
'''
        elif slug == "max-subarray":
            driver = '''
int main() {
    int n;
    if (cin >> n) {
        vector<int> nums(n);
        for (int i = 0; i < n; ++i) cin >> nums[i];
        Solution sol;
        cout << sol.maxSubArray(nums) << "\\n";
    }
    return 0;
}
'''
        else:
            driver = ""
        return source_code + "\n" + driver

    elif language == "java":
        if "public static void main" in source_code:
            return source_code

        if slug == "two-sum":
            driver = '''
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int n = sc.nextInt();
            int target = sc.nextInt();
            int[] nums = new int[n];
            for (int i = 0; i < n; ++i) nums[i] = sc.nextInt();
            Solution sol = new Solution();
            int[] ans = sol.twoSum(nums, target);
            if (ans != null && ans.length >= 2) System.out.println(ans[0] + " " + ans[1]);
        }
    }
}
'''
        elif slug == "fibonacci":
            driver = '''
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int n = sc.nextInt();
            Solution sol = new Solution();
            System.out.println(sol.fib(n));
        }
    }
}
'''
        elif slug == "palindrome-check":
            driver = '''
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextLine()) {
            String s = sc.nextLine();
            Solution sol = new Solution();
            boolean ans = sol.isPalindrome(s);
            System.out.println(ans ? "YES" : "NO");
        }
    }
}
'''
        elif slug == "binary-search":
            driver = '''
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int n = sc.nextInt();
            int target = sc.nextInt();
            int[] nums = new int[n];
            for (int i = 0; i < n; ++i) nums[i] = sc.nextInt();
            Solution sol = new Solution();
            System.out.println(sol.search(nums, target));
        }
    }
}
'''
        elif slug == "max-subarray":
            driver = '''
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int n = sc.nextInt();
            int[] nums = new int[n];
            for (int i = 0; i < n; ++i) nums[i] = sc.nextInt();
            Solution sol = new Solution();
            System.out.println(sol.maxSubArray(nums));
        }
    }
}
'''
        else:
            driver = ""
        return source_code + "\n" + driver

    elif language == "c":
        if "main(" in source_code:
            return source_code

        if slug == "two-sum":
            driver = '''
int main() {
    int n, target;
    if (scanf("%d %d", &n, &target) == 2) {
        int* nums = (int*)malloc(n * sizeof(int));
        for (int i = 0; i < n; ++i) scanf("%d", &nums[i]);
        int retSize = 0;
        int* ans = twoSum(nums, n, target, &retSize);
        if (ans && retSize >= 2) printf("%d %d\\n", ans[0], ans[1]);
        free(nums);
    }
    return 0;
}
'''
        elif slug == "fibonacci":
            driver = '''
int main() {
    int n;
    if (scanf("%d", &n) == 1) printf("%lld\\n", (long long)fib(n));
    return 0;
}
'''
        elif slug == "palindrome-check":
            driver = '''
int main() {
    char s[100005];
    if (fgets(s, sizeof(s), stdin)) {
        int len = strlen(s);
        if (len > 0 && s[len-1] == '\\n') s[len-1] = '\\0';
        int ans = isPalindrome(s);
        printf("%s\\n", ans ? "YES" : "NO");
    }
    return 0;
}
'''
        elif slug == "binary-search":
            driver = '''
int main() {
    int n, target;
    if (scanf("%d %d", &n, &target) == 2) {
        int* nums = (int*)malloc(n * sizeof(int));
        for (int i = 0; i < n; ++i) scanf("%d", &nums[i]);
        printf("%d\\n", search(nums, n, target));
        free(nums);
    }
    return 0;
}
'''
        elif slug == "max-subarray":
            driver = '''
int main() {
    int n;
    if (scanf("%d", &n) == 1) {
        int* nums = (int*)malloc(n * sizeof(int));
        for (int i = 0; i < n; ++i) scanf("%d", &nums[i]);
        printf("%lld\\n", (long long)maxSubArray(nums, n));
        free(nums);
    }
    return 0;
}
'''
        else:
            driver = ""
        return source_code + "\n" + driver

    return source_code


def evaluate_local_submission(
    source_code: str,
    language: str,
    stdin: str = "",
    expected_output: str = "",
    cpu_time_limit: float = 2.0,
    memory_limit: int = 262144,
) -> dict:
    """
    Offline local execution engine for Python submissions when Judge0 is not running.
    Executes code via native subprocess with timeout safeguards and accurate verdicts.
    """
    start_time = time.time()

    if language == "python":
        try:
            proc = subprocess.run(
                [sys.executable, "-c", source_code],
                input=stdin,
                capture_output=True,
                text=True,
                timeout=cpu_time_limit,
            )
            elapsed_ms = (time.time() - start_time) * 1000
            stdout = proc.stdout
            stderr = proc.stderr

            if proc.returncode != 0:
                is_syntax = "SyntaxError" in stderr or "IndentationError" in stderr
                return {
                    "status_id": STATUS_CE if is_syntax else 11,
                    "verdict": "CE" if is_syntax else "RE",
                    "stdout": stdout,
                    "stderr": stderr.strip()[:1000] if not is_syntax else "",
                    "compile_error": stderr.strip() if is_syntax else None,
                    "runtime_ms": elapsed_ms,
                    "memory_kb": None,
                }

            # Check verdict against expected output
            clean_out = stdout.strip().replace("\r\n", "\n")
            clean_exp = expected_output.strip().replace("\r\n", "\n")
            verdict = "AC" if clean_out == clean_exp else "WA"

            return {
                "status_id": STATUS_ACCEPTED if verdict == "AC" else STATUS_WRONG_ANSWER,
                "verdict": verdict,
                "stdout": stdout,
                "stderr": "",
                "compile_error": None,
                "runtime_ms": elapsed_ms,
                "memory_kb": None,
            }

        except subprocess.TimeoutExpired:
            return {
                "status_id": STATUS_TLE,
                "verdict": "TLE",
                "stdout": "",
                "stderr": "",
                "compile_error": None,
                "runtime_ms": cpu_time_limit * 1000,
                "memory_kb": None,
            }
        except Exception as e:
            return {
                "status_id": STATUS_IE,
                "verdict": "IE",
                "stdout": "",
                "stderr": "",
                "compile_error": f"Execution error: {str(e)}",
                "runtime_ms": None,
                "memory_kb": None,
            }

    # For compiled languages when Judge0 container is offline
    return {
        "status_id": STATUS_IE,
        "verdict": "IE",
        "stdout": "",
        "stderr": "",
        "compile_error": "Judge0 container is offline. Please run Judge0 or submit with Python.",
        "runtime_ms": None,
        "memory_kb": None,
    }


def evaluate_submission(
    source_code: str,
    language: str,
    stdin: str = "",
    expected_output: str = "",
    cpu_time_limit: float = 2.0,
    memory_limit: int = 262144,
    problem_slug: Optional[str] = None,
) -> dict:
    """
    Submit to Judge0 and wait for result.
    If Judge0 is unavailable (offline LAN without Docker), gracefully falls back to local runner.
    """
    final_code = inject_hidden_driver(source_code, language, problem_slug)

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
        "source_code": _b64(final_code),
        "language_id": lang_id,
        "stdin": _b64(stdin),
        "expected_output": _b64(expected_output),
        "cpu_time_limit": cpu_time_limit,
        "wall_time_limit": cpu_time_limit + 3,
        "memory_limit": memory_limit,
    }

    try:
        r = requests.post(
            f"{JUDGE0_URL}/submissions?base64_encoded=true&wait=true",
            json=payload,
            timeout=cpu_time_limit + 10,
        )
        r.raise_for_status()
        res = r.json()
    except requests.RequestException:
        # Fall back gracefully to local engine — never surface raw HTTP connection errors
        return evaluate_local_submission(
            source_code=final_code,
            language=language,
            stdin=stdin,
            expected_output=expected_output,
            cpu_time_limit=cpu_time_limit,
            memory_limit=memory_limit,
        )

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
        "compile_error": compile_err if compile_err else None,
        "runtime_ms":   runtime_ms,
        "memory_kb":    memory_kb,
    }


def evaluate_sample_submission(
    source_code: str,
    language: str,
    sample_cases: list,
    cpu_time_limit: float = 2.0,
    memory_limit: int = 262144,
    problem_slug: Optional[str] = None,
) -> dict:
    """
    Sample runner driver: executes source_code strictly against public/sample test cases.
    Injects LeetCode-style driver and provides offline resilience.
    """
    results = []
    overall_verdict = "AC"
    compile_error_text = None

    for idx, tc in enumerate(sample_cases):
        input_data = getattr(tc, "input_data", None) if hasattr(tc, "input_data") else (tc.get("input_data", "") if isinstance(tc, dict) else "")
        expected_output = getattr(tc, "expected_output", None) if hasattr(tc, "expected_output") else (tc.get("expected_output", "") if isinstance(tc, dict) else "")
        tc_id = getattr(tc, "id", None) if hasattr(tc, "id") else (tc.get("id", idx + 1) if isinstance(tc, dict) else idx + 1)

        res = evaluate_submission(
            source_code=source_code,
            language=language,
            stdin=input_data or "",
            expected_output=expected_output or "",
            cpu_time_limit=cpu_time_limit,
            memory_limit=memory_limit,
            problem_slug=problem_slug,
        )

        verdict = res["verdict"]
        passed = (verdict == "AC")

        if verdict == "CE":
            compile_error_text = res["compile_error"]
            overall_verdict = "CE"
            results.append({
                "sample_index": idx + 1,
                "test_case_id": tc_id,
                "input_data": input_data,
                "expected_output": expected_output,
                "actual_output": res["stdout"],
                "stderr": "",
                "compile_error": compile_error_text,
                "runtime_ms": res["runtime_ms"],
                "memory_kb": res["memory_kb"],
                "verdict": "CE",
                "passed": False,
            })
            break

        if overall_verdict == "AC" and verdict != "AC":
            overall_verdict = verdict

        results.append({
            "sample_index": idx + 1,
            "test_case_id": tc_id,
            "input_data": input_data,
            "expected_output": expected_output,
            "actual_output": res["stdout"],
            "stderr": "",
            "compile_error": None,
            "runtime_ms": res["runtime_ms"],
            "memory_kb": res["memory_kb"],
            "verdict": verdict,
            "passed": passed,
        })

    samples_passed = sum(1 for r in results if r["passed"])
    return {
        "status": "done",
        "verdict": overall_verdict,
        "compile_error": compile_error_text,
        "samples_passed": samples_passed,
        "samples_total": len(sample_cases),
        "results": results,
    }
