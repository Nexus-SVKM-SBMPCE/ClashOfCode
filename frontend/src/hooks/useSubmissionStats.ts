import { useEffect, useState } from 'react';
import { getSubmissionStats } from '../api';
import type { SubmissionStats } from '../api';

const POLL_MS = 12_000;

/**
 * Polls arena-wide submission counters every 12s.
 * Pauses while the tab is hidden and refreshes immediately when it returns,
 * so idle tabs on the LAN don't hammer the backend.
 */
export function useSubmissionStats() {
  const [stats, setStats] = useState<SubmissionStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const load = () => {
      getSubmissionStats()
        .then((r) => { if (!cancelled) setStats(r.data); })
        .catch(() => { /* keep last known value; next tick retries */ });
    };
    const start = () => { load(); timer = setInterval(load, POLL_MS); };
    const stop = () => { if (timer) clearInterval(timer); timer = undefined; };
    const onVisibility = () => { stop(); if (!document.hidden) start(); };

    start();
    window.addEventListener('submission:created', load);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      stop();
      window.removeEventListener('submission:created', load);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return stats;
}
