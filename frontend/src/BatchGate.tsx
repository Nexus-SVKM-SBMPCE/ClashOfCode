/**
 * BatchGate — route-level guard for contestant batch locking.
 *
 * Renders `children` normally if:
 *   - the current user is an admin (admins always bypass)
 *   - the batch status is ACTIVE or COMPLETED (wrapped in FullscreenGate for contestants)
 *
 * Renders <WaitingScreen /> if:
 *   - the batch status is NOT_STARTED
 *   - the status is error (fail-closed for security)
 *
 * Renders loading spinner if:
 *   - the timer data is still initializing (loading state)
 */
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useCountdownTimer } from './useCountdownTimer';
import WaitingScreen from './WaitingScreen';
import FullscreenGate from './components/FullscreenGate';

interface BatchGateProps {
  children: ReactNode;
}

export default function BatchGate({ children }: BatchGateProps) {
  const { user } = useAuth();
  const { status, batchName } = useCountdownTimer();

  // Local flag: once the batch has opened during this session, keep the
  // gate open even if the hook briefly bounces back to 'loading'.
  const [batchOpened, setBatchOpened] = useState(false);

  useEffect(() => {
    if (status === 'ACTIVE' || status === 'COMPLETED') {
      setBatchOpened(true);
    }
  }, [status]);

  const handleBatchStarted = useCallback(() => {
    setBatchOpened(true);
  }, []);

  // Admins always see content directly without gating
  if (user?.role === 'admin') {
    return <>{children}</>;
  }

  // Strictly enforce WaitingScreen if status is NOT_STARTED — never allow children to be accessed
  if (status === 'NOT_STARTED') {
    return <WaitingScreen onBatchStarted={handleBatchStarted} batchName={batchName} status={status} />;
  }

  // Batch has been confirmed active at some point this session (and is not NOT_STARTED)
  if (batchOpened) {
    return <FullscreenGate>{children}</FullscreenGate>;
  }

  // Timer is still loading — show a minimal non-distracting spinner
  if (status === 'loading') {
    return (
      <div className="batch-gate-loading" role="status" aria-label="Checking contest status">
        <span className="spinner" aria-hidden="true" />
        <p>Verifying contest status…</p>
      </div>
    );
  }

  // Batch is confirmed ACTIVE or COMPLETED — let through into FullscreenGate
  if (status === 'ACTIVE' || status === 'COMPLETED') {
    return <FullscreenGate>{children}</FullscreenGate>;
  }

  // Covers: error (fail-closed for security)
  return <WaitingScreen onBatchStarted={handleBatchStarted} batchName={batchName} status={status} />;
}
