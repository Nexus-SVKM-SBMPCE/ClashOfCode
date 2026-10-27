"""
Database seeder: demo accounts, sample DSA problems, and hidden test cases.
Safe to run multiple times (idempotent).
"""
from sqlmodel import Session, select
from app.models import User, Problem, TestCase, Batch, BATCH_STATUS_NOT_STARTED
from app.auth import hash_password


# ---------------------------------------------------------------------------
# Demo users
# ---------------------------------------------------------------------------
DEMO_USERS = [
    {"username": "admin",       "password": "admin123",  "display_name": "Admin",         "role": "admin"},
    {"username": "contestant1", "password": "pass123",   "display_name": "Alice Chen",    "role": "contestant"},
    {"username": "contestant2", "password": "pass123",   "display_name": "Bob Patel",     "role": "contestant"},
    {"username": "contestant3", "password": "pass123",   "display_name": "Chloe Sharma",  "role": "contestant"},
    {"username": "contestant4", "password": "pass123",   "display_name": "Dev Kumar",     "role": "contestant"},
    {"username": "contestant5", "password": "pass123",   "display_name": "Eva Mehta",     "role": "contestant"},
]


# ---------------------------------------------------------------------------
# DSA Problems with hidden test cases
# ---------------------------------------------------------------------------
PROBLEMS = [
    {
        "slug": "two-sum",
        "title": "Two Sum",
        "difficulty": "easy",
        "time_limit_sec": 2.0,
        "memory_limit_kb": 262144,
        "statement": """## Two Sum

Given an array of `n` integers and a target integer `T`, find **two** distinct indices `i` and `j` (1-based) such that `arr[i] + arr[j] == T`.

It is guaranteed exactly one solution exists.

### Input Format
- Line 1: Two integers `n` and `T`
- Line 2: `n` space-separated integers

### Output Format
Print two space-separated 1-based indices `i j` where `i < j`.

### Constraints
- `2 ≤ n ≤ 10,000`
- `-10^9 ≤ arr[i] ≤ 10^9`
- `-2×10^9 ≤ T ≤ 2×10^9`

### Sample Input
```
5 9
2 7 11 15 4
```

### Sample Output
```
1 2
```
""",
        "test_cases": [
            # Sample (visible)
            {"input": "5 9\n2 7 11 15 4\n",      "output": "1 2\n",   "is_sample": True},
            # Hidden
            {"input": "4 6\n1 2 3 4\n",           "output": "2 4\n",   "is_sample": False},
            {"input": "2 0\n-1 1\n",              "output": "1 2\n",   "is_sample": False},
            {"input": "6 10\n3 2 4 1 9 5\n",      "output": "4 5\n",   "is_sample": False},
            {"input": "3 -5\n-3 -2 5\n",          "output": "1 2\n",   "is_sample": False},
        ],
    },
    {
        "slug": "fibonacci",
        "title": "Fibonacci Number",
        "difficulty": "easy",
        "time_limit_sec": 2.0,
        "memory_limit_kb": 262144,
        "statement": """## Fibonacci Number

Given `n`, print the n-th Fibonacci number (0-indexed, F(0)=0, F(1)=1).

### Input Format
A single integer `n`.

### Output Format
A single integer — the n-th Fibonacci number.

### Constraints
- `0 ≤ n ≤ 50`

### Sample Input
```
10
```

### Sample Output
```
55
```
""",
        "test_cases": [
            {"input": "10\n",  "output": "55\n",               "is_sample": True},
            {"input": "0\n",   "output": "0\n",                "is_sample": False},
            {"input": "1\n",   "output": "1\n",                "is_sample": False},
            {"input": "20\n",  "output": "6765\n",             "is_sample": False},
            {"input": "50\n",  "output": "12586269025\n",      "is_sample": False},
        ],
    },
    {
        "slug": "palindrome-check",
        "title": "Palindrome Check",
        "difficulty": "easy",
        "time_limit_sec": 2.0,
        "memory_limit_kb": 262144,
        "statement": """## Palindrome Check

Given a string `S`, determine if it is a palindrome. Ignore case and non-alphanumeric characters.

### Input Format
A single line containing the string `S`.

### Output Format
Print `YES` if it is a palindrome, otherwise `NO`.

### Constraints
- `1 ≤ |S| ≤ 10^5`

### Sample Input
```
A man a plan a canal Panama
```

### Sample Output
```
YES
```
""",
        "test_cases": [
            {"input": "A man a plan a canal Panama\n",  "output": "YES\n",  "is_sample": True},
            {"input": "hello\n",                        "output": "NO\n",   "is_sample": False},
            {"input": "racecar\n",                      "output": "YES\n",  "is_sample": False},
            {"input": "Was it a car or a cat I saw\n",  "output": "YES\n",  "is_sample": False},
            {"input": "OpenAI\n",                       "output": "NO\n",   "is_sample": False},
        ],
    },
    {
        "slug": "binary-search",
        "title": "Binary Search",
        "difficulty": "medium",
        "time_limit_sec": 2.0,
        "memory_limit_kb": 262144,
        "statement": """## Binary Search

Given a **sorted** array of `n` distinct integers and a target `T`, find the 1-based index of `T`. If not found, output `-1`.

### Input Format
- Line 1: Two integers `n` and `T`
- Line 2: `n` space-separated sorted integers

### Output Format
A single integer — the 1-based index of `T`, or `-1`.

### Constraints
- `1 ≤ n ≤ 10^6`
- `-10^9 ≤ arr[i], T ≤ 10^9`

### Sample Input
```
7 23
1 5 9 12 17 23 45
```

### Sample Output
```
6
```
""",
        "test_cases": [
            {"input": "7 23\n1 5 9 12 17 23 45\n",   "output": "6\n",   "is_sample": True},
            {"input": "5 3\n1 2 3 4 5\n",             "output": "3\n",   "is_sample": False},
            {"input": "5 6\n1 2 3 4 5\n",             "output": "-1\n",  "is_sample": False},
            {"input": "1 100\n100\n",                  "output": "1\n",   "is_sample": False},
            {"input": "3 5\n1 3 7\n",                  "output": "-1\n",  "is_sample": False},
        ],
    },
    {
        "slug": "max-subarray",
        "title": "Maximum Subarray Sum",
        "difficulty": "medium",
        "time_limit_sec": 2.0,
        "memory_limit_kb": 262144,
        "statement": """## Maximum Subarray Sum (Kadane's Algorithm)

Given an array of `n` integers, find the maximum sum of any contiguous subarray.

### Input Format
- Line 1: Integer `n`
- Line 2: `n` space-separated integers

### Output Format
A single integer — the maximum subarray sum.

### Constraints
- `1 ≤ n ≤ 10^5`
- `-10^4 ≤ arr[i] ≤ 10^4`

### Sample Input
```
8
-2 1 -3 4 -1 2 1 -5 4
```

### Sample Output
```
6
```
""",
        "test_cases": [
            {"input": "9\n-2 1 -3 4 -1 2 1 -5 4\n",   "output": "6\n",    "is_sample": True},
            {"input": "1\n-5\n",                        "output": "-5\n",   "is_sample": False},
            {"input": "3\n1 2 3\n",                     "output": "6\n",    "is_sample": False},
            {"input": "5\n-1 -2 -3 -4 -5\n",           "output": "-1\n",   "is_sample": False},
            {"input": "6\n5 -3 5 -1 4 -2\n",           "output": "10\n",   "is_sample": False},
        ],
    },
]


