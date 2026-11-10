"""
Deterministic Mathematical & Analytical Time Complexity Evaluator.
Analyzes AST (Python) and Control Flow / Syntax structures (C, C++, Java) in < 1ms
without external calls or AI models.
"""
import ast
import re
from typing import Dict, Any, List, Optional, Tuple

COMPLEXITY_RANKS: Dict[str, int] = {
    "O(1)": 1,
    "O(log N)": 2,
    "O(N)": 3,
    "O(N log N)": 4,
    "O(N^2)": 5,
    "O(N^3)": 6,
    "O(2^N)": 7,
    "O(N!)": 8,
}

RANK_TO_COMPLEXITY: Dict[int, str] = {v: k for k, v in COMPLEXITY_RANKS.items()}


def normalize_complexity(s: Optional[str]) -> str:
    """Normalize input string to standard complexity notation."""
    if not s:
        return "O(N)"
    clean = s.strip().replace(" ", "").upper()
    mapping = {
        "O(1)": "O(1)",
        "O(LOGN)": "O(log N)",
        "O(LOG(N))": "O(log N)",
        "O(N)": "O(N)",
        "O(NLOGN)": "O(N log N)",
        "O(N*LOGN)": "O(N log N)",
        "O(NLOG(N))": "O(N log N)",
        "O(N^2)": "O(N^2)",
        "O(N**2)": "O(N^2)",
        "O(N^3)": "O(N^3)",
        "O(N**3)": "O(N^3)",
        "O(2^N)": "O(2^N)",
        "O(2**N)": "O(2^N)",
        "O(N!)": "O(N!)",
    }
    return mapping.get(clean, s.strip())


def compare_complexity(calculated: str, expected: str) -> Dict[str, Any]:
    """
    Compares the calculated time complexity against the expected/optimal complexity.
    Returns:
      - is_optimal (bool): True if calculated <= expected rank
      - verdict (str): 'OPTIMAL' or 'SUBOPTIMAL'
      - calculated (str): Normalized calculated complexity
      - expected (str): Normalized expected complexity
    """
    norm_calc = normalize_complexity(calculated)
    norm_exp = normalize_complexity(expected)

    rank_calc = COMPLEXITY_RANKS.get(norm_calc, 3)
    rank_exp = COMPLEXITY_RANKS.get(norm_exp, 3)

    if rank_calc <= rank_exp:
        verdict = "OPTIMAL"
        is_optimal = True
    elif rank_calc == rank_exp + 1:
        verdict = "ACCEPTABLE"
        is_optimal = False
    else:
        verdict = "SUBOPTIMAL"
        is_optimal = False

    return {
        "is_optimal": is_optimal,
        "verdict": verdict,
        "calculated": norm_calc,
        "expected": norm_exp,
        "rank_diff": rank_calc - rank_exp,
    }


