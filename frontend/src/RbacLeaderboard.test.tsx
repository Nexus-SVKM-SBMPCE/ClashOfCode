import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navbar from './Navbar';
import App from './App';
import { useAuth } from './AuthContext';
import type { User } from './api';

// Mock monacoSetup
vi.mock('./monacoSetup', () => ({}));
vi.mock('../monacoSetup', () => ({}));

// Mock LiveSubmissionCounter
vi.mock('./LiveSubmissionCounter', () => ({
  default: () => <div data-testid="mock-live-counter" />,
}));

// Mock AuthContext
vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: any) => <>{children}</>,
}));

// Mock timer
vi.mock('./useCountdownTimer', () => ({
  useCountdownTimer: vi.fn().mockReturnValue({
    status: 'ACTIVE',
    displayTime: '00:45:00',
    remainingSeconds: 2700,
    batchName: 'Batch 1',
    isPulsing: false,
  }),
}));

vi.mock('./api', () => ({
  getProblems: vi.fn().mockResolvedValue({ data: [] }),
  getProblem: vi.fn().mockResolvedValue({ data: null }),
  getMySubmissions: vi.fn().mockResolvedValue({ data: [] }),
  getLeaderboard: vi.fn().mockResolvedValue({ data: [] }),
  getAdminBatches: vi.fn().mockResolvedValue({ data: [] }),
  getAdminTeams: vi.fn().mockResolvedValue({ data: [] }),
  assignTeamBatch: vi.fn().mockResolvedValue({ data: {} }),
  autoAllotBatches: vi.fn().mockResolvedValue({ data: {} }),
  startBatchTimer: vi.fn().mockResolvedValue({ data: {} }),
  resetBatchTimer: vi.fn().mockResolvedValue({ data: {} }),
  getAdminTelemetry: vi.fn().mockResolvedValue({ data: [] }),
  demoMode: { enabled: false },
}));

describe('RBAC & Restricted Leaderboard', () => {
  const contestantUser: User = {
    id: 2,
    username: 'contestant_yash',
    display_name: 'Yash Contestant',
    role: 'contestant',
  };

  const adminUser: User = {
    id: 1,
    username: 'admin_chief',
    display_name: 'Chief Admin',
    role: 'admin',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Navbar Links', () => {
    it('hides War Ranks (Leaderboard) tab from contestants', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: contestantUser,
        loading: false,
        signIn: vi.fn(),
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>
      );

      expect(screen.getByText('Quests')).toBeDefined();
      expect(screen.queryByText('War Ranks')).toBeNull();
    });

    it('shows War Ranks (Leaderboard) tab to admin users', () => {
      vi.mocked(useAuth).mockReturnValue({
        user: adminUser,
        loading: false,
        signIn: vi.fn(),
        signOut: vi.fn(),
      });

      render(
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>
      );

      expect(screen.getByText('Quests')).toBeDefined();
      expect(screen.getByText('War Ranks')).toBeDefined();
    });
  });

  describe('Leaderboard Route Guard (RequireAdmin)', () => {
    it('redirects contestants trying to access /leaderboard directly', async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: contestantUser,
        loading: false,
        signIn: vi.fn(),
        signOut: vi.fn(),
      });

      window.history.pushState({}, 'Test', '/leaderboard');
      render(<App />);

      await waitFor(() => {
        expect(screen.queryByText('War Rankings')).toBeNull();
      });
    });

    it('allows admin users to view /leaderboard', async () => {
      vi.mocked(useAuth).mockReturnValue({
        user: adminUser,
        loading: false,
        signIn: vi.fn(),
        signOut: vi.fn(),
      });

      window.history.pushState({}, 'Test', '/leaderboard');
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('War Rankings')).toBeDefined();
      });
    });
  });
});
