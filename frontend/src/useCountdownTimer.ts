/**
 * useCountdownTimer — Server-synced live HH:MM:SS countdown hook.
 *
 * Anti-cheat & Smooth Monotonic Clock Design
 * -------------------------------------------
 * The server returns `server_now_utc` alongside `timer_started_at`.
 * On initial fetch, we calibrate clock skew:
 *   skewMs = Date.now() - new Date(server_now_utc).getTime()
 *
 * Every tick computes:
 *   serverNow = Date.now() - skewMs
 *   elapsed = serverNow - new Date(timer_started_at).getTime()
 *   remaining = Math.max(0, Math.floor((duration_ms - elapsed) / 1000))
 *
 * Robust Multi-Client Polling & Synchronization:
 * 1. While status is NOT_STARTED (or error/loading), the client polls the server
 *    every 2 seconds (NOT_STARTED_POLL_INTERVAL_MS = 2_000).
 * 2. As soon as the server transitions to ACTIVE, the hook immediately:
 *    - Updates remainingSeconds and displayTime using server-synced time.
 *    - Switches to 30s periodic re-calibration polls.
 *    - Broadcasts 'batch:activated' event so any listening views (e.g. Problems list,
 *      workspace) immediately re-trigger their queries without requiring browser refresh.
 * 3. Monotonic Clamping: During an ACTIVE countdown, remaining seconds are strictly
 *    monotonically non-increasing. A poll response or boundary calculation will
 *    never cause the display to snap backwards or loop a second.
 */
import { useState, useEffect, useRef } from 'react';
import { getBatchTimer, type BatchTimerInfo } from './api';

export type TimerStatus = 'loading' | 'error' | 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED';

export interface CountdownState {
  displayTime: string;   // "HH:MM:SS" or "--:--:--"
  status: TimerStatus;
  batchName: string;
  isPulsing: boolean;    // true if ≤ 5 minutes remain (triggers CSS animation)
  remainingSeconds: number | null;
}

