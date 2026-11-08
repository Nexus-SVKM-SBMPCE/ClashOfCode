/**
 * useSecurityMonitor — unified three-strike violation tracker for one contestant.
 *
 * Sources (only counted while `enforcing`):
 *   TAB_SWITCH       document.visibilitychange → hidden  (tab switch, minimise, Alt+Tab that hides)
 *   FULLSCREEN_EXIT  fullscreenchange: was fullscreen → not fullscreen (Esc, F11, Ctrl+Tab)
 *   COPY/CUT/PASTE   `report()` called by useCopyPasteGuard
 * Window blur is deliberately not a source (would double-count).
 *
 * One action = one strike:
 *   - client: reports inside CLIENT_DEDUPE_MS of the previous one are dropped
 *     (Ctrl+Tab fires fullscreenchange + visibilitychange; Ctrl+C fires keydown, …)
 *   - server: same event id ignored, plus its own 2 s same-incident window
 *   - page unload (refresh / navigation away) is never a violation
 *   - network failure never adds a strike: the report is queued with its id and
 *     re-sent later; the server de-duplicates by id
 *
 * Count + lock come from the server only. While locked the hook polls status so an
 * admin unlock takes effect without a reload.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSecurityStatus, reportViolation, type SecurityStatus, type ViolationType } from '../api';
import { isFullscreen, newEventId, readPending, writePending, type PendingViolation } from '../lib/examSecurity';

export const CLIENT_DEDUPE_MS = 1500;
const LOCKED_POLL_MS = 15_000;

export interface SecurityMonitor {
  status: SecurityStatus | null;
  count: number;
  maxStrikes: number;
  locked: boolean;
  /** Strike number to warn about (1 or 2), or null. Strike 3 shows the lock instead. */
  warningCount: number | null;
  dismissWarning: () => void;
  /** Report a violation; returns false when ignored (not enforcing, locked, same incident). */
  report: (type: ViolationType) => boolean;
  fullscreen: boolean;
}

export function useSecurityMonitor(userId: number | string, enforcing: boolean): SecurityMonitor {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [warningCount, setWarningCount] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(isFullscreen);

  const enforcingRef = useRef(enforcing);
  const lockedRef = useRef(false);
  const lastReportRef = useRef(0);
  const wasFullscreenRef = useRef(isFullscreen());
  const unloadingRef = useRef(false);

  useEffect(() => { enforcingRef.current = enforcing; }, [enforcing]);

  const apply = useCallback((s: SecurityStatus, fromReport: boolean) => {
    lockedRef.current = s.locked;
    setStatus(s);
    if (s.locked) setWarningCount(null);
    else if (fromReport && s.recorded) setWarningCount(s.count);
  }, []);

  const refreshStatus = useCallback(() => {
    Promise.resolve().then(() => getSecurityStatus())
      .then((r) => apply(r.data, false))
      .catch(() => { /* offline: keep last known status */ });
  }, [apply]);

  const send = useCallback((p: PendingViolation) => {
    const drop = () => writePending(userId, readPending(userId).filter((q) => q.id !== p.id));
    Promise.resolve().then(() => reportViolation(p.id, p.type, { path: window.location.pathname }))
      .then((r) => { drop(); apply(r.data, true); })
      .catch((e) => {
        // No response = network problem: keep it queued (same id → no double strike).
        // A real HTTP error (401/422/…) will not succeed on retry: drop it.
        if (e?.response) drop();
      });
  }, [userId, apply]);

  const flushPending = useCallback(() => { readPending(userId).forEach(send); }, [userId, send]);

  const report = useCallback((type: ViolationType): boolean => {
    if (!enforcingRef.current || lockedRef.current || unloadingRef.current) return false;
    const now = Date.now();
    if (now - lastReportRef.current < CLIENT_DEDUPE_MS) return false;
    lastReportRef.current = now;
    const p: PendingViolation = { id: newEventId(), type };
    writePending(userId, [...readPending(userId), p]);
    send(p);
    return true;
  }, [userId, send]);

  // Restore server state on login / refresh, then deliver anything queued offline
  useEffect(() => {
    refreshStatus();
    flushPending();
    window.addEventListener('online', flushPending);
    return () => window.removeEventListener('online', flushPending);
  }, [refreshStatus, flushPending]);

  // While locked, poll so an admin unlock is picked up
  const locked = !!status?.locked;
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(refreshStatus, LOCKED_POLL_MS);
    return () => clearInterval(id);
  }, [locked, refreshStatus]);

  // Browser signals. Listeners exist only while this (contestant-only) hook is mounted;
  // `report` itself ignores everything unless enforcing.
  useEffect(() => {
    // A refresh fires beforeunload/pagehide just before the page goes hidden; that hidden
    // event must not count. If the page is still alive shortly after (navigation cancelled,
    // restored from back/forward cache), monitoring resumes.
    let unloadTimer: ReturnType<typeof setTimeout> | undefined;
    const onUnload = () => {
      unloadingRef.current = true;
      clearTimeout(unloadTimer);
      unloadTimer = setTimeout(() => { unloadingRef.current = false; }, 1000);
    };
    const onPageShow = () => { clearTimeout(unloadTimer); unloadingRef.current = false; };
    const onVisibility = () => { if (document.visibilityState === 'hidden') report('TAB_SWITCH'); };
    const onFullscreen = () => {
      const fs = isFullscreen();
      setFullscreen(fs);
      if (wasFullscreenRef.current && !fs) report('FULLSCREEN_EXIT');
      wasFullscreenRef.current = fs;
    };
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      clearTimeout(unloadTimer);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [report]);

  const dismissWarning = useCallback(() => setWarningCount(null), []);

  return {
    status,
    count: status?.count ?? 0,
    maxStrikes: status?.max_strikes ?? 3,
    locked,
    warningCount: locked ? null : warningCount,
    dismissWarning,
    report,
    fullscreen,
  };
}
