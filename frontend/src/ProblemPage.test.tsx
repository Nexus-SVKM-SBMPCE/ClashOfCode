import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock monacoSetup to avoid initializing Monaco's clipboard in JSDOM
vi.mock('./monacoSetup', () => ({}));
vi.mock('../monacoSetup', () => ({}));

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProblemPage from './pages/ProblemPage';
import { useCountdownTimer, type CountdownState } from './useCountdownTimer';

// Mock react-router-dom useParams
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ slug: 'two-sum' }),
  };
});

// Mock API
vi.mock('./api', () => ({
  getProblem: vi.fn().mockResolvedValue({
    data: {
      id: 1,
      slug: 'two-sum',
      title: 'Two Sum',
      statement: 'Find two numbers that add to target.',
      difficulty: 'easy',
      time_limit_sec: 2.0,
      memory_limit_kb: 262144,
      sample_test_cases: [],
    },
  }),
  getProblems: vi.fn().mockResolvedValue({ data: [] }),
  getMySubmissions: vi.fn().mockResolvedValue({ data: [] }),
  submitCode: vi.fn().mockResolvedValue({ data: {} }),
  runSampleCode: vi.fn().mockResolvedValue({
    data: {
      problem_slug: 'two-sum',
      language: 'python',
      status: 'done',
      verdict: 'AC',
      compile_error: null,
      samples_passed: 1,
      samples_total: 1,
      results: [
        {
          sample_index: 1,
          input_data: '5 9\n2 7 11 15 4\n',
          expected_output: '1 2\n',
          actual_output: '1 2\n',
          verdict: 'AC',
          passed: true,
          runtime_ms: 32.5,
          memory_kb: 10420,
        },
      ],
    },
  }),
  demoMode: { enabled: false },
}));

// Mock useCountdownTimer
vi.mock('./useCountdownTimer', () => ({
  useCountdownTimer: vi.fn(),
}));

// Mock Monaco Editor to assert on options passed (including readOnly)
vi.mock('@monaco-editor/react', () => ({
  default: ({ options, ...props }: any) => (
    <div
      data-testid="monaco-editor"
      data-readonly={options?.readOnly ? 'true' : 'false'}
    >
      <textarea
        data-testid="monaco-textarea"
        readOnly={options?.readOnly}
        {...props}
      />
    </div>
  ),
}));

describe('ProblemPage — Contest Expiry & Submission Freeze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables the editor and submit button when the timer is ACTIVE', async () => {
    const activeState: CountdownState = {
      status: 'ACTIVE',
      displayTime: '00:30:00',
      remainingSeconds: 1800,
      batchName: 'Batch 1',
      isPulsing: false,
    };
    vi.mocked(useCountdownTimer).mockReturnValue(activeState);

    render(
      <MemoryRouter>
        <ProblemPage />
      </MemoryRouter>
    );

    // Wait for problem to load
    await waitFor(() => {
      expect(screen.getByText('Two Sum')).toBeDefined();
    });

    // Monaco editor must be active (readOnly = false)
    const editor = screen.getByTestId('monaco-editor');
    expect(editor.getAttribute('data-readonly')).toBe('false');

    // Run and Submit buttons must be enabled
    const runBtn = screen.getByRole('button', { name: /Run/i }) as HTMLButtonElement;
    expect(runBtn.disabled).toBe(false);

    const submitBtn = screen.getByRole('button', { name: /Attack|Submit/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    // Battle Finished modal must NOT be rendered
    expect(screen.queryByText('Battle Finished')).toBeNull();
  });

  it('disables the Monaco editor and locks the submit button upon timer completion (COMPLETED)', async () => {
    const completedState: CountdownState = {
      status: 'COMPLETED',
      displayTime: '00:00:00',
      remainingSeconds: 0,
      batchName: 'Batch 1',
      isPulsing: false,
    };
    vi.mocked(useCountdownTimer).mockReturnValue(completedState);

    render(
      <MemoryRouter>
        <ProblemPage />
      </MemoryRouter>
    );

    // Wait for problem to load
    await waitFor(() => {
      expect(screen.getByText('Two Sum')).toBeDefined();
    });

    // Monaco editor must have readOnly: true
    const editor = screen.getByTestId('monaco-editor');
    expect(editor.getAttribute('data-readonly')).toBe('true');

    // Run and Submit buttons must be disabled
    const runBtn = screen.getByRole('button', { name: /Run/i }) as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);

    const submitBtn = screen.getByRole('button', { name: /Contest Ended/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    // Battle Finished modal must be rendered with non-closable notice
    expect(screen.getByText('Battle Finished')).toBeDefined();
    expect(
      screen.getByText(/The contest timer has expired and the battle window has closed/i)
    ).toBeDefined();
    expect(
      screen.getByText(/All code submissions are now frozen and the editor is locked/i)
    ).toBeDefined();
  });

  it('executes sample tests and renders sample output console when Run button is clicked', async () => {
    const activeState: CountdownState = {
      status: 'ACTIVE',
      displayTime: '00:30:00',
      remainingSeconds: 1800,
      batchName: 'Batch 1',
      isPulsing: false,
    };
    vi.mocked(useCountdownTimer).mockReturnValue(activeState);

    render(
      <MemoryRouter>
        <ProblemPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Two Sum')).toBeDefined();
    });

    const runBtn = screen.getByRole('button', { name: /Run/i }) as HTMLButtonElement;
    expect(runBtn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(runBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/Sample Tests:/i)).toBeDefined();
      expect(screen.getByText(/1\/1/i)).toBeDefined();
      expect(screen.getByText(/Case 1/i)).toBeDefined();
      expect(screen.getByText(/No points awarded/i)).toBeDefined();
    });
  });
});
