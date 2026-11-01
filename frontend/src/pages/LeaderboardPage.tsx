import { useCallback, useEffect, useState } from 'react';
import {
  getLeaderboard,
  getAdminBatches,
  getAdminTeams,
  assignTeamBatch,
  autoAllotBatches,
  startBatchTimer,
  demoMode,
} from '../api';
import type { LeaderboardEntry, BatchAdminInfo, TeamAdminInfo } from '../api';
import { useAuth } from '../AuthContext';
import { useToast } from '../Toast';
import Icon from '../components/Icon';

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'rankings' | 'allotment'>('rankings');
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [batches, setBatches] = useState<BatchAdminInfo[]>([]);
  const [teams, setTeams] = useState<TeamAdminInfo[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | undefined>(undefined);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(() => new Date());
  const [error, setError] = useState<string | null>(null);

  const [teamsPerBatchInput, setTeamsPerBatchInput] = useState<number>(2);

  const refreshLeaderboard = useCallback((batchId?: number) => {
    setRefreshing(true);
    getLeaderboard(batchId)
      .then((r) => {
        setBoard(r.data);
        setLastUpdate(new Date());
        setError(null);
      })
      .catch((e) => {
        setError(
          e.response?.status === 403
            ? 'You do not have clearance to view the war rankings.'
            : 'Could not refresh the war rankings. Showing last known standings.'
        );
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  const loadBatches = useCallback(() => {
    getAdminBatches()
      .then((r) => setBatches(r.data))
      .catch(() => {});
  }, []);

  const loadTeams = useCallback(() => {
    getAdminTeams()
      .then((r) => setTeams(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    refreshLeaderboard(selectedBatchId);
    const interval = setInterval(() => {
      refreshLeaderboard(selectedBatchId);
      if (activeTab === 'allotment') {
        loadBatches();
        loadTeams();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [refreshLeaderboard, selectedBatchId, activeTab, loadBatches, loadTeams]);

  useEffect(() => {
    if (activeTab === 'allotment') {
      loadBatches();
      loadTeams();
    }
  }, [activeTab, loadBatches, loadTeams]);

  const handleSelectBatch = (batchId?: number) => {
    setSelectedBatchId(batchId);
    refreshLeaderboard(batchId);
  };

  const handleAssignBatch = async (teamId: number, batchId: number | null) => {
    setActionLoading(true);
    try {
      await assignTeamBatch(teamId, batchId);
      addToast('Clan batch allotment updated', 'success');
      loadTeams();
      loadBatches();
      refreshLeaderboard(selectedBatchId);
    } catch {
      addToast('Failed to assign clan to batch', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoAllot = async (teamsPerBatch?: number) => {
    setActionLoading(true);
    try {
      const resp = await autoAllotBatches(teamsPerBatch);
      addToast(resp.data?.message || 'Clans allotted across batches successfully', 'success');
      loadTeams();
      loadBatches();
      refreshLeaderboard(selectedBatchId);
    } catch {
      addToast('Failed to auto-allot clans across batches', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartTimer = async (batchId: number, batchName: string) => {
    setActionLoading(true);
    try {
      await startBatchTimer(batchId);
      addToast(`Countdown timer started for ${batchName}`, 'success');
      loadBatches();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Failed to start timer for batch', 'error');
    } finally {
      setActionLoading(false);
    }
  };

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
            <button className="btn btn-ghost btn-sm" onClick={() => refreshLeaderboard(selectedBatchId)} disabled={refreshing}>
              <Icon name="refresh" className={refreshing ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Admin Navigation Tabs */}
        {user?.role === 'admin' && (
          <div className="view-toggle-bar">
            <button
              className={`btn btn-sm ${activeTab === 'rankings' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('rankings')}
            >
              ⚔️ War Standings
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'allotment' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('allotment')}
            >
              🛡️ Clan Allotment & Batches
            </button>
          </div>
        )}

        {demoMode.enabled && <div className="demo-note"><span className="demo-tag">Demo</span> Sample war standings, not real battle results.</div>}
        {error && <div className="inline-error" role="alert"><Icon name="alert" size={14} /> {error}</div>}

        {activeTab === 'rankings' ? (
          <>
            {/* Batch Filter Pills */}
            <div className="batch-filter-bar">
              <span className="batch-filter-label">Filter Batch:</span>
              <button
                className={`btn btn-sm ${selectedBatchId === undefined ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleSelectBatch(undefined)}
              >
                All Clans
              </button>
              {batches.map((b) => {
                const isSelected = selectedBatchId === b.id;
                const statusDot = b.status === 'ACTIVE' ? '🟢' : b.status === 'COMPLETED' ? '🏁' : '⏳';
                return (
                  <button
                    key={b.id}
                    className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleSelectBatch(b.id)}
                  >
                    {statusDot} {b.name}
                  </button>
                );
              })}
            </div>

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
          </>
        ) : (
          <>
            {/* Batches Overview Cards */}
            <div className="batch-cards-grid">
              {batches.map((b) => {
                const isActive = b.status === 'ACTIVE';
                const isNotStarted = b.status === 'NOT_STARTED';
                const statusColor = isActive ? 'var(--ac)' : isNotStarted ? 'var(--wa)' : 'var(--text-3)';
                const formatRemaining = (sec: number | null) => {
                  if (sec == null) return '—';
                  const m = Math.floor(sec / 60);
                  const s = sec % 60;
                  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                };

                return (
                  <div key={b.id} className="batch-card">
                    <div className="batch-card-header">
                      <span className="batch-card-title">{b.name}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '12px',
                          border: `1px solid ${statusColor}`,
                          color: statusColor,
                          background: 'rgba(0,0,0,0.3)',
                        }}
                      >
                        {b.status}
                      </span>
                    </div>

                    <div className="batch-card-meta">
                      <div>Duration: <strong>{b.duration_minutes} minutes</strong></div>
                      <div>
                        Timer Remaining:{' '}
                        <strong className="mono">{isActive ? formatRemaining(b.remaining_seconds) : isNotStarted ? 'Not Started' : 'Expired'}</strong>
                      </div>
                    </div>

                    {isNotStarted && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleStartTimer(b.id, b.name)}
                        disabled={actionLoading}
                        style={{ marginTop: 6 }}
                      >
                        <Icon name="play" size={14} /> Start Batch Timer
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Auto Allotment Controls */}
            <div className="allotment-controls">
              <div className="allotment-header">
                <h3>Automated Clan Distribution (Batches Allotment)</h3>
                <p>Evenly distribute registered clans across all arena batches or set clan density per batch.</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-2)' }}>
                  Clans per Batch:
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  className="input"
                  style={{ width: 75, height: 32 }}
                  value={teamsPerBatchInput}
                  onChange={(e) => setTeamsPerBatchInput(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={actionLoading}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleAutoAllot(teamsPerBatchInput)}
                  disabled={actionLoading}
                >
                  <Icon name="check" size={14} /> Allot ({teamsPerBatchInput}/Batch)
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleAutoAllot()}
                  disabled={actionLoading}
                >
                  Distribute Evenly
                </button>
              </div>
            </div>

            {/* Registered Clans Roster & Individual Assignment */}
            <div className="panel panel-scroll">
              <div style={{ padding: '16px 20px 10px', borderBottom: '1px solid var(--line)' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--gold-bright)' }}>
                  Clan War Roster & Batch Assignments
                </h3>
              </div>
              <table className="table board-table">
                <thead>
                  <tr>
                    <th>Clan Name</th>
                    <th>Login User</th>
                    <th>Leader Info</th>
                    <th className="align-right">Score</th>
                    <th style={{ width: 180 }}>Assigned Batch</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name}</strong>
                      </td>
                      <td>
                        <span className="mono" style={{ color: 'var(--gold)' }}>{t.username}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: '13px' }}>
                          {t.leader_name} <span style={{ color: 'var(--text-3)' }}>({t.leader_email})</span>
                        </span>
                      </td>
                      <td className="align-right">
                        <span className="score mono">{t.total_score}</span>
                      </td>
                      <td>
                        <select
                          className="select"
                          style={{ height: 30, fontSize: '12px' }}
                          value={t.batch_id ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleAssignBatch(t.id, val ? parseInt(val) : null);
                          }}
                          disabled={actionLoading}
                        >
                          <option value="">-- Unassigned --</option>
                          {batches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({b.status})
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {teams.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '30px' }}>
                        No teams registered yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
