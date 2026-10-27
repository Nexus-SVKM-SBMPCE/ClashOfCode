/**
 * BatchGate — route-level guard for contestant batch locking.
 *
 * Renders `children` normally if:
 *   - the current user is an admin (admins always bypass)
 *   - the batch status is ACTIVE or COMPLETED
 *
 * Renders <WaitingScreen /> if:
 *   - the batch status is NOT_STARTED
 *   - the timer data is still loading (shows a brief spinner)
 *
 * Design decision: we rely exclusively on the `useCountdownTimer` hook which
 * already polls the server every 30 s. BatchGate itself adds no extra network
 * calls — zero duplication.
 */
import { type ReactNode, useCallback, useState } from 'react';
import { useAuth } from './AuthContext';
import { useCountdownTimer } from './useCountdownTimer';
import WaitingScreen from './WaitingScreen';

interface BatchGateProps {
  children: ReactNode;
}

export default function BatchGate({ children }: BatchGateProps) {
  const { user } = useAuth();
  const { status } = useCountdownTimer();

  // Local flag: once the batch has opened during this session, keep the
  // gate open even if the hook briefly bounces back to 'loading'.
  const [batchOpened, setBatchOpened] = useState(false);

  const handleBatchStarted = useCallback(() => {
    setBatchOpened(true);
  }, []);

  // Admins always see content
  if (user?.role === 'admin') {
    return <>{children}</>;
  }

  // Batch has been confirmed active at some point this session
  if (batchOpened) {
    return <>{children}</>;
  }

  // Timer is still loading — show a minimal non-distracting spinner
  // (not the full waiting screen, to avoid flash of wrong content)
  if (status === 'loading') {
    return (
      <div className="batch-gate-loading" role="status" aria-label="Checking contest status">
        <span className="batch-gate-spinner" aria-hidden="true">⚡</span>
        <p>Verifying contest status…</p>
      </div>
    );
  }

  // Batch is confirmed ACTIVE or COMPLETED — let through
  if (status === 'ACTIVE' || status === 'COMPLETED') {
    return <>{children}</>;
  }

  // Covers: NOT_STARTED, error (fail-closed for security)
  return <WaitingScreen onBatchStarted={handleBatchStarted} />;
}
