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
      .catch((e) => setError(e.response?.status === 403 ? 'You do not have access to the leaderboard.' : 'Could not refresh the leaderboard. Showing the last known standings.'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1 className="page-title">Leaderboard</h1>
            <p className="page-sub">Ranked by score, then problems solved, then time of the last scoring submission.</p>
          </div>
          <div className="board-meta">
            <span>Updated <span className="mono">{lastUpdate.toLocaleTimeString()}</span> · every 15s</span>
            <button className="btn" onClick={refresh} disabled={refreshing}>
              {refreshing ? <span className="spinner" /> : <Icon name="refresh" size={14} />} Refresh
            </button>
          </div>
        </div>

        {demoMode.enabled && <div className="demo-note"><span className="demo-tag">Demo</span> Sample standings, not real contest results.</div>}
        {error && <div className="inline-error" role="alert"><Icon name="alert" size={14} /> {error}</div>}

        <div className="panel panel-scroll">
          <table className="table board-table">
            <thead>
              <tr>
                <th className="col-rank">Rank</th>
                <th>Team</th>
                <th className="align-right">Score</th>
                <th className="align-right">Solved</th>
                <th className="align-right col-secondary">Submissions</th>
                <th className="align-right col-secondary">Last AC</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }, (_, i) => (
                <tr key={`sk-${i}`} aria-hidden="true">
                  <td><span className="skeleton" style={{ width: 24 }} /></td>
                  <td><span className="skeleton" style={{ width: 160 }} /></td>
                  <td colSpan={4}><span className="skeleton" style={{ width: '100%' }} /></td>
                </tr>
              ))}
              {board.map((e) => {
                const podium = e.total_score > 0 && e.rank <= 3 ? `rank-${e.rank}` : '';
                const isYou = user?.id === e.user_id;
                return (
                  <tr key={e.user_id} className={`${podium} ${isYou ? 'is-you' : ''}`}>
                    <td><span className="rank"><span className="rank-mark" aria-hidden="true" />{e.rank}</span></td>
                    <td>
                      <div className="team">
                        <span className="team-name">{e.display_name}{isYou && <span className="you-tag">YOU</span>}</span>
                        <span className="team-handle">@{e.username}</span>
                      </div>
                    </td>
                    <td className="align-right"><span className="score">{e.total_score}</span></td>
                    <td className="align-right mono">{e.solved_count}</td>
                    <td className="align-right mono col-secondary">{e.total_submissions}</td>
                    <td className="align-right mono col-secondary">{e.last_ac_time ? new Date(e.last_ac_time).toLocaleTimeString() : '—'}</td>
                  </tr>
                );
              })}
              {!loading && board.length === 0 && (
                <tr><td colSpan={6}><div className="state"><p className="state-title">No teams on the board yet</p><p>Standings appear as soon as teams start submitting.</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
