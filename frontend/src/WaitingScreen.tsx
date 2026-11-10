/**
 * WaitingScreen — shown to contestants when their batch has NOT_STARTED.
 *
 * Uses the useCountdownTimer hook (or props from BatchGate) to detect
 * when the batch transitions to ACTIVE, seamlessly unmounting and letting
 * contestants through without requiring manual page reload.
 */
import { useEffect } from 'react';
import { useCountdownTimer } from './useCountdownTimer';
import Icon from './components/Icon';

interface WaitingScreenProps {
  onBatchStarted?: () => void;
  batchName?: string;
  status?: string;
}

export default function WaitingScreen({ onBatchStarted, batchName: propBatchName, status: propStatus }: WaitingScreenProps) {
  const timer = useCountdownTimer();
  const status = propStatus ?? timer.status;
  const batchName = propBatchName ?? timer.batchName;

  // Auto-dismiss when the timer hook sees the batch go ACTIVE
  useEffect(() => {
    if (status === 'ACTIVE' && onBatchStarted) {
      onBatchStarted();
    }
  }, [status, onBatchStarted]);

  return (
    <div className="waiting-screen">
      <div className="waiting-icon-wrap">
        <span className="waiting-icon-emoji"><Icon name="clock" size={36} /></span>
      </div>

      <h1 className="waiting-title">Waiting for Battle to Begin</h1>
      <p className="waiting-subtitle">
        The admin has not started the batch yet. Please stand by.
      </p>

      {batchName && (
        <div className="waiting-batch-badge">
          <span className="waiting-batch-label">Your Batch:</span>
          <span className="waiting-batch-name">{batchName}</span>
        </div>
      )}

      <div className="waiting-status-row">
        <span className="waiting-dot" />
        <span className="waiting-status-text">
          {status === 'loading'
            ? 'Connecting to server…'
            : status === 'error'
              ? 'Cannot reach server — retrying…'
              : 'Listening for admin to start the timer…'}
        </span>
      </div>
    </div>
  );
}
