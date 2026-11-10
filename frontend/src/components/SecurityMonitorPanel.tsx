/**
 * SecurityMonitorPanel — admin "Security Watch" tab on the War Room page.
 *
 * Lists every contestant attempt with violations or a lock (per batch), and opens an
 * incident history where an admin can UNLOCK (strikes kept) or RESET (strikes voided
 * + unlocked). Both require a written reason; the server records who did it.
 * All endpoints are admin-only on the server (403 for contestants).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  getSecurityIncidents, getSecurityParticipants, resetParticipantViolations, unlockParticipant,
  type BatchAdminInfo, type SecurityIncidentHistory, type SecurityParticipant,
} from '../api';
import { useToast } from '../Toast';
import { VIOLATION_LABELS } from '../lib/examSecurity';

const POLL_MS = 10_000;

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

function errorText(e: any): string {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
  if (d && typeof d.message === 'string') return d.message;
  return e?.message ?? 'Request failed';
}

export default function SecurityMonitorPanel({ batches }: { batches: BatchAdminInfo[] }) {
  const { addToast } = useToast();
  const [batchId, setBatchId] = useState<number | undefined>(undefined);
  const [rows, setRows] = useState<SecurityParticipant[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ userId: number; batchId: number | null } | null>(null);
  const [history, setHistory] = useState<SecurityIncidentHistory | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getSecurityParticipants(batchId)
      .then((r) => { setRows(r.data); setLoadError(null); })
      .catch((e) => setLoadError(errorText(e)));
  }, [batchId]);

  const loadHistory = useCallback(() => {
    if (!selected) return;
    getSecurityIncidents(selected.userId, selected.batchId)
      .then((r) => setHistory(r.data))
      .catch((e) => addToast('Could not load incident history: ' + errorText(e), 'error'));
  }, [selected, addToast]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => { setHistory(null); setReason(''); loadHistory(); }, [loadHistory]);

  const act = async (kind: 'unlock' | 'reset') => {
    if (!selected || reason.trim().length < 3) return;
    setBusy(true);
    try {
      const fn = kind === 'unlock' ? unlockParticipant : resetParticipantViolations;
      const r = await fn(selected.userId, reason.trim(), selected.batchId);
      setHistory(r.data);
      setReason('');
      addToast(kind === 'unlock' ? 'Participant unlocked' : 'Violations reset and participant unlocked', 'success');
      load();
    } catch (e) {
      addToast(`${kind === 'unlock' ? 'Unlock' : 'Reset'} failed: ${errorText(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const lockedCount = rows.filter((r) => r.status === 'LOCKED').length;
  const p = history?.participant;

  return (
    <div className="security-watch">
      <div className="batch-filter-bar">
        <span className="batch-filter-label">Filter Batch:</span>
        <button className={`btn btn-sm ${batchId === undefined ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setBatchId(undefined)}>
          All Batches
        </button>
        {batches.map((b) => (
          <button key={b.id} className={`btn btn-sm ${batchId === b.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setBatchId(b.id)}>
            {b.name}
          </button>
        ))}
        <span className="security-watch-summary">{rows.length} flagged · <b>{lockedCount} locked</b></span>
      </div>

      {loadError && <div className="inline-error" role="alert">{loadError}</div>}

      <div className="panel panel-scroll">
        <table className="table board-table security-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Batch</th>
              <th className="num">Strikes</th>
              <th className="num">Tab</th>
              <th className="num">Fullscreen</th>
              <th className="num">Copy/Paste</th>
              <th>Status</th>
              <th>Last violation</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="security-empty">No security violations recorded{batchId ? ' for this batch' : ''}.</td></tr>
            )}
            {rows.map((r) => {
              const isOpen = selected?.userId === r.user_id && selected.batchId === r.batch_id;
              return (
                <tr key={`${r.user_id}-${r.batch_id}`} className={isOpen ? 'is-you' : ''}>
                  <td>
                    <b>{r.team_name ?? r.display_name}</b>
                    <div className="security-sub">@{r.username}</div>
                  </td>
                  <td>{r.batch_name ?? '—'}</td>
                  <td className="num"><b>{r.total_violations}</b> / 3{r.lifetime_violations > r.total_violations && <div className="security-sub">{r.lifetime_violations} lifetime</div>}</td>
                  <td className="num">{r.tab_switches}</td>
                  <td className="num">{r.fullscreen_exits}</td>
                  <td className="num">{r.copy_paste_attempts}</td>
                  <td><span className={`security-status security-status--${r.status.toLowerCase()}`}>{r.status === 'LOCKED' ? 'Locked' : 'Active'}</span></td>
                  <td>{fmt(r.last_violation_at)}</td>
                  <td>
                    <button className="btn btn-sm btn-secondary" aria-expanded={isOpen}
                      onClick={() => setSelected(isOpen ? null : { userId: r.user_id, batchId: r.batch_id })}>
                      {isOpen ? 'Close' : 'Review'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <section className="panel security-history" aria-label="Incident history">
          {!history ? (
            <div className="state"><span className="spinner" /> Loading incident history…</div>
          ) : (
            <>
              <header className="security-history-head">
                <h3>Incident history — {p?.team_name ?? p?.display_name} <span className="security-sub">@{p?.username}</span></h3>
                <span className={`security-status security-status--${(p?.status ?? 'ACTIVE').toLowerCase()}`}>
                  {p?.status === 'LOCKED' ? `Locked ${fmt(p.locked_at)}` : 'Active'}
                </span>
              </header>

              <div className="security-history-grid">
                <div>
                  <h4>Violations</h4>
                  {history.events.length === 0 ? <p className="security-sub">None recorded.</p> : (
                    <ol className="security-events">
                      {history.events.map((e) => (
                        <li key={e.id} className={e.voided ? 'is-voided' : ''}>
                          <span className="security-strike">#{e.violation_number ?? '?'}</span>
                          <span>{VIOLATION_LABELS[e.event_type] ?? e.event_type}</span>
                          <time>{fmt(e.created_at)}</time>
                          {e.voided && <span className="security-sub">voided by reset</span>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <div>
                  <h4>Admin actions</h4>
                  {history.actions.length === 0 ? <p className="security-sub">No admin actions yet.</p> : (
                    <ol className="security-events">
                      {history.actions.map((a) => (
                        <li key={a.id}>
                          <span className="security-strike">{a.action}</span>
                          <span>by <b>{a.admin_username}</b>: “{a.reason}”</span>
                          <time>{fmt(a.created_at)}</time>
                        </li>
                      ))}
                    </ol>
                  )}

                  <label className="security-reason">
                    <span>Reason (required, recorded in the audit trail)</span>
                    <textarea className="input" rows={2} maxLength={500} value={reason}
                      onChange={(e) => setReason(e.target.value)} placeholder="e.g. Invigilator confirmed a projector glitch" />
                  </label>
                  <div className="security-actions">
                    <button className="btn btn-primary btn-sm" disabled={busy || reason.trim().length < 3 || p?.status !== 'LOCKED'}
                      onClick={() => act('unlock')} title="Unlock and keep strikes: the next violation locks again">
                      Unlock (keep strikes)
                    </button>
                    <button className="btn btn-secondary btn-sm" disabled={busy || reason.trim().length < 3 || (p?.total_violations ?? 0) === 0}
                      onClick={() => act('reset')} title="Void all current strikes (kept in history) and unlock">
                      Reset strikes &amp; unlock
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