def seed(session: Session) -> None:
    """Seed database idempotently."""
    # Users
    for u in DEMO_USERS:
        exists = session.exec(select(User).where(User.username == u["username"])).first()
        if not exists:
            user = User(
                username=u["username"],
                hashed_password=hash_password(u["password"]),
                display_name=u["display_name"],
                role=u["role"],
            )
            session.add(user)
    session.commit()

    # Problems + test cases
    for p_data in PROBLEMS:
        exists = session.exec(select(Problem).where(Problem.slug == p_data["slug"])).first()
        if not exists:
            prob = Problem(
                slug=p_data["slug"],
                title=p_data["title"],
                difficulty=p_data["difficulty"],
                time_limit_sec=p_data["time_limit_sec"],
                memory_limit_kb=p_data["memory_limit_kb"],
                statement=p_data["statement"],
            )
            session.add(prob)
            session.flush()  # get prob.id

            for idx, tc in enumerate(p_data["test_cases"]):
                session.add(TestCase(
                    problem_id=prob.id,
                    order_index=idx,
                    input_data=tc["input"],
                    expected_output=tc["output"],
                    is_sample=tc["is_sample"],
                ))
    session.commit()

    # -----------------------------------------------------------------------
    # Seed default Batch 1 (NOT_STARTED — admin triggers it during the event)
    # -----------------------------------------------------------------------
    existing_batch = session.exec(
        select(Batch).where(Batch.batch_number == 1)
    ).first()
    if not existing_batch:
        session.add(Batch(
            batch_number=1,
            name="Batch 1",
            duration_minutes=60,
            status=BATCH_STATUS_NOT_STARTED,
        ))
        session.commit()
