/**
 * useCountdownTimer — Server-synced live HH:MM:SS countdown hook.
 *
 * Anti-cheat design
 * -----------------
 * The server returns `server_now_utc` alongside `timer_started_at`.
 * On first fetch we compute:
 *   clockSkewMs = Date.now() - new Date(server_now_utc).getTime()
 *
 * Every subsequent tick uses:
 *   serverNow = new Date(Date.now() - clockSkewMs)
 *
 * This means the countdown is always derived from server time, regardless of
 * what the user's system clock says. The skew is re-calibrated on every
 * poll interval (every 30 s) to keep drift minimal.
 *
 * States exposed:
 *  - displayTime: "HH:MM:SS" string, "--:--:--" if not started
 *  - status:      'NOT_STARTED' | 'ACTIVE' | 'COMPLETED' | 'loading' | 'error'
 *  - batchName:   display name of the current batch
 *  - isPulsing:   true when remaining <= 5 minutes (visual urgency hint)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { getBatchTimer, type BatchTimerInfo } from './api';

export type TimerStatus = 'loading' | 'error' | 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED';

export interface CountdownState {
  displayTime: string;   // "HH:MM:SS" or "--:--:--"
  status: TimerStatus;
  batchName: string;
  isPulsing: boolean;    // true if ≤ 5 minutes remain (triggers CSS animation)
  remainingSeconds: number | null;
}

const POLL_INTERVAL_MS = 30_000; // re-sync with server every 30 s
const TICK_INTERVAL_MS = 1_000;  // update display every 1 s

function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [hh, mm, ss].map((v) => String(v).padStart(2, '0')).join(':');
}

export function useCountdownTimer(): CountdownState {
  const [state, setState] = useState<CountdownState>({
    displayTime: '--:--:--',
    status: 'loading',
    batchName: '',
    isPulsing: false,
    remainingSeconds: null,
  });

  // Server clock skew in milliseconds: Date.now() - serverNow
  const skewMsRef = useRef<number>(0);
  const timerDataRef = useRef<BatchTimerInfo | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --------------------------------------------------------------------------
  // Compute remaining seconds using server-corrected clock
  // --------------------------------------------------------------------------
  const computeRemaining = useCallback((): number | null => {
    const data = timerDataRef.current;
    if (!data || data.status !== 'ACTIVE' || !data.timer_started_at) return null;
    const serverNowMs = Date.now() - skewMsRef.current;
    const startedMs = new Date(data.timer_started_at).getTime();
    const totalMs = data.duration_minutes * 60 * 1000;
    const elapsedMs = serverNowMs - startedMs;
    return Math.max(0, Math.floor((totalMs - elapsedMs) / 1000));
  }, []);

  // --------------------------------------------------------------------------
  // Tick handler — runs every second
  // --------------------------------------------------------------------------
  const tick = useCallback(() => {
    const data = timerDataRef.current;
    if (!data) return;

    if (data.status === 'NOT_STARTED') {
      setState({
        displayTime: '--:--:--',
        status: 'NOT_STARTED',
        batchName: data.batch_name,
        isPulsing: false,
        remainingSeconds: null,
      });
      return;
    }

    if (data.status === 'COMPLETED') {
      setState({
        displayTime: '00:00:00',
        status: 'COMPLETED',
        batchName: data.batch_name,
        isPulsing: false,
        remainingSeconds: 0,
      });
      return;
    }

    // ACTIVE — compute live countdown
    const remaining = computeRemaining();
    if (remaining === null) return;

    if (remaining === 0) {
      // Timer just expired on client side; mark completed
      timerDataRef.current = { ...data, status: 'COMPLETED' };
    }

    setState({
      displayTime: formatHMS(remaining),
      status: remaining === 0 ? 'COMPLETED' : 'ACTIVE',
      batchName: data.batch_name,
      isPulsing: remaining <= 5 * 60,
      remainingSeconds: remaining,
    });
  }, [computeRemaining]);

  // --------------------------------------------------------------------------
  // Fetch timer data from server and recalibrate skew
  // --------------------------------------------------------------------------
  const fetchTimer = useCallback(async () => {
    try {
      const res = await getBatchTimer();
      const data = res.data;
      // Calibrate skew: positive means client is ahead of server
      skewMsRef.current = Date.now() - new Date(data.server_now_utc).getTime();
      timerDataRef.current = data;
      // Immediately update display after fetch
      tick();
    } catch {
      setState((prev) => ({ ...prev, status: 'error', displayTime: '--:--:--' }));
    }
  }, [tick]);

  // --------------------------------------------------------------------------
  // Mount: fetch once, start tick, then poll every 30 s
  // --------------------------------------------------------------------------
  useEffect(() => {
    let pollId: ReturnType<typeof setInterval>;

    fetchTimer().then(() => {
      // Start 1-second tick
      tickRef.current = setInterval(tick, TICK_INTERVAL_MS);
      // Re-sync with server every 30 s
      pollId = setInterval(fetchTimer, POLL_INTERVAL_MS);
    });

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      clearInterval(pollId);
    };
  }, [fetchTimer, tick]);

  return state;
}
