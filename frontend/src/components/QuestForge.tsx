import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  getAdminProblems,
  createAdminProblem,
  deleteAdminProblem,
  addAdminTestCase,
  type AdminProblemItem,
  type TestCaseCreateData,
} from '../api';
import { useToast } from '../Toast';
import Icon from './Icon';

const COMPLEXITY_OPTIONS = [
  { value: 'O(1)', label: 'O(1) · Constant Time' },
  { value: 'O(log N)', label: 'O(log N) · Logarithmic Time (Binary Search / Divide & Conquer)' },
  { value: 'O(N)', label: 'O(N) · Linear Time (Two Pointers / Sliding Window / Single Pass)' },
  { value: 'O(N log N)', label: 'O(N log N) · Linearithmic Time (Sorting / Heap)' },
  { value: 'O(N^2)', label: 'O(N²) · Quadratic Time (Nested Loops)' },
  { value: 'O(N^3)', label: 'O(N³) · Cubic Time (Triple Loops)' },
  { value: 'O(2^N)', label: 'O(2^N) · Exponential Time (Unmemoized Recursion / Backtracking)' },
];

export default function QuestForge() {
  const { addToast } = useToast();

  const [problems, setProblems] = useState<AdminProblemItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [bestComplexity, setBestComplexity] = useState('O(N)');
  const [timeLimit, setTimeLimit] = useState(2.0);
  const [memoryLimit, setMemoryLimit] = useState(262144);
  const [statement, setStatement] = useState(
    '## Problem Title\n\nDescribe the quest problem here.\n\n### Input Format\n- Describe input structure.\n\n### Output Format\n- Describe expected output structure.\n\n### Constraints\n- `1 <= N <= 10^5`'
  );

  // Test cases builder
  const [testCases, setTestCases] = useState<TestCaseCreateData[]>([
    { input_data: '5\n1 2 3 4 5', expected_output: '15', is_sample: true },
    { input_data: '3\n10 20 30', expected_output: '60', is_sample: false },
  ]);

  const loadProblems = useCallback(() => {
    setLoading(true);
    getAdminProblems()
      .then((r) => setProblems(r.data))
      .catch(() => addToast('Failed to load quest roster', 'error'))
      .finally(() => setLoading(false));
  }, [addToast]);

  useEffect(() => {
    loadProblems();
  }, [loadProblems]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    const autoSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setSlug(autoSlug);
  };

  const handleAddTestCase = () => {
    setTestCases((prev) => [
      ...prev,
      { input_data: '', expected_output: '', is_sample: prev.length === 0 },
    ]);
  };

  const handleRemoveTestCase = (index: number) => {
    setTestCases((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateTestCase = (index: number, patch: Partial<TestCaseCreateData>) => {
    setTestCases((prev) =>
      prev.map((tc, idx) => (idx === index ? { ...tc, ...patch } : tc))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim() || !statement.trim()) {
      addToast('Please fill in title, slug, and problem statement', 'error');
      return;
    }
    if (testCases.length === 0) {
      addToast('At least one testcase is required', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createAdminProblem({
        slug: slug.trim(),
        title: title.trim(),
        statement,
        difficulty,
        best_time_complexity: bestComplexity,
        time_limit_sec: timeLimit,
        memory_limit_kb: memoryLimit,
      });

      const problemId = res.data.id;

      // Add test cases sequentially
      for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        await addAdminTestCase(problemId, {
          input_data: tc.input_data.trim(),
          expected_output: tc.expected_output.trim(),
          is_sample: tc.is_sample,
          order_index: i,
        });
      }

      addToast(`⚔️ Quest "${title}" forged successfully with ${testCases.length} test cases!`, 'success');

      // Reset form
      setTitle('');
      setSlug('');
      setDifficulty('medium');
      setBestComplexity('O(N)');
      setTimeLimit(2.0);
      setMemoryLimit(262144);
      setStatement('## Problem Title\n\nDescribe the quest problem here.');
      setTestCases([
        { input_data: '', expected_output: '', is_sample: true },
      ]);

      loadProblems();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to forge quest';
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (probId: number, probTitle: string) => {
    if (!window.confirm(`Are you sure you want to demolish quest "${probTitle}"? This will delete all associated test cases.`)) {
      return;
    }
    try {
      await deleteAdminProblem(probId);
      addToast(`Demolished quest "${probTitle}"`, 'info');
      loadProblems();
    } catch {
      addToast(`Failed to demolish quest`, 'error');
    }
  };

  return (
    <div className="quest-forge-container" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Existing Quests Table */}
      <div className="panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--gold-bright)' }}>
              ⚔️ Arena Quest Roster & Complexity Config
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-2)' }}>
              All problem statements active in the arena with expected optimal time complexities.
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={loadProblems} disabled={loading}>
            <Icon name="refresh" className={loading ? 'spin' : ''} /> Refresh Roster
          </button>
        </div>

        <table className="table board-table">
          <thead>
            <tr>
              <th>Quest</th>
              <th>Difficulty</th>
              <th>Optimal Complexity</th>
              <th>Test Cases</th>
              <th>Limits</th>
              <th className="align-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((p) => {
              const diffTone =
                p.difficulty === 'easy'
                  ? 'var(--ac)'
                  : p.difficulty === 'hard'
                  ? 'var(--wa)'
                  : 'var(--pending)';
              return (
                <tr key={p.id}>
                  <td>
                    <div>
                      <strong>{p.title}</strong>
                      <div className="mono" style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                        {p.slug}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        border: `1px solid ${diffTone}`,
                        color: diffTone,
                      }}
                    >
                      {p.difficulty}
                    </span>
                  </td>
                  <td>
                    <span
                      className="mono"
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        border: '1px solid var(--gold)',
                        color: 'var(--gold-bright)',
                      }}
                    >
                      ⚡ {p.best_time_complexity || 'O(N)'}
                    </span>
                  </td>
                  <td>
                    <span className="mono">{p.test_case_count} cases</span>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: '12px', color: 'var(--text-2)' }}>
                      {p.time_limit_sec}s · {Math.round(p.memory_limit_kb / 1024)}MB
                    </span>
                  </td>
                  <td className="align-right">
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--wa)' }}
                      onClick={() => handleDelete(p.id, p.title)}
                      title="Demolish quest"
                    >
                      <Icon name="x" size={14} /> Demolish
                    </button>
                  </td>
                </tr>
              );
            })}
            {problems.length === 0 && !loading && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '24px' }}>
                  No quests forged yet. Forge your first quest below!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Quest Forge Creation Form */}
      <div className="panel" style={{ padding: '24px' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--gold-bright)', marginBottom: 4 }}>
            ⚒️ Quest Forge — Create New Problem Statement
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-2)' }}>
            Design a new battle challenge, establish its optimal time complexity, and construct sample/hidden test cases.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Top Form Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                Quest Title *
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Merge K Sorted Lists"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                required
                style={{ width: '100%', height: 40 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                Quest Slug (URL Identifier) *
              </label>
              <input
                type="text"
                className="input mono"
                placeholder="merge-k-sorted-lists"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                style={{ width: '100%', height: 40 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                Difficulty *
              </label>
              <select
                className="select"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                style={{ width: '100%', height: 40 }}
              >
                <option value="easy">Easy (Bonus: +2 pts)</option>
                <option value="medium">Medium (Bonus: +3 pts)</option>
                <option value="hard">Hard (Bonus: +5 pts)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--gold-bright)', marginBottom: 6 }}>
                ⚡ Best/Optimal Time Complexity *
              </label>
              <select
                className="select mono"
                value={bestComplexity}
                onChange={(e) => setBestComplexity(e.target.value)}
                style={{ width: '100%', height: 40, border: '2px solid var(--gold)', color: 'var(--gold-bright)' }}
              >
                {COMPLEXITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: 4, display: 'block' }}>
                Used by the Mathematical Complexity Engine to evaluate contestant solutions in real time.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                Time Limit (seconds)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="10.0"
                className="input mono"
                value={timeLimit}
                onChange={(e) => setTimeLimit(parseFloat(e.target.value) || 2.0)}
                style={{ width: '100%', height: 40 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                Memory Limit (KB)
              </label>
              <input
                type="number"
                step="1024"
                min="16384"
                max="2097152"
                className="input mono"
                value={memoryLimit}
                onChange={(e) => setMemoryLimit(parseInt(e.target.value) || 262144)}
                style={{ width: '100%', height: 40 }}
              />
            </div>
          </div>

          {/* Statement Editor with Preview Toggle */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>
                Problem Statement (Markdown) *
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPreviewMode((p) => !p)}
              >
                <Icon name="eye" size={14} /> {previewMode ? 'Edit Markdown' : 'Preview Statement'}
              </button>
            </div>

            {previewMode ? (
              <div
                className="prose"
                style={{
                  minHeight: 220,
                  padding: 16,
                  background: 'var(--surface-dark)',
                  border: '1px solid var(--line-strong)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{statement}</ReactMarkdown>
              </div>
            ) : (
              <textarea
                className="input mono"
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                rows={10}
                style={{
                  width: '100%',
                  height: 'auto',
                  padding: 12,
                  lineHeight: '1.5',
                  resize: 'vertical',
                }}
                required
              />
            )}
          </div>

          {/* Test Cases Builder */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--gold-bright)' }}>
                  Test Cases ({testCases.length})
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                  Check "Sample Case" to make visible to contestants in Briefing and the Run button.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleAddTestCase}
              >
                <Icon name="plus" size={14} /> Add Test Case
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {testCases.map((tc, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 14,
                    background: 'linear-gradient(180deg, #141c2e, #0e1524)',
                    border: '1px solid var(--line-strong)',
                    borderRadius: 'var(--r-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <strong style={{ fontSize: '13px', color: 'var(--gold-bright)' }}>
                        Case #{idx + 1}
                      </strong>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={tc.is_sample}
                          onChange={(e) => handleUpdateTestCase(idx, { is_sample: e.target.checked })}
                          style={{ accentColor: 'var(--gold)', cursor: 'pointer' }}
                        />
                        <span style={{ color: tc.is_sample ? 'var(--ac)' : 'var(--text-3)', fontWeight: 600 }}>
                          {tc.is_sample ? '★ Sample Test Case (Public)' : '🔒 Hidden Test Case'}
                        </span>
                      </label>
                    </div>

                    {testCases.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--wa)' }}
                        onClick={() => handleRemoveTestCase(idx)}
                      >
                        <Icon name="x" size={14} /> Remove
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
                        Input Data (stdin)
                      </span>
                      <textarea
                        className="input mono"
                        rows={3}
                        placeholder="e.g. 5\n1 2 3 4 5"
                        value={tc.input_data}
                        onChange={(e) => handleUpdateTestCase(idx, { input_data: e.target.value })}
                        style={{ width: '100%', height: 'auto', padding: 8, fontSize: '12px' }}
                        required
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
                        Expected Output (stdout)
                      </span>
                      <textarea
                        className="input mono"
                        rows={3}
                        placeholder="e.g. 15"
                        value={tc.expected_output}
                        onChange={(e) => handleUpdateTestCase(idx, { expected_output: e.target.value })}
                        style={{ width: '100%', height: 'auto', padding: 8, fontSize: '12px' }}
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ padding: '10px 24px', fontSize: '15px' }}
            >
              {submitting ? (
                <>
                  <span className="spinner" /> Forging Quest…
                </>
              ) : (
                <>
                  <Icon name="check" size={16} /> Forge & Publish Quest
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

