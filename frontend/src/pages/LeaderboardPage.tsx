import { useCallback, useEffect, useState } from 'react';
import { getLeaderboard, demoMode } from '../api';
import type { LeaderboardEntry } from '../api';
import { useAuth } from '../AuthContext';
import Icon from '../components/Icon';

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(() => new Date());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setRefreshing(true);
    getLeaderboard()
      .then((r) => { setBoard(r.data); setLastUpdate(new Date()); setError(null); })
      .catch((e) => setError(e.response?.status === 403 ? 'You do not have clearance to view the war rankings.' : 'Could not refresh the war rankings. Showing last known standings.'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="page page-leaderboard">
      {/* Background image */}
      <div className="lb-bg" aria-hidden="true">
        <div className="lb-bg-overlay" />
      </div>

      {/* Floating ember particles */}
      <div className="lb-embers" aria-hidden="true">
        {Array.from({ length: 15 }, (_, i) => (
          <div
            key={`lb-ember-${i}`}
            className="lb-ember"
            style={{
              left: `${3 + (i * 6.7) % 92}%`,
              animationDelay: `${(i * 0.5) % 4}s`,
              animationDuration: `${4 + (i % 3)}s`,
            }}
          />
        ))}
      </div>

      <div className="page-inner" style={{ position: 'relative', zIndex: 2 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">War Rankings</h1>
            <p className="page-sub">Ranked by battle score, then quests conquered, then time of last victorious submission.</p>
          </div>
          <div className="board-meta">
            <span>Updated <span className="mono">{lastUpdate.toLocaleTimeString()}</span> · every 15s</span>
            <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={refreshing}>
              <Icon name="refresh" className={refreshing ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {demoMode.enabled && <div className="demo-note"><span className="demo-tag">Demo</span> Sample war standings, not real battle results.</div>}
        {error && <div className="inline-error" role="alert"><Icon name="alert" size={14} /> {error}</div>}

        <div className="panel panel-scroll">
          <table className="table board-table">
            <thead>
              <tr>
                <th className="col-rank">Rank</th>
                <th className="col-clan">Clan</th>
                <th className="align-right col-score">Score</th>
                <th className="align-right col-conquered">Conquered</th>
                <th className="align-right col-attacks">Attacks</th>
                <th className="align-right col-victory">Last Victory</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }, (_, i) => (
                <tr key={`sk-${i}`} aria-hidden="true">
                  <td className="col-rank"><span className="skeleton" style={{ width: 24 }} /></td>
                  <td className="col-clan"><span className="skeleton" style={{ width: 140 }} /></td>
                  <td className="align-right col-score"><span className="skeleton" style={{ width: 40 }} /></td>
                  <td className="align-right col-conquered"><span className="skeleton" style={{ width: 30 }} /></td>
                  <td className="align-right col-attacks"><span className="skeleton" style={{ width: 30 }} /></td>
                  <td className="align-right col-victory"><span className="skeleton" style={{ width: 60 }} /></td>
                </tr>
              ))}
              {board.map((e) => {
                const podium = e.rank === 1 ? 'rank-1' : e.rank === 2 ? 'rank-2' : e.rank === 3 ? 'rank-3' : '';
                const isYou = user?.id === e.user_id;
                return (
                  <tr key={e.user_id} className={`${podium} ${isYou ? 'is-you' : ''}`}>
                    <td className="col-rank">
                      <span className="rank">
                        <span className="rank-mark" aria-hidden="true" />
                        {e.rank <= 3 && e.total_score > 0 ? (
                          <span>{e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : '🥉'} {e.rank}</span>
                        ) : e.rank}
                      </span>
                    </td>
                    <td className="col-clan">
                      <div className="team">
                        <span className="team-name">{e.display_name}{isYou && <span className="you-tag">YOU</span>}</span>
                      </div>
                    </td>
                    <td className="align-right col-score"><span className="score mono">{e.total_score}</span></td>
                    <td className="align-right col-conquered mono">{e.solved_count}</td>
                    <td className="align-right col-attacks mono">{e.total_submissions}</td>
                    <td className="align-right col-victory">
                      <span className="last-victory-text">
                        {e.last_ac_time ? new Date(e.last_ac_time).toLocaleTimeString() : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!loading && board.length === 0 && (
                <tr><td colSpan={6}><div className="state"><p className="state-title">No clans on the battlefield yet</p><p>War rankings appear as soon as clans begin their attacks.</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
