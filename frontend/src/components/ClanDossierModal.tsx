import { useEffect, useState } from 'react';
import { getTeamDossier, type TeamDossier } from '../api';
import Icon from './Icon';

interface ClanDossierModalProps {
  teamId: number | null;
  clanName: string;
  onClose: () => void;
}

export default function ClanDossierModal({ teamId, clanName, onClose }: ClanDossierModalProps) {
  const [dossier, setDossier] = useState<TeamDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    setError(null);
    getTeamDossier(teamId)
      .then((res) => {
        setDossier(res.data);
      })
      .catch((err) => {
        setError(err.response?.data?.detail || 'Failed to load clan dossier.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [teamId]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!teamId) return null;

  const team = dossier?.team;
  const security = dossier?.security;
  const problems = dossier?.problems || [];

  const integrityColor =
    security?.integrity_status === 'FLAGGED'
      ? 'var(--err, #ef4444)'
      : security?.integrity_status === 'CAUTION'
      ? 'var(--wa, #f59e0b)'
      : 'var(--ac, #10b981)';

  // Parse members info if valid JSON
  let membersList: string[] = [];
  if (team?.members_info) {
    try {
      const parsed = JSON.parse(team.members_info);
      if (Array.isArray(parsed)) {
        membersList = parsed.map((m: any) => (typeof m === 'string' ? m : m.name || m.username || JSON.stringify(m)));
      } else if (typeof parsed === 'object') {
        membersList = Object.values(parsed).map(String);
      }
    } catch {
      membersList = [team.members_info];
    }
  }

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(5, 7, 15, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="modal-card panel"
        style={{
          width: '100%',
          maxWidth: '860px',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: '#0f172a',
          border: '2px solid var(--gold, #d97706)',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(217, 119, 6, 0.2)',
          padding: '24px',
          color: 'var(--text-1, #f8fafc)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--line, rgba(255,255,255,0.1))', paddingBottom: '16px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>🛡️</span>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gold-bright, #fcd34d)', margin: 0 }}>
                {team?.name || clanName}
              </h2>
              {team?.username && (
                <span className="mono" style={{ fontSize: '13px', color: 'var(--text-3, #94a3b8)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px' }}>
                  @{team.username}
                </span>
              )}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-2, #cbd5e1)' }}>
              Personalized Clan Dossier · Algorithmic Complexity, Quest Completions & Surveillance
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '18px', padding: '4px 10px', borderRadius: '8px', color: 'var(--text-3, #94a3b8)' }}
            title="Close Dossier (Esc)"
          >
            ✕
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3, display: 'inline-block', marginBottom: 12 }} />
            <div style={{ color: 'var(--gold, #d97706)', fontWeight: 600 }}>Gathering Clan Battle Intelligence…</div>
          </div>
        )}

        {error && (
          <div className="inline-error" style={{ margin: '20px 0', padding: '14px', borderRadius: '8px' }}>
            <Icon name="alert" size={16} /> {error}
          </div>
        )}

        {!loading && !error && dossier && (
          <>
            {/* KPI Cards Ribbon */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                marginBottom: '20px',
              }}
            >
              <div className="panel" style={{ padding: '12px 16px', borderLeft: '4px solid var(--gold, #d97706)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3, #94a3b8)', textTransform: 'uppercase' }}>
                  🏆 Battle Score
                </span>
                <div className="mono" style={{ fontSize: '22px', fontWeight: 800, color: 'var(--gold-bright, #fcd34d)', marginTop: '4px' }}>
                  {team?.total_score} <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-2, #cbd5e1)' }}>pts</span>
                </div>
              </div>

              <div className="panel" style={{ padding: '12px 16px', borderLeft: '4px solid var(--ac, #10b981)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3, #94a3b8)', textTransform: 'uppercase' }}>
                  ⚔️ Quests Conquered
                </span>
                <div className="mono" style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ac, #10b981)', marginTop: '4px' }}>
                  {dossier.solved_count} <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-2, #cbd5e1)' }}>/ {dossier.submissions_count} attacks</span>
                </div>
              </div>

              <div className="panel" style={{ padding: '12px 16px', borderLeft: '4px solid var(--primary, #3b82f6)' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3, #94a3b8)', textTransform: 'uppercase' }}>
                  🛡️ Batch Allotment
                </span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#93c5fd', marginTop: '6px' }}>
                  {team?.batch_name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-3, #94a3b8)' }}>
                  Round: {team?.batch_status}
                </div>
              </div>

              <div className="panel" style={{ padding: '12px 16px', borderLeft: `4px solid ${integrityColor}` }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-3, #94a3b8)', textTransform: 'uppercase' }}>
                  👁️ Proctor Status
                </span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: integrityColor, marginTop: '6px' }}>
                  {security?.integrity_status}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-3, #94a3b8)' }}>
                  {security?.tab_switch_count} tab · {security?.fullscreen_exit_count} fs exits
                </div>
              </div>
            </div>

            {/* Clan Contact & Metadata */}
            <div
              className="panel"
              style={{
                padding: '14px 18px',
                marginBottom: '20px',
                fontSize: '13px',
                background: 'rgba(255, 255, 255, 0.02)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
              }}
            >
              <div>
                <strong style={{ color: 'var(--gold, #d97706)' }}>Leader: </strong>
                <span>{team?.leader_name || '—'}</span>
                {team?.leader_email && (
                  <div className="mono" style={{ fontSize: '12px', color: 'var(--text-3, #94a3b8)' }}>
                    {team.leader_email}
                  </div>
                )}
              </div>

              <div>
                <strong style={{ color: 'var(--gold, #d97706)' }}>Clan Members: </strong>
                {membersList.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                    {membersList.map((m, idx) => (
                      <span
                        key={idx}
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                        }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-3, #94a3b8)' }}>None specified</span>
                )}
              </div>

              <div>
                <strong style={{ color: 'var(--gold, #d97706)' }}>Session Security: </strong>
                <span
                  style={{
                    color: security?.lock_status === 'LOCKED' ? 'var(--err, #ef4444)' : 'var(--ac, #10b981)',
                    fontWeight: 700,
                  }}
                >
                  {security?.lock_status === 'LOCKED' ? '🔒 LOCKED (3-Strike Rule)' : '🟢 ACTIVE (Permitted)'}
                </span>
                {team?.last_active_at && (
                  <div className="mono" style={{ fontSize: '11px', color: 'var(--text-3, #94a3b8)' }}>
                    Active: {new Date(team.last_active_at).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>

            {/* Algorithmic Time Complexity Evaluation & Solved Quests */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--gold-bright, #fcd34d)', margin: 0 }}>
                  ⚡ Real-Time Algorithmic Complexity Evaluation & Solved Quests
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-3, #94a3b8)' }}>
                  Evaluated via mathematical AST & loop analytics
                </span>
              </div>

              <div className="panel panel-scroll" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line, rgba(255,255,255,0.1))' }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px' }}>Quest</th>
                      <th style={{ textAlign: 'center', padding: '10px' }}>Verdict</th>
                      <th style={{ textAlign: 'center', padding: '10px' }}>Achieved Complexity</th>
                      <th style={{ textAlign: 'center', padding: '10px' }}>Expected Optimal</th>
                      <th style={{ textAlign: 'center', padding: '10px' }}>Rating</th>
                      <th style={{ textAlign: 'right', padding: '10px' }}>Score</th>
                      <th style={{ textAlign: 'right', padding: '10px' }}>Solve Time</th>
                      <th style={{ textAlign: 'right', padding: '10px 14px' }}>Runtime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problems.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-3, #94a3b8)' }}>
                          No quest attempts or submissions recorded yet for this clan.
                        </td>
                      </tr>
                    ) : (
                      problems.map((p) => {
                        const isAC = p.verdict === 'AC';
                        const verdictColor = isAC ? 'var(--ac, #10b981)' : 'var(--wa, #f59e0b)';
                        const complexityVerdict = p.time_complexity_verdict?.toUpperCase() || 'UNKNOWN';

                        const compBadgeBg =
                          complexityVerdict === 'OPTIMAL'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : complexityVerdict === 'ACCEPTABLE'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : complexityVerdict === 'SUBOPTIMAL'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(255, 255, 255, 0.05)';

                        const compBadgeColor =
                          complexityVerdict === 'OPTIMAL'
                            ? 'var(--ac, #10b981)'
                            : complexityVerdict === 'ACCEPTABLE'
                            ? 'var(--wa, #f59e0b)'
                            : complexityVerdict === 'SUBOPTIMAL'
                            ? 'var(--err, #ef4444)'
                            : 'var(--text-3, #94a3b8)';

                        return (
                          <tr key={p.problem_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ fontWeight: 600 }}>{p.problem_title}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-3, #94a3b8)' }}>
                                <span style={{ textTransform: 'capitalize', color: p.difficulty === 'hard' ? 'var(--err)' : p.difficulty === 'medium' ? 'var(--wa)' : 'var(--ac)' }}>
                                  {p.difficulty}
                                </span>
                                {' · '}
                                <span className="mono">{p.language}</span>
                              </div>
                            </td>

                            <td style={{ textAlign: 'center', padding: '10px' }}>
                              <span
                                className="mono"
                                style={{
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  border: `1px solid ${verdictColor}`,
                                  color: verdictColor,
                                  background: 'rgba(0,0,0,0.3)',
                                }}
                              >
                                {p.verdict}
                              </span>
                            </td>

                            <td style={{ textAlign: 'center', padding: '10px' }}>
                              <span
                                className="mono"
                                style={{
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  background: 'rgba(245, 158, 11, 0.1)',
                                  border: '1px solid rgba(245, 158, 11, 0.3)',
                                  color: 'var(--gold-bright, #fcd34d)',
                                }}
                              >
                                {p.time_complexity || '—'}
                              </span>
                            </td>

                            <td style={{ textAlign: 'center', padding: '10px' }}>
                              <span className="mono" style={{ fontSize: '12px', color: 'var(--text-2, #cbd5e1)' }}>
                                {p.best_expected_complexity || 'O(N)'}
                              </span>
                            </td>

                            <td style={{ textAlign: 'center', padding: '10px' }}>
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  letterSpacing: '0.5px',
                                  padding: '3px 8px',
                                  borderRadius: '8px',
                                  background: compBadgeBg,
                                  color: compBadgeColor,
                                  border: `1px solid ${compBadgeColor}`,
                                }}
                              >
                                {complexityVerdict === 'OPTIMAL' ? '✨ OPTIMAL' : complexityVerdict}
                              </span>
                            </td>

                            <td className="mono" style={{ textAlign: 'right', padding: '10px' }}>
                              <strong>{p.score}</strong>
                              <div style={{ fontSize: '10px', color: 'var(--text-3, #94a3b8)' }}>
                                {p.tests_passed}/{p.tests_total} tests
                              </div>
                            </td>

                            <td className="mono" style={{ textAlign: 'right', padding: '10px', color: 'var(--text-2, #cbd5e1)' }}>
                              {p.solve_time_seconds != null ? `${p.solve_time_seconds}s` : '—'}
                            </td>

                            <td className="mono" style={{ textAlign: 'right', padding: '10px 14px', color: 'var(--text-3, #94a3b8)' }}>
                              {p.runtime_ms != null ? `${p.runtime_ms.toFixed(1)}ms` : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Close Button Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ padding: '6px 20px' }}>
                Close Dossier
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
