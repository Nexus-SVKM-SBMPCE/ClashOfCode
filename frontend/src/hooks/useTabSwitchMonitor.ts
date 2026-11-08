/**
 * useTabSwitchMonitor — Contest Anti-Cheat Tab Switching Surveillance
 *
 * Listens for document visibility changes and window blur events.
 * Reports occurrences to the backend telemetry engine in real-time.
 */
import { useEffect, useRef } from 'react';
import { reportTelemetry } from '../api';
import { useAuth } from '../AuthContext';

const TAB_SWITCH_KEY = 'coc_tab_switch_count';
const THROTTLE_MS = 2000;

export function useTabSwitchMonitor() {
  const { user } = useAuth();
  const lastReportRef = useRef<number>(0);

  useEffect(() => {
    // Admins do not have tab switch violations tracked
    if (!user || user.role === 'admin') return;

    const handleSwitch = () => {
      const now = Date.now();
      if (now - lastReportRef.current < THROTTLE_MS) return;
      lastReportRef.current = now;

      // Update session storage
      try {
        const cur = parseInt(sessionStorage.getItem(TAB_SWITCH_KEY) || '0', 10);
        sessionStorage.setItem(TAB_SWITCH_KEY, String(cur + 1));
      } catch {
        // Ignore quota/security errors
      }

      // Dispatch local event for toast/banner warning
      window.dispatchEvent(new CustomEvent('contest:violation', {
        detail: { type: 'tab_switch' }
      }));

      // Report to backend
      reportTelemetry({ event_type: 'tab_switch', count: 1 }).catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleSwitch();
      }
    };

    const handleWindowBlur = () => {
      handleSwitch();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [user]);
}

