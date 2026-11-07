/**
 * Exam-security dialogs. All reuse the arena's existing modal shell
 * (`battle-finished-modal*` classes) so they match BattleFinishedModal.
 *
 * Every dialog is blocking: no backdrop dismiss, no Escape, focus kept inside.
 *   ExamSecurityNotice   rules + "not allowed" list; button unlocks after 10 s
 *   StrikeWarning        strike 1 / 2
 *   SessionLockedModal   strike 3 (server lock); cannot be closed
 *   FullscreenRequired   shown while enforcing and not fullscreen (e.g. after refresh)
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { NOTICE_MIN_READ_SECONDS, strikeCopy } from '../lib/examSecurity';

/** Keep keyboard focus inside the dialog; focus the action once it is usable. */
function useDialogFocus(actionEnabled = true) {
  const boxRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (actionEnabled) actionRef.current?.focus();
    else boxRef.current?.focus();
  }, [actionEnabled]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); return; }
    if (e.key !== 'Tab') return;
    const focusables = Array.from(boxRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
    if (focusables.length === 0) { e.preventDefault(); boxRef.current?.focus(); return; }
    const i = focusables.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    focusables[(i + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length].focus();
  };
  return { boxRef, actionRef, onKeyDown };
}

function Shell({ id, icon, role = 'dialog', title, children, boxRef, onKeyDown, tone }: {
  id: string; icon: string; role?: 'dialog' | 'alertdialog'; title: string; children: ReactNode;
  boxRef: RefObject<HTMLDivElement | null>; onKeyDown: (e: KeyboardEvent) => void; tone?: 'danger';
}) {
  return (
    <div className="battle-finished-modal-overlay exam-security-overlay" role={role} aria-modal="true"
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`} onKeyDown={onKeyDown}>
      <div ref={boxRef} tabIndex={-1} className={`battle-finished-modal exam-security-modal${tone ? ` exam-security-modal--${tone}` : ''}`}>
        <div className="modal-shield-wrap"><span className="modal-shield-icon" aria-hidden="true">{icon}</span></div>
        <h2 id={`${id}-title`} className="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function StrikeMeter({ count, max }: { count: number; max: number }) {
  return (
    <div className="exam-strike-meter" aria-label={`${count} of ${max} violations`}>
      <div className="exam-strike-pips" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => <span key={i} className={i < count ? 'is-hit' : ''} />)}
      </div>
      <span className="exam-strike-text">{Math.min(count, max)} / {max} Violations</span>
    </div>
  );
}

// ─── Security notice (shown right after login) ───────────────────────────────
export const NOT_ALLOWED: Array<{ what: string; detail: string }> = [
  { what: 'Copying, cutting or pasting', detail: 'Ctrl/⌘ + C, X, V, Shift + Insert, right-click menu, drag & drop' },
  { what: 'Switching tabs or windows', detail: 'Other browser tabs, Alt + Tab, minimising the browser' },
  { what: 'Leaving fullscreen', detail: 'Esc, F11 or any other way out of fullscreen' },
  { what: 'Using outside help', detail: 'Other websites, AI tools, chat apps, phones or other people' },
];

export function ExamSecurityNotice({ onAcknowledge, maxStrikes = 3 }: { onAcknowledge: () => void; maxStrikes?: number }) {
  const [remaining, setRemaining] = useState(NOTICE_MIN_READ_SECONDS);
  const ready = remaining <= 0;
  const { boxRef, actionRef, onKeyDown } = useDialogFocus(ready);

  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining, ready]);

  return (
    <Shell id="exam-notice" icon="🛡️" title="Examination Security Guidelines" boxRef={boxRef} onKeyDown={onKeyDown}>
      <p className="modal-lead">Before proceeding, please read the following examination rules carefully.</p>
      <div id="exam-notice-body">
        <h3 className="exam-security-subhead">Not allowed during the contest</h3>
        <ul className="exam-security-rules exam-security-rules--deny">
          {NOT_ALLOWED.map((r) => (
            <li key={r.what}><b>🚫 {r.what}</b><span>{r.detail}</span></li>
          ))}
        </ul>
        <h3 className="exam-security-subhead">How it is enforced</h3>
        <ol className="exam-security-rules">
          <li><b>Copy-Paste Restrictions</b><span>Copying, cutting and pasting are blocked in the quest and code editor. Every attempt is recorded.</span></li>
          <li><b>Tab Switching &amp; Fullscreen Monitoring</b><span>The contest runs in fullscreen. Leaving the window or exiting fullscreen is detected and counted.</span></li>
          <li><b>Three-Strike Rule</b><span>Each violation is one strike and is visible to the administrator. {maxStrikes} strikes lock your contest session; your saved code is kept and only an administrator can unlock you.</span></li>
        </ol>
        <p className="modal-description">
          Please remain on the examination window throughout the examination.
          Logging out does not reset your strikes.
        </p>
      </div>
      <button ref={actionRef} type="button" className="btn btn-primary btn-lg" disabled={!ready}
        onClick={onAcknowledge} aria-describedby="exam-notice-wait">
        {ready ? 'I Understand & Continue' : `Please read the rules (${remaining}s)`}
      </button>
      <p id="exam-notice-wait" className="exam-security-hint" aria-live="polite">
        {ready ? 'Continuing will switch the contest to fullscreen.' : `You can continue in ${remaining} second${remaining === 1 ? '' : 's'}.`}
      </p>
    </Shell>
  );
}

// ─── Strike warnings ─────────────────────────────────────────────────────────
export function StrikeWarning({ count, maxStrikes, onReturn }: { count: number; maxStrikes: number; onReturn: () => void }) {
  const { boxRef, actionRef, onKeyDown } = useDialogFocus();
  const copy = strikeCopy(count);
  return (
    <Shell id="strike-warning" icon="⚠️" role="alertdialog" title={copy.title} boxRef={boxRef} onKeyDown={onKeyDown}>
      <p id="strike-warning-body" className="modal-description">{copy.message}</p>
      <StrikeMeter count={count} max={maxStrikes} />
      <button ref={actionRef} type="button" className="btn btn-primary btn-lg" onClick={onReturn}>
        Return to the Contest
      </button>
    </Shell>
  );
}

export function SessionLockedModal({ count, maxStrikes, onSignOut }: { count: number; maxStrikes: number; onSignOut: () => void }) {
  const { boxRef, actionRef, onKeyDown } = useDialogFocus();
  const copy = strikeCopy(maxStrikes);
  return (
    <Shell id="session-locked" icon="🔒" role="alertdialog" title={copy.title} boxRef={boxRef} onKeyDown={onKeyDown} tone="danger">
      <p id="session-locked-body" className="modal-description">{copy.message}</p>
      <StrikeMeter count={Math.max(count, maxStrikes)} max={maxStrikes} />
      <div className="modal-status-badge exam-security-badge">
        <span className="modal-status-dot" />
        <span className="modal-status-text">Session Locked • Waiting for administrator</span>
      </div>
      <button ref={actionRef} type="button" className="btn btn-secondary" onClick={onSignOut}>Sign out</button>
    </Shell>
  );
}

// ─── Fullscreen required ─────────────────────────────────────────────────────
export function FullscreenRequired({ onEnter, denied }: { onEnter: () => void; denied: boolean }) {
  const { boxRef, actionRef, onKeyDown } = useDialogFocus();
  return (
    <Shell id="fullscreen-required" icon="🖥️" title="Fullscreen Required" boxRef={boxRef} onKeyDown={onKeyDown}>
      <p id="fullscreen-required-body" className="modal-description">
        The contest must be taken in fullscreen. Press the button below to return to fullscreen and continue.
        {denied && <><br /><b className="exam-security-error">Your browser blocked fullscreen. Allow fullscreen for this site (or press F11) and try again.</b></>}
      </p>
      <button ref={actionRef} type="button" className="btn btn-primary btn-lg" onClick={onEnter}>Enter Fullscreen</button>
    </Shell>
  );
}
