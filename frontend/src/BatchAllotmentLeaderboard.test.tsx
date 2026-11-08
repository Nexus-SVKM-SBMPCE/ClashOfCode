import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LeaderboardPage from './pages/LeaderboardPage';
import { useAuth } from './AuthContext';
import * as api from './api';

// Mock AuthContext
vi.mock('./AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock Toast
vi.mock('./Toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// Mock API
vi.mock('./api', () => ({
  getLeaderboard: vi.fn(),
  getAdminBatches: vi.fn(),
  getAdminTeams: vi.fn(),
  assignTeamBatch: vi.fn(),
  autoAllotBatches: vi.fn(),
  startBatchTimer: vi.fn(),
  resetBatchTimer: vi.fn().mockResolvedValue({ data: {} }),
  getAdminTelemetry: vi.fn().mockResolvedValue({ data: [] }),
  getBatchProblems: vi.fn(),
  setBatchProblems: vi.fn(),
  autoAllotBatchProblems: vi.fn(),
  demoMode: { enabled: false },
}));

describe('Batch-Wise Allotment & Batch Leaderboards UI', () => {
  const adminUser = {
    id: 1,
    username: 'admin',
    display_name: 'War Chief',
    role: 'admin',
  };

  const mockBatches: api.BatchAdminInfo[] = [
    {
      id: 1,
      batch_number: 1,
      name: 'Batch 1',
      status: 'ACTIVE',
      timer_started_at: '2026-11-01T10:00:00Z',
      duration_minutes: 60,
      remaining_seconds: 1800,
      server_now_utc: '2026-11-01T10:30:00Z',
    },
    {
      id: 2,
      batch_number: 2,
      name: 'Batch 2',
      status: 'NOT_STARTED',
      timer_started_at: null,
      duration_minutes: 60,
      remaining_seconds: null,
      server_now_utc: '2026-11-01T10:30:00Z',
    },
  ];

  const mockTeams: api.TeamAdminInfo[] = [
    {
      id: 1,
      name: 'Clan Alpha',
      username: 'team1',
      leader_name: 'Alice',
      leader_email: 'alice@test.com',
      batch_id: 1,
      batch_name: 'Batch 1',
      total_score: 100,
    },
    {
      id: 2,
      name: 'Clan Beta',
      username: 'team2',
      leader_name: 'Bob',
      leader_email: 'bob@test.com',
      batch_id: 2,
      batch_name: 'Batch 2',
      total_score: 50,
    },
  ];

  const mockLeaderboard: api.LeaderboardEntry[] = [
    {
      rank: 1,
      user_id: 2,
      username: 'team1',
      display_name: 'Clan Alpha',
      total_score: 100,
      solved_count: 1,
      total_submissions: 1,
      last_ac_time: '2026-11-01T10:15:00Z',
      batch_id: 1,
      team_id: 1,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: adminUser as any,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(api.getAdminBatches).mockResolvedValue({ data: mockBatches } as any);
    vi.mocked(api.getAdminTeams).mockResolvedValue({ data: mockTeams } as any);
    vi.mocked(api.getLeaderboard).mockResolvedValue({ data: mockLeaderboard } as any);
    vi.mocked(api.assignTeamBatch).mockResolvedValue({ data: { message: 'Assigned' } } as any);
    vi.mocked(api.autoAllotBatches).mockResolvedValue({ data: { message: 'Allotted' } } as any);
    vi.mocked(api.startBatchTimer).mockResolvedValue({ data: { message: 'Started' } } as any);
    vi.mocked(api.getBatchProblems).mockResolvedValue({ data: [] } as any);
  });

  it('renders batch filter pills and filters leaderboard by batch', async () => {
    render(<LeaderboardPage />);

    expect(screen.getByText('War Rankings')).toBeDefined();
    await waitFor(() => {
      expect(api.getAdminBatches).toHaveBeenCalled();
    });

    // Verify batch filter buttons exist
    const allClansBtn = screen.getByText('All Clans');
    expect(allClansBtn).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText(/Batch 1/)).toBeDefined();
      expect(screen.getByText(/Batch 2/)).toBeDefined();
    });

    // Click on Batch 1 pill
    const batch1Btn = screen.getByText(/Batch 1/);
    fireEvent.click(batch1Btn);

    expect(api.getLeaderboard).toHaveBeenCalledWith(1);
  });

  it('switches to Clan Allotment view and displays batch controls and team table', async () => {
    render(<LeaderboardPage />);

    // Click Clan Allotment & Batches tab
    const allotmentTab = screen.getByText(/Clan Allotment & Batches/);
    fireEvent.click(allotmentTab);

    await waitFor(() => {
      expect(api.getAdminTeams).toHaveBeenCalled();
      expect(screen.getByText('Clan Alpha')).toBeDefined();
      expect(screen.getByText('Clan Beta')).toBeDefined();
      expect(screen.getByText(/Start Batch Timer/)).toBeDefined();
    });

    // Test starting batch timer
    const startBtn = screen.getByText(/Start Batch Timer/);
    fireEvent.click(startBtn);
    await waitFor(() => {
      expect(api.startBatchTimer).toHaveBeenCalledWith(2);
    });

    // Test auto-allotment button
    await waitFor(() => {
      const allotBtn = screen.getByText(/Allot \(2\/Batch\)/);
      expect(allotBtn.hasAttribute('disabled')).toBe(false);
    });
    const allotBtn = screen.getByText(/Allot \(2\/Batch\)/);
    fireEvent.click(allotBtn);
    await waitFor(() => {
      expect(api.autoAllotBatches).toHaveBeenCalledWith(2);
    });
  });
});
