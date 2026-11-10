import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ClanDossierModal from './components/ClanDossierModal';
import * as api from './api';

vi.mock('./api', () => ({
  getTeamDossier: vi.fn(),
  demoMode: { enabled: false },
}));

describe('ClanDossierModal & Time Complexity Dashboard', () => {
  const mockDossier: api.TeamDossier = {
    team: {
      id: 1,
      name: 'Alpha Clan',
      username: 'team1',
      leader_name: 'Alice Chen',
      leader_email: 'alice@clash.local',
      members_info: JSON.stringify(['Alice', 'Bob']),
      batch_id: 1,
      batch_name: 'Batch 1',
      batch_status: 'ACTIVE',
      total_score: 300,
      last_active_at: '2026-11-08T10:30:00Z',
      created_at: '2026-11-08T09:00:00Z',
    },
    security: {
      integrity_status: 'CLEAN',
      tab_switch_count: 1,
      fullscreen_exit_count: 0,
      lock_status: 'ACTIVE',
      locked_at: null,
    },
    submissions_count: 3,
    solved_count: 2,
    problems: [
      {
        problem_id: 1,
        problem_title: 'Two Sum',
        problem_slug: 'two-sum',
        difficulty: 'easy',
        best_expected_complexity: 'O(N)',
        latest_submission_id: 101,
        verdict: 'AC',
        score: 102,
        test_score: 100,
        bonus_points: 2,
        tests_passed: 10,
        tests_total: 10,
        language: 'python',
        runtime_ms: 25.4,
        memory_kb: 14000,
        solve_time_seconds: 45,
        time_complexity: 'O(N)',
        time_complexity_verdict: 'OPTIMAL',
        total_attempts: 1,
        created_at: '2026-11-08T10:15:00Z',
      },
      {
        problem_id: 2,
        problem_title: 'Binary Search',
        problem_slug: 'binary-search',
        difficulty: 'easy',
        best_expected_complexity: 'O(log N)',
        latest_submission_id: 102,
        verdict: 'AC',
        score: 102,
        test_score: 100,
        bonus_points: 2,
        tests_passed: 10,
        tests_total: 10,
        language: 'cpp',
        runtime_ms: 8.2,
        memory_kb: 4000,
        solve_time_seconds: 120,
        time_complexity: 'O(log N)',
        time_complexity_verdict: 'OPTIMAL',
        total_attempts: 1,
        created_at: '2026-11-08T10:25:00Z',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders clan metadata and time complexity evaluations', async () => {
    vi.mocked(api.getTeamDossier).mockResolvedValue({ data: mockDossier } as any);
    const onClose = vi.fn();

    render(<ClanDossierModal teamId={1} clanName="Alpha Clan" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Alpha Clan')).toBeDefined();
      expect(screen.getByText('@team1')).toBeDefined();
      expect(screen.getByText(/300/)).toBeDefined();
      expect(screen.getByText('Alice Chen')).toBeDefined();
      expect(screen.getByText('alice@clash.local')).toBeDefined();
    });

    // Check problems and time complexity columns
    expect(screen.getByText('Two Sum')).toBeDefined();
    expect(screen.getByText('Binary Search')).toBeDefined();
    expect(screen.getAllByText('O(N)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('O(log N)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('✨ OPTIMAL').length).toBe(2);
  });

  it('handles close on close button click and escape key', async () => {
    vi.mocked(api.getTeamDossier).mockResolvedValue({ data: mockDossier } as any);
    const onClose = vi.fn();

    render(<ClanDossierModal teamId={1} clanName="Alpha Clan" onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText('Alpha Clan')).toBeDefined();
    });

    const closeBtn = screen.getByTitle('Close Dossier (Esc)');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();

    // Fire escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
