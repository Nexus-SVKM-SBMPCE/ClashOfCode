import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProblems } from '../api';
import type { Problem } from '../api';

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: 'badge-easy',
  medium: 'badge-medium',
  hard: 'badge-hard',
};

export default function ProblemsPage() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProblems()
      .then((r) => setProblems(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading problems…</div>;

  return (
    <div className="page problems-page">
      <div className="page-header">
        <h2>Problems</h2>
        <span className="problem-count">{problems.length} problems</span>
      </div>
      <div className="problems-table-wrap">
        <table className="problems-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Title</th>
              <th>Difficulty</th>
              <th>Time Limit</th>
              <th>Memory Limit</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((p, i) => (
              <tr key={p.id} className="problem-row">
                <td className="prob-num">{i + 1}</td>
                <td>
                  <Link to={`/problems/${p.slug}`} className="problem-link">
                    {p.title}
                  </Link>
                </td>
                <td>
                  <span className={`badge ${DIFFICULTY_COLOR[p.difficulty]}`}>
                    {p.difficulty}
                  </span>
                </td>
                <td className="meta-cell">{p.time_limit_sec}s</td>
                <td className="meta-cell">{Math.round(p.memory_limit_kb / 1024)} MB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
