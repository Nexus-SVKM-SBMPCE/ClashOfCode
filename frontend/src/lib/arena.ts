/**
 * Problem lettering + ICPC-style balloon colours, and the hook that joins the
 * problem list with the signed-in team's own submissions to derive solved state.
 * Presentation only: every fact comes from the existing API calls.
 */
import { useCallback, useEffect, useState } from 'react';
import { getProblems, getMySubmissions } from '../api';
import type { Problem, Submission } from '../api';

// CoC-themed colours: gold, elixir, war red, gem blue, emerald, dark elixir, fire orange, royal purple.
const BALLOONS = ['#ffd700', '#d946ef', '#ff4d5a', '#5AB0FF', '#4ade80', '#a855f7', '#ff6b35', '#c084fc'];

export const letterFor = (index: number) =>
  index < 26 ? String.fromCharCode(65 + index) : `P${index + 1}`;
export const balloonFor = (index: number) => BALLOONS[index % BALLOONS.length];

export interface ProblemStatus {
  solved: boolean;
  attempted: boolean;
  /** The team's one official submission is spent (mirrors the backend rule: judge errors don't count). */
  submitted: boolean;
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

  // Single-submission rule: a submitted quest disappears from the team's list. The backend already
  // omits it on reload; filtering here too makes it vanish immediately after submitting (and in demo mode).
  // Letters/balloons were assigned on the full list above, so they never reshuffle mid-session.
  const visible = trackStatus ? problems.filter((p) => !status[p.slug]?.submitted) : problems;
  const submittedCount = trackStatus ? Object.values(status).filter((s) => s.submitted).length : 0;

  return { problems: visible, allProblems: problems, status, submittedCount, loading, error };
}

function summarize(subs: Submission[]): Record<string, ProblemStatus> {
  const out: Record<string, ProblemStatus> = {};
  for (const s of subs) {
    const cur = out[s.problem_slug] ?? { solved: false, attempted: false, submitted: false, bestScore: 0 };
    cur.attempted = true;
    if (s.verdict !== 'IE') cur.submitted = true; // IE = judge error, the attempt is not spent
    if (s.verdict === 'AC') cur.solved = true;
    cur.bestScore = Math.max(cur.bestScore, s.score ?? 0);
    out[s.problem_slug] = cur;
  }
  return out;
}
