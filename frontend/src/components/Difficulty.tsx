const LEVEL = { easy: 1, medium: 2, hard: 3 } as const;

/** Difficulty as three pips + label: readable without adding another colour family. */
export default function Difficulty({ value }: { value: 'easy' | 'medium' | 'hard' }) {
  const n = LEVEL[value] ?? 1;
  return (
    <span className={`difficulty difficulty-${value}`}>
      <span className="pips" aria-hidden="true">
        {[1, 2, 3].map((i) => <span key={i} className={i <= n ? 'pip on' : 'pip'} />)}
      </span>
      <span className="difficulty-label">{value}</span>
    </span>
  );
}
