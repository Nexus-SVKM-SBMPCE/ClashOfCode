import { useEffect, useState } from 'react';
import { getLeaderboard } from '../api';
import type { LeaderboardEntry } from '../api';

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function LeaderboardPage() {
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const refresh = () => {
    getLeaderboard()
      .then((r) => { setBoard(r.data); setLastUpdate(new Date()); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page leaderboard-page">
      <div className="page-header">
        <h2>Leaderboard</h2>
        <div className="lb-meta">
          <span className="live-badge">⚡ LIVE</span>
          <span className="update-time">Updated {lastUpdate.toLocaleTimeString()}</span>
          <button className="btn-refresh" onClick={refresh}>↻ Refresh</button>
        </div>
      </div>

      {loading ? (
        <div className="page-loading">Loading…</div>
      ) : (
        <div className="leaderboard-table-wrap">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Participant</th>
                <th>Score</th>
                <th>Solved</th>
                <th>Submissions</th>
                <th>Last AC</th>
              </tr>
            </thead>
            <tbody>
              {board.map((entry) => (
                <tr key={entry.user_id} className={entry.rank <= 3 ? `top-${entry.rank}` : ''}>
                  <td className="rank-cell">
                    {MEDAL[entry.rank] || `#${entry.rank}`}
                  </td>
                  <td className="name-cell">
                    <span className="display-name">{entry.display_name}</span>
                    <span className="username">@{entry.username}</span>
                  </td>
                  <td className="score-cell">
                    <span className="score-value">{entry.total_score}</span>
                  </td>
                  <td className="solved-cell">{entry.solved_count}</td>
                  <td className="subs-cell">{entry.total_submissions}</td>
                  <td className="time-cell">
                    {entry.last_ac_time
                      ? new Date(entry.last_ac_time).toLocaleTimeString()
                      : '—'}
                  </td>
                </tr>
              ))}
              {board.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">No submissions yet. Be the first!</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
