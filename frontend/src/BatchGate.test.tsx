import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BatchGate from './BatchGate';
import { useAuth } from './AuthContext';
import { useCountdownTimer, type CountdownState } from './useCountdownTimer';
import type { User } from './api';

// Mock dependencies
vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('./useCountdownTimer', () => ({
  useCountdownTimer: vi.fn(),
}));

describe('BatchGate Component', () => {
  const mockChildText = 'Protected Contest Problems Content';

  const defaultContestantUser: User = {
    id: 1,
    username: 'team_alpha',
    display_name: 'Team Alpha',
    role: 'contestant',
  };

  const defaultAuthContext = {
    user: defaultContestantUser,
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders WaitingScreen when status is NOT_STARTED for contestants', () => {
    vi.mocked(useAuth).mockReturnValue(defaultAuthContext);

    const mockCountdownState: CountdownState = {
      status: 'NOT_STARTED',
      displayTime: '01:00:00',
      remainingSeconds: 3600,
      batchName: 'Batch 1 - Morning Arena',
      isPulsing: false,
    };
    vi.mocked(useCountdownTimer).mockReturnValue(mockCountdownState);

    render(
      <BatchGate>
        <div>{mockChildText}</div>
      </BatchGate>
    );

    // WaitingScreen must be rendered
    expect(screen.getByText('Waiting for Battle to Begin')).toBeDefined();
    expect(screen.getByText(/The admin has not started the batch yet/i)).toBeDefined();
    expect(screen.getByText('Batch 1 - Morning Arena')).toBeDefined();

    // Children content must NOT be displayed
    expect(screen.queryByText(mockChildText)).toBeNull();
  });

  it('renders children when status is ACTIVE', () => {
    vi.mocked(useAuth).mockReturnValue(defaultAuthContext);

    const mockCountdownState: CountdownState = {
      status: 'ACTIVE',
      displayTime: '00:45:12',
      remainingSeconds: 2712,
      batchName: 'Batch 1 - Morning Arena',
      isPulsing: false,
    };
    vi.mocked(useCountdownTimer).mockReturnValue(mockCountdownState);

    render(
      <BatchGate>
        <div>{mockChildText}</div>
      </BatchGate>
    );

    // Children content must be displayed
    expect(screen.getByText(mockChildText)).toBeDefined();

    // WaitingScreen must NOT be displayed
    expect(screen.queryByText('Waiting for Battle to Begin')).toBeNull();
  });

  it('renders children when status is COMPLETED', () => {
    vi.mocked(useAuth).mockReturnValue(defaultAuthContext);

    const mockCountdownState: CountdownState = {
      status: 'COMPLETED',
      displayTime: '00:00:00',
      remainingSeconds: 0,
      batchName: 'Batch 1 - Morning Arena',
      isPulsing: false,
    };
    vi.mocked(useCountdownTimer).mockReturnValue(mockCountdownState);

    render(
      <BatchGate>
        <div>{mockChildText}</div>
      </BatchGate>
    );

    // Children content must be displayed
    expect(screen.getByText(mockChildText)).toBeDefined();

    // WaitingScreen must NOT be displayed
    expect(screen.queryByText('Waiting for Battle to Begin')).toBeNull();
  });

  it('always renders children if the authenticated user is an admin, even when status is NOT_STARTED', () => {
    const adminUser: User = {
      id: 99,
      username: 'arena_admin',
      display_name: 'Super Admin',
      role: 'admin',
    };

    vi.mocked(useAuth).mockReturnValue({
      ...defaultAuthContext,
      user: adminUser,
    });

    const mockCountdownState: CountdownState = {
      status: 'NOT_STARTED',
      displayTime: '01:00:00',
      remainingSeconds: 3600,
      batchName: 'Batch 1 - Morning Arena',
      isPulsing: false,
    };
    vi.mocked(useCountdownTimer).mockReturnValue(mockCountdownState);

    render(
      <BatchGate>
        <div>{mockChildText}</div>
      </BatchGate>
    );

    // Children must be visible for admin
    expect(screen.getByText(mockChildText)).toBeDefined();

    // WaitingScreen must NOT be displayed
    expect(screen.queryByText('Waiting for Battle to Begin')).toBeNull();
  });

  it('renders a loading spinner when timer status is loading', () => {
    vi.mocked(useAuth).mockReturnValue(defaultAuthContext);

    const mockCountdownState: CountdownState = {
      status: 'loading',
      displayTime: '--:--:--',
      remainingSeconds: null,
      batchName: '',
      isPulsing: false,
    };
    vi.mocked(useCountdownTimer).mockReturnValue(mockCountdownState);

    render(
      <BatchGate>
        <div>{mockChildText}</div>
      </BatchGate>
    );

    expect(screen.getByText(/Verifying contest status/i)).toBeDefined();
    expect(screen.queryByText(mockChildText)).toBeNull();
    expect(screen.queryByText('Waiting for Battle to Begin')).toBeNull();
  });

  it('renders WaitingScreen when status is error (fail-closed security behavior)', () => {
    vi.mocked(useAuth).mockReturnValue(defaultAuthContext);

    const mockCountdownState: CountdownState = {
      status: 'error',
      displayTime: '--:--:--',
      remainingSeconds: null,
      batchName: '',
      isPulsing: false,
    };
    vi.mocked(useCountdownTimer).mockReturnValue(mockCountdownState);

    render(
      <BatchGate>
        <div>{mockChildText}</div>
      </BatchGate>
    );

    // Fail closed: shows waiting screen / retry instead of leaking problems
    expect(screen.getByText('Waiting for Battle to Begin')).toBeDefined();
    expect(screen.getByText(/Cannot reach server — retrying…/i)).toBeDefined();
    expect(screen.queryByText(mockChildText)).toBeNull();
  });
});
