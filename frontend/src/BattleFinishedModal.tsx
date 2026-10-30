/**
 * BattleFinishedModal — non-closable modal displayed when the contest timer expires.
 *
 * Implements Sanchita Phase 3 (Contest Expiry Window):
 * - Displays when useCountdownTimer status becomes 'COMPLETED'.
 * - Completely non-closable: no close button, backdrop click is inert, locks the arena.
 */

export default function BattleFinishedModal() {
  return (
    <div
      className="battle-finished-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="battle-finished-title"
    >
      <div className="battle-finished-modal">
        <div className="modal-shield-wrap">
          <span className="modal-shield-icon">⚔️</span>
        </div>

        <h2 id="battle-finished-title" className="modal-title">
          Battle Finished
        </h2>
        
        <p className="modal-lead">
          The contest timer has expired and the battle window has closed.
        </p>

        <p className="modal-description">
          All code submissions are now frozen and the editor is locked.
          Official scores and final standings are being calculated.
        </p>

        <div className="modal-status-badge">
          <span className="modal-status-dot" />
          <span className="modal-status-text">Contest Expired • Submissions Locked</span>
        </div>
      </div>
    </div>
  );
}