# ---------------------------------------------------------------------------
# Python AST Complexity Evaluator
# ---------------------------------------------------------------------------
class PythonASTComplexityAnalyzer(ast.NodeVisitor):
    def __init__(self):
        self.linear_loop_depth = 0
        self.max_linear_depth = 0
        self.log_loop_depth = 0
        self.max_log_depth = 0
        self.has_builtin_sort = False
        self.has_builtin_linear_collection = False
        self.recursive_functions: Dict[str, Dict[str, Any]] = {}
        self.memoized_functions: set = set()
        self.current_func_name: Optional[str] = None

    def _is_constant_bound(self, node: ast.AST) -> bool:
        """Check if an iterable / range bound is a literal constant (e.g. range(10))."""
        if isinstance(node, ast.Constant):
            return True
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id == "range":
                if node.args and all(isinstance(a, (ast.Constant, ast.UnaryOp)) for a in node.args):
                    return True
        if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            return all(isinstance(elt, ast.Constant) for elt in node.elts)
        return False

    def _get_expr_degree(self, node: ast.AST) -> int:
        """Estimate the polynomial degree of an expression in terms of N."""
        if isinstance(node, (ast.Constant, ast.UnaryOp)):
            return 0
        if isinstance(node, ast.Name):
            return 1
        if isinstance(node, ast.Call):
            func_name = ""
            if isinstance(node.func, ast.Name):
                func_name = node.func.id
            if func_name == "len":
                return 1
            if func_name == "pow" and len(node.args) >= 2:
                base_deg = self._get_expr_degree(node.args[0]) or 1
                if isinstance(node.args[1], ast.Constant) and isinstance(node.args[1].value, (int, float)):
                    return int(base_deg * node.args[1].value)
                return base_deg * 2
            return 1
        if isinstance(node, ast.BinOp):
            if isinstance(node.op, ast.Mult):
                d1 = self._get_expr_degree(node.left)
                d2 = self._get_expr_degree(node.right)
                return (d1 + d2) if (d1 > 0 and d2 > 0) else max(d1, d2, 1)
            if isinstance(node.op, ast.Pow):
                base_deg = self._get_expr_degree(node.left) or 1
                if isinstance(node.right, ast.Constant) and isinstance(node.right.value, (int, float)):
                    return int(base_deg * node.right.value)
                return base_deg * 2
            if isinstance(node.op, ast.BitXor):
                # Common math convention where user writes n^2 meaning n squared
                base_deg = self._get_expr_degree(node.left) or 1
                if isinstance(node.right, ast.Constant) and node.right.value in (2, 3, 4):
                    return int(base_deg * node.right.value)
                return max(self._get_expr_degree(node.left), self._get_expr_degree(node.right), 1)
            if isinstance(node.op, (ast.Add, ast.Sub)):
                return max(self._get_expr_degree(node.left), self._get_expr_degree(node.right))
        return 1

    def _get_loop_degree(self, iter_node: ast.AST) -> int:
        if self._is_constant_bound(iter_node):
            return 0
        if isinstance(iter_node, ast.Call):
            if isinstance(iter_node.func, ast.Name) and iter_node.func.id == "range":
                if iter_node.args:
                    limit_arg = iter_node.args[-1] if len(iter_node.args) <= 2 else iter_node.args[1]
                    return max(1, self._get_expr_degree(limit_arg))
        return 1

    def visit_FunctionDef(self, node: ast.FunctionDef):
        prev_func = self.current_func_name
        self.current_func_name = node.name

        # Check for memoization decorator
        for dec in node.decorator_list:
            dec_id = ""
            if isinstance(dec, ast.Name):
                dec_id = dec.id
            elif isinstance(dec, ast.Call) and isinstance(dec.func, ast.Name):
                dec_id = dec.func.id
            if dec_id in ("lru_cache", "cache"):
                self.memoized_functions.add(node.name)

        self.recursive_functions[node.name] = {
            "call_count": 0,
            "has_division_step": False,
            "has_subtraction_step": False,
            "has_memo_check": False,
        }

        self.generic_visit(node)
        self.current_func_name = prev_func

    def visit_For(self, node: ast.For):
        deg = self._get_loop_degree(node.iter)

        if deg > 0:
            self.linear_loop_depth += deg
            if self.linear_loop_depth > self.max_linear_depth:
                self.max_linear_depth = self.linear_loop_depth

        self.generic_visit(node)

        if deg > 0:
            self.linear_loop_depth -= deg

    def visit_While(self, node: ast.While):
        # Analyze loop step to detect logarithmic vs linear progression
        is_logarithmic = False
        for child in ast.walk(node):
            if isinstance(child, ast.AugAssign):
                # Multiplication / division or bitwise shift steps -> log N
                if isinstance(child.op, (ast.FloorDiv, ast.Div, ast.Mult, ast.LShift, ast.RShift)):
                    is_logarithmic = True
            elif isinstance(child, ast.Assign):
                for target in child.targets:
                    if isinstance(target, ast.Name) and target.id in ("low", "high", "left", "right", "mid", "l", "r"):
                        is_logarithmic = True

        if is_logarithmic:
            self.log_loop_depth += 1
            if self.log_loop_depth > self.max_log_depth:
                self.max_log_depth = self.log_loop_depth
        else:
            # Check if while condition tests a polynomial bound: while i < n * n or while i < n ** 2
            deg = 1
            if isinstance(node.test, ast.Compare):
                for comp in node.test.comparators:
                    deg = max(deg, self._get_expr_degree(comp))

            self.linear_loop_depth += deg
            if self.linear_loop_depth > self.max_linear_depth:
                self.max_linear_depth = self.linear_loop_depth

        self.generic_visit(node)

        if is_logarithmic:
            self.log_loop_depth -= 1
        else:
            deg = 1
            if isinstance(node.test, ast.Compare):
                for comp in node.test.comparators:
                    deg = max(deg, self._get_expr_degree(comp))
            self.linear_loop_depth -= deg

    def _handle_comprehension(self, generators: List[ast.comprehension]):
        total_deg = 0
        for gen in generators:
            deg = self._get_loop_degree(gen.iter)
            total_deg += deg

        if total_deg > 0:
            self.linear_loop_depth += total_deg
            if self.linear_loop_depth > self.max_linear_depth:
                self.max_linear_depth = self.linear_loop_depth

        return total_deg

    def visit_ListComp(self, node: ast.ListComp):
        deg = self._handle_comprehension(node.generators)
        self.generic_visit(node)
        self.linear_loop_depth -= deg

    def visit_SetComp(self, node: ast.SetComp):
        deg = self._handle_comprehension(node.generators)
        self.generic_visit(node)
        self.linear_loop_depth -= deg

    def visit_DictComp(self, node: ast.DictComp):
        deg = self._handle_comprehension(node.generators)
        self.generic_visit(node)
        self.linear_loop_depth -= deg

    def visit_GeneratorExp(self, node: ast.GeneratorExp):
        deg = self._handle_comprehension(node.generators)
        self.generic_visit(node)
        self.linear_loop_depth -= deg

    def visit_Call(self, node: ast.Call):
        func_name = ""
        if isinstance(node.func, ast.Name):
            func_name = node.func.id
        elif isinstance(node.func, ast.Attribute):
            func_name = node.func.attr

        # Sorting detection -> O(N log N)
        if func_name in ("sort", "sorted"):
            self.has_builtin_sort = True

        # Linear operations on collections: e.g. sum(nums), max(nums), min(nums)
        # Note: max(a, b) with 2+ scalar arguments is O(1). Only single iterable argument is O(N).
        if func_name in ("sum", "count"):
            if self.linear_loop_depth > 0:
                self.has_builtin_linear_collection = True
        elif func_name in ("min", "max"):
            if len(node.args) == 1:
                # e.g. max(nums)
                if self.linear_loop_depth > 0:
                    self.has_builtin_linear_collection = True

        # Recursion check
        if self.current_func_name and func_name == self.current_func_name:
            rec_info = self.recursive_functions[self.current_func_name]
            rec_info["call_count"] += 1
            for arg in node.args:
                if isinstance(arg, ast.BinOp):
                    if isinstance(arg.op, (ast.FloorDiv, ast.Div, ast.RShift)):
                        rec_info["has_division_step"] = True
                    elif isinstance(arg.op, ast.Sub):
                        rec_info["has_subtraction_step"] = True

        self.generic_visit(node)

    def visit_Subscript(self, node: ast.Subscript):
        # Look for memoization dictionary access: memo[...] or dp[...]
        if self.current_func_name:
            if isinstance(node.value, ast.Name) and node.value.id in ("memo", "dp", "cache", "visited"):
                self.recursive_functions[self.current_func_name]["has_memo_check"] = True
        self.generic_visit(node)


