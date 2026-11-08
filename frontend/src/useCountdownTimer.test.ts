import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdownTimer } from './useCountdownTimer';
import * as api from './api';

vi.mock('./api', () => ({
  getBatchTimer: vi.fn(),
  demoMode: { enabled: false },
}));

describe('useCountdownTimer Hook', () => {
  const baseTime = 1_700_000_000_000; // Fixed epoch reference (ms)

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTime);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes in loading state and transitions to ACTIVE upon first fetch', async () => {
    const startedAt = new Date(baseTime).toISOString();
    const serverNow = new Date(baseTime).toISOString();

    vi.mocked(api.getBatchTimer).mockResolvedValue({
      data: {
        batch_id: 1,
        batch_name: 'Batch Alpha',
        status: 'ACTIVE',
        timer_started_at: startedAt,
        duration_minutes: 60,
        server_now_utc: serverNow,
        remaining_seconds: 3600,
      },
    } as any);

    const { result } = renderHook(() => useCountdownTimer());

    // Initially in loading state
    expect(result.current.status).toBe('loading');
    expect(result.current.displayTime).toBe('--:--:--');

    // Resolve initial fetch promise
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('ACTIVE');
    expect(result.current.batchName).toBe('Batch Alpha');
    expect(result.current.remainingSeconds).toBe(3600);
    expect(result.current.displayTime).toBe('01:00:00');
    expect(result.current.isPulsing).toBe(false);
  });

  it('ticks linearly every second without drift', async () => {
    const startedAt = new Date(baseTime).toISOString();
    const serverNow = new Date(baseTime).toISOString();

    vi.mocked(api.getBatchTimer).mockResolvedValue({
      data: {
        batch_id: 1,
        batch_name: 'Batch Alpha',
        status: 'ACTIVE',
        timer_started_at: startedAt,
        duration_minutes: 60,
        server_now_utc: serverNow,
        remaining_seconds: 3600,
      },
    } as any);

    const { result } = renderHook(() => useCountdownTimer());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.displayTime).toBe('01:00:00');
    expect(result.current.remainingSeconds).toBe(3600);

    // Advance 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displayTime).toBe('00:59:59');
    expect(result.current.remainingSeconds).toBe(3599);

    // Advance another 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.displayTime).toBe('00:59:57');
    expect(result.current.remainingSeconds).toBe(3597);
  });

  it('ensures display time remains strictly linear and accurate across the 30s poll without snap-back or looping', async () => {
    const startedAt = new Date(baseTime).toISOString();

    // 1st fetch at t = 0
    vi.mocked(api.getBatchTimer).mockResolvedValueOnce({
      data: {
        batch_id: 1,
        batch_name: 'Batch Alpha',
        status: 'ACTIVE',
        timer_started_at: startedAt,
        duration_minutes: 60,
        server_now_utc: new Date(baseTime).toISOString(),
        remaining_seconds: 3600,
      },
    } as any);

    const { result } = renderHook(() => useCountdownTimer());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.displayTime).toBe('01:00:00');
    expect(result.current.remainingSeconds).toBe(3600);

    // Advance 29 seconds (1 second before the 30s poll)
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(result.current.displayTime).toBe('00:59:31');
    expect(result.current.remainingSeconds).toBe(3571);

    // Prepare 2nd fetch for the 30s poll
    // At t = 30s, server_now_utc has advanced 30 seconds
    const pollServerTime = new Date(baseTime + 30_000).toISOString();
    vi.mocked(api.getBatchTimer).mockResolvedValueOnce({
      data: {
        batch_id: 1,
        batch_name: 'Batch Alpha',
        status: 'ACTIVE',
        timer_started_at: startedAt,
        duration_minutes: 60,
        server_now_utc: pollServerTime,
        remaining_seconds: 3570,
      },
    } as any);

    // Advance timer to 30s — triggers both the 30th 1-second tick and the 30s poll
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    // Display must be exactly 00:59:30 (3570s), NOT snapped back to 00:59:31 or 01:00:00
    expect(result.current.displayTime).toBe('00:59:30');
    expect(result.current.remainingSeconds).toBe(3570);

    // Advance to 31s
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displayTime).toBe('00:59:29');
    expect(result.current.remainingSeconds).toBe(3569);

    // Advance to 32s
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displayTime).toBe('00:59:28');
    expect(result.current.remainingSeconds).toBe(3568);
  });

  it('ignores network latency jitter on 30s poll and does not snap back', async () => {
    const startedAt = new Date(baseTime).toISOString();

    // 1st fetch at t = 0
    vi.mocked(api.getBatchTimer).mockResolvedValueOnce({
      data: {
        batch_id: 1,
        batch_name: 'Batch Alpha',
        status: 'ACTIVE',
        timer_started_at: startedAt,
        duration_minutes: 60,
        server_now_utc: new Date(baseTime).toISOString(),
        remaining_seconds: 3600,
      },
    } as any);

    const { result } = renderHook(() => useCountdownTimer());

    await act(async () => {
      await Promise.resolve();
    });

    // Advance to 29 seconds
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(result.current.displayTime).toBe('00:59:31');
    expect(result.current.remainingSeconds).toBe(3571);

    // 2nd poll arrives with 500ms network latency jitter (server_now is slightly behind client arrival time)
    const jitteredServerTime = new Date(baseTime + 29_500).toISOString();
    vi.mocked(api.getBatchTimer).mockResolvedValueOnce({
      data: {
        batch_id: 1,
        batch_name: 'Batch Alpha',
        status: 'ACTIVE',
        timer_started_at: startedAt,
        duration_minutes: 60,
        server_now_utc: jitteredServerTime,
        remaining_seconds: 3570,
      },
    } as any);

    // Advance to 30s
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    // Must still be 00:59:30, never snapping back to 00:59:31
    expect(result.current.displayTime).toBe('00:59:30');
    expect(result.current.remainingSeconds).toBe(3570);

    // Tick to 31s
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displayTime).toBe('00:59:29');
    expect(result.current.remainingSeconds).toBe(3569);
  });

  it('handles NOT_STARTED batch status properly', async () => {
    vi.mocked(api.getBatchTimer).mockResolvedValue({
      data: {
        batch_id: 1,
        batch_name: 'Batch 1',
        status: 'NOT_STARTED',
        timer_started_at: null,
        duration_minutes: 60,
        server_now_utc: new Date(baseTime).toISOString(),
        remaining_seconds: null,
      },
    } as any);

    const { result } = renderHook(() => useCountdownTimer());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('NOT_STARTED');
    expect(result.current.displayTime).toBe('--:--:--');
    expect(result.current.remainingSeconds).toBeNull();
    expect(result.current.isPulsing).toBe(false);
  });

  it('transitions to COMPLETED when countdown reaches 00:00:00', async () => {
    // Started 59 minutes and 58 seconds ago
    const startedAt = new Date(baseTime - 3598 * 1000).toISOString();

    vi.mocked(api.getBatchTimer).mockResolvedValue({
      data: {
        batch_id: 1,
        batch_name: 'Batch 1',
        status: 'ACTIVE',
        timer_started_at: startedAt,
        duration_minutes: 60,
        server_now_utc: new Date(baseTime).toISOString(),
        remaining_seconds: 2,
      },
    } as any);

    const { result } = renderHook(() => useCountdownTimer());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.displayTime).toBe('00:00:02');
    expect(result.current.status).toBe('ACTIVE');

    // 1 second left
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displayTime).toBe('00:00:01');
    expect(result.current.status).toBe('ACTIVE');

    // Expired
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displayTime).toBe('00:00:00');
    expect(result.current.status).toBe('COMPLETED');
    expect(result.current.remainingSeconds).toBe(0);
  });

  it('sets isPulsing true when remaining time is 5 minutes or less', async () => {
    // 5 minutes and 1 second remaining
    const startedAt = new Date(baseTime - (55 * 60 - 1) * 1000).toISOString();

    vi.mocked(api.getBatchTimer).mockResolvedValue({
      data: {
        batch_id: 1,
        batch_name: 'Batch 1',
        status: 'ACTIVE',
        timer_started_at: startedAt,
        duration_minutes: 60,
        server_now_utc: new Date(baseTime).toISOString(),
        remaining_seconds: 301,
      },
    } as any);

    const { result } = renderHook(() => useCountdownTimer());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.displayTime).toBe('00:05:01');
    expect(result.current.isPulsing).toBe(false);

    // Tick into urgent window (300 seconds)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.displayTime).toBe('00:05:00');
    expect(result.current.isPulsing).toBe(true);
  });

  it('triggers immediate re-fetch upon receiving window batch:started event', async () => {
    // 1st fetch: NOT_STARTED
    vi.mocked(api.getBatchTimer).mockResolvedValueOnce({
      data: {
        batch_id: 1,
        batch_name: 'Batch 1',
        status: 'NOT_STARTED',
        timer_started_at: null,
        duration_minutes: 60,
        server_now_utc: new Date(baseTime).toISOString(),
        remaining_seconds: null,
      },
    } as any);

    const { result } = renderHook(() => useCountdownTimer());
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('NOT_STARTED');
    expect(result.current.displayTime).toBe('--:--:--');

    // 2nd fetch triggered by batch:started event
    vi.mocked(api.getBatchTimer).mockResolvedValueOnce({
      data: {
        batch_id: 1,
        batch_name: 'Batch 1',
        status: 'ACTIVE',
        timer_started_at: new Date(baseTime).toISOString(),
        duration_minutes: 60,
        server_now_utc: new Date(baseTime).toISOString(),
        remaining_seconds: 3600,
      },
    } as any);

    // Dispatch the custom event
    await act(async () => {
      window.dispatchEvent(new Event('batch:started'));
      await Promise.resolve();
    });

    // Should immediately transition to ACTIVE without waiting for polling interval
    expect(result.current.status).toBe('ACTIVE');
    expect(result.current.displayTime).toBe('01:00:00');
    expect(result.current.remainingSeconds).toBe(3600);
  });

  it('polls every 2 seconds when NOT_STARTED and automatically transitions to ACTIVE across clients without local DOM events', async () => {
    // 1st fetch: NOT_STARTED
    vi.mocked(api.getBatchTimer).mockResolvedValueOnce({
      data: {
        batch_id: 1,
        batch_name: 'Batch 1',
        status: 'NOT_STARTED',
        timer_started_at: null,
        duration_minutes: 60,
        server_now_utc: new Date(baseTime).toISOString(),
        remaining_seconds: null,
      },
    } as any);

    const { result } = renderHook(() => useCountdownTimer());
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('NOT_STARTED');

    // 2nd fetch triggered by 2s polling interval returns ACTIVE
    vi.mocked(api.getBatchTimer).mockResolvedValueOnce({
      data: {
        batch_id: 1,
        batch_name: 'Batch 1',
        status: 'ACTIVE',
        timer_started_at: new Date(baseTime + 2000).toISOString(),
        duration_minutes: 60,
        server_now_utc: new Date(baseTime + 2000).toISOString(),
        remaining_seconds: 3600,
      },
    } as any);

    // Advance 2 seconds
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(result.current.status).toBe('ACTIVE');
    expect(result.current.displayTime).toBe('01:00:00');
    expect(result.current.remainingSeconds).toBe(3600);
  });
});

