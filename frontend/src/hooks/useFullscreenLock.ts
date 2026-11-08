/**
 * useFullscreenLock — Contest Anti-Cheat Fullscreen Enforcement Hook
 *
 * Tracks fullscreen state and logs unauthorized exits during competitive coding battles.
 * State persists across question navigation via sessionStorage ('coc_fullscreen_exit_count').
 * Dispatches 'contest:violation' window events on exit.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { reportTelemetry } from '../api';

export const FULLSCREEN_STORAGE_KEY = 'coc_fullscreen_exit_count';

export interface FullscreenLockState {
  isFullscreen: boolean;
  exitCount: number;
  enterFullscreen: () => Promise<void>;
}

export function useFullscreenLock(): FullscreenLockState {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(document.fullscreenElement);
  });

  const [exitCount, setExitCount] = useState<number>(() => {
    if (typeof sessionStorage === 'undefined') return 0;
    try {
      const stored = sessionStorage.getItem(FULLSCREEN_STORAGE_KEY);
      if (stored !== null) {
        const val = parseInt(stored, 10);
        return isNaN(val) ? 0 : val;
      }
    } catch {
      // Ignore sessionStorage security exceptions
    }
    return 0;
  });

  // Track if fullscreen was actively engaged before an exit event
  const wasFullscreenRef = useRef<boolean>(
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false
  );

  const enterFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement;
      if (el?.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch (err) {
      console.warn('Failed to enter fullscreen mode:', err);
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleFullscreenChange = () => {
      const currentFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(currentFullscreen);

      // Trigger violation counter only if transitioning from Active Fullscreen -> Inactive
      if (wasFullscreenRef.current && !currentFullscreen) {
        setExitCount((prev) => {
          const updated = prev + 1;
          try {
            sessionStorage.setItem(FULLSCREEN_STORAGE_KEY, String(updated));
          } catch {
            // Ignore sessionStorage quota/security exceptions
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('contest:violation', {
                detail: { type: 'fullscreen_exit', count: updated },
              })
            );
            reportTelemetry({ event_type: 'fullscreen_exit', count: 1 }).catch(() => {});
          }
          return updated;
        });
      }

      wasFullscreenRef.current = currentFullscreen;
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return {
    isFullscreen,
    exitCount,
    enterFullscreen,
  };
}