def analyze_python_complexity(source_code: str) -> Dict[str, Any]:
    try:
        tree = ast.parse(source_code)
    except SyntaxError:
        return {"complexity": "O(N)", "reason": "Syntax error encountered; defaulting to linear baseline"}

    analyzer = PythonASTComplexityAnalyzer()
    analyzer.visit(tree)

    # 1. Check for branching recursion (e.g. unmemoized Fibonacci -> O(2^N))
    for fname, rinfo in analyzer.recursive_functions.items():
        if rinfo["call_count"] >= 2:
            is_memo = (
                fname in analyzer.memoized_functions
                or rinfo["has_memo_check"]
            )
            if not is_memo:
                return {
                    "complexity": "O(2^N)",
                    "reason": f"Unmemoized branching recursion detected in `{fname}` (branching factor >= 2)"
                }
            elif rinfo["has_division_step"]:
                return {
                    "complexity": "O(N log N)",
                    "reason": f"Divide-and-conquer recursion with memoization in `{fname}`"
                }
            else:
                return {
                    "complexity": "O(N)",
                    "reason": f"Memoized branching recursion in `{fname}`"
                }
        elif rinfo["call_count"] == 1:
            if rinfo["has_division_step"]:
                return {
                    "complexity": "O(log N)",
                    "reason": f"Divide-and-conquer logarithmic recursion in `{fname}`"
                }
            else:
                # Single linear recursion with loop inside
                if analyzer.max_linear_depth >= 1:
                    return {
                        "complexity": f"O(N^{analyzer.max_linear_depth + 1})",
                        "reason": f"Linear recursion in `{fname}` enclosing loop depth {analyzer.max_linear_depth}"
                    }
                return {
                    "complexity": "O(N)",
                    "reason": f"Linear recursion in `{fname}`"
                }

    # 2. Check for sorting calls
    if analyzer.has_builtin_sort:
        if analyzer.max_linear_depth == 0:
            return {"complexity": "O(N log N)", "reason": "Built-in sorting operation detected"}
        elif analyzer.max_linear_depth >= 1:
            return {"complexity": f"O(N^{analyzer.max_linear_depth + 1})", "reason": "Sorting inside loop structure"}

    # 3. Combine linear and log loop depths
    lin_depth = analyzer.max_linear_depth
    if analyzer.has_builtin_linear_collection and lin_depth >= 1:
        lin_depth += 1

    log_depth = analyzer.max_log_depth

    if lin_depth == 0 and log_depth == 0:
        return {"complexity": "O(1)", "reason": "Constant time execution with no asymptotic loops"}
    elif lin_depth == 0 and log_depth >= 1:
        return {"complexity": "O(log N)", "reason": "Logarithmic loop structure with division/shift stride"}
    elif lin_depth == 1 and log_depth == 0:
        return {"complexity": "O(N)", "reason": "Single linear loop iteration over dataset"}
    elif lin_depth == 1 and log_depth >= 1:
        return {"complexity": "O(N log N)", "reason": "Linear loop enclosing logarithmic operation"}
    elif lin_depth == 2 and log_depth == 0:
        return {"complexity": "O(N^2)", "reason": "Nested loop structure (depth 2)"}
    elif lin_depth == 2 and log_depth >= 1:
        return {"complexity": "O(N^2 log N)", "reason": "Nested loops enclosing logarithmic operation"}
    elif lin_depth == 3:
        return {"complexity": "O(N^3)", "reason": "Cubic nested loop structure (depth 3)"}
    else:
        return {"complexity": f"O(N^{lin_depth})", "reason": f"Polynomial nested loop structure (depth {lin_depth})"}


