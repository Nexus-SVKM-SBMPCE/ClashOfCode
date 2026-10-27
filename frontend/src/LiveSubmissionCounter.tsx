import { useEffect, useRef, useState } from 'react';
import { useSubmissionStats } from './hooks/useSubmissionStats';
import Icon from './components/Icon';

/** Header readout: live arena-wide submission total, accepted count beside it. */
export default function LiveSubmissionCounter() {
  const stats = useSubmissionStats();
  const prev = useRef<number | null>(null);
  const [bump, setBump] = useState(0);

  const total = stats?.total_submissions ?? null;
  useEffect(() => {
    if (total === null) return;
    if (prev.current !== null && total > prev.current) setBump((b) => b + 1);
    prev.current = total;
  }, [total]);

  if (!stats) return <div className="live-counter live-counter-skeleton" aria-hidden="true" />;

  return (
    <div
      className="live-counter"
      title={`${stats.accepted_today} accepted today · ${stats.active_teams} team${stats.active_teams === 1 ? '' : 's'} active (last 15 min)`}
      aria-live="polite"
    >
      <span className="live-dot" aria-hidden="true" />
      <span key={bump} className={`live-counter-value ${bump ? 'bump' : ''}`}>
        {stats.total_submissions.toLocaleString()}
      </span>
      <span className="live-counter-label">submissions</span>
      <span className="live-counter-sep" aria-hidden="true" />
      <span className="live-counter-ac" aria-label={`${stats.accepted_today} accepted today`}>
        <Icon name="check" size={13} /> {stats.accepted_today} <span className="live-counter-label">AC today</span>
      </span>
    </div>
  );
}
