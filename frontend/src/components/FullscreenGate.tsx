/**
 * FullscreenGate — Contest Anti-Cheat Fullscreen Gatekeeper Component
 *
 * Enforces fullscreen mode for contestants across battle arena routes.
 * Admins bypass this gate completely.
 *
 * States:
 * - State A (exitCount === 0): First time landing without fullscreen.
 * - State B (exitCount > 0): Unauthorized exit detected, displays violation count.
 */
import { type ReactNode } from 'react';
import { useAuth } from '../AuthContext';
import { useFullscreenLock } from '../hooks/useFullscreenLock';
import Icon from './Icon';

interface FullscreenGateProps {
  children: ReactNode;
}

export default function FullscreenGate({ children }: FullscreenGateProps) {
  const { user } = useAuth();
  const { isFullscreen, exitCount, enterFullscreen } = useFullscreenLock();

  // Admin users bypass all fullscreen enforcement
  if (user?.role === 'admin') {
    return <>{children}</>;
  }

  // Contestant is in fullscreen — permit interaction
  if (isFullscreen) {
    return <>{children}</>;
  }

  const isViolation = exitCount > 0;

  return (
    <div
      className="fullscreen-gate-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fullscreen-gate-heading"
    >
      <div className={`fullscreen-gate-card ${isViolation ? 'fullscreen-gate-card--violation' : ''}`}>
        <div className={`modal-shield-wrap ${isViolation ? 'modal-shield-wrap--violation' : ''}`} aria-hidden="true">
          <span>{isViolation ? '⚠️' : '🛡️'}</span>
        </div>

        {isViolation && (
          <div className="fullscreen-violation-badge">
            <span className="violation-dot" />
            Violation Count: {exitCount}
          </div>
        )}

        <h2 id="fullscreen-gate-heading" className="gate-title">
          {isViolation ? 'War Alert: Fullscreen Violation' : 'Contest Arena - Fullscreen Required'}
        </h2>

        <p className="gate-message">
          {isViolation
            ? `You exited fullscreen mode. Violation count: ${exitCount}. This incident has been logged.`
            : 'To maintain contest integrity, the battle arena must be run in Fullscreen Mode.'}
        </p>

        <button
          type="button"
          className={`btn ${isViolation ? 'btn-danger' : 'btn-primary'} btn-lg`}
          onClick={enterFullscreen}
        >
          <Icon name="play" size={16} />
          {isViolation ? 'Return to Fullscreen' : 'Enter Fullscreen Arena'}
        </button>
      </div>
    </div>
  );
}