# ---------------------------------------------------------------------------
# C, C++, Java Lexical & Control Flow Complexity Evaluator
# ---------------------------------------------------------------------------
def analyze_lexical_complexity(source_code: str, language: str) -> Dict[str, Any]:
    cleaned = re.sub(r'//.*', '', source_code)
    cleaned = re.sub(r'/\*[\s\S]*?\*/', '', cleaned)
    cleaned = re.sub(r'"(\\.|[^"\\])*"', '""', cleaned)
    cleaned = re.sub(r"'(\\.|[^'\\])*'", "''", cleaned)

    # 1. Check for sorting library calls
    has_sort = bool(re.search(r'\b(std::sort|sort|Arrays\.sort|Collections\.sort|qsort)\s*\(', cleaned))

    # 2. Check for recursion (branching factor)
    func_pattern = re.compile(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{')
    for match in func_pattern.finditer(cleaned):
        fname = match.group(1)
        if fname in ("main", "if", "while", "for", "switch"):
            continue
        calls = len(re.findall(r'\b' + re.escape(fname) + r'\s*\(', cleaned))
        if calls >= 3:
            if not re.search(r'\b(memo|dp|visited|cache)\s*\[', cleaned):
                return {
                    "complexity": "O(2^N)",
                    "reason": f"Unmemoized multiple recursive calls to `{fname}` detected"
                }

    # 3. Analyze loop nesting depth and logarithmic strides
    max_lin_depth = 0
    cur_lin_depth = 0
    max_log_depth = 0
    cur_log_depth = 0

    tokens = re.findall(r'(for\s*\([^)]*\)|while\s*\([^)]*\)|\{|\})', cleaned)
    for tok in tokens:
        if tok.startswith("for") or tok.startswith("while"):
            # Constant bounded loop: e.g. for (int i = 0; i < 4; i++)
            if re.search(r'<\s*\d+\s*;', tok) or re.search(r'<=\s*\d+\s*;', tok):
                continue

            if re.search(r'(\*=|/=|>>=|<<=|/\s*2|\*\s*2)', tok):
                cur_log_depth += 1
                if cur_log_depth > max_log_depth:
                    max_log_depth = cur_log_depth
            else:
                cur_lin_depth += 1
                if cur_lin_depth > max_lin_depth:
                    max_lin_depth = cur_lin_depth

        elif tok == "}":
            if cur_lin_depth > 0:
                cur_lin_depth -= 1
            elif cur_log_depth > 0:
                cur_log_depth -= 1

    if has_sort:
        if max_lin_depth == 0:
            return {"complexity": "O(N log N)", "reason": "Standard library sorting routine detected"}
        else:
            return {"complexity": f"O(N^{max_lin_depth + 1})", "reason": "Sorting routine nested within loop structure"}

    if max_lin_depth == 0 and max_log_depth == 0:
        return {"complexity": "O(1)", "reason": "Constant time algorithm with no asymptotic loops"}
    elif max_lin_depth == 0 and max_log_depth >= 1:
        return {"complexity": "O(log N)", "reason": "Logarithmic loop stride detected"}
    elif max_lin_depth == 1 and max_log_depth == 0:
        return {"complexity": "O(N)", "reason": "Single linear iteration loop"}
    elif max_lin_depth == 1 and max_log_depth >= 1:
        return {"complexity": "O(N log N)", "reason": "Linear loop enclosing logarithmic operation"}
    elif max_lin_depth == 2:
        return {"complexity": "O(N^2)", "reason": "Nested iteration loops (depth 2)"}
    elif max_lin_depth == 3:
        return {"complexity": "O(N^3)", "reason": "Triple nested iteration loops (depth 3)"}
    else:
        return {"complexity": f"O(N^{max_lin_depth})", "reason": f"Polynomial nested iteration loops (depth {max_lin_depth})"}


# ---------------------------------------------------------------------------
# Unified Public API
# ---------------------------------------------------------------------------
def evaluate_time_complexity(
    source_code: str,
    language: str,
    expected_complexity: Optional[str] = None
) -> Dict[str, Any]:
    """
    Evaluates source code time complexity in real-time.
    Optionally compares against expected complexity if provided.
    """
    lang = (language or "python").lower().strip()
    if lang == "python":
        analysis = analyze_python_complexity(source_code)
    else:
        analysis = analyze_lexical_complexity(source_code, lang)

    calc = analysis["complexity"]
    res = {
        "calculated_complexity": calc,
        "reason": analysis.get("reason", ""),
        "rank": COMPLEXITY_RANKS.get(calc, 3),
    }

    if expected_complexity:
        cmp_res = compare_complexity(calc, expected_complexity)
        res["expected_complexity"] = cmp_res["expected"]
        res["is_optimal"] = cmp_res["is_optimal"]
        res["verdict"] = cmp_res["verdict"]
        res["rank_diff"] = cmp_res["rank_diff"]

    return res
