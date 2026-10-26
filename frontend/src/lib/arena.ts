/**
 * Problem lettering + ICPC-style balloon colours, and the hook that joins the
 * problem list with the signed-in team's own submissions to derive solved state.
 * Presentation only: every fact comes from the existing API calls.
 */
import { useCallback, useEffect, useState } from 'react';
import { getProblems, getMySubmissions } from '../api';
import type { Problem, Submission } from '../api';

// One colour per problem, kept clear of the verdict greens/reds and the lime accent.
const BALLOONS = ['#5AB0FF', '#B18CFF', '#FF8A4C', '#FF7AC6', '#C9D1DC', '#4FD1C5', '#F2D15C', '#8FA3FF'];

export const letterFor = (index: number) =>
  index < 26 ? String.fromCharCode(65 + index) : `P${index + 1}`;
export const balloonFor = (index: number) => BALLOONS[index % BALLOONS.length];

export interface ProblemStatus {
  solved: boolean;
  attempted: boolean;
  bestScore: number;
}

export interface ArenaProblem extends Problem {
  letter: string;
  balloon: string;
}

/** Problems with letters/balloons plus per-slug status for the current team. */
export function useArena(trackStatus: boolean) {
  const [problems, setProblems] = useState<ArenaProblem[]>([]);
  const [status, setStatus] = useState<Record<string, ProblemStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadStatus = useCallback(() => {
    if (!trackStatus) return;
    getMySubmissions()
      .then((r) => setStatus(summarize(r.data)))
      .catch(() => { /* status is an enhancement; the list still works without it */ });
  }, [trackStatus]);

  useEffect(() => {
    getProblems()
      .then((r) => setProblems(r.data.map((p, i) => ({ ...p, letter: letterFor(i), balloon: balloonFor(i) }))))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    loadStatus();
    window.addEventListener('submission:created', loadStatus);
    return () => window.removeEventListener('submission:created', loadStatus);
  }, [loadStatus]);

  return { problems, status, loading, error };
}

function summarize(subs: Submission[]): Record<string, ProblemStatus> {
  const out: Record<string, ProblemStatus> = {};
  for (const s of subs) {
    const cur = out[s.problem_slug] ?? { solved: false, attempted: false, bestScore: 0 };
    cur.attempted = true;
    if (s.verdict === 'AC') cur.solved = true;
    cur.bestScore = Math.max(cur.bestScore, s.score ?? 0);
    out[s.problem_slug] = cur;
  }
  return out;
}
