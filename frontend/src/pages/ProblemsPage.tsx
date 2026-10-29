import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useArena } from '../lib/arena';
import Balloon from '../components/Balloon';
import Difficulty from '../components/Difficulty';
import Icon from '../components/Icon';

/**
 * Creative animated battlefield background for the Quests page.
 * Uses high-res battlefield backdrop with dark fantasy grading,
 * drifting war mist, and rising golden embers — matching the War Rankings aesthetic.
 */
function QuestsBackground() {
  return (
    <div className="quests-bg" aria-hidden="true">
      <div className="quests-bg-overlay" />
      <div className="quests-ambient-glow" />
      <div className="quests-fog" />
      <div className="quests-mist" />

      {/* Floating golden/elixir war embers */}
      <div className="quests-embers">
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={`q-ember-${i}`}
            className="quests-ember"
            style={{
              left: `${2 + (i * 5.1) % 96}%`,
              animationDelay: `${(i * 0.4) % 4.5}s`,
              animationDuration: `${3.5 + (i % 3.5)}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ProblemsPage() {
  const { user } = useAuth();
  // An admin's submission list spans every team, so solved state is only shown to contestants.
  const isContestant = user?.role !== 'admin';
  const { problems, status, loading, error } = useArena(isContestant);
  const navigate = useNavigate();
  const solvedCount = problems.filter((p) => status[p.slug]?.solved).length;

  return (
    <div className="page page-quests">
      {/* Creative animated battlefield background */}
      <QuestsBackground />

      {/* Static Barbarian King stationed firmly at bottom-left in big size */}
      <div className="quests-king" aria-hidden="true">
        <img
          src="/barbarian-king-transparent.png"
          alt="Barbarian King"
          className="quests-king-img"
        />
      </div>

      <div className="page-inner" style={{ position: 'relative', zIndex: 2 }}>
        <div className="page-head">
          <div>
            <h1 className="page-title">⚔️ Battle Quests</h1>
            <p className="page-sub">
              {loading ? 'Summoning challenges from the war council…'
                : isContestant ? `${solvedCount} of ${problems.length} quests conquered`
                : `${problems.length} challenges in this war`}
            </p>
          </div>
        </div>

        <div className="rules">
          <span><Icon name="play" size={14} /> Points are awarded only upon submission to the war council</span>
        </div>

        {error ? (
          <div className="panel">
            <div className="state state-error">
              <Icon name="alert" size={22} className="state-icon" />
              <p className="state-title">The war council is unreachable!</p>
              <p>The arena server isn't responding. Verify the fortress backend is running, then reload.</p>
              <button className="btn" onClick={() => window.location.reload()}><Icon name="refresh" size={14} /> Reload</button>
            </div>
          </div>
        ) : (
          <div className="panel panel-scroll">
            <table className="table problem-table">
              <thead>
                <tr>
                  <th>Quest</th>
                  <th>Difficulty</th>
                  <th className="col-secondary">Limits</th>
                  {isContestant && <th className="align-right">Status</th>}
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 5 }, (_, i) => (
                  <tr key={`sk-${i}`} aria-hidden="true">
                    <td><span className="skeleton" style={{ width: 180 }} /></td>
                    <td><span className="skeleton" style={{ width: 70 }} /></td>
                    <td className="col-secondary"><span className="skeleton" style={{ width: 90 }} /></td>
                    {isContestant && <td />}
                  </tr>
                ))}
                {problems.map((p) => {
                  const st = status[p.slug];
                  return (
                    <tr key={p.id} className="is-link" onClick={() => navigate(`/problems/${p.slug}`)}>
                      <td>
                        <div className="problem-cell">
                          <Balloon letter={p.letter} color={p.balloon} solved={st?.solved} />
                          <Link to={`/problems/${p.slug}`} className="problem-title" onClick={(e) => e.stopPropagation()}>
                            {p.title}
                          </Link>
                        </div>
                      </td>
                      <td><Difficulty value={p.difficulty} /></td>
                      <td className="col-secondary">
                        <span className="meta"><span className="mono">{p.time_limit_sec}s</span> · <span className="mono">{Math.round(p.memory_limit_kb / 1024)} MB</span></span>
                      </td>
                      {isContestant && (
                        <td className="align-right">
                          {st?.solved ? <span className="status-solved"><Icon name="check" size={14} /> Conquered · <span className="mono">{st.bestScore}</span></span>
                            : st?.bestScore ? <span className="status-partial">{st.bestScore} pts</span>
                            : st?.attempted ? <span className="status-none">Attempted</span>
                            : <span className="status-none">—</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {!loading && problems.length === 0 && (
                  <tr><td colSpan={4}><div className="state"><p className="state-title">No quests available</p><p>The war council hasn't published any challenges yet.</p></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
