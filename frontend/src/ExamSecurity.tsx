/**
 * ExamSecurityProvider — post-login security notice + three-strike enforcement.
 *
 * Lifecycle (contestants only; logged-out visitors and admins get nothing at all):
 *   login ─▶ security notice immediately, on whatever route the app lands on
 *          (10 s minimum read time; "I Understand & Continue" also enters fullscreen)
 *        ─▶ acknowledged + batch ACTIVE + on a contest route (/problems…)  ⇒ ENFORCING:
 *             copy/cut/paste blocked + reported, tab switch + fullscreen exit reported,
 *             fullscreen required
 *        ─▶ strike 1/2 warnings, strike 3 = server lock (restored after refresh/login)
 *        ─▶ batch COMPLETED, sign-out, or not live ⇒ nothing is enforced
 *
 * Mounted once in the app shell, so moving between quests never re-registers
 * listeners or resets anything. The strike count is the server's, never local.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useCountdownTimer } from './useCountdownTimer';
import { useSecurityMonitor } from './hooks/useSecurityMonitor';
import { useCopyPasteGuard, type BlockedAction } from './hooks/useCopyPasteGuard';
import { acknowledgeNotice, enterFullscreen, fullscreenSupported, isNoticeAcknowledged } from './lib/examSecurity';
import { ExamSecurityNotice, FullscreenRequired, SessionLockedModal, StrikeWarning } from './components/ExamSecurityDialogs';
import type { ViolationType } from './api';

export interface ExamSecurityState {
  /** Restrictions + monitoring are live right now. */
  monitoring: boolean;
  /** Server strike count for this contestant's attempt, or null for non-contestants. */
  violations: number | null;
  maxStrikes: number;
  /** Server-side lock (3 strikes). Run/Submit are rejected by the backend too. */
  locked: boolean;
}

const IDLE: ExamSecurityState = { monitoring: false, violations: null, maxStrikes: 3, locked: false };
const ExamSecurityContext = createContext<ExamSecurityState>(IDLE);

export const useExamSecurity = () => useContext(ExamSecurityContext);

export const isContestRoute = (path: string) => path === '/problems' || path.startsWith('/problems/');

const CLIPBOARD_VIOLATION: Partial<Record<BlockedAction, ViolationType>> = {
  copy: 'COPY_ATTEMPT',
  cut: 'CUT_ATTEMPT',
  paste: 'PASTE_ATTEMPT',
  drop: 'PASTE_ATTEMPT',
};

function ContestantSecurity({ userId, onState }: { userId: number | string; onState: (s: ExamSecurityState) => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { status: contestStatus } = useCountdownTimer();
  const [acknowledged, setAcknowledged] = useState(() => isNoticeAcknowledged(userId));
  const [fullscreenDenied, setFullscreenDenied] = useState(false);

  // A locked attempt stays enforcing (copy still blocked); report() ignores new strikes while locked.
  const enforcing = acknowledged && isContestRoute(pathname) && contestStatus === 'ACTIVE';
  const monitor = useSecurityMonitor(userId, enforcing);

  const { report } = monitor;
  const onClipboardBlocked = useCallback((action: BlockedAction) => {
    const type = CLIPBOARD_VIOLATION[action];
    if (type) report(type);
  }, [report]);
  // Scoped by lifecycle: only attached while enforcing, which is only ever true for an
  // acknowledged contestant on a contest route during a live batch.
  useCopyPasteGuard(enforcing ? document.body : null, enforcing, onClipboardBlocked, { scope: String(userId) });

  useEffect(() => {
    onState({ monitoring: enforcing, violations: monitor.count, maxStrikes: monitor.maxStrikes, locked: monitor.locked });
  }, [enforcing, monitor.count, monitor.maxStrikes, monitor.locked, onState]);

  const goFullscreen = useCallback(() => {
    enterFullscreen().then((ok) => setFullscreenDenied(!ok && fullscreenSupported()));
  }, []);

  const handleAcknowledge = () => {
    acknowledgeNotice(userId);
    setAcknowledged(true);
    goFullscreen(); // inside the click: the only moment browsers allow it
  };

  const handleReturn = () => {
    monitor.dismissWarning();
    if (!monitor.fullscreen) goFullscreen();
  };

  const handleSignOut = () => { signOut(); navigate('/login'); };

  if (pathname === '/login') return null;
  if (!acknowledged) return <ExamSecurityNotice onAcknowledge={handleAcknowledge} maxStrikes={monitor.maxStrikes} />;
  if (monitor.locked) return <SessionLockedModal count={monitor.count} maxStrikes={monitor.maxStrikes} onSignOut={handleSignOut} />;
  if (monitor.warningCount != null) {
    return <StrikeWarning count={monitor.warningCount} maxStrikes={monitor.maxStrikes} onReturn={handleReturn} />;
  }
  if (enforcing && fullscreenSupported() && !monitor.fullscreen) {
    return <FullscreenRequired onEnter={goFullscreen} denied={fullscreenDenied} />;
  }
  return null;
}

export function ExamSecurityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<ExamSecurityState>(IDLE);
  const contestantId = user?.role === 'contestant' ? (user.id ?? user.username) : null;
  const value = contestantId == null ? IDLE : state;

  return (
    <ExamSecurityContext.Provider value={value}>
      {children}
      {/* key: a different login gets a fresh notice + monitor instance */}
      {contestantId != null && <ContestantSecurity key={contestantId} userId={contestantId} onState={setState} />}
    </ExamSecurityContext.Provider>
  );
}