const NOT_STARTED_POLL_INTERVAL_MS = 2_000; // Poll every 2s while NOT_STARTED for rapid cross-client sync
const ACTIVE_POLL_INTERVAL_MS = 30_000;     // Re-sync with server every 30s during active contest
const TICK_INTERVAL_MS = 1_000;             // Update display every 1 s
const MAX_JITTER_TOLERANCE_MS = 3_000;      // Ignore network latency fluctuations up to 3s

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

  // All mutable tracking lives in refs so intervals always access current values
  const skewMsRef = useRef<number>(0);
  const isSyncedRef = useRef<boolean>(false);
  const timerDataRef = useRef<BatchTimerInfo | null>(null);
  const lastRemainingRef = useRef<number | null>(null);
  const lastStartedAtRef = useRef<string | null>(null);
  const lastDurationRef = useRef<number | null>(null);
  const prevStatusRef = useRef<TimerStatus>('loading');

  useEffect(() => {
    let tickId: ReturnType<typeof setInterval> | null = null;
    let pollTimerId: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    function scheduleNextPoll(delayMs: number) {
      if (unmounted) return;
      if (pollTimerId) clearTimeout(pollTimerId);
      pollTimerId = setTimeout(() => {
        fetchTimer();
      }, delayMs);
    }

    // ── Tick handler — runs every second ──
    function tick() {
      if (unmounted) return;
      const data = timerDataRef.current;
      if (!data) return;

      if (data.status === 'NOT_STARTED') {
        lastRemainingRef.current = null;
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
        lastRemainingRef.current = 0;
        setState({
          displayTime: '00:00:00',
          status: 'COMPLETED',
          batchName: data.batch_name,
          isPulsing: false,
          remainingSeconds: 0,
        });
        return;
      }

      // ACTIVE — compute remaining time using ONLY server-synced skew and timer_started_at
      if (!data.timer_started_at) {
        if (data.remaining_seconds !== null && data.remaining_seconds !== undefined) {
          setState({
            displayTime: formatHMS(data.remaining_seconds),
            status: 'ACTIVE',
            batchName: data.batch_name,
            isPulsing: data.remaining_seconds <= 5 * 60,
            remainingSeconds: data.remaining_seconds,
          });
        }
        return;
      }

      // Reset monotonic reference if contest was restarted or duration modified
      if (
        lastStartedAtRef.current !== data.timer_started_at ||
        lastDurationRef.current !== data.duration_minutes
      ) {
        lastStartedAtRef.current = data.timer_started_at;
        lastDurationRef.current = data.duration_minutes;
        lastRemainingRef.current = null;
      }

      const serverNowMs = Date.now() - skewMsRef.current;
      const startedMs = new Date(data.timer_started_at).getTime();
      const totalMs = data.duration_minutes * 60 * 1000;
      const elapsedMs = serverNowMs - startedMs;
      let remaining = Math.max(0, Math.floor((totalMs - elapsedMs) / 1000));

      // Guard against snap-back or looping: countdown must be monotonic
      if (lastRemainingRef.current !== null && remaining > lastRemainingRef.current) {
        remaining = lastRemainingRef.current;
      }
      lastRemainingRef.current = remaining;

      const isCompleted = remaining === 0;
      if (isCompleted) {
        timerDataRef.current = { ...data, status: 'COMPLETED' };
      }

      setState({
        displayTime: formatHMS(remaining),
        status: isCompleted ? 'COMPLETED' : 'ACTIVE',
        batchName: data.batch_name,
        isPulsing: remaining <= 5 * 60 && !isCompleted,
        remainingSeconds: remaining,
      });
    }

    // ── Fetch timer data from server and synchronize skew ──
    async function fetchTimer() {
      try {
        const res = await getBatchTimer();
        if (unmounted) return;
        const data = res.data;

        const serverNowMs = new Date(data.server_now_utc).getTime();
        const measuredSkew = Date.now() - serverNowMs;

        if (!isSyncedRef.current) {
          skewMsRef.current = measuredSkew;
          isSyncedRef.current = true;
        } else if (Math.abs(measuredSkew - skewMsRef.current) > MAX_JITTER_TOLERANCE_MS) {
          // Re-sync if system clock shifted significantly
          skewMsRef.current = measuredSkew;
        }

        const wasNotStarted = prevStatusRef.current === 'NOT_STARTED' || prevStatusRef.current === 'loading';
        const isNowActive = data.status === 'ACTIVE';

        timerDataRef.current = data;
        prevStatusRef.current = data.status;

        // Immediately update display after fetch so UI transitions promptly
        tick();

        // Broadcast cross-client / problem query invalidation when batch starts
        if (wasNotStarted && isNowActive) {
          window.dispatchEvent(new CustomEvent('batch:activated', { detail: data }));
        }

        // Schedule next poll: 2s while NOT_STARTED, 30s once ACTIVE
        const nextInterval = data.status === 'ACTIVE' ? ACTIVE_POLL_INTERVAL_MS : NOT_STARTED_POLL_INTERVAL_MS;
        scheduleNextPoll(nextInterval);
      } catch {
        if (!unmounted) {
          setState((prev) => ({ ...prev, status: 'error', displayTime: '--:--:--' }));
          prevStatusRef.current = 'error';
          scheduleNextPoll(NOT_STARTED_POLL_INTERVAL_MS);
        }
      }
    }

    // ── Fallback listener for local same-tab / test trigger ──
    const handleBatchStarted = () => {
      fetchTimer();
    };
    window.addEventListener('batch:started', handleBatchStarted);

    // ── Boot sequence ──
    fetchTimer().then(() => {
      if (unmounted) return;
      // Start 1-second tick
      tickId = setInterval(tick, TICK_INTERVAL_MS);
    });

    return () => {
      unmounted = true;
      if (tickId) clearInterval(tickId);
      if (pollTimerId) clearTimeout(pollTimerId);
      window.removeEventListener('batch:started', handleBatchStarted);
    };
  }, []); // Empty deps: runs on mount, avoids teardown/restart loops

  return state;
}
