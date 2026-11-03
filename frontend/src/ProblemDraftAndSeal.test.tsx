import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./monacoSetup', () => ({}));
vi.mock('../monacoSetup', () => ({}));

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProblemPage from './pages/ProblemPage';
import ProblemsPage from './pages/ProblemsPage';
import * as api from './api';
import { useCountdownTimer } from './useCountdownTimer';

const route = { slug: 'two-sum' };
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ slug: route.slug }) };
});

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, username: 'team7', role: 'contestant' } }),
}));

vi.mock('./api', () => ({
  getProblem: vi.fn(),
  getProblems: vi.fn(),
  getMySubmissions: vi.fn(),
  submitCode: vi.fn(),
  runSampleCode: vi.fn(),
  demoMode: { enabled: false },
}));

vi.mock('./useCountdownTimer', () => ({ useCountdownTimer: vi.fn() }));

// Monaco stand-in: a textarea that reports edits the way the real editor's onChange does
vi.mock('@monaco-editor/react', () => ({
  default: ({ options, value, onChange }: any) => (
    <div data-testid="monaco-editor" data-readonly={options?.readOnly ? 'true' : 'false'}>
      <textarea
        data-testid="monaco-textarea"
        readOnly={options?.readOnly}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  ),
}));

const PROBLEMS = [
  { id: 1, slug: 'two-sum', title: 'Two Sum', difficulty: 'easy', time_limit_sec: 2, memory_limit_kb: 262144 },
  { id: 2, slug: 'fibonacci', title: 'Fibonacci', difficulty: 'easy', time_limit_sec: 2, memory_limit_kb: 262144 },
];
const sub = (over: Record<string, unknown> = {}) => ({
  id: 1, problem_slug: 'two-sum', language: 'python', status: 'done', verdict: 'AC',
  score: 12, test_score: 10, bonus_points: 2, tests_passed: 10, tests_total: 10,
  runtime_ms: 10, memory_kb: 1000, compile_error: null, created_at: '', judged_at: '', ...over,
});

const textarea = () => screen.getByTestId('monaco-textarea') as HTMLTextAreaElement;
const attackBtn = () => screen.getByRole('button', { name: /Attack|Confirm|Submitted/i }) as HTMLButtonElement;
// Submitting is final, so the first press only arms the button; the second sends it
const attack = () => { fireEvent.click(attackBtn()); fireEvent.click(attackBtn()); };

function renderPage() {
  return render(<MemoryRouter><ProblemPage /></MemoryRouter>);
}

