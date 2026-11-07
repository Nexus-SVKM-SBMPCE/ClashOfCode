import { useEffect, useState, useCallback, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Editor, { type BeforeMount } from '@monaco-editor/react';
import '../monacoSetup';
import { getProblem, submitCode, runSampleCode, getMySubmissions, demoMode } from '../api';
import type { ProblemDetail, Submission, RunResponse } from '../api';
import { useCountdownTimer } from '../useCountdownTimer';
import BattleFinishedModal from '../BattleFinishedModal';
import { useToast } from '../Toast';
import { useAuth } from '../AuthContext';
import { useArena } from '../lib/arena';
import { loadDraft, saveDraft, clearDraft } from '../lib/drafts';
import Balloon from '../components/Balloon';
import Difficulty from '../components/Difficulty';
import Icon from '../components/Icon';
import { useExamSecurity } from '../ExamSecurity';

const LANGUAGES = [
  { id: 'python', label: 'Python 3.8', ext: 'py' },
  { id: 'cpp',    label: 'C++ (GCC 7.4)', ext: 'cpp' },
  { id: 'c',      label: 'C (GCC 7.4)',   ext: 'c' },
  { id: 'java',   label: 'Java 13',        ext: 'java' },
];

const PROBLEM_STARTERS: Record<string, Record<string, string>> = {
  'two-sum': {
    python: `class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        # Return 1-based indices [i, j]
        pass
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        // Return 1-based indices {i, j}
        return {};
    }
};
`,
    java: `import java.util.*;

class Solution {
    public int[] twoSum(int[] nums, int target) {
        // Return 1-based indices [i, j]
        return new int[]{};
    }
}
`,
    c: `#include <stdio.h>
#include <stdlib.h>

int* twoSum(int* nums, int n, int target, int* returnSize) {
    // Return 1-based indices [i, j]
    return NULL;
}
`,
  },
  'fibonacci': {
    python: `class Solution:
    def fib(self, n: int) -> int:
        # Return the n-th Fibonacci number
        pass
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    long long fib(int n) {
        return 0;
    }
};
`,
    java: `import java.util.*;

class Solution {
    public long fib(int n) {
        return 0;
    }
}
`,
    c: `#include <stdio.h>

long long fib(int n) {
    return 0;
}
`,
  },
  'palindrome-check': {
    python: `class Solution:
    def isPalindrome(self, s: str) -> bool:
        # Return True if s is palindrome (ignoring case and non-alphanumeric)
        pass
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    bool isPalindrome(string s) {
        return true;
    }
};
`,
    java: `import java.util.*;

class Solution {
    public boolean isPalindrome(String s) {
        return true;
    }
}
`,
    c: `#include <stdio.h>
#include <stdbool.h>

bool isPalindrome(char* s) {
    return true;
}
`,
  },
  'binary-search': {
    python: `class Solution:
    def search(self, nums: list[int], target: int) -> int:
        # Return 1-based index of target, or -1
        pass
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    int search(vector<int>& nums, int target) {
        return -1;
    }
};
`,
    java: `import java.util.*;

class Solution {
    public int search(int[] nums, int target) {
        return -1;
    }
}
`,
    c: `#include <stdio.h>

int search(int* nums, int n, int target) {
    return -1;
}
`,
  },
  'max-subarray': {
    python: `class Solution:
    def maxSubArray(self, nums: list[int]) -> int:
        # Return maximum contiguous subarray sum
        pass
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    long long maxSubArray(vector<int>& nums) {
        return 0;
    }
};
`,
    java: `import java.util.*;

class Solution {
    public long maxSubArray(int[] nums) {
        return 0;
    }
}
`,
    c: `#include <stdio.h>

long long maxSubArray(int* nums, int n) {
    return 0;
}
`,
  },
};

const getStarterDrafts = (problemSlug?: string): Record<string, string> => {
  const specific = problemSlug ? PROBLEM_STARTERS[problemSlug] : undefined;
  return {
    python: specific?.python || STARTERS.python,
    cpp: specific?.cpp || STARTERS.cpp,
    c: specific?.c || STARTERS.c,
    java: specific?.java || STARTERS.java,
  };
};

const STARTERS: Record<string, string> = {
  python: `# Read input and write output
import sys
input = sys.stdin.readline

def solve():
    pass

solve()
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    // Your solution here

    return 0;
}
`,
  c: `#include <stdio.h>
#include <stdlib.h>

int main() {
    // Your solution here

    return 0;
}
`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        Scanner sc = new Scanner(System.in);
        // Your solution here
    }
}
`,
};

const VERDICT_LABEL: Record<string, string> = {
  AC: 'Victory!', WA: 'Defeated', TLE: 'Time Exceeded', MLE: 'Memory Exceeded',
  CE: 'Spell Error', RE: 'Catastrophic Failure', IE: 'War Council Error',
};
const VERDICT_TONE: Record<string, string> = {
  AC: 'tone-ac', WA: 'tone-wa', TLE: 'tone-pending', MLE: 'tone-pending', CE: 'tone-ce', RE: 'tone-wa', IE: 'tone-muted',
};

const SPLIT_KEY = 'cc-split';
const clampSplit = (v: number) => Math.min(70, Math.max(25, v));

function fmtRuntime(ms: number | null) {
  if (ms === null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}
function fmtMemory(kb: number | null) {
  if (kb === null) return '—';
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

// Editor colours — CoC dark fortress theme
const defineTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('clash', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b6b55', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'f5a623' },
      { token: 'string', foreground: '4ade80' },
      { token: 'number', foreground: 'ffd700' },
      { token: 'type', foreground: 'd946ef' },
    ],
    colors: {
      'editor.background': '#0a0e1a',
      'editor.lineHighlightBackground': '#141b2d',
      'editorLineNumber.foreground': '#5c4a2e',
      'editorLineNumber.activeForeground': '#f5a623',
      'editorCursor.foreground': '#ffd700',
      'editor.selectionBackground': '#f5a62333',
      'editorIndentGuide.background1': '#1a2340',
      'editorWidget.background': '#141b2d',
      'editorWidget.border': '#3d4f7a',
      'scrollbarSlider.background': '#3d4f7a80',
      'editor.findMatchBackground': '#f5a62340',
      'editor.findMatchHighlightBackground': '#f5a62320',
    },
  });
};

/** One tick per test case: passed vs failed (the API exposes the pass count only). */
function TestsBar({ passed, total }: { passed: number; total: number }) {
  if (total <= 0 || total > 40) return null;
  return (
    <span className="tests-bar" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => <span key={i} className={i < passed ? 'pass' : 'fail'} />)}
    </span>
  );
}

/** Score line, straight from the API: "6/10 tests passed · 60 +3 bonus = 63 pts". */
function ScoreLine({ sub, simulated }: { sub: Submission; simulated: boolean }) {
  if (sub.verdict === 'IE') return <span className="strip-score">Not your code — the war council was unavailable. Please resubmit.</span>;
  const tests = sub.tests_total > 0 && sub.verdict !== 'CE'
    ? <><span className="mono">{sub.tests_passed}/{sub.tests_total}</span> tests passed · </>
    : null;
  if (simulated) return <span className="strip-score">{tests}<span className="demo-tag">Demo · simulated, not scored</span></span>;
  return (
    <span className="strip-score">
      {tests}
      {sub.bonus_points > 0
        ? <span><b>{sub.test_score}</b> <span className="plus">+{sub.bonus_points}</span> bonus = <b>{sub.score}</b> pts</span>
        : <span><b>{sub.score}</b> pts</span>}
    </span>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { addToast } = useToast();
  const copy = () => {
    if (!navigator.clipboard) { addToast('Copy is not available in this browser', 'error'); return; }
    navigator.clipboard.writeText(text).then(
      () => addToast(`${label} copied`, 'success'),
      () => addToast('Copy is not available in this browser', 'error'),
    );
  };
  return (
    <button className="btn btn-ghost btn-icon" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`} title="Copy">
      <Icon name="copy" size={13} />
    </button>
  );
}

