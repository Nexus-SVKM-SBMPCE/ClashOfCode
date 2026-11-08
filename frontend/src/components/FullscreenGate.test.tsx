import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FullscreenGate from './FullscreenGate';
import { useAuth } from '../AuthContext';
import { useFullscreenLock } from '../hooks/useFullscreenLock';
import type { User } from '../api';

vi.mock('../AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../hooks/useFullscreenLock', () => ({
  useFullscreenLock: vi.fn(),
}));

describe('FullscreenGate Component', () => {
  const mockChildText = 'Arena Secret Quest Content';
  const enterFullscreenMock = vi.fn();

  const contestantUser: User = {
    id: 1,
    username: 'team_vikings',
    display_name: 'Team Vikings',
    role: 'contestant',
  };

  const adminUser: User = {
    id: 99,
    username: 'admin',
    display_name: 'Admin',
    role: 'admin',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bypasses fullscreen gate completely for admin users even when not in fullscreen', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: adminUser,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(useFullscreenLock).mockReturnValue({
      isFullscreen: false,
      exitCount: 0,
      enterFullscreen: enterFullscreenMock,
    });

    render(
      <FullscreenGate>
        <div>{mockChildText}</div>
      </FullscreenGate>
    );

    expect(screen.getByText(mockChildText)).toBeDefined();
    expect(screen.queryByText('Contest Arena - Fullscreen Required')).toBeNull();
  });

  it('renders children when contestant is in fullscreen', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: contestantUser,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(useFullscreenLock).mockReturnValue({
      isFullscreen: true,
      exitCount: 0,
      enterFullscreen: enterFullscreenMock,
    });

    render(
      <FullscreenGate>
        <div>{mockChildText}</div>
      </FullscreenGate>
    );

    expect(screen.getByText(mockChildText)).toBeDefined();
    expect(screen.queryByText('Contest Arena - Fullscreen Required')).toBeNull();
  });

  it('renders State A when contestant is not in fullscreen and exitCount === 0', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: contestantUser,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(useFullscreenLock).mockReturnValue({
      isFullscreen: false,
      exitCount: 0,
      enterFullscreen: enterFullscreenMock,
    });

    render(
      <FullscreenGate>
        <div>{mockChildText}</div>
      </FullscreenGate>
    );

    expect(screen.queryByText(mockChildText)).toBeNull();
    expect(screen.getByText('Contest Arena - Fullscreen Required')).toBeDefined();
    expect(
      screen.getByText('To maintain contest integrity, the battle arena must be run in Fullscreen Mode.')
    ).toBeDefined();

    const enterBtn = screen.getByRole('button', { name: /Enter Fullscreen Arena/i });
    expect(enterBtn).toBeDefined();
    fireEvent.click(enterBtn);
    expect(enterFullscreenMock).toHaveBeenCalledTimes(1);
  });

  it('renders State B with violation warning when contestant exited fullscreen (exitCount > 0)', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: contestantUser,
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    vi.mocked(useFullscreenLock).mockReturnValue({
      isFullscreen: false,
      exitCount: 2,
      enterFullscreen: enterFullscreenMock,
    });

    render(
      <FullscreenGate>
        <div>{mockChildText}</div>
      </FullscreenGate>
    );

    expect(screen.queryByText(mockChildText)).toBeNull();
    expect(screen.getByText('War Alert: Fullscreen Violation')).toBeDefined();
    expect(screen.getAllByText(/Violation Count: 2/i).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText('You exited fullscreen mode. Violation count: 2. This incident has been logged.')
    ).toBeDefined();

    const returnBtn = screen.getByRole('button', { name: /Return to Fullscreen/i });
    expect(returnBtn).toBeDefined();
    fireEvent.click(returnBtn);
    expect(enterFullscreenMock).toHaveBeenCalledTimes(1);
  });
});