describe('ProblemPage — draft saving & single submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    route.slug = 'two-sum';
    vi.mocked(useCountdownTimer).mockReturnValue({
      status: 'ACTIVE', displayTime: '00:30:00', remainingSeconds: 1800, batchName: 'B', isPulsing: false,
    } as any);
    vi.mocked(api.getProblems).mockResolvedValue({ data: PROBLEMS } as any);
    vi.mocked(api.getMySubmissions).mockResolvedValue({ data: [] } as any);
    vi.mocked(api.getProblem).mockImplementation(((slug: string) =>
      Promise.resolve({ data: { ...PROBLEMS.find((p) => p.slug === slug)!, statement: `Statement of ${slug}`, sample_test_cases: [] } })) as any);
  });

  it('keeps my code when I switch to another quest and come back', async () => {
    const { rerender } = renderPage();
    await screen.findByText('Statement of two-sum');

    fireEvent.change(textarea(), { target: { value: 'my half-finished two-sum' } });
    expect(await screen.findByText('Draft saved')).toBeDefined();

    // Go solve another quest first: it must start from its own template, not my code
    route.slug = 'fibonacci';
    rerender(<MemoryRouter><ProblemPage /></MemoryRouter>);
    await screen.findByText('Statement of fibonacci');
    expect(textarea().value).not.toContain('my half-finished');

    // ...and coming back restores the draft
    route.slug = 'two-sum';
    rerender(<MemoryRouter><ProblemPage /></MemoryRouter>);
    await screen.findByText('Statement of two-sum');
    expect(textarea().value).toBe('my half-finished two-sum');
    expect(screen.getByText('Draft restored')).toBeDefined();
  });

  it('restores the draft after a full reload too (new mount)', async () => {
    const first = renderPage();
    await screen.findByText('Statement of two-sum');
    fireEvent.change(textarea(), { target: { value: 'persisted code' } });
    first.unmount();

    renderPage();
    await screen.findByText('Statement of two-sum');
    expect(textarea().value).toBe('persisted code');
  });

  it("does not show another team's draft", async () => {
    localStorage.setItem('cc-draft:v1:99:two-sum', JSON.stringify({ lang: 'python', drafts: { python: 'other team code' }, savedAt: 1 }));
    renderPage();
    await screen.findByText('Statement of two-sum');
    expect(textarea().value).not.toContain('other team code');
  });

  it('seals the quest after the one submission: editor read-only, Attack disabled, draft cleared', async () => {
    vi.mocked(api.submitCode).mockResolvedValue({ data: sub() } as any);
    renderPage();
    await screen.findByText('Statement of two-sum');
    fireEvent.change(textarea(), { target: { value: 'final answer' } });
    expect(localStorage.getItem('cc-draft:v1:7:two-sum')).not.toBeNull();

    attack();
    await waitFor(() => expect(api.submitCode).toHaveBeenCalledTimes(1));
    await screen.findByText(/Submission locked in/i);

    expect(screen.getByTestId('monaco-editor').getAttribute('data-readonly')).toBe('true');
    expect(attackBtn().disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Run/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(localStorage.getItem('cc-draft:v1:7:two-sum')).toBeNull();

    // A second click must not hit the API
    fireEvent.click(attackBtn());
    expect(api.submitCode).toHaveBeenCalledTimes(1);
  });

  it('the first Attack press only arms the button; it does not spend the attempt', async () => {
    vi.mocked(api.submitCode).mockResolvedValue({ data: sub() } as any);
    renderPage();
    await screen.findByText('Statement of two-sum');
    fireEvent.click(attackBtn());
    expect(api.submitCode).not.toHaveBeenCalled();
    expect(attackBtn().textContent).toMatch(/Confirm/);
    expect(attackBtn().disabled).toBe(false);

    fireEvent.click(attackBtn());
    await waitFor(() => expect(api.submitCode).toHaveBeenCalledTimes(1));
  });

  it('a wrong answer also uses up the one attempt', async () => {
    vi.mocked(api.submitCode).mockResolvedValue({ data: sub({ verdict: 'WA', score: 3, bonus_points: 0, tests_passed: 3 }) } as any);
    renderPage();
    await screen.findByText('Statement of two-sum');
    attack();
    await screen.findByText(/Submission locked in/i);
  });

  it('a judge error (IE) does NOT use up the attempt and keeps the draft', async () => {
    vi.mocked(api.submitCode).mockResolvedValue({ data: sub({ verdict: 'IE', score: 0, bonus_points: 0, tests_passed: 0 }) } as any);
    renderPage();
    await screen.findByText('Statement of two-sum');
    fireEvent.change(textarea(), { target: { value: 'keep me' } });
    attack();
    await waitFor(() => expect(api.submitCode).toHaveBeenCalledTimes(1));

    await screen.findByText(/Not your code/i);
    expect(screen.queryByText(/Submission locked in/i)).toBeNull();
    expect(attackBtn().disabled).toBe(false);
    expect(localStorage.getItem('cc-draft:v1:7:two-sum')).not.toBeNull();
  });

  it('seals when the server says it was already submitted (second tab / double click)', async () => {
    vi.mocked(api.submitCode).mockRejectedValue({
      response: { status: 409, data: { detail: 'You have already submitted this problem. Only one submission is allowed per problem.' } },
    });
    renderPage();
    await screen.findByText('Statement of two-sum');
    attack();
    await screen.findByText(/Submission locked in/i);
  });

  it('shows a clear sealed message when opening a quest that was already submitted', async () => {
    vi.mocked(api.getProblem).mockRejectedValue({
      response: { status: 403, data: { detail: { code: 'ALREADY_SUBMITTED', message: 'x' } } },
    });
    renderPage();
    expect(await screen.findByText(/This quest is sealed/i)).toBeDefined();
    expect(screen.queryByTestId('monaco-editor')).toBeNull();
  });
});

describe('ProblemsPage — submitted quests leave the list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getProblems).mockResolvedValue({ data: PROBLEMS } as any);
  });

  it('hides a submitted quest and reports submitted vs remaining', async () => {
    vi.mocked(api.getMySubmissions).mockResolvedValue({ data: [sub({ problem_slug: 'two-sum' })] } as any);
    render(<MemoryRouter><ProblemsPage /></MemoryRouter>);
    await screen.findByText('Fibonacci');
    expect(screen.queryByText('Two Sum')).toBeNull();
    expect(screen.getByText('1 submitted · 1 remaining')).toBeDefined();
  });

  it('a judge-error attempt stays visible (it was not a real submission)', async () => {
    vi.mocked(api.getMySubmissions).mockResolvedValue({ data: [sub({ problem_slug: 'two-sum', verdict: 'IE' })] } as any);
    render(<MemoryRouter><ProblemsPage /></MemoryRouter>);
    await screen.findByText('Two Sum');
    expect(screen.getByText('0 submitted · 2 remaining')).toBeDefined();
  });

  it('shows an all-done state once every quest is submitted', async () => {
    vi.mocked(api.getProblems).mockResolvedValue({ data: [PROBLEMS[0]] } as any);
    vi.mocked(api.getMySubmissions).mockResolvedValue({ data: [sub({ problem_slug: 'two-sum' })] } as any);
    render(<MemoryRouter><ProblemsPage /></MemoryRouter>);
    expect(await screen.findByText('All quests submitted')).toBeDefined();
  });
});