/** Text content of a rendered markdown node, for the copy button on code blocks. */
function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'props' in node) return textOf((node as { props: { children?: unknown } }).props.children);
  return '';
}

// Statement code blocks (sample I/O) get a copy button
// Statement headings sit under the pane's h1, so markdown h3 renders as h2 for a valid outline
const MD_COMPONENTS: Components = {
  h3: ({ children }) => <h2 className="md-h3">{children}</h2>,
  pre: ({ children }) => (
    <pre>
      {children}
      <span className="pre-copy"><CopyButton text={textOf(children)} label="Code block" /></span>
    </pre>
  ),
};

interface EditorState {
  slug: string | undefined;
  lang: string;
  drafts: Record<string, string>;
  note: 'restored' | 'saved' | null;   // draft status shown in the toolbar
  savedAt: number;
}

/** API errors carry `detail` as a plain string or as `{ code, message }`. */
function errorText(e: any): string {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (d && typeof d.message === 'string') return d.message;
  return e?.message ?? 'Unknown error';
}

export default function ProblemPage() {
  const { slug } = useParams<{ slug: string }>();
  // Sanchita: contest expiry — lock editor and show modal when COMPLETED
  const { status: timerStatus } = useCountdownTimer();
  const isContestEnded = timerStatus === 'COMPLETED';

  const { addToast } = useToast();
  const { user } = useAuth();
  // Exam security (copy/paste blocking, strikes, lock) is enforced app-wide by
  // ExamSecurityProvider; here we only disable Monaco's own clipboard menu / drop for
  // contestants and freeze the editor once the server has locked the attempt.
  const isContestant = user?.role === 'contestant';
  const { locked: securityLocked } = useExamSecurity();
  // An admin's submission list spans every team, so solved balloons are contestant-only.
  const { problems, allProblems, status } = useArena(user?.role !== 'admin');

  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Code state: per-language drafts (switching language never throws work away) that are also
  // persisted per team + problem, so leaving to solve another quest first and coming back restores
  // the code. Re-initialised *during render* when the quest changes — an effect would paint one
  // frame of the previous quest's code under the new title.
  const owner = String(user?.id ?? user?.username ?? 'anon');
  const restoreFor = (s: string | undefined): EditorState => {
    const starters = getStarterDrafts(s);
    const saved = s ? loadDraft(owner, s, starters) : null;
    return {
      slug: s,
      lang: saved?.lang ?? 'python',
      drafts: saved?.drafts ?? starters,
      note: saved ? 'restored' : null,
      savedAt: saved?.savedAt ?? 0,
    };
  };
  const [editor, setEditor] = useState(() => restoreFor(slug));
  if (editor.slug !== slug) setEditor(restoreFor(slug));
  const { lang, drafts } = editor;
  const code = drafts[lang];

  const persist = (nextLang: string, nextDrafts: Record<string, string>) => {
    if (!slug) return;
    const savedAt = saveDraft(owner, slug, nextLang, nextDrafts, getStarterDrafts(slug));
    setEditor((e) => ({ ...e, lang: nextLang, drafts: nextDrafts, note: savedAt ? 'saved' : null, savedAt: savedAt ?? 0 }));
  };
  const setCode = (v: string) => persist(lang, { ...drafts, [lang]: v });
  const setLang = (l: string) => persist(l, drafts);

  // Single-submission rule: once this quest has its one official submission, the forge is sealed
  const [sealed, setSealed] = useState(false);

  // Because a submission is final, the first Attack press only *arms* the button for a few seconds;
  // the second press sends it. Guards against a stray Ctrl+Enter spending the team's only attempt.
  // Admins aren't limited to one submission, so they skip the confirm step.
  const oneShot = user?.role !== 'admin';
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const disarm = useCallback(() => {
    clearTimeout(armTimer.current);
    setArmed(false);
  }, []);
  useEffect(() => () => clearTimeout(armTimer.current), []);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<Submission | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [selectedSampleTab, setSelectedSampleTab] = useState<number>(0);
  const [detailOpen, setDetailOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'problem' | 'submissions'>('problem');
  // Narrow screens show one pane at a time
  const [pane, setPane] = useState<'problem' | 'code'>('problem');
  const [split, setSplit] = useState(() => {
    try { return clampSplit(Number(localStorage.getItem(SPLIT_KEY)) || 44); } catch { return 44; }
  });
  const [dragging, setDragging] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slug) return;
    setProblem(null);
    setLoadError(null);
    setLastResult(null);
    setRunResult(null);
    setRunning(false);
    setSealed(false);
    disarm();
    getProblem(slug)
      .then((r) => setProblem(r.data))
      .catch((e) => setLoadError(
        e.response?.data?.detail?.code === 'ALREADY_SUBMITTED' ? 'This quest is sealed — your one submission is already in the war council’s hands.'
          : e.response?.status === 404 ? 'Quest not found in the war archives.'
          : 'Could not load this quest. Is the fortress backend running?'));
    getMySubmissions(slug)
      .then((r) => setSubmissions(r.data))
      .catch(() => setSubmissions([]));
  }, [slug, disarm]);

  useEffect(() => {
    try { localStorage.setItem(SPLIT_KEY, String(Math.round(split))); } catch { /* preference only */ }
  }, [split]);

  const handleRun = useCallback(async () => {
    if (!slug || running || submitting || isContestEnded || sealed) return;
    setRunning(true);
    setRunResult(null);
    try {
      const res = await runSampleCode(slug, lang, code);
      setRunResult(res.data);
      setSelectedSampleTab(0);
      if (res.data.verdict === 'AC') {
        addToast(`⚡ Sample Tests Passed (${res.data.samples_passed}/${res.data.samples_total})`, 'success');
      } else if (res.data.verdict === 'CE') {
        addToast('Spell Error on sample tests', 'error');
      } else {
        addToast(`Sample tests: ${res.data.samples_passed}/${res.data.samples_total} passed`, 'info');
      }
    } catch (e: any) {
      if (e.response?.data?.detail?.code === 'ALREADY_SUBMITTED') setSealed(true);
      addToast('Run failed: ' + errorText(e), 'error');
    } finally {
      setRunning(false);
    }
  }, [slug, lang, code, running, submitting, isContestEnded, sealed, addToast]);

  const submit = useCallback(async () => {
    if (!slug || submitting || running || isContestEnded || sealed) return;
    if (oneShot && !armed) {
      setArmed(true);
      clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(false), 5000);
      return;
    }
    disarm();
    setSubmitting(true);
    setLastResult(null);
    try {
      const res = await submitCode(slug, lang, code);
      setLastResult(res.data);
      setDetailOpen(true);
      setSubmissions((prev) => [res.data, ...prev]);
      window.dispatchEvent(new Event('submission:created'));
      if (res.data.verdict === 'IE') addToast('The war council is unavailable. Please resubmit.', 'error');
      else if (res.data.verdict === 'AC') addToast(`⚔️ Victory! +${res.data.score} pts`, 'success');
      else if (res.data.score > 0) addToast(`Partial conquest: +${res.data.score} pts`, 'info');
      // The one official attempt is spent (a judge error is not the team's fault, so it isn't)
      if (res.data.verdict !== 'IE') { setSealed(true); clearDraft(owner, slug); }
    } catch (e: any) {
      if (e.response?.status === 409) setSealed(true); // already submitted (second tab / double click)
      addToast('Attack failed: ' + errorText(e), 'error');
    } finally {
      setSubmitting(false);
    }
  }, [slug, lang, code, owner, submitting, running, isContestEnded, sealed, oneShot, armed, disarm, addToast]);

  // Monaco registers its keybinding once, so route it through a ref to the latest submit
  const submitRef = useRef(submit);
  useEffect(() => { submitRef.current = submit; }, [submit]);

  // Drag the seam between statement and editor (hidden on narrow screens)
  const onResizeStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || !splitRef.current) return;
    const rect = splitRef.current.getBoundingClientRect();
    setSplit(clampSplit(((e.clientX - rect.left) / rect.width) * 100));
  };
  const onResizeKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') { setSplit((s) => clampSplit(s - 2)); e.preventDefault(); }
    if (e.key === 'ArrowRight') { setSplit((s) => clampSplit(s + 2)); e.preventDefault(); }
  };

  if (loadError) return (
    <div className="state state-error">
      <Icon name="alert" size={22} className="state-icon" />
      <p className="state-title">{loadError}</p>
      <Link to="/problems" className="btn"><Icon name="chevronLeft" size={14} /> Back to quests</Link>
    </div>
  );
  if (!problem) return <div className="state"><span className="spinner" /> Summoning quest…</div>;

  // allProblems, not problems: the quest you're on is hidden from the list once submitted,
  // but its title balloon should keep showing while you read the verdict.
  const current = allProblems.find((p) => p.slug === problem.slug);
  const editorLocked = isContestEnded || sealed || securityLocked;
  const ext = LANGUAGES.find((l) => l.id === lang)?.ext ?? 'txt';
  const verdict = lastResult?.verdict || 'IE';
  const hasCompileOutput = verdict === 'CE' && !!lastResult?.compile_error;

  return (
    <div className={`workspace${isContestant ? ' exam-protected' : ''}`} data-pane={pane}>
      {/* Sanchita: unclosable modal when contest has ended */}
      {isContestEnded && <BattleFinishedModal />}

      {/* Problem rail: jump between problems; balloons fill once solved */}
      <nav className="problem-rail" aria-label="Quests">
        <Link to="/problems" className="btn btn-ghost btn-icon rail-back" aria-label="All quests" title="All quests">
          <Icon name="chevronLeft" />
        </Link>
        <div className="rail-scroll">
        {problems.map((p) => (
          <Link
            key={p.slug}
            to={`/problems/${p.slug}`}
            className={`rail-item ${p.slug === problem.slug ? 'active' : ''}`}
            aria-current={p.slug === problem.slug ? 'page' : undefined}
            title={p.title}
          >
            <Balloon letter={p.letter} color={p.balloon} solved={status[p.slug]?.solved} size="sm" />
            <span className="rail-title">{p.title}</span>
          </Link>
        ))}
        </div>
        <div className="pane-switch" role="group" aria-label="View">
          <button aria-pressed={pane === 'problem'} onClick={() => setPane('problem')}><Icon name="file" size={14} /> Quest</button>
          <button aria-pressed={pane === 'code'} onClick={() => setPane('code')}><Icon name="code" size={14} /> Forge</button>
        </div>
      </nav>

      <div className="split" ref={splitRef} style={{ ['--split' as string]: `${split}%` }}>
        {/* Statement pane */}
        <section className="pane pane-statement" aria-label="Quest briefing">
          <div className="pane-head">
            <h1 className="pane-title">
              {current && <Balloon letter={current.letter} color={current.balloon} solved={status[problem.slug]?.solved} />}
              {problem.title}
            </h1>
            <div className="pane-meta">
              <Difficulty value={problem.difficulty} />
              {problem.best_time_complexity && (
                <span className="meta" title="Optimal Asymptotic Complexity">
                  <span style={{ color: 'var(--gold-bright)', fontWeight: 700 }}>⚡ Optimal:</span>
                  <span className="mono" style={{ color: 'var(--gold-bright)', fontWeight: 700 }}>{problem.best_time_complexity}</span>
                </span>
              )}
              <span className="meta"><Icon name="clock" size={14} /> <span className="mono">{problem.time_limit_sec}s</span></span>
              <span className="meta"><Icon name="memory" size={14} /> <span className="mono">{Math.round(problem.memory_limit_kb / 1024)} MB</span></span>
            </div>
          </div>

          <div className="tabs" role="tablist">
            <button role="tab" className="tab" aria-selected={activeTab === 'problem'} onClick={() => setActiveTab('problem')}>Briefing</button>
            <button role="tab" className="tab" aria-selected={activeTab === 'submissions'} onClick={() => setActiveTab('submissions')}>
              My Attacks {submissions.length > 0 && <span className="tab-count">{submissions.length}</span>}
            </button>
          </div>

          <div className="pane-body" role="tabpanel">
            {activeTab === 'problem' ? (
              <>
                <article className="prose">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{problem.statement}</ReactMarkdown>
                </article>
                {problem.sample_test_cases.length > 0 && !/sample/i.test(problem.statement) && (
                  <div className="samples">
                    <h2 className="samples-title">⚔️ Sample Battles</h2>
                    {problem.sample_test_cases.map((tc, i) => (
                      <div className="sample" key={i}>
                        <div>
                          <div className="sample-label">Input{problem.sample_test_cases.length > 1 ? ` ${i + 1}` : ''}<CopyButton text={tc.input_data} label="Sample input" /></div>
                          <pre>{tc.input_data}</pre>
                        </div>
                        <div>
                          <div className="sample-label">Expected output<CopyButton text={tc.expected_output} label="Sample output" /></div>
                          <pre>{tc.expected_output}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : submissions.length === 0 ? (
              <div className="state">
                <p className="state-title">No attacks launched yet</p>
                <p>Forge your weapon, then press Attack or <kbd>Ctrl</kbd> + <kbd>Enter</kbd>.</p>
              </div>
            ) : (
              <table className="subs">
                <thead><tr><th>#</th><th>Result</th><th>Tests</th><th>Loot</th><th>Weapon</th><th>Time</th><th>Memory</th></tr></thead>
                <tbody>
                  {submissions.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.id}</td>
                      <td><span className={`verdict verdict-${s.verdict || 'pending'}`}>{s.verdict || '…'}</span></td>
                      <td className="mono">{s.tests_total ? `${s.tests_passed}/${s.tests_total}` : '—'}</td>
                      <td className={`pts ${s.score > 0 ? '' : 'pts-zero'}`}>{s.score}</td>
                      <td className="mono">{s.language}</td>
                      <td className="mono">{fmtRuntime(s.runtime_ms)}</td>
                      <td className="mono">{fmtMemory(s.memory_kb)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <div
          className={`resizer ${dragging ? 'dragging' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize briefing and forge"
          aria-valuemin={25}
          aria-valuemax={70}
          aria-valuenow={Math.round(split)}
          tabIndex={0}
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onKeyDown={onResizeKey}
        />

        {/* Editor pane — The Forge */}
        <section className="pane pane-editor" aria-label="Code forge">
          <div className="editor-toolbar">
            <span className="editor-file"><Icon name="file" size={14} />solution.{ext}</span>
            {/* Draft status: lets a team trust that leaving this quest keeps their code */}
            {!sealed && editor.note && (
              <span key={editor.note} className="draft-note" role="status" data-note={editor.note}>
                <Icon name="check" size={12} />
                <span className="draft-label">{editor.note === 'restored' ? 'Draft restored' : 'Draft saved'}</span>
              </span>
            )}
            <label htmlFor="language-select" className="sr-only">Weapon</label>
            <div className="lang-picker">
              <span className="lang-picker-icon" aria-hidden="true">⚔️</span>
              <select id="language-select" className="select lang-select" value={lang} onChange={(e) => setLang(e.target.value)} disabled={submitting || editorLocked}>
                {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
            {/* Run Button (Sample Test Driver) */}
            <button
              id="run-btn"
              className="btn btn-secondary"
              onClick={handleRun}
              disabled={running || submitting || editorLocked}
              title={isContestEnded ? 'Contest has ended.' : sealed ? 'Already submitted — this quest is sealed.' : 'Run Sample Tests'}
            >
              {running ? (
                <>
                  <span className="spinner" /> Testing…
                </>
              ) : (
                <>
                  <Icon name="play" size={14} /> Run
                </>
              )}
            </button>
            {/* Sanchita: disable submit when contest ended */}
            <button
              id="submit-btn"
              className={`btn btn-primary ${armed ? 'is-armed' : ''}`}
              onClick={submit}
              disabled={running || submitting || editorLocked}
              title={isContestEnded ? 'Contest has ended. Submissions are closed.' : sealed ? 'One submission per quest — already used.' : 'Attack once (Ctrl+Enter) — only one submission is allowed per quest'}
            >
              {isContestEnded
                ? '⏱ Contest Ended'
                : sealed
                  ? <><Icon name="check" size={14} /> Submitted</>
                : submitting
                  ? <><span className="spinner" /> Battling…</>
                : armed
                  ? <>Confirm · final attempt</>
                  : <>⚔️ Attack <kbd>Ctrl ↵</kbd></>
              }
            </button>
            <span className="sr-only" role="status">{armed ? 'Press again to confirm. Only one submission is allowed for this quest.' : ''}</span>
          </div>

          {sealed && !isContestEnded && (
            <div className="sealed-note" role="status">
              <Icon name="check" size={14} />
              <span><b>Submission locked in.</b> One attack per quest — this quest leaves your list now.</span>
              <Link to="/problems" className="btn">Next quest</Link>
            </div>
          )}

          <div className="editor-wrap">
            <Editor
              height="100%"
              language={lang === 'cpp' ? 'cpp' : lang === 'c' ? 'c' : lang}
              theme="clash"
              beforeMount={defineTheme}
              loading={<div className="editor-loading"><span className="spinner" /></div>}
              value={code}
              onChange={(v) => setCode(v || '')}
              onMount={(editor, monaco) => {
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => submitRef.current());
              }}
              options={{
                fontSize: 14,
                lineHeight: 22,
                fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                lineNumbers: 'on',
                folding: true,
                tabSize: 4,
                padding: { top: 12, bottom: 12 },
                renderLineHighlight: 'line',
                cursorBlinking: 'smooth',
                automaticLayout: true,
                // Sanchita: lock editor when contest has ended; also sealed once the one submission is used
                readOnly: editorLocked,
                // Exam security: hide Monaco's Cut/Copy/Paste menu and file/text drop for contestants
                contextmenu: !isContestant,
                dropIntoEditor: { enabled: !isContestant },
                dragAndDrop: !isContestant,
              }}
            />
          </div>

          {running && (
            <div className="verdict-strip" role="status">
              <div className="strip-row">
                <span className="strip-verdict tone-pending"><span className="spinner" /> ⚡ Testing…</span>
                <span className="strip-score">Testing your weapon against sample cases…</span>
              </div>
            </div>
          )}
          {runResult && !running && (
            <div className="sample-run-console" role="region" aria-label="Sample test results">
              <div className="console-head">
                <div className="console-title">
                  <span className={`verdict-tag verdict-${runResult.verdict.toLowerCase()}`}>
                    {runResult.verdict === 'AC' ? '✓ Passed' : runResult.verdict === 'CE' ? 'Spell Error' : runResult.verdict}
                  </span>
                  <span className="console-summary">
                    Sample Tests: <b>{runResult.samples_passed}/{runResult.samples_total}</b> passed
                  </span>
                  {runResult.time_complexity && (
                    <span
                      style={{
                        marginLeft: 10,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background:
                          runResult.time_complexity_verdict === 'OPTIMAL'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : runResult.time_complexity_verdict === 'ACCEPTABLE'
                            ? 'rgba(234, 179, 8, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                        border: `1px solid ${
                          runResult.time_complexity_verdict === 'OPTIMAL'
                            ? 'var(--ac)'
                            : runResult.time_complexity_verdict === 'ACCEPTABLE'
                            ? 'var(--pending)'
                            : 'var(--wa)'
                        }`,
                        color:
                          runResult.time_complexity_verdict === 'OPTIMAL'
                            ? 'var(--ac)'
                            : runResult.time_complexity_verdict === 'ACCEPTABLE'
                            ? 'var(--pending)'
                            : 'var(--wa)',
                        fontWeight: 700,
                        fontSize: 11,
                      }}
                    >
                      ⚡ Time: {runResult.time_complexity} ({runResult.time_complexity_verdict})
                    </span>
                  )}
                </div>
                <div className="console-actions">
                  <span className="console-note">No points awarded · Local trial</span>
                  <button className="btn btn-ghost btn-icon" onClick={() => setRunResult(null)} title="Dismiss console">
                    <Icon name="x" size={14} />
                  </button>
                </div>
              </div>

              {runResult.compile_error ? (
                <pre className="strip-detail">{runResult.compile_error}</pre>
              ) : runResult.results.length === 0 ? (
                <div className="console-empty">No sample test cases found for this problem.</div>
              ) : (
                <>
                  <div className="sample-tabs" role="tablist">
                    {runResult.results.map((r, idx) => (
                      <button
                        key={idx}
                        role="tab"
                        className={`sample-tab ${selectedSampleTab === idx ? 'active' : ''} ${r.passed ? 'tab-pass' : 'tab-fail'}`}
                        aria-selected={selectedSampleTab === idx}
                        onClick={() => setSelectedSampleTab(idx)}
                      >
                        <span className="status-dot">{r.passed ? '✓' : '✗'}</span> Case {r.sample_index}
                        {r.runtime_ms != null && <span className="tab-ms">{fmtRuntime(r.runtime_ms)}</span>}
                      </button>
                    ))}
                  </div>

                  {runResult.results[selectedSampleTab] && (
                    <div className="sample-case-body">
                      {(() => {
                        const tc = runResult.results[selectedSampleTab];
                        const isMatch = tc.passed;
                        return (
                          <>
                            <div className="case-grid">
                              <div className="case-block">
                                <div className="case-block-label">
                                  <span>Input</span>
                                  <CopyButton text={tc.input_data} label={`Case ${tc.sample_index} Input`} />
                                </div>
                                <pre>{tc.input_data}</pre>
                              </div>
                              <div className="case-block">
                                <div className="case-block-label">
                                  <span>Expected Output</span>
                                  <CopyButton text={tc.expected_output} label={`Case ${tc.sample_index} Expected`} />
                                </div>
                                <pre>{tc.expected_output}</pre>
                              </div>
                            </div>

                            <div className="case-grid">
                              <div className={`case-block ${isMatch ? 'output-match' : 'output-diff'}`}>
                                <div className="case-block-label">
                                  <span>Your Stdout {isMatch ? '(Match)' : '(Diff)'}</span>
                                  {tc.actual_output && <CopyButton text={tc.actual_output} label={`Case ${tc.sample_index} Output`} />}
                                </div>
                                <pre>{tc.actual_output ?? '(no stdout recorded)'}</pre>
                              </div>

                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {submitting && (
            <div className="verdict-strip" role="status">
              <div className="strip-row">
                <span className="strip-verdict tone-pending"><span className="spinner" /> ⚔️ Battling</span>
                <span className="strip-score">Your warriors are fighting through every test case…</span>
              </div>
            </div>
          )}
          {lastResult && !submitting && (
            <div className="verdict-strip" role="status" aria-live="polite">
              <div className="strip-row">
                <span className={`strip-verdict ${VERDICT_TONE[verdict] || 'tone-muted'}`}>
                  <Icon name={verdict === 'AC' ? 'check' : verdict === 'IE' ? 'alert' : 'x'} size={16} />
                  {VERDICT_LABEL[verdict] || verdict}
                </span>
                <ScoreLine sub={lastResult} simulated={demoMode.enabled} />
                <TestsBar passed={lastResult.tests_passed} total={verdict === 'CE' || verdict === 'IE' ? 0 : lastResult.tests_total} />
                <span className="strip-metrics">
                  {lastResult.time_complexity && (
                    <span
                      className="meta"
                      title={
                        lastResult.time_complexity_verdict === 'OPTIMAL'
                          ? 'Optimal asymptotic time complexity'
                          : `Target complexity: ${problem.best_time_complexity || 'O(N)'}`
                      }
                      style={{
                        padding: '2px 8px',
                        borderRadius: 6,
                        background:
                          lastResult.time_complexity_verdict === 'OPTIMAL'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : lastResult.time_complexity_verdict === 'ACCEPTABLE'
                            ? 'rgba(234, 179, 8, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                        border: `1px solid ${
                          lastResult.time_complexity_verdict === 'OPTIMAL'
                            ? 'var(--ac)'
                            : lastResult.time_complexity_verdict === 'ACCEPTABLE'
                            ? 'var(--pending)'
                            : 'var(--wa)'
                        }`,
                        color:
                          lastResult.time_complexity_verdict === 'OPTIMAL'
                            ? 'var(--ac)'
                            : lastResult.time_complexity_verdict === 'ACCEPTABLE'
                            ? 'var(--pending)'
                            : 'var(--wa)',
                        fontWeight: 700,
                        fontSize: 11,
                      }}
                    >
                      ⚡ Complexity: {lastResult.time_complexity}{' '}
                      {lastResult.time_complexity_verdict === 'OPTIMAL'
                        ? '(Optimal)'
                        : lastResult.time_complexity_verdict === 'ACCEPTABLE'
                        ? '(Acceptable)'
                        : `(Suboptimal · Best: ${problem.best_time_complexity || 'O(N)'})`}
                    </span>
                  )}
                  {lastResult.runtime_ms !== null && <span className="meta" title="Slowest test"><Icon name="clock" size={13} /> <span className="mono">{fmtRuntime(lastResult.runtime_ms)}</span></span>}
                  {lastResult.memory_kb !== null && <span className="meta" title="Peak memory"><Icon name="memory" size={13} /> <span className="mono">{fmtMemory(lastResult.memory_kb)}</span></span>}
                  {hasCompileOutput && (
                    <button className="btn btn-ghost" onClick={() => setDetailOpen((o) => !o)} aria-expanded={detailOpen}>
                      {detailOpen ? 'Hide' : 'Show'} output
                      <Icon name="chevronDown" size={13} style={{ transform: detailOpen ? 'rotate(180deg)' : undefined }} />
                    </button>
                  )}
                </span>
              </div>
              {hasCompileOutput && detailOpen && <pre className="strip-detail">{lastResult.compile_error}</pre>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
